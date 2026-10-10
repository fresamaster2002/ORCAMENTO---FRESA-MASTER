let nextRequestAt = 0;
const cooldownByToken = new Map<string, number>();

export async function fetchBlingApi(url: string, init: RequestInit = {}): Promise<Response> {
  const target = new URL(url);
  if (target.origin !== 'https://api.bling.com.br' || !target.pathname.startsWith('/Api/v3/')) throw new Error('URL inválida para a API do Bling.');
  const token = new Headers(init.headers).get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  return blingFetch(token, target.pathname.slice('/Api/v3'.length) + target.search, init.method || 'GET', init.body ? JSON.parse(String(init.body)) : undefined, init.signal || undefined);
}

export async function blingFetch(token: string, path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    for (;;) {
      signal?.throwIfAborted();
      const now = Date.now();
      for (const [key, until] of cooldownByToken) if (until <= now) cooldownByToken.delete(key);
      const cooldown = cooldownByToken.get(token) || 0;
      if (cooldown > now) {
        await wait(cooldown - now, signal);
        continue;
      }
      const slot = Math.max(now, nextRequestAt);
      nextRequestAt = slot + 700;
      if (slot > now) await wait(slot - now, signal);
      signal?.throwIfAborted();
      if ((cooldownByToken.get(token) || 0) > Date.now()) continue;
      break;
    }
    const response = await fetch(`https://api.bling.com.br/Api/v3${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    });
    if (response.status !== 429) return response;
    const header = response.headers.get('Retry-After');
    const seconds = header ? Number(header) : NaN;
    const retryAt = Number.isFinite(seconds) && seconds >= 0
      ? Date.now() + seconds * 1000
      : header && Number.isFinite(Date.parse(header)) ? Date.parse(header) : Date.now() + 1500 * (attempt + 1);
    cooldownByToken.set(token, Math.max(Date.now() + 700, retryAt));
    // A rejected write is returned to the operator; it is never replayed automatically.
    if (method !== 'GET' || attempt >= 2 || retryAt - Date.now() > 10000) return response;
    await response.arrayBuffer();
  }
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}
