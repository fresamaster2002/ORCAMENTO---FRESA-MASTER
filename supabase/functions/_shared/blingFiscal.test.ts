import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BlingFiscalError, buildSaleItems, buildSalePayment, handleBlingNfe, resolvePayment, validateFiscalItems } from './blingFiscal.ts';

const item = { sku: '123', description: 'Fresa de topo teste', quantity: 2, unitPrice: 85, ncm: '8207.70.10' };
const quote = { items: [item], project: { date: '2026-10-07' }, financials: { paymentMethod: 'Pix', shippingAmount: 27.07, discountAmount: 10 } };
const pix = { id: 17, descricao: 'Pix', tipoPagamento: 17, situacao: 1, finalidade: 2 };

test('bloqueia NCM ausente, genérico ou zerado sem inferir classificação', () => {
  for (const ncm of ['', '0000.00.00', '8207.70.00']) {
    assert.throws(() => validateFiscalItems([{ ...item, ncm }]), BlingFiscalError);
  }
  assert.doesNotThrow(() => validateFiscalItems([item]));
  assert.throws(() => validateFiscalItems([{ ...item, quantity: 0 }]), BlingFiscalError);
  assert.throws(() => validateFiscalItems([]), BlingFiscalError);
});

test('Pix vai em parcelas por ID, com frete/desconto e valor exato', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: [pix] }));
  const payload = await buildSalePayment('test-token', quote);
  assert.deepEqual(payload.parcelas, [{ dataVencimento: '2026-10-07', valor: 187.07, formaPagamento: { id: 17 } }]);
  assert.deepEqual(payload.desconto, { valor: 10, unidade: 'REAL' });
  assert.equal('pagamento' in payload, false);
  assert.equal('ncm' in buildSaleItems([item])[0], false);
  assert.deepEqual(buildSaleItems([item])[0].produto, { id: 123 });
});

test('pagamento ausente, ambíguo ou Pix com tipo dinheiro não usa fallback', async (t) => {
  let entries = [pix];
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: entries }));
  entries = [];
  await assert.rejects(resolvePayment('test-token', 'Pix'), /única/);
  entries = [pix, { ...pix, id: 18 }];
  await assert.rejects(resolvePayment('test-token', 'Pix'), /única/);
  entries = [{ ...pix, tipoPagamento: 1 }];
  await assert.rejects(resolvePayment('test-token', 'Pix'), /tipo fiscal/);
  entries = [{ ...pix, tipoPagamento: 20 }];
  assert.equal(await resolvePayment('test-token', 'Pix'), 17);
});

test('falta de permissão para formas de pagamento é exibida explicitamente', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'Permissão negada' } }, { status: 403 }));
  await assert.rejects(buildSalePayment('test-token', quote), (error: BlingFiscalError) => error.status === 403 && error.message === 'Permissão negada');
});

test('NCM inválido impede criação e geração antes de qualquer chamada ao Bling', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Não deve chamar a API'); });
  const invalid = { ...quote, items: [{ ...item, ncm: '8207.70.00' }] };
  await assert.rejects(buildSalePayment('test-token', invalid), /NCM/);
  const result = await handleBlingNfe('generate', { orderId: 1, quote: invalid }, 'test-token');
  assert.equal(result.status, 400);
  assert.equal(result.body.success, false);
});

test('NF-e usa idNotaFiscal, grava classificacaoFiscal, conserva pagamento e confere persistência', async (t) => {
  const calls: { path: string; method: string; body?: Record<string, unknown> }[] = [];
  let draft = {
    id: 99, numero: '001', serie: 2, situacao: 1, valorFrete: 27.07, valorNota: 187.07,
    contato: { endereco: { uf: 'SP' } },
    itens: [{ codigo: '123', descricao: item.description, quantidade: 2, valor: 85, classificacaoFiscal: '0000.00.00', cfop: '6102' }],
    parcelas: [{ data: '2026-10-07', valor: 187.07, formaPagamento: { id: 1 } }],
  };
  let linked = false;
  let putStatus = 200;
  let persist = true;
  let generationResponse: object = { data: { idNotaFiscal: 99 } };
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, method, body });
    if (path.endsWith('/formas-pagamentos')) return Response.json({ data: [pix] });
    if (path.endsWith('/nfe/99/enviar')) {
      draft.situacao = 5;
      return Response.json({ data: {} });
    }
    if (path.endsWith('/pedidos/vendas/1/gerar-nfe')) return Response.json(generationResponse);
    if (path.endsWith('/pedidos/vendas/1')) return Response.json({ data: {
      id: 1, ...(linked ? { notaFiscal: { id: 99 } } : {}),
      itens: [{ codigo: '123', descricao: item.description, quantidade: 2, valor: 85 }],
      parcelas: [{ dataVencimento: '2026-10-07', valor: 187.07, formaPagamento: { id: 17 } }],
    } });
    if (path.endsWith('/nfe/99') && method === 'PUT') {
      if (putStatus !== 200) return Response.json({ error: { message: 'NCM recusado', fields: [{ msg: 'Código não permitido' }] } }, { status: putStatus });
      if (persist) draft = { ...draft, ...body };
      return Response.json({ data: { id: 99 } });
    }
    if (path.endsWith('/nfe/99')) return Response.json({ data: draft });
    throw new Error(`Chamada inesperada ${method} ${path}`);
  });

  await t.test('reconhece resposta envelopada e ajusta rascunho', async () => {
    const result = await handleBlingNfe('generate', { orderId: 1, quote }, 'test-token');
    assert.equal(result.status, 200);
    assert.equal(result.body.nfeId, 99);
    assert.equal(result.body.readyToSend, true);
    const put = calls.find((call) => call.method === 'PUT')!.body!;
    assert.equal(draft.itens[0].classificacaoFiscal, '8207.70.10');
    assert.equal(draft.itens[0].cfop, '5102');
    assert.equal(draft.parcelas[0].formaPagamento.id, 17);
    assert.equal('situacao' in put, false);
    assert.equal('chaveAcesso' in put, false);
    assert.equal(put.desconto, 10);
  });
  await t.test('também reconhece resposta oficial sem envelope', async () => {
    generationResponse = { idNotaFiscal: 99 };
    assert.equal((await handleBlingNfe('generate', { orderId: 1, quote }, 'test-token')).body.nfeId, 99);
  });
  await t.test('reutiliza nota vinculada sem gerar outra', async () => {
    linked = true;
    calls.length = 0;
    assert.equal((await handleBlingNfe('generate', { orderId: 1, quote }, 'test-token')).status, 200);
    assert.equal(calls.some((c) => c.path.endsWith('gerar-nfe')), false);
  });
  await t.test('recusa orçamento que não corresponde ao pedido', async () => {
    calls.length = 0;
    const result = await handleBlingNfe('generate', { orderId: 1, quote: { ...quote, items: [{ ...item, quantity: 3 }] } }, 'test-token');
    assert.equal(result.status, 409);
    assert.equal(calls.some((c) => c.method === 'PUT'), false);
    assert.equal(result.body.nfeId, 99);
  });
  await t.test('orçamento divergente não gera nem ajusta nota nova', async () => {
    linked = false;
    calls.length = 0;
    const result = await handleBlingNfe('generate', { orderId: 1, quote: { ...quote, items: [{ ...item, unitPrice: 90 }] } }, 'test-token');
    assert.equal(result.status, 409);
    assert.equal(calls.some((call) => call.method !== 'GET'), false);
    linked = true;
  });
  await t.test('rejeição do ajuste preserva ID, detalhes e bloqueio de envio', async () => {
    putStatus = 400;
    const result = await handleBlingNfe('generate', { orderId: 1, quote }, 'test-token');
    assert.equal(result.body.nfeId, 99);
    assert.equal(result.body.readyToSend, false);
    assert.match(String(result.body.error), /Código não permitido/);
    putStatus = 200;
  });
  await t.test('confere persistência mesmo quando PUT retorna sucesso', async () => {
    persist = false;
    draft.itens[0].classificacaoFiscal = '0000.00.00';
    assert.equal((await handleBlingNfe('generate', { orderId: 1, quote }, 'test-token')).status, 409);
    persist = true;
  });
  await t.test('bloqueia transmissão de NCM zerado antes do POST enviar', async () => {
    calls.length = 0;
    const result = await handleBlingNfe('send', { nfeId: 99, paymentMethod: 'Pix' }, 'test-token');
    assert.equal(result.status, 409);
    assert.equal(calls.some((c) => c.method === 'POST'), false);
  });
  await t.test('bloqueia pagamento divergente e nota já autorizada', async () => {
    draft.itens[0].classificacaoFiscal = '8207.70.10';
    draft.parcelas[0].formaPagamento.id = 1;
    assert.equal((await handleBlingNfe('send', { nfeId: 99, paymentMethod: 'Pix' }, 'test-token')).status, 409);
    draft.parcelas[0].formaPagamento.id = 17;
    draft.situacao = 5;
    assert.equal((await handleBlingNfe('send', { nfeId: 99, paymentMethod: 'Pix' }, 'test-token')).status, 409);
  });
  await t.test('transmite apenas nota conferida e relê situação final', async () => {
    draft.situacao = 1;
    const result = await handleBlingNfe('send', { nfeId: 99, paymentMethod: 'Pix' }, 'test-token');
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.readyToSend, false);
    assert.equal((result.body.nfe as { situacao: number }).situacao, 5);
  });
  await t.test('orçamento alterado bloqueia transmissão de nota com itens ou total diferentes', async () => {
    draft.situacao = 1;
    calls.length = 0;
    const result = await handleBlingNfe('send', { nfeId: 99, paymentMethod: 'Pix', quote: { ...quote, items: [{ ...item, quantity: 3 }] } }, 'test-token');
    assert.equal(result.status, 409);
    assert.match(String(result.body.error), /diverge/);
    assert.equal(calls.some((call) => call.path.endsWith('/enviar')), false);
  });
  await t.test('série 1 bloqueia transmissão mesmo com NCM e Pix corretos', async () => {
    calls.length = 0;
    draft.situacao = 1;
    draft.serie = 1;
    const result = await handleBlingNfe('send', { nfeId: 99, paymentMethod: 'Pix' }, 'test-token');
    assert.equal(result.status, 409);
    assert.match(String(result.body.error), /série 2/);
    assert.equal(calls.some((c) => c.path.endsWith('/enviar')), false);
  });
});
