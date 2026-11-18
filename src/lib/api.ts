import { auth, getFreshIdToken } from './firebase';

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit & { json?: unknown; adminKey?: string } = {}
): Promise<T> {
  const url = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : '/' + path}`;
  const headers = new Headers(options.headers || {});
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.adminKey) {
    headers.set('X-Admin', options.adminKey);
  }
  const token = auth.currentUser ? await getFreshIdToken(false).catch(() => null) : null;
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your internet connection.', 0);
  }

  // Retry once with force-refreshed token if expired
  if (res.status === 401 && auth.currentUser && !headers.get('X-Retried')) {
    const fresh = await getFreshIdToken(true).catch(() => null);
    if (fresh) {
      headers.set('Authorization', `Bearer ${fresh}`);
      headers.set('X-Retried', '1');
      res = await fetch(url, {
        ...options,
        headers,
        body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
      });
    }
  }

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new ApiError(text || `Request failed (${res.status})`, res.status);
    return text as unknown as T;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.error || `Something went wrong (${res.status}).`, res.status, data);
  }
  return data as T;
}

export async function downloadWithAuth(path: string, filename: string, adminKey?: string): Promise<void> {
  const token = auth.currentUser ? await getFreshIdToken(false).catch(() => null) : null;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (adminKey) headers['X-Admin'] = adminKey;
  const res = await fetch(path.startsWith('/api') ? path : `/api${path}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Download failed.' }));
    throw new Error(err.error || 'Download failed.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
