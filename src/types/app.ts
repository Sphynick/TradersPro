export type ActiveTab = 'catalog' | 'automated' | 'forex' | 'charts' | 'settings';

export type PaymentMethod = 'mpesa_stk' | 'mpesa_pochi' | 'paypal';

export interface GeoInfo {
  country: string;
  isKenya: boolean;
  currency: {
    code: string;
    rateFromUsd: number;
  };
  mpesaConfigured: boolean;
  paypalConfigured: boolean;
  pochiNumber: string;
  whatsappNumber: string;
  usdKshRate: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  country: string;
  theme: 'light' | 'dark';
  licenses: string[];
  signalSubEnd: number;
}

export interface OrderRecord {
  id: string;
  userId: string;
  userEmail: string;
  itemId: string;
  itemName: string;
  method: PaymentMethod;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  amountKsh: number;
  amountUsd: number;
  phone: string;
  reference: string;
  createdAtMs: number;
}

export interface SignalRecord {
  id: string;
  pair: string;
  direction: 'BUY' | 'SELL';
  entry: string;
  stopLoss: string;
  takeProfit: string;
  timeframe: string;
  strategy: string;
  status: 'active' | 'tp_hit' | 'sl_hit' | 'closed';
  published: boolean;
  notes: string;
  authorId: string;
  createdAtMs: number;
}

export interface Mt5ConfigRecord {
  id: string;
  userId: string;
  eaId: 'xauusd-system' | 'straddle-system';
  eaKey: string;
  symbol: string;
  mode: 'intraday' | 'scalping';
  lotSize: number;
  enabled: boolean;
  updatedAtMs: number;
}

export interface TradeLogRecord {
  id: string;
  userId: string;
  botId: string;
  botName: string;
  market: string;
  contract: string;
  stake: number;
  profit: number;
  accountType: 'demo' | 'real';
  createdAtMs: number;
}
