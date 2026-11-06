import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { QuoteData } from './types';
import { goalProgress, goalRecordId, normalizeGoalRecords, productRanking, repurchaseCandidates } from './salesGrowth';
import { ProductRanking } from './components/ProductRanking';
import { RepurchasePanel } from './components/RepurchasePanel';
import { SalesGoals } from './components/SalesGoals';
import { salesInsights } from './salesInsights';

function quote(id: string, date: string, status: QuoteData['status'] = 'approved'): QuoteData {
  return {
    id, status, createdAt: `${date}T12:00:00Z`, client: { name: 'Cliente', document: '123' },
    project: { title: '', category: '', description: '', date, validityDays: 10 },
    items: [{ id: '1', description: 'Fresa TCT', sku: 'FM-TCT', unit: 'un', quantity: 2, unitPrice: 20, totalPrice: 40 }],
    shipping: { originCep: '', destinationCep: '', options: [] },
    financials: { subtotal: 40, totalAmount: 45, shippingAmount: 10, discountAmount: 5, discountPercentage: 0, taxPercentage: 0, taxAmount: 0, paymentTerms: '', paymentMethod: '' },
    observations: [], notesForClient: '',
  };
}

test('metas validam identificador, versão e centavos e não aceitam registros corrompidos', () => {
  assert.equal(goalRecordId('2026-11'), 'SALES-GOAL:2026-11');
  for (const month of ['2026-13', '2026-00', '26-11', '2026-1', '2026-11x']) assert.throws(() => goalRecordId(month));
  assert.deepEqual(normalizeGoalRecords([{ id: goalRecordId('2026-11'), quote: { version: 1, amount: 1250.45 } }]), { '2026-11': 1250.45 });
  for (const amount of [0, -1, NaN, Infinity, 1.001, '100']) {
    assert.throws(() => normalizeGoalRecords([{ id: goalRecordId('2026-11'), quote: { version: 1, amount } }]));
  }
  assert.throws(() => normalizeGoalRecords([{ id: 'another:2026-11', quote: { version: 1, amount: 100 } }]));
});

test('progresso anual compara somente meses com metas, preserva excesso e limita saldo a zero', () => {
  const months = [{ key: '2026-01', approved: 150 }, { key: '2026-02', approved: 900 }];
  assert.deepEqual(goalProgress(months, {}), { configured: 0, target: 0, achieved: 0, remaining: 0, percentage: 0 });
  assert.deepEqual(goalProgress(months, { '2026-01': 100, '2025-01': 1000 }), { configured: 1, target: 100, achieved: 150, remaining: 0, percentage: 150 });
  assert.equal(goalProgress(months, { '2026-01': 200 }).remaining, 50);
});

test('ranking agrupa SKU, separa unidades, conta pedidos sem duplicar linhas e ignora não aprovados', () => {
  const first = quote('1', '2026-10-01');
  first.items.push({ ...first.items[0], id: '2', sku: ' fm-tct ', description: 'Nome atualizado', quantity: 1, totalPrice: 20 });
  const second = quote('2', '2026-10-02');
  second.items[0].unit = 'cx';
  const result = productRanking([first, second, quote('3', '2026-10-02', 'sent')]);
  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].quantity, 3);
  assert.equal(result.products[0].orders, 1);
  assert.equal(result.products[0].revenue, 60);
  assert.equal(result.invalidItems, 0);
  assert.equal(first.items.length, 2);
});

test('ranking usa ID ou descrição quando não há SKU e sinaliza itens inválidos sem inventar faturamento', () => {
  const first = quote('1', '2026-10-01');
  first.items[0].sku = '';
  first.items.push({ ...first.items[0], id: '2', description: 'FRESA TCT', quantity: 1, totalPrice: 0 });
  first.items.push({ ...first.items[0], id: '3', quantity: NaN }, { ...first.items[0], id: '4', totalPrice: -1 });
  const result = productRanking([first], 'revenue');
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].quantity, 3);
  assert.equal(result.products[0].revenue, 40);
  assert.equal(result.invalidItems, 2);
  first.items[1].blingProductId = '123';
  assert.equal(productRanking([first]).products.length, 2);
});

test('ranking acompanha mês e ano do dashboard sem misturar períodos ou contar frete/desconto geral', () => {
  const first = quote('1', '2026-11-01');
  const second = quote('2', '2026-10-01');
  const older = quote('3', '2025-11-01');
  const pending = quote('4', '2026-11-01', 'sent');
  const result = productRanking(salesInsights([first, second, older, pending], 2026, 11).period);
  assert.equal(result.products[0].orders, 1);
  assert.equal(result.products[0].quantity, 2);
  assert.equal(result.products[0].revenue, 40);
  assert.equal(productRanking(salesInsights([first, second, older, pending], 2026).period).products[0].orders, 2);
});

test('recompra usa última aprovação, não último rascunho, e respeita fronteiras de 30/60/90 dias', () => {
  const first = quote('1', '2026-10-06');
  const draft = quote('2', '2026-11-05', 'draft');
  assert.equal(repurchaseCandidates([first, draft], '2026-11-05', 30).candidates[0].days, 30);
  assert.equal(repurchaseCandidates([first, draft], '2026-11-05', 60).candidates.length, 0);
  const recent = quote('3', '2026-10-30');
  assert.equal(repurchaseCandidates([first, recent], '2026-11-05', 30).candidates.length, 0);
  assert.equal(repurchaseCandidates([quote('4', '2026-08-07')], '2026-11-05', 90).candidates.length, 1);
  assert.throws(() => repurchaseCandidates([first], '2026-02-30', 30));
});

test('recompra separa documentos, ignora ausência de vendas, datas inválidas e compras futuras', () => {
  const first = quote('1', '2026-01-01');
  const second = quote('2', '2026-01-01');
  second.client.document = '999';
  assert.equal(repurchaseCandidates([first, second], '2026-11-05', 30).candidates.length, 2);
  assert.equal(repurchaseCandidates([quote('3', '2026-01-01', 'sent')], '2026-11-05', 30).candidates.length, 0);
  assert.equal(repurchaseCandidates([first, quote('4', '2026-12-01')], '2026-11-05', 30).candidates.length, 0);
  const invalid = repurchaseCandidates([first, quote('5', '2026-02-30')], '2026-11-05', 30);
  assert.equal(invalid.candidates.length, 0);
  assert.equal(invalid.invalidDates, 1);
});

test('telas apresentam base dos indicadores, recompra manual e metas sem falso salvamento local', () => {
  const products = renderToStaticMarkup(<ProductRanking quotes={[quote('1', '2026-01-01')]} />);
  assert.match(products, /Produtos mais vendidos/);
  assert.match(products, /Valor bruto dos itens/);
  assert.match(products, /2 un/);
  const repurchase = renderToStaticMarkup(<RepurchasePanel quotes={[quote('1', '2020-01-01')]} onOpen={() => {}} onDuplicate={() => {}} />);
  assert.match(repurchase, /Preparar novo orçamento/);
  assert.match(repurchase, /sem envio automático/);
  const goals = renderToStaticMarkup(<SalesGoals year={2026} month={11} months={[]} />);
  assert.match(goals, /Entre na conta/);
  assert.doesNotMatch(goals, /Meta salva|NaN|Infinity/);
});
