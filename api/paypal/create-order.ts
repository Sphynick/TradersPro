import { createPayPalOrder } from '../../lib/payments.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const host = req.headers?.host || 'localhost:3000';
    const proto = req.headers?.['x-forwarded-proto'] || 'https';
    const originUrl = process.env.APP_URL || `${proto}://${host}`;
    const result = await createPayPalOrder({
      amountUsd: Number(body.amountUsd || 10),
      itemName: String(body.itemName || 'TRADERSPRO254'),
      orderId: String(body.orderId || 'order'),
      returnUrl: String(body.returnUrl || `${originUrl}/?paypal=success`),
      cancelUrl: String(body.cancelUrl || `${originUrl}/?paypal=cancel`),
    });
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Server error' });
  }
}
