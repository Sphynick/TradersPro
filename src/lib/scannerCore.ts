// Live market digit scanner & signal functions shared between UI scanner and vault strategies (ctx.lib)
import type { DerivClient } from './derivClient';

export const SYMBOLS = [
  'R_10',
  'R_25',
  'R_50',
  'R_75',
  'R_100',
  '1HZ10V',
  '1HZ25V',
  '1HZ50V',
  '1HZ75V',
  '1HZ100V',
];

export function marketName(s?: string | null): string {
  const m = /^(R_|1HZ)(\d+)V?$/.exec(s || '');
  if (!m) return s || '-';
  return m[1] === 'R_' ? `Volatility ${m[2]} Index` : `Volatility ${m[2]} (1s) Index`;
}

export function marketPip(s?: string | null): number {
  if (!s) return 2;
  if (s === 'R_10' || s === 'R_25') return 3;
  if (s === 'R_50' || s === 'R_75') return 4;
  return 2;
}

export function lastDigit(price: number, pip?: number): number {
  const s = Number(price).toFixed(Number.isFinite(pip) ? pip : 2);
  return Number(s[s.length - 1]);
}

export function nextStake({
  base,
  current,
  won,
  multiplier = 2,
  step = 0,
  maxSteps = 3,
}: {
  base: number;
  current: number;
  won: boolean;
  multiplier?: number;
  step?: number;
  maxSteps?: number;
}) {
  return won || step >= maxSteps
    ? { stake: base, step: 0 }
    : { stake: Math.round(current * multiplier * 100) / 100, step: step + 1 };
}

export class DigitWindow {
  size: number;
  digits: number[] = [];
  prices: number[] = [];
  pip = 2;
  epoch = 0;

  constructor(size = 100) {
    this.size = size;
  }

  push(price: number, pip?: number, epoch?: number) {
    if (Number.isFinite(pip)) this.pip = pip as number;
    this.digits.push(lastDigit(price, this.pip));
    this.prices.push(Number(price));
    if (this.digits.length > this.size) {
      this.digits.shift();
      this.prices.shift();
    }
    this.epoch = epoch || this.epoch;
  }

  get n() {
    return this.digits.length;
  }
  get last(): number | undefined {
    return this.digits[this.digits.length - 1];
  }
  get price(): number | undefined {
    return this.prices[this.prices.length - 1];
  }

  counts(): number[] {
    const c = Array(10).fill(0);
    for (const d of this.digits) c[d]++;
    return c;
  }

  pct(): number[] {
    const n = this.n || 1;
    return this.counts().map((x) => x / n);
  }

  share(fn: (d: number) => boolean, tail?: number): number {
    const a = tail ? this.digits.slice(-tail) : this.digits;
    return a.length ? a.filter(fn).length / a.length : 0;
  }

  parityStreak(): { len: number; parity: 'even' | 'odd' | null } {
    const a = this.digits;
    if (!a.length) return { len: 0, parity: null };
    const p = a[a.length - 1] % 2;
    let len = 0;
    for (let i = a.length - 1; i >= 0 && a[i] % 2 === p; i--) len++;
    return { len, parity: p ? 'odd' : 'even' };
  }
}

export interface DigitSignal {
  side?: string;
  digit?: number;
  contract: string;
  barrier: number | null;
  recoveryContract?: string;
  recoveryBarrier?: number;
  ticks?: number;
  strength: number;
  enterNow?: boolean;
  why: string;
  label: string;
}

export function overUnderSignal(w: DigitWindow, { min = 0.58, minTicks = 50 } = {}): DigitSignal | null {
  if (w.n < minTicks) return null;
  const under = w.share((d) => d < 5);
  const over = 1 - under;
  const recentUnder = w.share((d) => d < 5, 20);
  if (under >= min && recentUnder >= 0.5) {
    return {
      side: 'under',
      contract: 'DIGITUNDER',
      barrier: 8,
      recoveryContract: 'DIGITOVER',
      recoveryBarrier: 4,
      strength: under,
      why: `${(under * 100).toFixed(0)}% of the last ${w.n} ticks ended under 5`,
      label: 'Under 8',
    };
  }
  if (over >= min && 1 - recentUnder >= 0.5) {
    return {
      side: 'over',
      contract: 'DIGITOVER',
      barrier: 2,
      recoveryContract: 'DIGITOVER',
      recoveryBarrier: 4,
      strength: over,
      why: `${(over * 100).toFixed(0)}% of the last ${w.n} ticks ended 5 or higher`,
      label: 'Over 2',
    };
  }
  return null;
}

export function evenOddSignal(w: DigitWindow, { minStreak = 3, maxStreak = 4 } = {}): DigitSignal | null {
  const s = w.parityStreak();
  if (s.len < minStreak || s.len > maxStreak || !s.parity) return null;
  const next = s.parity === 'even' ? 'odd' : 'even';
  return {
    side: next,
    contract: next === 'odd' ? 'DIGITODD' : 'DIGITEVEN',
    barrier: null,
    strength: s.len / maxStreak,
    why: `${s.len} ${s.parity} ticks in a row, trading ${next}`,
    label: next === 'odd' ? 'Odd' : 'Even',
  };
}

export function differsSignal(w: DigitWindow, { minTicks = 100, maxPct = 1 } = {}): DigitSignal | null {
  if (w.n < minTicks) return null;
  const p = w.pct();
  let d = 0;
  for (let i = 1; i < 10; i++) if (p[i] < p[d]) d = i;
  if (p[d] > maxPct) return null;
  return {
    digit: d,
    contract: 'DIGITDIFF',
    barrier: d,
    strength: 1 - p[d],
    enterNow: w.last === d,
    why: `digit ${d} is the least appearing at ${(p[d] * 100).toFixed(0)}% of the last ${w.n} ticks. Waiting for it to print again, then Differs ${d}`,
    label: `Differs ${d}`,
  };
}

export function matchesSignal(w: DigitWindow, { minTicks = 100, minPct = 0.13 } = {}): DigitSignal | null {
  if (w.n < minTicks) return null;
  const p = w.pct();
  let d = 0;
  for (let i = 1; i < 10; i++) if (p[i] > p[d]) d = i;
  if (p[d] < minPct) return null;
  return {
    digit: d,
    contract: 'DIGITMATCH',
    barrier: d,
    strength: p[d],
    enterNow: w.last === d,
    why: `digit ${d} is the hottest at ${(p[d] * 100).toFixed(0)}% of the last ${w.n} ticks, entering when it prints`,
    label: `Matches ${d}`,
  };
}

export function riseFallSignal(w: DigitWindow, { moves = 5, need = 4 } = {}): DigitSignal | null {
  if (w.prices.length < moves + 1) return null;
  const a = w.prices.slice(-(moves + 1));
  let up = 0;
  let dn = 0;
  for (let i = 1; i < a.length; i++) {
    if (a[i] > a[i - 1]) up++;
    else if (a[i] < a[i - 1]) dn++;
  }
  if (up >= need) {
    return {
      side: 'rise',
      contract: 'CALL',
      barrier: null,
      ticks: 5,
      strength: up / moves,
      why: `${up} of the last ${moves} ticks moved up`,
      label: 'Rise',
    };
  }
  if (dn >= need) {
    return {
      side: 'fall',
      contract: 'PUT',
      barrier: null,
      ticks: 5,
      strength: dn / moves,
      why: `${dn} of the last ${moves} ticks moved down`,
      label: 'Fall',
    };
  }
  return null;
}

const zScore = (seen: number, theory: number, n: number) =>
  (seen - theory) / Math.sqrt((theory * (1 - theory)) / Math.max(1, n));

export function digitMatchSignal(w: DigitWindow, { minTicks = 100, minZ = 0.9 } = {}): DigitSignal | null {
  if (w.n < minTicks) return null;
  const p = w.pct();
  let hot = 0;
  let cold = 0;
  for (let i = 1; i < 10; i++) {
    if (p[i] > p[hot]) hot = i;
    if (p[i] < p[cold]) cold = i;
  }
  const zHot = zScore(p[hot], 0.1, w.n);
  const zCold = (0.1 - p[cold]) / Math.sqrt(0.09 / w.n);
  if (Math.max(zHot, zCold) < minZ) return null;
  if (zHot >= zCold) {
    return {
      digit: hot,
      contract: 'DIGITMATCH',
      barrier: hot,
      strength: Math.min(1, zHot / 4),
      enterNow: w.last === hot,
      why: `digit ${hot} is the hottest at ${(p[hot] * 100).toFixed(0)}% of the last ${w.n} ticks, entering when it prints`,
      label: `Matches ${hot}`,
    };
  }
  return {
    digit: cold,
    contract: 'DIGITDIFF',
    barrier: cold,
    strength: Math.min(1, zCold / 4),
    enterNow: w.last === cold,
    why: `digit ${cold} is the rarest at ${(p[cold] * 100).toFixed(0)}% of the last ${w.n} ticks, entering when it prints`,
    label: `Differs ${cold}`,
  };
}

export function overUnderAISignal(w: DigitWindow, { minTicks = 50, minZ = 1.2 } = {}): DigitSignal | null {
  if (w.n < minTicks) return null;
  let best: { z: number; over: boolean; b: number; seen: number; theory: number } | null = null;
  const tryIt = (over: boolean, b: number) => {
    const theory = over ? (9 - b) / 10 : b / 10;
    const f = over ? (d: number) => d > b : (d: number) => d < b;
    const seen = w.share(f);
    const recent = w.share(f, 20);
    const z = zScore(seen, theory, w.n);
    if (z >= minZ && recent >= theory - 0.05 && (!best || z > best.z)) {
      best = { z, over, b, seen, theory };
    }
  };
  for (let b = 1; b <= 7; b++) tryIt(true, b);
  for (let b = 2; b <= 8; b++) tryIt(false, b);
  if (!best) return null;
  const bBest = best as { z: number; over: boolean; b: number; seen: number; theory: number };
  const c = bBest.over ? 'DIGITOVER' : 'DIGITUNDER';
  const name = `${bBest.over ? 'Over' : 'Under'} ${bBest.b}`;
  return {
    side: bBest.over ? 'over' : 'under',
    contract: c,
    barrier: bBest.b,
    recoveryContract: c,
    recoveryBarrier: bBest.b,
    strength: Math.min(1, bBest.z / 4),
    why: `${name} came in ${(bBest.seen * 100).toFixed(0)}% of the last ${w.n} ticks (chance alone gives ${(bBest.theory * 100).toFixed(0)}%)`,
    label: name,
  };
}

export const SIGNALS: Record<string, (w: DigitWindow, opts?: any) => DigitSignal | null> = {
  'digit-match': digitMatchSignal,
  'over-under-ai': overUnderAISignal,
  'over-under': overUnderSignal,
  'even-odd': evenOddSignal,
  differs: differsSignal,
  matches: matchesSignal,
  'rise-fall': riseFallSignal,
};

export function scanRows(mode: string, windows: Map<string, DigitWindow>) {
  const fn = SIGNALS[mode];
  const rows: Array<{ symbol: string; ticks: number; score: number; label: string | null }> = [];
  for (const [symbol, w] of windows) {
    const sig = fn ? fn(w) : null;
    rows.push({ symbol, ticks: w.n, score: sig ? Math.min(1, sig.strength) : 0, label: sig ? sig.label : null });
  }
  return rows;
}

export function bestMarket(mode: string, windows: Map<string, DigitWindow>) {
  const fn = SIGNALS[mode];
  if (!fn) return null;
  let best: { symbol: string; signal: DigitSignal } | null = null;
  for (const [symbol, w] of windows) {
    const s = fn(w);
    if (s && (!best || s.strength > best.signal.strength)) best = { symbol, signal: s };
  }
  return best;
}

export class MarketScanner {
  client: DerivClient;
  symbols: string[];
  size: number;
  onTick: (symbol: string, w: DigitWindow) => void;
  windows = new Map<string, DigitWindow>();
  unsubs: Array<() => Promise<void>> = [];
  stopped = false;

  constructor(
    client: DerivClient,
    symbols = SYMBOLS,
    { size = 100, onTick = () => {} }: { size?: number; onTick?: (symbol: string, w: DigitWindow) => void } = {}
  ) {
    this.client = client;
    this.symbols = symbols;
    this.size = size;
    this.onTick = onTick;
  }

  async start(): Promise<number> {
    for (const symbol of this.symbols) {
      if (this.stopped) break;
      const w = new DigitWindow(this.size);
      this.windows.set(symbol, w);
      try {
        const h = await this.client.send({ ticks_history: symbol, count: this.size, end: 'latest', style: 'ticks' });
        const prices = h?.history?.prices || [];
        const pip = h?.pip_size;
        for (const p of prices) w.push(p, pip);
      } catch {}
      try {
        const un = await this.client.subscribe({ ticks: symbol }, (m, err) => {
          if (this.stopped || err || !m?.tick) return;
          w.push(m.tick.quote, m.tick.pip_size, m.tick.epoch);
          this.onTick(symbol, w);
        });
        this.unsubs.push(un);
      } catch {
        this.windows.delete(symbol);
      }
    }
    return this.windows.size;
  }

  async stop() {
    this.stopped = true;
    for (const u of this.unsubs) {
      try {
        await u();
      } catch {}
    }
    this.unsubs = [];
  }
}
