import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchBlingDanfe } from './blingDanfe.ts';
import { handleBlingNfe } from './blingFiscal.ts';

test('download lê nota autorizada vinculada sem operações de escrita', async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    assert.equal(init?.method || 'GET', 'GET');
    if (url.endsWith('/pedidos/vendas/22')) return Response.json({ data: { id: 22, notaFiscal: { id: 33 } } });
    if (url.endsWith('/nfe/33')) return Response.json({ data: { id: 33, situacao: 5, linkDanfe: 'https://www.bling.com.br/doc.view.php?id=example' } });
    if (url.includes('/doc.view.php')) return new Response('<div id="container">DANFE<table></table></div>');
    if (url.endsWith('/styles/danfe.css')) return new Response('.grid { width:100% }');
    throw new Error('URL inesperada');
  });
  const result = await handleBlingNfe('danfe-document', { nfeId: 33, orderId: 22 }, 'test');
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(calls.length, 4);
});

test('recusa vínculo divergente ou nota não autorizada antes do download', async (t) => {
  let linked = 44;
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/pedidos/vendas/')) return Response.json({ data: { id: 22, notaFiscal: { id: linked } } });
    return Response.json({ data: { id: 33, situacao: 1 } });
  });
  assert.equal((await handleBlingNfe('danfe-document', { nfeId: 33, orderId: 22 }, 'test')).status, 409);
  linked = 33;
  assert.equal((await handleBlingNfe('danfe-document', { nfeId: 33, orderId: 22 }, 'test')).status, 409);
  assert.ok(calls.every(url => url.includes('api.bling.com.br')));
});

test('recusa URLs não oficiais sem buscar e não aceita HTML de login como DANFE', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('<html>Login</html>'); });
  for (const url of ['http://www.bling.com.br/doc.view.php', 'https://example.com/doc.view.php', 'https://www.bling.com.br/other']) {
    await assert.rejects(fetchBlingDanfe(url), /não reconhecido/);
  }
  assert.equal(calls, 0);
  await assert.rejects(fetchBlingDanfe('https://www.bling.com.br/doc.view.php?id=test'), /válido/);
});

test('preserva PDF original retornado pelo Bling e limita tamanho', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('%PDF-1.7\nexample'));
  const result = await fetchBlingDanfe('https://www.bling.com.br/doc.view.php?id=test');
  assert.equal(result.kind, 'pdf');
  if (result.kind === 'pdf') assert.equal(atob(result.base64), '%PDF-1.7\nexample');
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array(8 * 1024 * 1024 + 1)));
  await assert.rejects(fetchBlingDanfe('https://www.bling.com.br/doc.view.php?id=test'), /limite/);
});
