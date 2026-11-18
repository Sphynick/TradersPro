import { ArrowRight, Bot, Cpu, Globe, Megaphone, Monitor, ShieldAlert, Store, Wrench } from 'lucide-react';
import type { ActiveRoute, Announcement, CatalogItem, ServerConfig, UserProfile } from '../types/app';
import { formatProductPrice } from '../data/catalog';

interface HomeViewProps {
  user: UserProfile | null;
  config: ServerConfig | null;
  catalog: CatalogItem[];
  announcements: Announcement[];
  lastRoute: ActiveRoute | null;
  onNavigate: (r: ActiveRoute, botId?: string) => void;
  onOpenAuth: () => void;
  onBuy: (item: CatalogItem) => void;
}

export function HomeView({
  user,
  config,
  catalog,
  announcements,
  lastRoute,
  onNavigate,
  onOpenAuth,
  onBuy,
}: HomeViewProps) {
  if (config?.maintenance && !user?.isAdmin) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4 text-center">
        <div className="rounded-2xl border border-amber-500/30 bg-white dark:bg-[#0D1017] p-8 space-y-3">
          <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto" />
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Quick Maintenance Break</h1>
          <p className="text-sm text-slate-600 dark:text-[#787B86]">
            TRADERSPRO254 is updating right now. Check back in a few minutes or message support on WhatsApp (+{config.whatsapp}).
          </p>
        </div>
      </div>
    );
  }

  const ownedBots = catalog.filter(
    (item) => item.id === 'engine-ai' || (user?.licenses || []).includes(item.id)
  );
  const firstName = user?.name?.split(' ')[0] || null;

  return (
    <div className="space-y-6">
      {/* Admin Announcements */}
      {announcements.map((a) => (
        <div
          key={a.id}
          className={`rounded-xl border px-4 py-3 text-xs flex items-center gap-2.5 ${
            a.kind === 'warning'
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
              : 'border-[#2962FF]/30 bg-[#2962FF]/10 text-slate-800 dark:text-[#D1D4DC]'
          }`}
        >
          <Megaphone className="w-4 h-4 shrink-0 text-[#2962FF]" />
          <span className="font-medium">{a.message}</span>
        </div>
      ))}

      {/* Clean Welcome Strip */}
      <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {firstName ? `Welcome back, ${firstName}` : 'Simple trading tools that actually work'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-[#787B86] mt-1 max-w-2xl">
            Run automated Deriv bots right in your browser, scan volatility digits live, get SMC/ICT Forex setups, or manage your MT5 Gold robots remotely.
          </p>
        </div>
        {!user && (
          <button
            type="button"
            onClick={onOpenAuth}
            className="shrink-0 px-4 py-2.5 rounded-xl bg-[#2962FF] hover:bg-[#1E53E5] text-white text-xs font-semibold transition-colors"
          >
            Sign In / Create Account
          </button>
        )}
      </div>

      {/* Primary Track Chooser: Binary / Deriv vs Forex */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5 flex flex-col justify-between gap-4 hover:border-[#2962FF]/50 transition-colors">
          <div>
            <div className="w-9 h-9 rounded-xl bg-[#2962FF]/12 text-[#2962FF] flex items-center justify-center mb-3">
              <Bot className="w-5 h-5" />
            </div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">Binary / Deriv Trading</h2>
            <p className="text-xs text-slate-500 dark:text-[#787B86] mt-1">
              Automated Over/Under, Differs, Matches, Even/Odd, and Accumulator strategies plus Deriv Bot XML downloads and live digit scanner.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate('automated')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2962FF] hover:bg-[#1E53E5] text-white text-xs font-semibold transition-colors"
            >
              Open Bot Runner
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('scanner')}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] text-xs font-semibold text-slate-700 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#131722]"
            >
              Digit Scanner
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5 flex flex-col justify-between gap-4 hover:border-[#2962FF]/50 transition-colors">
          <div>
            <div className="w-9 h-9 rounded-xl bg-[#089981]/12 text-[#089981] flex items-center justify-center mb-3">
              <Globe className="w-5 h-5" />
            </div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">Forex, Gold &amp; MT5</h2>
            <p className="text-xs text-slate-500 dark:text-[#787B86] mt-1">
              Live SMC/ICT setups (1 free signal to test), Top-Down AI Scanner, 24/7 Cloud Market Engine, and remote MT5 Expert Advisor controls.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onNavigate('forex')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2962FF] hover:bg-[#1E53E5] text-white text-xs font-semibold transition-colors"
            >
              View Live Signals
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('broker')}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] text-xs font-semibold text-slate-700 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#131722]"
            >
              MT5 Robot Control
            </button>
          </div>
        </div>
      </div>

      {/* Continue Where You Left Off + Quick Tools */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {lastRoute && lastRoute !== 'home' && (
          <button
            type="button"
            onClick={() => onNavigate(lastRoute)}
            className="col-span-2 sm:col-span-1 rounded-xl border border-[#2962FF]/40 bg-[#2962FF]/8 p-3.5 text-left hover:bg-[#2962FF]/15 transition-colors"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#2962FF]">Continue</div>
            <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 capitalize">{lastRoute}</div>
          </button>
        )}
        <button
          type="button"
          onClick={() => onNavigate('catalog')}
          className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-3.5 text-left hover:border-slate-300 dark:hover:border-[#2A2E39]"
        >
          <Store className="w-4 h-4 text-[#2962FF] mb-1.5" />
          <div className="text-xs font-bold text-slate-900 dark:text-white">All Bots Store</div>
          <div className="text-[11px] text-slate-500 dark:text-[#787B86]">{catalog.length} tools ready</div>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('aiscan')}
          className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-3.5 text-left hover:border-slate-300 dark:hover:border-[#2A2E39]"
        >
          <Cpu className="w-4 h-4 text-[#2962FF] mb-1.5" />
          <div className="text-xs font-bold text-slate-900 dark:text-white">AI Scanner</div>
          <div className="text-[11px] text-slate-500 dark:text-[#787B86]">Top-down market pick</div>
        </button>
        <button
          type="button"
          onClick={() => onNavigate('news')}
          className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-3.5 text-left hover:border-slate-300 dark:hover:border-[#2A2E39]"
        >
          <Wrench className="w-4 h-4 text-[#2962FF] mb-1.5" />
          <div className="text-xs font-bold text-slate-900 dark:text-white">News + AI</div>
          <div className="text-[11px] text-slate-500 dark:text-[#787B86]">High-impact reactions</div>
        </button>
      </div>

      {/* Your Bots Section */}
      <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">Your Bots &amp; Systems</h2>
            <p className="text-xs text-slate-500 dark:text-[#787B86]">
              Ready to run or download straight from your account.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('catalog')}
            className="text-xs font-semibold text-[#2962FF] hover:underline"
          >
            Browse catalog
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ownedBots.map((bot) => (
            <div
              key={bot.id}
              className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black p-3.5 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[#089981]">
                    {bot.id === 'engine-ai' ? 'Free Built-In' : 'Unlocked'}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-[#787B86]">{bot.platform}</span>
                </div>
                <div className="font-semibold text-sm text-slate-900 dark:text-white mt-1">{bot.name}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (bot.section === 'forex') onNavigate('broker');
                  else if (bot.kind === 'xml') onNavigate('catalog', bot.id);
                  else onNavigate('automated', bot.id);
                }}
                className="w-full py-2 rounded-lg bg-[#2962FF] hover:bg-[#1E53E5] text-white text-xs font-semibold transition-colors"
              >
                Open
              </button>
            </div>
          ))}

          {ownedBots.length <= 1 && (
            <div className="rounded-xl border border-dashed border-slate-300 dark:border-[#2A2E39] p-3.5 flex flex-col justify-between gap-2">
              <div className="text-xs text-slate-600 dark:text-[#787B86]">
                Unlock premium bots like <strong className="text-slate-900 dark:text-white">Accumulator Killer</strong> or <strong className="text-slate-900 dark:text-white">ChartLord XAUUSD EA</strong>.
              </div>
              {catalog.find((c) => c.id === 'killer') && (
                <button
                  type="button"
                  onClick={() => onBuy(catalog.find((c) => c.id === 'killer')!)}
                  className="w-full py-2 rounded-lg border border-[#2962FF]/40 text-[#2962FF] text-xs font-semibold hover:bg-[#2962FF]/10"
                >
                  Unlock Accumulator Killer ({formatProductPrice(catalog.find((c) => c.id === 'killer')!.price, config, { short: true }).primary})
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* MT5 Shortcut Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Monitor className="w-5 h-5 text-[#2962FF] shrink-0" />
          <div className="text-xs">
            <div className="font-semibold text-slate-900 dark:text-white">Using ChartLord XAUUSD or Straddle MT5 EA?</div>
            <div className="text-slate-500 dark:text-[#787B86]">Copy your EA key, switch Intraday/Scalping, or close positions live.</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('broker')}
          className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-[#1E222D] text-xs font-semibold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-[#131722] shrink-0"
        >
          Open Broker Control
        </button>
      </div>
    </div>
  );
}
