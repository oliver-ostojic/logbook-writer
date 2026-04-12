import { useAuthStore } from '@/lib/authStore';

/**
 * Wrapper around fetch that includes auth credentials.
 * Sends the JWT as a Bearer token (works in iframe contexts where cookies are blocked)
 * and also includes credentials for cookie-based auth as a fallback.
 */
export function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init?.headers);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });
}
