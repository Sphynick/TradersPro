import { addDoc, arrayUnion, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { Download, Globe, LogOut, Moon, Plus, ShieldCheck, Sun } from 'lucide-react';
import { useState } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import type { GeoInfo, OrderRecord } from '../types/app.ts';

interface SettingsViewProps {
  theme: 'light' | 'dark';
  onSetTheme: (next: 'light' | 'dark') => void;
  geo: GeoInfo;
  onOverrideCountry: (code: string) => void;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  isAdmin: boolean;
  licenses: string[];
  signalSubEnd: number;
  orders: OrderRecord[];
  allOrders: OrderRecord[];
  onSignIn: () => void;
  onSignOut: () => void;
}

export function SettingsView({
  theme,
  onSetTheme,
  geo,
  onOverrideCountry,
  userId,
  userEmail,
  userName,
  isAdmin,
  licenses,
  signalSubEnd,
  orders,
  allOrders,
  onSignIn,
  onSignOut,
}: SettingsViewProps) {
  const [sigPair, setSigPair] = useState('XAUUSD');
  const [sigDir, setSigDir] = useState<'BUY' | 'SELL'>('BUY');
  const [sigEntry, setSigEntry] = useState('2645.50');
  const [sigSl, setSigSl] = useState('2638.00');
  const [sigTp, setSigTp] = useState('2662.00');
  const [sigTf, setSigTf] = useState('15M');
  const [sigNotes, setSigNotes] = useState('1H liquidity sweep + 5M order block confirmation.');
  const [adminMsg, setAdminMsg] = useState('');

  const handlePublishSignal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !isAdmin) return;
    setAdminMsg('');
    try {
      await addDoc(collection(db, 'signals'), {
        pair: sigPair.trim().toUpperCase().slice(0, 24),
        direction: sigDir,
        entry: sigEntry.trim().slice(0, 24),
        stopLoss: sigSl.trim().slice(0, 24),
        takeProfit: sigTp.trim().slice(0, 24),
        timeframe: sigTf.trim().slice(0, 12),
        strategy: 'SMC / ICT Liquidity',
        status: 'active',
        published: true,
        notes: sigNotes.trim().slice(0, 400),
        authorId: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setAdminMsg('Signal published live to Firestore.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'signals');
    }
  };

  const handleApproveOrder = async (ord: OrderRecord) => {
    if (!isAdmin) return;
    setAdminMsg('');
    try {
      await updateDoc(doc(db, 'orders', ord.id), {
        status: 'paid',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${ord.id}`);
    }

    try {
      if (ord.itemId === 'signals-monthly') {
        const thirtyDays = Date.now() + 30 * 24 * 60 * 60 * 1000;
        await updateDoc(doc(db, 'users', ord.userId), {
          signalSubEnd: thirtyDays,
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'users', ord.userId), {
          licenses: arrayUnion(ord.itemId),
          updatedAt: serverTimestamp(),
        });
      }
      setAdminMsg(`Approved ${ord.itemName} for ${ord.userEmail}.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${ord.userId}`);
    }
  };

  return (
    <div className="space-y-7">
      <div className="border-b border-[#E0E3EB] pb-5 dark:border-[#1E222D]">
        <p className="font-mono text-xs font-medium text-[#787B86]">
          Workspace Preferences & Deployment
        </p>
        <h1 className="font-display mt-1 text-2xl font-bold text-[#131722] dark:text-[#F0F3FA] sm:text-3xl">
          Settings, Account & Export
        </h1>
      </div>

      {/* Preferences Grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Theme Selector */}
        <section className="rounded-lg border border-[#E0E3EB] bg-white p-5 dark:border-[#1E222D] dark:bg-[#0D1017]">
          <h2 className="font-display text-base font-semibold text-[#131722] dark:text-[#F0F3FA]">
            Appearance
          </h2>
          <p className="mt-1 text-sm text-[#5D606B] dark:text-[#9598A1]">
            Switch between daylight light mode and pure black (#000000) dark mode.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onSetTheme('light')}
              className={`flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors ${
                theme === 'light'
                  ? 'border-[#2962FF] bg-[#2962FF]/10 text-[#2962FF]'
                  : 'border-[#E0E3EB] text-[#5D606B] hover:bg-[#F0F3FA] dark:border-[#2A2E39] dark:text-[#9598A1] dark:hover:bg-[#131722]'
              }`}
            >
              <Sun className="h-4 w-4" />
              Light Theme
            </button>

            <button
              type="button"
              onClick={() => onSetTheme('dark')}
              className={`flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors ${
                theme === 'dark'
                  ? 'border-[#2962FF] bg-[#2962FF]/15 text-[#2962FF]'
                  : 'border-[#E0E3EB] text-[#5D606B] hover:bg-[#F0F3FA] dark:border-[#2A2E39] dark:text-[#9598A1] dark:hover:bg-[#131722]'
              }`}
            >
              <Moon className="h-4 w-4" />
              Black Theme
            </button>
          </div>
        </section>

        {/* Region & Payment Routing */}
        <section className="rounded-lg border border-[#E0E3EB] bg-white p-5 dark:border-[#1E222D] dark:bg-[#0D1017]">
          <h2 className="font-display flex items-center gap-2 text-base font-semibold text-[#131722] dark:text-[#F0F3FA]">
            <Globe className="h-4 w-4 text-[#2962FF]" />
            Region & Payment Checkout
          </h2>
          <p className="mt-1 text-sm text-[#5D606B] dark:text-[#9598A1]">
            Kenyan visitors see M-Pesa STK Push & Pochi first; international users see PayPal USD first.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onOverrideCountry('KE')}
              className={`h-11 rounded-md border px-3 text-xs font-medium transition-colors ${
                geo.isKenya
                  ? 'border-[#089981] bg-[#089981]/10 text-[#089981]'
                  : 'border-[#E0E3EB] text-[#5D606B] hover:bg-[#F0F3FA] dark:border-[#2A2E39] dark:text-[#9598A1]'
              }`}
            >
              Kenya (KE · M-Pesa)
            </button>
            <button
              type="button"
              onClick={() => onOverrideCountry('US')}
              className={`h-11 rounded-md border px-3 text-xs font-medium transition-colors ${
                !geo.isKenya
                  ? 'border-[#2962FF] bg-[#2962FF]/10 text-[#2962FF]'
                  : 'border-[#E0E3EB] text-[#5D606B] hover:bg-[#F0F3FA] dark:border-[#2A2E39] dark:text-[#9598A1]'
              }`}
            >
              International (PayPal)
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-4 font-mono text-xs text-[#787B86]">
            <span>M-Pesa API: {geo.mpesaConfigured ? 'Configured' : 'Needs .env keys'}</span>
            <span>·</span>
            <span>PayPal API: {geo.paypalConfigured ? 'Configured' : 'Needs .env keys'}</span>
          </div>
        </section>
      </div>

      {/* Firebase Account & GitHub/Vercel ZIP Export */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <section className="rounded-lg border border-[#E0E3EB] bg-white p-5 dark:border-[#1E222D] dark:bg-[#0D1017]">
          <h2 className="font-display text-base font-semibold text-[#131722] dark:text-[#F0F3FA]">
            Firebase Account
          </h2>
          {userId ? (
            <div className="mt-3 space-y-3">
              <div className="rounded border border-[#E0E3EB] bg-[#F8FAFD] p-3.5 text-sm dark:border-[#1E222D] dark:bg-black">
                <p className="font-medium text-[#131722] dark:text-[#F0F3FA]">{userName || 'Trader'}</p>
                <p className="text-xs text-[#787B86]">{userEmail}</p>
                <p className="mt-2 font-mono text-xs text-[#5D606B] dark:text-[#9598A1]">
                  Unlocked bots: {licenses.length} · Signals:{' '}
                  {isAdmin || signalSubEnd > Date.now() ? 'Active' : 'Inactive'}
                </p>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex h-9 items-center gap-2 rounded border border-[#E0E3EB] px-4 text-xs font-medium text-[#131722] hover:bg-[#F0F3FA] dark:border-[#2A2E39] dark:text-[#D1D4DC] dark:hover:bg-[#131722]"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-[#5D606B] dark:text-[#9598A1]">
                Sign in with Google to save your bot licenses, trade logs, and MT5 configurations in Cloud Firestore.
              </p>
              <button
                type="button"
                onClick={onSignIn}
                className="inline-flex h-9 items-center rounded-md bg-[#2962FF] px-4 text-xs font-semibold text-white hover:bg-[#1E53E5]"
              >
                Sign in with Google
              </button>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-[#E0E3EB] bg-white p-5 dark:border-[#1E222D] dark:bg-[#0D1017]">
          <h2 className="font-display text-base font-semibold text-[#131722] dark:text-[#F0F3FA]">
            GitHub & Vercel Export
          </h2>
          <p className="mt-1 text-sm text-[#5D606B] dark:text-[#9598A1]">
            Download the complete source archive including <code className="text-xs">vercel.json</code>,{' '}
            <code className="text-xs">api/</code> M-Pesa & PayPal routes, and Firebase configuration.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <a
              href="/api/export-zip"
              download="traderspro254-github-vercel.zip"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#2962FF] px-4 text-xs font-semibold text-white hover:bg-[#1E53E5]"
            >
              <Download className="h-4 w-4" />
              Download Project ZIP
            </a>
          </div>
          <p className="mt-3 text-xs text-[#787B86]">
            After deploying on Vercel, add your Vercel URL in Firebase Console &rarr; Authentication &rarr; Authorized domains.
          </p>
        </section>
      </div>

      {/* User Order History */}
      {userId && (
        <section className="rounded-lg border border-[#E0E3EB] bg-white p-5 dark:border-[#1E222D] dark:bg-[#0D1017]">
          <h2 className="font-display text-base font-semibold text-[#131722] dark:text-[#F0F3FA]">
            Your Payment Orders
          </h2>
          {orders.length === 0 ? (
            <p className="mt-2 text-sm text-[#787B86]">
              No orders recorded on this account yet.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#E0E3EB] text-xs text-[#787B86] dark:border-[#1E222D]">
                    <th className="py-2 pr-4">Item</th>
                    <th className="py-2 pr-4">Method</th>
                    <th className="py-2 pr-4">Reference</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E0E3EB] font-mono text-xs tabular-nums dark:divide-[#1E222D]">
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2.5 pr-4 font-sans font-medium text-[#131722] dark:text-[#F0F3FA]">
                        {o.itemName}
                      </td>
                      <td className="py-2.5 pr-4 text-[#787B86]">{o.method}</td>
                      <td className="py-2.5 pr-4 text-[#787B86]">{o.reference || '—'}</td>
                      <td className="py-2.5 pr-4 text-[#131722] dark:text-[#D1D4DC]">
                        ${o.amountUsd} / KSh {o.amountKsh.toLocaleString()}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`font-semibold uppercase ${
                            o.status === 'paid'
                              ? 'text-[#089981]'
                              : o.status === 'pending'
                                ? 'text-[#F59E0B]'
                                : 'text-[#F23645]'
                          }`}
                        >
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Admin Management Console */}
      {isAdmin && (
        <section className="space-y-6 rounded-lg border border-[#E0E3EB] bg-white p-5 dark:border-[#1E222D] dark:bg-[#0D1017]">
          <div className="flex items-center gap-2 border-b border-[#E0E3EB] pb-4 dark:border-[#1E222D]">
            <ShieldCheck className="h-5 w-5 text-[#089981]" />
            <div>
              <h2 className="font-display text-base font-semibold text-[#131722] dark:text-[#F0F3FA]">
                Admin Workspace
              </h2>
              <p className="text-xs text-[#787B86]">
                Publish live Forex signals and approve customer M-Pesa / PayPal orders.
              </p>
            </div>
          </div>

          {adminMsg && (
            <p className="rounded border border-[#089981]/30 bg-[#089981]/10 px-3 py-2 text-xs text-[#089981]">
              {adminMsg}
            </p>
          )}

          {/* Publish Signal Form */}
          <form onSubmit={handlePublishSignal} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            <input
              type="text"
              value={sigPair}
              onChange={(e) => setSigPair(e.target.value)}
              placeholder="Pair (XAUUSD)"
              className="h-9 rounded border border-[#E0E3EB] bg-white px-3 font-mono text-xs text-[#131722] dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
            />
            <select
              value={sigDir}
              onChange={(e) => setSigDir(e.target.value as any)}
              className="h-9 rounded border border-[#E0E3EB] bg-white px-3 text-xs font-medium text-[#131722] dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
            >
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
            <input
              type="text"
              value={sigEntry}
              onChange={(e) => setSigEntry(e.target.value)}
              placeholder="Entry"
              className="h-9 rounded border border-[#E0E3EB] bg-white px-3 font-mono text-xs text-[#131722] dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
            />
            <input
              type="text"
              value={sigSl}
              onChange={(e) => setSigSl(e.target.value)}
              placeholder="Stop Loss"
              className="h-9 rounded border border-[#E0E3EB] bg-white px-3 font-mono text-xs text-[#131722] dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
            />
            <input
              type="text"
              value={sigTp}
              onChange={(e) => setSigTp(e.target.value)}
              placeholder="Take Profit"
              className="h-9 rounded border border-[#E0E3EB] bg-white px-3 font-mono text-xs text-[#131722] dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
            />
            <input
              type="text"
              value={sigTf}
              onChange={(e) => setSigTf(e.target.value)}
              placeholder="Timeframe"
              className="h-9 rounded border border-[#E0E3EB] bg-white px-3 font-mono text-xs text-[#131722] dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
            />
            <input
              type="text"
              value={sigNotes}
              onChange={(e) => setSigNotes(e.target.value)}
              placeholder="SMC / ICT setup notes..."
              className="col-span-2 h-9 rounded border border-[#E0E3EB] bg-white px-3 text-xs text-[#131722] sm:col-span-4 dark:border-[#2A2E39] dark:bg-black dark:text-[#D1D4DC]"
            />
            <button
              type="submit"
              className="col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded bg-[#089981] px-4 text-xs font-semibold text-white hover:bg-[#06806B]"
            >
              <Plus className="h-4 w-4" />
              Publish Signal
            </button>
          </form>

          {/* Pending Orders Queue */}
          <div>
            <h3 className="text-sm font-semibold text-[#131722] dark:text-[#F0F3FA]">
              All Customer Orders ({allOrders.length})
            </h3>
            {allOrders.length === 0 ? (
              <p className="mt-1 text-xs text-[#787B86]">No customer orders yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E0E3EB] text-[#787B86] dark:border-[#1E222D]">
                      <th className="py-2 pr-3">Customer</th>
                      <th className="py-2 pr-3">Item</th>
                      <th className="py-2 pr-3">Method</th>
                      <th className="py-2 pr-3">Ref</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E0E3EB] dark:divide-[#1E222D]">
                    {allOrders.map((ord) => (
                      <tr key={ord.id}>
                        <td className="py-2 pr-3 text-[#5D606B] dark:text-[#9598A1]">{ord.userEmail}</td>
                        <td className="py-2 pr-3 font-medium text-[#131722] dark:text-[#F0F3FA]">{ord.itemName}</td>
                        <td className="py-2 pr-3 font-mono">{ord.method}</td>
                        <td className="py-2 pr-3 font-mono">{ord.reference}</td>
                        <td className="py-2 pr-3 font-mono uppercase">{ord.status}</td>
                        <td className="py-2">
                          {ord.status === 'pending' ? (
                            <button
                              type="button"
                              onClick={() => handleApproveOrder(ord)}
                              className="rounded bg-[#089981] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#06806B]"
                            >
                              Approve & Unlock
                            </button>
                          ) : (
                            <span className="text-[#787B86]">Completed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
