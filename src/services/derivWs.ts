export interface TickPoint {
  epoch: number;
  quote: number;
  lastDigit: number;
}

export interface CandlePoint {
  epoch: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const DERIV_APP_ID = import.meta.env.VITE_DERIV_APP_ID || '34PK2G5ky2wwBzvxpqWV1';
const DERIV_WS_URL = `wss://ws.derivws.com/websockets/v3?app_id=${DERIV_APP_ID}`;

export function extractLastDigit(quote: number, decimals: number): number {
  const formatted = quote.toFixed(decimals);
  const lastChar = formatted.charAt(formatted.length - 1);
  const parsed = Number(lastChar);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function subscribeMarketTicks(
  symbol: string,
  decimals: number,
  onTick: (tick: TickPoint, history: TickPoint[]) => void,
  onStatus?: (status: 'connecting' | 'live' | 'error') => void
): () => void {
  let closed = false;
  let ws: WebSocket | null = null;
  let history: TickPoint[] = [];

  onStatus?.('connecting');

  try {
    ws = new WebSocket(DERIV_WS_URL);
    ws.onopen = () => {
      if (closed || !ws) return;
      ws.send(
        JSON.stringify({
          ticks_history: symbol,
          adjust_start_time: 1,
          count: 100,
          end: 'latest',
          style: 'ticks',
          subscribe: 1,
        })
      );
    };

    ws.onmessage = (event) => {
      if (closed) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.error) {
          onStatus?.('error');
          return;
        }
        if (msg.msg_type === 'history' && msg.history) {
          const prices: number[] = msg.history.prices || [];
          const times: number[] = msg.history.times || [];
          history = prices.map((q, i) => ({
            epoch: times[i] || Math.floor(Date.now() / 1000),
            quote: Number(q),
            lastDigit: extractLastDigit(Number(q), decimals),
          }));
          if (history.length > 0) {
            onStatus?.('live');
            onTick(history[history.length - 1], history);
          }
        } else if (msg.msg_type === 'tick' && msg.tick) {
          const q = Number(msg.tick.quote);
          const point: TickPoint = {
            epoch: Number(msg.tick.epoch || Math.floor(Date.now() / 1000)),
            quote: q,
            lastDigit: extractLastDigit(q, decimals),
          };
          history = [...history.slice(-99), point];
          onStatus?.('live');
          onTick(point, history);
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onerror = () => {
      if (!closed) onStatus?.('error');
    };
  } catch {
    onStatus?.('error');
  }

  return () => {
    closed = true;
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ forget_all: 'ticks' }));
      }
      ws?.close();
    } catch {
      // ignore close errors
    }
  };
}

export function subscribeMarketCandles(
  symbol: string,
  granularity: number,
  onCandles: (candles: CandlePoint[]) => void,
  onStatus?: (status: 'connecting' | 'live' | 'error') => void
): () => void {
  let closed = false;
  let ws: WebSocket | null = null;
  let candles: CandlePoint[] = [];

  onStatus?.('connecting');

  try {
    ws = new WebSocket(DERIV_WS_URL);
    ws.onopen = () => {
      if (closed || !ws) return;
      ws.send(
        JSON.stringify({
          ticks_history: symbol,
          adjust_start_time: 1,
          count: 80,
          end: 'latest',
          granularity,
          style: 'candles',
          subscribe: 1,
        })
      );
    };

    ws.onmessage = (event) => {
      if (closed) return;
      try {
        const msg = JSON.parse(event.data);
        if (msg.error) {
          onStatus?.('error');
          return;
        }
        if (msg.msg_type === 'candles' && Array.isArray(msg.candles)) {
          candles = msg.candles.map((c: any) => ({
            epoch: Number(c.epoch),
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
          }));
          onStatus?.('live');
          onCandles(candles);
        } else if (msg.msg_type === 'ohlc' && msg.ohlc) {
          const c = msg.ohlc;
          const next: CandlePoint = {
            epoch: Number(c.open_time || c.epoch),
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
          };
          if (candles.length > 0 && candles[candles.length - 1].epoch === next.epoch) {
            candles = [...candles.slice(0, -1), next];
          } else {
            candles = [...candles.slice(-79), next];
          }
          onStatus?.('live');
          onCandles(candles);
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onerror = () => {
      if (!closed) onStatus?.('error');
    };
  } catch {
    onStatus?.('error');
  }

  return () => {
    closed = true;
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ forget_all: 'candles' }));
      }
      ws?.close();
    } catch {
      // ignore close errors
    }
  };
}

export async function verifyDerivToken(token: string): Promise<{
  ok: boolean;
  balance?: number;
  currency?: string;
  isVirtual?: boolean;
  loginid?: string;
  error?: string;
}> {
  return new Promise((resolve) => {
    const clean = token.trim();
    if (!clean) {
      resolve({ ok: false, error: 'Please paste your Deriv API token.' });
      return;
    }

    let settled = false;
    const ws = new WebSocket(DERIV_WS_URL);
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        resolve({ ok: false, error: 'Connection to Deriv timed out.' });
      }
    }, 8000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ authorize: clean }));
    };
    ws.onmessage = (event) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const msg = JSON.parse(event.data);
        ws.close();
        if (msg.error) {
          resolve({ ok: false, error: msg.error.message || 'Invalid Deriv token.' });
        } else if (msg.authorize) {
          resolve({
            ok: true,
            balance: Number(msg.authorize.balance || 0),
            currency: String(msg.authorize.currency || 'USD'),
            isVirtual: Boolean(msg.authorize.is_virtual),
            loginid: String(msg.authorize.loginid || ''),
          });
        } else {
          resolve({ ok: false, error: 'Unexpected Deriv response.' });
        }
      } catch {
        ws.close();
        resolve({ ok: false, error: 'Invalid response from Deriv.' });
      }
    };
    ws.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false, error: 'Unable to reach Deriv WebSocket.' });
      }
    };
  });
}

export async function executeDerivContract(params: {
  token: string;
  symbol: string;
  contractType: string;
  amount: number;
  duration: number;
  barrier?: string;
}): Promise<{ ok: boolean; contractId?: number; payout?: number; profit?: number; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const ws = new WebSocket(DERIV_WS_URL);
    const finish = (res: { ok: boolean; contractId?: number; payout?: number; profit?: number; error?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
      resolve(res);
    };

    const timer = setTimeout(() => finish({ ok: false, error: 'Trade request timed out.' }), 15000);

    ws.onopen = () => {
      ws.send(JSON.stringify({ authorize: params.token.trim() }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.error) {
          finish({ ok: false, error: msg.error.message || 'Deriv execution failed.' });
          return;
        }
        if (msg.msg_type === 'authorize') {
          const proposalParams: Record<string, unknown> = {
            amount: params.amount,
            basis: 'stake',
            contract_type: params.contractType,
            currency: msg.authorize?.currency || 'USD',
            duration: params.duration,
            duration_unit: 't',
            symbol: params.symbol,
          };
          if (params.barrier !== undefined && params.barrier !== '') {
            proposalParams.barrier = params.barrier;
          }
          ws.send(JSON.stringify({ buy: 1, price: params.amount, parameters: proposalParams }));
        } else if (msg.msg_type === 'buy' && msg.buy) {
          const contractId = Number(msg.buy.contract_id);
          ws.send(JSON.stringify({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 }));
        } else if (msg.msg_type === 'proposal_open_contract' && msg.proposal_open_contract) {
          const poc = msg.proposal_open_contract;
          if (poc.is_sold) {
            finish({
              ok: true,
              contractId: Number(poc.contract_id),
              payout: Number(poc.payout || 0),
              profit: Number(poc.profit || 0),
            });
          }
        }
      } catch {
        finish({ ok: false, error: 'Malformed trade message.' });
      }
    };

    ws.onerror = () => finish({ ok: false, error: 'Deriv socket error.' });
  });
}
