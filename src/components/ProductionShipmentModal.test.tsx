import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductionShipmentNotice } from './ProductionShipmentNotice';
import { isProductionShipment, productionMissing } from '../productionShipping';
import type { QuoteData } from '../types';

const quote: QuoteData = {
  id: 'FM-TEST', status: 'approved', createdAt: '2026-10-22T12:00:00Z',
  client: { name: 'Cliente Teste', document: '59.085.330/0001-70', cep: '13329-350', address: 'Rua Fiscal', number: '217', complement: 'Sala 2', neighborhood: 'Centro', city: 'Salto', state: 'SP' },
  project: { title: '', category: '', description: '', date: '2026-10-22', validityDays: 10 },
  items: [], shipping: { originCep: '13329-350', destinationCep: '13329-350', options: [], selectedOption: { service: 'SEDEX', name: 'Sedex', carrier: 'Correios', price: 12, deliveryDays: 2 } },
  financials: { subtotal: 140, shippingAmount: 12, totalAmount: 152, discountAmount: 0, discountPercentage: 0, taxPercentage: 0, taxAmount: 0, paymentTerms: 'À vista', paymentMethod: 'Pix' },
  observations: [], notesForClient: '',
  bling: { nfe: { id: 'test-note', situacao: 5, serie: 2, chaveAcesso: '3'.repeat(44) } },
};

test('orientação do envio real aponta somente para o painel real e não anuncia pagamento automático', () => {
  const html = renderToStaticMarkup(<ProductionShipmentNotice />);
  assert.match(html, /não paga, não compra nem emite etiqueta/);
  assert.match(html, /https:\/\/melhorenvio.com.br\/carrinho/);
  assert.doesNotMatch(html, /saldo fictício|checkout-sandbox|sandbox.melhorenvio/);
});

test('envio de teste não libera nem é confundido com envio de produção', () => {
  assert.equal(isProductionShipment({ environment: 'sandbox', id: 'test' }), false);
  assert.equal(isProductionShipment({ environment: 'production', status: 'created', requestedAt: new Date().toISOString(), id: null, protocol: null, price: 20 }), false);
  assert.equal(isProductionShipment({ environment: 'production', status: 'unknown', requestedAt: new Date().toISOString(), id: null, protocol: null, price: 20 }), true);
  assert.deepEqual(productionMissing(quote), []);
  assert.match(productionMissing({ ...quote, status: 'draft', bling: undefined }).join(' '), /aprovado/);
  assert.match(productionMissing({ ...quote, shipping: { ...quote.shipping, selectedOption: undefined } }).join(' '), /Sedex/);
});
