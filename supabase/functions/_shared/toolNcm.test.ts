import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_FRESA_NCM, resolveToolNcm } from './toolNcm.ts';

test('NCM padrão de fresas substitui somente ausente ou legado', () => {
  assert.equal(DEFAULT_FRESA_NCM, '8207.70.10');
  for (const ncm of [undefined, '', '8207.70.00', '82077000']) {
    for (const description of ['Fresa TCT', 'Fresas helicoidais', 'FRESA V-Bit']) {
      assert.equal(resolveToolNcm(ncm, description), DEFAULT_FRESA_NCM);
    }
  }
  assert.equal(resolveToolNcm('8207.70.90', 'Fresa TCT'), '8207.70.90');
  assert.equal(resolveToolNcm('00000000', 'Fresa TCT'), '00000000');
  assert.equal(resolveToolNcm('8466.10.00', 'Pinça ER20'), '8466.10.00');
  assert.equal(resolveToolNcm('', 'Pinça ER20'), '');
  assert.equal(resolveToolNcm('8207.70.00', 'Produto avulso'), '8207.70.00');
});
