import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blingOrderChanged, blingOrderSnapshot } from './blingOrderSnapshot.ts';
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
