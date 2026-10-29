import assert from 'node:assert/strict';
import { test } from 'node:test';
import { synchronizeNfe } from './nfeWorkflow.ts';
import type { BlingNfe } from './types';

test('situação autorizada no Bling é persistida com chave e links, limpando envio pendente', async () => {
  const saved: BlingNfe[] = [];
  const result = await synchronizeNfe(async () => ({
    success: true, nfe: { id: 33, situacao: 5, numero: '123', chaveAcesso: '1'.repeat(44), linkDanfe: 'https://bling.test/danfe' },
  }), { id: 33, situacao: 1, transmissionRequestedAt: '2026-10-28T00:00:00Z' }, async (next) => { saved.push(next); });
  assert.equal(saved.length, 1);
  assert.deepEqual(result, saved[0]);
  assert.equal(result?.situacao, 5);
  assert.equal(result?.transmissionRequestedAt, undefined);
  assert.equal(result?.chaveAcesso, '1'.repeat(44));
});

test('descobre vínculo ausente no app, mas não inventa nota para pedido sem NF-e', async () => {
  let writes = 0;
  const persist = async () => { writes++; };
  assert.equal(await synchronizeNfe(async () => ({ success: true, nfe: null }), undefined, persist), null);
  assert.equal(writes, 0);
  const result = await synchronizeNfe(async () => ({ success: true, nfe: { id: 33, situacao: 5 } }), undefined, persist);
  assert.equal(result?.id, 33);
  assert.equal(writes, 1);
});

test('erros, ID divergente e resposta parcial não sobrescrevem nota salva', async () => {
  let writes = 0;
  for (const data of [
    { success: false, error: 'Erro Bling' },
    { success: true, nfe: { id: 33 } },
    { success: true, nfe: { id: 99, situacao: 5 } },
    { success: true, nfe: null },
  ]) {
    await assert.rejects(synchronizeNfe(async () => data, { id: 33, situacao: 1 }, async () => { writes++; }));
  }
  assert.equal(writes, 0);
  await assert.rejects(synchronizeNfe(async () => ({ success: true, nfe: { id: 33, situacao: 5 } }), undefined, async () => { throw new Error('Falha ao salvar'); }), /Falha ao salvar/);
});
