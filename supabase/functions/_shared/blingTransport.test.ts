import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blingFetch, fetchBlingApi } from './blingTransport.ts';

test('consultas e gravações concorrentes compartilham intervalo, inclusive POST após GET', async (t) => {
  const starts: { method: string; time: number }[] = [];
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    starts.push({ method: init?.method || 'GET', time: Date.now() });
    return Response.json({ data: {} });
  });
  await Promise.all([
    blingFetch('queue-test', '/produtos/123'),
    fetchBlingApi('https://api.bling.com.br/Api/v3/contatos?limite=1', { headers: { Authorization: 'Bearer queue-test' } }),
    blingFetch('queue-test', '/pedidos/vendas', 'POST', { numeroLoja: 'TESTE' }),
    blingFetch('queue-test', '/nfe/99', 'PUT', { desconto: 0 }),
  ]);
  assert.deepEqual(starts.map((start) => start.method), ['GET', 'GET', 'POST', 'PUT']);
  for (let index = 1; index < starts.length; index++) assert.ok(starts[index].time - starts[index - 1].time >= 650);
});

test('429 em gravação não repete; próxima leitura aguarda cooldown', async (t) => {
  let calls = 0;
  let rejectedAt = 0;
  let readAt = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 1) {
      rejectedAt = Date.now();
      return Response.json({ error: { message: 'Limite' } }, { status: 429, headers: { 'Retry-After': '1' } });
    }
    readAt = Date.now();
    return Response.json({ data: {} });
  });
  const rejected = await blingFetch('cooldown-test', '/pedidos/vendas', 'POST', {});
  assert.equal(rejected.status, 429);
  assert.equal(calls, 1);
  await blingFetch('cooldown-test', '/produtos/123');
  assert.ok(readAt - rejectedAt >= 950);
});

test('Retry-After longo é devolvido sem repetição antecipada e abort cancela antes do envio', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return Response.json({ error: { message: 'Limite diário' } }, { status: 429, headers: { 'Retry-After': '60' } });
  });
  const response = await blingFetch('long-limit-test', '/produtos');
  assert.equal(response.status, 429);
  assert.equal(calls, 1);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(fetchBlingApi('https://api.bling.com.br/Api/v3/produtos', {
    signal: controller.signal, headers: { Authorization: 'Bearer abort-test' },
  }), { name: 'AbortError' });
  assert.equal(calls, 1);
});
