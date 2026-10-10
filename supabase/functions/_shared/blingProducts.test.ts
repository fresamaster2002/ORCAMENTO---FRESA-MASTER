import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveBlingProducts } from './blingProducts.ts';
import { buildSaleItems, validateFiscalItems } from './blingFiscal.ts';

const item = { description: 'Fresa Corte 45 graus', sku: '', ncm: '', quantity: 2, unitPrice: 170 };

test('produto sem SKU é vinculado por ID com NCM do Bling e preço negociado', async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method || 'GET', 'GET');
    const url = String(input);
    calls.push(url);
    return Response.json({ data: url.includes('/produtos?') ? [{ id: 123, nome: item.description, codigo: '' }] : { id: 123, codigo: '', tributacao: { ncm: '8207.70.10' } } });
  });
  const result = await resolveBlingProducts('test', [item, item]);
  assert.equal(result.items[0].blingProductId, '123');
  assert.equal(result.items[0].sku, '');
  assert.equal(result.items[0].ncm, '8207.70.10');
  assert.equal(result.items[0].unitPrice, 170);
  assert.equal(calls.length, 2);
  assert.doesNotThrow(() => validateFiscalItems(result.items));
  assert.deepEqual(buildSaleItems(result.items)[0], { produto: { id: 123 }, descricao: item.description, unidade: 'UN', quantidade: 2, valor: 170 });
});

test('ID explícito e código textual usam detalhe do Bling, sem classificação de outro produto', async (t) => {
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = String(input);
    return Response.json({ data: url.includes('/produtos?') ? [{ id: 123, codigo: 'FM-1' }] : { id: 123, codigo: 'FM-1', tributacao: { ncm: '8207.70.90' } } });
  });
  const result = await resolveBlingProducts('test', [{ ...item, sku: 'FM-1', ncm: '8207.70.10' }, { ...item, blingProductId: '123' }]);
  assert.ok(result.items.every((i) => i.ncm === '8207.70.90' && i.blingProductId === '123'));
});

test('NCM vazio é avisado e nunca copiado de outro produto', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: { id: 123, codigo: '', tributacao: { ncm: '' } } }));
  const result = await resolveBlingProducts('test', [{ ...item, blingProductId: '123' }]);
  assert.equal(result.items[0].ncm, '');
  assert.match(result.warnings[0], /vazio/);
  assert.throws(() => validateFiscalItems(result.items), /NCM/);
});

test('ambiguidade, SKU desconhecido e erro HTTP não viram seleção bem-sucedida', async (t) => {
  let response = Response.json({ data: [{ id: 1, nome: item.description }, { id: 2, nome: item.description }] });
  t.mock.method(globalThis, 'fetch', async () => response.clone());
  await assert.rejects(resolveBlingProducts('test', [item]), /mais de um/);
  response = Response.json({ data: [] });
  await assert.rejects(resolveBlingProducts('test', [{ ...item, sku: 'INEXISTENTE' }]), /não foi encontrado/);
  response = Response.json({ error: { message: 'Limite de requisições' } }, { status: 429 });
  await assert.rejects(resolveBlingProducts('test', [item]), /Limite/);
});

test('item avulso sem SKU aceita apenas NCM informado e confirmado', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: [] }));
  const result = await resolveBlingProducts('test', [{ ...item, ncm: '8207.70.10' }]);
  assert.equal(result.items[0].blingProductId, undefined);
  assert.match(result.warnings[0], /avulso/);
  assert.equal('codigo' in buildSaleItems(result.items)[0], false);
});
