import { generateEngineBriefAi, hasAiKey } from './ai-service.ts';
import { getNewsEvents } from './signals-engine.ts';
import { colGet, colPut, runStoreTransaction } from './store.ts';

// =====================================================================
// TRADERSPRO Market Engine (the "AI Analyser")
// Runs on cron OR lazy-tick (every ~55s via Firestore lease lock)
//  - reads live prices from Deriv (forex, gold, synthetic indices, digits)
//  - reads the news calendar and an hourly AI brief of the headlines
//  - writes signals (market, entry, stop, target, reason) and checks them later to count real wins and losses
// Nothing here guarantees a profit. The win rate shown to clients is MEASURED from the engine's own past signals.
// =====================================================================

export const ENG_FX: Array<[string, string, string[]]> = [
  ['frxXAUUSD', 'Gold (XAU/USD)', ['GOLD', 'USD']],
  ['frxEURUSD', 'EUR/USD', ['EUR', 'USD']],
  ['frxGBPUSD', 'GBP/USD', ['GBP', 'USD']],
  ['frxUSDJPY', 'USD/JPY', ['USD', 'JPY']],
  ['frxAUDUSD', 'AUD/USD', ['AUD', 'USD']],
  ['frxUSDCAD', 'USD/CAD', ['USD', 'CAD']],
  ['frxUSDCHF', 'USD/CHF', ['USD', 'CHF']],
  ['frxNZDUSD', 'NZD/USD', ['NZD', 'USD']],
  ['frxEURGBP', 'EUR/GBP', ['EUR', 'GBP']],
  ['frxEURJPY', 'EUR/JPY', ['EUR', 'JPY']],
  ['frxGBPJPY', 'GBP/JPY', ['GBP', 'JPY']],
];

export const ENG_SYNTH: Array<[string, string]> = [
  ['R_10', 'Volatility 10'],
  ['R_25', 'Volatility 25'],
  ['R_50', 'Volatility 50'],
  ['R_75', 'Volatility 75'],
  ['R_100', 'Volatility 100'],
  ['1HZ10V', 'Volatility 10 (1s)'],
  ['1HZ25V', 'Volatility 25 (1s)'],
  ['1HZ50V', 'Volatility 50 (1s)'],
  ['1HZ75V', 'Volatility 75 (1s)'],
  ['1HZ100V', 'Volatility 100 (1s)'],
  ['BOOM500', 'Boom 500'],
  ['BOOM1000', 'Boom 1000'],
  ['CRASH500', 'Crash 500'],
  ['CRASH1000', 'Crash 1000'],
];

export const ENG_DIGITS = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'];
export const ENG_NAME: Record<string, string> = Object.fromEntries([...ENG_FX.map((x) => [x[0], x[1]]), ...ENG_SYNTH]);
export const ENG_MAX_SIGS = 150;

export interface EngCandle {
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// ---------- indicators ----------
export function engEma(a: number[], n: number) {
  const k = 2 / (n + 1);
  let e = a[0];
  const o = [e];
  for (let i = 1; i < a.length; i++) {
    e = a[i] * k + e * (1 - k);
    o.push(e);
  }
  return o;
}

export function engAtr(c: EngCandle[], n = 14) {
  const tr = c.map((x, i) =>
    i === 0
      ? x.high - x.low
      : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close))
  );
  const o: number[] = [];
  let a = tr.slice(0, n).reduce((s, v) => s + v, 0) / n;
  for (let i = 0; i < tr.length; i++) {
    if (i >= n) a = (a * (n - 1) + tr[i]) / n;
    o.push(a);
  }
  return o;
}

export function engRsi(cl: number[], n = 14) {
  const o = Array(cl.length).fill(50);
  let g = 0;
  let l = 0;
  for (let i = 1; i < cl.length; i++) {
    const d = cl[i] - cl[i - 1];
    const up = Math.max(d, 0);
    const dn = Math.max(-d, 0);
    if (i <= n) {
      g += up / n;
      l += dn / n;
    } else {
      g = (g * (n - 1) + up) / n;
      l = (l * (n - 1) + dn) / n;
    }
    if (i >= n) o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return o;
}

// ---------- price signal on M5 candles (forex, gold, synthetic indices) ----------
export function engAnalyze(c: EngCandle[], ctx: { bias?: number } = {}) {
  if (!Array.isArray(c) || c.length < 60) return null;
  const last = c.length - 1;
  const i = last - 1;
  const cl = c.map((x) => x.close);
  const e20 = engEma(cl, 20);
  const e50 = engEma(cl, 50);
  const r = engRsi(cl, 14);
  const A = engAtr(c, 14);
  const a = A[i];
  if (!(a > 0)) return null;
  const k = c[i];
  const range = k.high - k.low || a;
  const price = c[last].close;
  const trendUp = e20[i] > e50[i] && cl[i] > e50[i];
  const trendDn = e20[i] < e50[i] && cl[i] < e50[i];
  const gap = Math.abs(e20[i] - e50[i]) / a;
  let dir = 0;
  let setup = '';
  let score = 0;
  let why = '';
  const lowWick = Math.min(k.open, k.close) - k.low;
  const upWick = k.high - Math.max(k.open, k.close);
  if (trendUp && gap >= 0.3 && k.low <= e20[i] + 0.15 * a && k.close > e20[i] && k.close > k.open && r[i] >= 40 && r[i] <= 62) {
    dir = 1;
    setup = 'pullback';
    score = 2;
    why = 'uptrend (EMA20 above EMA50), price pulled back to the EMA20 and a buying candle closed';
  } else if (trendDn && gap >= 0.3 && k.high >= e20[i] - 0.15 * a && k.close < e20[i] && k.close < k.open && r[i] >= 38 && r[i] <= 60) {
    dir = -1;
    setup = 'pullback';
    score = 2;
    why = 'downtrend (EMA20 below EMA50), price pulled back to the EMA20 and a selling candle closed';
  } else if (r[i] <= 28 && k.close > k.open && lowWick >= 0.4 * range && cl[i] < e50[i] - 1.2 * a) {
    dir = 1;
    setup = 'reversal';
    score = 1;
    why = 'oversold (RSI ' + r[i].toFixed(0) + ') far below the average and a candle rejected the low';
  } else if (r[i] >= 72 && k.close < k.open && upWick >= 0.4 * range && cl[i] > e50[i] + 1.2 * a) {
    dir = -1;
    setup = 'reversal';
    score = 1;
    why = 'overbought (RSI ' + r[i].toFixed(0) + ') far above the average and a candle rejected the high';
  }
  if (!dir) return null;
  if (setup === 'pullback') {
    if (gap >= 0.8) score++;
    if ((dir > 0 && r[i] >= 45 && r[i] <= 58) || (dir < 0 && r[i] >= 42 && r[i] <= 55)) score++;
  }
  if (setup === 'reversal' && ((dir > 0 && r[i] <= 22) || (dir < 0 && r[i] >= 78))) score++;
  const b = Number(ctx.bias) || 0;
  if (Math.abs(b) >= 0.3) {
    if (Math.sign(b) === dir) {
      score++;
      why += '; the news brief leans the same way';
    } else {
      score -= 2;
      why += '; the news brief leans AGAINST this';
    }
  }
  const mk = (m: number) => Number((price + dir * m * a).toFixed(5));
  return {
    dir: dir > 0 ? ('BUY' as const) : ('SELL' as const),
    setup,
    score,
    reason: why,
    entry: price,
    sl: mk(-1.6),
    tp: mk(2.6),
    sl1: mk(-1.0),
    tp1: mk(1.3),
    atr: Number(a.toFixed(5)),
    rsi: Math.round(r[i]),
  };
}

// ---------- digit triggers (pattern triggers: the next digit is random, nothing here predicts it) ----------
export function engDigits(prices: number[], pip: number) {
  const d = prices.map((p) => Number(Number(p).toFixed(pip)).toFixed(pip).slice(-1)).map(Number);
  if (d.length < 60) return null;
  const win = d.slice(-100);
  const n = win.length;
  const cnt = Array(10).fill(0);
  for (const x of win) cnt[x]++;
  const lastN = (k: number) => d.slice(-k);
  const allLt = (a: number[], v: number) => a.every((x) => x < v);
  const allGe = (a: number[], v: number) => a.every((x) => x >= v);
  if (allLt(lastN(5), 5))
    return { kind: 'over-under', contract: 'DIGITOVER', barrier: 4, score: 2, reason: '5 digits in a row below 5 (pattern trigger, not a prediction)' };
  if (allGe(lastN(5), 5))
    return { kind: 'over-under', contract: 'DIGITUNDER', barrier: 5, score: 2, reason: '5 digits in a row of 5 or more (pattern trigger, not a prediction)' };
  const par = lastN(4).map((x) => x % 2);
  if (par.every((x) => x === par[0]))
    return {
      kind: 'even-odd',
      contract: par[0] ? 'DIGITEVEN' : 'DIGITODD',
      barrier: null,
      score: 2,
      reason: '4 ' + (par[0] ? 'odd' : 'even') + ' digits in a row (pattern trigger, not a prediction)',
    };
  let lo = 0;
  let hi = 0;
  for (let x = 1; x < 10; x++) {
    if (cnt[x] < cnt[lo]) lo = x;
    if (cnt[x] > cnt[hi]) hi = x;
  }
  if (n >= 100 && cnt[hi] / n >= 0.16)
    return {
      kind: 'matches',
      contract: 'DIGITMATCH',
      barrier: hi,
      score: 1,
      reason: 'digit ' + hi + ' came ' + cnt[hi] + ' times in the last ' + n + ' ticks (pattern trigger, not a prediction)',
    };
  if (n >= 100 && cnt[lo] / n <= 0.05 && d[d.length - 1] !== lo)
    return {
      kind: 'differs',
      contract: 'DIGITDIFF',
      barrier: lo,
      score: 1,
      reason: 'digit ' + lo + ' came only ' + cnt[lo] + ' times in the last ' + n + ' ticks (pattern trigger, not a prediction)',
    };
  return null;
}

export const engDigitWin = (s: any, dg: number) =>
  s.contract === 'DIGITOVER'
    ? dg > s.barrier
    : s.contract === 'DIGITUNDER'
    ? dg < s.barrier
    : s.contract === 'DIGITEVEN'
    ? dg % 2 === 0
    : s.contract === 'DIGITODD'
    ? dg % 2 === 1
    : s.contract === 'DIGITDIFF'
    ? dg !== s.barrier
    : dg === s.barrier;

// ---------- checking an open price signal against the candles that came after it ----------
export function engResolve(s: any, candles: EngCandle[], now: number) {
  const after = candles.filter((x) => x.epoch * 1000 > s.t);
  const test = (sl: number, tp: number, maxAge: number) => {
    for (const x of after) {
      const hitSl = s.dir === 'BUY' ? x.low <= sl : x.high >= sl;
      const hitTp = s.dir === 'BUY' ? x.high >= tp : x.low <= tp;
      if (hitSl) return 'loss';
      if (hitTp) return 'win';
    }
    return now - s.t > maxAge ? 'expired' : 'open';
  };
  const out: { res?: string; res1?: string } = {};
  if (!s.res || s.res === 'open') out.res = test(s.sl, s.tp, 12 * 3600e3);
  if (!s.res1 || s.res1 === 'open') out.res1 = test(s.sl1, s.tp1, 90 * 60e3);
  return out;
}

// ---------- Deriv public data over one WebSocket ----------
export const ENG_WS = [
  'wss://api.derivws.com/trading/v1/options/ws/public',
  'wss://ws.derivws.com/websockets/v3?app_id=1089',
  'wss://ws.binaryws.com/websockets/v3?app_id=1089',
  'wss://frontend.binaryws.com/websockets/v3?app_id=1089',
];

export async function engDerivOnce(url: string, reqs: Record<string, unknown>[], ms: number): Promise<Map<number, any>> {
  if (typeof WebSocket === 'undefined') throw new Error('WebSocket not available');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const got = new Map<number, any>();
    let left = reqs.length;
    let done = false;
    const fin = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve(got);
    };
    const timer = setTimeout(fin, ms);
    ws.addEventListener('open', () => {
      reqs.forEach((r, i) => ws.send(JSON.stringify({ ...r, req_id: i + 1 })));
    });
    ws.addEventListener('message', (e) => {
      let m: any;
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.req_id) {
        got.set(m.req_id, m);
        if (--left <= 0) fin();
      }
    });
    ws.addEventListener('close', fin);
    ws.addEventListener('error', () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(new Error('WebSocket error'));
      }
    });
  });
}

export async function engDerivBatch(reqs: Record<string, unknown>[], ms = 9000): Promise<Map<number, any>> {
  const errs: string[] = [];
  for (let round = 0; round < 2; round++) {
    if (round) await new Promise((r) => setTimeout(r, 1200));
    for (const url of ENG_WS) {
      const host = new URL(url).host;
      try {
        const got = await engDerivOnce(url, reqs, ms);
        if (got.size) return got;
        if (!round) errs.push(host + ': connected but no answer');
      } catch (e) {
        if (!round) errs.push(host + ': ' + (e instanceof Error ? e.message : String(e)));
      }
    }
  }
  throw new Error(errs.join(' | ') + ' (2 rounds)');
}

const engCandleReq = (sym: string) => ({ ticks_history: sym, adjust_start_time: 1, count: 120, end: 'latest', granularity: 300, style: 'candles' });
const engTickReq = (sym: string) => ({ ticks_history: sym, count: 150, end: 'latest', style: 'ticks' });
const engCandles = (m: any): EngCandle[] =>
  ((m && m.candles) || []).map((x: any) => ({ epoch: x.epoch, open: +x.open, high: +x.high, low: +x.low, close: +x.close }));

// ---------- hourly AI brief of the headlines ----------
export async function engBrief(evs: any[], force = false) {
  const old = await colGet<any>('engine', 'brief');
  if (!force && old && Date.now() - old.t < 3600e3) return old;
  if (!hasAiKey()) return old || null;
  const heads: string[] = [];
  for (const u of [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://www.fxstreet.com/rss/news',
    'https://feeds.bbci.co.uk/news/business/rss.xml',
  ]) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 TRADERSPRO254' } });
      if (!r.ok) continue;
      const x = await r.text();
      for (const m of x.matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)) {
        heads.push(m[1].replace(/<[^>]+>/g, '').trim().slice(0, 140));
        if (heads.length >= 45) break;
      }
    } catch {}
  }
  if (!heads.length) return old || null;
  const soon = (evs || [])
    .filter((e) => e.ts > Date.now() && e.ts < Date.now() + 86400e3 && /high|medium/i.test(e.impact))
    .slice(0, 10)
    .map((e) => `${e.country} ${e.title}`);
  try {
    const brief = await generateEngineBriefAi(heads, soon);
    await colPut('engine', 'brief', brief);
    return brief;
  } catch {
    return old || null;
  }
}

export async function engCfg(): Promise<{ on: boolean; t?: number }> {
  const doc = await colGet<{ on?: boolean; t?: number }>('engine', 'cfg');
  return { on: true, ...(doc || {}) };
}

let memHb: any = null;
export async function engStatus() {
  const cfg = await engCfg();
  const dbHb = await colGet<any>('engine', 'hb');
  const hb = memHb && (!dbHb || memHb.t >= dbHb.t) ? memHb : dbHb;
  const fresh = !!(memHb && hb === memHb);
  const online = !!(cfg.on && hb && !hb.bad && Date.now() - hb.t < (fresh ? 180e3 : 900e3));
  return { on: cfg.on, online, hb, cfg };
}

export function engBlocked(evs: any[], ccys: string[], now: number) {
  return (evs || []).some(
    (e) =>
      /high/i.test(e.impact) &&
      (ccys.includes(e.country) || (ccys.includes('GOLD') && e.country === 'USD')) &&
      now > e.ts - 600e3 &&
      now < e.ts + 120e3
  );
}

export async function engHeartbeat(summary: any, brief: any, bad: boolean) {
  const hb = { t: Date.now(), scanned: summary.scanned, note: summary.note, bad: !!bad, brief: !!brief };
  memHb = hb;
  const old = await colGet<any>('engine', 'hb');
  if (!old || hb.t - old.t > 120e3 || !!old.bad !== !!bad) {
    await colPut('engine', 'hb', hb);
  }
}

export async function engineTick(opts: { forceBrief?: boolean } = {}) {
  const now = Date.now();
  const cfg = await engCfg();
  const summary = { t: now, on: cfg.on, scanned: 0, newSignals: 0, resolved: 0, note: '' };
  if (!cfg.on) {
    summary.note = 'switched off';
    return summary;
  }
  const evs = (await getNewsEvents().catch(() => null)) || [];
  const brief = await engBrief(evs, opts.forceBrief).catch(() => null);
  const doc = (await colGet<{ sigs: any[]; stats: Record<string, { w: number; l: number }> }>('engine', 'sigs')) || { sigs: [], stats: {} };

  const slot = Math.floor(now / 60000);
  const grp = <T>(list: T[], size: number) => {
    const g = Math.ceil(list.length / size);
    const k = slot % g;
    return list.slice(k * size, k * size + size);
  };
  const fx = [ENG_FX[0], ...grp(ENG_FX.slice(1), 3)];
  const synth = grp(ENG_SYNTH, 5);
  const open = doc.sigs.filter((s) => (s.mkt !== 'digits' ? s.res === 'open' || s.res1 === 'open' : s.res === 'open'));
  const candleSyms = new Set([...fx.map((x) => x[0]), ...synth.map((x) => x[0]), ...open.filter((s) => s.mkt !== 'digits').map((s) => s.sym)]);
  const tickSyms = new Set([...ENG_DIGITS, ...open.filter((s) => s.mkt === 'digits').map((s) => s.sym)]);

  const reqs: Record<string, unknown>[] = [];
  const idx: Array<['c' | 't', string]> = [];
  for (const s of candleSyms) {
    reqs.push(engCandleReq(s));
    idx.push(['c', s]);
  }
  for (const s of tickSyms) {
    reqs.push(engTickReq(s));
    idx.push(['t', s]);
  }

  let got: Map<number, any>;
  try {
    got = await engDerivBatch(reqs);
  } catch (e) {
    summary.note = 'no data from Deriv: ' + String(e instanceof Error ? e.message : e).slice(0, 160);
    const prev = await colGet<any>('engine', 'hb');
    if (prev && !prev.bad && now - prev.t < 300e3) {
      summary.note = 'retrying: ' + summary.note;
      return summary;
    }
    await engHeartbeat(summary, brief, true);
    return summary;
  }

  const candles: Record<string, EngCandle[]> = {};
  const ticks: Record<string, { prices: number[]; times: number[]; pip: number }> = {};
  idx.forEach(([k, s], i) => {
    const m = got.get(i + 1);
    if (!m || m.error) return;
    if (k === 'c') candles[s] = engCandles(m);
    else ticks[s] = { prices: (m.history && m.history.prices) || [], times: (m.history && m.history.times) || [], pip: m.pip_size };
  });

  summary.scanned = Object.keys(candles).length + Object.keys(ticks).length;
  if (!summary.scanned) {
    const bad = [...got.values()].find((m) => m && m.error);
    summary.note = 'Deriv sent no market data' + (bad ? ': ' + String(bad.error.message || bad.error.code).slice(0, 90) : '');
    await engHeartbeat(summary, brief, true);
    return summary;
  }

  let goldSig: any = null;
  let dirty = false;
  const st = (doc.stats = doc.stats || {});
  const bump = (key: string, res: string) => {
    const x = (st[key] = st[key] || { w: 0, l: 0 });
    if (res === 'win') x.w++;
    else if (res === 'loss') x.l++;
  };

  // 1) check open signals
  for (const s of doc.sigs) {
    if (s.mkt === 'digits') {
      if (s.res !== 'open') continue;
      const tk = ticks[s.sym];
      if (!tk) continue;
      const j = tk.times.findIndex((t) => t * 1000 > s.t + 500);
      if (j < 0) {
        if (now - s.t > 120e3) {
          s.res = 'expired';
          dirty = true;
        }
        continue;
      }
      const dg = Number(Number(tk.prices[j]).toFixed(tk.pip)).toFixed(tk.pip).slice(-1) as unknown as number * 1;
      s.res = engDigitWin(s, dg) ? 'win' : 'loss';
      s.digit = dg;
      bump('digits', s.res);
      dirty = true;
      summary.resolved++;
    } else {
      const cd = candles[s.sym];
      if (!cd) continue;
      const r = engResolve(s, cd, now);
      if (r.res && r.res !== s.res) {
        s.res = r.res;
        bump(s.mkt, r.res);
        dirty = true;
        if (r.res !== 'open') summary.resolved++;
      }
      if (r.res1 && r.res1 !== s.res1) {
        s.res1 = r.res1;
        bump(s.mkt + '_s', r.res1);
        dirty = true;
      }
    }
  }

  // 2) new signals
  const have = (sym: string, dir: string | null, within: number) =>
    doc.sigs.some((s) => s.sym === sym && (!dir || s.dir === dir) && now - s.t < within);
  const add = (s: Record<string, unknown>) => {
    doc.sigs.unshift({ id: now.toString(36) + '-' + s.sym, t: now, ...s });
    summary.newSignals++;
    dirty = true;
  };
  const pairBias = (c: string[]) => {
    const b = brief && brief.bias;
    if (!b) return 0;
    const [x, y] = c;
    const v = (k: string) => (k === 'GOLD' ? b.GOLD : b[k]) || 0;
    return x === 'GOLD' ? v('GOLD') : v(x) - v(y);
  };
  const price = (mkt: string, list: Array<[string, string, string[] | null]>) => {
    for (const [sym, name, ccy] of list) {
      const cd = candles[sym];
      if (!cd) continue;
      if (ccy && engBlocked(evs, ccy, now)) continue;
      if (have(sym, null, 30 * 60e3)) continue;
      const a = engAnalyze(cd, { bias: ccy ? pairBias(ccy) : 0 });
      if (!a || a.score < 3) continue;
      add({
        mkt,
        sym,
        name,
        dir: a.dir,
        entry: a.entry,
        sl: a.sl,
        tp: a.tp,
        sl1: a.sl1,
        tp1: a.tp1,
        setup: a.setup,
        score: a.score,
        reason: a.reason,
        res: 'open',
        res1: 'open',
      });
      if (sym === 'frxXAUUSD') goldSig = doc.sigs[0];
    }
  };
  price('forex', fx);
  price(
    'synth',
    synth.map((x) => [x[0], x[1], null])
  );
  for (const sym of ENG_DIGITS) {
    const tk = ticks[sym];
    if (!tk || !tk.prices.length) continue;
    const t = engDigits(tk.prices, tk.pip);
    if (!t) continue;
    if (doc.sigs.some((s) => s.sym === sym && s.kind === t.kind && now - s.t < 60e3)) continue;
    add({ mkt: 'digits', sym, name: ENG_NAME[sym] || sym, ...t, res: 'open' });
  }

  doc.sigs = doc.sigs.filter((s) => now - s.t < 3 * 86400e3 || s.res === 'open').slice(0, ENG_MAX_SIGS);
  if (dirty) await colPut('engine', 'sigs', doc);
  if (goldSig) {
    await colPut('engine', 'gold', {
      id: goldSig.id,
      t: goldSig.t,
      dir: goldSig.dir,
      entry: goldSig.entry,
      sl: goldSig.sl,
      tp: goldSig.tp,
      sl1: goldSig.sl1,
      tp1: goldSig.tp1,
      score: goldSig.score,
      reason: goldSig.reason,
    });
  }
  summary.note = 'ok';
  await engHeartbeat(summary, brief, false);
  return summary;
}

// Lazy tick with Firestore/DB lease lock (replaces 1-minute Cloudflare Cron Trigger on Vercel Hobby)
export async function lazyEngineTickIfStale(): Promise<boolean> {
  try {
    const cfg = await engCfg();
    if (!cfg.on) return false;
    const now = Date.now();
    const acquired = await runStoreTransaction(async (tx) => {
      const lease = await tx.get<{ t?: number }>('engine', 'lease');
      if (lease && lease.t && now - lease.t < 55000) return false;
      await tx.set('engine', 'lease', { t: now });
      return true;
    });
    if (!acquired) return false;
    await engineTick();
    return true;
  } catch {
    return false;
  }
}

export async function engNext() {
  const evs = (await getNewsEvents().catch(() => null)) || [];
  const now = Date.now();
  const e = evs.find((x: any) => /high/i.test(x.impact) && x.ts > now - 120e3);
  return e ? { title: e.title.slice(0, 60), country: e.country, ts: e.ts, secs: Math.round((e.ts - now) / 1000), impact: e.impact } : null;
}

export function engStats(doc: any) {
  const st = (doc && doc.stats) || {};
  const f = (k: string) => {
    const x = st[k] || { w: 0, l: 0 };
    const n = x.w + x.l;
    return { w: x.w, l: x.l, n, rate: n >= 10 ? Math.round((x.w / n) * 100) : null };
  };
  return { forex: f('forex'), forex_s: f('forex_s'), synth: f('synth'), synth_s: f('synth_s'), digits: f('digits') };
}

let engMemo: { t: number; on: boolean; gold: any } = { t: 0, on: false, gold: null };
export async function aiFor(c: any) {
  const mode = c.aiMode || 'off';
  if (mode === 'off') return { aiMode: 'off' };
  if (Date.now() - engMemo.t > 8000) {
    const s = await engStatus();
    engMemo = { t: Date.now(), on: s.online, gold: s.online ? await colGet('engine', 'gold') : null };
  }
  const g = engMemo.gold;
  const ok = engMemo.on && g && Date.now() - g.t < 180000;
  return {
    aiMode: mode,
    aiOn: engMemo.on ? 1 : 0,
    ...(ok
      ? {
          aiId: g.id,
          aiDir: g.dir,
          aiEntry: g.entry,
          aiSl: mode === 'scalp' ? g.sl1 : g.sl,
          aiTp: mode === 'scalp' ? g.tp1 : g.tp,
          aiAge: Math.round((Date.now() - g.t) / 1000),
        }
      : {}),
  };
}
