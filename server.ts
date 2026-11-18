import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import {
  capturePayPalOrder,
  createPayPalOrder,
  detectGeo,
  initiateMpesaStkPush,
  queryMpesaStkStatus,
} from './lib/payments.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git', '.vercel', '.aistudio']);
const EXCLUDED_FILES = new Set(['.env', '.env.local', 'traderspro254-github-vercel.zip']);

function collectProjectFiles(dir: string, rootDir: string, zip: JSZip) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name) || EXCLUDED_FILES.has(entry.name)) continue;
    if (entry.name.endsWith('.zip')) continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      collectProjectFiles(fullPath, rootDir, zip);
    } else if (entry.isFile()) {
      zip.file(relPath, fs.readFileSync(fullPath));
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/geo', (req, res) => {
    const override = typeof req.query.country === 'string' ? req.query.country : undefined;
    res.json(detectGeo(req.headers, override));
  });

  app.post('/api/mpesa/stkpush', async (req, res) => {
    try {
      const { phone, amountKsh, orderId, itemName } = req.body || {};
      const host = req.headers.host || `localhost:${PORT}`;
      const proto = req.headers['x-forwarded-proto'] || 'http';
      const originUrl = process.env.APP_URL || `${proto}://${host}`;
      const result = await initiateMpesaStkPush({
        phone: String(phone || ''),
        amountKsh: Number(amountKsh || 0),
        orderId: String(orderId || 'order'),
        itemName: String(itemName || 'TRADERSPRO254'),
        originUrl,
      });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'M-Pesa request failed' });
    }
  });

  app.post('/api/mpesa/query', async (req, res) => {
    try {
      const { checkoutRequestId } = req.body || {};
      const result = await queryMpesaStkStatus(String(checkoutRequestId || ''));
      res.json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'Query failed' });
    }
  });

  app.post('/api/mpesa/callback', (_req, res) => {
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  });

  app.post('/api/paypal/create-order', async (req, res) => {
    try {
      const { amountUsd, itemName, orderId, returnUrl, cancelUrl } = req.body || {};
      const host = req.headers.host || `localhost:${PORT}`;
      const proto = req.headers['x-forwarded-proto'] || 'http';
      const originUrl = process.env.APP_URL || `${proto}://${host}`;
      const result = await createPayPalOrder({
        amountUsd: Number(amountUsd || 10),
        itemName: String(itemName || 'TRADERSPRO254'),
        orderId: String(orderId || 'order'),
        returnUrl: String(returnUrl || `${originUrl}/?paypal=success`),
        cancelUrl: String(cancelUrl || `${originUrl}/?paypal=cancel`),
      });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'PayPal order error' });
    }
  });

  app.post('/api/paypal/capture-order', async (req, res) => {
    try {
      const { paypalOrderId } = req.body || {};
      const result = await capturePayPalOrder(String(paypalOrderId || ''));
      res.status(result.ok ? 200 : 400).json(result);
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'PayPal capture error' });
    }
  });

  app.get('/api/export-zip', async (_req, res) => {
    try {
      const zip = new JSZip();
      collectProjectFiles(__dirname, __dirname, zip);
      const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="traderspro254-github-vercel.zip"');
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Unable to generate ZIP archive' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TRADERSPRO254 server listening on http://localhost:${PORT}`);
  });
}

startServer();
