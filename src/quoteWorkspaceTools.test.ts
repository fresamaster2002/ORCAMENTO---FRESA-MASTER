import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QuoteData } from './types';
import { duplicateQuote, filterQuotes } from './quoteWorkspaceTools';

const quote = (id = 'FM-001'): QuoteData => ({
  id, status: 'draft', createdAt: '2026-10-18T12:00:00Z',
  client: { name: 'Móveis São José', document: '59.085.330/0001-70', fiscalReviewKey: 'confirmed' },
  project: { title: 'Ferramentas', category: '', description: '', validityDays: 10, date: '2026-10-18' },
  items: [{ id: 'old-item', description: 'Fresa', sku: 'FM-1', blingProductId: '123', ncm: '8207.70.00', quantity: 2, unit: 'un', unitPrice: 140, totalPrice: 280 }],
  shipping: { originCep: '13329-350', destinationCep: '80010-000', options: [], packageDimensions: { height: 7, width: 12, length: 17 } },
  financials: { subtotal: 280, shippingAmount: 0, discountPercentage: 0, discountAmount: 20, taxPercentage: 0, taxAmount: 0, totalAmount: 260, paymentTerms: 'À vista', paymentMethod: 'Pix' },
  observations: ['Conferir embalagem'], notesForClient: 'Obrigado',
});

test('busca ignora acentos e encontra CNPJ com ou sem formatação e número do orçamento', () => {
  const source = quote();
  for (const query of ['moveis jose', '59085330000170', '59.085.330/0001-70', 'FM-001']) {
    assert.deepEqual(filterQuotes([source], query, 'all'), [source]);
  }
  assert.equal(filterQuotes([source], 'outro cliente', 'all').length, 0);
  assert.equal(filterQuotes([source], '', 'approved').length, 0);
});

test('duplicação cria rascunho sem vínculos, frete antigo ou confirmação fiscal', () => {
  const source = quote();
  source.status = 'approved';
  source.bling = { orderId: 33, nfe: { id: 44, situacao: 5 } };
  source.sandboxShipment = { id: 'old', protocol: 'old', createdAt: source.createdAt, paymentStatus: 'paid' };
  source.productionShipment = { environment: 'production', status: 'created', id: 'real-old', protocol: null, requestedAt: source.createdAt, price: 30 };
  source.shipping.selectedOption = { service: 'SEDEX', carrier: 'Correios', name: 'Sedex', price: 30, deliveryDays: 2, isRealTimeMelhorEnvio: true };
  source.shipping.options = [source.shipping.selectedOption];
  source.financials.shippingAmount = 30;
  source.financials.insuranceAmount = 5;
  const original = structuredClone(source);
  const empty = quote('FM-002');
  empty.createdAt = '2026-10-19T12:00:00Z';
  empty.project.date = '2026-10-19';
  const copy = duplicateQuote(source, empty);
  assert.deepEqual(source, original);
  assert.equal(copy.id, 'FM-002');
  assert.equal(copy.status, 'draft');
  assert.equal(copy.createdAt, empty.createdAt);
  assert.equal(copy.project.date, empty.project.date);
  assert.equal(copy.bling, undefined);
  assert.equal(copy.sandboxShipment, undefined);
  assert.equal(copy.productionShipment, undefined);
  assert.equal(copy.client.fiscalReviewKey, undefined);
  assert.equal(copy.shipping.selectedOption, undefined);
  assert.deepEqual(copy.shipping.options, []);
  assert.equal(copy.financials.shippingAmount, 0);
  assert.equal(copy.financials.insuranceAmount, 0);
  assert.equal(copy.financials.totalAmount, 260);
  assert.equal(copy.items[0].blingProductId, '123');
  assert.notEqual(copy.items[0].id, source.items[0].id);
  copy.client.name = 'Alterado';
  copy.items[0].quantity = 8;
  copy.shipping.packageDimensions!.height = 9;
  assert.deepEqual(source, original);
});

test('duplicação respeita desconto percentual, limite do desconto fixo e não soma tributo à parte', () => {
  const source = quote();
  source.financials.discountPercentage = 10;
  source.financials.taxPercentage = 18;
  assert.equal(duplicateQuote(source, quote('FM-002')).financials.totalAmount, 252);
  source.financials.discountPercentage = 0;
  source.financials.discountAmount = 999;
  assert.equal(duplicateQuote(source, quote('FM-002')).financials.totalAmount, 0);
});
