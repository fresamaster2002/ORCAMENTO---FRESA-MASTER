import assert from 'node:assert/strict';
import { test } from 'node:test';

test('rota de entrega do Supabase valida entrada e combina IA com ViaCEP', async (t) => {
  let handler: (request: Request) => Response | Promise<Response> = () => {
    throw new Error('A rota não foi registrada.');
  };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
  const settings: Record<string, string> = {
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_ANON_KEY: 'test-public-key',
    GEMINI_API_KEY: 'test-api-key',
  };
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: {
      env: { get: (name: string) => settings[name] },
      serve: (route: typeof handler) => { handler = route; },
    },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'Deno', descriptor);
    else Reflect.deleteProperty(globalThis, 'Deno');
  });
  let aiStatus = 200;
  let aiResult: object = { cep: '13321472', recipient: 'João', number: '250', complement: 'Galpão 2' };
  const requests: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL) => {
    const url = input.toString();
    requests.push(url);
    if (url.endsWith('/auth/v1/user')) {
      return Response.json({ email: 'fresamaster0@gmail.com', email_confirmed_at: '2026-01-01' });
    }
    if (url.startsWith('https://generativelanguage.googleapis.com/')) {
      return Response.json({
        candidates: [{ content: { parts: [{ text: JSON.stringify(aiResult) }] } }],
      }, { status: aiStatus });
    }
    if (url === 'https://viacep.com.br/ws/13321472/json/') {
      return Response.json({ logradouro: 'Rua de Teste', bairro: 'Centro', localidade: 'Salto', uf: 'SP' });
    }
    throw new Error(`Consulta inesperada: ${url}`);
  });
  await import('./index.ts');

  const request = (text: string, authenticated = true) => handler(new Request(
    'https://supabase.test/functions/v1/api/shipping/extract-delivery',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer test-session' } : {}) },
      body: JSON.stringify({
        text,
        currentClient: { address: 'Endereço fiscal que não deve ser usado', number: '999' },
      }),
    },
  ));

  await t.test('exige login', async () => {
    assert.equal((await request('CEP 13321-472', false)).status, 401);
  });
  await t.test('rejeita mensagem vazia e acima do limite sem consultar IA', async () => {
    requests.length = 0;
    assert.equal((await request('   ')).status, 400);
    assert.equal((await request('x'.repeat(5001))).status, 413);
    assert.equal(requests.some((url) => url.includes('generativelanguage')), false);
  });
  await t.test('retorna endereço de entrega completo sem dados fiscais', async () => {
    const response = await request('Entregar para João, CEP 13321-472, número 250, galpão 2');
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.success, true);
    assert.deepEqual(data.delivery, {
      cep: '13321-472', recipient: 'João', address: 'Rua de Teste', number: '250',
      complement: 'Galpão 2', neighborhood: 'Centro', city: 'Salto', state: 'SP',
    });
    assert.deepEqual(data.warnings, []);
    assert.equal('client' in data, false);
  });
  await t.test('CEP sozinho não herda número do cadastro anterior', async () => {
    aiResult = { cep: '13321472' };
    const data = await (await request('CEP 13321-472')).json();
    assert.equal(data.delivery.number, '');
    assert.match(data.warnings.join(' '), /número/);
  });
  await t.test('indisponibilidade da IA retorna erro explícito', async () => {
    aiStatus = 503;
    const response = await request('CEP 13321-472');
    assert.equal(response.status, 503);
    assert.ok((await response.json()).error);
  });
});
