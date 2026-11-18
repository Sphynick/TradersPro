import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Cpu,
  Globe,
  KeyRound,
  LayoutGrid,
  Loader2,
  Lock,
  Monitor,
  Power,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { formatProductPrice, SPECIAL_PRODUCTS } from '../data/catalog';
import { apiFetch } from '../lib/api';
import type { ActiveRoute, CatalogItem, ForexSignal, Mt5RobotStatus, ServerConfig, UserProfile } from '../types/app';

interface ForexMt5ViewProps {
  tab: 'forex' | 'aiscan' | 'engine' | 'broker';
  onNavigate: (r: ActiveRoute) => void;
  config: ServerConfig | null;
  prices: Record<string, number> | null;
  user: UserProfile | null;
  catalog: CatalogItem[];
  onRequireAuth: () => void;
  onBuySpecial: (id: 'signals' | 'aiscan' | 'engine' | 'xauusd-system' | 'straddle-system') => void;
}

export function ForexMt5View({
  tab,
  onNavigate,
  config,
  prices,
  user,
  onRequireAuth,
  onBuySpecial,
}: ForexMt5ViewProps) {
  // Forex Signals state
  const [sigData, setSigData] = useState<{
    paid: boolean;
    subEnd: number;
    free: any;
    signals: ForexSignal[];
    scan?: any[];
    paywall?: boolean;
  } | null>(null);
  const [sigLoading, setSigLoading] = useState(false);

  // AI Scanner state
  const [aiStatus, setAiStatus] = useState<{
    left: number;
    freeUsed: boolean;
    last: any[];
    signal?: any;
    markets?: any[];
    paywall?: boolean;
    errors?: string[];
  } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Market Engine state
  const [engStatus, setEngStatus] = useState<any>(null);
  const [engSignals, setEngSignals] = useState<any[]>([]);
  const [engMkt, setEngMkt] = useState('');

  // MT5 Broker & Control state
  const [brokerInfo, setBrokerInfo] = useState<any>(null);
  const [eaBot, setEaBot] = useState<'xauusd-system' | 'straddle-system'>('xauusd-system');
  const [eaData, setEaData] = useState<{ key: string; cfg: any; status: Mt5RobotStatus | null; news?: any } | null>(null);
  const [mt5Login, setMt5Login] = useState('');
  const [brokerName, setBrokerName] = useState('Exness');
  const [mt5Server, setMt5Server] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [mt5Msg, setMt5Msg] = useState('');
  const [err, setErr] = useState('');

  const sigPrice = prices?.signals || SPECIAL_PRODUCTS.signals.defaultPrice;
  const aiPrice = prices?.aiscan || SPECIAL_PRODUCTS.aiscan.defaultPrice;
  const engPrice = prices?.engine || SPECIAL_PRODUCTS.engine.defaultPrice;

  const loadSignals = async (scan = false) => {
    setErr('');
    setSigLoading(true);
    try {
      const d = await apiFetch(scan ? '/signals/scan' : '/signals', { method: scan ? 'POST' : 'GET' });
      setSigData(d);
    } catch (e: any) {
      setErr(e?.message || 'Could not load signals.');
      if (e?.data?.paywall) setSigData(e.data);
    } finally {
      setSigLoading(false);
    }
  };

  const loadAi = async (scan = false) => {
    setErr('');
    setAiLoading(true);
    try {
      const d = await apiFetch(scan ? '/ai/scan' : '/ai/status', { method: scan ? 'POST' : 'GET' });
      setAiStatus(d);
    } catch (e: any) {
      setErr(e?.message || 'Could not run AI scan.');
      if (e?.data?.paywall) setAiStatus(e.data);
    } finally {
      setAiLoading(false);
    }
  };

  const loadEngine = async () => {
    setErr('');
    try {
      const pub = await apiFetch(user ? '/engine/status' : '/engine/public');
      setEngStatus(pub);
      if (user && pub.paid) {
        const list = await apiFetch(`/engine/signals?mkt=${encodeURIComponent(engMkt)}`);
        setEngSignals(list.signals || []);
      }
    } catch (e: any) {
      setErr(e?.message || 'Could not load Market Engine.');
    }
  };

  const loadBroker = async () => {
    if (!user) return;
    setErr('');
    try {
      const brk = await apiFetch('/broker');
      setBrokerInfo(brk);
      if (brk.broker) {
        setMt5Login(brk.broker.login || '');
        setBrokerName(brk.broker.name || 'Exness');
        setMt5Server(brk.broker.server || '');
      }
      if (brk.has?.[eaBot] || user.isAdmin) {
        const ea = await apiFetch(`/ea/control?bot=${encodeURIComponent(eaBot)}`);
        setEaData(ea);
      } else {
        setEaData(null);
      }
    } catch (e: any) {
      setErr(e?.message || 'Could not load MT5 status.');
    }
  };

  useEffect(() => {
    setErr('');
    if (tab === 'forex' && user) void loadSignals(false);
    if (tab === 'aiscan' && user) void loadAi(false);
    if (tab === 'engine') void loadEngine();
    if (tab === 'broker' && user) void loadBroker();
  }, [tab, user?.uid, eaBot, engMkt]);

  const saveBroker = async () => {
    setErr('');
    setMt5Msg('');
    try {
      await apiFetch('/broker', {
        method: 'POST',
        json: { login: mt5Login, name: brokerName, server: mt5Server },
      });
      setMt5Msg('MT5 login and broker saved.');
      void loadBroker();
    } catch (e: any) {
      setErr(e?.message || 'Could not save MT5 broker.');
    }
  };

  const updateEaCfg = async (patch: any) => {
    if (!eaData) return;
    setErr('');
    try {
      const res = await apiFetch(`/ea/control?bot=${encodeURIComponent(eaBot)}`, {
        method: 'POST',
        json: { cfg: { ...eaData.cfg, ...patch } },
      });
      setEaData(res);
    } catch (e: any) {
      setErr(e?.message || 'Could not update robot settings.');
    }
  };

  const sendEaCmd = async (cmd: { op: 'close' | 'closeProfit' | 'closeLoss'; ticket?: string }) => {
    setErr('');
    try {
      const res = await apiFetch(`/ea/control?bot=${encodeURIComponent(eaBot)}`, {
        method: 'POST',
        json: { cmd },
      });
      setEaData(res);
      setMt5Msg('Command queued for your MT5 EA (executes on next WebRequest tick).');
    } catch (e: any) {
      setErr(e?.message || 'Could not queue command.');
    }
  };

  const rotateEaKey = async () => {
    try {
      const res = await apiFetch(`/ea/control?bot=${encodeURIComponent(eaBot)}`, {
        method: 'POST',
        json: { newKey: true },
      });
      setEaData(res);
      setMt5Msg('New EA key generated. Paste it into your MT5 chart inputs.');
    } catch (e: any) {
      setErr(e?.message || 'Could not generate new key.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-[#1E222D] pb-3">
        {[
          { id: 'forex' as const, label: 'SMC/ICT Signals', icon: Globe },
          { id: 'aiscan' as const, label: 'Top-Down AI Scanner', icon: Cpu },
          { id: 'engine' as const, label: 'Market Engine', icon: LayoutGrid },
          { id: 'broker' as const, label: 'Broker & MT5 Control', icon: Monitor },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onNavigate(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                tab === t.id
                  ? 'bg-[#2962FF] text-white'
                  : 'bg-white dark:bg-[#0D1017] border border-slate-200 dark:border-[#1E222D] text-slate-600 dark:text-[#B2B5BE]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {err && (
        <div className="p-3 rounded-xl bg-[#F23645]/10 border border-[#F23645]/30 text-xs text-[#F23645]">{err}</div>
      )}

      {/* 1. LIVE SMC/ICT SIGNALS */}
      {tab === 'forex' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">SMC/ICT Forex Signals</h1>
              <p className="text-xs text-slate-500 dark:text-[#787B86] mt-0.5">
                {sigData?.paid
                  ? `Active 7-day subscription until ${new Date(sigData.subEnd).toLocaleString()}.`
                  : `Get 1 verified free signal first, or unlock 7 days unlimited for ${formatProductPrice(sigPrice, config, { short: true }).primary}.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {user ? (
                <>
                  <button
                    type="button"
                    disabled={sigLoading}
                    onClick={() => void loadSignals(true)}
                    className="px-4 py-2 rounded-xl bg-[#2962FF] hover:bg-[#1E53E5] text-white text-xs font-semibold disabled:opacity-60"
                  >
                    {sigLoading ? 'Scanning...' : 'Scan Live Signals'}
                  </button>
                  {!sigData?.paid && (
                    <button
                      type="button"
                      onClick={() => onBuySpecial('signals')}
                      className="px-4 py-2 rounded-xl bg-[#089981] hover:bg-[#06806B] text-white text-xs font-semibold"
                    >
                      Unlock 7 Days ({formatProductPrice(sigPrice, config, { short: true }).primary})
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={onRequireAuth}
                  className="px-4 py-2 rounded-xl bg-[#2962FF] text-white text-xs font-semibold"
                >
                  Sign In to Claim Free Signal
                </button>
              )}
            </div>
          </div>

          {sigData?.free?.state === 'active' && sigData.free.sig && !sigData.paid && (
            <div className="rounded-xl border border-[#089981]/40 bg-[#089981]/8 p-4 space-y-2">
              <div className="text-xs font-bold text-[#089981]">Your Free Trial Signal</div>
              <SignalCard s={sigData.free.sig} />
            </div>
          )}

          {sigData?.signals && sigData.signals.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {sigData.signals.map((s, i) => (
                <SignalCard key={s.id || i} s={s} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. TOP-DOWN AI SCANNER */}
      {tab === 'aiscan' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">Top-Down AI Scanner</h1>
              <p className="text-xs text-slate-500 dark:text-[#787B86] mt-0.5">
                4H / 1H / 15M confluence check across Gold, EURUSD, GBPUSD, USDJPY &amp; Oil. Credits left:{' '}
                <strong className="text-slate-900 dark:text-white">{aiStatus?.left ?? user?.aiLeft ?? 0}</strong>{' '}
                {aiStatus && !aiStatus.freeUsed ? '(+ 1 free verified scan available)' : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {user ? (
                <>
                  <button
                    type="button"
                    disabled={aiLoading}
                    onClick={() => void loadAi(true)}
                    className="px-4 py-2 rounded-xl bg-[#2962FF] hover:bg-[#1E53E5] text-white text-xs font-semibold disabled:opacity-60"
                  >
                    {aiLoading ? 'Analyzing Charts...' : 'Run AI Scan'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onBuySpecial('aiscan')}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] text-xs font-semibold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-[#131722]"
                  >
                    Buy 5 Scans ({formatProductPrice(aiPrice, config, { short: true }).primary})
                  </button>
                </>
              ) : (
                <button type="button" onClick={onRequireAuth} className="px-4 py-2 rounded-xl bg-[#2962FF] text-white text-xs font-semibold">
                  Sign In to Scan
                </button>
              )}
            </div>
          </div>

          {aiStatus?.signal && (
            <div className="rounded-xl border border-[#2962FF]/40 bg-white dark:bg-[#0D1017] p-4 space-y-2">
              <div className="text-xs font-bold text-[#2962FF]">Top Setup Found</div>
              <SignalCard s={aiStatus.signal} />
            </div>
          )}

          {aiStatus?.last && aiStatus.last.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-500 dark:text-[#787B86] uppercase">Previous AI Signals</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {aiStatus.last.map((s, i) => (
                  <SignalCard key={i} s={s} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. CLOUD MARKET ENGINE */}
      {tab === 'engine' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">TRADERSPRO Market Engine</h1>
                <span
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                    engStatus?.online ? 'bg-[#089981]/15 text-[#089981]' : 'bg-slate-200 dark:bg-[#1E222D] text-slate-500'
                  }`}
                >
                  {engStatus?.online ? 'ONLINE' : 'STANDBY'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-[#787B86] mt-0.5">
                Server-side scanner tracking FX, Gold, Indices &amp; Digit bias with hourly Gemini AI macro briefs.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadEngine()}
                className="p-2 rounded-xl border border-slate-200 dark:border-[#1E222D] text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              {!engStatus?.paid && (
                <button
                  type="button"
                  onClick={() => onBuySpecial('engine')}
                  className="px-4 py-2 rounded-xl bg-[#2962FF] hover:bg-[#1E53E5] text-white text-xs font-semibold"
                >
                  Unlock Lifetime ({formatProductPrice(engPrice, config, { short: true }).primary})
                </button>
              )}
            </div>
          </div>

          {engStatus?.brief && (
            <div className="rounded-2xl border border-[#2962FF]/30 bg-white dark:bg-[#0D1017] p-4 space-y-2">
              <div className="text-xs font-bold text-[#2962FF]">Hourly AI Macro Brief</div>
              <p className="text-xs text-slate-700 dark:text-[#D1D4DC] leading-relaxed">{engStatus.brief.summary}</p>
              {Array.isArray(engStatus.brief.themes) && (
                <div className="flex flex-wrap gap-1.5">
                  {engStatus.brief.themes.map((t: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#131722] text-[11px] text-slate-600 dark:text-[#B2B5BE]">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {!engStatus?.paid ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-[#2A2E39] p-6 text-center space-y-2">
              <Lock className="w-6 h-6 text-slate-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Live Engine Entries Locked</div>
              <p className="text-xs text-slate-500 dark:text-[#787B86] max-w-md mx-auto">
                Unlock the Market Engine once to view real-time FX, Synthetic &amp; Digit flags and power Engine AI mode on MT5.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-1.5">
                {['', 'fx', 'synth', 'digits'].map((m) => (
                  <button
                    key={m || 'all'}
                    type="button"
                    onClick={() => setEngMkt(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase ${
                      engMkt === m ? 'bg-[#2962FF] text-white' : 'border border-slate-200 dark:border-[#1E222D] text-slate-500'
                    }`}
                  >
                    {m || 'all'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {engSignals.map((s) => (
                  <div key={s.id} className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-3.5 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white">{s.sym} · {s.tf}</span>
                      <span className={`font-bold ${s.dir === 'BUY' ? 'text-[#089981]' : s.dir === 'SELL' ? 'text-[#F23645]' : 'text-[#2962FF]'}`}>
                        {s.dir}
                      </span>
                    </div>
                    {s.why && <div className="text-slate-500 dark:text-[#787B86]">{s.why}</div>}
                    {s.en > 0 && (
                      <div className="font-mono text-[11px] text-slate-700 dark:text-[#D1D4DC]">
                        Entry {s.en} · SL {s.sl} · TP {s.tp1}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. BROKER & MT5 ROBOT CONTROL */}
      {tab === 'broker' && (
        <div className="space-y-4">
          {!user ? (
            <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-6 text-center space-y-3">
              <Monitor className="w-8 h-8 text-[#2962FF] mx-auto" />
              <div className="text-sm font-bold text-slate-900 dark:text-white">Sign in to manage MT5 Robots</div>
              <button type="button" onClick={onRequireAuth} className="px-4 py-2 rounded-xl bg-[#2962FF] text-white text-xs font-semibold">
                Sign In
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {(['xauusd-system', 'straddle-system'] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setEaBot(b)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-semibold ${
                      eaBot === b
                        ? 'bg-[#2962FF] text-white'
                        : 'border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] text-slate-700 dark:text-[#D1D4DC]'
                    }`}
                  >
                    {b === 'xauusd-system' ? 'ChartLord XAUUSD System' : 'ChartLord Straddle System'}
                  </button>
                ))}
              </div>

              {mt5Msg && (
                <div className="p-3 rounded-xl bg-[#089981]/10 border border-[#089981]/30 text-xs text-[#089981]">{mt5Msg}</div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-3">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">MT5 Account Details</div>
                  <input
                    type="text"
                    value={mt5Login}
                    onChange={(e) => setMt5Login(e.target.value)}
                    placeholder="MT5 Account Login (5-12 digits)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs font-mono text-slate-900 dark:text-white"
                  />
                  <select
                    value={brokerName}
                    onChange={(e) => setBrokerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs text-slate-900 dark:text-white"
                  >
                    {(brokerInfo?.brokers || ['Exness', 'HFM', 'XM', 'IC Markets', 'Deriv', 'Other']).map((b: string) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={mt5Server}
                    onChange={(e) => setMt5Server(e.target.value)}
                    placeholder="MT5 Server (optional, e.g. Exness-MT5Real)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => void saveBroker()}
                    className="w-full py-2 rounded-xl bg-[#2962FF] text-white text-xs font-semibold"
                  >
                    Save Broker &amp; Login
                  </button>

                  <div className="pt-2 border-t border-slate-100 dark:border-[#1E222D] text-[11px] text-slate-500 dark:text-[#787B86] space-y-1">
                    <div className="font-semibold text-slate-700 dark:text-[#D1D4DC]">MT5 WebRequest URL</div>
                    <p>In MT5 go to Tools -&gt; Options -&gt; Expert Advisors -&gt; Allow WebRequest for:</p>
                    <code className="block p-1.5 rounded bg-slate-100 dark:bg-black text-[#2962FF] break-all">
                      {typeof window !== 'undefined' ? window.location.origin : ''}
                    </code>
                  </div>
                </div>

                <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-4">
                  {!eaData ? (
                    <div className="py-8 text-center space-y-3">
                      <Lock className="w-7 h-7 text-slate-400 mx-auto" />
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        {eaBot === 'xauusd-system' ? 'ChartLord XAUUSD System' : 'ChartLord Straddle System'} Locked
                      </div>
                      <button
                        type="button"
                        onClick={() => onBuySpecial(eaBot)}
                        className="px-4 py-2 rounded-xl bg-[#2962FF] text-white text-xs font-semibold"
                      >
                        Unlock MT5 Robot ({formatProductPrice(prices?.[eaBot] || 10000, config, { short: true }).primary})
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-[#2962FF]" />
                          <code className="font-mono text-xs font-bold text-slate-900 dark:text-white">{eaData.key}</code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(eaData.key).catch(() => {});
                              setCopiedKey(true);
                              setTimeout(() => setCopiedKey(false), 1500);
                            }}
                            className="text-xs text-[#2962FF] font-semibold inline-flex items-center gap-1"
                          >
                            {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedKey ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => void rotateEaKey()}
                          className="text-[11px] font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        >
                          Rotate Key
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button
                          type="button"
                          onClick={() => void updateEaCfg({ run: !eaData.cfg.run })}
                          className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${
                            eaData.cfg.run ? 'bg-[#089981] text-white' : 'bg-[#F23645] text-white'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                          {eaData.cfg.run ? 'Running' : 'Paused'}
                        </button>
                        {eaBot === 'xauusd-system' && (
                          <select
                            value={eaData.cfg.mode || 'intraday'}
                            onChange={(e) => void updateEaCfg({ mode: e.target.value })}
                            className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs font-semibold text-slate-900 dark:text-white"
                          >
                            <option value="intraday">Intraday</option>
                            <option value="scalp">Scalp Mode</option>
                          </select>
                        )}
                        <input
                          type="number"
                          step={0.01}
                          min={0.01}
                          value={eaData.cfg.lot ?? 0.01}
                          onChange={(e) => void updateEaCfg({ lot: Number(e.target.value) })}
                          className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs font-mono text-slate-900 dark:text-white"
                          title="Lot size"
                        />
                        <button
                          type="button"
                          onClick={() => void sendEaCmd({ op: 'close' })}
                          className="py-2 px-2.5 rounded-xl border border-[#F23645]/40 text-[#F23645] text-xs font-semibold hover:bg-[#F23645]/10"
                        >
                          Close All Trades
                        </button>
                      </div>

                      {eaData.status && (
                        <div className="rounded-xl border border-slate-100 dark:border-[#1E222D] bg-slate-50 dark:bg-black p-3 space-y-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className={eaData.status.online ? 'text-[#089981] font-bold' : 'text-slate-400 font-bold'}>
                              {eaData.status.online ? 'EA ONLINE' : 'EA OFFLINE'} · {eaData.status.state || 'Synced'}
                            </span>
                            <span className="font-mono tabular-nums">
                              Eq ${eaData.status.equity.toFixed(2)} · Today {eaData.status.today >= 0 ? '+' : ''}
                              {eaData.status.today.toFixed(2)}
                            </span>
                          </div>
                          {eaData.status.pos?.length > 0 && (
                            <div className="space-y-1 pt-2 border-t border-slate-200 dark:border-[#1E222D]">
                              {eaData.status.pos.map((p) => (
                                <div key={p.t} className="flex items-center justify-between font-mono">
                                  <span>
                                    #{p.t} {p.s} {p.l} @ {p.o}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className={p.p >= 0 ? 'text-[#089981]' : 'text-[#F23645]'}>
                                      {p.p >= 0 ? '+' : ''}
                                      {p.p.toFixed(2)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => void sendEaCmd({ op: 'close', ticket: p.t })}
                                      className="text-[#F23645] hover:underline"
                                      title="Close ticket"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SignalCard({ s }: { s: ForexSignal }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-3.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-sm text-slate-900 dark:text-white">{s.symbol}</span>
          <span className="text-[11px] font-mono text-slate-500 dark:text-[#787B86]">{s.tf}</span>
        </div>
        <span
          className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
            s.dir === 'BUY' ? 'bg-[#089981]/15 text-[#089981]' : 'bg-[#F23645]/15 text-[#F23645]'
          }`}
        >
          {s.dir} · {s.status}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 font-mono text-[11px] tabular-nums">
        <div>
          <span className="text-slate-400 block">Entry</span>
          <span className="font-bold text-slate-900 dark:text-white">{s.entry}</span>
        </div>
        <div>
          <span className="text-slate-400 block">SL</span>
          <span className="font-bold text-[#F23645]">{s.sl}</span>
        </div>
        <div>
          <span className="text-slate-400 block">TP1</span>
          <span className="font-bold text-[#089981]">{s.tp1}</span>
        </div>
        <div>
          <span className="text-slate-400 block">TP2</span>
          <span className="font-bold text-[#089981]">{s.tp2}</span>
        </div>
      </div>
      {s.event && <div className="text-[11px] text-slate-500 dark:text-[#787B86]">{s.event}</div>}
    </div>
  );
}
