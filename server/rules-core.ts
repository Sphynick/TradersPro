// Rule bots: the owner describes a digit bot as data (RULES). This file checks and explains rules. It is used by the admin page and by the Worker.
// A rule bot trades like this: scan all markets -> a TRIGGER fires on a market -> (optional GATE: wait for N losing signals first) -> place the CONTRACT -> after a loss use RECOVERY.

export const CONTRACTS: Record<string, string> = {
  DIGITUNDER: 'Under',
  DIGITOVER: 'Over',
  DIGITDIFF: 'Differs',
  DIGITMATCH: 'Matches',
  DIGITEVEN: 'Even',
  DIGITODD: 'Odd',
  CALL: 'Rise',
  PUT: 'Fall',
};

export const NEEDS_BARRIER = ['DIGITUNDER', 'DIGITOVER', 'DIGITDIFF', 'DIGITMATCH'];
export const SYMS = ['R_10', 'R_25', 'R_50', 'R_75', 'R_100', '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'];

export interface RuleTrigger {
  kind: 'digit' | 'least-digit' | 'streak' | 'always';
  cmp?: 'gte' | 'lte' | 'eq' | 'ne' | 'in';
  value?: number;
  list?: number[];
  parity?: 'even' | 'odd';
  length?: number;
}

export interface RuleContract {
  type: string;
  barrier?: number | 'trigger' | 'least';
  ticks: number;
}

export interface BotRules {
  v: 1;
  markets: 'all' | string[];
  trigger: RuleTrigger;
  contract: RuleContract;
  recovery: {
    enabled: boolean;
    multiplier: number;
    maxSteps: number;
    trigger: RuleTrigger | null;
    contract: RuleContract | null;
  };
  gate: { afterLosses: number };
  limits: { maxTrades: number; cooldownTicks: number };
}

export const DEFAULT_RULES: BotRules = {
  v: 1,
  markets: 'all',
  trigger: { kind: 'digit', cmp: 'gte', value: 8 },
  contract: { type: 'DIGITUNDER', barrier: 8, ticks: 1 },
  recovery: {
    enabled: true,
    multiplier: 2,
    maxSteps: 3,
    trigger: { kind: 'digit', cmp: 'gte', value: 7 },
    contract: { type: 'DIGITUNDER', barrier: 7, ticks: 1 },
  },
  gate: { afterLosses: 0 },
  limits: { maxTrades: 0, cooldownTicks: 0 },
};

export const PRESETS: Record<string, BotRules> = {
  'under-auto': { ...DEFAULT_RULES },
  'over-auto': {
    ...DEFAULT_RULES,
    trigger: { kind: 'digit', cmp: 'lte', value: 1 },
    contract: { type: 'DIGITOVER', barrier: 1, ticks: 1 },
    recovery: {
      enabled: true,
      multiplier: 2,
      maxSteps: 3,
      trigger: { kind: 'digit', cmp: 'lte', value: 2 },
      contract: { type: 'DIGITOVER', barrier: 2, ticks: 1 },
    },
  },
  'differs-auto': {
    ...DEFAULT_RULES,
    trigger: { kind: 'least-digit' },
    contract: { type: 'DIGITDIFF', barrier: 'least', ticks: 1 },
    recovery: { enabled: true, multiplier: 2, maxSteps: 3, trigger: null, contract: null },
  },
  'even-odd-auto': {
    ...DEFAULT_RULES,
    trigger: { kind: 'streak', parity: 'even', length: 4 },
    contract: { type: 'DIGITODD', ticks: 1 },
    recovery: { enabled: true, multiplier: 2, maxSteps: 2, trigger: null, contract: null },
  },
};

const int = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function cleanTrigger<T extends RuleTrigger | null>(t: any, d: T): RuleTrigger | T {
  if (!t || typeof t !== 'object') return d;
  if (t.kind === 'least-digit') return { kind: 'least-digit' };
  if (t.kind === 'always') return { kind: 'always' };
  if (t.kind === 'streak') return { kind: 'streak', parity: t.parity === 'odd' ? 'odd' : 'even', length: int(t.length, 2, 12, 4) };
  const cmp = (['gte', 'lte', 'eq', 'ne', 'in'].includes(t.cmp) ? t.cmp : 'gte') as 'gte' | 'lte' | 'eq' | 'ne' | 'in';
  if (cmp === 'in') {
    const list: number[] = Array.from(
      new Set<number>((Array.isArray(t.list) ? t.list : []).map((x: unknown) => int(x, 0, 9, -1)).filter((x: number) => x >= 0))
    );
    return list.length ? { kind: 'digit', cmp, list } : d;
  }
  return { kind: 'digit', cmp, value: int(t.value, 0, 9, 0) };
}

export function cleanContract<T extends RuleContract | null>(c: any, d: T): RuleContract | T {
  if (!c || typeof c !== 'object' || !CONTRACTS[c.type]) return d;
  const o: RuleContract = { type: c.type, ticks: int(c.ticks, 1, 10, 1) };
  if (NEEDS_BARRIER.includes(c.type)) {
    o.barrier = c.barrier === 'trigger' || c.barrier === 'least' ? c.barrier : int(c.barrier, 0, 9, 5);
  }
  return o;
}

// Turns anything (a form, or what the AI wrote) into safe rules. Unknown fields are dropped.
export function cleanRules(r: any): BotRules {
  r = r && typeof r === 'object' ? r : {};
  const markets = r.markets === 'all' || !Array.isArray(r.markets) ? 'all' : r.markets.filter((s: string) => SYMS.includes(s));
  const trigger = cleanTrigger(r.trigger, DEFAULT_RULES.trigger) as RuleTrigger;
  const contract = cleanContract(r.contract, DEFAULT_RULES.contract) as RuleContract;
  const rc = r.recovery && typeof r.recovery === 'object' ? r.recovery : {};
  const recovery = {
    enabled: rc.enabled !== false,
    multiplier: num(rc.multiplier, 1, 10, 2),
    maxSteps: int(rc.maxSteps, 0, 8, 3),
    trigger: rc.trigger ? cleanTrigger(rc.trigger, null) : null,
    contract: rc.contract ? cleanContract(rc.contract, null) : null,
  };
  if (!recovery.enabled) recovery.maxSteps = 0;
  return {
    v: 1,
    markets: markets === 'all' || markets.length ? markets : 'all',
    trigger,
    contract,
    recovery,
    gate: { afterLosses: int(r.gate?.afterLosses, 0, 10, 0) },
    limits: { maxTrades: int(r.limits?.maxTrades, 0, 1000, 0), cooldownTicks: int(r.limits?.cooldownTicks, 0, 200, 0) },
  };
}

const cmpText: Record<string, string> = { gte: 'is', lte: 'is', eq: 'is', ne: 'is not', in: 'is one of' };

export function triggerText(t: RuleTrigger): string {
  if (t.kind === 'least-digit') return "a market's least appearing digit prints again";
  if (t.kind === 'always') return 'every tick';
  if (t.kind === 'streak') return `${t.length} ${t.parity} digits in a row`;
  if (t.cmp === 'gte') return `the last digit is ${t.value} or higher`;
  if (t.cmp === 'lte') return `the last digit is ${t.value} or lower`;
  if (t.cmp === 'in') return `the last digit is one of ${(t.list || []).join(', ')}`;
  return `the last digit ${cmpText[t.cmp || 'eq']} ${t.value}`;
}

export function contractText(c: RuleContract): string {
  const b =
    c.barrier === 'trigger'
      ? ' (the digit that touched)'
      : c.barrier === 'least'
      ? ' (the least appearing digit)'
      : c.barrier !== undefined
      ? ` ${c.barrier}`
      : '';
  return `${CONTRACTS[c.type]}${b} for ${c.ticks} tick${c.ticks > 1 ? 's' : ''}`;
}

// Plain-English explanation shown to the owner so they can check what the bot will really do.
export function describeRules(r: BotRules): string[] {
  const L: string[] = [];
  L.push(`Scans ${r.markets === 'all' ? 'all markets' : r.markets.join(', ')}.`);
  L.push(`Signal: when ${triggerText(r.trigger)} it places ${contractText(r.contract)}.`);
  if (r.gate.afterLosses > 0) {
    L.push(
      `Only trades for real after ${r.gate.afterLosses} losing signal${r.gate.afterLosses > 1 ? 's' : ''} in a row (earlier signals are watched on paper, no money). After a real win it goes back to waiting.`
    );
  } else {
    L.push('Trades every signal.');
  }
  if (r.recovery.enabled && r.recovery.maxSteps > 0) {
    L.push(
      `After a loss: stake x${r.recovery.multiplier}, up to ${r.recovery.maxSteps} recovery step${r.recovery.maxSteps > 1 ? 's' : ''}${
        r.recovery.trigger ? `, waiting until ${triggerText(r.recovery.trigger)}` : ''
      }${r.recovery.contract ? `, then places ${contractText(r.recovery.contract)}` : ''}.`
    );
  } else {
    L.push('No recovery: stake stays the same after a loss.');
  }
  if (r.limits.maxTrades) L.push(`Stops after ${r.limits.maxTrades} trades.`);
  if (r.limits.cooldownTicks) L.push(`Waits ${r.limits.cooldownTicks} ticks between trades.`);
  return L;
}

export const RULES_SCHEMA_HELP = `JSON shape (all fields optional, unknown fields are ignored):
{"markets":"all" or a list of R_10,R_25,R_50,R_75,R_100,1HZ10V,1HZ25V,1HZ50V,1HZ75V,1HZ100V,
 "trigger":{"kind":"digit","cmp":"gte|lte|eq|ne|in","value":0-9,"list":[digits]} or {"kind":"least-digit"} (the digit that appeared least, wait until it prints) or {"kind":"streak","parity":"even|odd","length":2-12} or {"kind":"always"},
 "contract":{"type":"DIGITUNDER|DIGITOVER|DIGITDIFF|DIGITMATCH|DIGITEVEN|DIGITODD|CALL|PUT","barrier":0-9 or "trigger" (the digit that touched) or "least","ticks":1-10},
 "recovery":{"enabled":true|false,"multiplier":1-10,"maxSteps":0-8,"trigger":same shape as trigger or null,"contract":same shape as contract or null},
 "gate":{"afterLosses":0-10}  // only place REAL trades after this many losing signals in a row (earlier signals are paper only)
 "limits":{"maxTrades":0-1000,"cooldownTicks":0-200}}`;
