import assert from 'node:assert/strict';
import { test } from 'node:test';

test('rotas de frete preservam medidas e isolam credenciais Sandbox', async (t) => {
  let handler: (request: Request) => Response | Promise<Response> = () => { throw new Error('Handler não registrado'); };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
  const settings: Record<string, string> = {
    SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'public-test',
    MELHOR_ENVIO_TOKEN: 'production-test', MELHOR_ENVIO_SANDBOX_TOKEN: 'sandbox-test',
  };
  Object.defineProperty(globalThis, 'Deno', { configurable: true, value: {
    env: { get: (name: string) => settings[name] },
    serve: (route: typeof handler) => { handler = route; },
  } });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'Deno', descriptor);
    else Reflect.deleteProperty(globalThis, 'Deno');
  });
  const calls: { url: string; authorization: string | null; body: Record<string, unknown> }[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, authorization: new Headers(init?.headers).get('Authorization'), body: init?.body ? JSON.parse(String(init.body)) : {} });
    if (url.endsWith('/auth/v1/user')) return Response.json({ email: 'fresamaster0@gmail.com', email_confirmed_at: '2026-01-01' });
    if (url.includes('viacep.com.br')) return Response.json({ localidade: 'Salto', uf: 'SP' });
    if (url.endsWith('/api/v2/me')) return Response.json({ firstname: 'Teste' });
    if (url.endsWith('/shipment/calculate')) return Response.json([{ id: 2, name: 'SEDEX', price: '27.07', delivery_time: 2, company: { name: 'Correios' } }]);
    throw new Error(`Requisição inesperada: ${url}`);
  });
  await import('./index.ts');
  const post = (path: string, body: object) => handler(new Request(`https://supabase.test/functions/v1/api/shipping/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-session' }, body: JSON.stringify(body),
  }));
  await t.test('cotação usa padrão exato 7 × 12 × 17 e mantém medidas manuais', async () => {
    for (const dimensions of [undefined, { height: 8, width: 16, length: 24 }]) {
      calls.length = 0;
      const r = await post('calculate', { destinationCep: '13322000', originCep: '13321472', weightKg: 0.5, packageDimensions: dimensions });
      assert.equal(r.status, 200);
      const expected = dimensions || { height: 7, width: 12, length: 17 };
      assert.deepEqual((await r.json()).packageDimensions, expected);
      const rate = calls.find((call) => call.url.endsWith('/shipment/calculate'));
      assert.ok(rate);
      assert.deepEqual(rate.body.package, { ...expected, weight: 0.5 });
    }
  });
  await t.test('verifica Sandbox com token separado sem fallback para produção', async () => {
    calls.length = 0;
    const response = await post('test-melhor-envio', { isSandbox: true });
    assert.equal((await response.json()).connected, true);
    const request = calls.find((call) => call.url.endsWith('/api/v2/me'));
    assert.equal(request?.url, 'https://sandbox.melhorenvio.com.br/api/v2/me');
    assert.equal(request?.authorization, 'Bearer sandbox-test');
    delete settings.MELHOR_ENVIO_SANDBOX_TOKEN;
    calls.length = 0;
    assert.equal((await post('test-melhor-envio', { isSandbox: true })).status, 400);
    assert.equal(calls.some((call) => call.url.includes('melhorenvio.com.br')), false);
  });
});
