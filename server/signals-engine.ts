import { colGet, colPut } from './store.ts';

// SMC / ICT signal engine. Runs server-side so the free trial cannot be bypassed.
// Candles: [{t, o, h, l, c}] oldest first. Rules are deliberately simple and easy to tune later (see CFG).
// Not financial advice: these are rule-based setups, not predictions.
export const CFG = {
  swing: 2, // bars each side that define a swing high/low
  minCandles: 60,
  minGapAtr: 0.25, // a fair value gap must be at least this many ATR tall
  nearAtr: 1.0, // price may be this many ATR away from the gap and still give a LIMIT entry
  eventAge: 40, // the structure break must be within this many candles
  minScore: 4, // of 6 confluences; FVG + structure + premium/discount are always required
  slBufferAtr: 0.25,
  tp1R: 2,
  tp2R: 3,
};

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export const PAIRS = [
  'frxXAUUSD',
  'frxEURUSD',
  'frxGBPUSD',
  'frxUSDJPY',
  'frxGBPJPY',
  'frxAUDUSD',
  'frxUSDCAD',
  'frxUSDCHF',
  'frxNZDUSD',
  'frxEURJPY',
  'frxEURGBP',
  'cryBTCUSD',
];
export const TFS = [
  { id: 'M5', g: 300 },
  { id: 'M15', g: 900 },
  { id: 'M30', g: 1800 },
  { id: 'H1', g: 3600 },
  { id: 'H4', g: 14400 },
];
// Gold is scanned on every timeframe, other pairs on M15, H1 and H4
export const tfsFor = (sym: string) => (sym === 'frxXAUUSD' ? TFS : TFS.filter((t) => ['M15', 'H1', 'H4'].includes(t.id)));
export const niceName = (s: string) => s.replace(/^(frx|cry)/, '');
export const decimals = (s: string) => (/JPY/.test(s) ? 3 : /XAU|BTC/.test(s) ? 2 : 5);
const r = (x: number, d: number) => Number(x.toFixed(d));

export function marketOpen(ms: number) {
  const d = new Date(ms).getUTCDay();
  return d !== 0 && d !== 6;
}
export function killzone(ms: number) {
  const h = new Date(ms).getUTCHours() + new Date(ms).getUTCMinutes() / 60;
  if (h >= 7 && h < 10) return 'London';
  if (h >= 12 && h < 15) return 'New York';
  return null;
}

export function atr(c: Candle[], n = 14) {
  if (c.length < 2) return 0;
  const a = c.slice(-(n + 1));
  let s = 0;
  for (let i = 1; i < a.length; i++) {
    s += Math.max(a[i].h - a[i].l, Math.abs(a[i].h - a[i - 1].c), Math.abs(a[i].l - a[i - 1].c));
  }
  return s / (a.length - 1);
}

export function swings(c: Candle[], k = CFG.swing) {
  const highs: Array<{ i: number; p: number; conf: number }> = [];
  const lows: Array<{ i: number; p: number; conf: number }> = [];
  for (let i = k; i < c.length - k; i++) {
    let hi = true;
    let lo = true;
    for (let j = 1; j <= k; j++) {
      if (!(c[i].h > c[i - j].h && c[i].h >= c[i + j].h)) hi = false;
      if (!(c[i].l < c[i - j].l && c[i].l <= c[i + j].l)) lo = false;
    }
    if (hi) highs.push({ i, p: c[i].h, conf: i + k });
    if (lo) lows.push({ i, p: c[i].l, conf: i + k });
  }
  return { highs, lows };
}

// Market structure. Returns events: BOS (break in trend direction) or CHOCH (break against the trend).
export function structure(c: Candle[]) {
  const { highs, lows } = swings(c);
  const events: Array<{ type: 'BOS' | 'CHOCH'; dir: 'bull' | 'bear'; j: number; level: number; swing: { i: number; p: number; conf: number } }> = [];
  let trend = 0;
  const hiUsed = new Set<number>();
  const loUsed = new Set<number>();
  for (let j = 0; j < c.length; j++) {
    const hi = [...highs].reverse().find((s) => s.conf <= j && !hiUsed.has(s.i));
    const lo = [...lows].reverse().find((s) => s.conf <= j && !loUsed.has(s.i));
    if (hi && c[j].c > hi.p) {
      events.push({ type: trend === -1 ? 'CHOCH' : 'BOS', dir: 'bull', j, level: hi.p, swing: hi });
      trend = 1;
      hiUsed.add(hi.i);
    } else if (lo && c[j].c < lo.p) {
      events.push({ type: trend === 1 ? 'CHOCH' : 'BOS', dir: 'bear', j, level: lo.p, swing: lo });
      trend = -1;
      loUsed.add(lo.i);
    }
  }
  return { events, trend, highs, lows };
}

export function fvgs(c: Candle[], a: number) {
  const out: Array<{ dir: 'bull' | 'bear'; lo: number; hi: number; i: number }> = [];
  for (let i = 2; i < c.length; i++) {
    const A = c[i - 2];
    const C = c[i];
    if (A.h < C.l && C.l - A.h >= CFG.minGapAtr * a) out.push({ dir: 'bull', lo: A.h, hi: C.l, i });
    else if (A.l > C.h && A.l - C.h >= CFG.minGapAtr * a) out.push({ dir: 'bear', lo: C.h, hi: A.l, i });
  }
  return out.filter((g) => !c.slice(g.i + 1).some((k) => (g.dir === 'bull' ? k.l <= g.lo : k.h >= g.hi)));
}

export function orderBlock(c: Candle[], ev: { dir: 'bull' | 'bear'; swing: { i: number }; j: number }) {
  const from = ev.swing.i;
  const to = ev.j;
  if (ev.dir === 'bull') {
    let m = from;
    for (let i = from; i <= to; i++) if (c[i].l < c[m].l) m = i;
    for (let i = m; i >= Math.max(0, m - 5); i--) if (c[i].c < c[i].o) return { lo: c[i].l, hi: c[i].h, i };
  } else {
    let m = from;
    for (let i = from; i <= to; i++) if (c[i].h > c[m].h) m = i;
    for (let i = m; i >= Math.max(0, m - 5); i--) if (c[i].c > c[i].o) return { lo: c[i].l, hi: c[i].h, i };
  }
  return null;
}

export function sweep(c: Candle[], dir: 'bull' | 'bear', sw: { highs: Array<{ i: number; p: number; conf: number }>; lows: Array<{ i: number; p: number; conf: number }> }) {
  const from = Math.max(0, c.length - 25);
  for (let i = c.length - 1; i >= from; i--) {
    if (dir === 'bull') {
      const lo = sw.lows.filter((s) => s.conf < i && s.i > i - 40).sort((a, b) => b.i - a.i)[0];
      if (lo && c[i].l < lo.p && c[i].c > lo.p) return { level: c[i].l };
    } else {
      const hi = sw.highs.filter((s) => s.conf < i && s.i > i - 40).sort((a, b) => b.i - a.i)[0];
      if (hi && c[i].h > hi.p && c[i].c < hi.p) return { level: c[i].h };
    }
  }
  return null;
}

// One pair, one timeframe -> a signal or null. Order of checks: FVG first, then SMC structure, then ICT.
export function analyze(sym: string, tf: string, c: Candle[], nowMs = Date.now()) {
  if (!c || c.length < CFG.minCandles) return null;
  const a = atr(c);
  if (!a) return null;
  const dp = decimals(sym);
  const price = c[c.length - 1].c;
  const last = c.length - 1;
  const st = structure(c);
  const ev = [...st.events].reverse().find((e) => last - e.j <= CFG.eventAge);
  if (!ev) return null;
  const dir = ev.dir;
  // 1) FVG
  const gaps = fvgs(c, a)
    .filter((g) => g.dir === dir && g.i >= ev.j - 4)
    .sort((x, y) => y.i - x.i);
  const gap = gaps[0];
  if (!gap) return null;
  const inZone = price >= gap.lo && price <= gap.hi;
  const dist = dir === 'bull' ? price - gap.hi : gap.lo - price;
  if (!inZone && (dist < 0 || dist > CFG.nearAtr * a)) return null;
  // 2) SMC
  const ob = orderBlock(c, ev);
  const obOverlap = !!ob && ob.lo <= gap.hi + 0.5 * a && ob.hi >= gap.lo - 0.5 * a;
  const sw = sweep(c, dir, st);
  // 3) ICT
  const win = c.slice(-60);
  const hi = Math.max(...win.map((k) => k.h));
  const lo = Math.min(...win.map((k) => k.l));
  const mid = (hi + lo) / 2;
  const pd = dir === 'bull' ? price <= mid : price >= mid;
  const kz = killzone(nowMs);
  const checks = { fvg: true, structure: true, orderBlock: obOverlap, sweep: !!sw, premiumDiscount: pd, killzone: !!kz };
  const score = Object.values(checks).filter(Boolean).length;
  if (!pd || score < CFG.minScore) return null;

  const entry = inZone ? price : (gap.lo + gap.hi) / 2;
  const slBase =
    dir === 'bull'
      ? Math.min(gap.lo, obOverlap && ob ? ob.lo : gap.lo, sw ? sw.level : gap.lo)
      : Math.max(gap.hi, obOverlap && ob ? ob.hi : gap.hi, sw ? sw.level : gap.hi);
  const sl = dir === 'bull' ? slBase - CFG.slBufferAtr * a : slBase + CFG.slBufferAtr * a;
  const risk = Math.abs(entry - sl);
  if (!(risk > 0)) return null;
  const tp1 = dir === 'bull' ? entry + CFG.tp1R * risk : entry - CFG.tp1R * risk;
  const opp =
    dir === 'bull'
      ? st.highs.filter((s) => s.p > tp1).sort((x, y) => x.p - y.p)[0]
      : st.lows.filter((s) => s.p < tp1).sort((x, y) => y.p - x.p)[0];
  const tp2 = opp ? opp.p : dir === 'bull' ? entry + CFG.tp2R * risk : entry - CFG.tp2R * risk;
  const rr = Math.abs(tp2 - entry) / risk;

  return {
    symbol: niceName(sym),
    tf,
    dir: dir === 'bull' ? ('BUY' as const) : ('SELL' as const),
    status: inZone ? 'ENTRY NOW' : 'LIMIT',
    entry: r(entry, dp),
    sl: r(sl, dp),
    tp1: r(tp1, dp),
    tp2: r(tp2, dp),
    rr: r(rr, 1),
    zone: [r(gap.lo, dp), r(gap.hi, dp)],
    price: r(price, dp),
    event: `${ev.type} ${dir === 'bull' ? 'up' : 'down'}`,
    score,
    max: 6,
    checks,
    killzone: kz,
    t: c[last].t,
  };
}

export function scanAll(candleMap: Record<string, Candle[]>, nowMs = Date.now()) {
  const out: NonNullable<ReturnType<typeof analyze>>[] = [];
  for (const [key, c] of Object.entries(candleMap)) {
    const [sym, tf] = key.split('|');
    try {
      const s = analyze(sym, tf, c, nowMs);
      if (s) out.push(s);
    } catch {}
  }
  const rank = (s: NonNullable<ReturnType<typeof analyze>>) =>
    (s.symbol === 'XAUUSD' ? 100 : 0) + s.score * 10 + ({ M5: 0, M15: 1, M30: 2, H1: 3, H4: 4 }[s.tf] || 0);
  return out.sort((a, b) => rank(b) - rank(a));
}

// ---------- AI scanner: top-down. H4 and H1 give the direction, M15 and M5 give the pullback entry. ----------
export const AI_MARKETS = ['frxXAUUSD', 'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxAUDUSD', 'frxUSDCAD', 'frxGBPJPY', 'frxUSDCHF'];
export const OIL_SYMBOLS = ['frxBROUSD', 'frxWTIUSD'];
export const AI_TFS = [
  { id: 'H4', g: 14400 },
  { id: 'H1', g: 3600 },
  { id: 'M15', g: 900 },
  { id: 'M5', g: 300 },
];
export const AI_PACK = 5;

const emaSeries = (v: number[], n: number) => {
  const k = 2 / (n + 1);
  const o = [v[0]];
  for (let i = 1; i < v.length; i++) o.push(v[i] * k + o[i - 1] * (1 - k));
  return o;
};

const rsiSeries = (v: number[], n = 14) => {
  const o = Array(v.length).fill(50);
  if (v.length <= n) return o;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= n; i++) {
    const d = v[i] - v[i - 1];
    if (d > 0) g += d;
    else l -= d;
  }
  g /= n;
  l /= n;
  o[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return o;
};

// "up", "down" or "flat" from the closed candles (the last candle is still forming and is ignored)
export function trendOf(candles: Candle[]): 'up' | 'down' | 'flat' {
  const c = candles.slice(0, -1);
  if (c.length < 55) return 'flat';
  const cl = c.map((x) => x.c);
  const e20 = emaSeries(cl, 20);
  const e50 = emaSeries(cl, 50);
  const n = cl.length - 1;
  if (e20[n] > e50[n] && cl[n] > e50[n] && e50[n] > e50[n - 5]) return 'up';
  if (e20[n] < e50[n] && cl[n] < e50[n] && e50[n] < e50[n - 5]) return 'down';
  return 'flat';
}

// Looks for a pullback entry in the trend direction on one lower timeframe.
export function aiEntry(candles: Candle[], dir: 'BUY' | 'SELL', tfId: string, sym: string) {
  const c = candles.slice(0, -1);
  if (c.length < 60) return null;
  const buy = dir === 'BUY';
  const cl = c.map((x) => x.c);
  const e20 = emaSeries(cl, 20);
  const e50 = emaSeries(cl, 50);
  const rsi = rsiSeries(cl);
  const a = atr(c);
  const n = c.length - 1;
  const k = c[n];
  const p = c[n - 1];
  if (!a) return null;
  const recent = c.slice(-8);
  const why: string[] = [];
  const pulled = buy
    ? Math.min(...recent.map((x) => x.l)) <= e20[n] + 0.25 * a && k.c > e50[n]
    : Math.max(...recent.map((x) => x.h)) >= e20[n] - 0.25 * a && k.c < e50[n];
  const r6 = rsi.slice(-7, -1);
  const turn = buy
    ? Math.min(...r6) <= 45 && rsi[n] > rsi[n - 1] && rsi[n] >= 45
    : Math.max(...r6) >= 55 && rsi[n] < rsi[n - 1] && rsi[n] <= 55;
  const body = Math.abs(k.c - k.o);
  const lowWick = Math.min(k.o, k.c) - k.l;
  const upWick = k.h - Math.max(k.o, k.c);
  const candle = buy
    ? k.c > k.o && (k.c > p.h || (k.c > p.o && k.o < p.c) || lowWick >= 1.5 * body)
    : k.c < k.o && (k.c < p.l || (k.c < p.o && k.o > p.c) || upWick >= 1.5 * body);
  if (!pulled || !turn || !candle) return null;
  why.push(`${tfId}: price pulled back to the 20 EMA and is holding ${buy ? 'above' : 'below'} the 50 EMA`);
  why.push(`${tfId}: RSI turned ${buy ? 'up' : 'down'} (${rsi[n].toFixed(0)})`);
  why.push(`${tfId}: ${buy ? 'bullish' : 'bearish'} confirmation candle`);
  let score = 3;
  if (buy ? e20[n] > e50[n] : e20[n] < e50[n]) {
    score++;
    why.push(`${tfId}: EMAs lined up ${buy ? 'up' : 'down'}`);
  }
  if (buy ? rsi[n] < 72 : rsi[n] > 28) {
    score++;
    why.push('Not overextended');
  }
  const dp = decimals(sym);
  const entry = k.c;
  const swing = buy ? Math.min(...c.slice(-6).map((x) => x.l)) : Math.max(...c.slice(-6).map((x) => x.h));
  let risk = buy ? entry - swing + 0.2 * a : swing - entry + 0.2 * a;
  risk = Math.min(Math.max(risk, 0.6 * a), 1.3 * a);
  const sl = buy ? entry - risk : entry + risk;
  const tp1 = buy ? entry + 1.5 * risk : entry - 1.5 * risk;
  const tp2 = buy ? entry + 2.5 * risk : entry - 2.5 * risk;
  return { entry: r(entry, dp), sl: r(sl, dp), tp1: r(tp1, dp), tp2: r(tp2, dp), rr: 1.5, riskAtr: r(risk / a, 2), score, why, tf: tfId, t: k.t };
}

export function aiScan(candleMap: Record<string, Candle[]>, nowMs = Date.now()) {
  const trendFor = (sym: string, tf: string) => (candleMap[sym + '|' + tf] ? trendOf(candleMap[sym + '|' + tf]) : null);
  const oilSym = OIL_SYMBOLS.find((s) => candleMap[s + '|H4'] || candleMap[s + '|H1']);
  const oil = oilSym ? { symbol: oilSym, h4: trendFor(oilSym, 'H4'), h1: trendFor(oilSym, 'H1'), trend: 'flat' as 'up' | 'down' | 'flat' } : null;
  if (oil) oil.trend = oil.h4 && oil.h4 !== 'flat' ? oil.h4 : oil.h1 || 'flat';

  const markets: Array<{ symbol: string; h4: string | null; h1: string | null; bias: 'BUY' | 'SELL' | null; state: string; note: string; signal?: unknown }> = [];
  const signals: Array<{
    symbol: string;
    dir: 'BUY' | 'SELL';
    tf: string;
    entry: number;
    sl: number;
    tp1: number;
    tp2: number;
    rr: number;
    score: number;
    htf: { h4: string | null; h1: string | null };
    criteria: string[];
    t: number;
  }> = [];

  for (const sym of AI_MARKETS) {
    const name = niceName(sym);
    const h4 = trendFor(sym, 'H4');
    const h1 = trendFor(sym, 'H1');
    const row: (typeof markets)[number] = { symbol: name, h4, h1, bias: null, state: 'no data', note: '' };
    markets.push(row);
    if (!h4 && !h1) continue;
    let dir: 'BUY' | 'SELL' | null = null;
    let from = '';
    if (h4 && h4 !== 'flat' && (h1 === h4 || h1 === 'flat')) {
      dir = h4 === 'up' ? 'BUY' : 'SELL';
      from = h1 === h4 ? 'H4 and H1' : 'H4';
    } else if (h4 === 'flat' && h1 && h1 !== 'flat') {
      dir = h1 === 'up' ? 'BUY' : 'SELL';
      from = 'H1';
    } else if (h4 && h1 && h4 !== 'flat' && h1 !== 'flat') {
      row.state = 'conflict';
      row.note = 'H4 and H1 disagree, so the AI stays out';
      continue;
    }

    let oilNote: string | null = null;
    if (sym === 'frxXAUUSD') {
      if (!oil) oilNote = 'Oil chart not available right now, gold judged on its own trend';
      else if (!dir && oil.trend !== 'flat') {
        dir = oil.trend === 'up' ? 'SELL' : 'BUY';
        from = 'oil (opposite)';
        oilNote = `Oil is in an ${oil.trend}trend, so gold looks for ${dir === 'BUY' ? 'buys' : 'sells'}`;
      } else if (dir && oil.trend !== 'flat') {
        const same = (oil.trend === 'up') === (dir === 'BUY');
        if (same) {
          row.bias = dir;
          row.state = 'oil conflict';
          row.note = `Oil is in the same direction (${oil.trend}), gold should go the opposite way, so the AI stays out`;
          continue;
        }
        oilNote = `Oil is in a ${oil.trend}trend, the opposite of this gold ${dir === 'BUY' ? 'buy' : 'sell'}`;
      } else {
        oilNote = 'Oil is flat, so it does not change gold';
      }
    }

    if (!dir) {
      row.state = 'no trend';
      row.note = 'No clear trend on H4 or H1';
      continue;
    }
    row.bias = dir;
    row.state = 'waiting';
    row.note = `${dir === 'BUY' ? 'Uptrend' : 'Downtrend'} on ${from}. Waiting for a pullback entry on M15 or M5`;

    let best: ReturnType<typeof aiEntry> = null;
    for (const tf of ['M15', 'M5']) {
      const cs = candleMap[sym + '|' + tf];
      if (!cs) continue;
      try {
        const e = aiEntry(cs, dir, tf, sym);
        if (e && (!best || e.score > best.score)) best = e;
      } catch {}
    }
    if (!best) continue;
    const criteria = [`${from === 'oil (opposite)' ? 'Oil' : from} ${dir === 'BUY' ? 'uptrend' : 'downtrend'}: trading with the big trend`, ...best.why];
    let score = best.score + 1;
    if (oilNote && /opposite of this/.test(oilNote)) score++;
    if (oilNote) criteria.push(oilNote);
    const sig = { symbol: name, dir, tf: best.tf, entry: best.entry, sl: best.sl, tp1: best.tp1, tp2: best.tp2, rr: best.rr, score, htf: { h4, h1 }, criteria, t: nowMs };
    row.state = 'entry';
    row.note = `${dir} entry found on ${best.tf}`;
    row.signal = sig;
    signals.push(sig);
  }

  signals.sort((x, y) => y.score - x.score || Number(y.symbol === 'XAUUSD') - Number(x.symbol === 'XAUUSD'));
  return { markets, signals, oil };
}

// ---------- Deriv public candle batch over Node WebSocket ----------
const PUBLIC_WS_URLS = [
  'wss://api.derivws.com/trading/v1/options/ws/public',
  'wss://ws.derivws.com/websockets/v3?app_id=1089',
];

export async function derivCandles(reqs: Array<{ key: string; sym: string; g: number }>) {
  const out: Record<string, Candle[]> = {};
  const errs: Record<string, string> = {};
  if (typeof WebSocket === 'undefined') {
    errs.connect = 'WebSocket runtime unavailable';
    return { out, errs };
  }
  for (const url of PUBLIC_WS_URLS) {
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(url);
        const idmap: Record<number, string> = {};
        let left = reqs.length;
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          clearTimeout(to);
          try { ws.close(); } catch {}
          resolve();
        };
        const to = setTimeout(done, 12000);
        ws.addEventListener('open', () => {
          reqs.forEach((q, i) => {
            idmap[i + 1] = q.key;
            ws.send(
              JSON.stringify({
                ticks_history: q.sym,
                adjust_start_time: 1,
                count: 100,
                end: 'latest',
                style: 'candles',
                granularity: q.g,
                req_id: i + 1,
              })
            );
          });
        });
        ws.addEventListener('message', (ev) => {
          let m: any;
          try {
            m = JSON.parse(String(ev.data));
          } catch {
            return;
          }
          const k = idmap[m.req_id];
          if (!k) return;
          if (m.error) errs[k] = m.error.message || 'error';
          else if (Array.isArray(m.candles)) {
            out[k] = m.candles.map((c: any) => ({ t: Number(c.epoch), o: +c.open, h: +c.high, l: +c.low, c: +c.close }));
          }
          if (--left <= 0) done();
        });
        ws.addEventListener('error', () => {
          if (!settled) {
            clearTimeout(to);
            reject(new Error('WebSocket error'));
          }
        });
        ws.addEventListener('close', done);
      });
      if (Object.keys(out).length > 0) break;
    } catch (e) {
      errs.connect = String(e instanceof Error ? e.message : e);
    }
  }
  return { out, errs };
}

export const SIG_TTL = 300000;

export async function currentSignals() {
  const now = Date.now();
  const cached = await colGet<{ t: number; closed: boolean; signals: unknown[]; scan: unknown }>('signals', 'latest');
  if (cached && now - cached.t < SIG_TTL) return cached;

  let res;
  if (!marketOpen(now)) {
    res = { t: now, closed: true, signals: [], scan: { ok: 0, total: 0, errors: [] } };
  } else {
    const reqs: Array<{ key: string; sym: string; g: number }> = [];
    for (const sym of PAIRS) for (const tf of tfsFor(sym)) reqs.push({ key: sym + '|' + tf.id, sym, g: tf.g });
    const { out, errs } = await derivCandles(reqs);
    const ok = Object.keys(out).length;
    res = {
      t: ok ? now : now - SIG_TTL + 60000,
      closed: false,
      signals: scanAll(out, now),
      scan: { ok, total: reqs.length, errors: Object.values(errs).slice(0, 3) },
    };
  }
  try {
    await colPut('signals', 'latest', res as Record<string, unknown>);
  } catch {}
  return res;
}

let AI_MEM: { t: number; res: any } | null = null;
export async function aiScanNow() {
  const now = Date.now();
  if (AI_MEM && now - AI_MEM.t < 45000) return AI_MEM.res;
  let res;
  if (!marketOpen(now)) {
    res = { closed: true, markets: [], signals: [], t: now };
  } else {
    const reqs: Array<{ key: string; sym: string; g: number }> = [];
    for (const sym of AI_MARKETS) for (const tf of AI_TFS) reqs.push({ key: sym + '|' + tf.id, sym, g: tf.g });
    for (const sym of OIL_SYMBOLS) for (const tf of AI_TFS.slice(0, 2)) reqs.push({ key: sym + '|' + tf.id, sym, g: tf.g });
    const { out, errs } = await derivCandles(reqs);
    const ok = Object.keys(out).length;
    const r = aiScan(out, now);
    res = {
      closed: false,
      markets: r.markets,
      signals: r.signals,
      oil: r.oil ? r.oil.trend : null,
      ok,
      errors: Object.values(errs).slice(0, 3),
      t: now,
    };
    if (ok) AI_MEM = { t: now, res };
  }
  return res;
}

let newsCache: { events: any[]; fetched: number } | null = null;
export async function getNewsEvents() {
  const now = Date.now();
  if (newsCache && now - newsCache.fetched < 1800000) return newsCache.events;
  const events: Array<{ id: string; title: string; country: string; ts: number; impact: string; forecast: string; previous: string }> = [];
  let ok = false;
  for (const w of ['thisweek', 'nextweek']) {
    try {
      const r = await fetch(`https://nfs.faireconomy.media/ff_calendar_${w}.json`, {
        headers: { 'User-Agent': 'Mozilla/5.0 TRADERSPRO254' },
      });
      if (!r.ok) continue;
      const j = (await r.json()) as Array<Record<string, unknown>>;
      ok = true;
      for (const e of j) {
        const ts = Date.parse(String(e.date || ''));
        if (!Number.isFinite(ts)) continue;
        events.push({
          id: `${ts}-${e.country}-${e.title}`,
          title: String(e.title || ''),
          country: String(e.country || ''),
          ts,
          impact: String(e.impact || 'Low'),
          forecast: String(e.forecast || ''),
          previous: String(e.previous || ''),
        });
      }
    } catch {}
  }
  if (!ok) return newsCache ? newsCache.events : null;
  events.sort((x, y) => x.ts - y.ts);
  newsCache = { events, fetched: now };
  return events;
}
