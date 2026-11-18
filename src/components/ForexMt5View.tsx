import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Lock, Save, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import mt5GoldImg from '../assets/images/mt5_gold_system_1794766567045.jpg';
import { CATALOG_ITEMS, type CatalogItem } from '../data/catalog.ts';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import type { Mt5ConfigRecord, SignalRecord } from '../types/app.ts';

interface ForexMt5ViewProps {
  signals: SignalRecord[];
  mt5Configs: Mt5ConfigRecord[];
  licenses: string[];
  signalSubEnd: number;
  isAdmin: boolean;
  userId: string | null;
  onUnlockItem: (item: CatalogItem) => void;
  onRequireSignIn: () => void;
}

const USD_NEWS_EVENTS = [
  { time: '13:30 UTC', event: 'US Core CPI (m/m)', impact: 'High', note: 'Pause XAUUSD Straddle scalper 15m before & after release.' },
  { time: '13:30 UTC', event: 'US Initial Jobless Claims', impact: 'Medium', note: 'Watch 1H London/NY overlap liquidity sweeps.' },
  { time: '19:00 UTC', event: 'FOMC Rate Statement', impact: 'High', note: 'Intraday trend continuation setups only after spread normalizes.' },
];

export function ForexMt5View({
  signals,
  mt5Configs,
  licenses,
  signalSubEnd,
  isAdmin,
  userId,
  onUnlockItem,
  onRequireSignIn,
}: ForexMt5ViewProps) {
  const hasSignalsAccess = isAdmin || signalSubEnd > Date.now();
  const signalPlanItem = CATALOG_ITEMS.find((i) => i.id === 'signals-monthly')!;
  const xauusdItem = CATALOG_ITEMS.find((i) => i.id === 'xauusd-system')!;
  const straddleItem = CATALOG_ITEMS.find((i) => i.id === 'straddle-system')!;

  const [selectedEa, setSelectedEa] = useState<'xauusd-system' | 'straddle-system'>('xauusd-system');
  const existingConfig = mt5Configs.find((c) => c.eaId === selectedEa);

  const [eaKey, setEaKey] = useState('TP254-GOLD-01');
  const [symbol, setSymbol] = useState('XAUUSD');
  const [mode, setMode] = useState<'intraday' | 'scalping'>('intraday');
  const [lotSize, setLotSize] = useState('0.02');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [mt5ImgFailed, setMt5ImgFailed] = useState(false);

  useEffect(() => {
    if (existingConfig) {
      setEaKey(existingConfig.eaKey);
      setSymbol(existingConfig.symbol);
      setMode(existingConfig.mode);
      setLotSize(String(existingConfig.lotSize));
      setEnabled(existingConfig.enabled);
    } else {
      setEaKey(selectedEa === 'xauusd-system' ? 'TP254-XAU-01' : 'TP254-STRADDLE-01');
      setSymbol('XAUUSD');
      setMode(selectedEa === 'xauusd-system' ? 'intraday' : 'scalping');
      setLotSize('0.01');
      setEnabled(false);
    }
    setSaveMsg('');
  }, [existingConfig, selectedEa]);

  const hasEaAccess = isAdmin || licenses.includes(selectedEa);

  const handleSaveMt5 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      onRequireSignIn();
      return;
    }
    if (!hasEaAccess) {
      onUnlockItem(selectedEa === 'xauusd-system' ? xauusdItem : straddleItem);
      return;
    }
    setSaving(true);
    setSaveMsg('');
    const parsedLot = Math.min(100, Math.max(0.01, Number(lotSize) || 0.01));
    try {
      if (existingConfig) {
        try {
          await updateDoc(doc(db, 'mt5Configs', existingConfig.id), {
            eaKey: eaKey.trim().slice(0, 64) || 'TP254-EA',
            symbol: symbol.trim().toUpperCase().slice(0, 16) || 'XAUUSD',
            mode,
            lotSize: parsedLot,
            enabled,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `mt5Configs/${existingConfig.id}`);
        }
      } else {
        try {
          await addDoc(collection(db, 'mt5Configs'), {
            userId,
            eaId: selectedEa,
            eaKey: eaKey.trim().slice(0, 64) || 'TP254-EA',
            symbol: symbol.trim().toUpperCase().slice(0, 16) || 'XAUUSD',
            mode,
            lotSize: parsedLot,
            enabled,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, 'mt5Configs');
        }
      }
      setSaveMsg('MT5 Expert Advisor settings saved to Firestore.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Live SMC/ICT Signals Section */}
      <section className="space-y-5">
        <div className="flex flex-col gap-3 border-b border-[#E0E3EB] pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-[#1E222D]">
          <div>
            <p className="font-mono text-xs font-medium text-[#787B86]">
              SMC / ICT Market Structure
            </p>
            <h1 className="font-display mt-1 text-2xl font-bold text-[#131722] dark:text-[#F0F3FA] sm:text-3xl">
              Live Forex Signals & MT5 Control
            </h1>
          </div>

          {!hasSignalsAccess && (
            <button
              type="button"
              onClick={() => onUnlockItem(signalPlanItem)}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#2962FF] px-4 text-xs font-semibold text-white hover:bg-[#1E53E5] whitespace-nowrap shrink-0"
            >
              <Lock className="h-3.5 w-3.5" />
              Unlock Signals ($4 / KSh 500)
            </button>
          )}
        </div>

        {signals.length === 0 ? (
          <div className="rounded-lg border border-[#E0E3EB] bg-white p-8 text-center dark:border-[#1E222D] dark:bg-[#0D1017]">
            <p className="text-sm text-[#787B86]">
              No active signals published yet. New SMC/ICT setups published in Firebase appear here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {signals.map((sig) => (
              <article
                key={sig.id}
                className="rounded-lg border border-[#E0E3EB] bg-white p-5 dark:border-[#1E222D] dark:bg-[#0D1017]"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-mono font-semibold text-[#131722] dark:text-[#F0F3FA]">
                    {sig.pair} · {sig.timeframe}
                  </span>
                  <span
                    className={`font-mono font-semibold ${
                      sig.direction === 'BUY' ? 'text-[#089981]' : 'text-[#F23645]'
                    }`}
                  >
                    {sig.direction} · {sig.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>

                <p className="mt-2 text-xs text-[#787B86]">{sig.strategy}</p>

                {hasSignalsAccess ? (
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded border border-[#E0E3EB] bg-[#F8FAFD] p-3 font-mono text-xs tabular-nums dark:border-[#1E222D] dark:bg-black">
                    <div>
                      <span className="block text-[11px] text-[#787B86]">Entry</span>
                      <span className="font-semibold text-[#131722] dark:text-[#F0F3FA]">{sig.entry}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-[#787B86]">Stop Loss</span>
                      <span className="font-semibold text-[#F23645]">{sig.stopLoss}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-[#787B86]">Take Profit</span>
                      <span className="font-semibold text-[#089981]">{sig.takeProfit}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded border border-[#E0E3EB] bg-[#F8FAFD] p-3 text-xs text-[#787B86] dark:border-[#1E222D] dark:bg-black">
                    Entry, SL, and TP levels are locked. Unlock Forex Signals to view live trade parameters.
                  </div>
                )}

                {sig.notes && (
                  <p className="mt-3 text-xs leading-relaxed text-[#5D606B] dark:text-[#9598A1]">
                    {hasSignalsAccess ? sig.notes : 'SMC liquidity setup note hidden until signal access is active.'}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* MT5 Expert Advisor Remote Control + News Calendar */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="rounded-lg border border-[#E0E3EB] bg-white p-5 lg:col-span-7 dark:border-[#1E222D] dark:bg-[#0D1017]">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <div className="h-44 overflow-hidden rounded border border-[#E0E3EB] bg-black sm:h-full dark:border-[#1E222D]">
                {!mt5ImgFailed ? (
                  <img
                    src={mt5GoldImg}
                    alt="ChartLord XAUUSD Gold MT5 Expert Advisor"
                    referrerPolicy="no-referrer"
                    onError={() => setMt5ImgFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-4 text-center text-xs text-[#787B86]">
                    MT5 Gold Expert Advisor
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleSaveMt5} className="space-y-4 sm:col-span-7">
              <h2 className="font-display flex items-center gap-2 text-base font-semibold text-[#131722] dark:text-[#F0F3FA]">
                <SlidersHorizontal className="h-4 w-4 text-[#2962FF]" />
                MT5 EA Remote Control
              </h2>

              <div>
                <label htmlFor="ea-select" className="block text-xs font-medium text-[#787B86]">
                  Expert Advisor
                </label>
                <select
                  id="ea-select"
                  value={selectedEa}
                  onChange={(e) => setSelectedEa(e.target.value as any)}
                  className="mt-1 h-9 w-full rounded border border-[#E0E3EB] bg-white px-3 text-sm text-[#131722] dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
                >
                  <option value="xauusd-system">ChartLord XAUUSD Auto System</option>
                  <option value="straddle-system">ChartLord Straddle System</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ea-key" className="block text-xs font-medium text-[#787B86]">
                    EA Sync Key
                  </label>
                  <input
                    id="ea-key"
                    type="text"
                    value={eaKey}
                    onChange={(e) => setEaKey(e.target.value)}
                    className="mt-1 h-9 w-full rounded border border-[#E0E3EB] bg-white px-3 font-mono text-xs text-[#131722] dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
                  />
                </div>
                <div>
                  <label htmlFor="ea-lot" className="block text-xs font-medium text-[#787B86]">
                    Lot Size
                  </label>
                  <input
                    id="ea-lot"
                    type="number"
                    min={0.01}
                    max={100}
                    step={0.01}
                    value={lotSize}
                    onChange={(e) => setLotSize(e.target.value)}
                    className="mt-1 h-9 w-full rounded border border-[#E0E3EB] bg-white px-3 font-mono text-sm text-[#131722] dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ea-mode" className="block text-xs font-medium text-[#787B86]">
                    Trading Mode
                  </label>
                  <select
                    id="ea-mode"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as any)}
                    className="mt-1 h-9 w-full rounded border border-[#E0E3EB] bg-white px-3 text-sm text-[#131722] dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
                  >
                    <option value="intraday">Intraday</option>
                    <option value="scalping">Scalping</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => setEnabled((v) => !v)}
                    className={`h-9 w-full rounded border px-3 text-xs font-medium transition-colors ${
                      enabled
                        ? 'border-[#089981] bg-[#089981]/10 text-[#089981]'
                        : 'border-[#E0E3EB] bg-[#F8FAFD] text-[#5D606B] dark:border-[#2A2E39] dark:bg-black dark:text-[#787B86]'
                    }`}
                  >
                    EA Status: {enabled ? 'Running' : 'Paused'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#2962FF] px-4 text-sm font-semibold text-white hover:bg-[#1E53E5] disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {hasEaAccess
                  ? saving
                    ? 'Saving...'
                    : 'Save MT5 Configuration'
                  : 'Unlock EA to Sync'}
              </button>

              {saveMsg && <p className="text-xs text-[#089981]">{saveMsg}</p>}
            </form>
          </div>
        </div>

        {/* Economic News Guard */}
        <div className="rounded-lg border border-[#E0E3EB] bg-white p-5 lg:col-span-5 dark:border-[#1E222D] dark:bg-[#0D1017]">
          <h2 className="font-display text-base font-semibold text-[#131722] dark:text-[#F0F3FA]">
            USD High-Impact News Watch
          </h2>
          <p className="mt-1 text-xs text-[#787B86]">
            Recommended session windows to pause XAUUSD scalping bots.
          </p>

          <div className="mt-4 divide-y divide-[#E0E3EB] dark:divide-[#1E222D]">
            {USD_NEWS_EVENTS.map((ev) => (
              <div key={ev.event} className="py-3.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[#131722] dark:text-[#F0F3FA]">{ev.event}</span>
                  <span className="font-mono text-xs text-[#F59E0B]">
                    {ev.impact} · {ev.time}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[#5D606B] dark:text-[#9598A1]">{ev.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
