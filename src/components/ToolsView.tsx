import { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Clock,
  Compass,
  Loader2,
  Newspaper,
  Radio,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { DerivClient, PUBLIC_WS } from '../lib/derivClient';
import { derivSymbol, eventState, fmtCountdown, IMPACT_GROUP, preLean, reactionSignal, type NewsEvent, type OhlcCandle } from '../lib/newsCore';
import { bestSignal, PO_CATEGORIES, PO_MARKETS, type Candle } from '../lib/poCore';
import { DigitWindow, MarketScanner, marketName, scanRows, SYMBOLS } from '../lib/scannerCore';
import type { ActiveRoute, TradeLogEntry, UserProfile } from '../types/app';

interface ToolsViewProps {
  tab: 'scanner' | 'markets' | 'trades' | 'po' | 'news';
  onNavigate: (r: ActiveRoute) => void;
  tradeHistory: TradeLogEntry[];
  onClearTrades: () => void;
  user: UserProfile | null;
  onRequireAuth: () => void;
}

export function ToolsView({ tab, onNavigate, tradeHistory, onClearTrades, user, onRequireAuth }: ToolsViewProps) {
  // --- DIGIT SCANNER & MARKETS STATE ---
  const [scanMode, setScanMode] = useState<'over-under-ai' | 'digit-match' | 'even-odd' | 'differs' | 'matches' | 'rise-fall'>('over-under-ai');
  const [scanData, setScanData] = useState<Array<{ symbol: string; ticks: number; score: number; label: string | null; price?: number; last?: number }>>([]);
  const [scanConnecting, setScanConnecting] = useState(false);

  // --- POCKET OPTION SCANNER STATE ---
  const [poCat, setPoCat] = useState('all');
  const [poScanning, setPoScanning] = useState(false);
  const [poResult, setPoResult] = useState<ReturnType<typeof bestSignal> | null>(null);
  const [poErr, setPoErr] = useState('');

  // --- NEWS + AI STATE ---
  const [newsEvents, setNewsEvents] = useState<NewsEvent[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsGroup, setNewsGroup] = useState<'impact' | 'non'>('impact');
  const [selectedEvent, setSelectedEvent] = useState<NewsEvent | null>(null);
  const [selectedPair, setSelectedPair] = useState('XAUUSD');
  const [newsReaction, setNewsReaction] = useState<string>('');
  const [newsAiText, setNewsAiText] = useState<string>('');
  const [newsAiLoading, setNewsAiLoading] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Live public scanner for Scanner & Markets tabs
  useEffect(() => {
    if (tab !== 'scanner' && tab !== 'markets') return;
    let alive = true;
    let scanner: MarketScanner | null = null;
    const client = new DerivClient({ mode: 'public', wsUrl: PUBLIC_WS });
    setScanConnecting(true);

    client
      .connect()
      .then(() => {
        if (!alive) return;
        scanner = new MarketScanner(client, SYMBOLS, {
          size: 100,
          onTick: () => {
            if (!alive || !scanner) return;
            const rows = scanRows(scanMode, scanner.windows).map((r) => {
              const w = scanner!.windows.get(r.symbol) as DigitWindow | undefined;
              return { ...r, price: w?.price, last: w?.last };
            });
            setScanData(rows);
          },
        });
        return scanner.start();
      })
      .then(() => {
        if (!alive || !scanner) return;
        setScanConnecting(false);
        setScanData(
          scanRows(scanMode, scanner.windows).map((r) => {
            const w = scanner!.windows.get(r.symbol);
            return { ...r, price: w?.price, last: w?.last };
          })
        );
      })
      .catch(() => setScanConnecting(false));

    return () => {
      alive = false;
      void scanner?.stop();
      client.close();
    };
  }, [tab, scanMode]);

  // Load Economic News
  useEffect(() => {
    if (tab !== 'news') return;
    setNewsLoading(true);
    apiFetch<{ events: NewsEvent[] }>('/news/events')
      .then((d) => setNewsEvents(d.events || []))
      .catch(() => {})
      .finally(() => setNewsLoading(false));
  }, [tab]);

  const runPoScan = async () => {
    setPoScanning(true);
    setPoErr('');
    setPoResult(null);
    const client = new DerivClient({ mode: 'public', wsUrl: PUBLIC_WS });
    try {
      await client.connect();
      const targets = PO_MARKETS.filter((m) => poCat === 'all' || m.cat === poCat).slice(0, 12);
      const results: Array<{ market: typeof targets[number]; candles: Candle[]; candles5?: Candle[] }> = [];
      for (const market of targets) {
        try {
          const h1 = await client.send({ ticks_history: market.id, count: 60, end: 'latest', style: 'candles', granularity: 60 });
          const h5 = await client.send({ ticks_history: market.id, count: 40, end: 'latest', style: 'candles', granularity: 300 });
          const c1: Candle[] = (h1.candles || []).map((c: any) => ({ o: +c.open, h: +c.high, l: +c.low, c: +c.close, t: +c.epoch }));
          const c5: Candle[] = (h5.candles || []).map((c: any) => ({ o: +c.open, h: +c.high, l: +c.low, c: +c.close, t: +c.epoch }));
          if (c1.length >= 40) results.push({ market, candles: c1, candles5: c5 });
        } catch {}
      }
      const best = bestSignal(results);
      if (!best) setPoErr('No strong momentum setup right now. Try All Markets or wait 1 minute.');
      else setPoResult(best);
    } catch (e: any) {
      setPoErr(e?.message || 'Could not scan Deriv public feed.');
    } finally {
      client.close();
      setPoScanning(false);
    }
  };

  const checkNewsReaction = async (ev: NewsEvent, pair: string) => {
    setSelectedEvent(ev);
    setSelectedPair(pair);
    setNewsReaction('Checking live 1-minute candles...');
    setNewsAiText('');
    const client = new DerivClient({ mode: 'public', wsUrl: PUBLIC_WS });
    try {
      await client.connect();
      const res = await client.send({
        ticks_history: derivSymbol(pair),
        count: 45,
        end: 'latest',
        style: 'candles',
        granularity: 60,
      });
      const candles: OhlcCandle[] = (res.candles || []).map((c: any) => ({
        epoch: Number(c.epoch),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      }));
      const sig = reactionSignal(pair, ev, candles, Date.now());
      setNewsReaction(
        sig.status === 'signal'
          ? `${sig.side} ${pair} @ ${sig.fmt(sig.entry)} | SL ${sig.fmt(sig.sl)} | TP1 ${sig.fmt(sig.tp1)} — ${sig.text}`
          : sig.text
      );
    } catch {
      setNewsReaction('Could not load live price candles for ' + pair + '.');
    } finally {
      client.close();
    }
  };

  const askNewsAi = async (ev: NewsEvent) => {
    if (!user) return onRequireAuth();
    setSelectedEvent(ev);
    setNewsAiLoading(true);
    setNewsAiText('');
    try {
      const r = await apiFetch<{ text: string }>('/news/analyze', { method: 'POST', json: { id: ev.id } });
      setNewsAiText(r.text);
    } catch (e: any) {
      setNewsAiText(e?.message || 'AI explanation is not available.');
    } finally {
      setNewsAiLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Sub-tool Switcher */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-[#1E222D] pb-3">
        {[
          { id: 'scanner' as const, label: 'Digit Scanner', icon: Compass },
          { id: 'markets' as const, label: 'Live Markets', icon: Activity },
          { id: 'trades' as const, label: 'Session Trades', icon: TrendingUp },
          { id: 'po' as const, label: 'Broker Signals', icon: Radio },
          { id: 'news' as const, label: 'Economic News', icon: Newspaper },
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
        <button
          type="button"
          onClick={() => onNavigate('charts')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#0D1017] border border-slate-200 dark:border-[#1E222D] text-slate-600 dark:text-[#B2B5BE]"
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Live Charts
        </button>
      </div>

      {/* 1. DIGIT SCANNER */}
      {tab === 'scanner' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">Live Digit Scanner</h1>
              <p className="text-xs text-slate-500 dark:text-[#787B86]">
                Statistical scan across all 10 Deriv Volatility indices (free preview, live ticks).
              </p>
            </div>
            <select
              value={scanMode}
              onChange={(e) => setScanMode(e.target.value as any)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] text-xs font-semibold text-slate-900 dark:text-white"
            >
              <option value="over-under-ai">Over / Under AI</option>
              <option value="digit-match">Matches / Differs AI</option>
              <option value="even-odd">Even / Odd Streak</option>
              <option value="differs">Least Digit (Differs)</option>
              <option value="matches">Hottest Digit (Matches)</option>
              <option value="rise-fall">5-Tick Rise / Fall</option>
            </select>
          </div>

          {scanConnecting && (
            <div className="text-xs text-[#2962FF] flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading 100-tick history across 10 markets...
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {scanData.map((r) => (
              <div
                key={r.symbol}
                className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-900 dark:text-white">{marketName(r.symbol)}</span>
                  <span className="font-mono text-xs text-slate-500 dark:text-[#787B86]">{r.symbol}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono tabular-nums text-slate-800 dark:text-[#D1D4DC]">
                    {r.price !== undefined ? r.price : '—'} (Digit {r.last ?? '-'})
                  </span>
                  <span className={`font-semibold ${r.label ? 'text-[#089981]' : 'text-slate-400'}`}>
                    {r.label || 'Neutral'}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-[#1E222D] overflow-hidden">
                  <div className="h-full bg-[#2962FF]" style={{ width: `${Math.round(r.score * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. LIVE MARKETS */}
      {tab === 'markets' && (
        <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-[#1E222D]">
            <h1 className="font-display text-base font-bold text-slate-900 dark:text-white">Volatility Indices Live Feed</h1>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-[#1E222D]">
            {scanData.map((r) => (
              <div key={r.symbol} className="px-4 py-3 flex items-center justify-between text-xs">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">{marketName(r.symbol)}</div>
                  <div className="text-[11px] text-slate-500 dark:text-[#787B86]">{r.symbol} · {r.ticks} ticks buffered</div>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="font-bold text-slate-900 dark:text-white">{r.price ?? '—'}</div>
                  <div className="text-[11px] text-[#2962FF]">Last digit: {r.last ?? '-'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. SESSION TRADES */}
      {tab === 'trades' && (
        <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-base font-bold text-slate-900 dark:text-white">Session Trade History</h1>
            {tradeHistory.length > 0 && (
              <button type="button" onClick={onClearTrades} className="text-xs font-semibold text-[#F23645] hover:underline">
                Clear History
              </button>
            )}
          </div>
          {tradeHistory.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-[#787B86] py-8 text-center">
              Trades placed by your Automated Bot Runner will appear here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#1E222D] text-slate-500 dark:text-[#787B86]">
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Bot</th>
                    <th className="py-2 pr-3">Market</th>
                    <th className="py-2 pr-3">Mode</th>
                    <th className="py-2 text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1E222D]">
                  {tradeHistory.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2 pr-3 font-mono text-slate-500 dark:text-[#787B86]">
                        {new Date(t.t).toLocaleTimeString()}
                      </td>
                      <td className="py-2 pr-3 font-medium text-slate-900 dark:text-white">{t.botName}</td>
                      <td className="py-2 pr-3 text-slate-700 dark:text-[#D1D4DC]">{marketName(t.symbol)}</td>
                      <td className="py-2 pr-3 uppercase text-[11px]">{t.accountType}</td>
                      <td
                        className={`py-2 text-right font-mono font-bold tabular-nums ${
                          t.won ? 'text-[#089981]' : 'text-[#F23645]'
                        }`}
                      >
                        {t.profit >= 0 ? '+' : ''}
                        {t.profit.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 4. BROKER SIGNALS (POCKET OPTION / QUOTEX / IQ OPTION / OLYMP TRADE) */}
      {tab === 'po' && (
        <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Broker Signals (Pocket Option / Quotex / IQ Option)
              </h1>
              <p className="text-xs text-slate-500 dark:text-[#787B86] mt-0.5">
                Scans public 1-minute &amp; 5-minute EMA + RSI price feed and shows clear entry direction and expiry.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={poCat}
                onChange={(e) => setPoCat(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs font-semibold text-slate-900 dark:text-white"
              >
                {PO_CATEGORIES.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={poScanning}
                onClick={() => void runPoScan()}
                className="px-4 py-2 rounded-xl bg-[#2962FF] hover:bg-[#1E53E5] text-white text-xs font-semibold disabled:opacity-60"
              >
                {poScanning ? 'Scanning...' : 'Scan Markets'}
              </button>
            </div>
          </div>

          {poErr && <div className="text-xs text-amber-500">{poErr}</div>}

          {poResult && (
            <div className="rounded-xl border border-[#2962FF]/40 bg-slate-50 dark:bg-black p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {poResult.market.name}
                </span>
                <span
                  className={`px-3 py-1 rounded-lg text-xs font-bold ${
                    poResult.dir === 'BUY' ? 'bg-[#089981]/15 text-[#089981]' : 'bg-[#F23645]/15 text-[#F23645]'
                  }`}
                >
                  {poResult.dir} · {poResult.expiryMin} min expiry
                </span>
              </div>
              <div className="text-xs text-slate-600 dark:text-[#B2B5BE]">
                Strength: {'★'.repeat(poResult.strength)} · RSI {poResult.rsi.toFixed(1)} · Reference Price {poResult.price}
              </div>
              <ul className="list-disc pl-4 text-xs text-slate-500 dark:text-[#787B86] space-y-0.5">
                {poResult.why.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 5. ECONOMIC NEWS + AI */}
      {tab === 'news' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">Economic News Calendar</h1>
              <p className="text-xs text-slate-500 dark:text-[#787B86]">
                Pre-news lean, post-release 1-minute reaction rule, and plain-English AI explanation.
              </p>
            </div>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-[#1E222D] p-0.5 bg-white dark:bg-[#0D1017]">
              <button
                type="button"
                onClick={() => setNewsGroup('impact')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                  newsGroup === 'impact' ? 'bg-[#2962FF] text-white' : 'text-slate-500 dark:text-[#787B86]'
                }`}
              >
                High / Medium Impact
              </button>
              <button
                type="button"
                onClick={() => setNewsGroup('non')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold ${
                  newsGroup === 'non' ? 'bg-[#2962FF] text-white' : 'text-slate-500 dark:text-[#787B86]'
                }`}
              >
                All Events
              </button>
            </div>
          </div>

          {newsLoading ? (
            <div className="text-xs text-[#2962FF] flex items-center gap-2 py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading calendar...
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 space-y-2.5 max-h-[65vh] overflow-y-auto pr-1">
                {newsEvents
                  .filter((e) => newsGroup === 'non' || IMPACT_GROUP(e.impact) === 'impact')
                  .slice(0, 40)
                  .map((ev) => {
                    const st = eventState(ev, nowMs);
                    const leans = preLean(ev);
                    return (
                      <div
                        key={ev.id}
                        className={`rounded-xl border p-3.5 bg-white dark:bg-[#0D1017] space-y-2 ${
                          selectedEvent?.id === ev.id
                            ? 'border-[#2962FF]'
                            : 'border-slate-200 dark:border-[#1E222D]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="font-bold text-[#2962FF]">{ev.country}</span>
                              <span
                                className={`font-semibold uppercase ${
                                  /high/i.test(ev.impact) ? 'text-[#F23645]' : 'text-amber-500'
                                }`}
                              >
                                {ev.impact}
                              </span>
                              <span className="inline-flex items-center gap-1 text-slate-500 dark:text-[#787B86] font-mono">
                                <Clock className="w-3 h-3" />
                                {st === 'upcoming'
                                  ? `in ${fmtCountdown(ev.ts - nowMs)}`
                                  : st === 'live'
                                  ? 'RELEASE WINDOW LIVE'
                                  : new Date(ev.ts).toLocaleString()}
                              </span>
                            </div>
                            <div className="font-semibold text-sm text-slate-900 dark:text-white mt-0.5">{ev.title}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void askNewsAi(ev)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#2962FF]/12 text-[#2962FF] text-[11px] font-semibold hover:bg-[#2962FF]/20 shrink-0"
                          >
                            <Sparkles className="w-3 h-3" />
                            Explain with AI
                          </button>
                        </div>

                        <div className="text-[11px] text-slate-500 dark:text-[#787B86] flex flex-wrap gap-3 font-mono">
                          <span>Forecast: {ev.forecast || '—'}</span>
                          <span>Previous: {ev.previous || '—'}</span>
                          {ev.actual && <span className="text-[#089981] font-bold">Actual: {ev.actual}</span>}
                        </div>

                        {leans.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {leans.map((l) => (
                              <button
                                key={l.pair}
                                type="button"
                                onClick={() => void checkNewsReaction(ev, l.pair)}
                                className="px-2 py-1 rounded-md border border-slate-200 dark:border-[#1E222D] text-[11px] font-medium text-slate-700 dark:text-[#D1D4DC] hover:border-[#2962FF]"
                              >
                                Check {l.pair} Reaction
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>

              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-3 sticky top-18">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">News Reaction &amp; AI Breakdown</div>
                  {!selectedEvent ? (
                    <p className="text-xs text-slate-500 dark:text-[#787B86]">
                      Select any event on the left to inspect its post-release candle reaction or ask AI to explain what it means for USD &amp; Gold.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-[#2962FF]">
                        {selectedEvent.country} · {selectedEvent.title} ({selectedPair})
                      </div>
                      {newsReaction && (
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-black border border-slate-200 dark:border-[#1E222D] text-xs text-slate-700 dark:text-[#D1D4DC] leading-relaxed">
                          {newsReaction}
                        </div>
                      )}
                      {newsAiLoading ? (
                        <div className="flex items-center gap-2 text-xs text-[#2962FF]">
                          <Loader2 className="w-4 h-4 animate-spin" /> Asking AI analyst...
                        </div>
                      ) : newsAiText ? (
                        <div className="p-3 rounded-xl bg-[#2962FF]/8 border border-[#2962FF]/25 text-xs text-slate-800 dark:text-[#D1D4DC] whitespace-pre-line leading-relaxed">
                          {newsAiText}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
