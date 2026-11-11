import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adoptBlingOrderItems, adoptBlingRecipient, blingOrderChanged, blingOrderDifferences, blingOrderSnapshot, restoreBlingOrderSnapshot } from './blingOrderSnapshot.ts';
import type { QuoteData } from './types';

function savedQuote(): QuoteData {
  const quote: QuoteData = {
    id: 'TESTE', status: 'draft', createdAt: '',
    client: { name: 'Cliente', document: '123', email: '' },
    project: { title: '', category: '', description: '', validityDays: 7, date: '2026-10-10' },
    items: [{ id: '1', description: 'Fresa', sku: '', ncm: '82077010', quantity: 1, unit: 'un', unitPrice: 220, totalPrice: 220 }],
    shipping: { originCep: '13321472', destinationCep: '13303512', options: [],
      selectedOption: { service: 'CONTA_FRESA', name: 'Cortesia', carrier: 'Fresa Master', price: 0, deliveryDays: 2 } },
    financials: { subtotal: 220, shippingAmount: 0, discountPercentage: 0, discountAmount: 0,
      taxPercentage: 0, taxAmount: 0, totalAmount: 220, paymentTerms: 'À vista', paymentMethod: 'Pix' },
    observations: [], notesForClient: '',
  };
  quote.bling = { orderId: 123, orderSnapshot: blingOrderSnapshot(quote) };
  return quote;
}

test('recarregar campos vazios, ordem das chaves e alternativas de frete não altera a venda', () => {
  const quote = savedQuote();
  quote.client = { company: '', ...quote.client, phone: '' };
  quote.client.fiscalReviewKey = 'conferência sem alteração comercial';
  quote.shipping.options.push({ ...quote.shipping.selectedOption! });
  assert.equal(blingOrderChanged(quote), false);
});

test('alterações reais continuam bloqueadas e snapshot inválido não libera emissão', () => {
  for (const change of [
    (q: QuoteData) => { q.client.document = '456'; },
    (q: QuoteData) => { q.items[0].quantity = 2; },
    (q: QuoteData) => { q.items[0].ncm = '82077090'; },
    (q: QuoteData) => { q.items[0].unitPrice = 200; },
    (q: QuoteData) => { q.shipping.selectedOption!.price = 10; },
    (q: QuoteData) => { q.financials.paymentMethod = 'Dinheiro'; },
  ]) {
    const quote = savedQuote();
    change(quote);
    assert.equal(blingOrderChanged(quote), true);
  }
  const quote = savedQuote();
  quote.bling!.orderSnapshot = '{';
  assert.equal(blingOrderChanged(quote), true);
});

test('formatação do mesmo NCM não muda a venda; código diferente continua bloqueado', () => {
  const quote = savedQuote();
  quote.items[0].ncm = '8207.70.10';
  assert.equal(blingOrderChanged(quote), false);
  quote.items[0].ncm = '8207.70.00';
  assert.deepEqual(blingOrderDifferences(quote), ['items.0.ncm']);
});

test('entrega diferente do fiscal não bloqueia por si só, mas alteração posterior é identificada', () => {
  const quote = savedQuote();
  quote.client.cep = '13321-472';
  quote.shipping.deliveryAddress = { enabled: true, address: 'Rua de entrega', number: '20' };
  quote.bling!.orderSnapshot = blingOrderSnapshot(quote);
  assert.deepEqual(blingOrderDifferences(quote), []);
  quote.shipping.deliveryAddress.number = '30';
  assert.deepEqual(blingOrderDifferences(quote), ['shipping.deliveryAddress.number']);
});

test('adoção explícita altera somente destinatário do mesmo documento, sem ocultar mudanças comerciais', () => {
  const quote = savedQuote();
  const client = { ...quote.client, name: 'Nome já cadastrado', address: 'Rua do ERP' };
  const snapshot = JSON.parse(adoptBlingRecipient(quote, client));
  const original = JSON.parse(quote.bling!.orderSnapshot!);
  assert.deepEqual(snapshot, { ...original, client });
  assert.throws(() => adoptBlingRecipient(quote, { ...client, document: '456' }), /CPF\/CNPJ/);
  quote.items[0].unitPrice = 210;
  assert.throws(() => adoptBlingRecipient(quote, client), /orçamento mudou/);
});

test('restauração recupera a venda salva e preserva vínculos, NF e controle comercial', () => {
  const quote = savedQuote();
  quote.bling!.nfe = { id: 99, situacao: 1 };
  quote.commercial = { notes: 'Não perder acompanhamento' };
  quote.items[0].quantity = 8;
  quote.items[0].totalPrice = 1760;
  quote.items[0].blingProductId = 'outro-produto';
  quote.client.name = 'Nome alterado';
  quote.financials.totalAmount = 1760;
  const restored = restoreBlingOrderSnapshot(quote);
  assert.equal(blingOrderChanged(restored), false);
  assert.equal(restored.items[0].quantity, 1);
  assert.equal(restored.items[0].totalPrice, 220);
  assert.equal(restored.items[0].blingProductId, undefined);
  assert.equal(restored.financials.totalAmount, 220);
  assert.deepEqual(restored.bling, quote.bling);
  assert.deepEqual(restored.commercial, quote.commercial);
  assert.equal(quote.items[0].quantity, 8);
});

test('correção explícita dos itens muda apenas identificação e não mascara alterações comerciais', () => {
  const quote = savedQuote();
  const items = [{ ...quote.items[0], description: 'Descrição do pedido', sku: 'FM-1', blingProductId: '123' }];
  const fixed = adoptBlingOrderItems(quote, items);
  assert.equal(blingOrderChanged(fixed), false);
  assert.equal(fixed.items[0].sku, 'FM-1');
  assert.equal(fixed.bling!.orderId, 123);
  assert.deepEqual(fixed.financials, quote.financials);
  assert.throws(() => adoptBlingOrderItems(quote, [{ ...items[0], quantity: 2 }]), /quantidades/);
  assert.throws(() => adoptBlingOrderItems(quote, []), /quantidades/);
  quote.client.document = 'outro';
  assert.throws(() => adoptBlingOrderItems(quote, items), /Restaure primeiro/);
});

test('não restaura referência ausente, inválida ou incompleta', () => {
  const quote = savedQuote();
  for (const snapshot of [undefined, '{', '{}']) {
    quote.bling!.orderSnapshot = snapshot;
    assert.throws(() => restoreBlingOrderSnapshot(quote));
  }
});
