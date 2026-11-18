// Economic news calendar helpers: impact grouping, countdown, pre-news forecast lean, and post-release reaction signal
export const IMPACT_GROUP = (i: string) => (/^(high|medium)$/i.test(i) ? 'impact' : 'non');

export const PAIRS: Record<string, string[]> = {
  USD: ['XAUUSD', 'EURUSD', 'GBPUSD', 'USDJPY'],
  EUR: ['EURUSD'],
  GBP: ['GBPUSD'],
  JPY: ['USDJPY'],
  AUD: ['AUDUSD'],
  CAD: ['USDCAD'],
  NZD: ['NZDUSD'],
  CHF: ['USDCHF'],
};

export const derivSymbol = (pair: string) => 'frx' + pair;
const INVERSE = /unemployment|jobless|claims|deficit|inventor/i;

export interface NewsEvent {
  id: string;
  ts: number;
  title: string;
  country: string;
  impact: string;
  forecast?: string;
  previous?: string;
  actual?: string;
}

export interface OhlcCandle {
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function parseNum(s: unknown): number | null {
  const m = String(s ?? '')
    .replace(/,/g, '')
    .match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let v = Number(m[0]);
  const u = String(s).trim().slice(-1).toUpperCase();
  if (u === 'K') v *= 1e3;
  else if (u === 'M') v *= 1e6;
  else if (u === 'B') v *= 1e9;
  else if (u === 'T') v *= 1e12;
  return v;
}

export function fmtCountdown(ms: number): string {
  const neg = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const x = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return (neg ? '-' : '') + (d ? d + 'd ' : '') + p(h) + ':' + p(m) + ':' + p(x);
}

export const WINDOW_MS = 30 * 60 * 1000;
export const eventState = (ev: NewsEvent, now: number): 'upcoming' | 'live' | 'past' =>
  now < ev.ts ? 'upcoming' : now - ev.ts <= WINDOW_MS ? 'live' : 'past';

export function currencyLean(ev: NewsEvent) {
  const f = parseNum(ev.forecast);
  const p = parseNum(ev.previous);
  if (f == null || p == null || f === p) return { sign: 0, why: 'No forecast change to lean on.' };
  let sign = f > p ? 1 : -1;
  if (INVERSE.test(ev.title)) sign = -sign;
  const word = sign > 0 ? 'stronger' : 'weaker';
  return {
    sign,
    why: `${ev.title}: forecast ${ev.forecast} against ${ev.previous} before, so ${ev.country} tends to be ${word} if it prints as expected.`,
  };
}

export function pairDir(pair: string, ccy: string, sign: number): number {
  if (!sign) return 0;
  return pair.startsWith(ccy) ? sign : pair.endsWith(ccy) ? -sign : 0;
}

export function preLean(ev: NewsEvent) {
  const L = currencyLean(ev);
  return (PAIRS[ev.country] || []).map((pair) => {
    const dir = pairDir(pair, ev.country, L.sign);
    const name = pair === 'XAUUSD' ? 'Gold' : pair;
    return {
      pair,
      dir,
      text: dir
        ? `${name} lean ${dir > 0 ? 'BUY' : 'SELL'}: ${L.why}${
            pair === 'XAUUSD' ? ' Gold moves the opposite way to the dollar.' : ''
          }`
        : `${name}: no clear lean.`,
    };
  });
}

export function reactionSignal(pair: string, ev: NewsEvent, candles: OhlcCandle[], now = Date.now()) {
  const rel = Math.floor(ev.ts / 1000);
  const name = pair === 'XAUUSD' ? 'Gold' : pair;
  if (now < ev.ts) return { status: 'wait' as const, text: 'Waiting for the release. Live signal starts at the release time.' };
  if (now - ev.ts > WINDOW_MS) return { status: 'expired' as const, text: 'The 30 minute window after the release has ended. No new signal.' };
  const pre = candles.filter((c) => c.epoch + 60 <= rel);
  const post = candles.filter((c) => c.epoch >= rel - 59 && c.epoch + 60 <= now / 1000);
  if (pre.length < 5) return { status: 'wait' as const, text: 'Loading prices.' };
  const last = candles[candles.length - 1];
  if (!post.length) return { status: 'wait' as const, text: 'Released. Waiting for the first candle to close to read the reaction.' };

  const base = pre[pre.length - 1].close;
  const w = pre.slice(-14);
  const atr = w.reduce((a, c) => a + (c.high - c.low), 0) / w.length || 1e-9;
  const px = last.close;
  const move = px - base;
  const dir = move > 0 ? 1 : -1;
  const mult = Math.abs(move) / atr;
  const mins = Math.max(1, Math.round((now - ev.ts) / 60000));
  const dp = pair.endsWith('JPY') || pair === 'XAUUSD' ? 2 : 5;
  const f = (v: number) => v.toFixed(dp);

  if (mult < 2) {
    return {
      status: 'none' as const,
      text: `${name} has moved ${move >= 0 ? '+' : ''}${move.toFixed(dp)} (${mult.toFixed(1)}x normal 1 minute range) in ${mins} min. Not a clear reaction yet, so no trade.`,
    };
  }
  const lastClosed = post[post.length - 1];
  if ((lastClosed.close - lastClosed.open) * dir <= 0) {
    return {
      status: 'none' as const,
      text: `${name} jumped ${mult.toFixed(1)}x its normal range but the last candle went back against it. Waiting for it to settle.`,
    };
  }
  const ext = post.slice(-3).reduce((a, c) => (dir > 0 ? Math.min(a, c.low) : Math.max(a, c.high)), dir > 0 ? Infinity : -Infinity);
  let risk = Math.max(1.5 * atr, Math.abs(px - ext));
  risk = Math.min(risk, 5 * atr);
  const lean = currencyLean(ev);
  const exp = pairDir(pair, ev.country, lean.sign);
  const agree =
    exp === 0
      ? ''
      : exp === dir
      ? ' This is the same direction as the forecast lean.'
      : ' This is against the forecast lean, which can mean the number surprised the market.';

  return {
    status: 'signal' as const,
    dir,
    side: dir > 0 ? 'BUY' : 'SELL',
    entry: px,
    sl: px - dir * risk,
    tp1: px + dir * 1.5 * risk,
    tp2: px + dir * 2.5 * risk,
    fmt: f,
    text: `${name} ${dir > 0 ? 'rose' : 'fell'} ${f(Math.abs(move))} (${mult.toFixed(1)}x its normal 1 minute range) within ${mins} min of ${ev.country} ${ev.title}, and the last closed candle confirms it. Entry follows the reaction; the stop sits ${dir > 0 ? 'below' : 'above'} the reaction low/high.${agree}`,
  };
}
