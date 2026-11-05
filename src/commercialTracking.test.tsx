import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ManualPayment, QuoteData } from './types';
import { followUpIssues, followUpWhatsapp, isCalendarDate, localDate, normalizeCommercialTracking, parsePaymentAmount, paymentSummary, receiptInsights, recordPayment, voidPayment, withoutCommercialTracking } from './commercialTracking';
import { salesInsights } from './salesInsights';
import { duplicateQuote } from './quoteWorkspaceTools';
import { CommercialControls } from './components/CommercialControls';
import { PendingSales } from './components/PendingSales';
import { SalesDashboard } from './components/SalesDashboard';

const quote = (): QuoteData => ({
  id: 'FM-TEST', status: 'approved', createdAt: '2026-10-15T12:00:00Z', client: { name: 'Cliente Teste', phone: '(11) 99999-1234' },
  project: { title: '', category: '', description: '', validityDays: 10, date: '2026-10-15' },
  items: [{ id: '1', description: 'Fresa', quantity: 1, unitPrice: 100, totalPrice: 100, unit: 'un' }],
  shipping: { originCep: '', destinationCep: '', options: [] },
  financials: { subtotal: 100, totalAmount: 100, shippingAmount: 0, discountPercentage: 0, discountAmount: 0, taxPercentage: 0, taxAmount: 0, paymentMethod: 'Pix', paymentTerms: '' },
  observations: [], notesForClient: '',
});
const payment = (id = 'pay-1', amount = 40, date = '2026-11-05'): ManualPayment => ({ id, amount, date, method: 'Pix', recordedAt: '2026-11-05T12:00:00Z' });

test('valores monetários e datas são validados sem arredondar entrada inválida', () => {
  assert.equal(parsePaymentAmount('140,50'), 140.5);
  assert.equal(parsePaymentAmount('0.01'), 0.01);
  for (const value of ['-1', '0', '1.001', '1,001', '1.000,00', '1e2', 'NaN', 'R$ 10', '']) assert.throws(() => parsePaymentAmount(value));
  assert.equal(isCalendarDate('2026-02-30'), false);
  assert.equal(isCalendarDate('2024-02-29'), true);
  assert.equal(localDate(new Date(2026, 0, 1, 0, 1)), '2026-01-01');
});

test('parciais, saldo, quitação e cancelamento preservam o histórico e não alteram status/NF', () => {
  const original = quote();
  original.bling = { nfe: { id: 99, situacao: 5 } };
  const before = structuredClone(original);
  const updated = { ...original, commercial: recordPayment(original, payment(), '2026-11-05') };
  assert.equal(paymentSummary(updated).paid, 40);
  assert.equal(paymentSummary(updated).outstanding, 60);
  assert.equal(paymentSummary(updated).status, 'Parcial (manual)');
  updated.commercial = recordPayment(updated, payment('pay-2', 60), '2026-11-05');
  assert.equal(paymentSummary(updated).status, 'Pago (manual)');
  updated.commercial = voidPayment(updated, 'pay-1', '2026-11-06T12:00:00Z');
  assert.equal(updated.commercial.payments?.length, 2);
  assert.equal(paymentSummary(updated).paid, 60);
  assert.equal(paymentSummary(updated).outstanding, 40);
  assert.equal(updated.status, before.status);
  assert.deepEqual(updated.bling, before.bling);
  assert.deepEqual(original, before);
  assert.throws(() => voidPayment(updated, 'missing'), /não encontrado/);
});

test('idempotência impede duplicação e valida excesso, datas futuras e estados inválidos', () => {
  const current = quote();
  const entry = payment();
  current.commercial = recordPayment(current, entry, '2026-11-05');
  assert.equal(recordPayment(current, entry, '2026-11-05').payments?.length, 1);
  assert.throws(() => recordPayment(current, { ...entry, amount: 1 }), /identificador/);
  for (const amount of [61, -1, 0, NaN, 0.001]) assert.throws(() => recordPayment(current, payment('other', amount), '2026-11-05'));
  assert.throws(() => recordPayment(current, payment('other', 1, '2026-11-06'), '2026-11-05'), /data/);
  current.status = 'rejected';
  assert.throws(() => recordPayment(current, payment('other', 1), '2026-11-05'), /não aprovado/);
});

test('redução do orçamento expõe excesso e dados corrompidos são erros, não pagamentos zero', () => {
  const current = quote();
  current.commercial = recordPayment(current, payment(), '2026-11-05');
  current.financials.totalAmount = 20;
  assert.equal(paymentSummary(current).excess, 20);
  assert.equal(followUpIssues(current).includes('Pagamentos excedem o total atual'), true);
  current.commercial.payments = [payment(), payment()];
  assert.ok(paymentSummary(current).issues.length);
  assert.throws(() => recordPayment(current, payment('new', 1)), /duplicado/);
  assert.deepEqual(normalizeCommercialTracking({ payments: [payment()], notes: 'Preferência MDF', nextContactDate: '2026-11-10' })?.payments, [payment()]);
  assert.equal(normalizeCommercialTracking(undefined), undefined);
  for (const value of ['bad', { payments: {} }, { payments: [payment(), payment()] }, { payments: [{ ...payment(), amount: -2 }] }, { nextContactDate: '2026-02-30' }, { notes: 'x'.repeat(3001) }]) {
    assert.throws(() => normalizeCommercialTracking(value));
  }
});

test('recebimentos seguem data real registrada, saldo segue data do orçamento, mês/ano isolam resultados', () => {
  const current = quote();
  current.commercial = { payments: [payment('1', 40, '2026-11-05'), payment('2', 20, '2025-11-05'), { ...payment('3', 10), voidedAt: '2026-11-06T12:00:00Z' }] };
  assert.deepEqual(receiptInsights([current], 2026, 11), { received: 40, outstanding: 0, invalidRecords: 0 });
  assert.equal(receiptInsights([current], 2026, 10).outstanding, 40);
  assert.equal(receiptInsights([current], 2025, 11).received, 20);
  assert.equal(salesInsights([current], 2026, 10).approvedTotal, 100);
  assert.equal(salesInsights([current], 2026, 11).approvedTotal, 0);
  assert.equal(salesInsights([current], 2026, 10).months.length, 1);
  assert.throws(() => salesInsights([current], 2026, 13), /mês/);
});

test('pendências diferenciam resposta, validade, contato, pagamento, nota e envio', () => {
  const current = quote();
  current.status = 'sent';
  current.commercial = { nextContactDate: '2026-11-05' };
  const issues = followUpIssues(current, '2026-11-05');
  assert.ok(issues.includes('Aguardando resposta do cliente'));
  assert.ok(issues.includes('Orçamento vencido'));
  assert.ok(issues.includes('Contato agendado para hoje ou atrasado'));
  current.status = 'approved';
  current.commercial = { payments: [payment('all', 100)] };
  current.bling = { nfe: { id: 1, situacao: 5 } };
  assert.deepEqual(followUpIssues(current, '2026-11-05'), []);
  current.bling.nfe!.situacao = 4;
  assert.ok(followUpIssues(current).includes('NF-e rejeitada: revisar situação fiscal'));
  current.shipping.selectedOption = { service: 'SEDEX', name: 'Sedex', carrier: 'Correios', price: 10, deliveryDays: 2 };
  assert.ok(followUpIssues(current).includes('Envio Melhor Envio ainda não registrado'));
});

test('WhatsApp normaliza DDI uma vez e duplicação nunca herda pagamentos ou acompanhamento', () => {
  const current = quote();
  const url = followUpWhatsapp(current);
  assert.ok(url?.startsWith('https://wa.me/5511999991234?'));
  current.client.phone = '+55 (11) 99999-1234';
  assert.equal(followUpWhatsapp(current), url);
  current.client.phone = '123';
  assert.equal(followUpWhatsapp(current), null);
  current.commercial = { payments: [payment()], notes: 'Interno', nextContactDate: '2026-11-10' };
  const empty = { ...quote(), id: 'NEW', createdAt: '2026-11-05T12:00:00Z' };
  assert.equal(duplicateQuote(current, empty).commercial, undefined);
  const external = withoutCommercialTracking(current);
  assert.equal('commercial' in external, false);
  assert.equal(external.id, current.id);
  assert.equal(current.commercial.notes, 'Interno');
});

test('renderização expõe controles manuais, filtro mensal e central sem afirmar cobranças automáticas', () => {
  const current = quote();
  const controls = renderToStaticMarkup(<CommercialControls quote={current} onSave={async () => {}} />);
  assert.match(controls, /Registrar recebimento/);
  assert.match(controls, /Anotações comerciais/);
  assert.match(controls, /não cobra o cliente/);
  const pending = renderToStaticMarkup(<PendingSales quotes={[current]} onOpen={() => {}} />);
  assert.match(pending, /Central de pendências/);
  assert.match(pending, /Abrir e resolver/);
  const dashboard = renderToStaticMarkup(<SalesDashboard quotes={[current]} />);
  assert.match(dashboard, /Mês de análise/);
  assert.match(dashboard, /Ano do período/);
  assert.match(dashboard, /Este mês/);
  assert.match(dashboard, /Recebimentos registrados/);
  assert.doesNotMatch(dashboard, /NaN|Infinity/);
});
