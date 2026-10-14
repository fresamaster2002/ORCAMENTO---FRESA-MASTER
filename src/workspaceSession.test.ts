import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QuoteData } from './types';
import {
  defaultWorkspaceView, mergeWorkspaceQuotes, readWorkspace, resumeWorkspaceQuote, workspaceKey, workspaceErrorMessage,
  type WorkspaceSession,
} from './workspaceSession.ts';

function quote(id: string, name = 'Cliente'): QuoteData {
  return {
    id, status: 'draft', createdAt: '2026-10-14',
    client: { name, email: '', document: '' },
    project: { title: '', category: '', description: '', validityDays: 10, date: '2026-10-14' },
    items: [], shipping: { originCep: '13329350', destinationCep: '', options: [] },
    financials: { subtotal: 0, shippingAmount: 0, discountPercentage: 0, discountAmount: 0,
      taxPercentage: 0, taxAmount: 0, totalAmount: 0, paymentTerms: '', paymentMethod: '' },
    observations: [], notesForClient: '',
  };
}

function session(): WorkspaceSession {
  return { version: 1, quote: quote('FM-002'), pending: {},
    view: { ...defaultWorkspaceView, modal: 'bling', blingTab: 'cadastral', quickText: 'Pedido não processado', scrollY: 720,
      clientEditing: true, cadastralDraft: { quoteId: 'FM-002', text: 'Dados fiscais não processados' },
      invoiceDraft: { quoteId: 'FM-002', key: '35261059085330000170550020000000391000000391' } } };
}

const normalize = (value: unknown) => {
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') return value as QuoteData;
  return null;
};

test('reabre o orçamento ativo em vez de escolher o mais recente na nuvem', () => {
  const local = session();
  const cloud = [quote('FM-003'), quote('FM-002', 'Nome atualizado na nuvem')];
  assert.equal(resumeWorkspaceQuote(cloud, local)?.client.name, 'Nome atualizado na nuvem');
  assert.equal(resumeWorkspaceQuote(cloud, null)?.id, 'FM-003');
});

test('rascunho pendente prevalece sobre nuvem antiga inclusive com vínculo de nota e envio', () => {
  const local = session();
  const draft = quote('FM-002', 'Última letra antes de fechar');
  draft.bling = { orderId: 123 };
  draft.sandboxShipment = { id: 'sandbox-test', protocol: null, createdAt: '2026-10-14', paymentStatus: 'processing', checkoutRequestedAt: '2026-10-14' };
  local.pending[draft.id] = { quote: draft, updatedAt: '2026-10-14T16:00:00Z' };
  assert.deepEqual(resumeWorkspaceQuote([quote('FM-002')], local), draft);
  assert.deepEqual(resumeWorkspaceQuote([], local), draft);
});

test('preserva alterações de mais de um orçamento ao alternar antes da sincronização', () => {
  const local = session();
  for (const id of ['FM-001', 'FM-002']) {
    local.pending[id] = { quote: quote(id, `Editado ${id}`), updatedAt: '2026-10-14T16:00:00Z' };
  }
  const merged = mergeWorkspaceQuotes([quote('FM-001'), quote('FM-003')], local);
  assert.equal(merged.length, 3);
  assert.equal(merged.find((saved) => saved.id === 'FM-001')?.client.name, 'Editado FM-001');
  assert.equal(merged.find((saved) => saved.id === 'FM-002')?.client.name, 'Editado FM-002');
});

test('salva e recupera texto, tela e posição por conta sem credenciais', () => {
  const local = session();
  const values = new Map([[workspaceKey('account-a'), JSON.stringify(local)]]);
  const storage = { getItem: (key: string) => values.get(key) || null };
  assert.deepEqual(readWorkspace(storage, 'account-a', normalize), local);
  assert.equal(readWorkspace(storage, 'account-b', normalize), null);
  assert.equal('token' in local.view, false);
});

test('rascunho novo ainda ausente na nuvem não desaparece na reabertura', () => {
  const local = session();
  assert.deepEqual(resumeWorkspaceQuote([quote('FM-001')], local), local.quote);
});

test('dados corrompidos ou bloqueio de armazenamento são erros explícitos', () => {
  assert.throws(() => readWorkspace({ getItem: () => '{' }, 'a', normalize), SyntaxError);
  assert.throws(() => readWorkspace({ getItem: () => JSON.stringify({ version: 1 }) }, 'a', normalize), /inválido/);
  const local = session();
  local.pending['FM-001'] = { quote: quote('FM-002'), updatedAt: 'data-inválida' };
  assert.throws(() => readWorkspace({ getItem: () => JSON.stringify(local) }, 'a', normalize), /pendente inválido/);
  assert.throws(() => readWorkspace({ getItem: () => { throw new Error('Storage bloqueado'); } }, 'a', normalize), /bloqueado/);
});

test('apresenta a mensagem de erros Supabase em vez de object Object', () => {
  assert.equal(workspaceErrorMessage({ message: 'Conexão indisponível', code: '503' }), 'Conexão indisponível');
  assert.equal(workspaceErrorMessage(new Error('Quota do navegador')), 'Quota do navegador');
});
