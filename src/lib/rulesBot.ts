// Rule-based strategy runner matching rules-bot.js (used for custom Bot Studio & rule bots)
import { cleanRules, type RuleSchema } from './rulesCore';
import { nextStake } from './scannerCore';

const fires = (t: any, w: any, armed?: number) => {
  const d = w.last;
  if (d === undefined) return null;
  if (t.kind === 'always') return { digit: d };
  if (t.kind === 'least-digit') return armed !== undefined && d === armed ? { digit: d, least: armed } : null;
  if (t.kind === 'streak') {
    const par = t.parity === 'odd' ? 1 : 0;
    const a = w.digits;
    if (a.length < t.length) return null;
    for (let i = a.length - t.length; i < a.length; i++) if (a[i] % 2 !== par) return null;
    return { digit: d };
  }
  const ok =
    t.cmp === 'gte'
      ? d >= t.value
      : t.cmp === 'lte'
      ? d <= t.value
      : t.cmp === 'eq'
      ? d === t.value
      : t.cmp === 'ne'
      ? d !== t.value
      : (t.list || []).includes(d);
  return ok ? { digit: d } : null;
};

const leastDigit = (w: any) => {
  if (w.n < 50) return undefined;
  const c = w.counts();
  let b = 0;
  for (let i = 1; i < 10; i++) if (c[i] < c[b]) b = i;
  return b;
};

const barrierOf = (c: any, hit: any, least?: number) =>
  c.barrier === 'trigger' ? hit.digit : c.barrier === 'least' ? least : c.barrier;

const wouldWin = (c: any, barrier: any, d: number, p0: number, p1: number) => {
  switch (c.type) {
    case 'DIGITUNDER':
      return d < barrier;
    case 'DIGITOVER':
      return d > barrier;
    case 'DIGITDIFF':
      return d !== barrier;
    case 'DIGITMATCH':
      return d === barrier;
    case 'DIGITEVEN':
      return d % 2 === 0;
    case 'DIGITODD':
      return d % 2 === 1;
    case 'CALL':
      return p1 > p0;
    case 'PUT':
      return p1 < p0;
    default:
      return false;
  }
};

const label = (c: any, b: any) =>
  ({
    DIGITUNDER: 'Under',
    DIGITOVER: 'Over',
    DIGITDIFF: 'Differs',
    DIGITMATCH: 'Matches',
    DIGITEVEN: 'Even',
    DIGITODD: 'Odd',
    CALL: 'Rise',
    PUT: 'Fall',
  }[c.type as string] || c.type) + (b !== undefined && b !== null ? ' ' + b : '');

export function createRulesBot(rawRules: RuleSchema, ctx: any) {
  const R = cleanRules(rawRules);
  const c = ctx.config;
  const { client, log, onState, lib } = ctx;
  const currency = ctx.account.currency;
  const ai = (e: any) => {
    try {
      ctx.ai?.(e);
    } catch {}
  };
  const session = { pnl: 0, wins: 0, losses: 0, trades: 0 };
  let stake = c.stake;
  let step = 0;
  let lossStreak = 0;
  let busy = false;
  let stopped = false;
  let scanner: any = null;
  let unsub: any = null;
  let virt: any = null;
  let cool = 0;
  let lastRows = 0;
  const armed = new Map<string, number | undefined>();
  const ticksSince = new Map<string, number>();

  const emit = () => onState({ ...session, open: busy ? 'contract open' : 'none', market: 'scanning', running: !stopped });
  const rule = () =>
    step > 0 && R.recovery.enabled
      ? { trigger: R.recovery.trigger || R.trigger, contract: R.recovery.contract || R.contract }
      : { trigger: R.trigger, contract: R.contract };
  const maxSteps = () => (R.recovery.enabled ? R.recovery.maxSteps : 0);

  async function stop(reason?: string) {
    if (stopped) return;
    stopped = true;
    log(reason ? `Stopped: ${reason}` : 'Stopped.', reason ? 'warn' : 'info');
    try {
      await scanner?.stop();
    } catch {}
    try {
      await unsub?.();
    } catch {}
    emit();
    ctx.finish?.();
  }

  function rows() {
    const now = Date.now();
    if (now - lastRows < 400 || !scanner) return;
    lastRows = now;
    const t = rule().trigger;
    ai({
      type: 'scan',
      fixed: true,
      next: 0,
      found: false,
      rows: [...scanner.windows.entries()].map(([symbol, w]: [string, any]) => {
        const hit = fires(t, w, armed.get(symbol));
        return {
          symbol,
          ticks: w.n,
          score: hit ? 1 : 0,
          label:
            w.last === undefined
              ? 'reading'
              : `last digit ${w.last}${
                  t.kind === 'least-digit' ? (armed.get(symbol) !== undefined ? `, waiting for ${armed.get(symbol)}` : ', reading') : ''
                }${hit ? ' - SIGNAL' : ''}`,
        };
      }),
    });
  }

  function onTick(symbol: string, w: any) {
    if (stopped) return;
    if (virt && virt.symbol === symbol && w.n > virt.n0) {
      virt.left--;
      if (virt.left <= 0) {
        const won = wouldWin(virt.c, virt.barrier, w.last, virt.p0, w.price);
        virt = null;
        lossStreak = won ? 0 : lossStreak + 1;
        log(
          `Paper signal on ${symbol}: ${won ? 'would have WON' : 'would have LOST'}. Losing signals in a row: ${lossStreak} of ${R.gate.afterLosses}.`,
          'info'
        );
        if (lossStreak >= R.gate.afterLosses) log('Gate open: the next signal is a real trade.', 'ok');
      }
      return;
    }
    if (busy || virt) return;
    if (cool > 0) {
      cool--;
      return;
    }
    const { trigger: t, contract } = rule();
    if (t.kind === 'least-digit') {
      const a = armed.get(symbol);
      const n = (ticksSince.get(symbol) || 0) + 1;
      ticksSince.set(symbol, n);
      if (a === undefined || n > 60) {
        armed.set(symbol, leastDigit(w));
        ticksSince.set(symbol, 0);
        return rows();
      }
    }
    const hit = fires(t, w, armed.get(symbol));
    if (!hit) return rows();
    const barrier = barrierOf(contract, hit, armed.get(symbol));
    armed.delete(symbol);
    const real = R.gate.afterLosses === 0 || lossStreak >= R.gate.afterLosses;
    if (real) return void trade(symbol, contract, barrier, hit);
    virt = { symbol, c: contract, barrier, left: contract.ticks, n0: w.n, p0: w.price };
    log(`Paper signal on ${symbol}: ${label(contract, barrier)} (no money).`, 'info');
  }

  async function trade(symbol: string, contract: any, barrier: any, hit: any) {
    if (busy || stopped) return;
    busy = true;
    ai({ type: 'market', symbol, label: `signal, digit ${hit.digit}`, why: `${symbol}: ${label(contract, barrier)}` });
    ai({ type: 'entry', symbol, label: label(contract, barrier) });
    ai({ type: 'placing', symbol, label: label(contract, barrier), stake });
    const parameters: any = {
      amount: stake,
      basis: 'stake',
      contract_type: contract.type,
      currency,
      duration: contract.ticks,
      duration_unit: 't',
      symbol,
    };
    if (barrier !== undefined && barrier !== null) parameters.barrier = String(barrier);
    try {
      const r = await client.send({ buy: 1, price: stake, parameters });
      session.trades++;
      log(`TRADE ${symbol}: ${label(contract, barrier)}, stake ${stake} ${currency}${step ? ` (recovery step ${step})` : ''}.`, 'info');
      ai({ type: 'placed', symbol, label: label(contract, barrier), stake });
      emit();
      unsub = await client.subscribe({ proposal_open_contract: 1, contract_id: r.buy.contract_id }, (m: any, err: any) => {
        if (err || !m) return;
        const p = m.proposal_open_contract;
        if (p && !p.is_sold && p.profit !== undefined) ai({ type: 'live', profit: Number(p.profit) });
        if (p && p.is_sold) void settle(p, symbol);
      });
    } catch (e: any) {
      log(`Buy failed: ${e?.message || 'Error'}`, 'error');
      busy = false;
      if (/balance|insufficient/i.test(e?.message || '')) void stop('not enough balance');
    }
  }

  async function settle(p: any, symbol: string) {
    if (!busy) return;
    const profit = Number(p.profit);
    const un = unsub;
    unsub = null;
    try {
      await un?.();
    } catch {}
    session.pnl = Math.round((session.pnl + profit) * 100) / 100;
    const won = profit > 0;
    if (won) session.wins++;
    else session.losses++;
    const n = nextStake({ base: c.stake, current: stake, won, multiplier: R.recovery.multiplier, step, maxSteps: maxSteps() });
    stake = n.stake;
    step = n.step;
    if (won || step === 0) lossStreak = 0;
    log(
      `${won ? 'WON' : 'LOST'} ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} ${currency}. Session ${session.pnl.toFixed(2)}.${
        R.gate.afterLosses && lossStreak === 0 ? ' Back to waiting for losing signals.' : ''
      }`,
      won ? 'ok' : 'warn'
    );
    cool = R.limits.cooldownTicks;
    busy = false;
    ai({ type: 'result', won, profit, symbol, session: { ...session } });
    emit();
    if (c.stopLoss > 0 && session.pnl <= -c.stopLoss) return void stop(`stop loss of ${c.stopLoss} ${currency} reached`);
    if (c.takeProfit > 0 && session.pnl >= c.takeProfit) return void stop(`take profit of ${c.takeProfit} ${currency} reached`);
    if (R.limits.maxTrades && session.trades >= R.limits.maxTrades) return void stop(`${R.limits.maxTrades} trades done`);
  }

  async function start() {
    log(
      'Rules: ' +
        [
          `${R.markets === 'all' ? 'all markets' : R.markets.join(', ')}`,
          R.gate.afterLosses ? `real trades only after ${R.gate.afterLosses} losing signals` : 'trades every signal',
          `stake ${stake} ${currency}`,
        ].join(', ') +
        '.',
      'info'
    );
    emit();
    const syms = R.markets === 'all' ? lib.SYMBOLS : lib.SYMBOLS.filter((s: string) => (R.markets as string[]).includes(s));
    scanner = new lib.MarketScanner(client, syms, { size: 100, onTick });
    const n = await scanner.start();
    if (!n) return stop('no market could be scanned');
    log(`Scanner ready on ${n} markets.`, 'ok');
    rows();
  }

  return { start, stop: () => stop('stopped by you') };
}
