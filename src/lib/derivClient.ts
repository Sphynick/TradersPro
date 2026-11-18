// Deriv client for the browser: PAT/OTP REST API (api.derivws.com) + Legacy App ID WebSocket fallback
export const BLOCKED_SCOPES = ['payments', 'admin'];
const REST = 'https://api.derivws.com/trading/v1/options';
export const PUBLIC_WS = 'wss://api.derivws.com/trading/v1/options/ws/public';
export const LEGACY_WS = 'wss://ws.derivws.com/websockets/v3';
export const DERIV_APP_ID = '34PK2G5ky2wwBzvxpqWV1';
export const DERIV_OAUTH_URL = 'https://oauth.deriv.com/oauth2/authorize';

async function rest(path: string, { method = 'GET', token, appId }: { method?: string; token: string; appId: string }) {
  let res: Response;
  try {
    res = await fetch(REST + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Deriv-App-ID': String(appId),
        'Content-Type': 'application/json',
      },
    });
  } catch {
    throw new Error("Browser could not reach Deriv's account service. Check your connection or try Legacy WebSocket mode.");
  }
  let body: any = {};
  try {
    body = await res.json();
  } catch {}
  if (!res.ok) {
    const m = body?.errors?.[0]?.message || `HTTP ${res.status}`;
    throw new Error(
      res.status === 401 || res.status === 403 ? `Deriv rejected the token or App ID (${m}).` : `Deriv error: ${m}`
    );
  }
  return body;
}

const pick = (o: any, keys: string[]) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

export interface DerivClientAccount {
  loginid: string;
  is_virtual: number;
  currency: string;
  balance: number;
  scopes: string[];
  accountsList?: Array<{ id: string; virtual: boolean; currency: string; balance: number }>;
}

export class DerivClient {
  mode: 'public' | 'pat' | 'legacy';
  appId: string;
  legacyUrl: string;
  token: string;
  accountPref: 'demo' | 'real';
  nextId = 1;
  pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  streams = new Map<number, (m: any, err?: any) => void>();
  subIds = new Map<number, string>();
  closed = false;
  ws: WebSocket | null = null;
  onclose: () => void = () => {};
  account: DerivClientAccount | null = null;
  trace: (msg: string) => void = () => {};

  constructor(opts: {
    mode?: 'public' | 'pat' | 'legacy';
    appId?: string;
    wsUrl?: string;
    token?: string;
    accountPref?: 'demo' | 'real';
  } = {}) {
    this.mode = opts.mode || 'pat';
    this.appId = opts.appId || DERIV_APP_ID;
    this.legacyUrl = opts.wsUrl || LEGACY_WS;
    this.token = opts.token || '';
    this.accountPref = opts.accountPref || 'demo';
  }

  private async _url(): Promise<string> {
    if (this.mode === 'public') return PUBLIC_WS;
    if (this.mode === 'legacy') return `${this.legacyUrl}?app_id=${encodeURIComponent(this.appId)}`;
    this.trace('Asking Deriv for your accounts...');
    const list = await rest('/accounts', { token: this.token, appId: this.appId });
    const rows = Array.isArray(list?.data) ? list.data : Array.isArray(list) ? list : list?.data?.accounts || [];
    if (!rows.length) throw new Error('No Deriv trading accounts found for this token.');
    const norm = rows
      .map((r: any) => {
        const id = String(pick(r, ['account_id', 'accountId', 'id', 'loginid']) || '');
        const type = String(pick(r, ['account_type', 'type']) || '').toLowerCase();
        const virtual =
          pick(r, ['is_virtual']) === 1 ||
          pick(r, ['is_virtual']) === true ||
          /demo|virtual/i.test(type) ||
          /^VR/i.test(id);
        return {
          id,
          type,
          virtual,
          currency: String(pick(r, ['currency']) || 'USD'),
          balance: Number(pick(r, ['balance']) ?? 0),
        };
      })
      .filter((a: any) => a.id);

    if (!norm.length) {
      throw new Error('Deriv returned accounts in an unexpected format.');
    }
    const wantReal = this.accountPref === 'real';
    const chosen = norm.find((a: any) => (wantReal ? !a.virtual : a.virtual)) || norm[0];
    this.account = {
      loginid: chosen.id,
      is_virtual: chosen.virtual ? 1 : 0,
      currency: chosen.currency,
      balance: chosen.balance,
      scopes: [],
      accountsList: norm,
    };
    this.trace(`Using account ${chosen.id} (${chosen.virtual ? 'DEMO' : 'REAL'}). Getting a one-time connection...`);
    const otp = await rest(`/accounts/${encodeURIComponent(chosen.id)}/otp`, {
      method: 'POST',
      token: this.token,
      appId: this.appId,
    });
    const url = otp?.data?.url || otp?.url;
    if (!url) throw new Error('Deriv did not return a connection address.');
    return url;
  }

  async connect(): Promise<void> {
    const url = await this._url();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error('Could not open the Deriv connection.'));
      ws.onmessage = (ev) => {
        try {
          this._onMessage(JSON.parse(ev.data));
        } catch {}
      };
      ws.onclose = () => {
        this.closed = true;
        for (const p of this.pending.values()) p.reject(new Error('Connection closed'));
        this.pending.clear();
        this.onclose();
      };
    });
  }

  private _onMessage(msg: any) {
    const id = msg.req_id;
    if (msg.subscription && this.streams.has(id)) this.subIds.set(id, msg.subscription.id);
    const p = this.pending.get(id);
    if (p) {
      this.pending.delete(id);
      if (msg.error) p.reject(Object.assign(new Error(msg.error.message || 'Deriv error'), { code: msg.error.code }));
      else p.resolve(msg);
      if (this.streams.has(id) && !msg.error) this.streams.get(id)!(msg);
      return;
    }
    const h = this.streams.get(id);
    if (h) h(msg);
  }

  private _fix(req: any) {
    if (this.mode === 'legacy') return req;
    const r = { ...req };
    if ((r.proposal || r.contracts_for) && r.symbol && !r.underlying_symbol) {
      r.underlying_symbol = r.symbol;
      delete r.symbol;
    }
    if (r.buy && r.parameters && r.parameters.symbol && !r.parameters.underlying_symbol) {
      r.parameters = { ...r.parameters, underlying_symbol: r.parameters.symbol };
      delete r.parameters.symbol;
    }
    return r;
  }

  send(req: Record<string, any>): Promise<any> {
    if (this.closed || !this.ws || this.ws.readyState !== 1) return Promise.reject(new Error('Connection closed'));
    const req_id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(req_id, { resolve, reject });
      this.ws!.send(JSON.stringify({ ...this._fix(req), req_id }));
    });
  }

  async subscribe(req: Record<string, any>, handler: (msg: any, err?: any) => void): Promise<() => Promise<void>> {
    if (this.closed || !this.ws || this.ws.readyState !== 1) throw new Error('Connection closed');
    const req_id = this.nextId++;
    this.streams.set(req_id, (m) => {
      if (m.error) handler(null, m.error);
      else handler(m);
    });
    const first = new Promise((resolve, reject) => this.pending.set(req_id, { resolve, reject }));
    this.ws.send(JSON.stringify({ ...this._fix(req), subscribe: 1, req_id }));
    await first;
    return async () => {
      this.streams.delete(req_id);
      const sid = this.subIds.get(req_id);
      this.subIds.delete(req_id);
      if (sid && !this.closed) {
        try {
          await this.send({ forget: sid });
        } catch {}
      }
    };
  }

  async authorize(token?: string): Promise<DerivClientAccount> {
    if (this.mode !== 'legacy') {
      try {
        const b = await this.send({ balance: 1 });
        const v = Number(b?.balance?.balance);
        if (Number.isFinite(v) && this.account) this.account.balance = v;
      } catch {}
      if (!this.account) throw new Error('Not authorized');
      return this.account;
    }
    const res = await this.send({ authorize: token || this.token });
    const a = res.authorize;
    const bad = (a.scopes || []).filter((s: string) => BLOCKED_SCOPES.includes(s));
    if (bad.length) {
      this.close();
      throw new Error(
        `This token has the "${bad.join('", "')}" permission, which can move money. Create a new token with only Read and Trade.`
      );
    }
    this.account = {
      loginid: a.loginid,
      currency: a.currency,
      balance: Number(a.balance || 0),
      is_virtual: Number(a.is_virtual || 0),
      scopes: a.scopes || [],
    };
    return this.account;
  }

  close() {
    this.closed = true;
    try {
      this.ws?.close();
    } catch {}
  }
}

export async function connectDerivAuto(
  token: string,
  accountPref: 'demo' | 'real',
  trace?: (m: string) => void
): Promise<{ client: DerivClient; account: DerivClientAccount }> {
  // Try Legacy authorize first if token looks like classic Deriv API token, or try PAT first then Legacy fallback
  const clientPat = new DerivClient({ mode: 'pat', appId: DERIV_APP_ID, token, accountPref });
  if (trace) clientPat.trace = trace;
  try {
    await clientPat.connect();
    const account = await clientPat.authorize(token);
    return { client: clientPat, account };
  } catch (e: any) {
    try {
      clientPat.close();
    } catch {}
    // Fallback to legacy WebSocket when token is a standard Deriv API token / OAuth token
    const clientLeg = new DerivClient({ mode: 'legacy', appId: DERIV_APP_ID, wsUrl: LEGACY_WS, token, accountPref });
    if (trace) clientLeg.trace = trace;
    await clientLeg.connect();
    const account = await clientLeg.authorize(token);
    return { client: clientLeg, account };
  }
}
