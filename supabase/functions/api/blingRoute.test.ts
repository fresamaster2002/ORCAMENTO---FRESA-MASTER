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
    throw new Error(`Requisição inesperada: ${url}`);
  });
  await import('./index.ts');
  const post = (path: string, body: object, login = true) => handler(new Request(`https://supabase.test/functions/v1/api/bling/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(login ? { Authorization: 'Bearer test-session' } : {}) },
    body: JSON.stringify(body),
  }));
  const quote = {
    id: 'TESTE', project: { date: '2026-10-07' }, client: { name: 'Empresa Teste', document: '00000000000191' },
    items: [{ sku: '123', description: 'Fresa', unit: 'UN', ncm: '8207.70.10', quantity: 1, unitPrice: 170 }],
    financials: { shippingAmount: 27.07, paymentMethod: 'Pix' }, shipping: {},
  };
  await t.test('exige autenticação nas rotas fiscais', async () => {
    assert.equal((await post('nfe/send', { nfeId: 33 }, false)).status, 401);
  });
  await t.test('NCM genérico não cria contato nem venda', async () => {
    calls.length = 0;
    const r = await post('create-order', { quote: { ...quote, items: [{ ...quote.items[0], ncm: '8207.70.00' }] } });
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /contador/);
    assert.equal(calls.some((call) => call.url.includes('api.bling.com.br')), false);
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
