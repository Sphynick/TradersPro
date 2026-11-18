import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { CheckCircle2, Play, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CATALOG_ITEMS, DERIV_MARKETS, type CatalogItem } from '../data/catalog.ts';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import {
  executeDerivContract,
  subscribeMarketTicks,
  verifyDerivToken,
  type TickPoint,
} from '../services/derivWs.ts';
import type { TradeLogRecord } from '../types/app.ts';

interface AutomatedViewProps {
  selectedBotId: string;
  onSelectBotId: (id: string) => void;
  licenses: string[];
  isAdmin: boolean;
  userId: string | null;
  derivToken: string;
  onSaveDerivToken: (token: string) => void;
  tradeLogs: TradeLogRecord[];
  onUnlockBot: (item: CatalogItem) => void;
}

export function AutomatedView({
  selectedBotId,
  onSelectBotId,
  licenses,
  isAdmin,
  userId,
  derivToken,
  onSaveDerivToken,
  tradeLogs,
  onUnlockBot,
}: AutomatedViewProps) {
  const automatedBots = useMemo(
    () => CATALOG_ITEMS.filter((item) => item.section === 'automated'),
    []
  );

  const selectedBot =
    automatedBots.find((b) => b.id === selectedBotId) || automatedBots[0];

  const isBotUnlocked =
    selectedBot.builtin || isAdmin || licenses.includes(selectedBot.id);

  const [symbol, setSymbol] = useState<string>('R_100');
  const marketMeta = DERIV_MARKETS.find((m) => m.symbol === symbol) || DERIV_MARKETS[4];

  const [wsStatus, setWsStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [ticks, setTicks] = useState<TickPoint[]>([]);
  const [tokenInput, setTokenInput] = useState(derivToken);
  const [accountInfo, setAccountInfo] = useState<{
    balance: number;
    currency: string;
    isVirtual: boolean;
    loginid: string;
  } | null>(null);
  const [tokenError, setTokenError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const [contractType, setContractType] = useState<
    'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD' | 'DIGITDIFF' | 'DIGITMATCH' | 'CALL' | 'PUT'
  >('DIGITOVER');
  const [barrier, setBarrier] = useState('1');
  const [stake, setStake] = useState('1');
  const [takeProfit, setTakeProfit] = useState('10');
  const [stopLoss, setStopLoss] = useState('10');

  const [running, setRunning] = useState(false);
  const [sessionPnl, setSessionPnl] = useState(0);
  const [runStatus, setRunStatus] = useState('Ready to trade on demo or real account.');

  const runningRef = useRef(false);
  const sessionPnlRef = useRef(0);
  const busyTradeRef = useRef(false);

  useEffect(() => {
    setTokenInput(derivToken);
  }, [derivToken]);

  useEffect(() => {
    const unsub = subscribeMarketTicks(
      symbol,
      marketMeta.pip,
      (_tick, history) => {
        setTicks(history);
      },
      (status) => setWsStatus(status)
    );
    return unsub;
  }, [symbol, marketMeta.pip]);

  const digitStats = useMemo(() => {
    const counts = Array(10).fill(0);
    for (const t of ticks) {
      if (t.lastDigit >= 0 && t.lastDigit <= 9) counts[t.lastDigit] += 1;
    }
    const total = ticks.length || 1;
    return counts.map((count, digit) => ({
      digit,
      count,
      pct: Math.round((count / total) * 100),
    }));
  }, [ticks]);

  const evenPct = useMemo(() => {
    if (!ticks.length) return 50;
    const evens = ticks.filter((t) => t.lastDigit % 2 === 0).length;
    return Math.round((evens / ticks.length) * 100);
  }, [ticks]);

  const latestTick = ticks[ticks.length - 1];

  const handleVerifyToken = async () => {
    setVerifying(true);
    setTokenError('');
    const res = await verifyDerivToken(tokenInput);
    setVerifying(false);
    if (!res.ok) {
      setAccountInfo(null);
      setTokenError(res.error || 'Token check failed.');
      return;
    }
    onSaveDerivToken(tokenInput.trim());
    setAccountInfo({
      balance: res.balance || 0,
      currency: res.currency || 'USD',
      isVirtual: Boolean(res.isVirtual),
      loginid: res.loginid || '',
    });
  };

  const recordTrade = async (profit: number, stakeAmt: number) => {
    if (!userId) return;
    try {
      await addDoc(collection(db, 'tradeLogs'), {
        userId,
        botId: selectedBot.id,
        botName: selectedBot.name.slice(0, 100),
        market: symbol,
        contract: contractType,
        stake: stakeAmt,
        profit,
        accountType: accountInfo?.isVirtual === false ? 'real' : 'demo',
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'tradeLogs');
    }
  };

  const executeOneTrade = async () => {
    if (!derivToken.trim()) {
      setRunStatus('Paste and connect your Deriv API token first.');
      setRunning(false);
      runningRef.current = false;
      return;
    }
    if (busyTradeRef.current) return;
    busyTradeRef.current = true;
    const stakeAmt = Math.max(0.35, Number(stake) || 1);
    const needsBarrier = ['DIGITOVER', 'DIGITUNDER', 'DIGITDIFF', 'DIGITMATCH'].includes(contractType);

    setRunStatus(`Executing ${contractType} on ${symbol}...`);
    const res = await executeDerivContract({
      token: derivToken,
      symbol,
      contractType,
      amount: stakeAmt,
      duration: contractType === 'CALL' || contractType === 'PUT' ? 5 : 1,
      barrier: needsBarrier ? barrier : undefined,
    });
    busyTradeRef.current = false;

    if (!res.ok) {
      setRunStatus(res.error || 'Trade failed.');
      setRunning(false);
      runningRef.current = false;
      return;
    }

    const profit = Number(res.profit || 0);
    const nextPnl = Number((sessionPnlRef.current + profit).toFixed(2));
    sessionPnlRef.current = nextPnl;
    setSessionPnl(nextPnl);
    if (accountInfo) {
      setAccountInfo({ ...accountInfo, balance: Number((accountInfo.balance + profit).toFixed(2)) });
    }
    setRunStatus(
      `Contract #${res.contractId} settled: ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`
    );
    await recordTrade(profit, stakeAmt);

    const tp = Math.abs(Number(takeProfit) || 10);
    const sl = Math.abs(Number(stopLoss) || 10);
    if (nextPnl >= tp) {
      setRunStatus(`Take profit target ($${tp}) reached. Bot stopped.`);
      setRunning(false);
      runningRef.current = false;
    } else if (nextPnl <= -sl) {
      setRunStatus(`Stop loss limit (-$${sl}) reached. Bot stopped.`);
      setRunning(false);
      runningRef.current = false;
    }
  };

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      if (runningRef.current && !busyTradeRef.current) {
        executeOneTrade();
      }
    }, 3500);
    return () => clearInterval(interval);
  });

  const toggleRun = () => {
    if (!isBotUnlocked) {
      onUnlockBot(selectedBot);
      return;
    }
    if (running) {
      runningRef.current = false;
      setRunning(false);
      setRunStatus('Bot stopped by user.');
    } else {
      if (!accountInfo && !derivToken.trim()) {
        setRunStatus('Connect a Deriv API token (Demo recommended) before starting.');
        return;
      }
      sessionPnlRef.current = 0;
      setSessionPnl(0);
      runningRef.current = true;
      setRunning(true);
      executeOneTrade();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Market Selector */}
      <div className="flex flex-col gap-4 border-b border-[#E0E3EB] pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-[#1E222D]">
        <div>
          <p className="font-mono text-xs font-medium text-[#787B86]">
            Deriv WebSocket Engine · {wsStatus === 'live' ? 'Live Stream' : wsStatus === 'connecting' ? 'Connecting...' : 'Reconnecting'}
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold text-[#131722] dark:text-[#F0F3FA] sm:text-3xl">
            Automated Runner & Digit Scanner
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            aria-label="Select synthetic market"
            className="h-9 rounded border border-[#E0E3EB] bg-white px-3 text-sm font-medium text-[#131722] focus:border-[#2962FF] focus:outline-none dark:border-[#2A2E39] dark:bg-[#0D1017] dark:text-[#F0F3FA]"
          >
            {DERIV_MARKETS.map((m) => (
              <option key={m.symbol} value={m.symbol}>
                {m.label}
              </option>
            ))}
          </select>

          <div className="rounded border border-[#E0E3EB] bg-white px-3.5 py-1.5 font-mono text-sm tabular-nums dark:border-[#1E222D] dark:bg-[#0D1017]">
            <span className="text-[#787B86]">Quote: </span>
            <span className="font-semibold text-[#131722] dark:text-[#F0F3FA]">
              {latestTick ? latestTick.quote.toFixed(marketMeta.pip) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Split: Scanner Left, Runner Right */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Live Digit Distribution Scanner */}
        <section className="rounded-lg border border-[#E0E3EB] bg-white p-5 lg:col-span-7 dark:border-[#1E222D] dark:bg-[#0D1017]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-[#131722] dark:text-[#F0F3FA]">
                Last 100 Ticks Digit Distribution
              </h2>
              <p className="font-mono text-xs text-[#787B86]">
                Even {evenPct}% · Odd {100 - evenPct}% · Sample {ticks.length} ticks
              </p>
            </div>
            {latestTick && (
              <div className="font-mono text-xs text-[#787B86]">
                Last digit:{' '}
                <strong className="text-base text-[#089981]">{latestTick.lastDigit}</strong>
              </div>
            )}
          </div>

          {/* 10 Digit Bars */}
          <div className="mt-5 grid grid-cols-5 gap-2.5 sm:grid-cols-10">
            {digitStats.map((d) => {
              const isLatest = latestTick?.lastDigit === d.digit;
              const isHot = d.pct >= 14;
              const isCold = d.pct <= 6;
              return (
                <div
                  key={d.digit}
                  className={`flex flex-col items-center rounded border p-2.5 transition-colors ${
                    isLatest
                      ? 'border-[#2962FF] bg-[#2962FF]/10'
                      : 'border-[#E0E3EB] bg-[#F8FAFD] dark:border-[#1E222D] dark:bg-black'
                  }`}
                >
                  <span className="font-mono text-sm font-bold text-[#131722] dark:text-[#F0F3FA]">
                    {d.digit}
                  </span>
                  <div className="my-2 flex h-16 w-2 items-end overflow-hidden rounded-full bg-[#E0E3EB] dark:bg-[#1E222D]">
                    <div
                      className={`w-full transition-all duration-200 ${
                        isHot
                          ? 'bg-[#089981]'
                          : isCold
                            ? 'bg-[#F23645]'
                            : 'bg-[#787B86]'
                      }`}
                      style={{ height: `${Math.min(100, d.pct * 4)}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs tabular-nums text-[#5D606B] dark:text-[#9598A1]">
                    {d.pct}%
                  </span>
                </div>
              );
            })}
          </div>

          {/* Recent Digit Tape */}
          <div className="mt-5 border-t border-[#E0E3EB] pt-4 dark:border-[#1E222D]">
            <p className="mb-2 text-xs font-medium text-[#787B86]">
              Recent Tick Stream (Newest Right)
            </p>
            <div className="flex flex-wrap gap-1.5 font-mono text-xs">
              {ticks.slice(-24).map((t, idx) => (
                <span
                  key={`${t.epoch}-${idx}`}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded border tabular-nums ${
                    t.lastDigit % 2 === 0
                      ? 'border-[#089981]/40 bg-[#089981]/10 text-[#089981]'
                      : 'border-[#E0E3EB] bg-[#F8FAFD] text-[#5D606B] dark:border-[#1E222D] dark:bg-black dark:text-[#9598A1]'
                  }`}
                >
                  {t.lastDigit}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Bot Configuration & Runner */}
        <section className="space-y-4 rounded-lg border border-[#E0E3EB] bg-white p-5 lg:col-span-5 dark:border-[#1E222D] dark:bg-[#0D1017]">
          <div>
            <label htmlFor="bot-select" className="block text-xs font-medium text-[#787B86]">
              Selected Automated Strategy
            </label>
            <select
              id="bot-select"
              value={selectedBot.id}
              onChange={(e) => onSelectBotId(e.target.value)}
              className="mt-1.5 h-9 w-full rounded border border-[#E0E3EB] bg-white px-3 text-sm font-medium text-[#131722] focus:border-[#2962FF] focus:outline-none dark:border-[#2A2E39] dark:bg-black dark:text-[#F0F3FA]"
            >
              {automatedBots.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.name} {bot.builtin || isAdmin || licenses.includes(bot.id) ? '(Unlocked)' : '(Locked)'}
                </option>
              ))}
            </select>
          </div>

          {/* Deriv Token Input */}
          <div className="space-y-2 border-t border-[#E0E3EB] pt-4 dark:border-[#1E222D]">
            <label htmlFor="deriv-token" className="block text-xs font-medium text-[#787B86]">
              Deriv API Token (Demo recommended first)
            </label>
            <div className="flex gap-2">
              <input
                id="deriv-token"
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Paste Deriv Read + Trade token"
                className="h-9 min-w-0 flex-1 rounded border border-[#E0E3EB] bg-white px-3 font-mono text-xs text-[#131722] focus:border-[#2962FF] focus:outline-none dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
              />
              <button
                type="button"
                disabled={verifying}
                onClick={handleVerifyToken}
                className="h-9 rounded border border-[#E0E3EB] bg-[#F8FAFD] px-3.5 text-xs font-medium text-[#131722] hover:border-[#2962FF] disabled:opacity-60 dark:border-[#2A2E39] dark:bg-[#131722] dark:text-[#D1D4DC] whitespace-nowrap shrink-0"
              >
                {verifying ? 'Checking...' : 'Connect'}
              </button>
            </div>
            {accountInfo && (
              <p className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-[#089981]">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                {accountInfo.isVirtual ? 'Demo' : 'Real'} ({accountInfo.loginid}) · {accountInfo.balance.toFixed(2)} {accountInfo.currency}
              </p>
            )}
            {tokenError && <p className="text-xs text-[#F23645]">{tokenError}</p>}
          </div>

          {/* Contract & Risk Controls */}
          <div className="grid grid-cols-2 gap-3 border-t border-[#E0E3EB] pt-4 dark:border-[#1E222D]">
            <div>
              <label htmlFor="contract-type" className="block text-xs font-medium text-[#787B86]">
                Contract Type
              </label>
              <select
                id="contract-type"
                value={contractType}
                onChange={(e) => setContractType(e.target.value as any)}
                className="mt-1 h-9 w-full rounded border border-[#E0E3EB] bg-white px-2.5 text-xs font-medium text-[#131722] dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
              >
                <option value="DIGITOVER">Digit Over</option>
                <option value="DIGITUNDER">Digit Under</option>
                <option value="DIGITEVEN">Digit Even</option>
                <option value="DIGITODD">Digit Odd</option>
                <option value="DIGITDIFF">Digit Differs</option>
                <option value="DIGITMATCH">Digit Matches</option>
                <option value="CALL">Rise (Call)</option>
                <option value="PUT">Fall (Put)</option>
              </select>
            </div>

            <div>
              <label htmlFor="digit-barrier" className="block text-xs font-medium text-[#787B86]">
                Digit Barrier (0-9)
              </label>
              <input
                id="digit-barrier"
                type="number"
                min={0}
                max={9}
                value={barrier}
                onChange={(e) => setBarrier(e.target.value)}
                disabled={!['DIGITOVER', 'DIGITUNDER', 'DIGITDIFF', 'DIGITMATCH'].includes(contractType)}
                className="mt-1 h-9 w-full rounded border border-[#E0E3EB] bg-white px-3 font-mono text-sm text-[#131722] disabled:opacity-50 dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
              />
            </div>

            <div>
              <label htmlFor="stake-amt" className="block text-xs font-medium text-[#787B86]">
                Stake (USD)
              </label>
              <input
                id="stake-amt"
                type="number"
                min={0.35}
                step={0.5}
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="mt-1 h-9 w-full rounded border border-[#E0E3EB] bg-white px-3 font-mono text-sm text-[#131722] dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="tp-amt" className="block text-xs font-medium text-[#787B86]">
                  TP ($)
                </label>
                <input
                  id="tp-amt"
                  type="number"
                  min={1}
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  className="mt-1 h-9 w-full rounded border border-[#E0E3EB] bg-white px-2.5 font-mono text-sm text-[#131722] dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
                />
              </div>
              <div>
                <label htmlFor="sl-amt" className="block text-xs font-medium text-[#787B86]">
                  SL ($)
                </label>
                <input
                  id="sl-amt"
                  type="number"
                  min={1}
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  className="mt-1 h-9 w-full rounded border border-[#E0E3EB] bg-white px-2.5 font-mono text-sm text-[#131722] dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded border border-[#E0E3EB] bg-[#F8FAFD] px-3.5 py-2 text-xs dark:border-[#1E222D] dark:bg-black">
            <span className="text-[#787B86]">Session P&L</span>
            <span
              className={`font-mono text-sm font-semibold tabular-nums ${
                sessionPnl > 0
                  ? 'text-[#089981]'
                  : sessionPnl < 0
                    ? 'text-[#F23645]'
                    : 'text-[#131722] dark:text-[#F0F3FA]'
              }`}
            >
              {sessionPnl >= 0 ? '+' : ''}${sessionPnl.toFixed(2)}
            </span>
          </div>

          <button
            type="button"
            onClick={toggleRun}
            className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors ${
              !isBotUnlocked
                ? 'bg-[#2962FF] text-white hover:bg-[#1E53E5]'
                : running
                  ? 'bg-[#F23645] text-white hover:bg-[#D92B3A]'
                  : 'bg-[#089981] text-white hover:bg-[#06806B]'
            }`}
          >
            {!isBotUnlocked ? (
              'Unlock Strategy to Run'
            ) : running ? (
              <>
                <Square className="h-4 w-4" />
                Stop Bot
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Start Automated Bot
              </>
            )}
          </button>

          <p className="text-xs text-[#787B86]">{runStatus}</p>
        </section>
      </div>

      {/* Execution History Table */}
      <section className="rounded-lg border border-[#E0E3EB] bg-white p-5 dark:border-[#1E222D] dark:bg-[#0D1017]">
        <div className="flex items-center justify-between gap-4 border-b border-[#E0E3EB] pb-3.5 dark:border-[#1E222D]">
          <div>
            <h2 className="font-display text-base font-semibold text-[#131722] dark:text-[#F0F3FA]">
              Recent Bot Trade Logs
            </h2>
            <p className="text-xs text-[#787B86]">
              Synced to your Firebase account whenever a contract settles.
            </p>
          </div>
          {tradeLogs.length > 0 && (
            <span className="font-mono text-xs text-[#787B86]">
              {tradeLogs.length} entries
            </span>
          )}
        </div>

        {tradeLogs.length === 0 ? (
          <div className="py-8 text-center text-sm text-[#787B86]">
            No trades logged yet. Connect a Deriv Demo token and run a contract above to see live execution history.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#E0E3EB] text-xs font-medium text-[#787B86] dark:border-[#1E222D]">
                  <th className="py-2 pr-4">Strategy</th>
                  <th className="py-2 pr-4">Market</th>
                  <th className="py-2 pr-4">Contract</th>
                  <th className="py-2 pr-4">Mode</th>
                  <th className="py-2 pr-4 text-right">Stake</th>
                  <th className="py-2 text-right">Profit / Loss</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E0E3EB] font-mono text-xs tabular-nums dark:divide-[#1E222D]">
                {tradeLogs.slice(0, 15).map((log) => (
                  <tr key={log.id} className="hover:bg-[#F8FAFD] dark:hover:bg-black/60">
                    <td className="py-2.5 pr-4 font-sans font-medium text-[#131722] dark:text-[#F0F3FA]">
                      {log.botName}
                    </td>
                    <td className="py-2.5 pr-4 text-[#787B86]">{log.market}</td>
                    <td className="py-2.5 pr-4 text-[#787B86]">{log.contract}</td>
                    <td className="py-2.5 pr-4 uppercase text-[#787B86]">{log.accountType}</td>
                    <td className="py-2.5 pr-4 text-right text-[#131722] dark:text-[#D1D4DC]">
                      ${log.stake.toFixed(2)}
                    </td>
                    <td
                      className={`py-2.5 text-right font-semibold ${
                        log.profit >= 0 ? 'text-[#089981]' : 'text-[#F23645]'
                      }`}
                    >
                      {log.profit >= 0 ? '+' : ''}${log.profit.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
