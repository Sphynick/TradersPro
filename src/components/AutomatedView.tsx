import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  ExternalLink,
  FileCode2,
  KeyRound,
  Play,
  ShieldAlert,
  Square,
  Wallet,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { createAiBot } from '../lib/aiBot';
import { connectDerivAuto, DERIV_APP_ID, DERIV_OAUTH_URL, type DerivClient } from '../lib/derivClient';
import { createRulesBot } from '../lib/rulesBot';
import { describeRules } from '../lib/rulesCore';
import * as LIB from '../lib/scannerCore';
import { openEntry, vaultText, type VaultEntry } from '../lib/vaultCore';
import type { CatalogItem, DerivAccountInfo, TradeLogEntry, UserProfile } from '../types/app';

interface AutomatedViewProps {
  catalog: CatalogItem[];
  user: UserProfile | null;
  selectedBotId: string | null;
  onSelectBot: (id: string) => void;
  derivToken: string;
  onSetDerivToken: (tok: string) => void;
  derivAccount: DerivAccountInfo | null;
  onSetDerivAccount: (acc: DerivAccountInfo | null) => void;
  onAddTrade: (t: TradeLogEntry) => void;
  onRunningChange: (running: boolean) => void;
  onBuy: (item: CatalogItem) => void;
  onRequireAuth: () => void;
}

export function AutomatedView({
  catalog,
  user,
  selectedBotId,
  onSelectBot,
  derivToken,
  onSetDerivToken,
  derivAccount,
  onSetDerivAccount,
  onAddTrade,
  onRunningChange,
  onBuy,
  onRequireAuth,
}: AutomatedViewProps) {
  const autoBots = catalog.filter((c) => c.section === 'automated' || c.kind === 'builtin' || c.kind === 'strategy');
  const activeId = selectedBotId && autoBots.some((b) => b.id === selectedBotId) ? selectedBotId : autoBots[0]?.id || 'engine-ai';
  const activeBot = autoBots.find((b) => b.id === activeId) || autoBots[0];

  const [accountPref, setAccountPref] = useState<'demo' | 'real'>('demo');
  const [stake, setStake] = useState(0.5);
  const [stopLoss, setStopLoss] = useState(10);
  const [takeProfit, setTakeProfit] = useState(15);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState('');
  const [showRealConfirm, setShowRealConfirm] = useState(false);

  // Live runner telemetry state
  const [sessionState, setSessionState] = useState({ pnl: 0, wins: 0, losses: 0, trades: 0, open: 'none', market: '-' });
  const [aiRows, setAiRows] = useState<Array<{ symbol: string; ticks: number; score: number; label: string | null }>>([]);
  const [aiHeadline, setAiHeadline] = useState('Ready to scan markets');
  const [aiLiveProfit, setAiLiveProfit] = useState<number | null>(null);
  const [logs, setLogs] = useState<Array<{ id: string; time: string; msg: string; level: string }>>([]);
  const [recentTrades, setRecentTrades] = useState<TradeLogEntry[]>([]);
  const [xmlPreview, setXmlPreview] = useState('');

  const clientRef = useRef<DerivClient | null>(null);
  const runnerRef = useRef<{ start: () => Promise<void>; stop: () => Promise<void> } | null>(null);

  const licenses = new Set(user?.licenses || []);
  const unlocked = activeBot && (activeBot.id === 'engine-ai' || !activeBot.locked || user?.isAdmin || licenses.has(activeBot.id));

  const appendLog = (msg: string, level = 'info') => {
    const entry = { id: Math.random().toString(36).slice(2), time: new Date().toLocaleTimeString(), msg, level };
    setLogs((prev) => [entry, ...prev].slice(0, 80));
  };

  useEffect(() => {
    return () => {
      try {
        void runnerRef.current?.stop();
      } catch {}
      try {
        clientRef.current?.close();
      } catch {}
    };
  }, []);

  const stopBot = async () => {
    setRunning(false);
    onRunningChange(false);
    try {
      await runnerRef.current?.stop();
    } catch {}
    try {
      clientRef.current?.close();
    } catch {}
    runnerRef.current = null;
    clientRef.current = null;
  };

  const launchBot = async (skipRealWarn = false) => {
    if (!activeBot) return;
    if (activeBot.id !== 'engine-ai' && !user) return onRequireAuth();
    if (!unlocked) return onBuy(activeBot);
    if (!derivToken.trim()) {
      setErr('Connect Deriv via OAuth or paste your Deriv API token (Read + Trade only).');
      return;
    }
    if (accountPref === 'real' && !skipRealWarn) {
      setShowRealConfirm(true);
      return;
    }

    setShowRealConfirm(false);
    setErr('');
    setStarting(true);
    setLogs([]);
    setAiRows([]);
    setAiLiveProfit(null);
    setAiHeadline('Connecting to Deriv...');

    try {
      const { client, account } = await connectDerivAuto(derivToken.trim(), accountPref, (traceMsg) =>
        appendLog(traceMsg, 'info')
      );
      clientRef.current = client;
      onSetDerivAccount(account);
      appendLog(
        `Connected ${account.loginid} (${account.is_virtual ? 'DEMO' : 'REAL'} · ${account.balance.toFixed(2)} ${account.currency}).`,
        'ok'
      );

      client.onclose = () => {
        setRunning(false);
        onRunningChange(false);
        appendLog('Connection to Deriv closed.', 'warn');
      };

      let blobUrlToRevoke: string | null = null;
      const ctx: any = {
        client,
        account,
        config: { stake: Number(stake) || 0.5, stopLoss: Number(stopLoss) || 0, takeProfit: Number(takeProfit) || 0 },
        log: appendLog,
        lib: LIB,
        engine: {
          status: () => apiFetch('/engine/status'),
          signals: (mkt: string) => apiFetch(`/engine/signals?mkt=${encodeURIComponent(mkt || 'digits')}`),
        },
        ai: (e: any) => {
          if (e.type === 'scan' && Array.isArray(e.rows)) {
            setAiRows(e.rows);
          } else if (e.type === 'market') {
            setAiHeadline(e.why || `Market locked: ${LIB.marketName(e.symbol)}`);
          } else if (e.type === 'placing' || e.type === 'placed') {
            setAiHeadline(`Active Trade: ${LIB.marketName(e.symbol)} (${e.label}) · Stake ${e.stake}`);
            setAiLiveProfit(0);
          } else if (e.type === 'live') {
            setAiLiveProfit(Number(e.profit));
          } else if (e.type === 'result') {
            setAiLiveProfit(null);
            const tEntry: TradeLogEntry = {
              id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              t: Date.now(),
              symbol: e.symbol || '-',
              botId: activeBot.id,
              botName: activeBot.name,
              stake: Number(stake) || 0.5,
              profit: Number(e.profit) || 0,
              won: !!e.won,
              accountType: account.is_virtual ? 'demo' : 'real',
            };
            setRecentTrades((prev) => [tEntry, ...prev].slice(0, 40));
            onAddTrade(tEntry);
          }
        },
        onState: (s: any) => {
          setSessionState((prev) => ({ ...prev, ...s }));
        },
        finish: () => {
          if (blobUrlToRevoke) URL.revokeObjectURL(blobUrlToRevoke);
          setRunning(false);
          onRunningChange(false);
        },
      };

      let runner: { start: () => Promise<void>; stop: () => Promise<void> };
      if (activeBot.id === 'engine-ai') {
        runner = createAiBot(ctx);
      } else {
        const keyRes = await apiFetch<{ key: string }>(`/license/key?bot=${encodeURIComponent(activeBot.id)}`);
        let entry: VaultEntry | null = null;
        const staticRes = await fetch(`/vault/${encodeURIComponent(activeBot.id)}.json`).catch(() => null);
        if (staticRes && staticRes.ok) {
          entry = (await staticRes.json()) as VaultEntry;
        } else {
          entry = await apiFetch<VaultEntry>(`/botfile?id=${encodeURIComponent(activeBot.id)}`);
        }
        if (!entry) throw new Error('Encrypted bot bundle could not be loaded.');
        const opened = await openEntry(entry, keyRes.key);
        if (!opened) throw new Error('Decryption key did not match this bot.');
        const code = vaultText(opened.bytes);

        if (entry.mime === 'application/json' || code.trim().startsWith('{')) {
          const parsed = JSON.parse(code);
          runner = createRulesBot(parsed.rules || parsed, ctx);
        } else {
          const blob = new Blob([code], { type: 'text/javascript' });
          blobUrlToRevoke = URL.createObjectURL(blob);
          const mod = await import(/* @vite-ignore */ blobUrlToRevoke);
          runner = mod.create(ctx);
        }
      }

      runnerRef.current = runner;
      setRunning(true);
      onRunningChange(true);
      await runner.start();
    } catch (e: any) {
      setErr(e?.message || 'Could not start the bot.');
      setRunning(false);
      onRunningChange(false);
      try {
        clientRef.current?.close();
      } catch {}
    } finally {
      setStarting(false);
    }
  };

  const inspectXmlFile = async (file: File) => {
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      if (parsed.trigger && parsed.contract) {
        setXmlPreview(describeRules(parsed));
        return;
      }
    } catch {}
    const blocks = (text.match(/<block /g) || []).length;
    setXmlPreview(`Loaded XML file "${file.name}" (${blocks} Deriv Bot blocks). To run XML files, import into bot.deriv.com or convert rules in Admin Bot Studio.`);
  };

  const oauthHref = `${DERIV_OAUTH_URL}?app_id=${encodeURIComponent(DERIV_APP_ID)}&l=EN&brand=traderspro254`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Automated Trading Runner</h1>
          <p className="text-xs text-slate-500 dark:text-[#787B86] mt-0.5">
            Runs straight in your browser over Deriv&apos;s official WebSocket. Your token stays on this device only.
          </p>
        </div>

        {running && (
          <button
            type="button"
            onClick={() => void stopBot()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#F23645] hover:bg-[#D92D3C] text-white text-sm font-bold shadow-lg shrink-0"
          >
            <Square className="w-4 h-4 fill-current" />
            STOP TRADING NOW
          </button>
        )}
      </div>

      {err && (
        <div className="p-3.5 rounded-xl bg-[#F23645]/10 border border-[#F23645]/30 text-xs text-[#F23645] flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{err}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Setup Column */}
        <div className="lg:col-span-5 space-y-4">
          {/* Deriv Connection Box */}
          <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <KeyRound className="w-4 h-4 text-[#2962FF]" />
                1. Connect Deriv Account
              </div>
              <a
                href={oauthHref}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2962FF] hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Connect via Deriv OAuth
              </a>
            </div>

            <input
              type="password"
              value={derivToken}
              disabled={running}
              onChange={(e) => onSetDerivToken(e.target.value)}
              placeholder="Paste Deriv API token (Read + Trade scopes)"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs text-slate-900 dark:text-white font-mono"
            />

            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-[#1E222D] p-0.5 bg-slate-50 dark:bg-black">
                <button
                  type="button"
                  disabled={running}
                  onClick={() => setAccountPref('demo')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold ${
                    accountPref === 'demo' ? 'bg-[#089981] text-white' : 'text-slate-500 dark:text-[#787B86]'
                  }`}
                >
                  Demo First
                </button>
                <button
                  type="button"
                  disabled={running}
                  onClick={() => setAccountPref('real')}
                  className={`px-3 py-1 rounded-md text-xs font-semibold ${
                    accountPref === 'real' ? 'bg-amber-500 text-black' : 'text-slate-500 dark:text-[#787B86]'
                  }`}
                >
                  Real Account
                </button>
              </div>

              {derivAccount && (
                <div className="inline-flex items-center gap-1.5 text-xs font-mono tabular-nums text-slate-900 dark:text-white">
                  <Wallet className="w-3.5 h-3.5 text-[#2962FF]" />
                  <span>{derivAccount.loginid}</span>
                  <span className="font-bold">
                    {derivAccount.balance.toFixed(2)} {derivAccount.currency}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Bot + Risk Settings */}
          <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <Bot className="w-4 h-4 text-[#2962FF]" />
              2. Pick Strategy &amp; Risk Limits
            </div>

            <select
              value={activeId}
              disabled={running}
              onChange={(e) => onSelectBot(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs font-semibold text-slate-900 dark:text-white"
            >
              {autoBots.map((b) => {
                const isOwn = b.id === 'engine-ai' || !b.locked || user?.isAdmin || licenses.has(b.id);
                return (
                  <option key={b.id} value={b.id}>
                    {b.name} {isOwn ? '(Unlocked)' : '(Locked)'}
                  </option>
                );
              })}
            </select>

            {activeBot && (
              <p className="text-[11px] text-slate-500 dark:text-[#787B86] leading-relaxed">{activeBot.desc}</p>
            )}

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-[#787B86] mb-1">Stake ($)</label>
                <input
                  type="number"
                  min={0.35}
                  step={0.05}
                  disabled={running}
                  value={stake}
                  onChange={(e) => setStake(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-[#787B86] mb-1">Stop Loss ($)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  disabled={running}
                  value={stopLoss}
                  onChange={(e) => setStopLoss(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-[#787B86] mb-1">Take Profit ($)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  disabled={running}
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {!running ? (
              unlocked ? (
                <button
                  type="button"
                  disabled={starting}
                  onClick={() => void launchBot(false)}
                  className="w-full py-2.5 rounded-xl bg-[#2962FF] hover:bg-[#1E53E5] disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {starting ? 'Starting Bot...' : 'Start Automated Trading'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => activeBot && onBuy(activeBot)}
                  className="w-full py-2.5 rounded-xl bg-[#2962FF] hover:bg-[#1E53E5] text-white text-sm font-bold"
                >
                  Unlock {activeBot?.name}
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => void stopBot()}
                className="w-full py-2.5 rounded-xl bg-[#F23645] hover:bg-[#D92D3C] text-white text-sm font-bold flex items-center justify-center gap-2"
              >
                <Square className="w-4 h-4 fill-current" />
                Stop Trading
              </button>
            )}
          </div>

          {/* Local XML / Rules Inspector */}
          <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-2">
            <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-[#D1D4DC] cursor-pointer">
              <span className="inline-flex items-center gap-1.5">
                <FileCode2 className="w-4 h-4 text-[#2962FF]" />
                Inspect local Deriv .xml / Rules .json
              </span>
              <input
                type="file"
                accept=".xml,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void inspectXmlFile(f);
                }}
              />
              <span className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#1E222D] text-[11px] text-[#2962FF]">
                Choose File
              </span>
            </label>
            {xmlPreview && <p className="text-[11px] text-slate-500 dark:text-[#787B86] leading-relaxed">{xmlPreview}</p>}
          </div>
        </div>

        {/* Right Live AI Core HUD */}
        <div className="lg:col-span-7 space-y-4">
          {/* Session Stats Strip */}
          <div className="grid grid-cols-4 gap-2.5">
            <div className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-3">
              <div className="text-[11px] text-slate-500 dark:text-[#787B86]">Session P&amp;L</div>
              <div
                className={`font-mono text-base font-bold tabular-nums mt-0.5 ${
                  sessionState.pnl >= 0 ? 'text-[#089981]' : 'text-[#F23645]'
                }`}
              >
                {sessionState.pnl >= 0 ? '+' : ''}
                {sessionState.pnl.toFixed(2)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-3">
              <div className="text-[11px] text-slate-500 dark:text-[#787B86]">Wins / Losses</div>
              <div className="font-mono text-base font-bold tabular-nums mt-0.5 text-slate-900 dark:text-white">
                <span className="text-[#089981]">{sessionState.wins}</span> /{' '}
                <span className="text-[#F23645]">{sessionState.losses}</span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-3">
              <div className="text-[11px] text-slate-500 dark:text-[#787B86]">Trades</div>
              <div className="font-mono text-base font-bold tabular-nums mt-0.5 text-slate-900 dark:text-white">
                {sessionState.trades}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-3">
              <div className="text-[11px] text-slate-500 dark:text-[#787B86]">Live Contract</div>
              <div
                className={`font-mono text-base font-bold tabular-nums mt-0.5 ${
                  aiLiveProfit === null ? 'text-slate-400' : aiLiveProfit >= 0 ? 'text-[#089981]' : 'text-[#F23645]'
                }`}
              >
                {aiLiveProfit === null ? 'Idle' : `${aiLiveProfit >= 0 ? '+' : ''}${aiLiveProfit.toFixed(2)}`}
              </div>
            </div>
          </div>

          {/* Live Market Scanner Matrix */}
          <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white">AI Core Live Read</span>
              <span className="text-[11px] text-[#2962FF] font-medium truncate">{aiHeadline}</span>
            </div>

            {aiRows.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 dark:text-[#787B86]">
                Press Start to stream live ticks across all 10 Volatility indices.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {aiRows.map((r) => (
                  <div
                    key={r.symbol}
                    className="rounded-xl border border-slate-100 dark:border-[#1E222D] bg-slate-50 dark:bg-black px-3 py-2 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white truncate">{LIB.marketName(r.symbol)}</div>
                      <div className="text-[11px] text-slate-500 dark:text-[#787B86] truncate">
                        {r.label || `${r.ticks} ticks`}
                      </div>
                    </div>
                    <div className="w-16 h-1.5 rounded-full bg-slate-200 dark:bg-[#1E222D] overflow-hidden shrink-0">
                      <div
                        className="h-full bg-[#2962FF] transition-all"
                        style={{ width: `${Math.round(Math.min(1, r.score) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Trades & Live Activity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4">
              <div className="text-xs font-bold text-slate-900 dark:text-white mb-2">Recent Trades</div>
              {recentTrades.length === 0 ? (
                <div className="text-xs text-slate-400 dark:text-[#787B86] py-4">No settled trades in this run yet.</div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {recentTrades.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-[#1E222D]/60">
                      <span className="font-medium text-slate-800 dark:text-[#D1D4DC]">{LIB.marketName(t.symbol)}</span>
                      <span className={`font-mono font-bold tabular-nums ${t.won ? 'text-[#089981]' : 'text-[#F23645]'}`}>
                        {t.profit >= 0 ? '+' : ''}
                        {t.profit.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4">
              <div className="text-xs font-bold text-slate-900 dark:text-white mb-2">Execution Log</div>
              <div className="space-y-1 max-h-48 overflow-y-auto font-mono text-[11px]">
                {logs.length === 0 ? (
                  <div className="text-slate-400 dark:text-[#787B86]">Waiting for start...</div>
                ) : (
                  logs.map((l) => (
                    <div
                      key={l.id}
                      className={
                        l.level === 'error'
                          ? 'text-[#F23645]'
                          : l.level === 'warn'
                          ? 'text-amber-500'
                          : l.level === 'ok'
                          ? 'text-[#089981]'
                          : 'text-slate-600 dark:text-[#B2B5BE]'
                      }
                    >
                      <span className="opacity-50 mr-1.5">{l.time}</span>
                      {l.msg}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Real Account Safety Modal */}
      {showRealConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="w-full max-w-sm rounded-2xl border border-amber-500/40 bg-white dark:bg-[#0D1017] p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
              <ShieldAlert className="w-5 h-5" />
              Real Account Confirmation
            </div>
            <p className="text-xs text-slate-600 dark:text-[#B2B5BE]">
              You selected <strong>Real Money</strong> instead of Demo. Losses are real and final. Make sure your Stop Loss (${stopLoss}) is set to an amount you are comfortable risking.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAccountPref('demo');
                  setShowRealConfirm(false);
                }}
                className="py-2 rounded-xl bg-[#089981] text-white text-xs font-semibold"
              >
                Switch to Demo
              </button>
              <button
                type="button"
                onClick={() => void launchBot(true)}
                className="py-2 rounded-xl border border-amber-500 text-amber-600 dark:text-amber-400 text-xs font-semibold"
              >
                Continue Real
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
