import { useEffect, useState } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { DerivClient, PUBLIC_WS } from '../lib/derivClient';
import { marketName } from '../lib/scannerCore';

const CHART_SYMBOLS = [
  { id: 'R_100', label: 'Volatility 100 Index' },
  { id: 'R_75', label: 'Volatility 75 Index' },
  { id: 'R_50', label: 'Volatility 50 Index' },
  { id: 'R_25', label: 'Volatility 25 Index' },
  { id: 'R_10', label: 'Volatility 10 Index' },
  { id: '1HZ100V', label: 'Volatility 100 (1s)' },
  { id: 'frxXAUUSD', label: 'Gold (XAU/USD)' },
  { id: 'frxEURUSD', label: 'EUR/USD' },
  { id: 'frxGBPUSD', label: 'GBP/USD' },
];

interface CandleBar {
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function ChartsView() {
  const [symbol, setSymbol] = useState('R_100');
  const [granularity, setGranularity] = useState(60);
  const [candles, setCandles] = useState<CandleBar[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    let unsub: (() => Promise<void>) | null = null;
    const client = new DerivClient({ mode: 'public', wsUrl: PUBLIC_WS });
    setLoading(true);

    client
      .connect()
      .then(async () => {
        if (!alive) return;
        const h = await client.send({
          ticks_history: symbol,
          count: 55,
          end: 'latest',
          style: 'candles',
          granularity,
        });
        const initial: CandleBar[] = (h.candles || []).map((c: any) => ({
          epoch: +c.epoch,
          open: +c.open,
          high: +c.high,
          low: +c.low,
          close: +c.close,
        }));
        if (alive) {
          setCandles(initial);
          setLoading(false);
        }
        unsub = await client.subscribe({ ticks_history: symbol, style: 'candles', granularity }, (m, err) => {
          if (!alive || err || !m?.ohlc) return;
          const o = m.ohlc;
          const bar: CandleBar = {
            epoch: Number(o.open_time || o.epoch),
            open: Number(o.open),
            high: Number(o.high),
            low: Number(o.low),
            close: Number(o.close),
          };
          setCandles((prev) => {
            if (!prev.length) return [bar];
            const last = prev[prev.length - 1];
            if (last.epoch === bar.epoch) return [...prev.slice(0, -1), bar];
            return [...prev.slice(-54), bar];
          });
        });
      })
      .catch(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      void unsub?.();
      client.close();
    };
  }, [symbol, granularity]);

  const minLow = candles.length ? Math.min(...candles.map((c) => c.low)) : 0;
  const maxHigh = candles.length ? Math.max(...candles.map((c) => c.high)) : 1;
  const span = maxHigh - minLow || 1e-6;
  const latest = candles[candles.length - 1];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-[#2962FF]" />
          <div>
            <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white">Live Market Charts</h1>
            <p className="text-xs text-slate-500 dark:text-[#787B86]">Real-time candlesticks from Deriv public price feed.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] text-xs font-semibold text-slate-900 dark:text-white"
          >
            {CHART_SYMBOLS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-0.5">
            {[
              { g: 60, label: '1m' },
              { g: 300, label: '5m' },
              { g: 900, label: '15m' },
              { g: 3600, label: '1h' },
            ].map((tf) => (
              <button
                key={tf.g}
                type="button"
                onClick={() => setGranularity(tf.g)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${
                  granularity === tf.g ? 'bg-[#2962FF] text-white' : 'text-slate-500 dark:text-[#787B86]'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TradingView-style Candlestick Panel */}
      <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <div className="font-semibold text-slate-900 dark:text-white">
            {marketName(symbol)} ({symbol})
          </div>
          {latest ? (
            <div className="flex items-center gap-3 font-mono tabular-nums">
              <span className="text-slate-500 dark:text-[#787B86]">H {latest.high}</span>
              <span className="text-slate-500 dark:text-[#787B86]">L {latest.low}</span>
              <span className={`font-bold ${latest.close >= latest.open ? 'text-[#089981]' : 'text-[#F23645]'}`}>
                {latest.close}
              </span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Loading...
            </span>
          )}
        </div>

        <div className="w-full h-72 sm:h-80 bg-slate-50 dark:bg-black rounded-xl border border-slate-100 dark:border-[#1E222D] p-2">
          {candles.length > 0 ? (
            <svg viewBox="0 0 800 280" className="w-full h-full" preserveAspectRatio="none">
              {[0.2, 0.4, 0.6, 0.8].map((r) => (
                <line
                  key={r}
                  x1={0}
                  y1={r * 280}
                  x2={800}
                  y2={r * 280}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-[#1E222D]"
                  strokeWidth="1"
                />
              ))}
              {candles.map((c, idx) => {
                const x = (idx + 0.5) * (800 / candles.length);
                const yHigh = 265 - ((c.high - minLow) / span) * 250;
                const yLow = 265 - ((c.low - minLow) / span) * 250;
                const yOpen = 265 - ((c.open - minLow) / span) * 250;
                const yClose = 265 - ((c.close - minLow) / span) * 250;
                const bull = c.close >= c.open;
                const color = bull ? '#089981' : '#F23645';
                const top = Math.min(yOpen, yClose);
                const height = Math.max(2, Math.abs(yClose - yOpen));
                const bodyW = Math.max(4, 800 / candles.length - 4);
                return (
                  <g key={c.epoch}>
                    <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1.5" />
                    <rect x={x - bodyW / 2} y={top} width={bodyW} height={height} fill={color} rx="1" />
                  </g>
                );
              })}
            </svg>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              {loading ? 'Streaming live candles...' : 'No candles loaded.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
