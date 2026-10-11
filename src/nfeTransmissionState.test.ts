import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nfeTransmissionBlock } from './nfeTransmissionState.ts';

const ready = { situation: 1, busy: false, dirty: false, ready: true, confirmed: true, orderChanged: false, error: null };

test('transmissão exige revisão válida, confirmação e orçamento correspondente', () => {
  assert.equal(nfeTransmissionBlock(ready), null);
  assert.equal(nfeTransmissionBlock({ ...ready, situation: 4 }), null);
  for (const state of [
    { situation: 5 }, { situation: null }, { busy: true }, { dirty: true },
    { ready: false }, { confirmed: false }, { orderChanged: true }, { error: 'Falha' },
  ]) assert.ok(nfeTransmissionBlock({ ...ready, ...state }));
});

test('motivos orientam salvar, confirmar, recarregar ou revisar sem liberar indevidamente', () => {
  assert.match(nfeTransmissionBlock({ ...ready, dirty: true, confirmed: false })!, /Salve/);
  assert.match(nfeTransmissionBlock({ ...ready, confirmed: false })!, /Marque/);
  assert.match(nfeTransmissionBlock({ ...ready, error: 'Falha', ready: false })!, /Recarregue/);
  assert.match(nfeTransmissionBlock({ ...ready, orderChanged: true, confirmed: false })!, /difere/);
  assert.match(nfeTransmissionBlock({ ...ready, situation: 5, orderChanged: true })!, /já está autorizada/);
});
