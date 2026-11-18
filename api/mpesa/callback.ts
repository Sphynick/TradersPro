export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // Safaricom Daraja callback webhook receiver
  // Returns ResultCode 0 acknowledgement as required by Daraja API
  return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
}
