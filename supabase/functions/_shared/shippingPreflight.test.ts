import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shippingPreflight } from './shippingPreflight.ts';

const input = { destinationCep: '15055-000', originCep: '13329-350', weightKg: 0.5, declaredValue: 390 };

test('verificação de CEP é cotação real, sem NF/produtos obrigatórios, carrinho ou pagamento', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(url), 'https://melhorenvio.com.br/api/v2/me/shipment/calculate');
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.from, { postal_code: '13329350' });
    assert.deepEqual(body.to, { postal_code: '15055000' });
    assert.deepEqual(body.package, { height: 7, width: 12, length: 17, weight: 0.5 });
    assert.equal(body.services, '1,2,3,4,17');
    assert.equal(body.options.insurance_value, 0);
    return Response.json([
      { id: 2, name: 'Sedex', price: '27.07', delivery_time: 2 },
      { id: 1, name: 'PAC', error: 'Serviço indisponível' },
    ]);
  });
  const result = await shippingPreflight(input, 'test-production');
  assert.equal(result.status, 'available');
  assert.equal(result.environment, 'production');
  assert.deepEqual(result.services, [{ id: 2, name: 'Sedex', price: 27.07, deliveryDays: 2 }]);
});

test('ausência de serviço é distinta de CEP recusado e de falha de conexão', async (t) => {
  let response = Response.json([{ id: 2, error: 'Rota indisponível' }]);
  t.mock.method(globalThis, 'fetch', async () => response.clone());
  assert.equal((await shippingPreflight(input, 'test')).status, 'unavailable');
  response = Response.json({ errors: { cep_destino: ['CEP inválido'] } }, { status: 422 });
  await assert.rejects(shippingPreflight(input, 'test'), /CEP de entrega recusado/);
  response = Response.json({ message: 'Unauthorized' }, { status: 401 });
  await assert.rejects(shippingPreflight(input, 'test'), /Unauthorized/);
  response = Response.json({ unexpected: true });
  await assert.rejects(shippingPreflight(input, 'test'), /sem lista de serviços/);
});

test('valida entrada antes de fazer chamada e não aplica estimativas como cotação', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Não deve fazer chamada'); });
  await assert.rejects(shippingPreflight({ ...input, destinationCep: '123' }, 'test'), /8 dígitos/);
  await assert.rejects(shippingPreflight({ ...input, originCep: '1' }, 'test'), /8 dígitos/);
  await assert.rejects(shippingPreflight({ ...input, weightKg: -1 }, 'test'), /peso/);
  await assert.rejects(shippingPreflight(input, ''), /Conecte a conta real/);
});
