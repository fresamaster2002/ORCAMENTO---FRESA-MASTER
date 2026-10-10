import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blingReadinessIssues } from './blingReadiness.ts';

test('mostra todas as pendências antes de criar contato ou pedido', () => {
  const issues = blingReadinessIssues({ client: {}, items: [{ description: 'Fresa', ncm: '8207.70.00', quantity: 0, unitPrice: 0 }], financials: {} });
  assert.ok(issues.some((issue) => issue.includes('SKU')));
  assert.ok(issues.some((issue) => issue.includes('NCM')));
  assert.ok(issues.some((issue) => issue.includes('quantidade')));
  assert.ok(issues.some((issue) => issue.includes('pagamento')));
  assert.ok(issues.some((issue) => issue.includes('endereço fiscal')));
});

test('aceita cadastro completo e classificação confirmada sem inferir dados', () => {
  assert.deepEqual(blingReadinessIssues({
    client: { name: 'Empresa Teste', document: '59085330000170', ie: '600320622110', address: 'Rua Presidente Geisel', number: '62', neighborhood: 'Jardim Santo Antonio', city: 'Salto', state: 'SP', cep: '13321472' },
    items: [{ description: 'Fresa de topo', sku: 'FM-TCT-6X22', ncm: '8207.70.10', quantity: 1, unitPrice: 170 }],
    financials: { paymentMethod: 'Pix', shippingAmount: 27.07 },
  }), []);
});
