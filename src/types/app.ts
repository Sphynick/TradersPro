export type ThemeMode = 'system' | 'light' | 'dark';

export type ActiveRoute =
  | 'home'
  | 'catalog'
  | 'automated'
  | 'scanner'
  | 'charts'
  | 'markets'
  | 'trades'
  | 'po'
  | 'news'
  | 'forex'
  | 'aiscan'
  | 'engine'
  | 'broker'
  | 'settings'
  | 'admin';

export type PaymentMethod = 'pochi' | 'stk' | 'paypal' | 'usdt';

export interface ServerConfig {
  pochi: string;
  pochiNumber: string;
  whatsapp: string;
  whatsappNumber: string;
  paypal: string;
  paypalConfigured: boolean;
  mpesaConfigured: boolean;
  paystackConfigured: boolean;
  usdtAddress: string;
  usdtNetwork: string;
  usdRate: number;
  usdKshRate: number;
  showUsdForeign: boolean;
  maintenance: boolean;
  country: string;
  isKenya: boolean;
  currency: {
    code: string;
    rate: number;
    approx?: boolean;
  };
  payMode: 'manual' | 'both' | 'stk';
  rawPayMode: string;
  provider: string | null;
}

export interface OrderRecord {
  ref: string;
  t: number;
  botId: string;
  botName?: string;
  price: number;
  usd: number;
  method: string;
  proof?: string;
  mpesa?: string;
  info?: { code?: string; amount?: number; amountOk?: boolean; toOwner?: boolean };
  whatsapp?: string;
  account: string;
  email: string;
  name?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejectReason?: string;
  refundNote?: string;
  mailed?: boolean;
  orderKey?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  verified: boolean;
  country: string;
  theme: ThemeMode;
  isAdmin: boolean;
  engine: boolean;
  licenses: string[];
  subEnd: number;
  aiLeft: number;
  aiFreeUsed: boolean;
  freeTrial: {
    state: 'none' | 'pending' | 'active' | 'done';
    sig?: ForexSignal;
    t?: number;
    started?: number;
    result?: 'win' | 'loss' | null;
    closedAt?: number;
  };
  orders: OrderRecord[];
  now: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  section: 'deriv' | 'automated' | 'forex';
  category: 'over-under' | 'digits' | 'rise-fall' | 'even-odd' | 'accumulators' | 'forex';
  sub?: string;
  kind: 'strategy' | 'xml' | 'file' | 'builtin';
  platform: string;
  desc: string;
  how: string;
  price: number;
  status: 'live' | 'soon';
  locked: boolean;
  presets?: string[] | null;
  extra?: boolean;
  hidden?: boolean;
}

export interface Announcement {
  id: string;
  message: string;
  kind: 'info' | 'warning';
  startAt?: number;
  endAt?: number;
  active?: boolean;
}

export interface ForexSignal {
  id?: string;
  symbol: string;
  tf: string;
  dir: 'BUY' | 'SELL';
  status: string;
  entry: number;
  sl: number;
  tp1: number;
  tp2: number;
  rr: number;
  score: number;
  max: number;
  event?: string;
  killzone?: string;
  t?: number;
  published?: boolean;
}

export interface Mt5Position {
  t: string;
  s: 'BUY' | 'SELL';
  l: number;
  o: number;
  p: number;
  a: number;
}

export interface Mt5RobotStatus {
  t: number;
  online: boolean;
  login: string;
  server: string;
  balance: number;
  equity: number;
  open: number;
  today: number;
  mode: string;
  state: string;
  ver: string;
  symbol: string;
  pos: Mt5Position[];
}

export interface DerivAccountInfo {
  loginid: string;
  currency: string;
  balance: number;
  is_virtual: number;
  scopes: string[];
}

export interface TradeLogEntry {
  id: string;
  t: number;
  symbol: string;
  botId: string;
  botName: string;
  label?: string;
  stake: number;
  profit: number;
  won: boolean;
  accountType: 'demo' | 'real';
}
