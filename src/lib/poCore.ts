// Pocket Option public market scanner (reads public Deriv feed, never logs into or places trades on Pocket Option)
export const PO_CATEGORIES = [
  ['all', 'All'],
  ['forex', 'Forex'],
  ['commodities', 'Commodities'],
  ['indices', 'Indices'],
  ['crypto', 'Crypto'],
] as const;

export interface PoMarket {
  id: string;
  name: string;
  cat: 'forex' | 'commodities' | 'indices' | 'crypto';
  fx: boolean;
}

const fx = (id: string, name: string): PoMarket => ({ id: 'frx' + id, name, cat: 'forex', fx: true });

export const PO_MARKETS: PoMarket[] = [
  fx('EURUSD', 'EUR/USD'),
  fx('GBPUSD', 'GBP/USD'),
  fx('USDJPY', 'USD/JPY'),
  fx('AUDUSD', 'AUD/USD'),
  fx('USDCAD', 'USD/CAD'),
  fx('USDCHF', 'USD/CHF'),
  fx('NZDUSD', 'NZD/USD'),
  fx('EURGBP', 'EUR/GBP'),
  fx('EURJPY', 'EUR/JPY'),
  fx('GBPJPY', 'GBP/JPY'),
  fx('AUDJPY', 'AUD/JPY'),
  fx('EURAUD', 'EUR/AUD'),
  fx('EURCHF', 'EUR/CHF'),
  fx('GBPAUD', 'GBP/AUD'),
  fx('GBPCAD', 'GBP/CAD'),
  fx('AUDCAD', 'AUD/CAD'),
  fx('CADJPY', 'CAD/JPY'),
  fx('CHFJPY', 'CHF/JPY'),
  { id: 'frxXAUUSD', name: 'Gold (XAU/USD)', cat: 'commodities', fx: true },
  { id: 'frxXAGUSD', name: 'Silver (XAG/USD)', cat: 'commodities', fx: true },
  { id: 'frxBROUSD', name: 'Brent Oil', cat: 'commodities', fx: true },
  { id: 'OTC_SPC', name: 'US 500', cat: 'indices', fx: true },
  { id: 'OTC_NDX', name: 'US Tech 100', cat: 'indices', fx: true },
  { id: 'OTC_DJI', name: 'Wall Street 30', cat: 'indices', fx: true },
  { id: 'OTC_FTSE', name: 'UK 100', cat: 'indices', fx: true },
  { id: 'OTC_GDAXI', name: 'Germany 40', cat: 'indices', fx: true },
  { id: 'OTC_N225', name: 'Japan 225', cat: 'indices', fx: true },
  { id: 'cryBTCUSD', name: 'Bitcoin (BTC/USD)', cat: 'crypto', fx: false },
  { id: 'cryETHUSD', name: 'Ethereum (ETH/USD)', cat: 'crypto', fx: false },
  { id: 'cryLTCUSD', name: 'Litecoin (LTC/USD)', cat: 'crypto', fx: false },
];

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  t?: number;
}

export const ema = (v: number[], n: number): number[] => {
  const k = 2 / (n + 1);
  let e = v[0];
  const out = [e];
  for (let i = 1; i < v.length; i++) {
    e = v[i] * k + e * (1 - k);
    out.push(e);
  }
  return out;
};

export function rsi(v: number[], n = 14): number {
  if (v.length <= n) return 50;
  let g = 0;
  let l = 0;
  for (let i = 1; i <= n; i++) {
    const d = v[i] - v[i - 1];
    if (d >= 0) g += d;
    else l -= d;
  }
  g /= n;
  l /= n;
  for (let i = n + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

export function analyse(candles: Candle[]) {
  if (!candles || candles.length < 40) return null;
  const c = candles.map((k) => k.c);
  const n = c.length - 1;
  const e9 = ema(c, 9);
  const e21 = ema(c, 21);
  const r = rsi(c, 14);
  const up = e9[n] > e21[n] && e9[n] > e9[n - 3];
  const dn = e9[n] < e21[n] && e9[n] < e9[n - 3];
  const last = candles[n];
  const prev = candles[n - 1];
  const bull = last.c > last.o && last.c > prev.c;
  const bear = last.c < last.o && last.c < prev.c;
  const body = Math.abs(last.c - last.o);
  const range = last.h - last.l || 1e-9;

  let buy = 0;
  let sell = 0;
  const why = { buy: [] as string[], sell: [] as string[] };
  if (up) {
    buy += 2;
    why.buy.push('fast average above slow average and rising');
  }
  if (dn) {
    sell += 2;
    why.sell.push('fast average below slow average and falling');
  }
  if (c[n] > e21[n]) buy += 1;
  else sell += 1;
  if (up && r >= 45 && r <= 88) {
    buy += 1;
    why.buy.push(`RSI ${r.toFixed(0)}: momentum is with the trend`);
  }
  if (dn && r <= 55 && r >= 12) {
    sell += 1;
    why.sell.push(`RSI ${r.toFixed(0)}: momentum is with the trend`);
  }
  if (r < 30 && !dn) {
    buy += 1.5;
    why.buy.push(`RSI ${r.toFixed(0)}: oversold bounce`);
  }
  if (r > 70 && !up) {
    sell += 1.5;
    why.sell.push(`RSI ${r.toFixed(0)}: overbought drop`);
  }
  if (bull && body / range > 0.5) {
    buy += 1;
    why.buy.push('last candle closed strong upward');
  }
  if (bear && body / range > 0.5) {
    sell += 1;
    why.sell.push('last candle closed strong downward');
  }

  const dir: 'BUY' | 'SELL' = buy >= sell ? 'BUY' : 'SELL';
  const score = Math.max(buy, sell);
  const gap = Math.abs(buy - sell);
  if (score < 4 || gap < 2) return null;
  return {
    dir,
    score,
    rsi: r,
    why: dir === 'BUY' ? why.buy : why.sell,
    trend: up ? 'up' : dn ? 'down' : 'flat',
  };
}

export const strengthOf = (score: number): 1 | 2 | 3 => (score >= 5.5 ? 3 : score >= 4.8 ? 2 : 1);

export function bestSignal(results: Array<{ market: PoMarket; candles: Candle[]; candles5?: Candle[] }>, now = Date.now()) {
  let best: { r: { market: PoMarket; candles: Candle[]; candles5?: Candle[] }; a: NonNullable<ReturnType<typeof analyse>> } | null = null;
  for (const r of results) {
    const a = analyse(r.candles);
    if (!a) continue;
    if (!best || a.score > best.a.score) best = { r, a };
  }
  if (!best) return null;
  let expiry = 2;
  if (best.r.candles5 && best.r.candles5.length > 30) {
    const c5 = best.r.candles5.map((k) => k.c);
    const e = ema(c5, 9);
    const f = ema(c5, 21);
    const n = c5.length - 1;
    const agree = best.a.dir === 'BUY' ? e[n] > f[n] : e[n] < f[n];
    expiry = agree ? 5 : 1;
  }
  const entryAt = Math.ceil(now / 60000) * 60000;
  return {
    market: best.r.market,
    dir: best.a.dir,
    strength: strengthOf(best.a.score),
    why: best.a.why,
    rsi: best.a.rsi,
    expiryMin: expiry,
    entryAt,
    expireAt: entryAt + expiry * 60000,
    price: best.r.candles[best.r.candles.length - 1].c,
  };
}
