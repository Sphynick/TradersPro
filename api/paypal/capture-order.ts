import { capturePayPalOrder } from '../../lib/payments.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const result = await capturePayPalOrder(String(body.paypalOrderId || ''));
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Server error' });
  }
}
