import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareBlingProduct } from './blingProductCreate.ts';

const product = { name: 'Fresa nova', sku: 'FM NOVA/1', price: 140, ncm: '8207.70.10' };

test('valida campos antes da API e não inventa origem fiscal', async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    assert.equal(init?.method || 'GET', 'GET');
    return Response.json({ data: [] });
  });
  for (const invalid of [{ name: 'x'.repeat(121) }, { sku: '' }, { price: 0 }, { ncm: '00000000' }, { origin: -1 }, { origin: '2' }]) {
    await assert.rejects(prepareBlingProduct('test', { ...product, ...invalid }));
  }
  await assert.rejects(prepareBlingProduct('', product), /Conecte/);
  assert.equal(calls.length, 0);
  const payload = await prepareBlingProduct('test', product);
  assert.match(calls[0], /codigos\[\]=FM%20NOVA%2F1/);
  assert.deepEqual(payload.tributacao, { ncm: '82077010' });
  assert.equal('pesoBruto' in payload, false);
  const imported = await prepareBlingProduct('test', { ...product, origin: 2 });
  assert.deepEqual(imported.tributacao, { ncm: '82077010', origem: 2 });
});

test('SKU duplicado e erro de permissão nunca viram tentativa de gravação', async (t) => {
  let status = 200;
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method || 'GET', 'GET');
    return status === 200 ? Response.json({ data: [{ id: 5, codigo: product.sku }] }) : Response.json({ error: { description: 'Sem produtos:read' } }, { status });
  });
  await assert.rejects(prepareBlingProduct('test', product), /já está cadastrado.*Buscar SKU/);
  status = 403;
  await assert.rejects(prepareBlingProduct('test', product), /produtos:read/);
});
