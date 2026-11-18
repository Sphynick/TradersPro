import { useState } from 'react';
import { Download, LogOut, Monitor, Moon, Package, Shield, Sun, Trash2, User } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { signOutUser } from '../lib/firebase';
import { PWAInstallButton } from '../lib/pwa';
import type { ActiveRoute, ServerConfig, ThemeMode, UserProfile } from '../types/app';

interface SettingsViewProps {
  user: UserProfile | null;
  config: ServerConfig | null;
  theme: ThemeMode;
  onChangeTheme: (t: ThemeMode) => void;
  onRefreshUser: () => void;
  onClearDerivToken: () => void;
  onOpenAuth: () => void;
  onNavigate: (r: ActiveRoute) => void;
}

export function SettingsView({
  user,
  config,
  theme,
  onChangeTheme,
  onRefreshUser,
  onClearDerivToken,
  onOpenAuth,
  onNavigate,
}: SettingsViewProps) {
  const [name, setName] = useState(user?.name || '');
  const [country, setCountry] = useState(user?.country || config?.country || 'KE');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    setMsg('');
    try {
      await apiFetch('/me', { method: 'POST', json: { name, country, theme } });
      setMsg('Preferences saved.');
      onRefreshUser();
    } catch (e: any) {
      setMsg(e?.message || 'Could not save preferences.');
    } finally {
      setSaving(false);
    }
  };

  const clearDeviceCache = () => {
    try {
      const keepTheme = localStorage.getItem('tp254.theme');
      localStorage.clear();
      if (keepTheme) localStorage.setItem('tp254.theme', keepTheme);
    } catch {}
    onClearDerivToken();
    setMsg('Device cache and stored Deriv token cleared.');
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Account &amp; Settings</h1>
          <p className="text-xs text-slate-500 dark:text-[#787B86]">
            Theme, region pricing, app install, device cache, and your order history.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <PWAInstallButton />
          {user && (
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] text-xs font-semibold text-slate-700 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#131722]"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className="p-3 rounded-xl bg-[#2962FF]/10 border border-[#2962FF]/30 text-xs text-slate-800 dark:text-[#D1D4DC]">
          {msg}
        </div>
      )}

      {/* Theme Picker */}
      <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5 space-y-3">
        <div className="text-xs font-bold text-slate-900 dark:text-white">Display Theme</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'system' as ThemeMode, label: 'System Default', icon: Monitor },
            { id: 'light' as ThemeMode, label: 'Light Mode', icon: Sun },
            { id: 'dark' as ThemeMode, label: 'Pure Black Dark', icon: Moon },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChangeTheme(t.id)}
                className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                  theme === t.id
                    ? 'border-[#2962FF] bg-[#2962FF]/12 text-[#2962FF]'
                    : 'border-slate-200 dark:border-[#1E222D] text-slate-600 dark:text-[#B2B5BE]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Account Profile */}
      <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5 space-y-4">
        {!user ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-[#B2B5BE]">
              <User className="w-5 h-5 text-[#2962FF]" />
              <span>Sign in to view your unlocked bots, orders, and Forex signals.</span>
            </div>
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-4 py-2 rounded-xl bg-[#2962FF] text-white text-xs font-semibold shrink-0"
            >
              Sign In
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-900 dark:text-white">Profile &amp; Currency Region</div>
              {user.isAdmin && (
                <button
                  type="button"
                  onClick={() => onNavigate('admin')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#2962FF] hover:underline"
                >
                  <Shield className="w-3.5 h-3.5" />
                  Open Admin Dashboard
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-[#787B86] mb-1">Email</label>
                <input
                  type="text"
                  readOnly
                  value={user.email}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-100 dark:bg-black/60 text-xs text-slate-500"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-[#787B86] mb-1">Display Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-[#787B86] mb-1">Country (KE = KSh, others USD)</label>
                <input
                  type="text"
                  maxLength={2}
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black text-xs font-mono uppercase text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveProfile()}
                className="px-4 py-2 rounded-xl bg-[#2962FF] hover:bg-[#1E53E5] text-white text-xs font-semibold disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
              <button
                type="button"
                onClick={clearDeviceCache}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] text-xs font-medium text-slate-600 dark:text-[#B2B5BE] hover:bg-slate-100 dark:hover:bg-[#131722]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Device Cache &amp; Token
              </button>
            </div>
          </>
        )}
      </div>

      {/* Order History */}
      {user && (
        <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5 space-y-3">
          <div className="text-xs font-bold text-slate-900 dark:text-white">Your Recent Orders</div>
          {!user.orders?.length ? (
            <p className="text-xs text-slate-500 dark:text-[#787B86]">No orders submitted yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#1E222D] text-slate-500 dark:text-[#787B86]">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Product</th>
                    <th className="py-2 pr-3">Method</th>
                    <th className="py-2 pr-3">Amount</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#1E222D]">
                  {user.orders.map((o) => (
                    <tr key={o.ref}>
                      <td className="py-2 pr-3 font-mono text-slate-500">{new Date(o.t).toLocaleDateString()}</td>
                      <td className="py-2 pr-3 font-medium text-slate-900 dark:text-white">{o.botId}</td>
                      <td className="py-2 pr-3 uppercase">{o.method}</td>
                      <td className="py-2 pr-3 font-mono">{o.price.toLocaleString()} KSh</td>
                      <td className="py-2">
                        <span
                          className={`font-semibold uppercase text-[11px] ${
                            o.status === 'approved'
                              ? 'text-[#089981]'
                              : o.status === 'rejected'
                              ? 'text-[#F23645]'
                              : 'text-amber-500'
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
        </div>
      )}

      {/* Download GitHub + Vercel Deployment ZIP */}
      <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Package className="w-5 h-5 text-[#2962FF] shrink-0 mt-0.5" />
          <div className="text-xs">
            <div className="font-bold text-slate-900 dark:text-white">Download GitHub &amp; Vercel Source ZIP</div>
            <div className="text-slate-500 dark:text-[#787B86] mt-0.5">
              Clean archive excluding secrets, ready to push to GitHub and deploy to Vercel Hobby.
            </div>
          </div>
        </div>
        <a
          href="/api/export-zip"
          download="traderspro254-github-vercel.zip"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] text-xs font-semibold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-[#131722] shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-[#2962FF]" />
          Download ZIP
        </a>
      </div>
    </div>
  );
}
