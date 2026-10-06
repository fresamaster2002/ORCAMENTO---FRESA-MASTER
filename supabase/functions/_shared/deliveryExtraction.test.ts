import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completeDeliveryByCep, normalizeExtractedDelivery } from './deliveryExtraction.ts';

const mockViaCep = (data: object, status = 200): typeof fetch =>
  async () => new Response(JSON.stringify(data), { status });

test('normaliza somente campos de entrega, sem importar cadastro fiscal', () => {
  const result = normalizeExtractedDelivery({
    cep: '13321472', recipient: ' João ', number: '250', complement: 'Galpão 2',
    document: '12345678901234', enabled: false, state: 'sp',
  });
  assert.equal(result.cep, '13321-472');
  assert.equal(result.recipient, 'João');
  assert.equal(result.state, 'SP');
  assert.equal(result.address, '');
  assert.equal('document' in result, false);
  assert.equal('enabled' in result, false);
});

test('rejeita endereço vazio, respostas inválidas e CEP incompleto', () => {
  for (const value of [null, [], {}, { cep: '13321' }]) {
    assert.throws(() => normalizeExtractedDelivery(value));
  }
});

test('completa endereço incompleto e corrige dados do CEP sem inventar número', async () => {
  const original = normalizeExtractedDelivery({ cep: '13321472', city: 'Cidade incorreta', state: 'PR' });
  const { delivery, warnings } = await completeDeliveryByCep(original, mockViaCep({
    logradouro: 'Rua de Teste', bairro: 'Bairro de Teste', localidade: 'Salto', uf: 'SP',
    complemento: 'lado par',
  }));
  assert.equal(delivery.address, 'Rua de Teste');
  assert.equal(delivery.neighborhood, 'Bairro de Teste');
  assert.equal(delivery.city, 'Salto');
  assert.equal(delivery.state, 'SP');
  assert.equal(delivery.number, '');
  assert.equal(delivery.complement, '');
  assert.match(warnings.join(' '), /número/);
});

test('preserva destinatário, número e complemento enviados pelo cliente', async () => {
  const original = normalizeExtractedDelivery({
    cep: '13321472', recipient: 'João', number: 'S/N', complement: 'Bloco B, sala 2',
  });
  const { delivery } = await completeDeliveryByCep(original, mockViaCep({
    logradouro: 'Rua de Teste', bairro: 'Centro', localidade: 'Salto', uf: 'SP',
  }));
  assert.equal(delivery.recipient, 'João');
  assert.equal(delivery.number, 'S/N');
  assert.equal(delivery.complement, 'Bloco B, sala 2');
});

test('CEP geral não apaga rua enviada e avisa que deve ser conferida', async () => {
  const original = normalizeExtractedDelivery({ cep: '80010000', address: 'Rua informada', number: '20' });
  const { delivery, warnings } = await completeDeliveryByCep(original, mockViaCep({
    logradouro: '', bairro: '', localidade: 'Curitiba', uf: 'PR',
  }));
  assert.equal(delivery.address, 'Rua informada');
  assert.match(warnings.join(' '), /não identifica uma rua/);
  assert.match(warnings.join(' '), /bairro/);
});

test('CEP inexistente e falha HTTP são avisados sem fingir consulta bem-sucedida', async () => {
  for (const fetcher of [mockViaCep({ erro: true }), mockViaCep({}, 503)]) {
    const original = normalizeExtractedDelivery({ cep: '13321472', address: 'Rua enviada', number: '12' });
    const { delivery, warnings } = await completeDeliveryByCep(original, fetcher);
    assert.equal(delivery.address, 'Rua enviada');
    assert.equal(delivery.city, '');
    assert.match(warnings.join(' '), /CEP/);
    assert.match(warnings.join(' '), /cidade/);
  }
});

test('sem CEP mantém somente dados enviados e pede informação ausente', async () => {
  const original = normalizeExtractedDelivery({ address: 'Rua enviada', number: '12', city: 'Salto' });
  const { delivery, warnings } = await completeDeliveryByCep(original, async () => {
    throw new Error('Não deve consultar ViaCEP sem CEP.');
  });
  assert.equal(delivery.cep, '');
  assert.equal(delivery.address, 'Rua enviada');
  assert.match(warnings.join(' '), /Falta informar: CEP/);
});
