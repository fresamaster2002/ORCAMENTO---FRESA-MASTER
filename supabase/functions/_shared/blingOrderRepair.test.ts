import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleBlingNfe } from './blingFiscal.ts';

test('conferência corrige identificação sem criar venda, produto ou nota', async (t) => {
  const calls: string[] = [];
  const sale = { id: 11, contato: { numeroDocumento: '12345678901' }, itens: [
    { descricao: 'Fresa do pedido', codigo: 'FM-1', produto: { id: 123 }, unidade: 'UN', quantidade: 2, valor: 140 },
  ] };
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method || 'GET'} ${input}`);
    return Response.json({ data: sale });
  });
  const quote = {
    bling: { orderId: 11 }, client: { document: '123.456.789-01' },
    items: [{ id: 'item-1', description: 'Fresa negociada', sku: 'ANTIGO', ncm: '8207.70.10', quantity: 2, unitPrice: 140, totalPrice: 280 }],
  };
  const result = await handleBlingNfe('reconcile-items', { orderId: 11, quote }, 'test');
  assert.equal(result.status, 200);
  const items = result.body.items as typeof quote.items;
  assert.equal(items[0].description, sale.itens[0].descricao);
  assert.equal(items[0].sku, 'FM-1');
  assert.equal(items[0].ncm, '8207.70.10');
  assert.equal(items[0].quantity, 2);
  assert.equal(items[0].unitPrice, 140);
  assert.equal(items[0].id, 'item-1');
  assert.equal(calls.length, 1);
  assert.ok(calls.every((call) => call.startsWith('GET ')));
  for (const patch of [
    { client: { document: '99999999999' } },
    { items: [{ ...quote.items[0], quantity: 1 }] },
    { items: [{ ...quote.items[0], unitPrice: 150 }] },
    { items: [] },
    { bling: { orderId: 12 } },
    { bling: { orderId: 11, nfe: { id: 88 } } },
  ]) {
    assert.notEqual((await handleBlingNfe('reconcile-items', { orderId: 11, quote: { ...quote, ...patch } }, 'test')).status, 200);
  }
  assert.ok(calls.every((call) => call.startsWith('GET ')));
});
