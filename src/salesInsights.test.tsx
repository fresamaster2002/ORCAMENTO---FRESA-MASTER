import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { QuoteData } from './types';
import { customerHistories, quoteDate, salesInsights, searchCustomers } from './salesInsights';
import { CustomersPage } from './components/CustomersPage';
import { SalesDashboard } from './components/SalesDashboard';

function quote(id: string, date = '2026-01-15', status: QuoteData['status'] = 'draft', total = 100): QuoteData {
  return {
    id, status, createdAt: `${date}T12:00:00Z`, client: { name: 'Móveis São José', document: '12.345.678/0001-90', phone: '(11) 99999-1234', email: 'cliente@example.com' },
    project: { title: '', description: '', category: '', validityDays: 10, date },
    items: [{ id: `${id}-item`, description: 'Fresa TCT', quantity: 1, unitPrice: total, totalPrice: total, unit: 'un' }],
    shipping: { originCep: '13329350', destinationCep: '', options: [] },
    financials: { subtotal: total, totalAmount: total, shippingAmount: 0, discountAmount: 0, discountPercentage: 0, taxAmount: 0, taxPercentage: 0, paymentTerms: '', paymentMethod: 'Pix' },
    observations: [], notesForClient: '',
  };
}

test('clientes agrupam documento formatado, usam cadastro mais recente e mantêm histórico sem alterar origem', () => {
  const first = quote('FM-001');
  const latest = quote('FM-002', '2026-02-01');
  latest.client = { ...latest.client, document: '12345678000190', name: 'Nome atualizado' };
  const customers = customerHistories([first, latest]);
  assert.equal(customers.length, 1);
  assert.equal(customers[0].client.name, 'Nome atualizado');
  assert.deepEqual(customers[0].quotes.map(({ id }) => id), ['FM-002', 'FM-001']);
  for (const search of ['moveis jose', '12.345.678/0001-90', '12345678000190', '11999991234', '(11) 99999-1234', 'cliente@example.com', 'FM-001']) {
    assert.equal(searchCustomers(customers, search).length, 1, search);
  }
  assert.equal(searchCustomers(customers, 'FM-99999').length, 0);
  assert.equal(first.client.name, 'Móveis São José');
});

test('homônimos com documentos ou contatos diferentes ficam separados; registros sem identidade não viram clientes', () => {
  const first = quote('1');
  const second = quote('2');
  second.client.document = '99999999999';
  assert.equal(customerHistories([first, second]).length, 2);
  first.client.document = '';
  second.client.document = '';
  second.client.email = 'outro@example.com';
  assert.equal(customerHistories([first, second]).length, 2);
  first.client = { name: '' };
  assert.equal(customerHistories([first, second]).length, 1);
});

test('mensal separa aprovados e autorizados sem somar estados como vendas extras', () => {
  const approved = quote('1', '2026-01-15', 'approved', 150);
  approved.bling = { nfe: { id: 8, situacao: 5 } };
  const draft = quote('2', '2026-02-15', 'draft', 200);
  const rejected = quote('3', '2026-02-20', 'rejected', 300);
  rejected.bling = { nfe: { id: 9, situacao: 4 } };
  const sent = quote('4', '2026-03-20', 'sent', 400);
  const older = quote('5', '2025-01-15', 'approved', 999);
  const result = salesInsights([approved, draft, rejected, sent, older], 2026);
  assert.equal(result.months.length, 12);
  assert.equal(result.approvedTotal, 150);
  assert.equal(result.authorizedTotal, 150);
  assert.equal(result.approvedCount, 1);
  assert.equal(result.authorizedCount, 1);
  assert.equal(result.average, 150);
  assert.equal(result.conversion, 25);
  assert.deepEqual(result.statuses, { draft: 1, sent: 1, approved: 1, rejected: 1 });
  assert.equal(result.months[0].approved, 150);
  assert.equal(result.months[1].count, 2);
  assert.equal(result.months[11].approved, 0);
});

test('NF-e autorizada é contada sem exigir aprovação e vínculo repetido não duplica nota', () => {
  const first = quote('1');
  first.bling = { nfe: { id: 123, situacao: 5 } };
  const second = { ...quote('2'), bling: first.bling };
  const data = salesInsights([first, second], 2026);
  assert.equal(data.authorizedCount, 1);
  assert.equal(data.authorizedTotal, 100);
  assert.equal(data.approvedCount, 0);
});

test('datas são de calendário sem deslocamento UTC e valores inválidos são sinalizados', () => {
  const first = quote('1', '2026-03-01', 'approved');
  first.createdAt = '2026-02-28T23:00:00-03:00';
  assert.equal(quoteDate(first), '2026-03-01');
  const invalidDate = quote('2', '2026-02-30', 'approved', 1000);
  assert.equal(quoteDate(invalidDate), null);
  const invalidMoney = quote('3', '2026-01-01', 'approved', NaN);
  const result = salesInsights([first, invalidDate, invalidMoney], 2026);
  assert.equal(result.invalidDates, 1);
  assert.equal(result.invalidAmounts, 1);
  assert.equal(result.approvedTotal, 100);
  assert.equal(result.months[2].approved, 100);
  first.project.date = '';
  assert.equal(quoteDate(first), '2026-02-28');
});

test('vazio é zero, ranking soma aprovados e anos não se misturam', () => {
  const empty = salesInsights([], 2026);
  assert.equal(empty.average, 0);
  assert.equal(empty.conversion, 0);
  assert.equal(empty.months.every((month) => month.count === 0), true);
  const data = salesInsights([quote('1', '2026-01-01', 'approved', 100), quote('2', '2026-02-01', 'approved', 50)], 2026);
  assert.equal(data.topCustomers[0].total, 150);
  assert.equal(data.topCustomers[0].count, 2);
  assert.equal(data.average, 75);
});

test('telas renderizam navegação, ações de replicação, legendas acessíveis e estados vazios', () => {
  const customers = renderToStaticMarkup(<CustomersPage quotes={[quote('FM-001')]} onOpen={() => {}} onDuplicate={() => {}} />);
  assert.match(customers, /Pesquisar clientes/);
  assert.match(customers, /Replicar orçamento/);
  assert.match(customers, /Abrir orçamento/);
  assert.match(customers, /Fresa TCT/);
  const dashboard = renderToStaticMarkup(<SalesDashboard quotes={[]} />);
  assert.match(dashboard, /Nenhum orçamento neste ano/);
  assert.match(dashboard, /não representam recebimentos/);
  assert.match(dashboard, /role="img"/);
  assert.doesNotMatch(dashboard, /NaN|Infinity/);
});
