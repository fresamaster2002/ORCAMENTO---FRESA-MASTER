import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shippingErrorDiagnostic, shippingInvoiceDiagnostic } from './shippingDiagnostics';
import type { QuoteData } from './types';

const quote: QuoteData = {
  id: 'FM-TEST', status: 'approved', createdAt: '2026-10-30', observations: [], notesForClient: '',
  client: { name: 'Cliente teste' }, items: [],
  project: { title: '', category: '', description: '', validityDays: 7, date: '2026-10-30' },
  financials: { subtotal: 100, shippingAmount: 20, discountPercentage: 0, discountAmount: 0, taxPercentage: 0, taxAmount: 0, totalAmount: 120, paymentTerms: '', paymentMethod: '' },
  shipping: { originCep: '13329-350', destinationCep: '15055-000', options: [] },
  bling: { orderId: 11, nfe: { id: 47, situacao: 5, serie: 2, chaveAcesso: '1'.repeat(44) } },
};

test('CEP recusado destaca valor informado, distingue NF e orienta correção direta', () => {
  const before = structuredClone(quote);
  for (const error of ['O campo cep_destino está invalido', 'CEP de entrega recusado pelo Melhor Envio', 'to.postal_code invalid']) {
    const diagnostic = shippingErrorDiagnostic(error, quote);
    assert.match(diagnostic.title, /15055-000/);
    assert.match(diagnostic.explanation, /não significa que a NF-e foi rejeitada/);
    assert.equal(diagnostic.action, 'delivery');
    assert.equal(diagnostic.actionLabel, 'Corrigir CEP de entrega agora');
    assert.equal(diagnostic.steps.length, 3);
    assert.match(diagnostic.steps[0], /Confirme com o cliente/);
    assert.match(diagnostic.steps[2], /salve a entrega/);
  }
  assert.deepEqual(quote, before);
});

test('origem, conexão e NF têm instruções próprias sem confundir com destino', () => {
  const origin = shippingErrorDiagnostic('CEP de origem recusado', quote);
  assert.equal(origin.action, 'sender');
  assert.match(origin.explanation, /13329-350/);
  assert.match(origin.steps.join(' '), /destino.*não deve ser alterado/);
  assert.equal(shippingErrorDiagnostic('Token de produção ausente', quote).action, 'connection');
  const fiscal = shippingErrorDiagnostic('Falha ao consultar NF-e no Bling', quote);
  assert.equal(fiscal.action, 'invoice');
  assert.match(fiscal.steps[0], /não cria nem transmite outra nota/);
});

test('falhas desconhecidas não inventam CEP inválido nem permitem repetição de carrinho', () => {
  const diagnostic = shippingErrorDiagnostic('Falha ao salvar a solicitação. Confira o painel oficial.', quote);
  assert.equal(diagnostic.action, null);
  assert.doesNotMatch(diagnostic.title, /CEP/);
  assert.match(diagnostic.steps.join(' '), /antes de tentar novamente/);
});

test('pendência fiscal mostra situação, série e chave reais, sem afirmar autorização não confirmada', () => {
  assert.equal(shippingInvoiceDiagnostic(quote), null);
  const pending = shippingInvoiceDiagnostic({ ...quote, bling: { orderId: 11, nfe: { id: 47, situacao: 6, serie: 1 } } });
  assert.ok(pending);
  assert.match(pending.explanation, /Emitida DANFE/);
  assert.match(pending.explanation, /Série salva: 1/);
  assert.match(pending.explanation, /chave de acesso de 44 dígitos/);
  assert.equal(pending.action, 'invoice');
  const absent = shippingInvoiceDiagnostic({ ...quote, bling: undefined });
  assert.match(absent!.explanation, /Nenhuma NF-e/);
  const cancelled = shippingInvoiceDiagnostic({ ...quote, bling: { nfe: { ...quote.bling!.nfe!, situacao: 2 } } });
  assert.match(cancelled!.explanation, /Cancelada/);
});
