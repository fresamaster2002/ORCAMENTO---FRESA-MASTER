import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindBlingProduct, resolveSelectedProductNcm } from './blingProductSelection.ts';
import { normalizeBlingCatalogProducts } from './blingCatalog.ts';
import type { QuoteItem } from './types';

test('catálogo e seleção usam NCM padrão para fresas e preservam outros códigos', () => {
  const product = normalizeBlingCatalogProducts([{ id: 123, codigo: 'FM-TCT-6X22', nome: 'Fresa de topo', preco: 170 }])[0];
  assert.equal(product.ncm, '8207.70.10');
  const item: QuoteItem = { id: '1', description: 'Fresa de topo', sku: '', ncm: '8207.70.10', quantity: 1, unit: 'un', unitPrice: 170, totalPrice: 170 };
  assert.equal(resolveSelectedProductNcm(item, product), '8207.70.10');
  assert.equal(resolveSelectedProductNcm({ ...item, description: 'Outro produto' }, product), '8207.70.10');
  assert.equal(resolveSelectedProductNcm({ ...item, ncm: '8207.70.00' }, product), '8207.70.10');
  assert.equal(resolveSelectedProductNcm({ ...item, description: 'Outro produto' }, { ...product, ncm: '8207.70.90' }), '8207.70.90');
  assert.equal(resolveSelectedProductNcm(item, { ...product, ncm: '8207.70.90' }), '8207.70.90');
  assert.equal(normalizeBlingCatalogProducts([{ id: 456, nome: 'Fresa sem código' }])[0].sku, '');
  assert.equal(normalizeBlingCatalogProducts([{ id: 456, nome: 'Fresa TCT', ncm: '82077000' }])[0].ncm, '8207.70.10');
  assert.equal(normalizeBlingCatalogProducts([{ id: 456, nome: 'Pinça ER20', ncm: '8466.10.00' }])[0].ncm, '8466.10.00');
  assert.equal(normalizeBlingCatalogProducts([{ id: 456, nome: 'Pinça ER20' }])[0].ncm, '');
});

test('vínculo de produto existente ou recém-cadastrado mantém preço e quantidade negociados', () => {
  const product = normalizeBlingCatalogProducts([{ id: 123, codigo: 'FM-NOVA', nome: 'Fresa nova', preco: 200, tributacao: { ncm: '8207.70.10' } }])[0];
  const item: QuoteItem = { id: 'original', description: 'Ferramenta ditada', quantity: 3, unitPrice: 140, totalPrice: 420, unit: 'UN' };
  const bound = bindBlingProduct(item, product);
  assert.equal(bound.id, item.id);
  assert.equal(bound.blingProductId, '123');
  assert.equal(bound.sku, 'FM-NOVA');
  assert.equal(bound.ncm, '8207.70.10');
  assert.equal(bound.quantity, 3);
  assert.equal(bound.unitPrice, 140);
  assert.equal(bound.totalPrice, 420);
  assert.equal(bindBlingProduct({ ...item, unitPrice: 0 }, product).unitPrice, 0);
  assert.equal(item.blingProductId, undefined);
});
