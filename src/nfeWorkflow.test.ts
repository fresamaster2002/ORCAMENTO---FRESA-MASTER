import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareNfe, monitorNfe, nfeSituationLabel, nfeWithTransmissionRequest } from './nfeWorkflow';
import type { QuoteData } from './types';

const quote: QuoteData = {
  id: 'FM-TEST', status: 'draft', createdAt: '2026-10-11', client: { name: 'Cliente teste' },
  project: { title: '', category: '', description: '', validityDays: 10, date: '2026-10-11' },
  items: [{ id: 'item', description: 'Fresa', quantity: 1, unit: 'un', unitPrice: 10, totalPrice: 10 }],
  shipping: { originCep: '', destinationCep: '', options: [] },
  financials: { subtotal: 10, shippingAmount: 0, discountPercentage: 0, discountAmount: 0, taxPercentage: 0, taxAmount: 0, totalAmount: 10, paymentMethod: 'Pix', paymentTerms: 'À vista' },
  observations: [], notesForClient: '',
};

test('prepara somente depois de salvar pedido, usa itens resolvidos e abre revisão sem transmitir', async () => {
  const calls: string[] = [];
  const saved = { ...quote, items: [{ ...quote.items[0], ncm: '82077010' }], bling: { orderId: 11, orderSnapshot: 'saved' } };
  await prepareNfe(quote, {
    createOrder: async () => { calls.push('create-and-persist'); return saved; },
    generateDraft: async (current) => { assert.equal(current, saved); calls.push('generate-and-persist'); return { id: 22 }; },
    onStep: (step) => calls.push(step),
    openReview: () => calls.push('review'),
  });
  assert.deepEqual(calls, ['creating-order', 'create-and-persist', 'generating-draft', 'generate-and-persist', 'opening-review', 'review']);
});

test('reutiliza pedido e nota existentes; falha de gravação ou geração não avança', async () => {
  const existing = { ...quote, bling: { orderId: 11, nfe: { id: 22 } } };
  let opened = 0;
  const operations = { createOrder: async () => { throw Error('Não criar duplicata'); }, generateDraft: async () => { throw Error('Não gerar duplicata'); }, onStep: () => {}, openReview: () => { opened++; } };
  await prepareNfe(existing, operations);
  assert.equal(opened, 1);
  await assert.rejects(prepareNfe(quote, { ...operations, createOrder: async () => { throw Error('Falha ao salvar vínculo'); } }), /salvar vínculo/);
  await prepareNfe(quote, { ...operations, createOrder: async () => undefined });
  await prepareNfe({ ...quote, bling: { orderId: 11 } }, { ...operations, generateDraft: async () => undefined });
  assert.equal(opened, 1);
});

test('acompanha somente consultas, termina autorizado ou rejeitado e tem limite', async () => {
  const controller = new AbortController();
  let reads = 0;
  const statuses = [3, 8, 5];
  const observed: number[] = [];
  assert.equal(await monitorNfe(async () => statuses[reads++], (n) => n, async (n) => { observed.push(n); }, async () => {}, controller.signal), true);
  assert.deepEqual(observed, [3, 8, 5]);
  reads = 0;
  assert.equal(await monitorNfe(async () => { reads++; return 4; }, (n) => n, async () => {}, async () => {}, controller.signal), false);
  assert.equal(reads, 1);
  reads = 0;
  await monitorNfe(async () => { reads++; return 1; }, (n) => n, async () => {}, async () => {}, controller.signal);
  assert.equal(reads, 6);
  assert.equal(nfeSituationLabel(4), 'Rejeitada');
  assert.equal(nfeSituationLabel(8), 'Aguardando protocolo');
});

test('cancelamento e erros de consulta/persistência interrompem acompanhamento', async () => {
  const controller = new AbortController();
  let reads = 0;
  await assert.rejects(monitorNfe(async () => { reads++; return 1; }, (n) => n, async () => {}, async () => { controller.abort(); }, controller.signal), /abort/i);
  assert.equal(reads, 0);
  const signal = new AbortController().signal;
  await assert.rejects(monitorNfe(async () => { throw Error('Consulta indisponível'); }, (n: number) => n, async () => {}, async () => {}, signal), /indisponível/);
  await assert.rejects(monitorNfe(async () => 5, (n) => n, async () => { throw Error('Falha ao salvar'); }, async () => {}, signal), /salvar/);
});

test('solicitação permanece em resultados indefinidos e só libera após situação final confirmada', () => {
  for (const situacao of [undefined, 1, 3, 8, 10, 99]) {
    assert.equal(nfeWithTransmissionRequest({ id: 22, situacao }, 'requested').transmissionRequestedAt, 'requested');
  }
  for (const situacao of [2, 4, 5, 6, 7, 9, 11]) {
    assert.equal(nfeWithTransmissionRequest({ id: 22, situacao }, 'requested').transmissionRequestedAt, undefined);
  }
  assert.equal(nfeWithTransmissionRequest({ id: 22, situacao: 1 }).transmissionRequestedAt, undefined);
});
