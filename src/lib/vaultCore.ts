// Browser AES-256-GCM + PBKDF2-SHA256 (200,000 iterations) vault cipher matching site/vault-core.mjs
const ITER = 200000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export interface EncryptedBox {
  salt: string;
  iv: string;
  data: string;
}

export interface VaultEntry {
  file: string;
  mime: string;
  box: EncryptedBox;
  ownerWrap?: EncryptedBox;
}

function b64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) {
    s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(secret: string, salt: BufferSource): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function seal(bytes: Uint8Array | string, secret: string): Promise<EncryptedBox> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const raw = typeof bytes === 'string' ? enc.encode(bytes) : new Uint8Array(bytes);
  const key = await deriveKey(secret.trim(), salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, raw));
  return { salt: b64(salt), iv: b64(iv), data: b64(ct) };
}

export async function unseal(box: EncryptedBox | undefined | null, secret: string): Promise<Uint8Array | null> {
  if (!box?.salt || !box?.iv || !box?.data) return null;
  try {
    const key = await deriveKey(secret.trim(), unb64(box.salt));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
    return new Uint8Array(pt);
  } catch {
    return null;
  }
}

export async function openEntry(
  entry: VaultEntry,
  secret: string
): Promise<{ bytes: Uint8Array; via: 'bot-key' | 'owner' } | null> {
  const bytes = await unseal(entry.box, secret);
  if (bytes) return { bytes, via: 'bot-key' };
  if (entry.ownerWrap) {
    const botKey = await unseal(entry.ownerWrap, secret);
    if (!botKey) return null;
    const unwrapped = await unseal(entry.box, dec.decode(botKey));
    return unwrapped ? { bytes: unwrapped, via: 'owner' } : null;
  }
  return null;
}

export async function sealEntry(
  file: string,
  mime: string,
  bytes: Uint8Array | string,
  botKey: string,
  ownerKey?: string
): Promise<VaultEntry> {
  const entry: VaultEntry = {
    file,
    mime,
    box: await seal(bytes, botKey),
  };
  if (ownerKey && ownerKey.trim()) {
    entry.ownerWrap = await seal(enc.encode(botKey), ownerKey);
  }
  return entry;
}

export function vaultText(bytes: Uint8Array): string {
  return dec.decode(bytes);
}

export function generateBotSecret(): string {
  const raw = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(raw, (x) => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'[x % 56]).join('');
}
