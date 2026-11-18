import { ArrowRight, Download, Lock, Play, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import heroTradingDeskImg from '../assets/images/hero_trading_desk_1794766567466.jpg';
import {
  CATALOG_ITEMS,
  formatKsh,
  formatUsd,
  generateBotDownloadContent,
  type CatalogItem,
} from '../data/catalog.ts';
import type { ActiveTab, GeoInfo } from '../types/app.ts';

interface CatalogViewProps {
  geo: GeoInfo;
  licenses: string[];
  signalSubEnd: number;
  isAdmin: boolean;
  onUnlock: (item: CatalogItem) => void;
  onNavigate: (tab: ActiveTab) => void;
  onRunAutomated: (item: CatalogItem) => void;
}

type FilterSection = 'all' | 'automated' | 'deriv' | 'forex' | 'signals';

const FILTER_TABS: Array<{ id: FilterSection; label: string }> = [
  { id: 'all', label: 'All Tools' },
  { id: 'automated', label: 'Deriv Automated' },
  { id: 'deriv', label: 'Deriv XML Bots' },
  { id: 'forex', label: 'MT5 Forex EAs' },
  { id: 'signals', label: 'Forex Signals' },
];

export function CatalogView({
  geo,
  licenses,
  signalSubEnd,
  isAdmin,
  onUnlock,
  onNavigate,
  onRunAutomated,
}: CatalogViewProps) {
  const [section, setSection] = useState<FilterSection>('all');
  const [query, setQuery] = useState('');
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const isUnlocked = (item: CatalogItem) => {
    if (!item.locked || item.builtin) return true;
    if (isAdmin) return true;
    if (item.id === 'signals-monthly') return signalSubEnd > Date.now();
    return licenses.includes(item.id);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG_ITEMS.filter((item) => {
      if (section !== 'all' && item.section !== section) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        item.platform.toLowerCase().includes(q)
      );
    });
  }, [section, query]);

  const handleDownload = (item: CatalogItem) => {
    const { filename, content, mime } = generateBotDownloadContent(item);
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-12">
      {/* Storefront Hero */}
      <section className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
        <div className="flex flex-col justify-center space-y-5 lg:col-span-6">
          <p className="font-mono text-xs font-medium tracking-wide text-[#787B86]">
            {geo.isKenya ? 'Kenya Region · M-Pesa & USD' : `${geo.country} Region · PayPal & USD`} · Deriv & MT5 Terminal
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-[#131722] dark:text-[#F0F3FA] sm:text-4xl lg:text-5xl [text-wrap:balance]">
            Precision trading bots, live tick scanners, and MT5 Gold systems.
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-[#5D606B] dark:text-[#9598A1]">
            Execute automated Deriv digit and accumulator strategies directly in your browser, control MT5 Expert Advisors remotely, and follow SMC/ICT setups synced through Firebase.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => onNavigate('automated')}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#2962FF] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#1E53E5] whitespace-nowrap shrink-0"
            >
              Open Bot Runner
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('charts')}
              className="inline-flex h-10 items-center rounded-md border border-[#E0E3EB] bg-white px-5 text-sm font-medium text-[#131722] transition-colors hover:bg-[#F0F3FA] dark:border-[#1E222D] dark:bg-[#0D1017] dark:text-[#D1D4DC] dark:hover:bg-[#131722] whitespace-nowrap shrink-0"
            >
              Open Live Charts
            </button>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="relative h-64 overflow-hidden rounded-lg border border-[#E0E3EB] bg-[#F0F3FA] sm:h-80 lg:h-full lg:min-h-[340px] dark:border-[#1E222D] dark:bg-[#0D1017]">
            {!heroImgFailed ? (
              <img
                src={heroTradingDeskImg}
                alt="Clean trading monitor showing candlestick structure"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#0D1017] p-8 text-center">
                <span className="font-display text-lg font-semibold text-[#D1D4DC]">
                  TRADERSPRO254 Terminal
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Catalog Toolbar */}
      <section className="space-y-6">
        <div className="flex flex-col gap-4 border-b border-[#E0E3EB] pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-[#1E222D]">
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-[#E0E3EB] bg-[#F0F3FA] p-1 dark:border-[#1E222D] dark:bg-[#0D1017]">
            {FILTER_TABS.map((tab) => {
              const active = section === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSection(tab.id)}
                  className={`h-8 rounded px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-white text-[#131722] shadow-sm dark:bg-[#2962FF] dark:text-white'
                      : 'text-[#5D606B] hover:text-[#131722] dark:text-[#787B86] dark:hover:text-[#D1D4DC]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#787B86]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search bots, XML, or EAs..."
              aria-label="Search bots and tools"
              className="h-9 w-full rounded-md border border-[#E0E3EB] bg-white pl-9 pr-3 text-sm text-[#131722] placeholder:text-[#787B86] focus:border-[#2962FF] focus:outline-none dark:border-[#1E222D] dark:bg-[#0D1017] dark:text-[#D1D4DC] dark:focus:border-[#2962FF]"
            />
          </div>
        </div>

        {/* Product Grid */}
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-[#E0E3EB] bg-white p-10 text-center dark:border-[#1E222D] dark:bg-[#0D1017]">
            <p className="text-sm text-[#5D606B] dark:text-[#787B86]">
              No trading tools match "{query}".
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSection('all');
              }}
              className="mt-4 inline-flex h-9 items-center rounded-md border border-[#E0E3EB] px-4 text-xs font-medium text-[#131722] hover:bg-[#F0F3FA] dark:border-[#1E222D] dark:text-[#D1D4DC] dark:hover:bg-[#131722]"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((item) => {
              const open = isUnlocked(item);
              const usdPrice = formatUsd(item.priceKsh, geo.usdKshRate);
              const kshPrice = formatKsh(item.priceKsh);

              return (
                <article
                  key={item.id}
                  className="flex flex-col justify-between rounded-lg border border-[#E0E3EB] bg-white p-5 transition-colors duration-150 hover:border-[#2962FF]/60 dark:border-[#1E222D] dark:bg-[#0D1017] dark:hover:border-[#2962FF]/70"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-[#787B86]">
                      <span>{item.platform} · {item.category}</span>
                      <span
                        className={
                          open
                            ? 'font-mono font-semibold text-[#089981]'
                            : 'font-mono text-[#787B86]'
                        }
                      >
                        {item.builtin ? 'INCLUDED' : open ? 'UNLOCKED' : 'LOCKED'}
                      </span>
                    </div>

                    <h2 className="font-display text-base font-semibold leading-snug text-[#131722] dark:text-[#F0F3FA]">
                      {item.name}
                    </h2>

                    <p className="text-sm leading-relaxed text-[#5D606B] dark:text-[#9598A1]">
                      {item.desc}
                    </p>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-4 border-t border-[#E0E3EB] pt-4 dark:border-[#1E222D]">
                    <div className="font-mono text-sm tabular-nums">
                      {item.priceKsh === 0 ? (
                        <span className="font-semibold text-[#089981]">Free</span>
                      ) : (
                        <>
                          <span className="font-semibold text-[#131722] dark:text-[#F0F3FA]">{usdPrice}</span>
                          {geo.isKenya && (
                            <span className="ml-1.5 text-xs text-[#787B86]">
                              ({kshPrice})
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {open ? (
                      item.section === 'automated' ? (
                        <button
                          type="button"
                          onClick={() => onRunAutomated(item)}
                          className="inline-flex h-8 items-center gap-1.5 rounded bg-[#089981] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#06806B] whitespace-nowrap shrink-0"
                        >
                          <Play className="h-3.5 w-3.5" />
                          Run Bot
                        </button>
                      ) : item.section === 'signals' || item.section === 'forex' ? (
                        <div className="flex items-center gap-2">
                          {item.kind === 'file' && (
                            <button
                              type="button"
                              onClick={() => handleDownload(item)}
                              className="inline-flex h-8 items-center gap-1 rounded border border-[#E0E3EB] px-2.5 text-xs font-medium text-[#131722] hover:bg-[#F0F3FA] dark:border-[#1E222D] dark:text-[#D1D4DC] dark:hover:bg-[#131722] whitespace-nowrap shrink-0"
                            >
                              <Download className="h-3.5 w-3.5" />
                              .mq5
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onNavigate('forex')}
                            className="inline-flex h-8 items-center gap-1.5 rounded bg-[#2962FF] px-3.5 text-xs font-semibold text-white hover:bg-[#1E53E5] whitespace-nowrap shrink-0"
                          >
                            Open
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleDownload(item)}
                          className="inline-flex h-8 items-center gap-1.5 rounded bg-[#089981] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#06806B] whitespace-nowrap shrink-0"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download XML
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={() => onUnlock(item)}
                        className="inline-flex h-8 items-center gap-1.5 rounded border border-[#E0E3EB] bg-white px-3.5 text-xs font-medium text-[#131722] transition-colors hover:border-[#2962FF] hover:text-[#2962FF] dark:border-[#2A2E39] dark:bg-[#131722] dark:text-[#D1D4DC] dark:hover:border-[#2962FF] dark:hover:text-[#2962FF] whitespace-nowrap shrink-0"
                      >
                        <Lock className="h-3 w-3 text-[#787B86]" />
                        Unlock
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
