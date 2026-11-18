import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getApp, getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

export interface DecodedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
  iat: number; // ms
}

let cachedConfig: { projectId?: string; firestoreDatabaseId?: string } | null = null;
function loadAppletConfig(): { projectId?: string; firestoreDatabaseId?: string } {
  if (cachedConfig) return cachedConfig;
  try {
    const p = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(p)) {
      cachedConfig = JSON.parse(fs.readFileSync(p, 'utf8'));
      return cachedConfig!;
    }
  } catch {}
  cachedConfig = {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '',
    firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || '',
  };
  return cachedConfig;
}

let adminApp: App | null = null;
let adminDb: Firestore | null = null;
let adminInitAttempted = false;

export function hasServiceAccount(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_SERVICE_ACCOUNT.trim().startsWith('{'));
}

export function getAdminApp(): App | null {
  if (adminApp) return adminApp;
  if (adminInitAttempted) return null;
  adminInitAttempted = true;
  if (!hasServiceAccount()) return null;
  try {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
    const cfg = loadAppletConfig();
    const projectId = sa.project_id || cfg.projectId;
    adminApp = getApps().length
      ? getApp()
      : initializeApp({
          credential: cert(sa),
          projectId,
        });
    const dbId = process.env.FIREBASE_DATABASE_ID || cfg.firestoreDatabaseId;
    adminDb = dbId && dbId !== '(default)' ? getFirestore(adminApp, dbId) : getFirestore(adminApp);
    return adminApp;
  } catch (err) {
    console.error('[store] Failed to initialize firebase-admin:', err instanceof Error ? err.message : err);
    return null;
  }
}

export function getAdminFirestore(): Firestore | null {
  getAdminApp();
  return adminDb;
}

// ---------- Cryptographic Firebase ID token verification (works with OR without FIREBASE_SERVICE_ACCOUNT) ----------
let certCache: { certs: Record<string, string>; exp: number } | null = null;
async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (certCache && now < certCache.exp) return certCache.certs;
  const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  if (!res.ok) throw new Error('Unable to fetch Firebase token certificates.');
  const certs = (await res.json()) as Record<string, string>;
  const cc = res.headers.get('cache-control') || '';
  const m = cc.match(/max-age=(\d+)/i);
  const ttlMs = (m ? Number(m[1]) : 3600) * 1000;
  certCache = { certs, exp: now + Math.max(60000, ttlMs) };
  return certs;
}

function unb64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export async function verifyFirebaseIdToken(idToken: string): Promise<DecodedUser | null> {
  if (!idToken || idToken.split('.').length !== 3) return null;
  const app = getAdminApp();
  if (app) {
    try {
      const decoded = await getAuth(app).verifyIdToken(idToken);
      return {
        uid: decoded.uid,
        email: String(decoded.email || '').trim().toLowerCase(),
        emailVerified: Boolean(decoded.email_verified),
        name: String(decoded.name || decoded.email?.split('@')[0] || 'Trader'),
        iat: Number(decoded.auth_time || decoded.iat || 0) * 1000,
      };
    } catch {
      return null;
    }
  }

  // Fallback RS256 verification against Google public x509 certs for AI Studio preview
  try {
    const [hdrB64, payB64, sigB64] = idToken.split('.');
    const header = JSON.parse(unb64url(hdrB64).toString('utf8')) as { alg?: string; kid?: string };
    const payload = JSON.parse(unb64url(payB64).toString('utf8')) as {
      aud?: string;
      iss?: string;
      sub?: string;
      exp?: number;
      iat?: number;
      auth_time?: number;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };
    const cfg = loadAppletConfig();
    const projectId = cfg.projectId || '';
    if (header.alg !== 'RS256' || !header.kid) return null;
    if (!payload.sub || !payload.exp || payload.exp * 1000 <= Date.now()) return null;
    if (projectId && payload.aud !== projectId) return null;
    if (projectId && payload.iss !== `https://securetoken.google.com/${projectId}`) return null;

    const certs = await getGooglePublicCerts();
    const pem = certs[header.kid];
    if (!pem) return null;

    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${hdrB64}.${payB64}`);
    verifier.end();
    const valid = verifier.verify(pem, unb64url(sigB64));
    if (!valid) return null;

    return {
      uid: payload.sub,
      email: String(payload.email || '').trim().toLowerCase(),
      emailVerified: Boolean(payload.email_verified),
      name: String(payload.name || payload.email?.split('@')[0] || 'Trader'),
      iat: Number(payload.auth_time || payload.iat || 0) * 1000,
    };
  } catch {
    return null;
  }
}

export async function deleteFirebaseAuthUser(uid: string): Promise<boolean> {
  const app = getAdminApp();
  if (!app || !uid) return false;
  try {
    await getAuth(app).deleteUser(uid);
    return true;
  } catch {
    return false;
  }
}

// ---------- Local atomic preview DB fallback when FIREBASE_SERVICE_ACCOUNT is absent ----------
const DEV_DB_PATH = path.join(process.cwd(), '.tp254-dev-db.json');
type LocalCollections = Record<string, Record<string, Record<string, unknown>>>;
let memLocalDb: LocalCollections | null = null;

function readLocalDb(): LocalCollections {
  if (memLocalDb) return memLocalDb;
  try {
    if (fs.existsSync(DEV_DB_PATH)) {
      memLocalDb = JSON.parse(fs.readFileSync(DEV_DB_PATH, 'utf8'));
      return memLocalDb!;
    }
  } catch {}
  memLocalDb = {};
  return memLocalDb;
}

function flushLocalDb(db: LocalCollections) {
  memLocalDb = db;
  try {
    const tmp = DEV_DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, DEV_DB_PATH);
  } catch {}
}

export function safeDocId(id: string): string {
  return String(id || '').replace(/\//g, '%2F').slice(0, 400);
}

// 20-second in-memory hot cache to save Firestore reads
const memCache = new Map<string, { val: unknown; exp: number }>();
export function cacheGet<T>(key: string): T | null {
  const hit = memCache.get(key);
  if (hit && Date.now() < hit.exp) return hit.val as T;
  memCache.delete(key);
  return null;
}
export function cacheSet(key: string, val: unknown, ttlMs = 20000) {
  memCache.set(key, { val, exp: Date.now() + ttlMs });
}
export function cacheDel(prefixOrKey: string) {
  for (const k of memCache.keys()) {
    if (k === prefixOrKey || k.startsWith(prefixOrKey)) memCache.delete(k);
  }
}

export async function colGet<T = Record<string, unknown>>(col: string, id: string): Promise<T | null> {
  const docId = safeDocId(id);
  if (!docId) return null;
  const fsDb = getAdminFirestore();
  if (fsDb) {
    const snap = await fsDb.collection(col).doc(docId).get();
    return snap.exists ? (snap.data() as T) : null;
  }
  const db = readLocalDb();
  const row = db[col]?.[docId];
  return row ? (structuredClone(row) as T) : null;
}

export async function colPut(col: string, id: string, data: Record<string, unknown>, merge = false): Promise<void> {
  const docId = safeDocId(id);
  if (!docId) return;
  const fsDb = getAdminFirestore();
  if (fsDb) {
    await fsDb.collection(col).doc(docId).set(data, { merge });
  } else {
    const db = readLocalDb();
    db[col] = db[col] || {};
    db[col][docId] = merge && db[col][docId] ? { ...db[col][docId], ...structuredClone(data) } : structuredClone(data);
    flushLocalDb(db);
  }
  cacheDel(`${col}:${docId}`);
}

export async function colDelete(col: string, id: string): Promise<void> {
  const docId = safeDocId(id);
  if (!docId) return;
  const fsDb = getAdminFirestore();
  if (fsDb) {
    await fsDb.collection(col).doc(docId).delete();
  } else {
    const db = readLocalDb();
    if (db[col]) {
      delete db[col][docId];
      flushLocalDb(db);
    }
  }
  cacheDel(`${col}:${docId}`);
}

export async function colList<T = Record<string, unknown>>(col: string, maxItems = 250): Promise<Array<{ id: string; data: T }>> {
  const fsDb = getAdminFirestore();
  if (fsDb) {
    const snap = await fsDb.collection(col).limit(maxItems).get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() as T }));
  }
  const db = readLocalDb();
  const table = db[col] || {};
  return Object.entries(table)
    .slice(0, maxItems)
    .map(([id, data]) => ({ id, data: structuredClone(data) as T }));
}

// Transactional helper for double-spend guards (free trial, AI credits, order codes, license grants)
export async function runStoreTransaction<R>(
  fn: (tx: {
    get: <T = Record<string, unknown>>(col: string, id: string) => Promise<T | null>;
    set: (col: string, id: string, data: Record<string, unknown>, merge?: boolean) => Promise<void>;
    del: (col: string, id: string) => Promise<void>;
  }) => Promise<R>
): Promise<R> {
  const fsDb = getAdminFirestore();
  if (fsDb) {
    return fsDb.runTransaction(async (txn) => {
      return fn({
        get: async <T = Record<string, unknown>>(col: string, id: string) => {
          const snap = await txn.get(fsDb.collection(col).doc(safeDocId(id)));
          return snap.exists ? (snap.data() as T) : null;
        },
        set: async (col: string, id: string, data: Record<string, unknown>, merge = false) => {
          txn.set(fsDb.collection(col).doc(safeDocId(id)), data, { merge });
        },
        del: async (col: string, id: string) => {
          txn.delete(fsDb.collection(col).doc(safeDocId(id)));
        },
      });
    });
  }

  // Local atomic transaction fallback
  const db = readLocalDb();
  const stagedWrites: Array<{ col: string; id: string; data: Record<string, unknown>; merge: boolean }> = [];
  const stagedDeletes: Array<{ col: string; id: string }> = [];
  const result = await fn({
    get: async <T = Record<string, unknown>>(col: string, id: string) => {
      const docId = safeDocId(id);
      const row = db[col]?.[docId];
      return row ? (structuredClone(row) as T) : null;
    },
    set: async (col: string, id: string, data: Record<string, unknown>, merge = false) => {
      stagedWrites.push({ col, id: safeDocId(id), data: structuredClone(data), merge });
    },
    del: async (col: string, id: string) => {
      stagedDeletes.push({ col, id: safeDocId(id) });
    },
  });
  for (const w of stagedWrites) {
    db[w.col] = db[w.col] || {};
    db[w.col][w.id] = w.merge && db[w.col][w.id] ? { ...db[w.col][w.id], ...w.data } : w.data;
    cacheDel(`${w.col}:${w.id}`);
  }
  for (const d of stagedDeletes) {
    if (db[d.col]) delete db[d.col][d.id];
    cacheDel(`${d.col}:${d.id}`);
  }
  flushLocalDb(db);
  return result;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
