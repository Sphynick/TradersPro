import { handleApiRequest } from '../server/router.ts';

export default async function handler(req: any, res: any) {
  const url = new URL(req.url || '/', `https://${req.headers?.host || 'localhost'}`);
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    query[k] = v;
  });

  const proto = req.headers?.['x-forwarded-proto'] || 'https';
  const host = req.headers?.host || 'localhost';
  const origin = process.env.APP_URL || `${proto}://${host}`;

  let parsedBody = req.body;
  let rawBody = '';
  if (typeof req.body === 'string') {
    rawBody = req.body;
    try {
      parsedBody = JSON.parse(req.body);
    } catch {}
  } else if (req.body && typeof req.body === 'object') {
    rawBody = JSON.stringify(req.body);
  }

  try {
    const result = await handleApiRequest({
      method: req.method || 'GET',
      path: url.pathname,
      query,
      headers: req.headers || {},
      body: parsedBody,
      rawBody,
      origin,
    });
    if (result.headers) {
      for (const [k, v] of Object.entries(result.headers)) {
        res.setHeader(k, v);
      }
    }
    res.status(result.status);
    if (typeof result.body === 'string') {
      res.send(result.body);
    } else {
      res.json(result.body);
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
  }
}
