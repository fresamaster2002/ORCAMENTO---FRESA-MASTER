import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProductionShipment as createVerifiedShipment, createShipmentQuoteStore, productionToken, ProductionShipmentError, testProductionConnection, type ProductionShipment, type ShipmentQuoteStore } from './productionShipment.ts';
import { buildShipmentPayload, quoteMelhorEnvioShipment, requestShipmentApi } from './sandboxShipment.ts';

const createProductionShipment = (input: Record<string, unknown>, token: string, store: ShipmentQuoteStore) =>
  createVerifiedShipment(input, token, store, async () => {});

function invoiceKey() {
  const base = '3526105908533000017055002000000039100000039';
  let sum = 0;
  let weight = 2;
  for (let i = 42; i >= 0; i--) { sum += Number(base[i]) * weight; weight = weight === 9 ? 2 : weight + 1; }
  const mod = sum % 11;
  return `${base}${mod < 2 ? 0 : 11 - mod}`;
}
const customer = { name: 'Empresa Teste', document: '59085330000170', ie: '123', address: 'Rua Teste', number: '217', neighborhood: 'Centro', city: 'Salto', state: 'SP', cep: '13329350' };
function quote() {
  return {
    id: 'FM-TEST', status: 'approved', client: { ...customer },
    bling: { nfe: { situacao: 5, serie: 2, chaveAcesso: invoiceKey() } },
    sandboxShipment: { id: 'sandbox-old', paymentStatus: 'paid' },
    items: [{ description: 'Fresa', quantity: 1, unitPrice: 140 }],
    shipping: { originCep: '13329350', destinationCep: '13329350', weightKg: 0.5, packageDimensions: { height: 7, width: 12, length: 17 }, selectedOption: { service: 'SEDEX', price: 12, melhorEnvioServiceId: 2 } },
  };
}
const input = () => ({ quoteId: 'FM-TEST', sender: customer, confirmProduction: true, quotedEnvironment: 'production', expectedPrice: 20, expectedServiceId: 2 });
function memoryStore(source: Record<string, unknown> = quote()) {
  let saved = { quote: structuredClone(source), revision: '' };
  const store: ShipmentQuoteStore = {
    async load() { return structuredClone(saved); },
    async save(record, shipment) {
      if (record.revision !== saved.revision) throw new ProductionShipmentError('Operação concorrente', 409);
      saved = { quote: { ...record.quote, productionShipment: shipment }, revision: `${Number(saved.revision || 0) + 1}` };
      return structuredClone(saved);
    },
  };
  return store;
}

test('token de produção ignora tokens genéricos ou Sandbox', () => {
  assert.equal(productionToken(''), '');
  assert.equal(productionToken(' production-token '), 'production-token');
});

test('CEP recusado identifica origem ou destino e orienta correção sem substituir endereço', async (t) => {
  let field = 'cep_destino';
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    message: 'The given data was invalid.',
    errors: { [field]: ['O campo está inválido.'] },
  }, { status: 422 }));
  await assert.rejects(requestShipmentApi('test', '/me/shipment/calculate', 'POST', {}, 'production'), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Corrigir entrega \/ CEP/);
    assert.match(error.message, /Não use o CEP da origem como destino/);
    assert.match(error.message, /O campo está inválido/);
    return true;
  });
  field = 'cep_origem';
  await assert.rejects(requestShipmentApi('test', '/me/shipment/calculate', 'POST', {}, 'production'), /CEP de origem recusado/);
  field = 'package.weight';
  await assert.rejects(requestShipmentApi('test', '/me/shipment/calculate', 'POST', {}, 'production'), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /CEP de (origem|entrega) recusado/);
    assert.match(error.message, /O campo está inválido/);
    return true;
  });
});

test('conexão real é somente leitura no host oficial', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    assert.equal(String(url), 'https://melhorenvio.com.br/api/v2/me');
    assert.equal(options?.method, 'GET');
    return Response.json({ email: 'test@example.invalid' });
  });
  assert.equal((await testProductionConnection('test-real')).environment, 'production');
  await assert.rejects(testProductionConnection(''), /PRODUCTION_TOKEN/);
});

test('criação real recota, reserva antes de POST cart, persiste ID e não acessa checkout/etiqueta/Sandbox', async (t) => {
  const store = memoryStore();
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    calls.push(String(url));
    assert.ok(String(url).startsWith('https://melhorenvio.com.br/api/v2/'));
    assert.equal(options?.method, 'POST');
    if (String(url).endsWith('/calculate')) return Response.json({ id: 2, price: '20.00', delivery_time: 2 });
    assert.ok(String(url).endsWith('/me/cart'));
    assert.equal((await store.load('FM-TEST')).quote.productionShipment && ((await store.load('FM-TEST')).quote.productionShipment as ProductionShipment).status, 'creating');
    const payload = JSON.parse(String(options?.body));
    assert.equal(payload.options.invoice.key, invoiceKey());
    assert.equal(payload.options.non_commercial, false);
    assert.equal(payload.service, 2);
    return Response.json({ id: 'real-1', protocol: 'PROTO' });
  });
  const result = await createProductionShipment(input(), 'test-real', store);
  assert.equal(result.environment, 'production');
  assert.equal(result.shipment.id, 'real-1');
  assert.equal(result.shipment.status, 'created');
  assert.equal(calls.length, 2);
  const repeated = await createProductionShipment(input(), 'test-real', store);
  assert.equal(repeated.reused, true);
  assert.equal(calls.length, 2);
  assert.equal(((await store.load('FM-TEST')).quote.shipping as ReturnType<typeof quote>['shipping']).selectedOption.price, 12);
});

test('NF-e não autorizada, falta de confirmação/token, serviço e endereço inválidos não criam envio', async (t) => {
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => { count++; throw new Error('Não deveria acessar rede'); });
  await assert.rejects(createProductionShipment({ ...input(), confirmProduction: false }, 'test', memoryStore()), /Confirme/);
  await assert.rejects(createProductionShipment(input(), '', memoryStore()), /PRODUCTION_TOKEN/);
  const source = quote();
  source.bling.nfe.situacao = 1;
  await assert.rejects(createProductionShipment(input(), 'test', memoryStore(source)), /autorizada/);
  source.bling.nfe.situacao = 5;
  source.shipping.selectedOption.service = 'RETIRADA';
  await assert.rejects(createProductionShipment(input(), 'test', memoryStore(source)), /compatível/);
  source.shipping.selectedOption.service = 'SEDEX';
  await assert.rejects(createProductionShipment({ ...input(), sender: { ...customer, number: '' } }, 'test', memoryStore(source)), /number/);
  assert.equal(count, 0);
});

test('preço alterado e cotação Sandbox não autorizam carrinho real', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL) => {
    assert.ok(String(url).endsWith('/calculate'));
    return Response.json({ id: 2, price: 25, delivery_time: 2 });
  });

  const store = memoryStore();
  await assert.rejects(createProductionShipment(input(), 'test', store), /Cote novamente/);
  await assert.rejects(createProductionShipment({ ...input(), expectedPrice: 25, quotedEnvironment: 'sandbox' }, 'test', store), /Cote novamente/);
  assert.equal((await store.load('FM-TEST')).quote.productionShipment, undefined);
});

test('falha na conferência da NF-e impede cotação, reserva e carrinho real', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Não deve acessar o Melhor Envio'); });
  const store = memoryStore();
  await assert.rejects(createVerifiedShipment(input(), 'test', store, async () => { throw new Error('Nota de homologação'); }), /homologação/);
  assert.equal((await store.load('FM-TEST')).quote.productionShipment, undefined);
});

test('falha de reserva impede POST cart e duas solicitações concorrentes criam um único envio', async (t) => {
  let carts = 0;
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL) => {
    if (String(url).endsWith('/calculate')) return Response.json({ id: 2, price: 20, delivery_time: 2 });
    carts++;
    return Response.json({ id: 'real' });
  });
  const failing = memoryStore();
  failing.save = async () => { throw new Error('Banco indisponível'); };
  await assert.rejects(createProductionShipment(input(), 'test', failing), /Banco indisponível/);
  assert.equal(carts, 0);
  const store = memoryStore();
  const results = await Promise.allSettled([createProductionShipment(input(), 'test', store), createProductionShipment(input(), 'test', store)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(carts, 1);
});

test('resposta perdida após POST cart fica incerta e nunca repete automaticamente', async (t) => {
  let carts = 0;
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL) => {
    if (String(url).endsWith('/calculate')) return Response.json({ id: 2, price: 20, delivery_time: 2 });
    carts++;
    throw new Error('Resposta perdida');
  });
  const store = memoryStore();
  await assert.rejects(createProductionShipment(input(), 'test', store), (error: unknown) =>
    error instanceof ProductionShipmentError && error.shipment?.status === 'unknown');
  const recovered = await createProductionShipment(input(), 'test', store);
  assert.equal(recovered.shipment.status, 'unknown');
  assert.equal(carts, 1);
});

test('ID remoto é devolvido mesmo quando persistência final falha', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL) => Response.json(String(url).endsWith('/calculate') ? { id: 2, price: 20, delivery_time: 2 } : { id: 'real-kept' }));
  const store = memoryStore();
  const save = store.save;
  store.save = async (record, shipment) => {
    if (shipment.id) throw new Error('Banco indisponível');
    return save(record, shipment);
  };
  await assert.rejects(createProductionShipment(input(), 'test', store), (error: unknown) =>
    error instanceof ProductionShipmentError && error.shipment?.id === 'real-kept' && /não crie outro envio/.test(error.message));
});

test('recusa explícita do carrinho mostra motivo e permite corrigir sem liberar falhas incertas', async (t) => {
  let carts = 0;
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL) => {
    if (String(url).endsWith('/calculate')) return Response.json({ id: 2, price: 20, delivery_time: 2 });
    carts++;
    return carts === 1 ? Response.json({ message: 'Confira os dados', errors: { to: ['CPF/CNPJ inválido'] } }, { status: 422 }) : Response.json({ id: 'corrected-real' });
  });
  const store = memoryStore();
  await assert.rejects(createProductionShipment(input(), 'test', store), (error: unknown) =>
    error instanceof ProductionShipmentError && error.shipment?.status === 'rejected' && /CPF\/CNPJ inválido/.test(error.message));
  const corrected = await createProductionShipment(input(), 'test', store);
  assert.equal(corrected.shipment.id, 'corrected-real');
  assert.equal(carts, 2);
});

test('entrega separada incompleta não herda número/endereço fiscal para criar envio real', () => {
  const source = quote();
  const shipping = { ...source.shipping, deliveryAddress: { enabled: true, recipient: 'Recebedor', address: 'Rua Entrega', neighborhood: 'Centro', city: 'Salto', state: 'SP' } };
  assert.throws(() => buildShipmentPayload({ quote: { ...source, shipping }, sender: customer, invoiceKey: invoiceKey() }, 'production'), /number/);
});

test('serviço incompatível é recusado e cotação de produção só usa o host real', async (t) => {
  const source = quote();
  source.shipping.selectedOption.melhorEnvioServiceId = 1;
  assert.throws(() => buildShipmentPayload({ quote: source, sender: customer, invoiceKey: invoiceKey() }, 'production'), /transportadora/);
  await assert.rejects(quoteMelhorEnvioShipment({ quote: source, sender: customer }, 'test', 'production'), /transportadora/);
  source.shipping.selectedOption.melhorEnvioServiceId = 2;
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL) => {
    assert.equal(String(url), 'https://melhorenvio.com.br/api/v2/me/shipment/calculate');
    return Response.json({ id: 2, price: 20, delivery_time: 2 });
  });
  const result = await quoteMelhorEnvioShipment({ quote: source, sender: customer }, 'test', 'production');
  assert.equal(result.option.melhorEnvioEnvironment, 'production');
  assert.match(result.option.name, /Produção/);
});

test('registro durável fica separado do orçamento e reserva usa INSERT sem upsert para bloquear concorrência', async (t) => {
  const calls: Array<{ method: string; body: Record<string, unknown>; url: string }> = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    const method = options?.method || 'GET';
    const body = JSON.parse(String(options?.body || '{}'));
    calls.push({ method, body, url: String(url) });
    if (method === 'GET') return Response.json(String(url).includes('ME-PRODUCTION') ? [] : [{ quote: quote(), owner_id: 'owner', updated_at: '2026-10-22T12:00:00Z' }]);
    if (method === 'POST') {
      assert.equal(body.id, 'ME-PRODUCTION:FM-TEST');
      assert.equal(body.owner_id, 'owner');
      assert.ok(body.quote && typeof body.quote === 'object' && !('id' in body.quote));
    }
    return Response.json([{ quote: body.quote, updated_at: body.updated_at }]);
  });
  const store = createShipmentQuoteStore('https://project.example.invalid', 'public', 'Bearer test');
  const saved = await store.load('FM-TEST');
  assert.equal(saved.revision, '');
  const operation: ProductionShipment = { environment: 'production', status: 'creating', requestedAt: new Date().toISOString(), id: null, protocol: null, price: 20 };
  const reserved = await store.save(saved, operation);
  await store.save(reserved, { ...operation, status: 'created', id: 'real' });
  assert.equal(calls[2].method, 'POST');
  assert.equal(calls[3].method, 'PATCH');
  assert.ok(calls[3].url.includes('updated_at=eq.'));
  assert.ok(calls.every((call) => !call.url.includes('on_conflict')));
});
