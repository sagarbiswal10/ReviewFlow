import { auth } from '../firebase';

export function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL || '').trim();
  return raw.replace(/\/+$/, '');
}

export function getPublicAppUrl(): string {
  const raw = (import.meta.env.VITE_PUBLIC_APP_URL || '').trim();
  if (raw) {
    return raw.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

interface ApiFetchOptions extends RequestInit {
  requireAuth?: boolean;
}

export async function apiFetch(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { requireAuth = false, headers: customHeaders, ...rest } = options;
  const headers = new Headers(customHeaders);
  if (!headers.has('Content-Type') && rest.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (requireAuth) {
    const currentUser = auth.currentUser;
    if (currentUser) {
      const token = await currentUser.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${getApiBaseUrl()}${normalizedPath}`, {
    ...rest,
    headers,
  });
}

export async function parseApiJson<T = Record<string, unknown>>(
  res: Response,
): Promise<{ ok: boolean; status: number; data: T | null; rawText: string }> {
  let rawText = '';
  try {
    rawText = await res.text();
  } catch {
    return { ok: res.ok, status: res.status, data: null, rawText: '' };
  }

  if (!rawText.trim()) {
    return { ok: res.ok, status: res.status, data: null, rawText: '' };
  }

  try {
    const parsed = JSON.parse(rawText) as T;
    return { ok: res.ok, status: res.status, data: parsed, rawText };
  } catch {
    return { ok: res.ok, status: res.status, data: null, rawText };
  }
}

export function formatApiError(err: unknown, fallback: string): string {
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return 'Unable to reach the server. Please check your connection and try again.';
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallback;
}
