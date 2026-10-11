import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listBlingNatures, selectedBlingNature } from './blingNature.ts';
import { clientFiscalKey, clientFiscalReviewIssue, suggestedNature } from './clientFiscalReview.ts';
import { handleBlingNfe, resolveSaleContact } from './blingFiscal.ts';
import { nfeRevision } from './blingNfeReview.ts';

const natures = [{ id: '7', description: 'Venda de mercadoria' }, { id: '8', description: 'Venda de mercadoria a não contribuinte' }, { id: '9', description: 'Venda de mercadoria com ST' }];
const base = { document: '59085330000170', name: 'Empresa Teste', ie: '123456789', state: 'SP', fiscalCondition: 'contributor', operationNature: natures[0] };
const client = { ...base, fiscalReviewKey: clientFiscalKey(base) };

test('sugestão exige condição confirmada e nome único, nunca presume ST', () => {
  assert.equal(suggestedNature(natures, 'contributor')?.id, '7');
  assert.equal(suggestedNature(natures, 'non-contributor')?.id, '8');
  assert.equal(suggestedNature(natures, 'unknown'), undefined);
  assert.equal(suggestedNature(natures, 'exempt'), undefined);
  assert.equal(suggestedNature([...natures, { ...natures[0], id: '10' }], 'contributor'), undefined);
  assert.equal(clientFiscalReviewIssue(client), null);
  for (const patch of [{ fiscalCondition: 'unknown' }, { operationNature: natures[1] }, { ie: '' }, { operationNature: { ...natures[0], id: '70' } }]) {
    assert.ok(clientFiscalReviewIssue({ ...client, ...patch }));
  }
  assert.ok(clientFiscalReviewIssue({ ...client, registrationLookup: { document: base.document, cnpjStatusCode: '8' } }));
  assert.ok(clientFiscalReviewIssue({ document: '52998224725' }));
});

test('natureza vem da lista ativa do ERP; ID/descrição adulterados ou permissão negada não usam padrão', async (t) => {
  let denied = false;
  t.mock.method(globalThis, 'fetch', async () => denied
    ? Response.json({ error: { message: 'Permissão negada' } }, { status: 403 })
    : Response.json({ data: natures.map((nature) => ({ id: Number(nature.id), descricao: nature.description })) }));
  assert.deepEqual(await listBlingNatures('nature-test'), natures);
  assert.equal((await selectedBlingNature('nature-test', client)).id, '7');
  await assert.rejects(selectedBlingNature('nature-test', { ...client, operationNature: { ...natures[0], id: '70' } }), /não corresponde/);
  denied = true;
  await assert.rejects(listBlingNatures('nature-test'), /Permissão negada/);
});

test('novo contato usa indicador explícito; contato existente incompatível não é alterado', async (t) => {
  let existing = false;
  const writes: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/contatos') && init?.method === 'POST') {
      writes.push(JSON.parse(String(init.body)));
      return Response.json({ data: { id: 11 } });
    }
    if (path.endsWith('/contatos/11')) return Response.json({ data: { id: 11, numeroDocumento: base.document, indicadorIe: 9 } });
    return Response.json({ data: existing ? [{ id: 11 }] : [] });
  });
  assert.equal(await resolveSaleContact('contact-nature-test', client), 11);
  assert.equal(writes[0].indicadorIe, 1);
  assert.equal(await resolveSaleContact('contact-nature-test', { ...client, fiscalCondition: 'exempt', ie: 'ISENTO' }), 11);
  assert.equal(writes[1].indicadorIe, 2);
  assert.equal('ie' in writes[1], false);
  existing = true;
  await assert.rejects(resolveSaleContact('contact-nature-test', client), /condição de ICMS/);
  assert.equal(writes.length, 2);
});

test('natureza divergente da NF-e bloqueia transmissão sem alterar nota ou regras', async (t) => {
  const invoice = { id: 99, serie: 2, situacao: 1, naturezaOperacao: { id: 8 }, valorNota: 10, valorFrete: 0,
    contato: { nome: client.name, numeroDocumento: client.document, ie: client.ie, endereco: { uf: 'SP' } },
    itens: [{ descricao: 'Fresa', quantidade: 1, valor: 10, classificacaoFiscal: '82077010', cfop: '5102' }],
    parcelas: [{ valor: 10, formaPagamento: { id: 17 } }] };
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    calls.push(init?.method || 'GET');
    if (path.endsWith('/pedidos/vendas/1')) return Response.json({ data: { id: 1, notaFiscal: { id: 99 }, itens: [{ descricao: 'Fresa', quantidade: 1, valor: 10 }] } });
    return Response.json({ data: invoice });
  });
  const quote = { client, items: [{ description: 'Fresa', quantity: 1, unitPrice: 10, ncm: '82077010' }], financials: { shippingAmount: 0 } };
  const result = await handleBlingNfe('send-reviewed', { nfeId: 99, orderId: 1, quote, revision: await nfeRevision(invoice) }, 'nature-send-test');
  assert.equal(result.status, 409);
  assert.match(String(result.body.error), /natureza da NF-e difere/);
  assert.equal(calls.every((method) => method === 'GET'), true);
});
