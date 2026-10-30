import assert from 'node:assert/strict';
import { test } from 'node:test';

test('rotas de Melhor Envio usam somente a conta OAuth de producao', async (t) => {
  let handler: (request: Request) => Response | Promise<Response> = () => { throw new Error('Handler não registrado'); };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
  const settings: Record<string, string> = {
    SUPABASE_URL: 'https://supabase.test',
    SUPABASE_ANON_KEY: 'public-test',
    SUPABASE_SERVICE_ROLE_KEY: 'service-test',
    MELHOR_ENVIO_CLIENT_ID: 'client-test',
    MELHOR_ENVIO_CLIENT_SECRET: 'secret-test',
    MELHOR_ENVIO_PRODUCTION_TOKEN: 'production-test',
  };
  let oauthRecord: Record<string, unknown> | null = null;
  let aiResult: Record<string, unknown> | null = null;
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
    if (url.includes('/rest/v1/melhor_envio_oauth')) {
      if (init?.method === 'POST') {
        oauthRecord = JSON.parse(String(init.body));
        return new Response(null, { status: 201 });
      }
      return Response.json(oauthRecord ? [oauthRecord] : []);
    }
    if (url === 'https://melhorenvio.com.br/oauth/token') return Response.json({ access_token: 'oauth-access', refresh_token: 'oauth-refresh', expires_in: 3600 });
    if (url.includes('generativelanguage.googleapis.com')) {
      if (!aiResult) throw new Error('IA indisponível neste teste');
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(aiResult) }] } }] });
    }
    if (url.endsWith('/api/v2/me')) return Response.json({ firstname: 'Teste', email: 'fresamaster0@gmail.com' });
    if (url.endsWith('/shipment/calculate')) return Response.json([
      { id: 2, name: 'SEDEX', price: '27.07', delivery_time: 2, company: { name: 'Correios' } },
      { id: 1, name: 'PAC', price: '23.50', delivery_time: 5, company: { name: 'Correios' } },
      { id: 3, name: '.Package', price: '20.24', delivery_time: 4, company: { name: 'Jadlog' } },
    ]);
    throw new Error(`Requisição inesperada: ${url}`);
  });
  await import('./index.ts');
  const post = (path: string, body: object) => handler(new Request(`https://supabase.test/functions/v1/api/shipping/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: ['Bearer', 'public-test'].join(' ') },
    body: JSON.stringify(body),
  }));

  await t.test('OAuth autenticado persiste tokens no servidor e valida callback', async () => {
    const authorization = await post('melhor-envio/authorize', {});
    assert.equal(authorization.status, 200);
    const authUrl = new URL((await authorization.json()).authorizationUrl);
    assert.equal(authUrl.origin, 'https://melhorenvio.com.br');
    assert.equal(authUrl.searchParams.get('redirect_uri'), 'https://jnakhctoigbepxwbaygk.supabase.co/functions/v1/api/shipping/melhor-envio/callback');
    assert.equal(authUrl.searchParams.get('scope'), 'shipping-calculate users-read cart-write');
    const callback = await handler(new Request(`https://supabase.test/functions/v1/api/shipping/melhor-envio/callback?code=one-time&state=${authUrl.searchParams.get('state')}`));
    const page = await callback.text();
    assert.equal(callback.status, 200);
    assert.match(page, /Conexão concluída/);
    assert.equal(page.includes('oauth-access'), false);
    assert.equal(page.includes('oauth-refresh'), false);
    assert.equal(oauthRecord?.access_token, 'oauth-access');
    assert.equal(oauthRecord?.refresh_token, 'oauth-refresh');
    assert.equal(oauthRecord?.pending_state, null);
  });

  await t.test('cotação usa as medidas padrão e sempre chama produção', async () => {
    calls.length = 0;
    const response = await post('calculate', { destinationCep: '13322000', originCep: '13321472', weightKg: 0.5 });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.packageDimensions, { height: 7, width: 12, length: 17 });
    assert.equal(result.options.find((option: { melhorEnvioServiceId: number }) => option.melhorEnvioServiceId === 1)?.service, 'PAC');
    assert.equal(result.options.find((option: { melhorEnvioServiceId: number }) => option.melhorEnvioServiceId === 3)?.service, 'JADLOG_PACKAGE');
    const rate = calls.find((call) => call.url.endsWith('/shipment/calculate'));
    assert.ok(rate);
    assert.equal(rate.url, 'https://melhorenvio.com.br/api/v2/me/shipment/calculate');
    assert.deepEqual(rate.body.package, { height: 7, width: 12, length: 17, weight: 0.5 });
    assert.deepEqual(rate.body.from, { postal_code: '13321472' });
    assert.equal(calls.some((call) => call.url.includes('sandbox.melhorenvio.com.br')), false);
  });

  await t.test('cotação sem origem usa o novo CEP de despacho sem alterar o destino', async () => {
    calls.length = 0;
    const response = await post('calculate', { destinationCep: '80010000', weightKg: 0.5 });
    assert.equal(response.status, 200);
    const rate = calls.find((call) => call.url.endsWith('/shipment/calculate'));
    assert.ok(rate);
    assert.deepEqual(rate.body.from, { postal_code: '13329350' });
    assert.deepEqual(rate.body.to, { postal_code: '80010000' });
  });

  await t.test('status confere a credencial OAuth de producao', async () => {
    calls.length = 0;
    const response = await post('test-production', {});
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.success, true);
    assert.equal(result.environment, 'production');
    assert.equal(result.email, 'fresamaster0@gmail.com');
    assert.equal(calls.find((call) => call.url.endsWith('/api/v2/me'))?.authorization, 'Bearer oauth-access');
  });

  await t.test('pedido interpretado pela IA mantem catalogo Bling e cotacao oficial', async () => {
    settings.GEMINI_API_KEY = 'test-key';
    aiResult = {
      summary: 'Duas fresas com PAC',
      client: { name: 'Cliente teste' },
      items: [{ description: 'Fresa 3 Cortes TCT 6x22mm', quantity: 2 }],
    };
    try {
      const response = await handler(new Request('https://supabase.test/functions/v1/api/quote/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: ['Bearer', 'public-test'].join(' ') },
        body: JSON.stringify({
          text: '2 fresas de 3 cortes TCT por 140 cada, CEP 80010-000, frete PAC',
          blingProducts: [{ id: '12345', nome: 'Fresa 3 Cortes TCT 6x22mm', codigo: 'FM-TCT-6X22', preco: 140, ncm: '8207.70.00' }],
        }),
      }));
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.quote.items[0].blingProductId, '12345');
      assert.equal(result.quote.shipping.selectedOption.service, 'PAC');
      assert.equal(result.quote.shipping.selectedOption.price, 23.50);
      assert.equal(result.quote.shipping.selectedOption.isRealTimeMelhorEnvio, true);
      assert.equal(result.quote.shipping.selectedOption.melhorEnvioEnvironment, 'production');
      assert.equal(result.quote.shipping.options.filter((option: { selected: boolean }) => option.selected).length, 1);
    } finally {
      delete settings.GEMINI_API_KEY;
      aiResult = null;
    }
  });

  await t.test('cotacoes e operacoes Sandbox estao desativadas', async () => {
    calls.length = 0;
    for (const [path, body, expectedStatus] of [
      ['test-melhor-envio', { isSandbox: true }, 410],
      ['quote-sandbox', { sandboxToken: 'must-not-be-used' }, 404],
      ['create-sandbox-shipment', { sandboxToken: 'must-not-be-used' }, 404],
      ['checkout-sandbox', { sandboxToken: 'must-not-be-used' }, 404],
      ['sandbox-shipment-status', { sandboxToken: 'must-not-be-used' }, 404],
    ] as const) {
      const response = await post(path, body);
      assert.equal(response.status, expectedStatus, `${path} deve estar desativada`);
    }
    assert.equal(calls.some((call) => call.url.includes('melhorenvio.com.br')), false);
  });

  await t.test('conta desconectada informa como autorizar sem simular falha de comunicacao', async () => {
    const previousRecord = oauthRecord;
    const previousToken = settings.MELHOR_ENVIO_PRODUCTION_TOKEN;
    oauthRecord = null;
    delete settings.MELHOR_ENVIO_PRODUCTION_TOKEN;
    calls.length = 0;
    try {
      for (const path of ['test-production', 'quote-production']) {
        const response = await post(path, {});
        assert.equal(response.status, 401);
        const result = await response.json();
        assert.equal(result.success, false);
        assert.match(result.error, /Conecte a conta de produção do Melhor Envio/);
      }
      assert.equal(calls.some((call) => call.url.includes('melhorenvio.com.br')), false);
    } finally {
      oauthRecord = previousRecord;
      settings.MELHOR_ENVIO_PRODUCTION_TOKEN = previousToken;
    }
  });

  await t.test('Melhor Envio desconectado nao bloqueia produtos Bling na extracao', async () => {
    const previousRecord = oauthRecord;
    const previousToken = settings.MELHOR_ENVIO_PRODUCTION_TOKEN;
    oauthRecord = null;
    delete settings.MELHOR_ENVIO_PRODUCTION_TOKEN;
    try {
      for (const cep of ['', '13321472']) {
        const response = await handler(new Request('https://supabase.test/functions/v1/api/quote/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: ['Bearer', 'public-test'].join(' ') },
          body: JSON.stringify({
            text: '2 fresas de 3 cortes TCT por 140 cada',
            currentQuote: { client: { cep } },
            blingCatalogAvailable: true,
            blingProducts: [{ id: '12345', nome: 'Fresa 3 Cortes TCT 6x22mm', codigo: 'FM-TCT-6X22', preco: 140, unidade: 'UN', ncm: '8207.70.00' }],
          }),
        }));
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.success, true);
        assert.equal(result.quote.items[0].sku, 'FM-TCT-6X22');
        assert.equal(result.quote.items[0].ncm, '8207.70.10');
        assert.equal(result.quote.items[0].quantity, 2);
        assert.equal(result.quote.items[0].unitPrice, 140);
        assert.equal(result.quote.shipping.options.some((option: { isRealTimeMelhorEnvio?: boolean }) => option.isRealTimeMelhorEnvio), false);
      }
    } finally {
      oauthRecord = previousRecord;
      settings.MELHOR_ENVIO_PRODUCTION_TOKEN = previousToken;
    }
  });
});
