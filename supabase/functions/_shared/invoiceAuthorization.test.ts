import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasProductionAuthorization } from './invoiceAuthorization.ts';
import { handleBlingNfe } from './blingFiscal.ts';

const key = '1'.repeat(44);
const xml = `<nfeProc><NFe><infNFe Id="NFe${key}"><ide><tpAmb>1</tpAmb></ide></infNFe></NFe><protNFe><infProt><tpAmb>1</tpAmb><chNFe>${key}</chNFe><cStat>100</cStat><nProt>123456789</nProt></infProt></protNFe></nfeProc>`;

test('exige protocolo de autorização de produção da mesma chave', () => {
  assert.equal(hasProductionAuthorization(xml, key), true);
  assert.equal(hasProductionAuthorization(xml.replace('100', '150'), key), true);
  for (const invalid of [
    xml.replace('<cStat>100', '<cStat>204'),
    xml.replace('<tpAmb>1', '<tpAmb>2'),
    xml.replace(/<nProt>.*?<\/nProt>/, ''),
    xml.replace(`Id="NFe${key}"`, `Id="NFe${'2'.repeat(44)}"`),
    xml.replace(`<chNFe>${key}`, `<chNFe>${'2'.repeat(44)}`),
  ]) assert.equal(hasProductionAuthorization(invalid, key), false);
});

test('Emitida DANFE com XML autorizado é somente consulta, sem retransmissão', async (t) => {
  let source = xml;
  t.mock.method(globalThis, 'fetch', async (_input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(init?.method || 'GET', 'GET');
    return Response.json({ data: { id: 33, situacao: 6, serie: 2, chaveAcesso: key, xml: source } });
  });
  const valid = await handleBlingNfe('status', { nfeId: 33 }, 'test');
  assert.equal(valid.status, 200);
  assert.equal((valid.body.nfe as Record<string, unknown>).situacao, 5);
  assert.equal(valid.body.readyToSend, false);
  source = xml.replace('<cStat>100', '<cStat>204');
  const invalid = await handleBlingNfe('status', { nfeId: 33 }, 'test');
  assert.equal(invalid.status, 409);
  assert.equal(invalid.body.success, false);
});

test('falha ao ler XML nunca libera autorização nem acesso a host arbitrário', async (t) => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    requests++;
    return Response.json({ data: { id: 33, situacao: 6, xml: 'https://example.com/private', chaveAcesso: key } });
  });
  const result = await handleBlingNfe('status', { nfeId: 33 }, 'test');
  assert.equal(result.status, 502);
  assert.equal(requests, 1);
  assert.equal(result.body.success, false);
});
