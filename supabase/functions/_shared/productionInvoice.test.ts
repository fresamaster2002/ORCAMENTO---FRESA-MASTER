import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertProductionInvoiceXml, verifyProductionShipmentInvoice } from './productionInvoice.ts';

const key = '35261059085330000170550020000000391000000391';
const xml = (environment = 1, status = 100, invoiceKey = key) =>
  `<nfeProc><NFe><infNFe Id="NFe${invoiceKey}"><ide><tpAmb>${environment}</tpAmb></ide></infNFe></NFe><protNFe><infProt><tpAmb>${environment}</tpAmb><chNFe>${invoiceKey}</chNFe><cStat>${status}</cStat></infProt></protNFe></nfeProc>`;

test('XML precisa confirmar a mesma chave autorizada em produção, não homologação ou XML sem protocolo', () => {
  assert.doesNotThrow(() => assertProductionInvoiceXml(xml(), key));
  assert.doesNotThrow(() => assertProductionInvoiceXml(xml(1, 150), key));
  assert.throws(() => assertProductionInvoiceXml(xml(2), key), /homologação/);
  assert.throws(() => assertProductionInvoiceXml(xml(1, 101), key), /autorização/);
  assert.throws(() => assertProductionInvoiceXml(xml(1, 100, '4'.repeat(44)), key), /autorização/);
  assert.throws(() => assertProductionInvoiceXml('<NFe><infNFe><tpAmb>1</tpAmb></infNFe></NFe>', key), /PRODUÇÃO/);
});

test('confere nota atual no Bling e lê XML sem transmitir nem alterar a NF-e', async (t) => {
  const quote = {
    bling: { nfe: { id: 123, chaveAcesso: key } }, client: { document: '59.085.330/0001-70' },
    items: [{ description: 'Fresa', quantity: 2, unitPrice: 140 }],
  };
  const nfe = {
    id: 123, situacao: 5, serie: 2, chaveAcesso: key,
    contato: { numeroDocumento: '59085330000170' },
    itens: [{ descricao: 'Fresa', quantidade: 2, valor: 140 }], xml: 'https://xml.example.invalid/invoice.xml',
  };
  const calls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: RequestInfo | URL, options?: RequestInit) => {
    calls.push(String(url));
    assert.ok(!options?.method || options.method === 'GET');
    return String(url).includes('api.bling.com.br') ? Response.json({ data: nfe }) : new Response(xml());
  });
  await verifyProductionShipmentInvoice(quote, 'test-bling');
  assert.equal(calls.length, 2);
  nfe.situacao = 2;
  await assert.rejects(verifyProductionShipmentInvoice(quote, 'test-bling'), /não está autorizada/);
  nfe.situacao = 5;
  nfe.contato.numeroDocumento = '12345678909';
  await assert.rejects(verifyProductionShipmentInvoice(quote, 'test-bling'), /destinatário/);
  nfe.contato.numeroDocumento = '59085330000170';
  nfe.itens[0].quantidade = 1;
  await assert.rejects(verifyProductionShipmentInvoice(quote, 'test-bling'), /produtos/);
});
