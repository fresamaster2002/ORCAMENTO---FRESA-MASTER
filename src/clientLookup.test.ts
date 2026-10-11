import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completeMissingIe } from './clientLookup.ts';
import { clientFiscalKey, clientFiscalReviewed, clientFiscalDescription } from '../supabase/functions/_shared/clientFiscalReview.ts';

const client = { name: 'Empresa', document: '59085330000170', state: 'SP', address: 'Rua do documento', number: '15', ie: '', email: 'documento@example.invalid' };
const lookup: typeof fetch = async () => Response.json({ success: true, client: { ...client, ie: '600320622110', address: 'Rua pública', number: '99' }, warnings: [], source: 'CNPJ.ws' });

test('PDF sem IE consulta CNPJ e completa apenas IE, mantendo endereço, contatos e confirmação pendente', async () => {
  const result = await completeMissingIe(client, lookup);
  assert.equal(result.client.ie, '600320622110');
  assert.equal(result.client.number, '15');
  assert.equal(result.client.address, client.address);
  assert.equal(result.client.email, client.email);
  assert.equal(clientFiscalReviewed(result.client), false);
  assert.match(result.warnings.join(' '), /localizada automaticamente/);
});

test('IE já expressa é preservada mesmo na falha da consulta; CPF não consulta CNPJ', async () => {
  const noFetch: typeof fetch = async () => { throw new Error('Não deveria consultar'); };
  const existing = await completeMissingIe({ ...client, ie: '123' }, noFetch);
  assert.equal(existing.client.ie, '123');
  assert.ok(existing.warnings.length);
  assert.equal((await completeMissingIe({ ...client, document: '12345678901' }, noFetch)).warnings.length, 0);
});

test('falha, CNPJ divergente e UF divergente são avisados sem inventar IE ou ISENTO', async () => {
  for (const fetcher of [
    async () => Response.json({ success: false, error: 'Limite de consultas' }, { status: 429 }),
    async () => Response.json({ success: true, client: { ...client, document: '29931837000136', ie: '123' } }),
    async () => Response.json({ success: true, client: { ...client, state: 'PR', ie: '123' } }),
  ]) {
    const result = await completeMissingIe(client, fetcher);
    assert.equal(result.client.ie, '');
    assert.ok(result.warnings.length);
  }
});

test('ISENTO do documento é consultado, mas ausência de resultado não confirma não contribuinte', async () => {
  const result = await completeMissingIe({ ...client, ie: 'ISENTO' }, async () => Response.json({ success: true, client, warnings: ['Consulta não confirma isenção'] }));
  assert.equal(result.client.ie, 'ISENTO');
  assert.match(clientFiscalDescription(result.client), /não distingue/);
  assert.match(clientFiscalDescription(client), /não significa/);
});

test('confirmação fiscal vale somente para CNPJ, IE e UF conferidos', () => {
  const confirmed = { ...client, fiscalReviewKey: clientFiscalKey(client) };
  assert.equal(clientFiscalReviewed(confirmed), true);
  for (const change of [{ document: '29931837000136' }, { ie: '123' }, { state: 'PR' }]) {
    assert.equal(clientFiscalReviewed({ ...confirmed, ...change }), false);
  }
});
