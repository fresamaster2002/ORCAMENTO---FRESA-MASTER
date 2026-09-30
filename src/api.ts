import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const source = input instanceof Request ? input.url : input.toString();
  const requestUrl = new URL(source, window.location.origin);
  const isLocalApi = requestUrl.origin === window.location.origin && requestUrl.pathname.startsWith('/api/');
  const target = isLocalApi && supabaseUrl
    ? `${supabaseUrl}/functions/v1/api/${requestUrl.pathname.slice('/api/'.length)}${requestUrl.search}`
    : input;
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));

  if (isLocalApi && supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    headers.set('apikey', supabaseAnonKey);
    headers.set('Authorization', `Bearer ${session?.access_token || supabaseAnonKey}`);
  }

  return fetch(target, {
    ...init,
    headers,
    credentials: isLocalApi && supabaseUrl ? 'omit' : 'same-origin',
  });
}