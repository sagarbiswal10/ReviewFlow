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
