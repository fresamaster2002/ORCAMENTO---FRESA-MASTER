import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatBlingError, isDuplicateBlingSale } from './blingErrors.ts';

const duplicate = {
  error: {
    type: 'VALIDATION_ERROR',
    message: 'Não foi possível salvar a venda',
    fields: [{
      code: 3,
      msg: 'Informações idênticas a última venda salva, altere alguma informação caso deseje prosseguir',
      element: '',
      namespace: 'VENDAS',
    }],
  },
};

test('mostra a causa real de rejeição de venda duplicada', () => {
  assert.equal(formatBlingError(duplicate), `${duplicate.error.message} ${duplicate.error.fields[0].msg}`);
  assert.equal(isDuplicateBlingSale(duplicate), true);
});

test('aceita message e identifica o campo inválido', () => {
  const response = { error: { message: 'Venda inválida', fields: [{ element: 'contato', message: 'Cliente obrigatório' }] } };
  assert.equal(formatBlingError(response), 'Venda inválida contato: Cliente obrigatório');
  assert.equal(isDuplicateBlingSale(response), false);
});

test('não confunde código de outros recursos com venda duplicada', () => {
  assert.equal(isDuplicateBlingSale({ error: { fields: [{ code: 3, namespace: 'CONTATOS' }] } }), false);
});

test('preserva erros sem campos e ignora estruturas inesperadas', () => {
  assert.equal(formatBlingError({ message: 'Serviço indisponível' }), 'Serviço indisponível');
  assert.equal(formatBlingError(null, 'Erro de envio'), 'Erro de envio');
  assert.equal(formatBlingError({ error: { fields: [null, { msg: 5 }] } }), 'O Bling recusou o pedido de venda.');
  assert.equal(isDuplicateBlingSale(null), false);
});
