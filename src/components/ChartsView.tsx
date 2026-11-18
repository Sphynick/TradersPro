import { useEffect, useRef, useState } from 'react';
import { DERIV_MARKETS } from '../data/catalog.ts';
import { subscribeMarketCandles, type CandlePoint } from '../services/derivWs.ts';

interface ChartsViewProps {
  theme: 'light' | 'dark';
}

const TIMEFRAMES = [
  { label: '1m', sec: 60 },
  { label: '5m', sec: 300 },
  { label: '15m', sec: 900 },
  { label: '1h', sec: 3600 },
];

export function ChartsView({ theme }: ChartsViewProps) {
  const [symbol, setSymbol] = useState('R_100');
  const [granularity, setGranularity] = useState(60);
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [status, setStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const marketMeta = DERIV_MARKETS.find((m) => m.symbol === symbol) || DERIV_MARKETS[4];

  useEffect(() => {
    const unsub = subscribeMarketCandles(
      symbol,
      granularity,
      (data) => setCandles(data),
      (st) => setStatus(st)
    );
    return unsub;
  }, [symbol, granularity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const isDark = theme === 'dark';
    const bg = isDark ? '#000000' : '#FFFFFF';
    const gridColor = isDark ? 'rgba(42, 46, 57, 0.55)' : 'rgba(224, 227, 235, 0.9)';
    const axisText = isDark ? '#787B86' : '#5D606B';
    const bullColor = '#089981';
    const bearColor = '#F23645';

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const padLeft = 14;
    const padRight = 78;
    const padTop = 26;
    const padBottom = 34;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    let minP = Infinity;
    let maxP = -Infinity;
    let maxRange = 0.0001;
    for (const c of candles) {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
      const r = c.high - c.low;
      if (r > maxRange) maxRange = r;
    }
    const padding = (maxP - minP) * 0.12 || 0.01;
    const adjMin = minP - padding;
    const adjMax = maxP + padding * 0.6;
    const span = Math.max(adjMax - adjMin, 0.0001);
    const yOf = (price: number) => padTop + ((adjMax - price) / span) * plotH;

    // Horizontal & vertical subtle grid lines
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.font = '11px "JetBrains Mono", "IBM Plex Mono", monospace';
    ctx.fillStyle = axisText;
    ctx.textAlign = 'left';

    for (let i = 0; i <= 5; i++) {
      const price = adjMax - (span * i) / 5;
      const y = Math.round(yOf(price)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();
      ctx.fillText(price.toFixed(marketMeta.pip), width - padRight + 8, y + 4);
    }

    const step = plotW / candles.length;
    const bodyW = Math.max(3, Math.min(11, step * 0.66));

    // Vertical time guides every 12 bars
    for (let i = 0; i < candles.length; i += 12) {
      const x = Math.round(padLeft + i * step + step / 2) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, height - padBottom);
      ctx.stroke();

      const d = new Date(candles[i].epoch * 1000);
      const label = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      ctx.fillText(label, x - 16, height - 12);
    }

    // Tick-range activity histogram along bottom 14%
    const volMaxH = plotH * 0.16;
    candles.forEach((c, idx) => {
      const x = padLeft + idx * step + step / 2;
      const up = c.close >= c.open;
      const barH = Math.max(2, ((c.high - c.low) / maxRange) * volMaxH);
      ctx.fillStyle = up ? 'rgba(8, 153, 129, 0.22)' : 'rgba(242, 54, 69, 0.22)';
      ctx.fillRect(x - bodyW / 2, height - padBottom - barH, bodyW, barH);
    });

    // Candlesticks
    candles.forEach((c, idx) => {
      const x = padLeft + idx * step + step / 2;
      const up = c.close >= c.open;
      const color = up ? bullColor : bearColor;

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.25;

      ctx.beginPath();
      ctx.moveTo(x, yOf(c.high));
      ctx.lineTo(x, yOf(c.low));
      ctx.stroke();

      const top = yOf(Math.max(c.open, c.close));
      const bot = yOf(Math.min(c.open, c.close));
      const h = Math.max(1.5, bot - top);
      ctx.fillRect(x - bodyW / 2, top, bodyW, h);
    });

    // Live Price Dashed Line + Right Axis Price Pill
    const last = candles[candles.length - 1];
    const lastUp = last.close >= last.open;
    const liveColor = lastUp ? bullColor : bearColor;
    const liveY = yOf(last.close);

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = liveColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, liveY);
    ctx.lineTo(width - padRight, liveY);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = liveColor;
    ctx.fillRect(width - padRight + 2, liveY - 10, padRight - 6, 20);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 11px "JetBrains Mono", "IBM Plex Mono", monospace';
    ctx.fillText(last.close.toFixed(marketMeta.pip), width - padRight + 7, liveY + 4);

    // Interactive TradingView Crosshair
    if (mousePos && mousePos.x >= padLeft && mousePos.x <= width - padRight && mousePos.y >= padTop && mousePos.y <= height - padBottom) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = isDark ? 'rgba(209, 212, 220, 0.45)' : 'rgba(19, 23, 34, 0.45)';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(mousePos.x, padTop);
      ctx.lineTo(mousePos.x, height - padBottom);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(padLeft, mousePos.y);
      ctx.lineTo(width - padRight, mousePos.y);
      ctx.stroke();
      ctx.restore();

      const cursorPrice = adjMax - ((mousePos.y - padTop) / plotH) * span;
      ctx.fillStyle = isDark ? '#2A2E39' : '#131722';
      ctx.fillRect(width - padRight + 2, mousePos.y - 10, padRight - 6, 20);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(cursorPrice.toFixed(marketMeta.pip), width - padRight + 7, mousePos.y + 4);
    }

    // Right axis separator line
    ctx.strokeStyle = isDark ? '#1E222D' : '#E0E3EB';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width - padRight, 0);
    ctx.lineTo(width - padRight, height);
    ctx.stroke();
  }, [candles, theme, marketMeta.pip, mousePos]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    const padLeft = 14;
    const padRight = 78;
    const plotW = rect.width - padLeft - padRight;
    const idx = Math.floor(((x - padLeft) / plotW) * candles.length);
    if (idx >= 0 && idx < candles.length) {
      setHoverIdx(idx);
    } else {
      setHoverIdx(null);
    }
  };

  const activeCandle =
    hoverIdx !== null && candles[hoverIdx] ? candles[hoverIdx] : candles[candles.length - 1];
  const prevCandle =
    hoverIdx !== null && hoverIdx > 0
      ? candles[hoverIdx - 1]
      : candles.length > 1
        ? candles[candles.length - 2]
        : null;
  const delta = activeCandle && prevCandle ? activeCandle.close - prevCandle.close : 0;
  const deltaPct = activeCandle && prevCandle && prevCandle.close ? (delta / prevCandle.close) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* TradingView Top Instrument Toolbar */}
      <div className="flex flex-col gap-3 rounded-lg border border-[#E0E3EB] bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between dark:border-[#1E222D] dark:bg-[#0D1017]">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            aria-label="Chart symbol"
            className="h-9 rounded border border-[#E0E3EB] bg-[#F8FAFD] px-3 font-display text-sm font-semibold text-[#131722] focus:border-[#2962FF] focus:outline-none dark:border-[#2A2E39] dark:bg-black dark:text-[#F0F3FA]"
          >
            {DERIV_MARKETS.map((m) => (
              <option key={m.symbol} value={m.symbol}>
                {m.symbol} · {m.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 rounded border border-[#E0E3EB] bg-[#F8FAFD] p-0.5 dark:border-[#1E222D] dark:bg-black">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.sec}
                type="button"
                onClick={() => setGranularity(tf.sec)}
                className={`h-7 rounded px-2.5 font-mono text-xs font-medium transition-colors ${
                  granularity === tf.sec
                    ? 'bg-[#2962FF] text-white'
                    : 'text-[#5D606B] hover:text-[#131722] dark:text-[#787B86] dark:hover:text-[#D1D4DC]'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums">
          <span className="text-[#787B86]">
            {status === 'live' ? 'Live Feed' : status === 'connecting' ? 'Connecting...' : 'Offline'}
          </span>
          {activeCandle && (
            <span className={delta >= 0 ? 'font-semibold text-[#089981]' : 'font-semibold text-[#F23645]'}>
              {activeCandle.close.toFixed(marketMeta.pip)} ({delta >= 0 ? '+' : ''}
              {deltaPct.toFixed(2)}%)
            </span>
          )}
        </div>
      </div>

      {/* TradingView-style Chart Frame */}
      <div className="relative overflow-hidden rounded-lg border border-[#E0E3EB] bg-white dark:border-[#1E222D] dark:bg-black">
        {/* Top-left Floating OHLC Legend */}
        {activeCandle && (
          <div className="pointer-events-none absolute left-3.5 top-2.5 z-10 flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums">
            <span className="font-display font-semibold text-[#131722] dark:text-[#F0F3FA]">
              {marketMeta.label}
            </span>
            <span className="text-[#787B86]">
              O <strong className={activeCandle.close >= activeCandle.open ? 'text-[#089981]' : 'text-[#F23645]'}>{activeCandle.open.toFixed(marketMeta.pip)}</strong>
            </span>
            <span className="text-[#787B86]">
              H <strong className={activeCandle.close >= activeCandle.open ? 'text-[#089981]' : 'text-[#F23645]'}>{activeCandle.high.toFixed(marketMeta.pip)}</strong>
            </span>
            <span className="text-[#787B86]">
              L <strong className={activeCandle.close >= activeCandle.open ? 'text-[#089981]' : 'text-[#F23645]'}>{activeCandle.low.toFixed(marketMeta.pip)}</strong>
            </span>
            <span className="text-[#787B86]">
              C <strong className={activeCandle.close >= activeCandle.open ? 'text-[#089981]' : 'text-[#F23645]'}>{activeCandle.close.toFixed(marketMeta.pip)}</strong>
            </span>
          </div>
        )}

        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            setMousePos(null);
            setHoverIdx(null);
          }}
          className="block h-[470px] w-full cursor-crosshair"
        />
      </div>
    </div>
  );
}
