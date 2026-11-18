export interface GeoResult {
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

const CURRENCY_MAP: Record<string, { code: string; rateFromUsd: number }> = {
  KE: { code: 'KSh', rateFromUsd: 130 },
  UG: { code: 'UGX', rateFromUsd: 3700 },
  TZ: { code: 'TZS', rateFromUsd: 2650 },
  NG: { code: 'NGN', rateFromUsd: 1600 },
  ZA: { code: 'ZAR', rateFromUsd: 18 },
  GH: { code: 'GHS', rateFromUsd: 15.5 },
  GB: { code: 'GBP', rateFromUsd: 0.79 },
  EU: { code: 'EUR', rateFromUsd: 0.92 },
  US: { code: 'USD', rateFromUsd: 1 },
};

export function getPaymentCapabilities() {
  const mpesaConfigured = Boolean(
    process.env.MPESA_CONSUMER_KEY &&
      process.env.MPESA_CONSUMER_SECRET &&
      process.env.MPESA_PASSKEY &&
      process.env.MPESA_SHORTCODE
  );
  const paypalConfigured = Boolean(
    process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
  );
  return { mpesaConfigured, paypalConfigured };
}

export function detectGeo(headers: Record<string, string | string[] | undefined>, overrideCountry?: string): GeoResult {
  const rawCountry =
    overrideCountry ||
    (headers['x-vercel-ip-country'] as string | undefined) ||
    (headers['cf-ipcountry'] as string | undefined) ||
    'KE';
  const country = String(rawCountry || 'KE').trim().toUpperCase().slice(0, 2) || 'KE';
  const usdKshRate = Number(process.env.VITE_USD_KSH_RATE || 130) || 130;
  const caps = getPaymentCapabilities();

  return {
    country,
    isKenya: country === 'KE',
    currency: CURRENCY_MAP[country] || { code: 'USD', rateFromUsd: 1 },
    mpesaConfigured: caps.mpesaConfigured,
    paypalConfigured: caps.paypalConfigured,
    pochiNumber: process.env.VITE_POCHI_NUMBER || '0758414027',
    whatsappNumber: process.env.VITE_WHATSAPP_NUMBER || '254758414027',
    usdKshRate,
  };
}

export function normalizeKenyaPhone(input: string): string | null {
  const digits = String(input || '').replace(/\D/g, '');
  if (/^254(7|1)\d{8}$/.test(digits)) return digits;
  if (/^0(7|1)\d{8}$/.test(digits)) return '254' + digits.slice(1);
  if (/^(7|1)\d{8}$/.test(digits)) return '254' + digits;
  return null;
}

function mpesaBaseUrl(): string {
  return process.env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

function mpesaTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

async function getMpesaAccessToken(): Promise<string> {
  const key = process.env.MPESA_CONSUMER_KEY || '';
  const secret = process.env.MPESA_CONSUMER_SECRET || '';
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');

  const res = await fetch(`${mpesaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const data = (await res.json()) as { access_token?: string; errorMessage?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.errorMessage || 'Failed to authenticate with Safaricom Daraja API.');
  }
  return data.access_token;
}

export async function initiateMpesaStkPush(params: {
  phone: string;
  amountKsh: number;
  orderId: string;
  itemName: string;
  originUrl: string;
}) {
  const { mpesaConfigured } = getPaymentCapabilities();
  const normalizedPhone = normalizeKenyaPhone(params.phone);
  if (!normalizedPhone) {
    return {
      ok: false,
      configured: mpesaConfigured,
      error: 'Enter a valid Kenyan Safaricom number (e.g. 0712345678 or 254712345678).',
    };
  }

  if (!mpesaConfigured) {
    return {
      ok: false,
      configured: false,
      error:
        'M-Pesa Daraja API keys are not configured yet. Add MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, and MPESA_PASSKEY in .env or Vercel, or pay via M-Pesa Pochi.',
    };
  }

  const token = await getMpesaAccessToken();
  const shortcode = process.env.MPESA_SHORTCODE || '174379';
  const passkey = process.env.MPESA_PASSKEY || '';
  const timestamp = mpesaTimestamp();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  const callbackUrl =
    process.env.MPESA_CALLBACK_URL || `${params.originUrl.replace(/\/$/, '')}/api/mpesa/callback`;

  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.max(1, Math.round(params.amountKsh)),
    PartyA: normalizedPhone,
    PartyB: shortcode,
    PhoneNumber: normalizedPhone,
    CallBackURL: callbackUrl,
    AccountReference: `TP254-${params.orderId.slice(0, 8)}`,
    TransactionDesc: params.itemName.slice(0, 24),
  };

  const res = await fetch(`${mpesaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as {
    ResponseCode?: string;
    CheckoutRequestID?: string;
    MerchantRequestID?: string;
    CustomerMessage?: string;
    errorMessage?: string;
  };

  if (!res.ok || data.ResponseCode !== '0') {
    return {
      ok: false,
      configured: true,
      error: data.errorMessage || data.CustomerMessage || 'M-Pesa STK Push request failed.',
    };
  }

  return {
    ok: true,
    configured: true,
    checkoutRequestId: data.CheckoutRequestID || '',
    merchantRequestId: data.MerchantRequestID || '',
    customerMessage: data.CustomerMessage || 'STK Push sent to your phone. Enter your M-Pesa PIN.',
  };
}

export async function queryMpesaStkStatus(checkoutRequestId: string) {
  const { mpesaConfigured } = getPaymentCapabilities();
  if (!mpesaConfigured) {
    return { ok: false, configured: false, status: 'unconfigured' as const };
  }
  const token = await getMpesaAccessToken();
  const shortcode = process.env.MPESA_SHORTCODE || '174379';
  const passkey = process.env.MPESA_PASSKEY || '';
  const timestamp = mpesaTimestamp();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const res = await fetch(`${mpesaBaseUrl()}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  const data = (await res.json()) as { ResultCode?: string; ResultDesc?: string };
  if (data.ResultCode === '0') {
    return { ok: true, configured: true, status: 'paid' as const, desc: data.ResultDesc || 'Confirmed' };
  }
  if (data.ResultCode && data.ResultCode !== '0') {
    return { ok: false, configured: true, status: 'failed' as const, desc: data.ResultDesc || 'Cancelled' };
  }
  return { ok: true, configured: true, status: 'pending' as const, desc: data.ResultDesc || 'Pending PIN entry' };
}

function paypalBaseUrl(): string {
  return process.env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID || '';
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || '';
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || 'Failed to authenticate with PayPal REST API.');
  }
  return data.access_token;
}

export async function createPayPalOrder(params: {
  amountUsd: number;
  itemName: string;
  orderId: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  const { paypalConfigured } = getPaymentCapabilities();
  if (!paypalConfigured) {
    return {
      ok: false,
      configured: false,
      error:
        'PayPal REST credentials are not configured yet. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env or Vercel.',
    };
  }

  const token = await getPayPalAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: params.orderId,
          description: params.itemName.slice(0, 120),
          amount: {
            currency_code: 'USD',
            value: Math.max(1, Number(params.amountUsd)).toFixed(2),
          },
        },
      ],
      application_context: {
        brand_name: 'TRADERSPRO254',
        landing_page: 'BILLING',
        user_action: 'PAY_NOW',
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    }),
  });

  const data = (await res.json()) as {
    id?: string;
    links?: Array<{ rel: string; href: string }>;
    message?: string;
  };
  if (!res.ok || !data.id) {
    return { ok: false, configured: true, error: data.message || 'Unable to create PayPal order.' };
  }

  const approveUrl = data.links?.find((l) => l.rel === 'approve')?.href || '';
  return {
    ok: true,
    configured: true,
    paypalOrderId: data.id,
    approveUrl,
  };
}

export async function capturePayPalOrder(paypalOrderId: string) {
  const { paypalConfigured } = getPaymentCapabilities();
  if (!paypalConfigured) {
    return { ok: false, configured: false, error: 'PayPal is not configured.' };
  }
  const token = await getPayPalAccessToken();
  const res = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  const data = (await res.json()) as {
    status?: string;
    id?: string;
    payer?: { email_address?: string };
    message?: string;
  };
  if (!res.ok || data.status !== 'COMPLETED') {
    return {
      ok: false,
      configured: true,
      error: data.message || `PayPal capture status: ${data.status || 'UNKNOWN'}`,
    };
  }
  return {
    ok: true,
    configured: true,
    status: 'paid' as const,
    paypalOrderId: data.id || paypalOrderId,
    payerEmail: data.payer?.email_address || '',
  };
}
