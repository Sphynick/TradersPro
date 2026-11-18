import { useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Download,
  FileCode2,
  LayoutDashboard,
  Megaphone,
  Monitor,
  Power,
  Radio,
  RefreshCw,
  ScrollText,
  Settings,
  ShoppingBag,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { apiFetch, downloadWithAuth } from '../lib/api';
import { describeRules } from '../lib/rulesCore';
import { generateBotSecret, sealEntry } from '../lib/vaultCore';
import type { CatalogItem, ServerConfig } from '../types/app';

interface AdminViewProps {
  catalog: CatalogItem[];
  config: ServerConfig | null;
  prices: Record<string, number> | null;
  onRefreshGlobal: () => void;
}

type AdminSection =
  | 'overview'
  | 'orders'
  | 'clients'
  | 'bots'
  | 'prices'
  | 'payments'
  | 'robots'
  | 'signals'
  | 'studio'
  | 'announcements'
  | 'audit'
  | 'settings';

const NAV_SECTIONS: Array<{ id: AdminSection; label: string; icon: any }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'bots', label: 'Bots & Catalog', icon: Bot },
  { id: 'prices', label: 'Prices & FX', icon: DollarSign },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'robots', label: 'Robots MT5', icon: Monitor },
  { id: 'signals', label: 'Signals & Engine', icon: Radio },
  { id: 'studio', label: 'Bot Studio AI', icon: Sparkles },
  { id: 'announcements', label: 'Banners', icon: Megaphone },
  { id: 'audit', label: 'Audit & Export', icon: ScrollText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function AdminView({ catalog, config, prices, onRefreshGlobal }: AdminViewProps) {
  const [section, setSection] = useState<AdminSection>('overview');
  const [adminKey, setAdminKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Section data
  const [overview, setOverview] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderFilter, setOrderFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [orderQuery, setOrderQuery] = useState('');

  const [clients, setClients] = useState<any[]>([]);
  const [clientQuery, setClientQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [clientNote, setClientNote] = useState('');
  const [grantBotId, setGrantBotId] = useState('killer');

  const [priceDraft, setPriceDraft] = useState<Record<string, string>>({});
  const [cfgDraft, setCfgDraft] = useState<any>({});
  const [testPhone, setTestPhone] = useState('');

  const [robots, setRobots] = useState<any[]>([]);
  const [sigAdmin, setSigAdmin] = useState<any>(null);
  const [manualSig, setManualSig] = useState({ symbol: 'XAUUSD', tf: 'M15', dir: 'BUY', entry: '', sl: '', tp1: '', tp2: '', notes: '' });

  // Bots & Catalog Add
  const [newBot, setNewBot] = useState({ id: '', name: '', section: 'automated', category: 'digits', price: '2500', desc: '', how: '', code: '' });

  // Bot Studio AI
  const [studioPrompt, setStudioPrompt] = useState('');
  const [studioRules, setStudioRules] = useState<any>(null);
  const [studioMeta, setStudioMeta] = useState({ id: '', name: '', price: '2500', desc: '' });

  // Announcements, Audit, Admins
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [newAnn, setNewAnn] = useState({ message: '', kind: 'info' });
  const [auditEntries, setAuditEntries] = useState<any[]>([]);
  const [adminList, setAdminList] = useState<string[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');

  const call = (path: string, opts?: any) => apiFetch(path, { ...opts, adminKey: adminKey || undefined });

  const loadSection = async (s = section) => {
    setErr('');
    setLoading(true);
    try {
      if (s === 'overview') setOverview(await call('/admin/overview'));
      if (s === 'orders') setOrders((await call('/admin/orders')).orders || []);
      if (s === 'clients') setClients((await call('/admin/clients')).clients || []);
      if (s === 'prices') {
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(prices || {})) next[k] = String(v);
        setPriceDraft(next);
      }
      if (s === 'payments') {
        setCfgDraft({
          payMode: config?.rawPayMode || 'both',
          pochi: config?.pochi || '',
          whatsapp: config?.whatsapp || '',
          paypal: config?.paypal || '',
          usdtAddress: config?.usdtAddress || '',
          usdtNetwork: config?.usdtNetwork || 'TRC20',
          usdRate: String(config?.usdRate || 130),
          autoApprove: false,
          showUsdForeign: config?.showUsdForeign ?? true,
        });
      }
      if (s === 'robots') setRobots((await call('/admin/robots')).robots || []);
      if (s === 'signals') setSigAdmin(await call('/admin/signals'));
      if (s === 'announcements') setAnnouncements((await call('/admin/announcements')).announcements || []);
      if (s === 'audit') setAuditEntries((await call('/admin/audit')).entries || []);
      if (s === 'settings') {
        const a = await call('/admin/admins');
        setAdminList(a.emails || []);
        setCfgDraft((prev: any) => ({ ...prev, maintenance: !!config?.maintenance }));
      }
    } catch (e: any) {
      setErr(e?.message || 'Could not load admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSection(section);
  }, [section]);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 3500);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">Admin Control Center</h1>
          <p className="text-xs text-slate-500 dark:text-[#787B86]">
            Full management for orders, clients, encrypted catalog, prices, Daraja/PayPal, MT5 robots, Engine &amp; AI.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Optional X-Admin Key"
            className="w-36 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] text-xs"
          />
          <button
            type="button"
            onClick={() => void loadSection(section)}
            className="p-2 rounded-lg border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] text-slate-600 dark:text-[#B2B5BE]"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 12-Section Pill Strip */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-[#1E222D] pb-3">
        {NAV_SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                section === s.id
                  ? 'bg-[#2962FF] text-white'
                  : 'bg-white dark:bg-[#0D1017] border border-slate-200 dark:border-[#1E222D] text-slate-600 dark:text-[#B2B5BE]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>

      {err && <div className="p-3 rounded-xl bg-[#F23645]/10 border border-[#F23645]/30 text-xs text-[#F23645]">{err}</div>}
      {msg && <div className="p-3 rounded-xl bg-[#089981]/10 border border-[#089981]/30 text-xs text-[#089981]">{msg}</div>}

      {/* 1. OVERVIEW */}
      {section === 'overview' && overview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Revenue (24h)" value={`${overview.rev1d.ksh.toLocaleString()} KSh`} sub={`$${overview.rev1d.usd} USD`} />
            <StatCard label="Revenue (7 Days)" value={`${overview.rev7d.ksh.toLocaleString()} KSh`} sub={`$${overview.rev7d.usd} USD`} />
            <StatCard label="Revenue (30 Days)" value={`${overview.rev30d.ksh.toLocaleString()} KSh`} sub={`$${overview.rev30d.usd} USD`} />
            <StatCard label="Pending Orders" value={String(overview.pendingOrders)} sub={`${overview.totalUsers} clients (${overview.newUsers7d} new)`} />
            <StatCard label="Active Signal Subs" value={String(overview.activeSubs)} />
            <StatCard label="MT5 Robots Online" value={`${overview.robotsOnline} / ${overview.robotsTotal}`} />
            <StatCard label="Market Engine" value={overview.engineOnline ? 'ONLINE' : overview.engineOn ? 'STANDBY' : 'OFF'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-3">
              <div className="text-xs font-bold text-slate-900 dark:text-white">7-Day Revenue Trend (KSh)</div>
              <div className="h-36 flex items-end gap-2 pt-4">
                {(() => {
                  const max = Math.max(1, ...(overview.chart || []).map((c: any) => c.ksh));
                  return (overview.chart || []).map((c: any) => (
                    <div key={c.label} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-[#2962FF]/20 rounded-t-md flex items-end justify-center h-24">
                        <div className="w-full bg-[#2962FF] rounded-t-md" style={{ height: `${Math.max(4, (c.ksh / max) * 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-500">{c.label}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-2.5">
              <div className="text-xs font-bold text-slate-900 dark:text-white">6-Service Health Grid</div>
              {Object.entries(overview.health || {}).map(([k, v]: [string, any]) => (
                <div key={k} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-[#1E222D]/60">
                  <span className="uppercase font-semibold text-slate-700 dark:text-[#D1D4DC]">{k}</span>
                  <span className={v.ok ? 'text-[#089981]' : 'text-amber-500'}>{v.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. ORDERS */}
      {section === 'orders' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setOrderFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${
                    orderFilter === f ? 'bg-[#2962FF] text-white' : 'border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017]'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={orderQuery}
              onChange={(e) => setOrderQuery(e.target.value)}
              placeholder="Search email, M-Pesa code, ref..."
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] text-xs"
            />
          </div>

          <div className="space-y-2.5">
            {orders
              .filter((o) => orderFilter === 'all' || o.status === orderFilter)
              .filter((o) => !orderQuery || JSON.stringify(o).toLowerCase().includes(orderQuery.toLowerCase()))
              .map((o) => (
                <div key={o.ref} className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white">{o.botName || o.botId}</span>
                      <span className="ml-2 font-mono text-slate-500">{o.price} KSh · {o.method.toUpperCase()}</span>
                    </div>
                    <span className={`font-bold uppercase ${o.status === 'approved' ? 'text-[#089981]' : o.status === 'rejected' ? 'text-[#F23645]' : 'text-amber-500'}`}>
                      {o.status}
                    </span>
                  </div>
                  <div className="text-slate-500 dark:text-[#787B86]">
                    {o.email} · WA: {o.whatsapp || '—'} · Proof: <strong className="text-slate-800 dark:text-[#D1D4DC]">{o.info?.code || o.proof || o.ref}</strong>
                    {o.info && !o.info.amountOk && <span className="ml-2 text-[#F23645] font-bold">[AMOUNT MISMATCH]</span>}
                    {o.info && !o.info.toOwner && <span className="ml-2 text-amber-500 font-bold">[RECIPIENT CHECK]</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {o.status !== 'approved' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await call('/admin/approve', { method: 'POST', json: { ref: o.ref, action: 'approve' } });
                          flash('Order approved and license granted.');
                          void loadSection('orders');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#089981] text-white font-semibold"
                      >
                        Approve &amp; Unlock
                      </button>
                    )}
                    {o.status === 'pending' && (
                      <button
                        type="button"
                        onClick={async () => {
                          await call('/admin/approve', { method: 'POST', json: { ref: o.ref, action: 'reject', reason: 'Payment could not be verified' } });
                          flash('Order rejected.');
                          void loadSection('orders');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#F23645]/15 text-[#F23645] font-semibold"
                      >
                        Reject
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        await call('/admin/order', { method: 'POST', json: { ref: o.ref, action: 'delete' } });
                        flash('Order removed.');
                        void loadSection('orders');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#1E222D] text-slate-500"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 3. CLIENTS */}
      {section === 'clients' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-6 space-y-2.5">
            <input
              type="search"
              value={clientQuery}
              onChange={(e) => setClientQuery(e.target.value)}
              placeholder="Search client email or name..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] text-xs"
            />
            <div className="space-y-2 max-h-[65vh] overflow-y-auto">
              {clients
                .filter((c) => !clientQuery || (c.email + ' ' + c.name).toLowerCase().includes(clientQuery.toLowerCase()))
                .map((c) => (
                  <button
                    key={c.account}
                    type="button"
                    onClick={() => {
                      setSelectedClient(c);
                      setClientNote(c.adminNote || '');
                    }}
                    className={`w-full text-left rounded-xl border p-3 text-xs ${
                      selectedClient?.account === c.account
                        ? 'border-[#2962FF] bg-[#2962FF]/8'
                        : 'border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 dark:text-white">{c.name}</span>
                      <span className={c.blocked ? 'text-[#F23645] font-bold' : 'text-[#089981]'}>
                        {c.blocked ? 'BLOCKED' : `${c.bots.length} bots`}
                      </span>
                    </div>
                    <div className="text-slate-500 dark:text-[#787B86]">{c.email}</div>
                  </button>
                ))}
            </div>
          </div>

          <div className="lg:col-span-6">
            {selectedClient ? (
              <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-4 text-xs">
                <div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white">{selectedClient.email}</div>
                  <div className="text-slate-500">
                    Bots: {selectedClient.bots.join(', ') || 'None'} · AI credits: {selectedClient.aiLeft} · Signal Sub:{' '}
                    {selectedClient.subActive ? new Date(selectedClient.subEnd).toLocaleDateString() : 'Inactive'}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <select
                    value={grantBotId}
                    onChange={(e) => setGrantBotId(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black"
                  >
                    {catalog.filter((c) => c.locked).map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                    <option value="engine">Market Engine Lifetime</option>
                  </select>
                  <button
                    type="button"
                    onClick={async () => {
                      await call('/admin/license', { method: 'POST', json: { account: selectedClient.account, botId: grantBotId, action: 'grant' } });
                      flash('Granted ' + grantBotId);
                      void loadSection('clients');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#089981] text-white font-semibold"
                  >
                    Grant
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await call('/admin/license', { method: 'POST', json: { account: selectedClient.account, botId: grantBotId, action: 'revoke' } });
                      flash('Revoked ' + grantBotId);
                      void loadSection('clients');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#F23645]/15 text-[#F23645] font-semibold"
                  >
                    Revoke
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await call('/admin/license', { method: 'POST', json: { account: selectedClient.account, action: 'extend', amount: 7 } });
                      flash('+7 days signals added.');
                      void loadSection('clients');
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#1E222D] font-semibold"
                  >
                    +7d Signals
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await call('/admin/license', { method: 'POST', json: { account: selectedClient.account, action: 'addcredits', amount: 5 } });
                      flash('+5 AI scans added.');
                      void loadSection('clients');
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#1E222D] font-semibold"
                  >
                    +5 AI Credits
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await call('/admin/license', { method: 'POST', json: { account: selectedClient.account, action: 'resetfree' } });
                      flash('Free trial reset.');
                      void loadSection('clients');
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#1E222D] font-semibold"
                  >
                    Reset Trial
                  </button>
                </div>

                <div className="space-y-2">
                  <textarea
                    rows={2}
                    value={clientNote}
                    onChange={(e) => setClientNote(e.target.value)}
                    placeholder="Admin private note..."
                    className="w-full p-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await call('/admin/client', { method: 'POST', json: { account: selectedClient.account, action: 'note', note: clientNote } });
                        flash('Note saved.');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#2962FF] text-white font-semibold"
                    >
                      Save Note
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await call('/admin/client', { method: 'POST', json: { account: selectedClient.account, action: selectedClient.blocked ? 'unblock' : 'block' } });
                        flash(selectedClient.blocked ? 'Unblocked' : 'Blocked');
                        void loadSection('clients');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-500 font-semibold"
                    >
                      {selectedClient.blocked ? 'Unblock' : 'Block'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await call('/admin/client', { method: 'POST', json: { account: selectedClient.account, action: 'logout' } });
                        flash('User session revoked.');
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#1E222D]"
                    >
                      Force Logout
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-300 dark:border-[#2A2E39] rounded-2xl">
                Select a client on the left to manage their licenses, trials, notes, or block status.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. BOTS & CATALOG */}
      {section === 'bots' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-2.5 text-xs">
            <div className="font-bold text-slate-900 dark:text-white">Add Encrypted Bot to Catalog</div>
            <input value={newBot.id} onChange={(e) => setNewBot({ ...newBot, id: e.target.value })} placeholder="id (e.g. my-bot-v1)" className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black" />
            <input value={newBot.name} onChange={(e) => setNewBot({ ...newBot, name: e.target.value })} placeholder="Display Name" className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black" />
            <div className="grid grid-cols-2 gap-2">
              <select value={newBot.section} onChange={(e) => setNewBot({ ...newBot, section: e.target.value })} className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black">
                <option value="automated">Automated Runner</option>
                <option value="deriv">Deriv XML</option>
                <option value="forex">MT5 EA</option>
              </select>
              <input value={newBot.price} onChange={(e) => setNewBot({ ...newBot, price: e.target.value })} placeholder="Price KSh" className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black" />
            </div>
            <textarea rows={2} value={newBot.desc} onChange={(e) => setNewBot({ ...newBot, desc: e.target.value })} placeholder="Short description" className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black" />
            <textarea rows={4} value={newBot.code} onChange={(e) => setNewBot({ ...newBot, code: e.target.value })} placeholder="Paste XML, MQ5, JS create(ctx), or Rules JSON" className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black font-mono" />
            <button
              type="button"
              onClick={async () => {
                const secret = generateBotSecret();
                const ext = newBot.section === 'deriv' ? 'xml' : newBot.section === 'forex' ? 'mq5' : 'js';
                const mime = newBot.section === 'deriv' ? 'application/xml' : newBot.section === 'forex' ? 'text/plain' : 'text/javascript';
                const entry = await sealEntry(`${newBot.id}.${ext}`, mime, newBot.code, secret);
                await call('/admin/bot', {
                  method: 'POST',
                  json: { ...newBot, price: Number(newBot.price), entry, key: secret, action: 'add' },
                });
                flash('Bot encrypted & added to catalog.');
                onRefreshGlobal();
              }}
              className="w-full py-2 rounded-xl bg-[#2962FF] text-white font-semibold"
            >
              Encrypt in Browser &amp; Save Bot
            </button>
          </div>

          <div className="lg:col-span-7 space-y-2 max-h-[65vh] overflow-y-auto">
            {catalog.map((b) => (
              <div key={b.id} className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-3 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">{b.name} {b.hidden ? '(HIDDEN)' : ''}</div>
                  <div className="text-slate-500">{b.id} · {b.platform} · {b.price} KSh</div>
                </div>
                <div className="flex gap-1.5">
                  {b.id !== 'engine-ai' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await call('/admin/bot', { method: 'POST', json: { id: b.id, action: b.hidden ? 'unhide' : 'hide' } });
                        flash('Updated visibility.');
                        onRefreshGlobal();
                      }}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#1E222D]"
                    >
                      {b.hidden ? 'Unhide' : 'Hide'}
                    </button>
                  )}
                  {b.extra && (
                    <button
                      type="button"
                      onClick={async () => {
                        await call('/admin/bot', { method: 'POST', json: { id: b.id, action: 'delete' } });
                        flash('Bot deleted.');
                        onRefreshGlobal();
                      }}
                      className="px-2.5 py-1 rounded-lg text-[#F23645] border border-[#F23645]/30"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. PRICES */}
      {section === 'prices' && (
        <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            {Object.entries(priceDraft).map(([id, val]) => (
              <div key={id}>
                <label className="block text-slate-500 dark:text-[#787B86] mb-1 font-mono">{id}</label>
                <input
                  type="number"
                  value={val}
                  onChange={(e) => setPriceDraft({ ...priceDraft, [id]: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black font-mono"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={async () => {
              await call('/admin/prices', { method: 'POST', json: { prices: priceDraft } });
              flash('Prices updated across catalog.');
              onRefreshGlobal();
            }}
            className="px-5 py-2.5 rounded-xl bg-[#2962FF] text-white text-xs font-semibold"
          >
            Save All Prices
          </button>
        </div>
      )}

      {/* 6. PAYMENTS SETTINGS */}
      {section === 'payments' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-3">
            <div className="font-bold text-sm text-slate-900 dark:text-white">Payment Gateway &amp; Currency Settings</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-500 mb-1">Kenya Pay Mode</label>
                <select value={cfgDraft.payMode || 'both'} onChange={(e) => setCfgDraft({ ...cfgDraft, payMode: e.target.value })} className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black">
                  <option value="both">Both STK + Pochi</option>
                  <option value="manual">Pochi SMS Only</option>
                  <option value="stk">STK Prompt Only</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">KES per 1 USD</label>
                <input value={cfgDraft.usdRate || '130'} onChange={(e) => setCfgDraft({ ...cfgDraft, usdRate: e.target.value })} className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black font-mono" />
              </div>
            </div>
            <input value={cfgDraft.pochi || ''} onChange={(e) => setCfgDraft({ ...cfgDraft, pochi: e.target.value })} placeholder="Pochi Phone (07...)" className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black" />
            <input value={cfgDraft.whatsapp || ''} onChange={(e) => setCfgDraft({ ...cfgDraft, whatsapp: e.target.value })} placeholder="WhatsApp Number (254...)" className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black" />
            <input value={cfgDraft.paypal || ''} onChange={(e) => setCfgDraft({ ...cfgDraft, paypal: e.target.value })} placeholder="PayPal Email" className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black" />
            <input value={cfgDraft.usdtAddress || ''} onChange={(e) => setCfgDraft({ ...cfgDraft, usdtAddress: e.target.value })} placeholder="USDT Wallet Address" className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black font-mono" />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!cfgDraft.autoApprove} onChange={(e) => setCfgDraft({ ...cfgDraft, autoApprove: e.target.checked })} />
              <span>Auto-approve exact M-Pesa SMS matches</span>
            </label>
            <button
              type="button"
              onClick={async () => {
                await call('/admin/config', { method: 'POST', json: cfgDraft });
                flash('Payment settings saved.');
                onRefreshGlobal();
              }}
              className="w-full py-2.5 rounded-xl bg-[#2962FF] text-white font-semibold"
            >
              Save Payment Config
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-3 h-fit">
            <div className="font-bold text-sm text-slate-900 dark:text-white">Test Daraja STK Push (1 KSh)</div>
            <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="0712345678" className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black font-mono" />
            <button
              type="button"
              onClick={async () => {
                const res = await call('/admin/test-stk', { method: 'POST', json: { phone: testPhone } });
                flash(res.ok ? 'Test STK prompt sent!' : 'STK test failed.');
              }}
              className="px-4 py-2 rounded-xl bg-[#089981] text-white font-semibold"
            >
              Send 1 KSh Test Prompt
            </button>
          </div>
        </div>
      )}

      {/* 7. ROBOTS MT5 */}
      {section === 'robots' && (
        <div className="space-y-2.5">
          {robots.length === 0 ? (
            <div className="text-xs text-slate-500">No MT5 EA keys generated yet.</div>
          ) : (
            robots.map((r) => (
              <div key={r.key} className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-mono font-bold text-slate-900 dark:text-white">{r.key} · {r.bot}</div>
                  <div className="text-slate-500">{r.email} · Logins: {r.logins.join(', ') || 'None'} · {r.status?.online ? 'ONLINE' : 'Offline'}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await call('/admin/robot', { method: 'POST', json: { key: r.key, action: 'toggle' } });
                      flash('Robot run state toggled.');
                      void loadSection('robots');
                    }}
                    className={`px-3 py-1.5 rounded-lg font-semibold ${r.cfg?.run ? 'bg-[#089981] text-white' : 'bg-amber-500 text-black'}`}
                  >
                    {r.cfg?.run ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await call('/admin/robot', { method: 'POST', json: { key: r.key, action: 'revoke' } });
                      flash('Robot key revoked.');
                      void loadSection('robots');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#F23645]/15 text-[#F23645] font-semibold"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 8. SIGNALS & ENGINE */}
      {section === 'signals' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-slate-900 dark:text-white">Cloud Market Engine Control</span>
              <span className={sigAdmin?.eng?.online ? 'text-[#089981] font-bold' : 'text-slate-400 font-bold'}>
                {sigAdmin?.eng?.online ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  await call('/engine/switch', { method: 'POST', json: { on: !sigAdmin?.eng?.on } });
                  flash('Engine switch updated.');
                  void loadSection('signals');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#2962FF] text-white font-semibold"
              >
                <Power className="w-3.5 h-3.5" />
                {sigAdmin?.eng?.on ? 'Switch Engine OFF' : 'Switch Engine ON'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await call('/engine/tick', { method: 'POST', json: { forceBrief: true } });
                  flash('Forced Engine tick & brief completed.');
                  void loadSection('signals');
                }}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] font-semibold"
              >
                Force Tick + Brief
              </button>
            </div>
            {sigAdmin?.brief && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-black text-slate-600 dark:text-[#B2B5BE]">
                {sigAdmin.brief.summary}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-2.5">
            <div className="font-bold text-sm text-slate-900 dark:text-white">Publish Manual Analyst Signal</div>
            <div className="grid grid-cols-3 gap-2">
              <input value={manualSig.symbol} onChange={(e) => setManualSig({ ...manualSig, symbol: e.target.value })} placeholder="XAUUSD" className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black" />
              <input value={manualSig.tf} onChange={(e) => setManualSig({ ...manualSig, tf: e.target.value })} placeholder="M15" className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black" />
              <select value={manualSig.dir} onChange={(e) => setManualSig({ ...manualSig, dir: e.target.value })} className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black">
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input value={manualSig.entry} onChange={(e) => setManualSig({ ...manualSig, entry: e.target.value })} placeholder="Entry" className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black font-mono" />
              <input value={manualSig.sl} onChange={(e) => setManualSig({ ...manualSig, sl: e.target.value })} placeholder="Stop Loss" className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black font-mono" />
              <input value={manualSig.tp1} onChange={(e) => setManualSig({ ...manualSig, tp1: e.target.value })} placeholder="TP1" className="px-2.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black font-mono" />
            </div>
            <input value={manualSig.notes} onChange={(e) => setManualSig({ ...manualSig, notes: e.target.value })} placeholder="Setup reason / notes" className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black" />
            <button
              type="button"
              onClick={async () => {
                await call('/admin/signals', { method: 'POST', json: manualSig });
                flash('Manual signal published.');
                void loadSection('signals');
              }}
              className="w-full py-2 rounded-xl bg-[#089981] text-white font-semibold"
            >
              Publish Signal
            </button>
          </div>
        </div>
      )}

      {/* 9. BOT STUDIO AI */}
      {section === 'studio' && (
        <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-5 space-y-4 text-xs">
          <div>
            <div className="font-bold text-sm text-slate-900 dark:text-white">Bot Studio (Plain-English -&gt; Encrypted Rule Bot)</div>
            <p className="text-slate-500">Describe the digit rules in plain English, let Gemini compile the rule schema, preview it, encrypt, and publish.</p>
          </div>
          <textarea
            rows={3}
            value={studioPrompt}
            onChange={(e) => setStudioPrompt(e.target.value)}
            placeholder="Example: Scan all markets. Trade Under 8 when last digit is 8 or 9. After a loss multiply stake by 2 up to 3 steps and trade Under 7 when 7, 8, or 9 hits."
            className="w-full p-3 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black"
          />
          <button
            type="button"
            onClick={async () => {
              const res = await call('/admin/rules-ai', { method: 'POST', json: { text: studioPrompt, current: studioRules } });
              setStudioRules(res.rules);
              flash('AI generated strategy rules!');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2962FF] text-white font-semibold"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate Rules with AI
          </button>

          {studioRules && (
            <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-[#1E222D]">
              <div className="p-3 rounded-xl bg-[#089981]/10 border border-[#089981]/30 text-[#089981] font-medium">
                {describeRules(studioRules)}
              </div>
              <pre className="p-3 rounded-xl bg-slate-50 dark:bg-black overflow-x-auto font-mono text-[11px]">
                {JSON.stringify(studioRules, null, 2)}
              </pre>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input value={studioMeta.id} onChange={(e) => setStudioMeta({ ...studioMeta, id: e.target.value })} placeholder="bot-id" className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black" />
                <input value={studioMeta.name} onChange={(e) => setStudioMeta({ ...studioMeta, name: e.target.value })} placeholder="Bot Name" className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black" />
                <input value={studioMeta.price} onChange={(e) => setStudioMeta({ ...studioMeta, price: e.target.value })} placeholder="Price KSh" className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black" />
              </div>
              <button
                type="button"
                onClick={async () => {
                  const key = generateBotSecret();
                  const entry = await sealEntry(`${studioMeta.id}.json`, 'application/json', JSON.stringify({ rules: studioRules }), key);
                  await call('/admin/bot', {
                    method: 'POST',
                    json: {
                      id: studioMeta.id,
                      name: studioMeta.name,
                      price: Number(studioMeta.price),
                      desc: describeRules(studioRules),
                      section: 'automated',
                      category: 'digits',
                      entry,
                      key,
                      rules: studioRules,
                      rulesText: studioPrompt,
                      action: 'add',
                    },
                  });
                  flash('Rule Bot encrypted & saved to Store!');
                  onRefreshGlobal();
                }}
                className="px-4 py-2 rounded-xl bg-[#089981] text-white font-semibold"
              >
                Encrypt &amp; Publish Bot to Catalog
              </button>
            </div>
          )}
        </div>
      )}

      {/* 10. ANNOUNCEMENTS */}
      {section === 'announcements' && (
        <div className="space-y-4 text-xs">
          <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 flex flex-col sm:flex-row gap-2">
            <input value={newAnn.message} onChange={(e) => setNewAnn({ ...newAnn, message: e.target.value })} placeholder="Banner message shown on Home..." className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black" />
            <select value={newAnn.kind} onChange={(e) => setNewAnn({ ...newAnn, kind: e.target.value })} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black">
              <option value="info">Info Blue</option>
              <option value="warning">Warning Amber</option>
            </select>
            <button
              type="button"
              onClick={async () => {
                await call('/admin/announcements', { method: 'POST', json: newAnn });
                setNewAnn({ message: '', kind: 'info' });
                flash('Banner published.');
                void loadSection('announcements');
                onRefreshGlobal();
              }}
              className="px-4 py-2 rounded-xl bg-[#2962FF] text-white font-semibold"
            >
              Post Banner
            </button>
          </div>
          {announcements.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-3 flex items-center justify-between">
              <span>{a.message}</span>
              <button
                type="button"
                onClick={async () => {
                  await call('/admin/announcements', { method: 'POST', json: { action: 'delete', id: a.id } });
                  flash('Banner deleted.');
                  void loadSection('announcements');
                  onRefreshGlobal();
                }}
                className="text-[#F23645]"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 11. AUDIT & CSV EXPORT */}
      {section === 'audit' && (
        <div className="space-y-3 text-xs">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void downloadWithAuth('/admin/export?type=clients', 'traderspro254-clients.csv', adminKey || undefined)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#2962FF] text-white font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              Export Clients CSV
            </button>
            <button
              type="button"
              onClick={() => void downloadWithAuth('/admin/export?type=orders', 'traderspro254-orders.csv', adminKey || undefined)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] font-semibold"
            >
              <Download className="w-3.5 h-3.5" />
              Export Orders CSV
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] divide-y divide-slate-100 dark:divide-[#1E222D]">
            {auditEntries.map((e) => (
              <div key={e.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-mono font-bold text-[#2962FF]">{e.action}</span>
                  <span className="ml-2 text-slate-900 dark:text-white">{e.target}</span>
                  {e.detail && <span className="ml-2 text-slate-500">({e.detail})</span>}
                </div>
                <span className="font-mono text-slate-400">
                  {e.who} · {new Date(e.t).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 12. SETTINGS & ADMINS */}
      {section === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
          <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-3">
            <div className="font-bold text-sm text-slate-900 dark:text-white">Admin Emails</div>
            <div className="flex gap-2">
              <input value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} placeholder="partner@gmail.com" className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E222D] bg-slate-50 dark:bg-black" />
              <button
                type="button"
                onClick={async () => {
                  const res = await call('/admin/admins', { method: 'POST', json: { email: newAdminEmail, action: 'add' } });
                  setAdminList(res.emails || []);
                  setNewAdminEmail('');
                  flash('Admin added.');
                }}
                className="px-4 py-2 rounded-xl bg-[#2962FF] text-white font-semibold"
              >
                Add
              </button>
            </div>
            <div className="space-y-1">
              {adminList.map((em) => (
                <div key={em} className="flex items-center justify-between py-1">
                  <span>{em}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await call('/admin/admins', { method: 'POST', json: { email: em, action: 'remove' } });
                      setAdminList(res.emails || []);
                      flash('Admin removed.');
                    }}
                    className="text-[#F23645]"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-4 space-y-3 h-fit">
            <div className="font-bold text-sm text-slate-900 dark:text-white">Emergency &amp; Site Controls</div>
            <button
              type="button"
              onClick={async () => {
                const next = !cfgDraft.maintenance;
                await call('/admin/config', { method: 'POST', json: { maintenance: next } });
                setCfgDraft({ ...cfgDraft, maintenance: next });
                flash(next ? 'Maintenance mode enabled.' : 'Site live for customers.');
                onRefreshGlobal();
              }}
              className={`w-full py-2.5 rounded-xl font-semibold ${cfgDraft.maintenance ? 'bg-amber-500 text-black' : 'border border-slate-200 dark:border-[#1E222D]'}`}
            >
              {cfgDraft.maintenance ? 'Turn OFF Maintenance Mode' : 'Turn ON Maintenance Mode'}
            </button>
            <button
              type="button"
              onClick={async () => {
                await call('/admin/logoutall', { method: 'POST', json: {} });
                flash('All customer sessions invalidated.');
              }}
              className="w-full py-2.5 rounded-xl bg-[#F23645] text-white font-semibold"
            >
              Force Logout All Customers
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#1E222D] bg-white dark:bg-[#0D1017] p-3.5">
      <div className="text-[11px] text-slate-500 dark:text-[#787B86]">{label}</div>
      <div className="font-mono text-lg font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}
