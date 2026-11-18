import { useState } from 'react';
import { BookOpen, CheckCircle2, Download, HelpCircle, Lock, Play, Search, X } from 'lucide-react';
import { formatProductPrice } from '../data/catalog';
import { apiFetch } from '../lib/api';
import { openEntry, type VaultEntry } from '../lib/vaultCore';
import type { ActiveRoute, CatalogItem, ServerConfig, UserProfile } from '../types/app';

interface CatalogViewProps {
  catalog: CatalogItem[];
  config: ServerConfig | null;
  user: UserProfile | null;
  onBuy: (item: CatalogItem) => void;
  onOpenBot: (route: ActiveRoute, botId: string) => void;
  onRequireAuth: () => void;
}

export function CatalogView({
  catalog,
  config,
  user,
  onBuy,
  onOpenBot,
  onRequireAuth,
}: CatalogViewProps) {
  const [filter, setFilter] = useState<'all' | 'automated' | 'deriv' | 'forex'>('all');
  const [query, setQuery] = useState('');
  const [howItem, setHowItem] = useState<CatalogItem | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [dlError, setDlError] = useState('');

  const licenses = new Set(user?.licenses || []);

  const items = catalog.filter((item) => {
    if (filter !== 'all' && item.section !== filter) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        item.platform.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleDownloadFile = async (item: CatalogItem) => {
    if (!user) return onRequireAuth();
    setDlError('');
    setDownloadingId(item.id);
    try {
      const keyRes = await apiFetch<{ key: string }>(`/license/key?bot=${encodeURIComponent(item.id)}`);
      let entry: VaultEntry | null = null;
      const staticRes = await fetch(`/vault/${encodeURIComponent(item.id)}.json`).catch(() => null);
      if (staticRes && staticRes.ok) {
        entry = (await staticRes.json()) as VaultEntry;
      } else {
        entry = await apiFetch<VaultEntry>(`/botfile?id=${encodeURIComponent(item.id)}`);
      }
      if (!entry) throw new Error('Bot file could not be loaded.');
      const opened = await openEntry(entry, keyRes.key);
      if (!opened) throw new Error('Decryption key did not match this bot file.');

      const blob = new Blob([new Uint8Array(opened.bytes)], { type: entry.mime || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = entry.file || `${item.id}.${item.kind === 'file' ? 'mq5' : 'xml'}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
      setDlError(e?.message || 'Could not download file.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">All Bots &amp; Systems</h1>
          <p className="text-xs text-slate-500 dark:text-[#787B86] mt-0.5">
            Unlock once per account. Encrypted files unlock immediately after payment approval.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bots..."
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-[#2962FF]"
          />
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { id: 'all' as const, label: 'All Tools' },
          { id: 'automated' as const, label: 'Automated Browser Bots' },
          { id: 'deriv' as const, label: 'Deriv Bot XML' },
          { id: 'forex' as const, label: 'MT5 Expert Advisors' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === t.id
                ? 'bg-[#2962FF] text-white'
                : 'border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] text-slate-600 dark:text-[#B2B5BE] hover:bg-slate-100 dark:hover:bg-[#131722]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {dlError && (
        <div className="p-3 rounded-xl bg-[#F23645]/10 border border-[#F23645]/30 text-xs text-[#F23645]">
          {dlError}
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {items.map((item) => {
          const unlocked = item.id === 'engine-ai' || !item.locked || user?.isAdmin || licenses.has(item.id);
          const price = formatProductPrice(item.price, config);

          return (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#131722] text-slate-600 dark:text-[#B2B5BE]">
                    {item.platform}
                  </span>
                  {unlocked ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#089981]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Unlocked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 dark:text-[#787B86]">
                      <Lock className="w-3 h-3" />
                      Locked
                    </span>
                  )}
                </div>

                <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">{item.name}</h3>
                <p className="text-xs text-slate-500 dark:text-[#787B86] mt-1.5 leading-relaxed">{item.desc}</p>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-[#1E222D] flex items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                    {price.primary}
                  </div>
                  {price.secondary && (
                    <div className="text-[11px] text-slate-400 dark:text-[#787B86]">{price.secondary}</div>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setHowItem(item)}
                    className="p-2 rounded-lg border border-slate-200 dark:border-[#1E222D] text-slate-500 dark:text-[#B2B5BE] hover:bg-slate-100 dark:hover:bg-[#131722]"
                    title="How to use"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </button>

                  {unlocked ? (
                    item.kind === 'xml' || item.kind === 'file' ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={downloadingId === item.id}
                          onClick={() => void handleDownloadFile(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#089981] hover:bg-[#06806B] text-white text-xs font-semibold disabled:opacity-50"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {downloadingId === item.id ? 'Decrypting...' : item.kind === 'file' ? 'Download EA' : 'Download XML'}
                        </button>
                        {item.section === 'forex' && (
                          <button
                            type="button"
                            onClick={() => onOpenBot('broker', item.id)}
                            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-[#1E222D] text-xs font-semibold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-[#131722]"
                          >
                            Control
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenBot('automated', item.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#2962FF] hover:bg-[#1E53E5] text-white text-xs font-semibold"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Open Runner
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => onBuy(item)}
                      className="px-3.5 py-2 rounded-lg bg-[#2962FF] hover:bg-[#1E53E5] text-white text-xs font-semibold"
                    >
                      Buy This Bot
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* How-to Modal */}
      {howItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#2962FF]" />
                <h3 className="font-display font-bold text-sm text-slate-900 dark:text-white">{howItem.name}</h3>
              </div>
              <button type="button" onClick={() => setHowItem(null)} className="p-1 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-[#B2B5BE] leading-relaxed">{howItem.how}</p>
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-800 dark:text-amber-200">
              Always run on a Demo account first until you understand how the strategy behaves.
            </div>
            <button
              type="button"
              onClick={() => setHowItem(null)}
              className="w-full py-2 rounded-xl bg-[#2962FF] text-white text-xs font-semibold"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
