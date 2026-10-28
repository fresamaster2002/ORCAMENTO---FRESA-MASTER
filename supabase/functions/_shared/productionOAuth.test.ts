import assert from 'node:assert/strict';
import { test } from 'node:test';
import { beginProductionOAuth, completeProductionOAuth, MelhorEnvioOAuthError, productionAccessToken, type MelhorEnvioTokenRecord, type MelhorEnvioTokenStore } from './productionOAuth.ts';

function tokenStore(initial: MelhorEnvioTokenRecord | null = null) {
  let saved = initial;
  const store: MelhorEnvioTokenStore = {
    async load() { return saved ? { ...saved } : null; },
    async save(record) { saved = { ...record }; },
  };
  return { store, read: () => saved };
}

const config = (store: MelhorEnvioTokenStore, now: () => number, fetcher: typeof fetch) => ({
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://project.supabase.co/functions/v1/api/shipping/melhor-envio/callback',
  store,
  now,
  fetcher,
});

test('OAuth cria URL de consentimento de produção com redirect e state aleatório', async () => {
  const now = () => Date.parse('2026-10-25T12:00:00.000Z');
  const memory = tokenStore();
  const url = new URL(await beginProductionOAuth(config(memory.store, now, fetch)));
  assert.equal(url.origin, 'https://melhorenvio.com.br');
  assert.equal(url.pathname, '/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), 'client-id');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://project.supabase.co/functions/v1/api/shipping/melhor-envio/callback');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'shipping-calculate users-read');
  assert.ok(url.searchParams.get('state'));
  assert.equal(memory.read()?.pendingState, url.searchParams.get('state'));
});

test('callback confere state, troca code e persiste tokens somente no servidor', async () => {
  const now = () => Date.parse('2026-10-25T12:00:00.000Z');
  const memory = tokenStore();
  const cfg = config(memory.store, now, async (input, init) => {
    assert.equal(String(input), 'https://melhorenvio.com.br/oauth/token');
    assert.equal(new Headers(init?.headers).get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      grant_type: 'authorization_code',
      client_id: 'client-id',
      client_secret: 'client-secret',
      redirect_uri: 'https://project.supabase.co/functions/v1/api/shipping/melhor-envio/callback',
      code: 'one-time-code',
    });
    return Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
  });
  const authUrl = new URL(await beginProductionOAuth(cfg));
  await completeProductionOAuth(cfg, 'one-time-code', authUrl.searchParams.get('state') || '');
  assert.equal(memory.read()?.accessToken, 'access');
  assert.equal(memory.read()?.refreshToken, 'refresh');
  assert.equal(memory.read()?.pendingState, undefined);
});

test('rejeita state incorreto e solicitação expirada sem chamar a API', async () => {
  const initial = {
    accessToken: '', refreshToken: '', expiresAt: new Date(0).toISOString(),
    pendingState: 'expected-state', pendingCreatedAt: '2026-10-25T11:00:00.000Z',
  };
  const memory = tokenStore(initial);
  const cfg = config(memory.store, () => Date.parse('2026-10-25T12:00:00.000Z'), async () => {
    throw new Error('Não deveria acessar a rede');
  });
  await assert.rejects(completeProductionOAuth(cfg, 'code', 'wrong'), MelhorEnvioOAuthError);
  await assert.rejects(completeProductionOAuth(cfg, 'code', 'expected-state'), /expirou/);
});

test('renova token próximo do vencimento e persiste o refresh token rotacionado', async () => {
  let calls = 0;
  const memory = tokenStore({
    accessToken: 'old-access', refreshToken: 'old-refresh',
    expiresAt: '2026-10-25T12:01:00.000Z',
  });
  const cfg = config(memory.store, () => Date.parse('2026-10-25T12:00:00.000Z'), async (_input, init) => {
    calls++;
    assert.deepEqual(JSON.parse(String(init?.body)), {
      grant_type: 'refresh_token', client_id: 'client-id',
      client_secret: 'client-secret', refresh_token: 'old-refresh',
    });
    return Response.json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 7200 });
  });
  assert.equal(await productionAccessToken(cfg), 'new-access');
  assert.equal(memory.read()?.refreshToken, 'new-refresh');
  assert.equal(calls, 1);
  assert.equal(await productionAccessToken(cfg), 'new-access');
  assert.equal(calls, 1);
});

test('token estático somente é usado sem credencial OAuth persistida', async () => {
  const memory = tokenStore();
  assert.equal(await productionAccessToken(config(memory.store, Date.now, fetch), 'static-production-token'), 'static-production-token');
});
