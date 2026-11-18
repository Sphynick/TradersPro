import crypto from 'node:crypto';
import { analyzeNewsEventAi, checkAiRateLimit, hasAiKey, synthesizeRulesAi } from './ai-service.ts';
import {
  aiFor,
  engBrief,
  engCfg,
  engineTick,
  engNext,
  engStats,
  engStatus,
  lazyEngineTickIfStale,
} from './market-engine.ts';
import { cleanRules } from './rules-core.ts';
import { AI_PACK, aiScanNow, currentSignals, getNewsEvents } from './signals-engine.ts';
import {
  cacheDel,
  cacheGet,
  cacheSet,
  colDelete,
  colGet,
  colList,
  colPut,
  constantTimeEqual,
  deleteFirebaseAuthUser,
  hasServiceAccount,
  runStoreTransaction,
  safeDocId,
  verifyFirebaseIdToken,
  type DecodedUser,
} from './store.ts';
import { capturePayPalOrder, createPayPalOrder } from '../lib/payments.ts';

// Built-in prices & names from worker-v38.js
export const PRICES: Record<string, number> = {
  signals: 500,
  aiscan: 1000,
  engine: 27000,
  killer: 5000,
  ninja: 7500,
  'recover-bot-v8': 1500,
  'under8-recovery': 1500,
  'unstoppable-differ': 1500,
  'ai-style-digitmatch': 1500,
  'wallstreet-fast-match': 1500,
  'rise-fall-auto-direction': 1500,
  'accumulators-20-profit': 2000,
  'over-under-auto': 2500,
  'differs-auto': 2500,
  'matches-auto': 2500,
  'even-odd-auto': 2500,
  'rise-fall-auto': 2500,
  'digit-trader': 5000,
  'under-auto': 2500,
  'over-auto': 2500,
  'xauusd-system': 10000,
  'straddle-system': 10000,
};

export const NAMES: Record<string, string> = {
  signals: 'Forex signals, 1 week',
  aiscan: 'AI scanner, 5 signals',
  engine: 'TRADERSPRO Market Engine site (lifetime)',
  killer: 'TRADERSPRO Accumulator Killer',
  ninja: 'TRADERSPRO Accumulators Ninja',
  'recover-bot-v8': 'Recover Bot v8',
  'under8-recovery': 'Under 8 Recovery',
  'unstoppable-differ': 'Unstoppable Differ',
  'ai-style-digitmatch': 'AI Style Digit Match',
  'wallstreet-fast-match': 'Wallstreet Fast Match',
  'rise-fall-auto-direction': 'Rise/Fall Auto Direction',
  'accumulators-20-profit': 'Accumulators 20 Profit',
  'over-under-auto': 'TRADERSPRO Auto Over/Under Killer',
  'differs-auto': 'Auto Differs',
  'matches-auto': 'TRADERSPRO Auto Matches & Differs',
  'even-odd-auto': 'TRADERSPRO Auto Even/Odd',
  'rise-fall-auto': 'Auto Rise / Fall',
  'digit-trader': 'Auto Digit Trader (all contracts)',
  'under-auto': 'TRADERSPRO Auto Under Bot',
  'over-auto': 'TRADERSPRO Auto Over Bot',
  'xauusd-system': 'ChartLord XAUUSD Auto System',
  'straddle-system': 'ChartLord Straddle System',
};

const DAY = 86400000;
const SUB_MS = 7 * DAY;
const PAYSTACK_API = 'https://api.paystack.co';

const LOCAL: Record<string, string> = {
  KE: 'KES', UG: 'UGX', TZ: 'TZS', RW: 'RWF', BI: 'BIF', NG: 'NGN', GH: 'GHS', ZA: 'ZAR',
  ET: 'ETB', ZM: 'ZMW', MW: 'MWK', MZ: 'MZN', BW: 'BWP', NA: 'NAD', SZ: 'SZL', LS: 'LSL',
  ZW: 'USD', CD: 'CDF', SS: 'SSP', SO: 'SOS', DJ: 'DJF', EG: 'EGP', MA: 'MAD', DZ: 'DZD',
  TN: 'TND', SN: 'XOF', CI: 'XOF', BJ: 'XOF', BF: 'XOF', ML: 'XOF', NE: 'XOF', TG: 'XOF',
  CM: 'XAF', GA: 'XAF', CG: 'XAF', TD: 'XAF', AO: 'AOA', MU: 'MUR', SD: 'SDG', LR: 'LRD',
  SL: 'SLE', GM: 'GMD',
};
const FALLBACK: Record<string, number> = {
  KES: 130, UGX: 3700, TZS: 2600, RWF: 1400, BIF: 2900, NGN: 1550, GHS: 15, ZAR: 18,
  ETB: 125, ZMW: 27, MWK: 1750, MZN: 64, BWP: 13.5, NAD: 18, SZL: 18, LSL: 18, CDF: 2800,
  SSP: 4500, SOS: 570, DJF: 178, EGP: 49, MAD: 10, DZD: 134, TND: 3.1, XOF: 600, XAF: 600,
  AOA: 920, MUR: 46, SDG: 600, LRD: 190, SLE: 22, GMD: 70,
};

const EA_BOT = 'xauusd-system';
const SW_BOT = 'straddle-system';
const EA_DEF = { run: true, mode: 'intraday', scalpTf: '1', lotMode: 'fixed', lot: 0.01, risk: 1, dd: 3, maxOpen: 2, closeAt: 0 };
const SW_DEF = { run: true, lotMode: 'risk', lot: 0.01, risk: 1, dd: 3, maxOpen: 2, closeAt: 0, perHour: 30, lossStreak: 3 };
const EA_NAMES: Record<string, string> = { 'xauusd-system': 'ChartLord System', [SW_BOT]: 'Straddle System' };

const BROKERS: Array<[RegExp, string]> = [
  [/exness/i, 'Exness'], [/hf ?markets|hfm/i, 'HFM'], [/xm\b|xmglobal/i, 'XM'], [/fbs/i, 'FBS'],
  [/icmarkets|ic markets/i, 'IC Markets'], [/pepperstone/i, 'Pepperstone'], [/deriv/i, 'Deriv'],
  [/octa/i, 'OctaFX'], [/fxtm|forextime/i, 'FXTM'], [/admiral/i, 'Admirals'], [/tickmill/i, 'Tickmill'],
  [/equiti/i, 'Equiti'], [/vantage/i, 'Vantage'], [/roboforex/i, 'RoboForex'], [/fxpro/i, 'FxPro'],
];

export const brokerFromServer = (srv: string) => {
  for (const [re, n] of BROKERS) if (re.test(String(srv || ''))) return n;
  return '';
};

export const normEmail = (e: string) => {
  const s = String(e || '').trim().toLowerCase();
  const [l = '', d = ''] = s.split('@');
  if (d === 'gmail.com' || d === 'googlemail.com') return l.split('+')[0].replace(/\./g, '') + '@gmail.com';
  return s;
};

export const normPhone = (p: string) => {
  const d = String(p || '').replace(/\D/g, '');
  const n = d.startsWith('0') ? '254' + d.slice(1) : /^[71]\d{8}$/.test(d) ? '254' + d : d;
  return /^254[71]\d{8}$/.test(n) ? n : null;
};

export function parseMpesa(t: string, price: number, pochi: string) {
  const s = String(t || '');
  const code = (s.match(/\b[A-Z][A-Z0-9]{9}\b/) || [])[0] || '';
  const am = s.match(/Ksh\.?\s?([\d,]+(?:\.\d{1,2})?)/i);
  const amount = am ? Number(am[1].replace(/,/g, '')) : 0;
  return {
    code,
    amount,
    amountOk: amount >= price,
    toOwner: s.replace(/\D/g, '').includes(String(pochi || '').replace(/\D/g, '').slice(-9)),
  };
}

const keepCmd = (b: any) => ({
  cmdId: Number(b.cmdId) || 0,
  cmdOp: String(b.cmdOp || ''),
  cmdTk: String(b.cmdTk || ''),
  aiMode: ['scalp', 'intraday'].includes(b.aiMode) ? b.aiMode : 'off',
});
const cmdOf = (c: any) => {
  const fresh = c.cmdId && Date.now() - c.cmdId < 300000;
  return { cmdId: fresh ? c.cmdId : 0, cmdOp: fresh ? c.cmdOp : '', cmdTk: fresh ? c.cmdTk : '' };
};
const eaNum = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const ddOf = (v: unknown, d: number) => (v === 0 || v === '0' ? 0 : Math.round(eaNum(v, 0.5, 10, d) * 10) / 10);

export function cleanEa(c: any, base?: any) {
  c = c && typeof c === 'object' ? c : {};
  const b = { ...EA_DEF, ...(base || {}) };
  return {
    run: c.run === undefined ? !!b.run : !!c.run,
    mode: ['intraday', 'scalp'].includes(c.mode) ? c.mode : b.mode,
    scalpTf: ['1', '5'].includes(String(c.scalpTf)) ? String(c.scalpTf) : String(b.scalpTf || '1'),
    lotMode: ['fixed', 'risk'].includes(c.lotMode) ? c.lotMode : b.lotMode,
    lot: Math.round(eaNum(c.lot, 0.01, 100, b.lot) * 100) / 100,
    risk: Math.round(eaNum(c.risk, 0.1, 5, b.risk) * 10) / 10,
    dd: ddOf(c.dd, b.dd),
    maxOpen: Math.round(eaNum(c.maxOpen, 1, 10, b.maxOpen)),
    closeAt: Number(b.closeAt) || 0,
    ...keepCmd(b),
  };
}

export function cleanSw(c: any, base?: any) {
  c = c && typeof c === 'object' ? c : {};
  const b = { ...SW_DEF, ...(base || {}) };
  return {
    run: c.run === undefined ? !!b.run : !!c.run,
    lotMode: ['fixed', 'risk'].includes(c.lotMode) ? c.lotMode : b.lotMode,
    lot: Math.round(eaNum(c.lot, 0.01, 100, b.lot) * 100) / 100,
    risk: Math.round(eaNum(c.risk, 0.1, 5, b.risk) * 10) / 10,
    dd: ddOf(c.dd, b.dd),
    maxOpen: Math.round(eaNum(c.maxOpen, 1, 10, b.maxOpen)),
    perHour: Math.round(eaNum(c.perHour, 1, 60, b.perHour)),
    lossStreak: Math.round(eaNum(c.lossStreak, 1, 10, b.lossStreak)),
    closeAt: Number(b.closeAt) || 0,
    ...keepCmd(b),
  };
}

const newEaKey = () =>
  'EA-' +
  [...crypto.getRandomValues(new Uint8Array(12))].map((x) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x % 32]).join('');

async function getBots() {
  const c = cacheGet<{ extra: Record<string, any>; hide: string[]; edit: Record<string, any> }>('settings:bots');
  if (c) return c;
  const b = (await colGet<any>('settings', 'bots')) || {};
  const out = { extra: b.extra || {}, hide: b.hide || [], edit: b.edit || {} };
  cacheSet('settings:bots', out, 20000);
  return out;
}

async function getCfg() {
  const c = cacheGet<any>('settings:cfg');
  if (c) return c;
  const doc = (await colGet<any>('settings', 'cfg')) || {};
  const out = {
    pochi: process.env.VITE_POCHI_NUMBER || '0758414027',
    whatsapp: process.env.VITE_WHATSAPP_NUMBER || '254758414027',
    payMode: 'both',
    paypal: 'rutheystepper2024@gmail.com',
    usdtAddress: '',
    usdtNetwork: 'TRC20',
    usdRate: Number(process.env.VITE_USD_KSH_RATE || 130) || 130,
    autoApprove: false,
    showUsdForeign: true,
    maintenance: false,
    revokeAll: 0,
    rates: {},
    ...doc,
  };
  cacheSet('settings:cfg', out, 20000);
  return out;
}

async function getPrices(B: { extra: Record<string, any> }) {
  const c = cacheGet<Record<string, number>>('settings:prices');
  if (c) return c;
  const o = (await colGet<Record<string, number>>('settings', 'prices')) || {};
  const base: Record<string, number> = { ...PRICES };
  for (const x of Object.values(B?.extra || {})) {
    if (x && typeof x.price === 'number') base[x.id] = x.price;
  }
  const p: Record<string, number> = { ...base };
  for (const k of Object.keys(base)) {
    if (Number.isInteger(o[k]) && o[k] >= 10 && o[k] <= 1000000) p[k] = o[k];
  }
  cacheSet('settings:prices', p, 20000);
  return p;
}

const botName = (B: any, id: string) => B?.edit?.[id]?.name || B?.extra?.[id]?.name || NAMES[id] || id;

async function botKey(id: string): Promise<string | null> {
  try {
    const k = JSON.parse(process.env.BOT_KEYS || '{}')[id];
    if (k) return k;
  } catch {}
  const doc = await colGet<{ key?: string }>('botkeys', id);
  return doc?.key || null;
}

async function localCurrency(country: string, cfg: any) {
  const code = LOCAL[country];
  if (!code || code === 'USD') return null;
  if (code === 'KES') return { code, rate: Number(cfg.usdRate) || 130 };
  if (cfg.rates && Number(cfg.rates[code]) > 0) return { code, rate: Number(cfg.rates[code]) };
  let fx = await colGet<{ t: number; rates: Record<string, number> }>('settings', 'fx');
  if (!fx || Date.now() - fx.t > 12 * 3600000) {
    try {
      const r = await fetch('https://open.er-api.com/v6/latest/USD');
      const j = (await r.json()) as { rates?: Record<string, number> };
      if (j?.rates) {
        fx = { t: Date.now(), rates: j.rates };
        await colPut('settings', 'fx', fx);
      }
    } catch {}
  }
  const live = fx?.rates?.[code];
  return { code, rate: live && live > 0 ? live : FALLBACK[code] || 0, approx: true };
}

async function newsToday() {
  const evs = (await getNewsEvents().catch(() => null)) || [];
  const d0 = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const today = evs.filter((e: any) => e.country === 'USD' && /high/i.test(e.impact) && e.ts >= d0 && e.ts < d0 + DAY);
  return { today: today.map((e: any) => ({ title: e.title.replace(/[^\w .\/%-]/g, '').slice(0, 40), ts: e.ts })), known: evs.length > 0 };
}

const mailBox = (title: string, body: string) =>
  `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:20px;border:1px solid #ddd;border-radius:10px"><h2 style="color:#2962FF;margin-top:0">TRADERSPRO254</h2><h3>${title}</h3>${body}<p style="color:#888;font-size:12px">Never share your password.</p></div>`;

async function sendMail(to: string, subject: string, html: string) {
  if (!process.env.BREVO_KEY || !process.env.MAIL_FROM) return false;
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name: 'TRADERSPRO254', email: process.env.MAIL_FROM }, to: [{ email: to }], subject, htmlContent: html }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function fulfil(B: any, { account, contact, botId, ref, via, quiet }: { account: string; contact: string; botId: string; ref: string; via: string; quiet?: boolean }) {
  const now = Date.now();
  if (botId === 'signals' || botId === 'signals-monthly') {
    await runStoreTransaction(async (tx) => {
      const a = (await tx.get<any>('accounts', account)) || { created: now, subEnd: 0, free: { state: 'none' } };
      a.subEnd = Math.max(a.subEnd || 0, now) + SUB_MS;
      await tx.set('accounts', account, a);
    });
    return quiet
      ? false
      : sendMail(contact, 'TRADERSPRO254 signals activated', mailBox('Payment confirmed', '<p>Your forex signals are active for 7 days. Log in and press Scan signal.</p>'));
  }
  if (botId === 'aiscan') {
    await runStoreTransaction(async (tx) => {
      const a = (await tx.get<any>('accounts', account)) || { created: now, subEnd: 0, free: { state: 'none' } };
      a.aiLeft = (a.aiLeft || 0) + AI_PACK;
      await tx.set('accounts', account, a);
    });
    return quiet
      ? false
      : sendMail(contact, 'TRADERSPRO254 AI scanner pack', mailBox('Payment confirmed', `<p>${AI_PACK} AI scanner signals were added to your account. Open Forex, then AI Scanner, and press Scan.</p>`));
  }
  await runStoreTransaction(async (tx) => {
    const l = (await tx.get<any>('licenses', account)) || {};
    l[botId] = { t: now, via, ref };
    await tx.set('licenses', account, l);
  });
  return quiet
    ? false
    : sendMail(
        contact,
        'Your TRADERSPRO254 bot is ready: ' + botName(B, botId),
        mailBox('Payment confirmed', `<p>Bot: <b>${botName(B, botId)}</b></p><p>Log in to TRADERSPRO254 with this email, open the bot and press Start. It is now unlocked on your account.</p>`)
      );
}

// Daraja STK Push helpers
const dEnv = () => (process.env.DARAJA_ENV === 'live' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke');
const dKey = () => process.env.DARAJA_KEY || process.env.MPESA_CONSUMER_KEY || '';
const dSecret = () => process.env.DARAJA_SECRET || process.env.MPESA_CONSUMER_SECRET || '';
const dShort = () => process.env.DARAJA_SHORTCODE || process.env.MPESA_SHORTCODE || '';
const dPasskey = () => process.env.DARAJA_PASSKEY || process.env.MPESA_PASSKEY || '';
const dTill = () => process.env.DARAJA_TILL || '';

function dStamp() {
  return new Date(Date.now() + 3 * 3600000).toISOString().replace(/\D/g, '').slice(0, 14);
}
function dPass(ts: string) {
  return Buffer.from(dShort() + dPasskey() + ts).toString('base64');
}
async function dToken() {
  const r = await fetch(dEnv() + '/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: 'Basic ' + Buffer.from(dKey() + ':' + dSecret()).toString('base64') },
  });
  const j = (await r.json()) as { access_token?: string };
  if (!j.access_token) throw new Error('Daraja login failed.');
  return j.access_token;
}
async function dCall(p: string, body: Record<string, unknown>) {
  const t = await dToken();
  const r = await fetch(dEnv() + p, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await r.json()) as any;
}

async function writeAudit(who: string, action: string, target: string, detail = '') {
  const t = Date.now();
  const id = `${String(9999999999999 - t).padStart(13, '0')}.${crypto.randomUUID().slice(0, 8)}`;
  await colPut('audit', id, { t, who, action, target, detail: String(detail || '').slice(0, 400) });
}

function getAdminEmailsList(settingsDoc?: { emails?: string[] } | null): string[] {
  const envList = String(process.env.ADMIN_EMAILS || 'cyyfuego@gmail.com')
    .split(',')
    .map((x) => normEmail(x))
    .filter(Boolean);
  const dbList = Array.isArray(settingsDoc?.emails) ? settingsDoc.emails.map((x) => normEmail(x)).filter(Boolean) : [];
  return [...new Set([...envList, ...dbList])];
}

async function isAdminSession(decoded: DecodedUser | null, xAdminHeader: string): Promise<boolean> {
  if (process.env.ADMIN_KEY && xAdminHeader && constantTimeEqual(xAdminHeader, process.env.ADMIN_KEY)) {
    return true;
  }
  if (!decoded || !decoded.email || !decoded.emailVerified) return false;
  const admSettings = await colGet<{ emails?: string[] }>('settings', 'admins');
  const allowed = getAdminEmailsList(admSettings);
  if (!allowed.includes(normEmail(decoded.email))) return false;
  const admDoc = await colGet<{ uid?: string; email?: string }>('admins', decoded.uid);
  if (admDoc) return true;
  // Bootstrap admins/{uid} on first verified login if email matches ADMIN_EMAILS env
  const envAllowed = String(process.env.ADMIN_EMAILS || 'cyyfuego@gmail.com')
    .split(',')
    .map((x) => normEmail(x))
    .filter(Boolean);
  if (envAllowed.includes(normEmail(decoded.email))) {
    await colPut('admins', decoded.uid, { uid: decoded.uid, email: decoded.email, createdAt: Date.now() });
    return true;
  }
  return false;
}

// Per-user order & charge rate limit
const reqRateMap = new Map<string, number[]>();
function checkRate(key: string, maxPerMin: number) {
  const now = Date.now();
  const prev = (reqRateMap.get(key) || []).filter((t) => now - t < 60000);
  if (prev.length >= maxPerMin) return false;
  prev.push(now);
  reqRateMap.set(key, prev);
  return true;
}

export interface ApiRequest {
  method: string;
  path: string; // normalized without /api prefix, e.g. "/config"
  query: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  body: any;
  rawBody?: string;
  origin: string;
}

export interface ApiResponse {
  status: number;
  body: any;
  headers?: Record<string, string>;
}

const out = (body: any, status = 200, headers?: Record<string, string>): ApiResponse => ({ status, body, headers });

export async function handleApiRequest(req: ApiRequest): Promise<ApiResponse> {
  const method = req.method.toUpperCase();
  const GET = method === 'GET';
  const POST = method === 'POST';
  const p = req.path.startsWith('/api') ? req.path.slice(4) || '/' : req.path;

  const authHeader = String(req.headers['authorization'] || req.headers['Authorization'] || '');
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const xAdmin = String(req.headers['x-admin'] || req.headers['X-Admin'] || '');

  const B = await getBots();
  const P = await getPrices(B);
  const CFG0 = await getCfg();

  const provider =
    dKey() && dSecret() && dShort() && dPasskey()
      ? process.env.DARAJA_ENV === 'live'
        ? 'daraja'
        : 'daraja_sandbox'
      : String(process.env.PAYSTACK_SECRET || '').startsWith('sk_live')
      ? 'paystack'
      : null;

  const decoded = bearerToken ? await verifyFirebaseIdToken(bearerToken) : null;
  const adminFlag = await isAdminSession(decoded, xAdmin);

  const who = async (): Promise<{ err?: ApiResponse; em: string; u: any; acct: any; decoded: DecodedUser }> => {
    if (!decoded || !decoded.email) {
      return { err: out({ error: 'Please sign in first.' }, 401), em: '', u: null, acct: null, decoded: null as any };
    }
    const em = normEmail(decoded.email);
    const existing = await colGet<any>('users', em);

    if (existing && existing.uid && existing.uid !== decoded.uid) {
      return {
        err: out({ error: 'This email address is already registered to a different account. Sign in with your original login method.' }, 409),
        em,
        u: existing,
        acct: null,
        decoded,
      };
    }

    let u = existing;
    if (!u) {
      u = {
        uid: decoded.uid,
        emailKey: em,
        email: decoded.email,
        name: decoded.name || decoded.email.split('@')[0],
        verified: decoded.emailVerified,
        blocked: false,
        country: String(req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || 'KE').toUpperCase().slice(0, 2) || 'KE',
        theme: 'system',
        lastLoginAt: Date.now(),
        created: Date.now(),
      };
      await colPut('users', em, u);
    } else if (u.verified !== decoded.emailVerified || Date.now() - (u.lastLoginAt || 0) > 300000) {
      u.verified = decoded.emailVerified;
      u.lastLoginAt = Date.now();
      await colPut('users', em, { verified: u.verified, lastLoginAt: u.lastLoginAt }, true);
    }

    if (u.blocked) {
      return {
        err: out({ error: `This account is blocked. Contact support on WhatsApp (+${CFG0.whatsapp}).`, blocked: true }, 403),
        em,
        u,
        acct: null,
        decoded,
      };
    }

    let acct = await colGet<any>('accounts', em);
    if (!acct) {
      acct = { created: Date.now(), subEnd: 0, free: { state: 'none' }, aiLeft: 0, aiFree: false };
      await colPut('accounts', em, acct);
    }
    if (decoded.iat < Math.max(CFG0.revokeAll || 0, acct.revokedAt || 0)) {
      return { err: out({ error: 'You were signed out remotely. Please sign in again.', revoked: true }, 401), em, u, acct, decoded };
    }

    return { em, u, acct, decoded };
  };

  const saveAcct = (em: string, acct: any) => colPut('accounts', em, acct);

  // ---------- Public Routes ----------
  if (GET && (p === '/config' || p === '/geo')) {
    const rawC =
      req.query.country ||
      String(req.headers['x-vercel-ip-country'] || req.headers['cf-ipcountry'] || 'KE');
    const country = String(rawC || 'KE').trim().toUpperCase().slice(0, 2) || 'KE';
    const cur = await localCurrency(country, CFG0);
    const m = CFG0.payMode;
    const hasPrompt = Boolean(dKey() && dSecret() && dShort() && dPasskey()) || Boolean(process.env.PAYSTACK_SECRET);
    const eff = m === 'manual' ? 'manual' : m === 'stk' ? (hasPrompt ? 'stk' : 'manual') : 'both';
    const paypalConfigured = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
    return out({
      pochi: CFG0.pochi,
      pochiNumber: CFG0.pochi,
      whatsapp: CFG0.whatsapp,
      whatsappNumber: CFG0.whatsapp,
      paypal: CFG0.paypal,
      paypalConfigured,
      mpesaConfigured: Boolean(dKey() && dSecret() && dShort() && dPasskey()),
      paystackConfigured: Boolean(process.env.PAYSTACK_SECRET),
      usdtAddress: CFG0.usdtAddress,
      usdtNetwork: CFG0.usdtNetwork,
      usdRate: CFG0.usdRate,
      usdKshRate: CFG0.usdRate,
      showUsdForeign: CFG0.showUsdForeign !== false,
      maintenance: !!CFG0.maintenance,
      country,
      isKenya: country === 'KE',
      currency: cur || { code: 'USD', rate: 1 },
      payMode: eff,
      rawPayMode: m,
      provider,
    });
  }

  if (GET && p === '/prices') return out(P);
  if (GET && p === '/catalog') return out({ extra: Object.values(B.extra), hide: B.hide, edit: B.edit });
  if (GET && p === '/botfile') {
    const e = await colGet('botentry', req.query.id || '');
    return e ? out(e) : out({ error: 'Bot file not found.' }, 404);
  }
  if (GET && p === '/announcements') {
    const list = await colList<any>('announcements', 20);
    const now = Date.now();
    const active = list
      .map((x) => ({ id: x.id, ...x.data }))
      .filter((a) => a.active !== false && (!a.startAt || now >= a.startAt) && (!a.endAt || now <= a.endAt));
    return out({ announcements: active });
  }
  if (GET && (p === '/news' || p === '/news/events')) {
    const events = await getNewsEvents();
    if (!events) return out({ error: 'The news calendar is not reachable right now. Try again in a few minutes.' }, 502);
    return out({ events, fetched: Date.now() });
  }
  if (GET && p === '/engine/public') {
    await lazyEngineTickIfStale();
    const s = await engStatus();
    const doc = await colGet<any>('engine', 'sigs');
    return out({
      on: s.on,
      online: s.online,
      last: s.hb ? s.hb.t : 0,
      scanned: s.hb ? s.hb.scanned : 0,
      stats: engStats(doc),
      next: await engNext(),
      now: Date.now(),
    });
  }
  if (GET && p === '/health') {
    return out({
      version: 39,
      firebaseAdmin: hasServiceAccount(),
      adminEmails: Boolean(process.env.ADMIN_EMAILS),
      botKeys: Boolean(process.env.BOT_KEYS),
      email: Boolean(process.env.BREVO_KEY && process.env.MAIL_FROM),
      daraja: Boolean(dKey() && dSecret() && dShort() && dPasskey()),
      darajaEnv: dKey() ? (process.env.DARAJA_ENV === 'live' ? 'live' : 'sandbox') : null,
      paystack: Boolean(process.env.PAYSTACK_SECRET),
      paypal: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
      ai: hasAiKey(),
      cronSecret: Boolean(process.env.CRON_SECRET),
      provider,
    });
  }

  // ---------- Cron Route ----------
  if ((GET || POST) && p === '/cron/engine') {
    const secret = process.env.CRON_SECRET || '';
    const given = bearerToken || req.query.secret || '';
    if (secret && !constantTimeEqual(given, secret) && !adminFlag) {
      return out({ error: 'Unauthorized cron call.' }, 401);
    }
    const summary = await engineTick();
    return out(summary);
  }

  // ---------- Order Status Polling ----------
  if (GET && p === '/order/status') {
    const ref = String(req.query.ref || '');
    const r = await colGet<{ orderKey?: string }>('orderRefs', ref);
    const o = r?.orderKey ? await colGet<any>('orders', r.orderKey) : await colGet<any>('orderStatus', ref);
    return out({
      status: o ? o.status : 'pending',
      approved: o?.status === 'approved',
      botId: o?.botId || null,
      rejectReason: o?.rejectReason || '',
    });
  }

  // ---------- AI News Explain ----------
  if (POST && p === '/news/analyze') {
    const w = await who();
    if (w.err) return w.err;
    if (!hasAiKey()) return out({ error: 'AI helper is not configured on the server yet.' }, 503);
    const eventId = String(req.body?.id || '');
    if (!eventId) return out({ error: 'Missing event id.' }, 400);
    const cached = await colGet<any>('newsai', eventId);
    if (cached && Date.now() - (cached.made || 0) < 6 * 3600e3) return out(cached);
    if (!checkAiRateLimit(w.em, 10)) return out({ error: 'Too many AI requests. Wait a minute and try again.' }, 429);
    const events = await getNewsEvents();
    const ev = (events || []).find((e: any) => e.id === eventId);
    if (!ev) return out({ error: 'That news event was not found.' }, 404);
    if (!/^(high|medium)$/i.test(ev.impact)) return out({ error: 'AI explanation is available for impact news only.' }, 400);
    try {
      const res = await analyzeNewsEventAi(ev);
      await colPut('newsai', eventId, res);
      return out(res);
    } catch (e) {
      return out({ error: e instanceof Error ? e.message : 'AI explanation failed.' }, 502);
    }
  }

  // ---------- Market Engine (Customer) ----------
  if (GET && p === '/engine/status') {
    const w = await who();
    if (w.err) return w.err;
    await lazyEngineTickIfStale();
    const s = await engStatus();
    const doc = await colGet<any>('engine', 'sigs');
    const br0 = await colGet<any>('engine', 'brief');
    const lic = (await colGet<any>('licenses', w.em)) || {};
    const paid = adminFlag || !!lic.engine;
    const br = paid ? br0 : null;
    return out({
      paid,
      on: s.on,
      online: s.online,
      last: s.hb ? s.hb.t : 0,
      note: s.hb ? s.hb.note : '',
      scanned: s.hb ? s.hb.scanned : 0,
      aiReady: hasAiKey(),
      brief: br ? { t: br.t, summary: br.summary, themes: br.themes, bias: br.bias, disclaimer: br.disclaimer } : null,
      stats: engStats(doc),
      next: await engNext(),
      now: Date.now(),
    });
  }

  if (GET && p === '/engine/signals') {
    const w = await who();
    if (w.err) return w.err;
    const lic = (await colGet<any>('licenses', w.em)) || {};
    if (!adminFlag && !lic.engine) {
      return out({ error: `Unlock the Market Engine (${P.engine.toLocaleString()} KSh, one time) to see live engine entries.`, locked: true }, 402);
    }
    await lazyEngineTickIfStale();
    const s = await engStatus();
    const doc = (await colGet<any>('engine', 'sigs')) || { sigs: [], stats: {} };
    const mkt = req.query.mkt || '';
    const list = s.online ? doc.sigs.filter((x: any) => !mkt || x.mkt === mkt).slice(0, 40) : [];
    return out({ online: s.online, on: s.on, signals: list, stats: engStats(doc), now: Date.now() });
  }

  if (POST && p === '/engine/mode') {
    const w = await who();
    if (w.err) return w.err;
    const mode = ['scalp', 'intraday'].includes(req.body?.mode) ? req.body.mode : 'off';
    let n = 0;
    for (const bot of [EA_BOT, SW_BOT]) {
      const link = await colGet<{ key?: string }>('settings', `ea_${w.em}_${bot}`);
      const rec = link?.key ? await colGet<any>('eakeys', link.key) : null;
      if (rec) {
        rec.cfg = { ...(rec.cfg || {}), aiMode: mode };
        await colPut('eakeys', rec.key, { cfg: rec.cfg }, true);
        n++;
      }
    }
    if (!n) return out({ error: 'Set up an MT5 robot first on the Broker page.' }, 400);
    return out({ mode, robots: n });
  }

  if (POST && p === '/engine/switch') {
    if (!adminFlag) return out({ error: 'Admin access required.' }, 403);
    const on = !!req.body?.on;
    await colPut('engine', 'cfg', { on, t: Date.now() });
    await writeAudit(decoded?.email || 'admin', 'engine_switch', 'engine', on ? 'ON' : 'OFF');
    return out({ on });
  }

  if (POST && p === '/engine/tick') {
    if (!adminFlag) return out({ error: 'Admin access required.' }, 403);
    const res = await engineTick({ forceBrief: !!req.body?.forceBrief });
    await writeAudit(decoded?.email || 'admin', 'engine_tick', 'engine', res.note || 'manual tick');
    return out(res);
  }

  // ---------- Customer Account & Licenses ----------
  if ((GET || POST) && p === '/me') {
    const w = await who();
    if (w.err) return w.err;
    if (POST) {
      const updates: Record<string, unknown> = {};
      if (['system', 'light', 'dark'].includes(req.body?.theme)) updates.theme = req.body.theme;
      if (typeof req.body?.country === 'string' && /^[A-Za-z]{2}$/.test(req.body.country)) updates.country = req.body.country.toUpperCase();
      if (typeof req.body?.name === 'string' && req.body.name.trim().length >= 2) updates.name = req.body.name.trim().slice(0, 60);
      if (Object.keys(updates).length) {
        await colPut('users', w.em, updates, true);
        Object.assign(w.u, updates);
      }
    }
    const lic = (await colGet<any>('licenses', w.em)) || {};
    const myOrders = (await colList<any>('orders', 250))
      .map((x) => x.data)
      .filter((o) => o.account === w.em)
      .slice(0, 30);
    return out({
      uid: w.u.uid,
      email: w.u.email,
      name: w.u.name,
      verified: w.u.verified,
      country: w.u.country,
      theme: w.u.theme || 'system',
      isAdmin: adminFlag,
      engine: !!lic.engine,
      licenses: Object.keys(lic),
      subEnd: w.acct.subEnd || 0,
      aiLeft: w.acct.aiLeft || 0,
      aiFreeUsed: !!w.acct.aiFree,
      freeTrial: w.acct.free || { state: 'none' },
      orders: myOrders,
      now: Date.now(),
    });
  }

  if (GET && p === '/license/key') {
    const w = await who();
    if (w.err) return w.err;
    const id = String(req.query.bot || '');
    const lic = (await colGet<any>('licenses', w.em)) || {};
    if (!lic[id] && !adminFlag) {
      return out({ error: 'This bot is not unlocked on your account yet. Buy it or contact support.' }, 403);
    }
    const key = await botKey(id);
    if (!key) {
      return out({ error: 'No decryption key is configured on the server for this bot yet. Contact support.' }, 500);
    }
    return out({ key });
  }

  // ---------- MT5 EA Control & Exact /api/ea/sync ----------
  if ((GET || POST) && p === '/ea/control') {
    const w = await who();
    if (w.err) return w.err;
    const bot = req.query.bot === SW_BOT ? SW_BOT : EA_BOT;
    const isSw = bot === SW_BOT;
    const lic = (await colGet<any>('licenses', w.em)) || {};
    if (!adminFlag && !lic[bot]) return out({ error: 'Buy the ' + EA_NAMES[bot] + ' first.' }, 403);

    const body = POST ? req.body || {} : {};
    const linkId = `ea_${w.em}_${bot}`;
    const idx = await colGet<{ key?: string }>('settings', linkId);
    let rec = idx?.key ? await colGet<any>('eakeys', idx.key) : null;

    if (!rec || body.newKey) {
      if (idx?.key) await colDelete('eakeys', idx.key);
      const brk = await colGet<any>('settings', `brk_${w.em}`);
      rec = {
        email: w.em,
        bot,
        key: newEaKey(),
        cfg: rec?.cfg || { ...(isSw ? SW_DEF : EA_DEF) },
        status: rec?.status || null,
        logins: [],
        owner: adminFlag,
        licOk: true,
        licT: Date.now(),
        lockLogin: brk?.lock ? brk.login : '',
      };
      await colPut('settings', linkId, { key: rec.key });
      await colPut('eakeys', rec.key, rec);
    } else {
      await runStoreTransaction(async (tx) => {
        const latest = (await tx.get<any>('eakeys', rec.key)) || rec;
        latest.bot = bot;
        latest.owner = adminFlag || latest.owner;
        latest.licOk = true;
        latest.licT = Date.now();
        if (body.cfg) latest.cfg = isSw ? cleanSw(body.cfg, latest.cfg) : cleanEa(body.cfg, latest.cfg);
        if (body.closeAll) latest.cfg.closeAt = Date.now();
        if (body.cmd && ['close', 'closeProfit', 'closeLoss'].includes(body.cmd.op)) {
          latest.cfg.cmdId = Date.now();
          latest.cfg.cmdOp = body.cmd.op;
          latest.cfg.cmdTk = String(body.cmd.ticket || '').replace(/\D/g, '').slice(0, 20);
        }
        await tx.set('eakeys', rec.key, latest);
        rec = latest;
      });
    }

    const st = rec.status ? { ...rec.status, online: Date.now() - rec.status.t < 180000 } : null;
    return out({ key: rec.key, cfg: rec.cfg, status: st, bot, ...(isSw ? { news: await newsToday() } : {}) });
  }

  // Exact MT5 EA contract preserved verbatim from worker-v38
  if (POST && p === '/ea/sync') {
    const b = req.body || {};
    const kk = String(b.key || '');
    const rec = /^EA-[A-Z0-9]{12}$/.test(kk) ? await colGet<any>('eakeys', kk) : null;
    if (!rec) return out({ ok: 0, lic: 0, msg: 'Unknown key. Copy the key from your account on the website.' });

    let licOk = !!rec.licOk;
    let licT = rec.licT || 0;
    if (!licT || Date.now() - licT > 300000) {
      const lic = (await colGet<any>('licenses', rec.email)) || {};
      const u = await colGet<any>('users', rec.email);
      licOk = !!(u && !u.blocked && (rec.owner || lic[rec.bot || EA_BOT]));
      licT = Date.now();
    }
    if (!licOk) {
      await colPut('eakeys', kk, { licOk, licT }, true);
      return out({ ok: 0, lic: 0, msg: 'No licence on this account.' });
    }

    const login = String(b.login || '').slice(0, 20);
    const logins: string[] = Array.isArray(rec.logins) ? [...rec.logins] : [];
    if (login && !logins.includes(login)) {
      if (logins.length >= 3) return out({ ok: 0, lic: 0, msg: 'This key is already used on 3 MT5 accounts.' });
      logins.push(login);
    }

    const st: any = {
      t: Date.now(),
      login,
      server: String(b.server || '').slice(0, 40),
      balance: Number(b.balance) || 0,
      equity: Number(b.equity) || 0,
      open: Number(b.open) || 0,
      today: Number(b.today) || 0,
      mode: String(b.mode || '').slice(0, 10),
      state: String(b.state || '').slice(0, 120),
      ver: String(b.ver || '').slice(0, 10),
      symbol: String(b.symbol || '').slice(0, 20),
      pos: (Array.isArray(b.pos) ? b.pos : [])
        .slice(0, 10)
        .map((x: any) => ({
          t: String((x && x.t) || '').replace(/\D/g, '').slice(0, 20),
          s: x && x.s === 'SELL' ? 'SELL' : 'BUY',
          l: Number(x && x.l) || 0,
          o: Number(x && x.o) || 0,
          p: Number(x && x.p) || 0,
          a: Number(x && x.a) || 0,
        }))
        .filter((x: any) => x.t),
    };
    st.sig = st.pos.map((x: any) => x.t).sort().join(',');

    // Transactionally update status/logins ONLY so freshly saved user cfg is never overwritten!
    const latestRec = await runStoreTransaction(async (tx) => {
      const cur = (await tx.get<any>('eakeys', kk)) || rec;
      await tx.set('eakeys', kk, { status: st, logins, licOk, licT }, true);
      return cur;
    });

    if (login && !latestRec.lockLogin) {
      const bk = await colGet<any>('settings', `brk_${latestRec.email}`);
      if (!bk || bk.login !== login) {
        await colPut('settings', `brk_${latestRec.email}`, {
          name: brokerFromServer(st.server) || (bk && bk.server === st.server ? bk.name : '') || '',
          login,
          server: st.server,
          lock: false,
          auto: true,
          t: Date.now(),
        });
      }
    }

    if (latestRec.bot === SW_BOT) {
      const c = latestRec.cfg || SW_DEF;
      const nt = await newsToday();
      const first = nt.today[0];
      return out({
        ok: 1,
        lic: 1,
        run: c.run ? 1 : 0,
        lotMode: c.lotMode,
        lot: c.lot,
        risk: c.risk,
        dd: c.dd,
        maxOpen: c.maxOpen,
        closeAt: c.closeAt || 0,
        perHour: c.perHour,
        lossStreak: c.lossStreak,
        newsToday: nt.today.length,
        newsName: first ? first.title : '',
        newsTs: first ? Math.floor(first.ts / 1000) : 0,
        lockLogin: latestRec.lockLogin || '',
        ...cmdOf(c),
        ...(await aiFor(c)),
        msg: '',
      });
    }

    const c = latestRec.cfg || EA_DEF;
    return out({
      ok: 1,
      lic: 1,
      run: c.run ? 1 : 0,
      mode: c.mode,
      scalpTf: c.scalpTf || '1',
      lotMode: c.lotMode,
      lot: c.lot,
      risk: c.risk,
      dd: c.dd,
      maxOpen: c.maxOpen,
      closeAt: c.closeAt || 0,
      lockLogin: latestRec.lockLogin || '',
      ...cmdOf(c),
      ...(await aiFor(c)),
      msg: '',
    });
  }

  // ---------- Broker Account ----------
  if ((GET || POST) && p === '/broker') {
    const w = await who();
    if (w.err) return w.err;
    const lic = (await colGet<any>('licenses', w.em)) || {};
    const recs: any[] = [];
    for (const bot of [EA_BOT, SW_BOT]) {
      const ix = await colGet<{ key?: string }>('settings', `ea_${w.em}_${bot}`);
      const r = ix?.key ? await colGet<any>('eakeys', ix.key) : null;
      if (r) recs.push(r);
    }
    if (POST) {
      const login = String(req.body?.login || '').trim();
      const name = String(req.body?.name || '').trim().slice(0, 30);
      if (!/^\d{5,12}$/.test(login)) return out({ error: 'The MT5 login is only numbers, usually 5 to 12 digits.' }, 400);
      if (!name) return out({ error: 'Choose your broker.' }, 400);
      const bk = { name, login, server: String(req.body?.server || '').trim().slice(0, 50), lock: !!req.body?.lock, auto: false, t: Date.now() };
      await colPut('settings', `brk_${w.em}`, bk);
      for (const r of recs) {
        await colPut('eakeys', r.key, { lockLogin: bk.lock ? login : '' }, true);
      }
    }
    const bk = await colGet<any>('settings', `brk_${w.em}`);
    const now = Date.now();
    const robots = recs.map((r) => ({
      bot: r.bot || EA_BOT,
      name: EA_NAMES[r.bot || EA_BOT],
      run: !!(r.cfg && r.cfg.run),
      ai: (r.cfg && r.cfg.aiMode) || 'off',
      status: r.status ? { ...r.status, online: now - r.status.t < 180000 } : null,
    }));
    const live = robots.map((r) => r.status).filter(Boolean).sort((x, y) => y.t - x.t)[0] || null;
    return out({
      broker: bk,
      brokers: BROKERS.map((x) => x[1]).concat(['Other']),
      robots,
      live,
      has: { [EA_BOT]: !!lic[EA_BOT], [SW_BOT]: !!lic[SW_BOT] },
    });
  }

  // ---------- AI Top-Down Scanner ----------
  if ((GET || POST) && (p === '/ai/status' || p === '/ai/scan')) {
    const w = await who();
    if (w.err) return w.err;
    const now = Date.now();
    const view = (a: any) => ({
      left: a.aiLeft || 0,
      freeUsed: !!a.aiFree,
      price: P.aiscan,
      pack: AI_PACK,
      last: (a.aiSigs || []).slice(-5).reverse(),
      now,
    });
    if (GET || p === '/ai/status') return out(view(w.acct));
    if (!w.acct.aiFree && !w.decoded.emailVerified) {
      return out({ error: 'Confirm your email address first to claim your free AI scan.', needVerify: true }, 403);
    }
    if (w.acct.aiFree && !(w.acct.aiLeft > 0)) return out({ ...view(w.acct), paywall: true }, 402);

    const scan = await aiScanNow();
    const best = scan.signals[0] || null;
    let sent: any = null;
    let repeat = false;
    let latestAcct = w.acct;

    if (best) {
      const outcome = await runStoreTransaction(async (tx) => {
        const a = (await tx.get<any>('accounts', w.em)) || w.acct;
        const list = a.aiSigs || [];
        const dup = list.find((x: any) => x.symbol === best.symbol && x.dir === best.dir && now - x.sentAt < 60 * 60000);
        if (dup) return { a, sent: dup, repeat: true };
        if (a.aiFree && !(a.aiLeft > 0)) return { a, paywall: true };
        if (!a.aiFree) a.aiFree = true;
        else a.aiLeft = (a.aiLeft || 0) - 1;
        const s = { ...best, sentAt: now };
        a.aiSigs = [...list, s].slice(-20);
        await tx.set('accounts', w.em, a);
        return { a, sent: s, repeat: false };
      });
      if ((outcome as any).paywall) return out({ ...view(outcome.a), paywall: true }, 402);
      latestAcct = outcome.a;
      sent = outcome.sent;
      repeat = !!outcome.repeat;
    }

    return out({
      ...view(latestAcct),
      closed: scan.closed,
      markets: scan.markets,
      oil: scan.oil || null,
      errors: scan.errors || [],
      signal: sent,
      repeat,
      others: scan.signals.slice(1).map((x: any) => ({ symbol: x.symbol, dir: x.dir, tf: x.tf })),
    });
  }

  // ---------- Forex SMC/ICT Signals ----------
  if ((GET || POST) && (p === '/signals' || p === '/signals/scan')) {
    const w = await who();
    if (w.err) return w.err;
    const now = Date.now();
    const acct = w.acct;
    const manualList = ((await colGet<{ list?: any[] }>('signals', 'manual'))?.list || []).filter((s) => s.published !== false);

    const sigView = (a: any) => ({
      paid: (a.subEnd || 0) > now || adminFlag,
      subEnd: a.subEnd || 0,
      free: a.free || { state: 'none' },
      price: P.signals,
      now,
    });

    if ((acct.subEnd || 0) > now || adminFlag) {
      const s = await currentSignals();
      return out({ ...sigView(acct), updated: s.t, closed: s.closed, scan: s.scan, signals: [...manualList, ...(s.signals || [])] });
    }

    acct.free = acct.free || { state: 'none' };
    const f = acct.free;
    if (f.state === 'done') return out({ ...sigView(acct), paywall: true }, POST ? 402 : 200);
    if (f.state === 'active' || GET) return out(sigView(acct));

    if (!w.decoded.emailVerified) {
      return out({ error: 'Confirm your email first to unlock your free SMC/ICT signal.', needVerify: true }, 403);
    }

    const s = await currentSignals();
    const combined = [...manualList, ...(s.signals || [])];
    const updatedAcct = await runStoreTransaction(async (tx) => {
      const a = (await tx.get<any>('accounts', w.em)) || acct;
      a.free = a.free || { state: 'none' };
      if (a.free.state === 'done' || a.free.state === 'active') return a;
      if (combined.length) {
        a.free = { state: 'active', sig: combined[0], t: now };
      } else {
        a.free = { state: 'pending', started: now };
      }
      await tx.set('accounts', w.em, a);
      return a;
    });
    return out({ ...sigView(updatedAcct), closed: s.closed, scan: s.scan });
  }

  // ---------- Orders (Pochi, PayPal manual proof, USDT manual) ----------
  if (POST && p === '/order') {
    const w = await who();
    if (w.err) return w.err;
    if (!checkRate('ord:' + w.em, 12)) return out({ error: 'Too many order attempts. Wait a minute.' }, 429);

    const b = req.body || {};
    const botId = String(b.botId || '');
    if (!Object.hasOwn(P, botId)) return out({ error: 'Unknown product.' }, 400);
    const method = ['pochi', 'paypal', 'usdt'].includes(b.method) ? b.method : 'pochi';
    const lic = (await colGet<any>('licenses', w.em)) || {};
    if (botId !== 'signals' && botId !== 'aiscan' && lic[botId]) {
      return out({ error: 'This bot is already unlocked on your account.' }, 409);
    }

    const ref = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const t = Date.now();
    const okey = `${String(9999999999999 - t).padStart(13, '0')}.${ref}`;

    if (method !== 'pochi') {
      const proof = String(b.proof || '').trim().slice(0, 300);
      if (proof.length < 6) {
        return out({ error: method === 'paypal' ? 'Paste your PayPal transaction ID.' : 'Paste your USDT transaction hash.' }, 400);
      }
      if (method === 'usdt' && !CFG0.usdtAddress) return out({ error: 'USDT payments are not set up yet.' }, 400);
      const codeKey = `px_${proof.toLowerCase().replace(/[^a-z0-9_-]/g, '')}`;
      const usd = Math.ceil(P[botId] / (CFG0.usdRate || 130));
      const wa2 = normPhone(b.whatsapp) || String(b.whatsapp || '').replace(/[^\d+]/g, '').slice(0, 20);
      const orderDoc = { ref, t, botId, price: P[botId], usd, method, proof, whatsapp: wa2, account: w.em, email: w.u.email, name: w.u.name, status: 'pending' };
      try {
        await runStoreTransaction(async (tx) => {
          if (await tx.get('orderRefs', codeKey)) throw new Error('DUP_CODE');
          await tx.set('orderRefs', codeKey, { ref, orderKey: okey, createdAt: t });
          await tx.set('orderRefs', ref, { orderKey: okey, ref, createdAt: t });
          await tx.set('orders', okey, orderDoc);
          await tx.set('orderStatus', ref, { status: 'pending', approved: false, botId });
        });
      } catch (e: any) {
        if (e.message === 'DUP_CODE') return out({ error: 'That transaction ID was already used for an order.' }, 409);
        throw e;
      }
      return out({ ref, usd });
    }

    const wa = normPhone(b.whatsapp);
    if (!wa) return out({ error: 'Enter a valid WhatsApp number like 0712345678.' }, 400);
    const msg = String(b.mpesa || '').slice(0, 700);
    if (msg.trim().length < 15) return out({ error: 'Paste the full M-Pesa confirmation message.' }, 400);
    const info = parseMpesa(msg, P[botId], CFG0.pochi);
    if (!info.code) {
      return out({ error: 'The payment code looks wrong. Copy the full M-Pesa message starting with the 10-character transaction code.' }, 400);
    }
    const codeKey = `mp_${info.code}`;
    const autoApproveNow = Boolean(CFG0.autoApprove && info.amountOk && info.toOwner);
    const orderDoc = {
      ref,
      t,
      botId,
      price: P[botId],
      usd: Math.ceil(P[botId] / (CFG0.usdRate || 130)),
      whatsapp: wa,
      account: w.em,
      email: w.u.email,
      name: w.u.name,
      method: 'pochi',
      mpesa: msg,
      info,
      status: autoApproveNow ? 'approved' : 'pending',
    };

    try {
      await runStoreTransaction(async (tx) => {
        if (await tx.get('orderRefs', codeKey)) throw new Error('DUP_MPESA');
        await tx.set('orderRefs', codeKey, { ref, orderKey: okey, createdAt: t });
        await tx.set('orderRefs', ref, { orderKey: okey, ref, createdAt: t });
        await tx.set('orders', okey, orderDoc);
        await tx.set('orderStatus', ref, { status: orderDoc.status, approved: autoApproveNow, botId });
      });
    } catch (e: any) {
      if (e.message === 'DUP_MPESA') return out({ error: 'That M-Pesa transaction code was already used for an order.' }, 409);
      throw e;
    }

    if (autoApproveNow) {
      await fulfil(B, { account: w.em, contact: w.u.email, botId, ref, via: 'pochi-auto' });
    }
    return out({ ref, approved: autoApproveNow });
  }

  // ---------- Daraja / Paystack M-Pesa STK Push ----------
  const daraCheck = async (ref: string, botId: string, rec: any) => {
    if (await colGet('orderRefs', 'paid_' + ref)) return null;
    const ts = dStamp();
    const q = await dCall('/mpesa/stkpushquery/v1/query', {
      BusinessShortCode: dShort(),
      Password: dPass(ts),
      Timestamp: ts,
      CheckoutRequestID: rec.checkout,
    });
    if (q.ResultCode === undefined || q.ResultCode === null || q.ResultCode === '') {
      return { paid: false, final: false, status: q.errorMessage || 'waiting for your M-Pesa PIN' };
    }
    const FAILED = ['1', '1001', '1019', '1025', '1032', '1037', '2001', '2006', '9999'];
    if (String(q.ResultCode) !== '0') {
      return { paid: false, final: FAILED.includes(String(q.ResultCode)), status: `${q.ResultCode}: ${q.ResultDesc || 'not completed'}` };
    }
    await runStoreTransaction(async (tx) => {
      if (await tx.get('orderRefs', 'paid_' + ref)) return;
      await tx.set('orderRefs', 'paid_' + ref, { t: Date.now() });
      if (rec.orderKey) await tx.set('orders', rec.orderKey, { status: 'approved' }, true);
      await tx.set('orderStatus', ref, { status: 'approved', approved: true, botId });
    });
    await fulfil(B, { account: rec.account, contact: rec.email, botId, ref, via: 'daraja' });
    return null;
  };

  if (POST && (p === '/charge' || p === '/mpesa/stkpush')) {
    const w = await who();
    if (w.err) return w.err;
    if (!checkRate('chg:' + w.em, 8)) return out({ error: 'Too many payment prompts. Wait a minute.' }, 429);
    const botId = String(req.body?.botId || req.body?.orderId || '');
    const phone = String(req.body?.phone || '');
    if (!Object.hasOwn(P, botId)) return out({ error: 'Unknown product.' }, 400);
    const lic = (await colGet<any>('licenses', w.em)) || {};
    if (botId !== 'signals' && botId !== 'aiscan' && lic[botId]) return out({ error: 'This bot is already unlocked.' }, 409);
    const msisdn = normPhone(phone);
    if (!msisdn) return out({ error: 'Enter a valid Safaricom number like 0712345678.' }, 400);

    const hasDaraja = Boolean(dKey() && dSecret() && dShort() && dPasskey());
    const hasPaystackLive = String(process.env.PAYSTACK_SECRET || '').startsWith('sk_live');
    if (!hasDaraja && !hasPaystackLive) {
      return out({ error: 'Prompt payments are not configured yet. Please pay via M-Pesa Pochi instead.' }, 503);
    }

    const t = Date.now();
    if (hasDaraja) {
      const ts = dStamp();
      const till = !!dTill();
      const r = await dCall('/mpesa/stkpush/v1/processrequest', {
        BusinessShortCode: dShort(),
        Password: dPass(ts),
        Timestamp: ts,
        TransactionType: till ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
        Amount: P[botId],
        PartyA: msisdn,
        PartyB: dTill() || dShort(),
        PhoneNumber: msisdn,
        CallBackURL: process.env.MPESA_CALLBACK_URL || `${req.origin}/api/daraja/cb`,
        AccountReference: 'TRADERSPRO254',
        TransactionDesc: botId.slice(0, 20),
      });
      if (r.ResponseCode !== '0' || !r.CheckoutRequestID) {
        return out({ error: r.errorMessage || r.ResponseDescription || 'Payment prompt could not start.' }, 502);
      }
      const reference = `CL.${botId}.${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const okey = `${String(9999999999999 - t).padStart(13, '0')}.${reference}`;
      await colPut('orders', okey, {
        ref: reference,
        t,
        botId,
        price: P[botId],
        usd: Math.ceil(P[botId] / (CFG0.usdRate || 130)),
        method: 'daraja',
        whatsapp: msisdn,
        account: w.em,
        email: w.u.email,
        name: w.u.name,
        status: 'pending',
      });
      await colPut('orderRefs', 'dj_' + reference, { checkout: r.CheckoutRequestID, botId, account: w.em, email: w.u.email, orderKey: okey });
      await colPut('orderRefs', 'dc_' + r.CheckoutRequestID, { ref: reference });
      await colPut('orderStatus', reference, { status: 'pending', approved: false, botId });
      return out({ ok: true, reference, checkoutRequestId: r.CheckoutRequestID, message: 'Check your phone and enter your M-Pesa PIN.' });
    }

    let reference = '';
    let psRes: any = {};
    for (const phoneForm of ['+' + msisdn, '0' + msisdn.slice(3)]) {
      reference = `CL.${botId}.${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
      const r = await fetch(PAYSTACK_API + '/charge', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: w.u.email,
          amount: P[botId] * 100,
          currency: 'KES',
          reference,
          mobile_money: { phone: phoneForm, provider: 'mpesa' },
          metadata: { botId, account: w.em },
        }),
      });
      psRes = await r.json();
      if (psRes.status || !/phone/i.test(psRes.message || '')) break;
    }
    if (!psRes.status) return out({ error: psRes.message || 'Payment could not start.' }, 502);
    if (psRes.data?.status === 'failed') return out({ error: psRes.data.message || 'Payment failed.' }, 402);
    return out({ ok: true, reference, message: psRes.data?.display_text || 'Check your phone and enter your M-Pesa PIN.' });
  }

  if (POST && (p === '/daraja/cb' || p === '/mpesa/callback')) {
    try {
      const cb = req.body?.Body?.stkCallback;
      const id = cb?.CheckoutRequestID;
      if (id && dKey()) {
        const refDoc = await colGet<{ ref?: string }>('orderRefs', 'dc_' + id);
        const ref = refDoc?.ref || '';
        const rec = ref ? await colGet<any>('orderRefs', 'dj_' + ref) : null;
        if (rec) {
          if (String(cb.ResultCode) === '0') {
            await daraCheck(ref, String(ref).split('.')[1], rec);
          } else {
            await colPut('orderStatus', ref, { status: 'rejected', approved: false, botId: rec.botId });
            if (rec.orderKey) await colPut('orders', rec.orderKey, { status: 'rejected', rejectReason: cb.ResultDesc || 'Cancelled' }, true);
          }
        }
      }
    } catch {}
    return out({ ResultCode: 0, ResultDesc: 'Accepted' });
  }

  if (GET && p === '/status') {
    const ref = String(req.query.ref || '');
    const [pre, botId] = ref.split('.');
    if (pre !== 'CL' || !Object.hasOwn(P, botId)) return out({ error: 'Bad reference.' }, 400);
    const rec = await colGet<any>('orderRefs', 'dj_' + ref);
    if (rec) {
      const pend = await daraCheck(ref, botId, rec);
      return out(pend || { paid: true, botId });
    }
    if (!String(process.env.PAYSTACK_SECRET || '').startsWith('sk_live')) return out({ error: 'Bad reference.' }, 400);
    const r = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET}` },
    });
    const j = (await r.json()) as any;
    const d = j.data || {};
    if (d.status === 'success' && d.currency === 'KES' && d.amount >= P[botId] * 100 && d.metadata?.account) {
      if (!(await colGet('orderRefs', 'paid_' + ref))) {
        await colPut('orderRefs', 'paid_' + ref, { t: Date.now() });
        await fulfil(B, { account: d.metadata.account, contact: String(d.customer?.email || ''), botId, ref, via: 'paystack' });
      }
      return out({ paid: true, botId });
    }
    return out({ paid: false, final: ['failed', 'abandoned', 'reversed'].includes(d.status), status: d.status || 'pending' });
  }

  // ---------- Paystack Webhook (HMAC-SHA512 Verified) ----------
  if (POST && p === '/paystack/webhook') {
    const secret = process.env.PAYSTACK_SECRET || '';
    const sig = String(req.headers['x-paystack-signature'] || '');
    if (!secret || !sig) return out({ error: 'Unauthorized' }, 401);
    const expected = crypto.createHmac('sha512', secret).update(req.rawBody || JSON.stringify(req.body || {})).digest('hex');
    if (!constantTimeEqual(expected, sig)) return out({ error: 'Invalid signature' }, 401);
    const ev = req.body;
    if (ev?.event === 'charge.success' && ev.data?.status === 'success') {
      const ref = String(ev.data.reference || '');
      const botId = String(ev.data.metadata?.botId || ref.split('.')[1] || '');
      const acct = String(ev.data.metadata?.account || '');
      if (Object.hasOwn(P, botId) && acct && ev.data.amount >= P[botId] * 100 && !(await colGet('orderRefs', 'paid_' + ref))) {
        await colPut('orderRefs', 'paid_' + ref, { t: Date.now() });
        await fulfil(B, { account: acct, contact: String(ev.data.customer?.email || ''), botId, ref, via: 'paystack-webhook' });
      }
    }
    return out({ received: true });
  }

  // ---------- PayPal REST v2 Checkout ----------
  if (POST && p === '/paypal/create-order') {
    const w = await who();
    if (w.err) return w.err;
    const botId = String(req.body?.botId || req.body?.orderId || '');
    if (!Object.hasOwn(P, botId)) return out({ error: 'Unknown product.' }, 400);
    const usd = Math.ceil(P[botId] / (CFG0.usdRate || 130));
    const result = await createPayPalOrder({
      amountUsd: usd,
      itemName: botName(B, botId),
      orderId: botId,
      returnUrl: String(req.body?.returnUrl || `${req.origin}/?paypal=success&bot=${encodeURIComponent(botId)}`),
      cancelUrl: String(req.body?.cancelUrl || `${req.origin}/?paypal=cancel`),
    });
    if (result.ok && result.paypalOrderId) {
      await colPut('orderRefs', 'pp_' + result.paypalOrderId, { account: w.em, email: w.u.email, name: w.u.name, botId, price: P[botId], usd });
    }
    return out(result, result.ok ? 200 : 400);
  }

  if (POST && p === '/paypal/capture-order') {
    const w = await who();
    if (w.err) return w.err;
    const paypalOrderId = String(req.body?.paypalOrderId || '');
    const meta = await colGet<any>('orderRefs', 'pp_' + paypalOrderId);
    if (!meta || meta.account !== w.em) return out({ error: 'PayPal order session not found for this account.' }, 404);
    const result = await capturePayPalOrder(paypalOrderId);
    if (!result.ok) return out(result, 400);
    if (!(await colGet('orderRefs', 'paid_pp_' + paypalOrderId))) {
      await colPut('orderRefs', 'paid_pp_' + paypalOrderId, { t: Date.now() });
      const t = Date.now();
      const okey = `${String(9999999999999 - t).padStart(13, '0')}.${paypalOrderId}`;
      await colPut('orders', okey, {
        ref: paypalOrderId,
        t,
        botId: meta.botId,
        price: meta.price,
        usd: meta.usd,
        method: 'paypal',
        proof: paypalOrderId,
        account: w.em,
        email: w.u.email,
        name: w.u.name,
        status: 'approved',
      });
      await fulfil(B, { account: w.em, contact: w.u.email, botId: meta.botId, ref: paypalOrderId, via: 'paypal' });
    }
    return out({ ...result, botId: meta.botId });
  }

  // ---------- ADMIN ROUTES (all 12 dashboard sections) ----------
  if (p.startsWith('/admin/')) {
    if (!adminFlag) return out({ error: 'Admin privileges required.' }, 403);
    const actor = decoded?.email || 'owner-key';

    if (GET && p === '/admin/ping') return out({ ok: true });

    if (GET && (p === '/admin/overview' || p === '/admin/stats')) {
      const now = Date.now();
      const orders = (await colList<any>('orders', 400)).map((x) => x.data);
      const users = (await colList<any>('users', 400)).map((x) => x.data);
      const accts = (await colList<any>('accounts', 400)).map((x) => x.data);
      const eakeys = (await colList<any>('eakeys', 200)).map((x) => x.data);
      const eng = await engStatus();

      const approved = orders.filter((o) => o.status === 'approved');
      const revWindow = (ms: number) =>
        approved
          .filter((o) => now - (o.t || 0) <= ms)
          .reduce(
            (acc, o) => ({ ksh: acc.ksh + (Number(o.price) || 0), usd: acc.usd + (Number(o.usd) || Math.ceil((Number(o.price) || 0) / (CFG0.usdRate || 130))) }),
            { ksh: 0, usd: 0 }
          );

      // 7-day daily chart
      const chart: Array<{ label: string; ksh: number }> = [];
      for (let i = 6; i >= 0; i--) {
        const dStart = new Date(now - i * DAY);
        dStart.setUTCHours(0, 0, 0, 0);
        const t0 = dStart.getTime();
        const t1 = t0 + DAY;
        const ksh = approved.filter((o) => o.t >= t0 && o.t < t1).reduce((s, o) => s + (Number(o.price) || 0), 0);
        chart.push({ label: dStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), ksh });
      }

      return out({
        rev1d: revWindow(DAY),
        rev7d: revWindow(7 * DAY),
        rev30d: revWindow(30 * DAY),
        totalUsers: users.length,
        newUsers7d: users.filter((u) => now - (u.created || 0) <= 7 * DAY).length,
        pendingOrders: orders.filter((o) => o.status === 'pending').length,
        activeSubs: accts.filter((a) => (a.subEnd || 0) > now).length,
        engineOnline: eng.online,
        engineOn: eng.on,
        engineLast: eng.hb?.t || 0,
        robotsOnline: eakeys.filter((k) => k.status && now - k.status.t < 180000).length,
        robotsTotal: eakeys.length,
        chart,
        health: {
          firebase: hasServiceAccount()
            ? { ok: true, label: 'Connected to Firestore Admin SDK' }
            : { ok: false, label: 'Preview JSON fallback active — add FIREBASE_SERVICE_ACCOUNT in Vercel for Firestore' },
          daraja:
            dKey() && dSecret() && dShort() && dPasskey()
              ? { ok: true, label: `Configured (${process.env.DARAJA_ENV === 'live' ? 'LIVE' : 'Sandbox'})` }
              : { ok: false, label: 'Missing DARAJA_KEY / SECRET / SHORTCODE / PASSKEY (Pochi still works)' },
          paypal:
            process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
              ? { ok: true, label: `Configured (${process.env.PAYPAL_ENV === 'live' ? 'LIVE' : 'Sandbox'})` }
              : { ok: false, label: 'Missing PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET' },
          email:
            process.env.BREVO_KEY && process.env.MAIL_FROM
              ? { ok: true, label: 'Brevo SMTP ready' }
              : { ok: false, label: 'Optional: add BREVO_KEY and MAIL_FROM for email receipts' },
          ai: hasAiKey()
            ? { ok: true, label: process.env.GEMINI_API_KEY ? 'Gemini AI ready' : 'Anthropic AI ready' }
            : { ok: false, label: 'Add GEMINI_API_KEY or ANTHROPIC_KEY for News AI, Brief & Bot Studio' },
          cron: process.env.CRON_SECRET
            ? { ok: true, label: 'CRON_SECRET configured' }
            : { ok: false, label: 'Set CRON_SECRET for external 1-minute Market Engine cron pings' },
        },
      });
    }

    if (GET && p === '/admin/orders') {
      const list = await colList<any>('orders', 150);
      const orders = list
        .map((x) => ({ ...x.data, orderKey: x.id, botName: botName(B, x.data.botId) }))
        .sort((a, b) => (b.t || 0) - (a.t || 0));
      return out({ orders });
    }

    if (POST && p === '/admin/order') {
      const { ref, action, refundNote } = req.body || {};
      const r = await colGet<{ orderKey?: string }>('orderRefs', String(ref || ''));
      if (!r?.orderKey) return out({ error: 'Order not found.' }, 404);
      const o = await colGet<any>('orders', r.orderKey);
      if (action === 'refund') {
        await colPut('orders', r.orderKey, { refundNote: String(refundNote || 'Refunded').slice(0, 300) }, true);
        await writeAudit(actor, 'order_refund_note', String(ref), String(refundNote || ''));
        return out({ ok: true });
      }
      if (action === 'delete') {
        if (o?.proof) await colDelete('orderRefs', 'px_' + String(o.proof).toLowerCase().replace(/[^a-z0-9_-]/g, ''));
        if (o?.info?.code) await colDelete('orderRefs', 'mp_' + o.info.code);
        await colDelete('orders', r.orderKey);
        await colDelete('orderRefs', String(ref));
        await colDelete('orderStatus', String(ref));
        await writeAudit(actor, 'order_delete', String(ref), o?.email || '');
        return out({ ok: true });
      }
      return out({ error: 'Unknown action.' }, 400);
    }

    if (POST && p === '/admin/approve') {
      const { ref, action, reason } = req.body || {};
      const r = await colGet<{ orderKey?: string }>('orderRefs', String(ref || ''));
      const o = r?.orderKey ? await colGet<any>('orders', r.orderKey) : null;
      if (!o || !r?.orderKey) return out({ error: 'Order not found.' }, 404);
      if (action === 'reject') {
        o.status = 'rejected';
        o.rejectReason = String(reason || '').slice(0, 300);
        await colPut('orders', r.orderKey, o);
        await colPut('orderStatus', String(ref), { status: 'rejected', approved: false, botId: o.botId, rejectReason: o.rejectReason });
        await writeAudit(actor, 'order_reject', String(ref), o.rejectReason || o.email);
        return out({ ok: true, status: o.status });
      }
      if (o.status !== 'approved') {
        o.status = 'approved';
        o.mailed = await fulfil(B, { account: o.account || normEmail(o.email), contact: o.email, botId: o.botId, ref: String(ref), via: o.method || 'pochi' });
        await colPut('orders', r.orderKey, o);
        await colPut('orderStatus', String(ref), { status: 'approved', approved: true, botId: o.botId });
        await writeAudit(actor, 'order_approve', String(ref), `${o.email} -> ${o.botId}`);
      }
      return out({ ok: true, status: o.status, mailed: !!o.mailed });
    }

    if (GET && p === '/admin/clients') {
      const users = await colList<any>('users', 300);
      const now = Date.now();
      const clients = await Promise.all(
        users.map(async ({ id, data: u }) => {
          const em = id;
          const lic = (await colGet<any>('licenses', em)) || {};
          const a = (await colGet<any>('accounts', em)) || {};
          const ea1 = await colGet<{ key?: string }>('settings', `ea_${em}_${EA_BOT}`);
          const ea2 = await colGet<{ key?: string }>('settings', `ea_${em}_${SW_BOT}`);
          const robots: any[] = [];
          for (const lk of [ea1?.key, ea2?.key]) {
            if (lk) {
              const rec = await colGet<any>('eakeys', lk);
              if (rec) robots.push({ key: rec.key, bot: rec.bot, status: rec.status || null });
            }
          }
          return {
            uid: u.uid || '',
            account: em,
            email: u.email,
            name: u.name,
            verified: !!u.verified,
            blocked: !!u.blocked,
            created: u.created || 0,
            lastLoginAt: u.lastLoginAt || 0,
            adminNote: u.adminNote || '',
            bots: Object.keys(lic),
            subEnd: a.subEnd || 0,
            subActive: (a.subEnd || 0) > now,
            aiLeft: a.aiLeft || 0,
            free: a.free?.state || 'none',
            freeResult: a.free?.result || null,
            robots,
          };
        })
      );
      clients.sort((x, y) => (y.created || 0) - (x.created || 0));
      return out({ clients });
    }

    if (POST && p === '/admin/license') {
      const { account, botId, action, amount } = req.body || {};
      const em = normEmail(String(account || ''));
      const u = await colGet<any>('users', em);
      if (!u) return out({ error: 'No account with that email.' }, 404);
      if (action === 'grant') {
        if (!Object.hasOwn(P, botId) && botId !== 'signals') return out({ error: 'Unknown product.' }, 400);
        await fulfil(B, { account: em, contact: u.email, botId, ref: 'admin', via: 'admin', quiet: true });
      } else if (action === 'revoke') {
        if (botId === 'signals') {
          const a = (await colGet<any>('accounts', em)) || { created: Date.now(), subEnd: 0, free: { state: 'none' } };
          a.subEnd = 0;
          await saveAcct(em, a);
        } else {
          const l = (await colGet<any>('licenses', em)) || {};
          delete l[botId];
          await colPut('licenses', em, l);
        }
      } else if (action === 'resetfree') {
        const a = (await colGet<any>('accounts', em)) || { created: Date.now(), subEnd: 0, free: { state: 'none' } };
        a.free = { state: 'none' };
        a.aiFree = false;
        await saveAcct(em, a);
      } else if (action === 'addcredits') {
        const a = (await colGet<any>('accounts', em)) || { created: Date.now(), subEnd: 0, free: { state: 'none' } };
        a.aiLeft = Math.max(0, (a.aiLeft || 0) + (Number(amount) || 5));
        await saveAcct(em, a);
      } else if (action === 'extend') {
        const a = (await colGet<any>('accounts', em)) || { created: Date.now(), subEnd: 0, free: { state: 'none' } };
        a.subEnd = Math.max(a.subEnd || 0, Date.now()) + (Number(amount) || 7) * DAY;
        await saveAcct(em, a);
      } else {
        return out({ error: 'Unknown action.' }, 400);
      }
      await writeAudit(actor, `license_${action}`, em, `${botId || ''} ${amount || ''}`.trim());
      return out({ ok: true });
    }

    if (POST && p === '/admin/client') {
      const { account, action, note } = req.body || {};
      const em = normEmail(String(account || ''));
      const u = await colGet<any>('users', em);
      if (action === 'delete') {
        if (u?.uid) await deleteFirebaseAuthUser(u.uid);
        for (const bot of [EA_BOT, SW_BOT]) {
          const ix = await colGet<{ key?: string }>('settings', `ea_${em}_${bot}`);
          if (ix?.key) await colDelete('eakeys', ix.key);
          await colDelete('settings', `ea_${em}_${bot}`);
        }
        await colDelete('settings', `brk_${em}`);
        await colDelete('users', em);
        await colDelete('accounts', em);
        await colDelete('licenses', em);
        await writeAudit(actor, 'client_delete', em);
        return out({ ok: true, deleted: em });
      }
      if (!u) return out({ error: 'No account with that email.' }, 404);
      if (action === 'logout') {
        const a = (await colGet<any>('accounts', em)) || { created: Date.now(), subEnd: 0, free: { state: 'none' } };
        a.revokedAt = Date.now();
        await saveAcct(em, a);
      } else if (action === 'block') {
        u.blocked = true;
        await colPut('users', em, u);
      } else if (action === 'unblock') {
        u.blocked = false;
        await colPut('users', em, u);
      } else if (action === 'note') {
        u.adminNote = String(note || '').slice(0, 500);
        await colPut('users', em, u);
      } else {
        return out({ error: 'Unknown action.' }, 400);
      }
      await writeAudit(actor, `client_${action}`, em, note || '');
      return out({ ok: true });
    }

    if (POST && p === '/admin/prices') {
      const { prices } = req.body || {};
      const o = (await colGet<Record<string, number>>('settings', 'prices')) || {};
      for (const [id, v] of Object.entries(prices || {})) {
        if (!Object.hasOwn(P, id)) continue;
        if (v === null || v === '') delete o[id];
        else if (Number.isInteger(Number(v)) && Number(v) >= 10 && Number(v) <= 1000000) o[id] = Number(v);
      }
      await colPut('settings', 'prices', o);
      cacheDel('settings:prices');
      await writeAudit(actor, 'prices_update', 'prices', JSON.stringify(prices).slice(0, 200));
      return out(await getPrices(B));
    }

    if (POST && p === '/admin/config') {
      const b = req.body || {};
      const c = { ...CFG0 };
      if (b.pochi) {
        const n = normPhone(b.pochi);
        if (!n) return out({ error: 'Pochi number must look like 0712345678.' }, 400);
        c.pochi = '0' + n.slice(3);
      }
      if (b.whatsapp) {
        const n = normPhone(b.whatsapp);
        if (!n) return out({ error: 'WhatsApp number must look like 0712345678.' }, 400);
        c.whatsapp = n;
      }
      if (b.paypal !== undefined) {
        const e = String(b.paypal).trim();
        if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return out({ error: 'Enter a valid PayPal email.' }, 400);
        c.paypal = e;
      }
      if (b.usdtAddress !== undefined) {
        const a = String(b.usdtAddress).trim();
        if (a && !/^[A-Za-z0-9]{20,100}$/.test(a)) return out({ error: 'That wallet address does not look right.' }, 400);
        c.usdtAddress = a;
      }
      if (b.usdtNetwork) c.usdtNetwork = String(b.usdtNetwork).trim().toUpperCase().slice(0, 14);
      if (b.usdRate !== undefined && b.usdRate !== '') {
        const r = Number(b.usdRate);
        if (!(r >= 20 && r <= 1000)) return out({ error: 'KSh per dollar must be between 20 and 1000.' }, 400);
        c.usdRate = r;
      }
      if (b.payMode) {
        if (!['auto', 'manual', 'both', 'stk'].includes(b.payMode)) return out({ error: 'Bad pay mode.' }, 400);
        c.payMode = b.payMode;
      }
      if (b.autoApprove !== undefined) c.autoApprove = !!b.autoApprove;
      if (b.showUsdForeign !== undefined) c.showUsdForeign = !!b.showUsdForeign;
      if (b.maintenance !== undefined) c.maintenance = !!b.maintenance;
      await colPut('settings', 'cfg', c);
      cacheDel('settings:cfg');
      await writeAudit(actor, 'config_update', 'cfg', Object.keys(b).join(','));
      return out(c);
    }

    if (POST && p === '/admin/test-stk') {
      const msisdn = normPhone(req.body?.phone || '');
      if (!msisdn) return out({ error: 'Enter a valid Safaricom number like 0712345678.' }, 400);
      if (!dKey() || !dSecret() || !dShort() || !dPasskey()) {
        return out({ error: 'Daraja env variables are not set yet.' }, 400);
      }
      const ts = dStamp();
      const till = !!dTill();
      const r = await dCall('/mpesa/stkpush/v1/processrequest', {
        BusinessShortCode: dShort(),
        Password: dPass(ts),
        Timestamp: ts,
        TransactionType: till ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
        Amount: 1,
        PartyA: msisdn,
        PartyB: dTill() || dShort(),
        PhoneNumber: msisdn,
        CallBackURL: process.env.MPESA_CALLBACK_URL || `${req.origin}/api/daraja/cb`,
        AccountReference: 'TP254TEST',
        TransactionDesc: 'Test STK',
      });
      await writeAudit(actor, 'test_stk', msisdn, r.ResponseCode || r.errorMessage || '');
      return out({ ok: r.ResponseCode === '0', response: r });
    }

    if (POST && p === '/admin/logoutall') {
      await colPut('settings', 'cfg', { ...CFG0, revokeAll: Date.now() });
      cacheDel('settings:cfg');
      await writeAudit(actor, 'logout_all', 'all_users');
      return out({ ok: true });
    }

    if (GET && p === '/admin/botrules') {
      const r = await colGet('botrules', String(req.query.id || ''));
      return r ? out(r) : out({ error: 'No saved rules for that bot.' }, 404);
    }

    if (POST && p === '/admin/rules-ai') {
      if (!hasAiKey()) return out({ error: 'Add GEMINI_API_KEY or ANTHROPIC_KEY in environment variables first.' }, 503);
      const text = String(req.body?.text || '').trim().slice(0, 1500);
      if (!text) return out({ error: 'Write the rules in plain words first.' }, 400);
      try {
        const res = await synthesizeRulesAi(text, req.body?.current || null);
        await writeAudit(actor, 'rules_ai', 'bot_studio', text.slice(0, 120));
        return out(res);
      } catch (e) {
        return out({ error: e instanceof Error ? e.message : 'AI synthesis failed.' }, 502);
      }
    }

    if (POST && p === '/admin/bot') {
      const b = req.body || {};
      const id = String(b.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
      if (!id) return out({ error: 'Give the bot an id (letters, numbers, dashes).' }, 400);
      const nb = JSON.parse(JSON.stringify(B));
      const baked = Object.hasOwn(PRICES, id);
      const isExtra = Object.hasOwn(nb.extra, id);

      if (b.action === 'add') {
        if (baked || isExtra) return out({ error: 'A bot with that id already exists.' }, 409);
        const price = Number(b.price);
        const name = String(b.name || '').trim().slice(0, 80);
        const sec = b.section === 'forex' ? 'forex' : b.section === 'automated' ? 'automated' : 'deriv';
        if (!name) return out({ error: 'Give the bot a name.' }, 400);
        if (!(Number.isInteger(price) && price >= 10)) return out({ error: 'Price must be at least 10 KSh.' }, 400);
        if (!b.entry || typeof b.entry !== 'object' || String(b.key || '').length < 8) {
          return out({ error: 'Encrypted bot entry or key (min 8 chars) is missing.' }, 400);
        }
        if (JSON.stringify(b.entry).length > 850000) {
          return out({ error: 'Encrypted bot file exceeds the 650 KB / Firestore safe limit.' }, 400);
        }
        nb.extra[id] = {
          id,
          name,
          desc: String(b.desc || '').slice(0, 400),
          how: String(b.how || 'Open the tool, connect your account, test on demo first.').slice(0, 300),
          section: sec,
          category: sec === 'forex' ? 'forex' : String(b.category || 'digits').slice(0, 30),
          sub: String(b.sub || '').slice(0, 30),
          platform: sec === 'forex' ? 'MT5 Expert Advisor' : String(b.platform || 'Deriv Bot').slice(0, 30),
          kind: sec === 'forex' ? 'file' : sec === 'automated' ? 'strategy' : 'xml',
          price,
          status: b.status === 'soon' ? 'soon' : 'live',
          locked: true,
        };
        await colPut('botentry', id, b.entry);
        await colPut('botkeys', id, { key: String(b.key) });
        if (b.rules) await colPut('botrules', id, { rules: cleanRules(b.rules), text: String(b.rulesText || '').slice(0, 2000) });
      } else if (b.action === 'update') {
        if (!isExtra && !baked) return out({ error: 'No such bot.' }, 404);
        if (b.entry && String(b.key || '').length >= 8) {
          if (JSON.stringify(b.entry).length > 850000) return out({ error: 'File exceeds safe size limit.' }, 400);
          await colPut('botentry', id, b.entry);
          await colPut('botkeys', id, { key: String(b.key) });
        } else if (b.key && String(b.key).length >= 8) {
          await colPut('botkeys', id, { key: String(b.key) });
        }
        if (b.rules) await colPut('botrules', id, { rules: cleanRules(b.rules), text: String(b.rulesText || '').slice(0, 2000) });
        if (isExtra) {
          if (b.name) nb.extra[id].name = String(b.name).trim().slice(0, 80);
          if (b.desc !== undefined) nb.extra[id].desc = String(b.desc).slice(0, 400);
          if (b.how !== undefined) nb.extra[id].how = String(b.how).slice(0, 300);
          if (b.status) nb.extra[id].status = b.status === 'soon' ? 'soon' : 'live';
          if (b.price && Number(b.price) >= 10) nb.extra[id].price = Math.round(Number(b.price));
        }
      } else if (b.action === 'delete') {
        if (isExtra) {
          delete nb.extra[id];
          await colDelete('botentry', id);
          await colDelete('botkeys', id);
          await colDelete('botrules', id);
        } else if (baked) {
          if (!nb.hide.includes(id)) nb.hide.push(id);
        } else return out({ error: 'No such bot.' }, 404);
      } else if (b.action === 'hide') {
        if (!nb.hide.includes(id)) nb.hide.push(id);
      } else if (b.action === 'unhide') {
        nb.hide = nb.hide.filter((x: string) => x !== id);
      } else if (b.action === 'edit') {
        const e = { ...(nb.edit[id] || {}) };
        if (typeof b.name === 'string' && b.name.trim()) e.name = b.name.trim().slice(0, 80);
        if (typeof b.desc === 'string') e.desc = b.desc.slice(0, 400);
        if (typeof b.how === 'string') e.how = b.how.slice(0, 300);
        if (b.status) e.status = b.status === 'soon' ? 'soon' : 'live';
        nb.edit[id] = e;
        if (b.price && Number(b.price) >= 10) {
          const po = (await colGet<Record<string, number>>('settings', 'prices')) || {};
          po[id] = Math.round(Number(b.price));
          await colPut('settings', 'prices', po);
          cacheDel('settings:prices');
        }
      } else {
        return out({ error: 'Unknown action.' }, 400);
      }

      await colPut('settings', 'bots', nb);
      cacheDel('settings:bots');
      cacheDel('settings:prices');
      await writeAudit(actor, `bot_${b.action}`, id, b.name || '');
      return out({ ok: true });
    }

    if (GET && p === '/admin/robots') {
      const list = await colList<any>('eakeys', 200);
      const now = Date.now();
      return out({
        robots: list.map(({ id, data }) => ({
          key: id,
          email: data.email,
          bot: data.bot || EA_BOT,
          cfg: data.cfg || {},
          status: data.status ? { ...data.status, online: now - data.status.t < 180000 } : null,
          logins: data.logins || [],
          licOk: !!data.licOk,
        })),
      });
    }

    if (POST && p === '/admin/robot') {
      const { key, action, lot } = req.body || {};
      const rec = await colGet<any>('eakeys', String(key || ''));
      if (!rec) return out({ error: 'Robot key not found.' }, 404);
      if (action === 'revoke') {
        await colDelete('eakeys', rec.key);
        await colDelete('settings', `ea_${rec.email}_${rec.bot || EA_BOT}`);
        await writeAudit(actor, 'robot_revoke', rec.key, rec.email);
        return out({ ok: true });
      }
      if (action === 'toggle') {
        rec.cfg = { ...(rec.cfg || {}), run: !(rec.cfg?.run ?? true) };
        await colPut('eakeys', rec.key, { cfg: rec.cfg }, true);
        await writeAudit(actor, 'robot_toggle', rec.key, rec.cfg.run ? 'RESUMED' : 'PAUSED');
        return out({ ok: true, run: rec.cfg.run });
      }
      if (action === 'lot') {
        const l = Math.max(0.01, Math.min(100, Number(lot) || 0.01));
        rec.cfg = { ...(rec.cfg || {}), lot: l };
        await colPut('eakeys', rec.key, { cfg: rec.cfg }, true);
        await writeAudit(actor, 'robot_lot', rec.key, String(l));
        return out({ ok: true, lot: l });
      }
      return out({ error: 'Unknown action.' }, 400);
    }

    if ((GET || POST) && p === '/admin/signals') {
      const manual = (await colGet<{ list?: any[] }>('signals', 'manual'))?.list || [];
      if (GET) {
        const accts = await colList<any>('accounts', 300);
        const freeStats = {
          none: accts.filter((a) => !a.data.free || a.data.free.state === 'none').length,
          active: accts.filter((a) => a.data.free?.state === 'active').length,
          done: accts.filter((a) => a.data.free?.state === 'done').length,
        };
        const eng = await engStatus();
        const doc = await colGet<any>('engine', 'sigs');
        const brief = await colGet<any>('engine', 'brief');
        return out({ manual, freeStats, eng, stats: engStats(doc), brief, sigs: (doc?.sigs || []).slice(0, 30) });
      }
      const b = req.body || {};
      if (b.action === 'delete') {
        const next = manual.filter((s) => s.id !== b.id);
        await colPut('signals', 'manual', { list: next });
        await writeAudit(actor, 'signal_delete', String(b.id || ''));
        return out({ ok: true, manual: next });
      }
      const sig = {
        id: 'man-' + Date.now().toString(36),
        symbol: String(b.symbol || 'XAUUSD').toUpperCase().slice(0, 16),
        tf: String(b.tf || 'M15').slice(0, 8),
        dir: b.dir === 'SELL' ? 'SELL' : 'BUY',
        status: 'ENTRY NOW',
        entry: Number(b.entry) || 0,
        sl: Number(b.sl) || 0,
        tp1: Number(b.tp1) || 0,
        tp2: Number(b.tp2) || Number(b.tp1) || 0,
        rr: Number(b.rr) || 2,
        score: 6,
        max: 6,
        event: String(b.notes || 'Manual Analyst Setup').slice(0, 140),
        killzone: 'Manual',
        published: true,
        t: Math.floor(Date.now() / 1000),
      };
      const next = [sig, ...manual].slice(0, 30);
      await colPut('signals', 'manual', { list: next });
      await writeAudit(actor, 'signal_publish', sig.symbol, `${sig.dir} @ ${sig.entry}`);
      return out({ ok: true, manual: next });
    }

    if (POST && p === '/admin/brief') {
      const evs = (await getNewsEvents().catch(() => null)) || [];
      const brief = await engBrief(evs, true);
      await writeAudit(actor, 'brief_regenerate', 'engine');
      return out({ ok: true, brief });
    }

    if ((GET || POST) && p === '/admin/announcements') {
      if (GET) {
        const list = await colList<any>('announcements', 30);
        return out({ announcements: list.map((x) => ({ id: x.id, ...x.data })) });
      }
      const b = req.body || {};
      if (b.action === 'delete') {
        await colDelete('announcements', String(b.id || ''));
        await writeAudit(actor, 'announcement_delete', String(b.id || ''));
        return out({ ok: true });
      }
      const id = String(b.id || 'ann-' + Date.now().toString(36));
      await colPut('announcements', id, {
        message: String(b.message || '').slice(0, 280),
        kind: b.kind === 'warning' ? 'warning' : 'info',
        startAt: Number(b.startAt) || 0,
        endAt: Number(b.endAt) || 0,
        active: b.active !== false,
        updatedAt: Date.now(),
      });
      await writeAudit(actor, 'announcement_save', id, String(b.message || '').slice(0, 80));
      return out({ ok: true });
    }

    if (GET && p === '/admin/audit') {
      const list = await colList<any>('audit', 200);
      const entries = list.map((x) => ({ id: x.id, ...x.data })).sort((a, b) => (b.t || 0) - (a.t || 0));
      return out({ entries });
    }

    if (GET && p === '/admin/export') {
      const type = req.query.type === 'clients' ? 'clients' : 'orders';
      const escCsv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      if (type === 'clients') {
        const users = await colList<any>('users', 1000);
        const rows = [['email', 'name', 'verified', 'blocked', 'country', 'created']];
        for (const { data: u } of users) {
          rows.push([u.email, u.name, u.verified, u.blocked, u.country, u.created ? new Date(u.created).toISOString() : '']);
        }
        return out(rows.map((r) => r.map(escCsv).join(',')).join('\n'), 200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="traderspro254-clients.csv"',
        });
      }
      const orders = await colList<any>('orders', 1000);
      const rows = [['ref', 'date', 'email', 'botId', 'method', 'priceKsh', 'usd', 'status', 'codeOrProof']];
      for (const { data: o } of orders) {
        rows.push([
          o.ref,
          o.t ? new Date(o.t).toISOString() : '',
          o.email,
          o.botId,
          o.method,
          o.price,
          o.usd || '',
          o.status,
          o.info?.code || o.proof || '',
        ]);
      }
      return out(rows.map((r) => r.map(escCsv).join(',')).join('\n'), 200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="traderspro254-orders.csv"',
      });
    }

    if ((GET || POST) && p === '/admin/admins') {
      const doc = (await colGet<{ emails?: string[] }>('settings', 'admins')) || { emails: [] };
      if (GET) return out({ emails: getAdminEmailsList(doc), customEmails: doc.emails || [] });
      const email = normEmail(String(req.body?.email || ''));
      if (!email || !email.includes('@')) return out({ error: 'Enter a valid email address.' }, 400);
      const list = new Set(Array.isArray(doc.emails) ? doc.emails : []);
      if (req.body?.action === 'remove') list.delete(email);
      else list.add(email);
      await colPut('settings', 'admins', { emails: [...list] });
      // Grant admins/{uid} if user already exists
      const targetUser = await colGet<{ uid?: string }>('users', email);
      if (targetUser?.uid) {
        if (req.body?.action === 'remove') await colDelete('admins', targetUser.uid);
        else await colPut('admins', targetUser.uid, { uid: targetUser.uid, email, createdAt: Date.now() });
      }
      await writeAudit(actor, `admin_${req.body?.action || 'add'}`, email);
      return out({ emails: getAdminEmailsList({ emails: [...list] }), customEmails: [...list] });
    }

    return out({ error: 'Admin endpoint not found.' }, 404);
  }

  return out({ error: 'Not found.' }, 404);
}
