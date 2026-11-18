// Built-in Engine AI Bot (free built-in runtime module matching ai-bot.js)
export function pattern(d: number[]) {
  if (!d || d.length < 60) return null;
  const win = d.slice(-100);
  const n = win.length;
  const cnt = Array(10).fill(0);
  for (const x of win) cnt[x]++;
  const lastN = (k: number) => d.slice(-k);
  if (lastN(5).every((x) => x < 5)) return { contract: 'DIGITOVER', barrier: 4, why: '5 digits in a row below 5' };
  if (lastN(5).every((x) => x >= 5)) return { contract: 'DIGITUNDER', barrier: 5, why: '5 digits in a row of 5 or more' };
  const par = lastN(4).map((x) => x % 2);
  if (par.every((x) => x === par[0])) {
    return { contract: par[0] ? 'DIGITEVEN' : 'DIGITODD', barrier: null, why: `4 ${par[0] ? 'odd' : 'even'} digits in a row` };
  }
  let lo = 0;
  let hi = 0;
  for (let x = 1; x < 10; x++) {
    if (cnt[x] < cnt[lo]) lo = x;
    if (cnt[x] > cnt[hi]) hi = x;
  }
  if (n >= 100 && cnt[hi] / n >= 0.16) {
    return { contract: 'DIGITMATCH', barrier: hi, why: `digit ${hi} came ${cnt[hi]} times in 100 ticks` };
  }
  if (n >= 100 && cnt[lo] / n <= 0.05 && d[d.length - 1] !== lo) {
    return { contract: 'DIGITDIFF', barrier: lo, why: `digit ${lo} came only ${cnt[lo]} times in 100 ticks` };
  }
  return null;
}

const LABEL: Record<string, string> = {
  DIGITUNDER: 'Under',
  DIGITOVER: 'Over',
  DIGITDIFF: 'Differs',
  DIGITMATCH: 'Matches',
  DIGITEVEN: 'Even',
  DIGITODD: 'Odd',
};
const FLAG_MAX_AGE = 5 * 60 * 1000;
const MAX_PER_HOUR = 20;
const LOSS_PAUSE_AFTER = 3;
const LOSS_PAUSE_MS = 2 * 60 * 1000;

export function createAiBot(ctx: any) {
  const c = ctx.config;
  const { client, log, onState, lib, engine } = ctx;
  const currency = ctx.account.currency;
  const ai = (e: any) => {
    try {
      ctx.ai?.(e);
    } catch {}
  };
  const session = { pnl: 0, wins: 0, losses: 0, trades: 0 };
  let busy = false;
  let stopped = false;
  let scanner: any = null;
  let unsub: any = null;
  let flags = new Map<string, any>();
  let flagTimer: any = 0;
  let lossRun = 0;
  let pausedUntil = 0;
  let lastRows = 0;
  let offlineSince = 0;
  const times: number[] = [];

  const emit = () =>
    onState({
      ...session,
      open: busy ? 'contract open' : 'none',
      market: flags.size ? [...flags.keys()].join(', ') : 'waiting for engine',
      running: !stopped,
    });

  async function stop(reason?: string) {
    if (stopped) return;
    stopped = true;
    clearInterval(flagTimer);
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

  async function refreshFlags() {
    if (stopped) return;
    try {
      const st = await engine.status();
      if (!st.on) return stop('the engine is switched off');
      if (!st.online) {
        offlineSince = offlineSince || Date.now();
        if (Date.now() - offlineSince > 90000) return stop('ENGINE OFFLINE (no new entries). Use the scanner bots.');
        flags = new Map();
        return;
      }
      offlineSince = 0;
      const d = await engine.signals('digits');
      const now = Date.now();
      const m = new Map<string, any>();
      for (const s of d.signals || d.sigs || []) {
        if (s.res && s.res !== 'open') continue;
        const t = Number(s.ts || s.t || now);
        if (now - t > FLAG_MAX_AGE) continue;
        if (s.sym) m.set(s.sym, s);
      }
      flags = m;
      emit();
    } catch (e: any) {
      log('Engine check failed: ' + (e?.message || 'Error'), 'warn');
    }
  }

  function rows() {
    const now = Date.now();
    if (now - lastRows < 500 || !scanner) return;
    lastRows = now;
    ai({
      type: 'scan',
      fixed: true,
      next: 0,
      found: false,
      rows: [...scanner.windows.entries()].map(([symbol, w]: [string, any]) => ({
        symbol,
        ticks: w.n,
        score: flags.has(symbol) ? 1 : 0,
        label: flags.has(symbol) ? 'flagged by engine' : 'not flagged',
      })),
    });
  }

  function onTick(symbol: string, w: any) {
    if (stopped || busy) return;
    rows();
    if (!flags.has(symbol) || Date.now() < pausedUntil) return;
    const hit = pattern(w.digits);
    if (!hit) return;
    const hour = Date.now() - 3600000;
    while (times.length && times[0] < hour) times.shift();
    if (times.length >= MAX_PER_HOUR) return;
    void trade(symbol, hit);
  }

  async function trade(symbol: string, hit: { contract: string; barrier: number | null; why: string }) {
    if (busy || stopped) return;
    busy = true;
    times.push(Date.now());
    const lab = LABEL[hit.contract] + (hit.barrier !== null ? ' ' + hit.barrier : '');
    ai({ type: 'market', symbol, label: 'engine flagged', why: `${symbol}: ${lab} (${hit.why})` });
    ai({ type: 'entry', symbol, label: lab });
    ai({ type: 'placing', symbol, label: lab, stake: c.stake });

    const parameters: any = {
      amount: c.stake,
      basis: 'stake',
      contract_type: hit.contract,
      currency,
      duration: 1,
      duration_unit: 't',
      symbol,
    };
    if (hit.barrier !== null) parameters.barrier = String(hit.barrier);
    try {
      const r = await client.send({ buy: 1, price: c.stake, parameters });
      session.trades++;
      log(`TRADE ${symbol}: ${lab}, stake ${c.stake} ${currency}. Reason: ${hit.why}.`, 'info');
      ai({ type: 'placed', symbol, label: lab, stake: c.stake });
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
    lossRun = won ? 0 : lossRun + 1;
    log(`${won ? 'WON' : 'LOST'} ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} ${currency}. Session ${session.pnl.toFixed(2)}.`, won ? 'ok' : 'warn');
    if (lossRun >= LOSS_PAUSE_AFTER) {
      pausedUntil = Date.now() + LOSS_PAUSE_MS;
      lossRun = 0;
      log(`${LOSS_PAUSE_AFTER} losses in a row. Pausing 2 minutes.`, 'warn');
    }
    busy = false;
    ai({ type: 'result', won, profit, symbol, session: { ...session } });
    emit();
    if (c.stopLoss > 0 && session.pnl <= -c.stopLoss) return void stop(`stop loss of ${c.stopLoss} ${currency} reached`);
    if (c.takeProfit > 0 && session.pnl >= c.takeProfit) return void stop(`take profit of ${c.takeProfit} ${currency} reached`);
  }

  async function start() {
    log(
      `Engine AI: digit contracts only, fixed stake ${c.stake} ${currency}, no recovery doubling, max ${MAX_PER_HOUR} trades an hour, pause after ${LOSS_PAUSE_AFTER} losses.`,
      'info'
    );
    await refreshFlags();
    if (stopped) return;
    flagTimer = setInterval(() => void refreshFlags(), 15000);
    scanner = new lib.MarketScanner(client, lib.SYMBOLS, { size: 100, onTick });
    const n = await scanner.start();
    if (!n) return stop('no market could be scanned');
    log(`Watching ${n} markets. Trades only where the engine has flagged one and the live ticks confirm it.`, 'ok');
    emit();
  }

  return { start, stop: () => stop('stopped by you') };
}
