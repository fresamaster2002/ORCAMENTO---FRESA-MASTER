import assert from 'node:assert/strict';
import { test } from 'node:test';

test('rotas Bling aplicam pagamento/NCM e não enviam notas inválidas', async (t) => {
  let handler: (request: Request) => Response | Promise<Response> = () => { throw new Error('Handler não registrado'); };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
  const settings: Record<string, string> = { SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'public-test', BLING_API_TOKEN: 'bling-test' };
  Object.defineProperty(globalThis, 'Deno', { configurable: true, value: {
    env: { get: (name: string) => settings[name] },
    serve: (route: typeof handler) => { handler = route; },
  } });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'Deno', descriptor);
    else Reflect.deleteProperty(globalThis, 'Deno');
  });
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method || 'GET', body: init?.body ? JSON.parse(String(init.body)) : {} });
    if (url.endsWith('/auth/v1/user')) return Response.json({ email: 'fresamaster0@gmail.com', email_confirmed_at: '2026-01-01' });
    if (url.includes('/formas-pagamentos?')) return Response.json({ data: [{ id: 17, descricao: 'Pix', situacao: 1, finalidade: 2, tipoPagamento: 17 }] });
    if (url.includes('/contatos?')) return Response.json({ data: [{ id: 11 }] });
    if (url.endsWith('/pedidos/vendas') && init?.method === 'POST') return Response.json({ data: { id: 22, numero: 5 } }, { status: 201 });
    if (url.endsWith('/nfe/33')) return Response.json({ data: { id: 33, situacao: 1, itens: [{ descricao: 'Fresa', classificacaoFiscal: '0000.00.00' }], parcelas: [{ formaPagamento: { id: 17 } }] } });
    if (url.endsWith('/produtos/123')) return Response.json({ data: { id: 123, nome: 'Fresa de topo', codigo: 'FM-TCT-6X22', tributacao: { ncm: '8207.70.10' } } });
    if (url.endsWith('/produtos/456')) return Response.json({ data: { id: 456, nome: 'Fresa sem SKU', codigo: '', tributacao: { ncm: '8207.70.10' } } });
    if (url.includes('/produtos?')) return Response.json({ data: [] });
    throw new Error(`Requisição inesperada: ${url}`);
  });
  await import('./index.ts');
  const post = (path: string, body: object, login = true) => handler(new Request(`https://supabase.test/functions/v1/api/bling/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(login ? { Authorization: 'Bearer test-session' } : {}) },
    body: JSON.stringify(body),
  }));
  const quote = {
    id: 'TESTE', project: { date: '2026-10-07' }, client: { name: 'Empresa Teste', document: '59085330000170', ie: '600320622110', address: 'Rua Presidente Geisel', number: '62', neighborhood: 'Jardim Santo Antonio', city: 'Salto', state: 'SP', cep: '13321472' },
    items: [{ sku: '123', description: 'Fresa', unit: 'UN', ncm: '8207.70.10', quantity: 1, unitPrice: 170 }],
    financials: { shippingAmount: 27.07, paymentMethod: 'Pix' }, shipping: {},
  };
  await t.test('exige autenticação nas rotas fiscais', async () => {
    assert.equal((await post('nfe/send', { nfeId: 33 }, false)).status, 401);
  });
  await t.test('consulta o NCM no detalhe do produto sem depender da listagem resumida', async () => {
    const response = await handler(new Request('https://supabase.test/functions/v1/api/bling/products/123', { headers: { Authorization: 'Bearer test-session' } }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).product.tributacao.ncm, '8207.70.10');
  });
  await t.test('não cadastra produto com NCM genérico', async () => {
    calls.length = 0;
    const response = await handler(new Request('https://supabase.test/functions/v1/api/bling/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-session' },
      body: JSON.stringify({ product: { name: 'Fresa', sku: 'TESTE', price: 170, ncm: '8207.70.00' } }),
    }));
    assert.equal(response.status, 400);
    assert.equal(calls.some((call) => call.url.includes('api.bling.com.br')), false);
  });
  await t.test('NCM genérico é substituído pelo cadastro confirmado antes da venda', async () => {
    calls.length = 0;
    const r = await post('create-order', { quote: { ...quote, items: [{ ...quote.items[0], ncm: '8207.70.00' }] } });
    assert.equal(r.status, 200);
    assert.ok(calls.some((call) => call.url.endsWith('/produtos/123')));
  });
  await t.test('NCM inválido em item avulso não cria contato nem venda', async () => {
    calls.length = 0;
    const r = await post('create-order', { quote: { ...quote, items: [{ ...quote.items[0], sku: '', ncm: '8207.70.00' }] } });
    assert.equal(r.status, 400);
    assert.equal(calls.some((call) => call.method === 'POST' && call.url.includes('api.bling.com.br')), false);
  });
  await t.test('consulta e venda sem SKU usam ID e NCM do cadastro, sem código inventado', async () => {
    calls.length = 0;
    const items = [{ ...quote.items[0], sku: '', blingProductId: '456', ncm: '' }];
    const resolved = await (await post('resolve-products', { items })).json();
    assert.equal(resolved.items[0].ncm, '8207.70.10');
    assert.equal(calls.some((call) => call.method === 'POST' && call.url.includes('api.bling.com.br')), false);
    const response = await post('create-order', { quote: { ...quote, items } });
    assert.equal(response.status, 200);
    const payload = calls.find((call) => call.url.endsWith('/pedidos/vendas'))!.body;
    assert.deepEqual((payload.itens as Record<string, unknown>[])[0].produto, { id: 456 });
    assert.equal('codigo' in (payload.itens as Record<string, unknown>[])[0], false);
  });
  await t.test('pedido e exportação usam parcelas oficiais, sem pagamento ignorado', async () => {
    const r = await post('create-order', { quote });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).blingOrderId, 22);
    const payload = calls.find((call) => call.url.endsWith('/pedidos/vendas'))!.body;
    assert.equal('pagamento' in payload, false);
    assert.deepEqual(payload.parcelas, [{ dataVencimento: '2026-10-07', valor: 197.07, formaPagamento: { id: 17 } }]);
    const exported = await (await post('generate-payload', { quote })).json();
    assert.deepEqual(exported.blingJson.parcelas, payload.parcelas);
    assert.equal('pagamento' in exported.blingJson, false);
    assert.match(exported.blingXml, /8207.70.10/);
  });
  await t.test('pendências são retornadas juntas e pedido vinculado não é duplicado', async () => {
    calls.length = 0;
    const invalid = await post('create-order', { quote: { ...quote, client: {}, items: [{ description: 'Fresa', ncm: '8207.70.00' }] } });
    assert.equal(invalid.status, 400);
    const data = await invalid.json();
    assert.ok(data.issues.length > 3);
    const existing = await post('create-order', { quote: { ...quote, bling: { orderId: 22 } } });
    assert.equal(existing.status, 409);
    assert.equal(calls.some((call) => call.url.includes('api.bling.com.br')), false);
  });
  await t.test('envio direto também bloqueia NCM zerado', async () => {
    calls.length = 0;
    const r = await post('nfe/send', { nfeId: 33, paymentMethod: 'Pix' });
    assert.equal(r.status, 409);
    const data = await r.json();
    assert.equal(data.nfeId, 33);
    assert.equal(data.readyToSend, false);
    assert.equal(calls.some((call) => call.url.endsWith('/enviar')), false);
  });
});
