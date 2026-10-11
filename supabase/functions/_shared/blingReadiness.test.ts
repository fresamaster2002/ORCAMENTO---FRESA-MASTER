import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blingReadinessIssues } from './blingReadiness.ts';

test('mostra todas as pendências antes de criar contato ou pedido', () => {
  const issues = blingReadinessIssues({ client: {}, items: [{ description: 'Fresa', ncm: '8207.70.00', quantity: 0, unitPrice: 0 }], financials: {} });
  assert.equal(issues.some((issue) => issue.includes('SKU')), false);
  assert.ok(issues.some((issue) => issue.includes('NCM')));
  assert.ok(issues.some((issue) => issue.includes('quantidade')));
  assert.ok(issues.some((issue) => issue.includes('pagamento')));
  assert.ok(issues.some((issue) => issue.includes('endereço fiscal')));
});

test('aceita cadastro completo e classificação confirmada sem inferir dados', () => {
  assert.deepEqual(blingReadinessIssues({
    client: { name: 'Empresa Teste', document: '59085330000170', ie: '600320622110', address: 'Rua Presidente Geisel', number: '62', neighborhood: 'Jardim Santo Antonio', city: 'Salto', state: 'SP', cep: '13321472' },
    items: [{ description: 'Fresa de topo', sku: '', ncm: '8207.70.10', quantity: 1, unitPrice: 170 }],
    financials: { paymentMethod: 'Pix', shippingAmount: 27.07 },
  }), []);
});

test('pessoa física com CPF válido não exige IE nem conferência exclusiva de CNPJ', () => {
  const quote = {
    client: { name: 'Pessoa Física Teste', document: '52998224725', ie: '', address: 'Rua Teste', number: '10', neighborhood: 'Centro', city: 'Salto', state: 'SP', cep: '13321472' },
    items: [{ description: 'Fresa', ncm: '82077010', quantity: 1, unitPrice: 220 }],
    financials: { paymentMethod: 'Pix', shippingAmount: 0 },
  };
  assert.deepEqual(blingReadinessIssues(quote, { checkFiscalReview: true }), []);
  assert.ok(blingReadinessIssues({ ...quote, client: { ...quote.client, document: '52998224724' } }).some((issue) => issue.includes('verificadores')));
});
