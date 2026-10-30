import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deliveryCorrection, productionMissing } from './productionShipping';
import type { QuoteData } from './types';

function quote(): QuoteData {
  return {
    id: 'FM-TEST', status: 'approved',
    observations: [], notesForClient: '', createdAt: '2026-10-30',
    client: { name: 'Cliente', cep: '15082-488', address: 'Rua Cliente', number: '1119', neighborhood: 'Centro', city: 'São José do Rio Preto', state: 'SP' },
    items: [],
    project: { title: '', category: '', description: '', validityDays: 7, date: '2026-10-30' },
    financials: { subtotal: 100, shippingAmount: 20, discountPercentage: 0, discountAmount: 0, taxPercentage: 0, taxAmount: 0, totalAmount: 120, paymentTerms: '', paymentMethod: '' },
    shipping: { originCep: '13329-350', destinationCep: '15082-488', options: [], selectedOption: { service: 'SEDEX', name: 'Sedex', carrier: 'Correios', price: 20, deliveryDays: 2 } },
    bling: { nfe: { id: '47', situacao: 5, serie: 2, chaveAcesso: '1'.repeat(44) } },
  };
}

test('correção de entrega preserva cadastro fiscal, origem, NF e valor negociado', () => {
  const source = quote();
  source.shipping.destinationCep = '15055-000';
  const before = structuredClone(source);
  const draft = deliveryCorrection(source);
  assert.equal(draft.deliveryAddress?.enabled, true);
  assert.equal(draft.deliveryAddress?.number, '1119');
  assert.equal(draft.destinationCep, '15055-000');
  assert.equal(draft.originCep, '13329-350');
  draft.destinationCep = '15082-488';
  draft.deliveryAddress!.address = 'Rua confirmada';
  assert.deepEqual(source, before);
  const corrected = { ...source, shipping: draft };
  assert.deepEqual(corrected.client, before.client);
  assert.deepEqual(corrected.bling, before.bling);
  assert.deepEqual(corrected.financials, before.financials);
  assert.deepEqual(productionMissing(corrected), []);
});

test('entrega separada não recebe lacunas do endereço fiscal', () => {
  const source = quote();
  source.shipping.deliveryAddress = { enabled: true, number: '600' };
  const draft = deliveryCorrection(source);
  assert.equal(draft.deliveryAddress?.address, undefined);
  assert.ok(productionMissing({ ...source, shipping: draft }).some((message) => message.includes('logradouro')));
});

test('pendências mantêm bloqueios fiscais e identificam CEP divergente ou incompleto', () => {
  const source = quote();
  assert.deepEqual(productionMissing(source), []);
  source.shipping.destinationCep = '15055-000';
  assert.ok(productionMissing(source).some((message) => message.includes('difere do cadastro')));
  source.shipping.destinationCep = '123';
  source.status = 'draft';
  source.bling!.nfe!.situacao = 6;
  const issues = productionMissing(source);
  assert.ok(issues.some((message) => message.includes('8 dígitos')));
  assert.ok(issues.some((message) => message.includes('aprovado')));
  assert.ok(issues.some((message) => message.includes('NF-e autorizada')));
});
