import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveSelectedProductNcm } from './blingProductSelection.ts';
import { normalizeBlingCatalogProducts } from './blingCatalog.ts';
import type { QuoteItem } from './types';

test('catálogo sem NCM não inventa código e seleção preserva classificação do mesmo produto', () => {
  const product = normalizeBlingCatalogProducts([{ id: 123, codigo: 'FM-TCT-6X22', nome: 'Fresa de topo', preco: 170 }])[0];
  assert.equal(product.ncm, '');
  const item: QuoteItem = { id: '1', description: 'Fresa de topo', sku: '', ncm: '8207.70.10', quantity: 1, unit: 'un', unitPrice: 170, totalPrice: 170 };
  assert.equal(resolveSelectedProductNcm(item, product), '8207.70.10');
  assert.equal(resolveSelectedProductNcm({ ...item, description: 'Outro produto' }, product), '');
  assert.equal(resolveSelectedProductNcm({ ...item, ncm: '8207.70.00' }, product), '');
  assert.equal(resolveSelectedProductNcm({ ...item, description: 'Outro produto' }, { ...product, ncm: '8207.70.90' }), '8207.70.90');
  assert.equal(resolveSelectedProductNcm(item, { ...product, ncm: '8207.70.90' }), '8207.70.90');
  assert.equal(normalizeBlingCatalogProducts([{ id: 456, nome: 'Fresa sem código' }])[0].sku, '');
});
