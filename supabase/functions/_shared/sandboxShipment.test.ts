import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSandboxShipment, checkoutSandboxShipment, createSandboxShipment, getSandboxShipmentStatus, quoteSandboxShipment } from './sandboxShipment.ts';
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
test('destinatário CPF usa document, nunca company_document do remetente', () => {
  const d = input();
  const payload = buildSandboxShipment({ ...d, quote: { ...d.quote, client: { ...d.quote.client, document: '12345678909', ie: '' } } });
  assert.ok('document' in payload.to);
  assert.equal(payload.to.document, '12345678909');
  assert.equal('company_document' in payload.to, false);
  assert.equal(payload.to.state_register, '');
});
test('cota Sedex somente no Sandbox pela origem do remetente, sem exigir NF-e nem criar carrinho', async (t) => {
  const d = input();
  d.quote.shipping.originCep = '13329350';
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    assert.equal(String(url), 'https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate');
    const body = JSON.parse(String(options?.body));
    assert.equal(body.services, '2');
    assert.equal(body.from.postal_code, d.sender.cep);
    assert.equal(body.options.insurance_value, 0);
    return Response.json({ id: 2, price: '13.38', delivery_time: 2 });
  });
  const result = await quoteSandboxShipment({ quote: d.quote, sender: d.sender }, 'sandbox-test');
  assert.equal(result.originCep, d.sender.cep);
  assert.equal(result.option.price, 13.38);
  assert.equal(result.option.isRealTimeMelhorEnvio, true);
  assert.equal(result.environment, 'sandbox');
});
test('cota no Sandbox a modalidade selecionada quando a opção ainda não tem ID oficial', async (t) => {
  const rates = [
    { id: 2, name: 'SEDEX', price: '18.50', delivery_time: 2 },
    { id: 1, name: 'PAC', price: '12.50', delivery_time: 5 },
    { id: 3, name: 'Jadlog.Package', price: '10.50', delivery_time: 4 },
  ];
  for (const expected of [
    { service: 'SEDEX', id: 2, price: 18.5 },
    { service: 'PAC', id: 1, price: 12.5 },
    { service: 'JADLOG_PACKAGE', id: 3, price: 10.5 },
  ]) {
    await t.test(expected.service, async (subtest) => {
      const d = input();
      const quote = {
        ...d.quote,
        shipping: { ...d.quote.shipping, selectedOption: { service: expected.service } },
      };
      subtest.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL, options?: RequestInit) => {
        assert.equal(JSON.parse(String(options?.body)).services, '1,2,3,4,17');
        return Response.json(rates);
      });
      const result = await quoteSandboxShipment({ quote, sender: d.sender }, 'sandbox-test');
      assert.equal(result.option.service, expected.service);
      assert.equal(result.option.melhorEnvioServiceId, expected.id);
      assert.equal(result.option.price, expected.price);
      subtest.mock.restoreAll();
    });
  }
});
test('cotação Sandbox rejeita token ausente, pacote inválido e preço inválido sem estimativas', async (t) => {
  await assert.rejects(quoteSandboxShipment(input(), ''), /SANDBOX_TOKEN/);
  const d = input();
  await assert.rejects(quoteSandboxShipment({ ...d, sender: { ...d.sender, cep: '' } }, 'sandbox-test'), /CEPs/);
  await assert.rejects(quoteSandboxShipment({ ...d, quote: { ...d.quote, shipping: { ...d.quote.shipping, weightKg: 0 } } }, 'sandbox-test'), /peso/);
  for (const rate of [{ id: 2, price: '0', delivery_time: 2 }, { id: 2, error: 'Rota indisponível' }, { id: 1, price: '10', delivery_time: 2 }]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(rate));
    await assert.rejects(quoteSandboxShipment(d, 'sandbox-test'), /inválido|indisponível/);
  }
});
test('preserva dimensões personalizadas no carrinho', () => {
  const data = input();
  data.quote.shipping.packageDimensions = { height: 12, width: 20, length: 30 };
  assert.deepEqual(buildSandboxShipment(data).volumes, [{ height: 12, width: 20, length: 30, weight: 0.5 }]);
});
test('aceita Sedex, PAC ou Jadlog selecionados mesmo sem ID prévio nem cotação online', () => {
  const d = input();
  const sedex = buildSandboxShipment({
    ...d,
    quote: { ...d.quote, shipping: { ...d.quote.shipping, selectedOption: { service: 'SEDEX', price: 25 } } },
  });
  assert.equal(sedex.service, 2);

  const pac = buildSandboxShipment({
    ...d,
    quote: { ...d.quote, shipping: { ...d.quote.shipping, selectedOption: { service: 'PAC', price: 18 } } },
  });
  assert.equal(pac.service, 1);

  const jadlog = buildSandboxShipment({
    ...d,
    quote: { ...d.quote, shipping: { ...d.quote.shipping, selectedOption: { service: 'JADLOG_PACKAGE', price: 15 } } },
  });
  assert.equal(jadlog.service, 3);
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
test('aceita cotação de um único serviço retornada como objeto', async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    calls.push(String(url));
    if (String(url).endsWith('/calculate')) {
      assert.equal(JSON.parse(String(options?.body)).services, '2');
      return Response.json({ id: 2, name: 'SEDEX', price: '13.38' });
    }
    return Response.json({ id: 'single-rate-cart', protocol: 'single-rate-protocol' });
  });
  const result = await createSandboxShipment(input(), 'sandbox-test-token');
  assert.equal(result.shipmentId, 'single-rate-cart');
  assert.equal(result.environment, 'sandbox');
  assert.deepEqual(calls, ['https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate', 'https://sandbox.melhorenvio.com.br/api/v2/me/cart']);
});
test('cotação única com erro, outro serviço ou resposta inválida não cria carrinho', async (t) => {
  for (const rate of [{ id: 2, error: 'Transportadora não atende este trecho.' }, { id: 3 }, null, {}]) {
    let count = 0;
    t.mock.method(globalThis, 'fetch', async () => { count++; return Response.json(rate); });
    await assert.rejects(createSandboxShipment(input(), 'sandbox-test-token'), rate?.error ? /Transportadora não atende este trecho/ : /não está disponível/);
    assert.equal(count, 1);
  }
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
test('apresenta erros aninhados ou em lista do carrinho sem chamar checkout', async (t) => {
  for (const error of [{ error: { from: { phone: ['Telefone inválido'] } } }, [{ message: 'Telefone inválido' }]]) {
    const calls: string[] = [];
    t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return String(url).endsWith('/calculate') ? Response.json({ id: 2 }) : Response.json(error, { status: 422 });
    });
    await assert.rejects(createSandboxShipment(input(), 'sandbox-test'), /Telefone inválido/);
    assert.deepEqual(calls, ['https://sandbox.melhorenvio.com.br/api/v2/me/shipment/calculate', 'https://sandbox.melhorenvio.com.br/api/v2/me/cart']);
  }
});

test('checkout exige confirmação e não consulta nem chama endpoint sem ela', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({}); });
  await assert.rejects(checkoutSandboxShipment({ shipmentId: 'sandbox-id', confirmSandbox: false }, 'sandbox-token'), /Confirme que deseja/);
  assert.equal(calls, 0);
});

test('checkout só envia um envio pendente ao host Sandbox e confirma o estado relendo o carrinho', async (t) => {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    const address = String(url);
    const method = options?.method || 'GET';
    const body = options?.body ? JSON.parse(String(options.body)) : undefined;
    calls.push({ url: address, method, body });
    if (address.endsWith('/me/shipment/checkout')) return Response.json({ purchase: { id: 'purchase-123', status: 'pending' } });
    if (calls.filter((call) => call.method === 'GET').length === 1) return Response.json({ id: 'sandbox-id', status: 'pending', price: '13.38' });
    return Response.json({ id: 'sandbox-id', status: 'released', paid_at: '2026-10-30T15:50:00Z' });
  });

  const result = await checkoutSandboxShipment({ shipmentId: 'sandbox-id', confirmSandbox: true }, 'sandbox-token');
  assert.equal(result.environment, 'sandbox');
  assert.equal(result.status, 'paid');
  assert.equal(result.paidAt, '2026-10-30T15:50:00Z');
  assert.deepEqual(calls.map((call) => [call.url, call.method]), [
    ['https://sandbox.melhorenvio.com.br/api/v2/me/cart/sandbox-id', 'GET'],
    ['https://sandbox.melhorenvio.com.br/api/v2/me/shipment/checkout', 'POST'],
    ['https://sandbox.melhorenvio.com.br/api/v2/me/cart/sandbox-id', 'GET'],
  ]);
  assert.deepEqual(calls[1].body, { orders: ['sandbox-id'] });
});

test('checkout reconhece envio já pago e bloqueia estados não pendentes sem repetir a cobrança', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: RequestInfo | URL) => {
    calls++;
    return calls === 1
      ? Response.json({ id: 'sandbox-id', status: 'released', paid_at: '2026-10-30T15:50:00Z' })
      : Response.json({ id: 'sandbox-id', status: 'processing' });
  });
  const result = await checkoutSandboxShipment({ shipmentId: 'sandbox-id', confirmSandbox: true }, 'sandbox-token');
  assert.equal(result.status, 'paid');
  assert.equal(calls, 1);

  await assert.rejects(checkoutSandboxShipment({ shipmentId: 'sandbox-id', confirmSandbox: true }, 'sandbox-token'), /não está pendente/);
  assert.equal(calls, 2);
});

test('consulta somente leitura valida a identidade e o status do envio do carrinho', async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    calls.push(`${String(url)}:${options?.method || 'GET'}`);
    return Response.json({ id: 'sandbox-id', status: 'pending', price: '13.38' });
  });
  const result = await getSandboxShipmentStatus({ shipmentId: 'sandbox-id' }, 'sandbox-token');
  assert.equal(result.status, 'pending');
  assert.deepEqual(calls, ['https://sandbox.melhorenvio.com.br/api/v2/me/cart/sandbox-id:GET']);
  await assert.rejects(getSandboxShipmentStatus({ shipmentId: 'wrong-id' }, 'sandbox-token'), /não retornou o envio solicitado/);
});
