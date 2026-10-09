import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSandboxShipment, createSandboxShipment } from './sandboxShipment.ts';
import { DEFAULT_PACKAGE_DIMENSIONS } from './shippingDefaults.ts';

function invoiceKey(series = '002') {
  const base = `3526105908533000017055${series}000000039100000039`;
  let sum = 0;
  let weight = 2;
  for (let i = 42; i >= 0; i--) { sum += Number(base[i]) * weight; weight = weight === 9 ? 2 : weight + 1; }
  const mod = sum % 11;
  return `${base}${mod < 2 ? 0 : 11 - mod}`;
}
function input() {
  const client = { name: 'Empresa Teste', document: '59085330000170', address: 'Rua Teste', number: '1', neighborhood: 'Centro', city: 'Salto', state: 'SP', cep: '13321472', ie: '123456789' };
  return {
    sender: { ...client }, invoiceKey: invoiceKey(),
    quote: { id: 'TESTE-HOMOLOGACAO', status: 'approved', client, items: [{ description: 'Fresa de topo', quantity: 1, unitPrice: 170 }],
      shipping: { originCep: '13321472', destinationCep: '13321472', weightKg: 0.5, packageDimensions: { ...DEFAULT_PACKAGE_DIMENSIONS },
        selectedOption: { service: 'SEDEX', melhorEnvioServiceId: 2, isRealTimeMelhorEnvio: true } } },
  };
}
test('monta contrato de carrinho com CNPJ, série 2, produtos e volume cotado', () => {
  const payload = buildSandboxShipment(input());
  assert.ok('company_document' in payload.from);
  assert.equal(payload.from.company_document, '59085330000170');
  assert.equal('document' in payload.from, false);
  assert.equal(payload.options.invoice.key.length, 44);
  assert.deepEqual(payload.volumes, [{ height: 7, width: 12, length: 17, weight: 0.5 }]);
  assert.deepEqual(payload.products, [{ name: 'Fresa de topo', quantity: 1, unitary_value: 170 }]);
});
test('preserva dimensões personalizadas no carrinho', () => {
  const data = input();
  data.quote.shipping.packageDimensions = { height: 12, width: 20, length: 30 };
  assert.deepEqual(buildSandboxShipment(data).volumes, [{ height: 12, width: 20, length: 30, weight: 0.5 }]);
});
test('recusa série diferente, DV inválido, outro emissor, IE ausente e rota divergente', () => {
  const d = input();
  assert.throws(() => buildSandboxShipment({ ...d, invoiceKey: invoiceKey('001') }), /série 2/);
  assert.throws(() => buildSandboxShipment({ ...d, invoiceKey: `${d.invoiceKey.slice(0, 43)}${(Number(d.invoiceKey[43]) + 1) % 10}` }), /verificador/);
  assert.throws(() => buildSandboxShipment({ ...d, sender: { ...d.sender, document: '00000000000191' } }), /emissor/);
  assert.throws(() => buildSandboxShipment({ ...d, sender: { ...d.sender, ie: '' } }), /IE/);
  assert.throws(() => buildSandboxShipment({ ...d, sender: { ...d.sender, cep: '13329350' } }), /origem/);
  assert.throws(() => buildSandboxShipment({ ...d, quote: { ...d.quote, status: 'draft' } }), /Aprove/);
  assert.throws(() => buildSandboxShipment({ ...d, quote: { ...d.quote, sandboxShipment: { id: 'exists' } } }), /já possui/);
});
test('endereço de entrega separado conserva documento fiscal e usa CEP de destino', () => {
  const d = input();
  const payload = buildSandboxShipment({ ...d, quote: { ...d.quote, shipping: { ...d.quote.shipping, destinationCep: '80010000',
    deliveryAddress: { enabled: true, recipient: 'Recebedor', address: 'Rua Entrega', number: '8', neighborhood: 'Centro', city: 'Curitiba', state: 'PR' } } } });
  assert.equal(payload.to.name, 'Recebedor');
  assert.ok('company_document' in payload.to);
  assert.equal(payload.to.company_document, d.quote.client.document);
  assert.equal(payload.to.postal_code, '80010000');
});
test('cria somente carrinho Sandbox depois de recotar e nunca chama compra/pagamento', async (t) => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(options?.body)) });
    return String(url).endsWith('/calculate') ? Response.json([{ id: 2 }]) : Response.json({ id: 'sandbox-id', protocol: 'test-protocol' });
  });
  assert.equal((await createSandboxShipment(input(), 'sandbox-test-token')).shipmentId, 'sandbox-id');
  assert.deepEqual(calls.map((c) => c.url), ['https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate', 'https://sandbox.melhorenvio.com.br/api/v2/me/cart']);
});
test('token ausente, erro upstream ou serviço indisponível impedem criação', async (t) => {
  await assert.rejects(createSandboxShipment(input(), ''), /SANDBOX_TOKEN/);
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => { count++; return Response.json([{ id: 2, error: 'Unavailable' }]); });
  await assert.rejects(createSandboxShipment(input(), 'sandbox-test'), /não está disponível/);
  assert.equal(count, 1);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: 'Cadastro inválido', errors: { from: ['IE incorreta'] } }, { status: 422 }));
  await assert.rejects(createSandboxShipment(input(), 'sandbox-test'), /IE incorreta/);
});
