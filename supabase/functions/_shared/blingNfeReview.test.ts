import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildNfeReview, nfeRevision } from './blingNfeReview.ts';
import { blingFreight, buildSalePayment, handleBlingNfe } from './blingFiscal.ts';
import { clientFiscalKey } from './clientFiscalReview.ts';

const clientData = { name: 'Empresa Teste', document: '59085330000170', ie: '600320622110', address: 'Rua Teste', number: '62', neighborhood: 'Centro', city: 'Salto', state: 'SP', cep: '13321472', fiscalCondition: 'contributor', operationNature: { id: '7', description: 'Venda de mercadoria' } };
const client = { ...clientData, fiscalReviewKey: clientFiscalKey(clientData) };
const quote = { client, items: [{ description: 'Fresa', quantity: 2, unitPrice: 220, sku: '', blingProductId: '123', ncm: '8207.70.10' }], financials: { paymentMethod: 'Pix', shippingAmount: 14.79, insuranceAmount: 3.96, discountAmount: 0 } };
const draft = {
  id: 99, numero: '12', serie: 2, tipo: 1, situacao: 1, valorNota: 458.75, valorFrete: 18.75,
  dataOperacao: '2026-10-11', naturezaOperacao: { id: 7 }, observacoes: 'Original',
  contato: { nome: client.name, numeroDocumento: client.document, ie: client.ie, endereco: { endereco: client.address, numero: client.number, bairro: client.neighborhood, municipio: client.city, uf: client.state, cep: client.cep } },
  itens: [{ codigo: '', descricao: 'Fresa', quantidade: 2, valor: 220, valorTotal: 440, unidade: 'UN', classificacaoFiscal: '8207.70.10', cfop: '6108', impostos: { icms: { cst: '102', aliquota: 0 } } }],
  parcelas: [{ data: '2026-10-11', valor: 458.75, formaPagamento: { id: 17 } }],
  transporte: { transportador: { nome: 'Correios' } },
};
const order = { id: 1, notaFiscal: { id: 99 }, itens: [{ produto: { id: 123 }, descricao: 'Fresa', quantidade: 2, valor: 220 }] };

test('conferência preserva ausências e impostos; revisão ignora somente links temporários', async () => {
  const review = await buildNfeReview(draft);
  assert.equal(review.total, 458.75);
  assert.equal(review.seguro, null);
  assert.equal(review.cliente.documento, client.document);
  assert.deepEqual(review.itens[0].impostos, draft.itens[0].impostos);
  assert.equal(await nfeRevision(draft), await nfeRevision({ ...draft, linkDanfe: 'https://test.invalid/signed' }));
  assert.notEqual(await nfeRevision(draft), await nfeRevision({ ...draft, valorNota: 459 }));
});

test('seguro compõe frete e parcela fiscal sem duplicação', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ data: [{ id: 17, descricao: 'Pix', situacao: 1, finalidade: 2, tipoPagamento: 20 }] }));
  assert.equal(blingFreight(quote.financials), 18.75);
  assert.equal((await buildSalePayment('review-insurance', quote)).parcelas[0].valor, 458.75);
  assert.equal(blingFreight({ shippingAmount: 18.75, insuranceAmount: 0 }), 18.75);
  assert.throws(() => blingFreight({ shippingAmount: 10, insuranceAmount: -1 }), /seguro/);
});

test('edição fiscal relê dados, limita campos e exige revisão atual antes de transmitir', async (t) => {
  let stored = structuredClone(draft);
  let linkedOrder = structuredClone(order);
  let persist = true;
  let changePriceOnSave = false;
  const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    if (path.endsWith('/nfe')) return Response.json({ data: [] });
    if (path.endsWith('/formas-pagamentos')) return Response.json({ data: [{ id: 17, descricao: 'Pix', situacao: 1, finalidade: 2, tipoPagamento: 20 }] });
    if (path.endsWith('/pedidos/vendas/1')) return Response.json({ data: linkedOrder });
    if (path.endsWith('/nfe/99') && method === 'GET') return Response.json({ data: stored });
    if (path.endsWith('/nfe/99') && method === 'PUT') {
      if (persist) stored = { ...stored, ...body, ...(changePriceOnSave ? { valorNota: 999 } : {}) };
      return Response.json({ data: { id: 99 } });
    }
    if (path.endsWith('/nfe/99/enviar') && method === 'POST') { stored.situacao = 5; return Response.json({ data: {} }); }
    throw new Error(`Chamada inesperada ${method} ${path}`);
  });

  await t.test('correção de número mantém a mesma nota, confere ocupação e não transmite', async (t) => {
    let stored = structuredClone(draft);
    let linkedId = 99;
    let occupied = false;
    let cancelled = false;
    let persist = true;
    let changeTotal = false;
    let changeDuringCheck = false;
    let invalidList = false;
    let failList = false;
    let loseSendResponse = false;
    let listCalls = 0;
    const calls: Array<{ method: string; url: URL; body?: Record<string, unknown> }> = [];
    t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const method = init?.method || 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      if (url.pathname.endsWith('/pedidos/vendas/1')) return Response.json({ data: { ...order, notaFiscal: { id: linkedId } } });
      if (url.pathname.endsWith('/formas-pagamentos')) return Response.json({ data: [{ id: 17, descricao: 'Pix', situacao: 1, finalidade: 2, tipoPagamento: 20 }] });
      if (url.pathname.endsWith('/nfe')) {
        listCalls++;
        assert.equal(url.searchParams.get('serie'), '2');
        assert.equal(url.searchParams.get('tipo'), '1');
        if (failList) return Response.json({ error: { message: 'Sem permissão para consultar notas' } }, { status: 403 });
        if (invalidList) return Response.json({ data: {} });
        if (changeDuringCheck) stored.observacoes = 'Alterada externamente';
        return Response.json({ data: occupied && (cancelled === (url.searchParams.get('situacao') === '2')) ? [{ id: 100, numero: url.searchParams.get('numero') }] : [{ id: 99, numero: url.searchParams.get('numero') }] });
      }
      if (url.pathname.endsWith('/nfe/99') && method === 'PUT') {
        if (persist) stored = { ...stored, ...body, situacao: 1, ...(changeTotal ? { valorNota: 999 } : {}) };
        return Response.json({ data: { id: 99 } });
      }
      if (url.pathname.endsWith('/nfe/99')) return Response.json({ data: stored });
      if (url.pathname.endsWith('/nfe/99/enviar')) {
        if (loseSendResponse) throw new Error('Teste: resposta da transmissão perdida');
        return Response.json({ data: {} });
      }
      throw new Error(`Chamada inesperada ${method} ${url}`);
    });
    const input = { nfeId: 99, orderId: 1, quote, confirmNumberChange: true, edit: { numero: '13' } };
    const update = async (extra: Record<string, unknown> = {}) => handleBlingNfe('update-number', { ...input, revision: await nfeRevision(stored), ...extra }, 'number-test');
    const writes = () => calls.filter(({ method }) => method !== 'GET');
    await t.test('pendente e rejeitada aceitam somente número com confirmação e preservam série, itens e valores', async () => {
      for (const situation of [1, 4]) {
        stored = { ...structuredClone(draft), situacao: situation };
        calls.length = 0;
        const result = await update();
        assert.equal(result.status, 200);
        assert.equal(stored.numero, '13');
        assert.equal(stored.serie, 2);
        assert.equal(stored.valorNota, draft.valorNota);
        assert.deepEqual(stored.itens, draft.itens);
        assert.equal(writes().length, 1);
        assert.equal(writes()[0].method, 'PUT');
        assert.equal('serie' in writes()[0].body!, false);
        assert.equal('situacao' in writes()[0].body!, false);
        assert.equal(calls.some(({ url }) => url.searchParams.get('situacao') === '2'), true);
      }
    });
    await t.test('valida limites, campos, confirmação, revisão, vínculo e estados antes de gravar', async () => {
      stored = structuredClone(draft);
      calls.length = 0;
      for (const numero of ['', '0', '-1', '1.5', '1000000000', '1e2', ' 13', 13]) assert.equal((await update({ edit: { numero } })).status, 400);
      assert.equal((await update({ edit: { numero: '12' } })).status, 400);
      assert.equal((await update({ edit: { numero: '13', serie: 3 } })).status, 400);
      assert.equal((await update({ confirmNumberChange: false })).status, 400);
      assert.equal((await update({ revision: 'antiga' })).status, 409);
      linkedId = 100;
      assert.equal((await update()).status, 409);
      linkedId = 99;
      for (const situacao of [2, 3, 5, 7, 8, 9, 10, 11]) {
        stored.situacao = situacao;
        assert.equal((await update()).status, 409);
      }
      stored.situacao = 1;
      assert.equal((await update({ quote: { ...quote, bling: { nfe: { id: 99, transmissionRequestedAt: '2026-11-04' } } } })).status, 409);
      stored.serie = 1;
      assert.equal((await update()).status, 409);
      stored.serie = 2;
      assert.equal(writes().length, 0);
    });
    await t.test('números usados inclusive canceladas bloqueiam salvar e transmitir, sem deixar envio incerto', async () => {
      for (const isCancelled of [false, true]) {
        cancelled = isCancelled;
        occupied = true;
        calls.length = 0;
        const result = await update();
        assert.equal(result.status, 409);
        assert.match(String(result.body.error), /já usado.*outra nota/);
        const send = await handleBlingNfe('send-reviewed', { ...input, revision: await nfeRevision(stored) }, 'number-test');
        assert.equal(send.status, 409);
        assert.equal(send.body.transmissionNotAttempted, true);
        assert.equal(writes().length, 0);
      }
      occupied = false;
    });
    await t.test('falha de consulta e resposta incompleta não afirmam disponibilidade', async () => {
      calls.length = 0;
      invalidList = true;
      assert.equal((await update()).status, 502);
      invalidList = false;
      failList = true;
      assert.equal((await update()).status, 403);
      failList = false;
      assert.equal(writes().length, 0);
    });
    await t.test('concorrência entre consulta e gravação impede PUT', async () => {
      calls.length = 0;
      changeDuringCheck = true;
      assert.equal((await update()).status, 409);
      assert.equal(writes().length, 0);
      changeDuringCheck = false;
      stored = structuredClone(draft);
    });
    await t.test('readback exige persistência e preservação dos demais dados', async () => {
      persist = false;
      assert.equal((await update()).status, 409);
      persist = true;
      changeTotal = true;
      assert.equal((await update()).status, 409);
      changeTotal = false;
      stored = structuredClone(draft);
      assert.equal((await update({ edit: { numero: '999999999' } })).status, 200);
      assert.equal(stored.numero, '999999999');
    });
    await t.test('falha após tentativa de transmissão mantém resultado incerto e nunca repete POST', async () => {
      calls.length = 0;
      stored = structuredClone(draft);
      loseSendResponse = true;
      const result = await handleBlingNfe('send-reviewed', { ...input, revision: await nfeRevision(stored) }, 'number-test');
      assert.equal(result.status, 502);
      assert.equal(result.body.transmissionNotAttempted, undefined);
      assert.equal(writes().length, 1);
      assert.ok(listCalls > 0);
    });
  });
  const input = { nfeId: 99, orderId: 1, quote };
  const edit = { itens: [{ ncm: '8207.70.90', cfop: '5102' }], observacoes: 'Conferido pelo operador' };
  await t.test('consulta real não grava nada e aceita frete incluindo seguro', async () => {
    const result = await handleBlingNfe('review', input, 'review-test');
    assert.equal(result.status, 200);
    assert.equal(result.body.readyToSend, true);
    assert.equal(calls.some((call) => call.method !== 'GET'), false);
  });
  await t.test('adoção relê a mesma nota e permite apenas destinatário correspondente, nunca grava no ERP', async () => {
    calls.length = 0;
    const changed = { ...quote, client: { ...client, name: 'Nome de teste', address: 'Outro endereço' } };
    const result = await handleBlingNfe('adopt-recipient', { ...input, quote: changed, revision: await nfeRevision(stored) }, 'review-test');
    assert.equal(result.status, 200);
    assert.equal((result.body.client as { name: string }).name, client.name);
    for (const invalid of [
      { ...changed, client: { ...changed.client, document: '11111111111' } },
      { ...changed, financials: { ...quote.financials, shippingAmount: 100 } },
      { ...changed, items: [{ ...quote.items[0], unitPrice: 999 }] },
    ]) assert.equal((await handleBlingNfe('adopt-recipient', { ...input, quote: invalid, revision: await nfeRevision(stored) }, 'review-test')).status, 409);
    assert.equal((await handleBlingNfe('adopt-recipient', { ...input, revision: 'old' }, 'review-test')).status, 409);
    stored.situacao = 5;
    assert.equal((await handleBlingNfe('adopt-recipient', { ...input, revision: await nfeRevision(stored) }, 'review-test')).status, 409);
    stored.situacao = 1;
    assert.equal(calls.some((call) => call.method !== 'GET'), false);
  });
  await t.test('salva somente NCM, CFOP e observações sem mudar imposto ou valor', async () => {
    const result = await handleBlingNfe('update-draft', { ...input, revision: await nfeRevision(stored), edit }, 'review-test');
    assert.equal(result.status, 200);
    assert.equal(stored.itens[0].classificacaoFiscal, '8207.70.90');
    assert.equal(stored.itens[0].cfop, '5102');
    assert.equal(stored.valorNota, 458.75);
    assert.deepEqual(stored.itens[0].impostos, draft.itens[0].impostos);
    assert.equal(result.body.readyToSend, true);
    assert.equal((result.body.warnings as string[]).length, 1);
    const body = calls.find((call) => call.method === 'PUT')!.body!;
    assert.equal('serie' in body, false);
    assert.equal('situacao' in body, false);
    assert.equal('valorNota' in body, false);
    assert.deepEqual(body.contato, draft.contato);
  });
  await t.test('revisão obsoleta e campos extras impedem PUT', async () => {
    calls.length = 0;
    assert.equal((await handleBlingNfe('update-draft', { ...input, revision: 'old', edit }, 'review-test')).status, 409);
    assert.equal((await handleBlingNfe('update-draft', { ...input, revision: await nfeRevision(stored), edit: { ...edit, contato: {} } }, 'review-test')).status, 400);
    assert.equal((await handleBlingNfe('update-draft', { ...input, revision: await nfeRevision(stored), edit: { ...edit, itens: [{ ...edit.itens[0], quantidade: 3 }] } }, 'review-test')).status, 400);
    assert.equal(calls.some((call) => call.method === 'PUT'), false);
  });
  await t.test('erros fiscais e nota autorizada não são gravados', async () => {
    calls.length = 0;
    const revision = await nfeRevision(stored);
    for (const patch of [{ ncm: '8207.70.00', cfop: '5102' }, { ncm: '8207.70.10', cfop: 'ABC' }]) {
      assert.equal((await handleBlingNfe('update-draft', { ...input, revision, edit: { ...edit, itens: [patch] } }, 'review-test')).status, 400);
    }
    stored.situacao = 5;
    assert.equal((await handleBlingNfe('update-draft', { ...input, revision: await nfeRevision(stored), edit }, 'review-test')).status, 409);
    assert.equal(calls.some((call) => call.method === 'PUT'), false);
    stored.situacao = 1;
  });
  await t.test('PUT sem persistência ou com recálculo inesperado bloqueia emissão', async () => {
    persist = false;
    assert.equal((await handleBlingNfe('update-draft', { ...input, revision: await nfeRevision(stored), edit: { ...edit, observacoes: 'Não salvo' } }, 'review-test')).status, 409);
    persist = true;
    changePriceOnSave = true;
    assert.equal((await handleBlingNfe('update-draft', { ...input, revision: await nfeRevision(stored), edit }, 'review-test')).status, 409);
    stored.valorNota = 458.75;
    changePriceOnSave = false;
  });
  await t.test('vínculo errado, cliente ou valor divergente impedem envio', async () => {
    calls.length = 0;
    linkedOrder.notaFiscal.id = 88;
    assert.equal((await handleBlingNfe('review', input, 'review-test')).status, 409);
    linkedOrder.notaFiscal.id = 99;
    for (const changed of [{ ...quote, client: { ...client, document: '99999999999999' } }, { ...quote, financials: { ...quote.financials, shippingAmount: 20 } }]) {
      assert.equal((await handleBlingNfe('send-reviewed', { ...input, quote: changed, revision: await nfeRevision(stored) }, 'review-test')).status, 409);
    }
    assert.equal(calls.some((call) => call.path.endsWith('/enviar')), false);
  });
  await t.test('nota alterada desde conferência não transmite', async () => {
    calls.length = 0;
    const revision = await nfeRevision(stored);
    stored.observacoes = 'Mudou no ERP';
    assert.equal((await handleBlingNfe('send-reviewed', { ...input, revision }, 'review-test')).status, 409);
    assert.equal(calls.some((call) => call.path.endsWith('/enviar')), false);
  });
  await t.test('sem conferência fiscal do cliente não transmite nem gera rascunho', async () => {
    calls.length = 0;
    const unreviewed = { ...input, quote: { ...quote, client: { ...client, fiscalReviewKey: undefined } }, revision: await nfeRevision(stored) };
    assert.equal((await handleBlingNfe('send-reviewed', unreviewed, 'review-test')).status, 409);
    assert.equal((await handleBlingNfe('generate', unreviewed, 'review-test')).status, 409);
    assert.equal(calls.some((call) => call.method !== 'GET'), false);
  });
  await t.test('transmite edição confirmada e relê autorização sem repetir POST', async () => {
    calls.length = 0;
    const result = await handleBlingNfe('send-reviewed', { ...input, revision: await nfeRevision(stored) }, 'review-test');
    assert.equal(result.status, 200);
    assert.equal((result.body.review as { situacao: number }).situacao, 5);
    assert.equal(result.body.readyToSend, false);
    assert.equal((await handleBlingNfe('send-reviewed', { ...input, revision: await nfeRevision(stored) }, 'review-test')).status, 409);
    assert.equal(calls.filter((call) => call.path.endsWith('/enviar')).length, 1);
  });
});
