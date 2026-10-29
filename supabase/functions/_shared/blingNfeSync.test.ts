import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleBlingNfe } from './blingFiscal.ts';

function invoice(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

test('consulta descobre nota emitida fora do app e não gera, ajusta ou transmite', async (t) => {
  let linkedId: number | undefined = 33;
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method || 'GET', 'GET');
    const path = new URL(String(input)).pathname;
    calls.push(path);
    if (path.endsWith('/pedidos/vendas/22')) return Response.json({ data: { id: 22, notaFiscal: linkedId ? { id: linkedId } : {} } });
    if (path.endsWith('/nfe/33')) return Response.json({ data: { id: 33, situacao: 5, serie: 2, numero: 123, chaveAcesso: '1'.repeat(44), linkDanfe: 'https://bling.test/danfe', xml: 'https://bling.test/xml' } });
    throw new Error(`Consulta inesperada: ${path}`);
  });
  const result = await handleBlingNfe('status', { orderId: 22, quote: { items: [], financials: {} } }, 'test');
  assert.equal(result.status, 200);
  assert.equal(invoice(result.body.nfe).situacao, 5);
  assert.equal(invoice(result.body.nfe).id, 33);
  assert.equal(invoice(result.body.nfe).linkXml, 'https://bling.test/xml');
  assert.equal(result.body.readyToSend, false);
  assert.equal(calls.length, 2);

  calls.length = 0;
  const mismatch = await handleBlingNfe('status', { orderId: 22, nfeId: 99 }, 'test');
  assert.equal(mismatch.status, 409);
  assert.equal(calls.length, 1);

  linkedId = undefined;
  const absent = await handleBlingNfe('status', { orderId: 22 }, 'test');
  assert.equal(absent.status, 200);
  assert.equal(absent.body.nfe, null);
  const missingLink = await handleBlingNfe('status', { orderId: 22, nfeId: 33 }, 'test');
  assert.equal(missingLink.status, 409);

  const byId = await handleBlingNfe('status', { nfeId: 33 }, 'test');
  assert.equal(byId.status, 200);
  assert.equal(invoice(byId.body.nfe).situacao, 5);
});

test('falha de consulta não retorna uma autorização fictícia', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'Acesso negado' } }, { status: 403 }));
  const result = await handleBlingNfe('status', { orderId: 22 }, 'test');
  assert.equal(result.body.success, false);
  assert.equal(result.body.nfe, undefined);
});
