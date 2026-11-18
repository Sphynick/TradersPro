import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { AutomatedView } from './components/AutomatedView.tsx';
import { CatalogView } from './components/CatalogView.tsx';
import { ChartsView } from './components/ChartsView.tsx';
import { CheckoutModal } from './components/CheckoutModal.tsx';
import { ForexMt5View } from './components/ForexMt5View.tsx';
import { Navbar } from './components/Navbar.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { ADMIN_EMAIL, DEFAULT_USD_KSH_RATE, type CatalogItem } from './data/catalog.ts';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutUser,
  testFirestoreConnection,
} from './lib/firebase.ts';
import type {
  ActiveTab,
  GeoInfo,
  Mt5ConfigRecord,
  OrderRecord,
  SignalRecord,
  TradeLogRecord,
} from './types/app.ts';

const DEFAULT_GEO: GeoInfo = {
  country: 'KE',
  isKenya: true,
  currency: { code: 'KSh', rateFromUsd: DEFAULT_USD_KSH_RATE },
  mpesaConfigured: false,
  paypalConfigured: false,
  pochiNumber: import.meta.env.VITE_POCHI_NUMBER || '0758414027',
  whatsappNumber: import.meta.env.VITE_WHATSAPP_NUMBER || '254758414027',
  usdKshRate: DEFAULT_USD_KSH_RATE,
};

function getInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem('tp254.theme');
    if (saved === 'light' || saved === 'dark') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {}
  return 'light';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('catalog');
  const [theme, setThemeState] = useState<'light' | 'dark'>(getInitialTheme);
  const [geo, setGeo] = useState<GeoInfo>(DEFAULT_GEO);
  const [countryOverride, setCountryOverride] = useState<string>(() => {
    try {
      return localStorage.getItem('tp254.country') || '';
    } catch {
      return '';
    }
  });

  const [authReady, setAuthReady] = useState(false);
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [licenses, setLicenses] = useState<string[]>([]);
  const [signalSubEnd, setSignalSubEnd] = useState<number>(0);

  const [signals, setSignals] = useState<SignalRecord[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [allOrders, setAllOrders] = useState<OrderRecord[]>([]);
  const [mt5Configs, setMt5Configs] = useState<Mt5ConfigRecord[]>([]);
  const [tradeLogs, setTradeLogs] = useState<TradeLogRecord[]>([]);

  const [checkoutItem, setCheckoutItem] = useState<CatalogItem | null>(null);
  const [selectedBotId, setSelectedBotId] = useState<string>('engine-ai');
  const [derivToken, setDerivToken] = useState<string>(() => {
    try {
      return sessionStorage.getItem('tp254.derivToken') || '';
    } catch {
      return '';
    }
  });
  const [toast, setToast] = useState<string>('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Apply theme class cleanly to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('tp254.theme', theme);
    } catch {}
  }, [theme]);

  const handleSetTheme = useCallback(
    async (next: 'light' | 'dark') => {
      setThemeState(next);
      if (fbUser) {
        try {
          await updateDoc(doc(db, 'users', fbUser.uid), {
            theme: next,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `users/${fbUser.uid}`);
        }
      }
    },
    [fbUser]
  );

  // Test Firestore connection on boot
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // Load region / payment gateway availability
  useEffect(() => {
    const qs = countryOverride ? `?country=${encodeURIComponent(countryOverride)}` : '';
    fetch(`/api/geo${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.country) setGeo(data);
      })
      .catch(() => {});
  }, [countryOverride]);

  const handleOverrideCountry = (code: string) => {
    setCountryOverride(code);
    try {
      localStorage.setItem('tp254.country', code);
    } catch {}
    showToast(code === 'KE' ? 'Switched checkout region to Kenya (M-Pesa).' : 'Switched checkout region to International (PayPal).');
  };

  const isAdmin = Boolean(
    fbUser?.email && fbUser.email.toLowerCase() === ADMIN_EMAIL && fbUser.emailVerified
  );

  // Firebase Auth listener & User profile bootstrap
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFbUser(user);
      setAuthReady(true);
      if (!user) {
        setLicenses([]);
        setSignalSubEnd(0);
        setOrders([]);
        setAllOrders([]);
        setMt5Configs([]);
        setTradeLogs([]);
        return;
      }

      const userRef = doc(db, 'users', user.uid);
      try {
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
          await setDoc(userRef, {
            uid: user.uid,
            displayName: (user.displayName || user.email?.split('@')[0] || 'Trader').slice(0, 80),
            email: (user.email || '').slice(0, 160),
            country: geo.country || 'KE',
            theme,
            licenses: [],
            signalSubEnd: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
      }
    });
    return unsub;
  }, []);

  // Public published Forex Signals listener
  useEffect(() => {
    const q = query(
      collection(db, 'signals'),
      where('published', '==', true),
      orderBy('createdAt', 'desc'),
      limit(24)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: SignalRecord[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            pair: String(data.pair || ''),
            direction: data.direction === 'SELL' ? 'SELL' : 'BUY',
            entry: String(data.entry || ''),
            stopLoss: String(data.stopLoss || ''),
            takeProfit: String(data.takeProfit || ''),
            timeframe: String(data.timeframe || '15M'),
            strategy: String(data.strategy || 'SMC'),
            status: data.status || 'active',
            published: Boolean(data.published),
            notes: String(data.notes || ''),
            authorId: String(data.authorId || ''),
            createdAtMs: data.createdAt?.toMillis?.() || Date.now(),
          };
        });
        setSignals(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'signals');
      }
    );
    return unsub;
  }, []);

  // Authenticated User Firestore Listeners
  useEffect(() => {
    if (!authReady || !fbUser) return;

    const unsubUser = onSnapshot(
      doc(db, 'users', fbUser.uid),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          setLicenses(Array.isArray(d.licenses) ? d.licenses : []);
          setSignalSubEnd(Number(d.signalSubEnd || 0));
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, `users/${fbUser.uid}`)
    );

    const ordersQuery = query(
      collection(db, 'orders'),
      where('userId', '==', fbUser.uid),
      orderBy('createdAt', 'desc'),
      limit(30)
    );
    const unsubOrders = onSnapshot(
      ordersQuery,
      (snap) => {
        setOrders(
          snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              userId: String(x.userId || ''),
              userEmail: String(x.userEmail || ''),
              itemId: String(x.itemId || ''),
              itemName: String(x.itemName || ''),
              method: x.method || 'mpesa_stk',
              status: x.status || 'pending',
              amountKsh: Number(x.amountKsh || 0),
              amountUsd: Number(x.amountUsd || 0),
              phone: String(x.phone || ''),
              reference: String(x.reference || ''),
              createdAtMs: x.createdAt?.toMillis?.() || Date.now(),
            };
          })
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'orders')
    );

    const mt5Query = query(
      collection(db, 'mt5Configs'),
      where('userId', '==', fbUser.uid),
      limit(10)
    );
    const unsubMt5 = onSnapshot(
      mt5Query,
      (snap) => {
        setMt5Configs(
          snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              userId: String(x.userId || ''),
              eaId: x.eaId === 'straddle-system' ? 'straddle-system' : 'xauusd-system',
              eaKey: String(x.eaKey || ''),
              symbol: String(x.symbol || 'XAUUSD'),
              mode: x.mode === 'scalping' ? 'scalping' : 'intraday',
              lotSize: Number(x.lotSize || 0.01),
              enabled: Boolean(x.enabled),
              updatedAtMs: x.updatedAt?.toMillis?.() || Date.now(),
            };
          })
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'mt5Configs')
    );

    const logsQuery = query(
      collection(db, 'tradeLogs'),
      where('userId', '==', fbUser.uid),
      orderBy('createdAt', 'desc'),
      limit(25)
    );
    const unsubLogs = onSnapshot(
      logsQuery,
      (snap) => {
        setTradeLogs(
          snap.docs.map((d) => {
            const x = d.data();
            return {
              id: d.id,
              userId: String(x.userId || ''),
              botId: String(x.botId || ''),
              botName: String(x.botName || ''),
              market: String(x.market || ''),
              contract: String(x.contract || ''),
              stake: Number(x.stake || 0),
              profit: Number(x.profit || 0),
              accountType: x.accountType === 'real' ? 'real' : 'demo',
              createdAtMs: x.createdAt?.toMillis?.() || Date.now(),
            };
          })
        );
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'tradeLogs')
    );

    let unsubAdminOrders = () => {};
    if (isAdmin) {
      const allOrdersQuery = query(
        collection(db, 'orders'),
        orderBy('createdAt', 'desc'),
        limit(40)
      );
      unsubAdminOrders = onSnapshot(
        allOrdersQuery,
        (snap) => {
          setAllOrders(
            snap.docs.map((d) => {
              const x = d.data();
              return {
                id: d.id,
                userId: String(x.userId || ''),
                userEmail: String(x.userEmail || ''),
                itemId: String(x.itemId || ''),
                itemName: String(x.itemName || ''),
                method: x.method || 'mpesa_stk',
                status: x.status || 'pending',
                amountKsh: Number(x.amountKsh || 0),
                amountUsd: Number(x.amountUsd || 0),
                phone: String(x.phone || ''),
                reference: String(x.reference || ''),
                createdAtMs: x.createdAt?.toMillis?.() || Date.now(),
              };
            })
          );
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'orders')
      );
    }

    return () => {
      unsubUser();
      unsubOrders();
      unsubMt5();
      unsubLogs();
      unsubAdminOrders();
    };
  }, [authReady, fbUser, isAdmin]);

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
      showToast('Signed in with Firebase.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sign-in cancelled.');
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    showToast('Signed out.');
  };

  const handleSaveDerivToken = (token: string) => {
    setDerivToken(token);
    try {
      sessionStorage.setItem('tp254.derivToken', token);
    } catch {}
    showToast('Deriv account connected for this session.');
  };

  const handlePaymentConfirmed = (itemId: string) => {
    if (itemId === 'signals-monthly') {
      setSignalSubEnd(Date.now() + 30 * 24 * 60 * 60 * 1000);
    } else {
      setLicenses((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]));
    }
    showToast('Payment confirmed and item unlocked.');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFD] text-[#131722] transition-colors duration-150 dark:bg-black dark:text-[#D1D4DC]">
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        theme={theme}
        onToggleTheme={() => handleSetTheme(theme === 'dark' ? 'light' : 'dark')}
        userEmail={fbUser?.email || null}
        userName={fbUser?.displayName || null}
        onAuthClick={() => (fbUser ? setActiveTab('settings') : handleSignIn())}
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {activeTab === 'catalog' && (
          <CatalogView
            geo={geo}
            licenses={licenses}
            signalSubEnd={signalSubEnd}
            isAdmin={isAdmin}
            onUnlock={(item) => setCheckoutItem(item)}
            onNavigate={setActiveTab}
            onRunAutomated={(item) => {
              setSelectedBotId(item.id);
              setActiveTab('automated');
            }}
          />
        )}

        {activeTab === 'automated' && (
          <AutomatedView
            selectedBotId={selectedBotId}
            onSelectBotId={setSelectedBotId}
            licenses={licenses}
            isAdmin={isAdmin}
            userId={fbUser?.uid || null}
            derivToken={derivToken}
            onSaveDerivToken={handleSaveDerivToken}
            tradeLogs={tradeLogs}
            onUnlockBot={(item) => setCheckoutItem(item)}
          />
        )}

        {activeTab === 'forex' && (
          <ForexMt5View
            signals={signals}
            mt5Configs={mt5Configs}
            licenses={licenses}
            signalSubEnd={signalSubEnd}
            isAdmin={isAdmin}
            userId={fbUser?.uid || null}
            onUnlockItem={(item) => setCheckoutItem(item)}
            onRequireSignIn={handleSignIn}
          />
        )}

        {activeTab === 'charts' && <ChartsView theme={theme} />}

        {activeTab === 'settings' && (
          <SettingsView
            theme={theme}
            onSetTheme={handleSetTheme}
            geo={geo}
            onOverrideCountry={handleOverrideCountry}
            userId={fbUser?.uid || null}
            userEmail={fbUser?.email || null}
            userName={fbUser?.displayName || null}
            isAdmin={isAdmin}
            licenses={licenses}
            signalSubEnd={signalSubEnd}
            orders={orders}
            allOrders={allOrders}
            onSignIn={handleSignIn}
            onSignOut={handleSignOut}
          />
        )}
      </main>

      <footer className="border-t border-[#E0E3EB] bg-white py-5 dark:border-[#1E222D] dark:bg-black">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 text-xs text-[#787B86] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Trading carries a high risk of loss. Test every strategy on a Deriv or MT5 demo account first and only risk capital you can afford to lose.
          </p>
          <div className="flex items-center gap-4 shrink-0">
            <a
              href="/api/export-zip"
              download="traderspro254-github-vercel.zip"
              className="font-medium text-[#131722] hover:text-[#2962FF] dark:text-[#D1D4DC] dark:hover:text-[#2962FF]"
            >
              Export Vercel ZIP
            </a>
            <span>·</span>
            <span>TRADERSPRO254</span>
          </div>
        </div>
      </footer>

      <CheckoutModal
        item={checkoutItem}
        geo={geo}
        userId={fbUser?.uid || null}
        userEmail={fbUser?.email || null}
        onClose={() => setCheckoutItem(null)}
        onRequireSignIn={handleSignIn}
        onPaymentConfirmed={handlePaymentConfirmed}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 rounded-md border border-[#1E222D] bg-[#131722] px-4 py-2.5 text-xs font-medium text-white shadow-lg dark:border-[#2A2E39] dark:bg-[#131722] dark:text-[#D1D4DC]"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
