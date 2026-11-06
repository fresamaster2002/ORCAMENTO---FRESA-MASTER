import assert from 'node:assert/strict';
import { test } from 'node:test';
import { preserveQuoteClient } from './quoteClientMerge';

const client = { name: 'Cliente Escolhido', document: '12.345.678/0001-90', email: 'cliente@example.test', cep: '13329-350', ie: 'ISENTO' };

test('product and quantity commands preserve the entire selected client', () => {
  for (const text of ['Agora 4 fresas TCT por 140', 'Troque por 2 helicoidais', 'Sedex para CEP 80010-000']) {
    assert.deepEqual(preserveQuoteClient(text, client, { name: '', document: '' }), client);
    assert.deepEqual(preserveQuoteClient(text, client, { name: 'Nome inventado' }), client);
  }
});

test('blank extraction fields cannot erase the existing customer', () => {
  assert.deepEqual(preserveQuoteClient('cliente, alterar email', client, { name: '', email: 'novo@example.test', document: '' }),
    { ...client, email: 'novo@example.test' });
  assert.deepEqual(preserveQuoteClient('cliente', client), client);
});

test('explicit new customer does not inherit fiscal data from the previous one', () => {
  assert.deepEqual(preserveQuoteClient('Cliente Nova Empresa', client, { name: 'Nova Empresa' }), { name: 'Nova Empresa' });
  assert.deepEqual(preserveQuoteClient('Alterar CNPJ', client, { name: client.name, document: '98.765.432/0001-10' }),
    { name: client.name, document: '98.765.432/0001-10' });
});

test('matching customer identity retains fiscal and contact fields', () => {
  assert.deepEqual(preserveQuoteClient('Razão social Cliente Escolhido', client, { name: client.name, ie: '' }), client);
  assert.deepEqual(preserveQuoteClient('3 fresas', client), client);
});
