import { detectGeo } from '../lib/payments.ts';

export default function handler(req: any, res: any) {
  const override = typeof req.query?.country === 'string' ? req.query.country : undefined;
  const geo = detectGeo(req.headers || {}, override);
  res.status(200).json(geo);
}
