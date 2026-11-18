// Client-side rule cleaning and plain-English preview matching server/rules-core.ts
export const CONTRACTS = [
  'DIGITUNDER',
  'DIGITOVER',
  'DIGITDIFF',
  'DIGITMATCH',
  'DIGITEVEN',
  'DIGITODD',
  'CALL',
  'PUT',
] as const;

export const NEEDS_BARRIER = new Set(['DIGITUNDER', 'DIGITOVER', 'DIGITDIFF', 'DIGITMATCH']);
const NAMES: Record<string, string> = {
  DIGITUNDER: 'Under',
  DIGITOVER: 'Over',
  DIGITDIFF: 'Differs',
  DIGITMATCH: 'Matches',
  DIGITEVEN: 'Even',
  DIGITODD: 'Odd',
  CALL: 'Rise',
  PUT: 'Fall',
};

export interface RuleSchema {
  markets: 'all' | string[];
  trigger: any;
  contract: { type: string; barrier?: number | 'trigger' | 'least'; ticks: number };
  gate: { afterLosses: number };
  recovery: {
    enabled: boolean;
    multiplier: number;
    maxSteps: number;
    trigger?: any;
    contract?: { type: string; barrier?: number | 'trigger' | 'least'; ticks: number };
  };
  limits: { maxTrades: number; cooldownTicks: number };
}

export const DEFAULT_RULES: RuleSchema = {
  markets: 'all',
  trigger: { kind: 'digit', cmp: 'gte', value: 8 },
  contract: { type: 'DIGITUNDER', barrier: 8, ticks: 1 },
  gate: { afterLosses: 0 },
  recovery: {
    enabled: true,
    multiplier: 2,
    maxSteps: 3,
    trigger: { kind: 'digit', cmp: 'gte', value: 7 },
    contract: { type: 'DIGITUNDER', barrier: 7, ticks: 1 },
  },
  limits: { maxTrades: 0, cooldownTicks: 0 },
};

const clamp = (v: unknown, a: number, b: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d;
};

function cleanTrig(t: any): any {
  if (!t || typeof t !== 'object') return { kind: 'always' };
  if (t.kind === 'least-digit') return { kind: 'least-digit' };
  if (t.kind === 'streak') {
    return {
      kind: 'streak',
      parity: t.parity === 'odd' ? 'odd' : 'even',
      length: Math.round(clamp(t.length, 2, 10, 3)),
    };
  }
  if (t.kind === 'digit') {
    if (t.cmp === 'in') {
      return {
        kind: 'digit',
        cmp: 'in',
        list: [...new Set((t.list || []).map(Number).filter((x: number) => Number.isInteger(x) && x >= 0 && x <= 9))],
      };
    }
    const cmp = ['gte', 'lte', 'eq', 'ne'].includes(t.cmp) ? t.cmp : 'eq';
    return { kind: 'digit', cmp, value: Math.round(clamp(t.value, 0, 9, 0)) };
  }
  return { kind: 'always' };
}

function cleanContract(c: any, d: any) {
  c = c || d;
  const type = CONTRACTS.includes(c.type) ? c.type : d.type;
  const barrier = NEEDS_BARRIER.has(type)
    ? c.barrier === 'trigger' || c.barrier === 'least'
      ? c.barrier
      : Math.round(clamp(c.barrier, 0, 9, 5))
    : undefined;
  return {
    type,
    ...(barrier !== undefined ? { barrier } : {}),
    ticks: Math.round(clamp(c.ticks, 1, 10, 1)),
  };
}

export function cleanRules(r: any): RuleSchema {
  r = r || {};
  const markets: 'all' | string[] =
    r.markets === 'all' || !Array.isArray(r.markets) || !r.markets.length
      ? 'all'
      : r.markets.map(String).slice(0, 10);
  const rec = r.recovery || {};
  const out: RuleSchema = {
    markets,
    trigger: cleanTrig(r.trigger),
    contract: cleanContract(r.contract, DEFAULT_RULES.contract),
    gate: { afterLosses: Math.round(clamp(r.gate?.afterLosses, 0, 10, 0)) },
    recovery: {
      enabled: rec.enabled !== false,
      multiplier: clamp(rec.multiplier, 1, 5, 2),
      maxSteps: Math.round(clamp(rec.maxSteps, 0, 6, 3)),
    },
    limits: {
      maxTrades: Math.round(clamp(r.limits?.maxTrades, 0, 200, 0)),
      cooldownTicks: Math.round(clamp(r.limits?.cooldownTicks, 0, 30, 0)),
    },
  };
  if (rec.trigger) out.recovery.trigger = cleanTrig(rec.trigger);
  if (rec.contract) out.recovery.contract = cleanContract(rec.contract, out.contract);
  return out;
}

const trigText = (t: any) =>
  t.kind === 'always'
    ? 'every tick'
    : t.kind === 'least-digit'
    ? 'when the least-appearing digit hits'
    : t.kind === 'streak'
    ? `after ${t.length} ${t.parity} ticks in a row`
    : t.cmp === 'in'
    ? `when the last digit is in [${(t.list || []).join(', ')}]`
    : `when the last digit is ${{ gte: 'at least', lte: 'at most', eq: 'equal to', ne: 'not' }[t.cmp as string]} ${t.value}`;

const conText = (c: any) =>
  NAMES[c.type] +
  (NEEDS_BARRIER.has(c.type) ? ' ' + (c.barrier === 'trigger' ? 'that digit' : c.barrier) : '') +
  (c.ticks > 1 ? ` (${c.ticks} ticks)` : '');

export function describeRules(raw: any): string {
  const r = cleanRules(raw);
  const parts = [
    `Watches ${r.markets === 'all' ? 'all 10 Volatility indices' : r.markets.join(', ')}.`,
    `Trades ${conText(r.contract)} ${trigText(r.trigger)}.`,
  ];
  if (r.gate.afterLosses) parts.push(`Counts signals silently until ${r.gate.afterLosses} lose in a row, then takes a real trade.`);
  parts.push(
    r.recovery.enabled
      ? `After a loss, multiplies stake by ${r.recovery.multiplier} up to ${r.recovery.maxSteps} times${
          r.recovery.contract || r.recovery.trigger
            ? ` and switches to ${conText(r.recovery.contract || r.contract)} ${trigText(r.recovery.trigger || r.trigger)}`
            : ''
        }.`
      : 'Fixed stake, no recovery.'
  );
  return parts.join(' ');
}
