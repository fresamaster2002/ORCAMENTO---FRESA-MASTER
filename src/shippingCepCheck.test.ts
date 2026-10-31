import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cepCheckFingerprint, readCepCheck } from './shippingCepCheck';
import type { ShippingInfo } from './types';

const shipping: ShippingInfo = { originCep: '13329-350', destinationCep: '15055-000', options: [], weightKg: 0.5 };

test('verificação separa serviços oficiais, recusa de CEP, indisponibilidade e erro de comunicação', async () => {
  assert.deepEqual(await readCepCheck(Response.json({ success: true, environment: 'production', status: 'available', services: [{ id: 2, name: 'Sedex' }] })), { state: 'available', services: [{ id: 2, name: 'Sedex' }] });
  assert.equal((await readCepCheck(Response.json({ success: false, error: 'O campo cep_destino está invalido' }, { status: 422 }))).state, 'invalid-destination');
  assert.equal((await readCepCheck(Response.json({ success: true, environment: 'production', status: 'unavailable', services: [] }))).state, 'unavailable');
  for (const error of ['Conexão indisponível', 'CEP de origem recusado', 'Token expirado']) {
    assert.equal((await readCepCheck(Response.json({ success: false, error }, { status: 502 }))).state, 'unverified');
  }
  await assert.rejects(readCepCheck(Response.json({ success: true, environment: 'sandbox', status: 'available', services: [{ id: 2, name: 'Sedex' }] })), /Resposta inválida/);
  await assert.rejects(readCepCheck(Response.json({ success: true, environment: 'production', status: 'available', services: [] })), /Lista de serviços inválida/);
});

test('ciência não muda preço ou cotação e só vale para rota, pacote, seguro e valor conferidos', () => {
  const fingerprint = cepCheckFingerprint(shipping, []);
  assert.equal(cepCheckFingerprint({ ...shipping, destinationCep: '15055000', cepWarningAcknowledgement: { fingerprint, acknowledgedAt: '2026-10-30' } }, []), fingerprint);
  for (const patch of [
    { destinationCep: '15082-488' }, { originCep: '13321-472' }, { weightKg: 1 },
    { insuranceEnabled: true }, { packageDimensions: { height: 10, width: 15, length: 20 } },
  ]) assert.notEqual(cepCheckFingerprint({ ...shipping, ...patch }, []), fingerprint);
  assert.equal(shipping.cepWarningAcknowledgement, undefined);
});
