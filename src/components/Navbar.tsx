import { useState } from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  ChevronLeft,
  Compass,
  Cpu,
  Globe,
  Home,
  LayoutGrid,
  Menu,
  Monitor,
  Moon,
  Newspaper,
  Radio,
  Settings,
  Shield,
  Store,
  Sun,
  TrendingUp,
  User,
  Wallet,
  X,
} from 'lucide-react';
import type { ActiveRoute, DerivAccountInfo, ThemeMode, UserProfile } from '../types/app';

interface NavbarProps {
  route: ActiveRoute;
  onNavigate: (r: ActiveRoute) => void;
  onBack: () => void;
  canGoBack: boolean;
  theme: ThemeMode;
  onChangeTheme: (t: ThemeMode) => void;
  user: UserProfile | null;
  authEmail: string | null;
  onOpenAuth: () => void;
  derivAccount: DerivAccountInfo | null;
  botRunning: boolean;
}

const SIDEBAR_GROUPS: Array<{
  title: string;
  items: Array<{ id: ActiveRoute; label: string; icon: any }>;
}> = [
  {
    title: 'Home',
    items: [
      { id: 'home', label: 'Overview', icon: Home },
      { id: 'catalog', label: 'All Bots & Store', icon: Store },
    ],
  },
  {
    title: 'Bots',
    items: [
      { id: 'automated', label: 'Automated Trading', icon: Bot },
      { id: 'scanner', label: 'Digit Scanner', icon: Compass },
    ],
  },
  {
    title: 'Trading tools',
    items: [
      { id: 'charts', label: 'Live Charts', icon: BarChart3 },
      { id: 'markets', label: 'Markets', icon: Activity },
      { id: 'trades', label: 'Session Trades', icon: TrendingUp },
      { id: 'po', label: 'Broker Signals', icon: Radio },
      { id: 'news', label: 'Economic News', icon: Newspaper },
    ],
  },
  {
    title: 'Forex',
    items: [
      { id: 'forex', label: 'SMC/ICT Signals', icon: Globe },
      { id: 'aiscan', label: 'AI Scanner', icon: Cpu },
      { id: 'engine', label: 'Market Engine', icon: LayoutGrid },
      { id: 'broker', label: 'Broker & MT5 EA', icon: Monitor },
    ],
  },
  {
    title: 'Account',
    items: [{ id: 'settings', label: 'Settings & Orders', icon: Settings }],
  },
];

export function Navbar({
  route,
  onNavigate,
  onBack,
  canGoBack,
  theme,
  onChangeTheme,
  user,
  authEmail,
  onOpenAuth,
  derivAccount,
  botRunning,
}: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const cycleTheme = () => {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    const idx = order.indexOf(theme);
    onChangeTheme(order[(idx + 1) % order.length]);
  };

  const firstName = user?.name?.split(' ')[0] || authEmail?.split('@')[0] || 'Account';

  const pick = (r: ActiveRoute) => {
    setMenuOpen(false);
    onNavigate(r);
  };

  return (
    <>
      {/* Top Header */}
      <header className="sticky top-0 z-40 h-14 border-b border-slate-200 dark:border-[#1E222D] bg-white/95 dark:bg-black/95 backdrop-blur-md">
        <div className="h-full px-3 sm:px-5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {canGoBack && route !== 'home' && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-[#787B86] hover:bg-slate-100 dark:hover:bg-[#1E222D] transition-colors"
                aria-label="Go back"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Back</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => pick('home')}
              className="flex items-center gap-2.5 text-left min-w-0 group"
            >
              <img src="/favicon-64.png" alt="TRADERSPRO254" className="w-7 h-7 rounded-md shrink-0" />
              <div className="min-w-0">
                <div className="font-display font-bold tracking-tight text-sm sm:text-base text-slate-900 dark:text-white truncate">
                  TRADERSPRO<span className="text-[#2962FF]">254</span>
                </div>
              </div>
            </button>

            {botRunning && (
              <button
                type="button"
                onClick={() => pick('automated')}
                className="hidden sm:inline-flex items-center gap-1.5 ml-2 px-2 py-0.5 rounded-md bg-[#089981]/15 border border-[#089981]/30 text-[#089981] text-[11px] font-semibold"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#089981] animate-pulse" />
                Bot Running
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {derivAccount && (
              <button
                type="button"
                onClick={() => pick('automated')}
                className="hidden md:inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-[#0D1017] text-xs"
                title="Connected Deriv Account"
              >
                <Wallet className="w-3.5 h-3.5 text-[#2962FF]" />
                <span className={`font-semibold ${derivAccount.is_virtual ? 'text-amber-500' : 'text-[#089981]'}`}>
                  {derivAccount.is_virtual ? 'DEMO' : 'REAL'}
                </span>
                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                  {derivAccount.balance.toFixed(2)} {derivAccount.currency}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={cycleTheme}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-[#0D1017] text-xs font-medium text-slate-700 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#1E222D] transition-colors"
              title={`Theme: ${theme}`}
            >
              {theme === 'dark' ? (
                <Moon className="w-3.5 h-3.5 text-[#2962FF]" />
              ) : theme === 'light' ? (
                <Sun className="w-3.5 h-3.5 text-amber-500" />
              ) : (
                <Monitor className="w-3.5 h-3.5 text-slate-500 dark:text-[#787B86]" />
              )}
              <span className="hidden sm:inline capitalize">{theme}</span>
            </button>

            {user?.isAdmin && (
              <button
                type="button"
                onClick={() => pick('admin')}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  route === 'admin'
                    ? 'bg-[#2962FF] text-white'
                    : 'bg-[#2962FF]/12 text-[#2962FF] border border-[#2962FF]/30 hover:bg-[#2962FF]/20'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                Admin
              </button>
            )}

            <button
              type="button"
              onClick={authEmail ? () => pick('settings') : onOpenAuth}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2962FF] hover:bg-[#1E53E5] text-white text-xs font-semibold transition-colors max-w-[140px]"
            >
              <User className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{authEmail ? firstName : 'Sign In'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex fixed top-14 left-0 bottom-0 w-60 flex-col border-r border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#080A0F] overflow-y-auto z-30">
        <div className="p-3 space-y-5 flex-1">
          {SIDEBAR_GROUPS.map((grp) => (
            <div key={grp.title}>
              <div className="px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#787B86]">
                {grp.title}
              </div>
              <div className="space-y-0.5">
                {grp.items.map((item) => {
                  const Icon = item.icon;
                  const active = route === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => pick(item.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                        active
                          ? 'bg-[#2962FF]/12 text-[#2962FF] font-semibold'
                          : 'text-slate-700 dark:text-[#B2B5BE] hover:bg-slate-100 dark:hover:bg-[#131722]'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {user?.isAdmin && (
            <div>
              <div className="px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#787B86]">
                Owner
              </div>
              <button
                type="button"
                onClick={() => pick('admin')}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                  route === 'admin'
                    ? 'bg-[#2962FF] text-white'
                    : 'text-[#2962FF] hover:bg-[#2962FF]/10'
                }`}
              >
                <Shield className="w-4 h-4 shrink-0" />
                <span>Admin Dashboard</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Bottom Bar (5 items) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 h-16 border-t border-slate-200 dark:border-[#1E222D] bg-white/95 dark:bg-black/95 backdrop-blur-md grid grid-cols-5">
        {[
          { id: 'home' as ActiveRoute, label: 'Home', icon: Home },
          { id: 'automated' as ActiveRoute, label: 'Bots', icon: Bot },
          { id: 'forex' as ActiveRoute, label: 'Forex', icon: Globe },
          { id: 'charts' as ActiveRoute, label: 'Charts', icon: BarChart3 },
        ].map((item) => {
          const Icon = item.icon;
          const active = route === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => pick(item.id)}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                active ? 'text-[#2962FF]' : 'text-slate-500 dark:text-[#787B86]'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            menuOpen ? 'text-[#2962FF]' : 'text-slate-500 dark:text-[#787B86]'
          }`}
        >
          <Menu className="w-4 h-4" />
          <span>Menu</span>
        </button>
      </nav>

      {/* Mobile Slide-Up Menu Sheet */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-xs">
          <div className="w-full max-h-[82vh] overflow-y-auto rounded-t-2xl border-t border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 pb-8 space-y-5">
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-sm text-slate-900 dark:text-white">All Sections</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-[#1E222D] text-slate-600 dark:text-[#B2B5BE]"
                aria-label="Close menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {SIDEBAR_GROUPS.map((grp) => (
              <div key={grp.title}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-[#787B86] mb-2">
                  {grp.title}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {grp.items.map((item) => {
                    const Icon = item.icon;
                    const active = route === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => pick(item.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs font-medium ${
                          active
                            ? 'border-[#2962FF] bg-[#2962FF]/12 text-[#2962FF]'
                            : 'border-slate-200 dark:border-[#1E222D] text-slate-700 dark:text-[#D1D4DC]'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {user?.isAdmin && (
              <button
                type="button"
                onClick={() => pick('admin')}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#2962FF] text-white text-xs font-semibold"
              >
                <Shield className="w-4 h-4" />
                Open Admin Dashboard
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
