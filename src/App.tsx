import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { AdminView } from './components/AdminView';
import { AuthModal } from './components/AuthModal';
import { AutomatedView } from './components/AutomatedView';
import { CatalogView } from './components/CatalogView';
import { ChartsView } from './components/ChartsView';
import { CheckoutModal } from './components/CheckoutModal';
import { ForexMt5View } from './components/ForexMt5View';
import { HomeView } from './components/HomeView';
import { Navbar } from './components/Navbar';
import { SettingsView } from './components/SettingsView';
import { ToolsView } from './components/ToolsView';
import { VerifyBanner } from './components/VerifyBanner';
import { mergeCatalog, SPECIAL_PRODUCTS } from './data/catalog';
import { apiFetch } from './lib/api';
import { auth, testFirestoreConnection } from './lib/firebase';
import { initPwaServiceWorker, OfflineIndicator } from './lib/pwa';
import type {
  ActiveRoute,
  Announcement,
  CatalogItem,
  DerivAccountInfo,
  ServerConfig,
  ThemeMode,
  TradeLogEntry,
  UserProfile,
} from './types/app';

const VALID_ROUTES: ActiveRoute[] = [
  'home',
  'catalog',
  'automated',
  'scanner',
  'charts',
  'markets',
  'trades',
  'po',
  'news',
  'forex',
  'aiscan',
  'engine',
  'broker',
  'settings',
  'admin',
];

function initialRoute(): ActiveRoute {
  if (typeof window === 'undefined') return 'home';
  if (window.location.pathname === '/admin') return 'admin';
  const hash = window.location.hash.replace(/^#/, '') as ActiveRoute;
  return VALID_ROUTES.includes(hash) ? hash : 'home';
}

function applyThemeClass(mode: ThemeMode) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('tp254.theme', mode);
  } catch {}
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = mode === 'dark' || (mode === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
}

export default function App() {
  const [route, setRoute] = useState<ActiveRoute>(initialRoute);
  const [historyStack, setHistoryStack] = useState<ActiveRoute[]>([]);
  const [lastRoute, setLastRoute] = useState<ActiveRoute | null>(() => {
    try {
      const r = localStorage.getItem('tp254.lastRoute') as ActiveRoute | null;
      return r && VALID_ROUTES.includes(r) && r !== 'admin' ? r : null;
    } catch {
      return null;
    }
  });

  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      const s = localStorage.getItem('tp254.theme') as ThemeMode | null;
      return s === 'light' || s === 'dark' || s === 'system' ? s : 'system';
    } catch {
      return 'system';
    }
  });

  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [prices, setPrices] = useState<Record<string, number> | null>(null);
  const [dynamicCat, setDynamicCat] = useState<any>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const [selectedBotId, setSelectedBotId] = useState<string | null>('engine-ai');
  const [checkoutItem, setCheckoutItem] = useState<{ id: string; name: string; price: number; desc?: string } | null>(null);

  const [derivToken, setDerivToken] = useState<string>(() => {
    try {
      return localStorage.getItem('tp254.derivToken') || '';
    } catch {
      return '';
    }
  });
  const [derivAccount, setDerivAccount] = useState<DerivAccountInfo | null>(null);
  const [botRunning, setBotRunning] = useState(false);
  const [tradeHistory, setTradeHistory] = useState<TradeLogEntry[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('tp254.trades') || '[]');
    } catch {
      return [];
    }
  });
  const [bannerNote, setBannerNote] = useState('');

  const catalog: CatalogItem[] = mergeCatalog(dynamicCat, prices, route === 'admin');

  const loadPublic = useCallback(async () => {
    try {
      const [cfg, pr, cat, ann] = await Promise.all([
        apiFetch<ServerConfig>('/config'),
        apiFetch<Record<string, number>>('/prices'),
        apiFetch<any>('/catalog'),
        apiFetch<{ announcements: Announcement[] }>('/announcements'),
      ]);
      setConfig(cfg);
      setPrices(pr);
      setDynamicCat(cat);
      setAnnouncements(ann.announcements || []);
    } catch {}
  }, []);

  const loadMe = useCallback(async () => {
    if (!auth.currentUser) {
      setUser(null);
      return;
    }
    try {
      const me = await apiFetch<UserProfile>('/me');
      setUser(me);
    } catch {}
  }, []);

  useEffect(() => {
    initPwaServiceWorker();
    void testFirestoreConnection();
    void loadPublic();

    // Capture Deriv OAuth token (?token1=...) or PayPal return (?paypal=success&token=...)
    const params = new URLSearchParams(window.location.search);
    const oauthTok = params.get('token1');
    if (oauthTok) {
      try {
        localStorage.setItem('tp254.derivToken', oauthTok);
      } catch {}
      setDerivToken(oauthTok);
      setRoute('automated');
      window.history.replaceState({}, '', '/#automated');
    }

    const unsub = onAuthStateChanged(auth, (fbUser) => {
      setAuthEmail(fbUser?.email || null);
      if (fbUser) {
        void loadMe();
        // Complete PayPal capture on return if logged in
        const pStatus = params.get('paypal');
        const ppOrderId = params.get('token');
        if (pStatus === 'success' && ppOrderId) {
          apiFetch('/paypal/capture-order', { method: 'POST', json: { paypalOrderId: ppOrderId } })
            .then(() => {
              setBannerNote('PayPal payment confirmed! Your access is unlocked.');
              window.history.replaceState({}, '', '/#catalog');
              void loadMe();
            })
            .catch(() => {});
        }
      } else {
        setUser(null);
      }
    });

    const onPop = () => {
      if (window.location.pathname === '/admin') setRoute('admin');
      else {
        const h = window.location.hash.replace(/^#/, '') as ActiveRoute;
        if (VALID_ROUTES.includes(h)) setRoute(h);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => {
      unsub();
      window.removeEventListener('popstate', onPop);
    };
  }, [loadMe, loadPublic]);

  useEffect(() => {
    applyThemeClass(theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      if (theme === 'system') applyThemeClass('system');
    };
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [theme]);

  const navigate = (next: ActiveRoute, botId?: string) => {
    if (botId) setSelectedBotId(botId);
    if (next !== route) {
      setHistoryStack((prev) => [...prev.slice(-10), route]);
      setRoute(next);
      if (next === 'admin') {
        window.history.pushState({}, '', '/admin');
      } else {
        try {
          localStorage.setItem('tp254.lastRoute', next);
        } catch {}
        setLastRoute(next);
        window.history.pushState({}, '', `/#${next}`);
      }
    }
  };

  const goBack = () => {
    const prev = historyStack[historyStack.length - 1] || 'home';
    setHistoryStack((s) => s.slice(0, -1));
    setRoute(prev);
    window.history.pushState({}, '', prev === 'admin' ? '/admin' : `/#${prev}`);
  };

  const handleSetDerivToken = (tok: string) => {
    setDerivToken(tok);
    try {
      if (tok) localStorage.setItem('tp254.derivToken', tok);
      else localStorage.removeItem('tp254.derivToken');
    } catch {}
  };

  const handleAddTrade = (t: TradeLogEntry) => {
    setTradeHistory((prev) => {
      const next = [t, ...prev].slice(0, 100);
      try {
        localStorage.setItem('tp254.trades', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleBuySpecial = (id: 'signals' | 'aiscan' | 'engine' | 'xauusd-system' | 'straddle-system') => {
    const cat = catalog.find((c) => c.id === id);
    if (cat) {
      setCheckoutItem(cat);
      return;
    }
    const spec = SPECIAL_PRODUCTS[id];
    if (spec) {
      setCheckoutItem({
        id: spec.id,
        name: spec.name,
        price: prices?.[spec.id] || spec.defaultPrice,
        desc: spec.desc,
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFD] text-[#131722] dark:bg-black dark:text-[#D1D4DC] pb-20 lg:pb-8">
      <OfflineIndicator />
      <Navbar
        route={route}
        onNavigate={(r) => navigate(r)}
        onBack={goBack}
        canGoBack={historyStack.length > 0 || route !== 'home'}
        theme={theme}
        onChangeTheme={(t) => {
          setTheme(t);
          if (user) void apiFetch('/me', { method: 'POST', json: { theme: t } }).catch(() => {});
        }}
        user={user}
        authEmail={authEmail}
        onOpenAuth={() => setAuthOpen(true)}
        derivAccount={derivAccount}
        botRunning={botRunning}
      />

      <main className="lg:pl-60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
          {bannerNote && (
            <div className="mb-4 rounded-xl border border-[#089981]/30 bg-[#089981]/10 p-3 text-xs font-semibold text-[#089981]">
              {bannerNote}
            </div>
          )}

          {user && !user.verified && <VerifyBanner email={user.email} verified={user.verified} onVerified={() => void loadMe()} />}

          {route === 'home' && (
            <HomeView
              user={user}
              config={config}
              catalog={catalog}
              announcements={announcements}
              lastRoute={lastRoute}
              onNavigate={navigate}
              onOpenAuth={() => setAuthOpen(true)}
              onBuy={(item) => setCheckoutItem(item)}
            />
          )}

          {route === 'catalog' && (
            <CatalogView
              catalog={catalog}
              config={config}
              user={user}
              onBuy={(item) => setCheckoutItem(item)}
              onOpenBot={navigate}
              onRequireAuth={() => setAuthOpen(true)}
            />
          )}

          {route === 'automated' && (
            <AutomatedView
              catalog={catalog}
              user={user}
              selectedBotId={selectedBotId}
              onSelectBot={setSelectedBotId}
              derivToken={derivToken}
              onSetDerivToken={handleSetDerivToken}
              derivAccount={derivAccount}
              onSetDerivAccount={setDerivAccount}
              onAddTrade={handleAddTrade}
              onRunningChange={setBotRunning}
              onBuy={(item) => setCheckoutItem(item)}
              onRequireAuth={() => setAuthOpen(true)}
            />
          )}

          {(route === 'scanner' || route === 'markets' || route === 'trades' || route === 'po' || route === 'news') && (
            <ToolsView
              tab={route}
              onNavigate={navigate}
              tradeHistory={tradeHistory}
              onClearTrades={() => {
                setTradeHistory([]);
                try {
                  localStorage.removeItem('tp254.trades');
                } catch {}
              }}
              user={user}
              onRequireAuth={() => setAuthOpen(true)}
            />
          )}

          {route === 'charts' && <ChartsView />}

          {(route === 'forex' || route === 'aiscan' || route === 'engine' || route === 'broker') && (
            <ForexMt5View
              tab={route}
              onNavigate={navigate}
              config={config}
              prices={prices}
              user={user}
              catalog={catalog}
              onRequireAuth={() => setAuthOpen(true)}
              onBuySpecial={handleBuySpecial}
            />
          )}

          {route === 'settings' && (
            <SettingsView
              user={user}
              config={config}
              theme={theme}
              onChangeTheme={setTheme}
              onRefreshUser={() => void loadMe()}
              onClearDerivToken={() => handleSetDerivToken('')}
              onOpenAuth={() => setAuthOpen(true)}
              onNavigate={navigate}
            />
          )}

          {route === 'admin' && (
            <AdminView
              catalog={catalog}
              config={config}
              prices={prices}
              onRefreshGlobal={() => {
                void loadPublic();
                void loadMe();
              }}
            />
          )}

          {/* Visible Risk Disclaimer Footer */}
          <footer className="mt-10 pt-5 border-t border-slate-200 dark:border-[#1E222D] text-[11px] text-slate-500 dark:text-[#787B86] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <strong>Risk Warning:</strong> Trading Deriv contracts, Forex, Gold, and automated robots involves significant risk of loss. Always test on a Demo account first. Past signals do not guarantee future results.
            </div>
            <div className="shrink-0 font-mono">TRADERSPRO254</div>
          </footer>
        </div>
      </main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => void loadMe()} />
      <CheckoutModal
        open={Boolean(checkoutItem)}
        item={checkoutItem}
        config={config}
        user={user}
        onClose={() => setCheckoutItem(null)}
        onRequireAuth={() => {
          setCheckoutItem(null);
          setAuthOpen(true);
        }}
        onApproved={() => {
          void loadMe();
        }}
      />
    </div>
  );
}
