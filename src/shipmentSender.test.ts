import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialSender, loadSender } from './shipmentSender';

test('remetente usa o CEP oficial e preserva o CEP salvo pelo operador', (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let saved: string | null = null;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => saved },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  assert.equal(initialSender.cep, '13321-472');
  assert.equal(loadSender().cep, '13321-472');
  for (const cep of ['13321-472', '13329-350', '80010-000']) {
    saved = JSON.stringify({ cep });
    assert.equal(loadSender().cep, cep);
  }
});
