import { readNfe } from './blingFiscal.ts';
import { ProductionShipmentError } from './productionShipment.ts';

type Data = Record<string, unknown>;
const object = (value: unknown): Data => value && typeof value === 'object' ? value as Data : {};
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
const content = (xml: string, tag: string) => xml.match(new RegExp(`<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`, 'i'))?.[1]?.trim() || '';

export function assertProductionInvoiceXml(xml: string, key: string) {
  const info = content(xml, 'infNFe');
  const protocol = content(xml, 'infProt');
  const invoiceId = xml.match(/<(?:[\w-]+:)?infNFe\b[^>]*\bId=["']NFe(\d{44})["']/i)?.[1];
  if (content(info, 'tpAmb') !== '1' || content(protocol, 'tpAmb') !== '1') {
    throw new ProductionShipmentError('O XML da NF-e não confirma ambiente de PRODUÇÃO. Notas de homologação não podem acompanhar envios reais.');
  }
  if (invoiceId !== key || content(protocol, 'chNFe') !== key || !['100', '150'].includes(content(protocol, 'cStat'))) {
    throw new ProductionShipmentError('O XML não confirma a autorização da chave desta NF-e. Consulte a nota correta no Bling antes de criar o envio real.');
  }
}

export async function verifyProductionShipmentInvoice(quote: Data, token: string) {
  if (!token) throw new ProductionShipmentError('Conecte o Bling para conferir a NF-e de produção antes do envio real.');
  const linked = object(object(quote.bling).nfe);
  const id = String(linked.id || '');
  if (!/^\d+$/.test(id)) throw new ProductionShipmentError('O orçamento precisa estar vinculado à NF-e autorizada no Bling.');
  const nfe = await readNfe(token, id);
  const key = digits(linked.chaveAcesso);
  if (Number(nfe.situacao) !== 5 || Number(nfe.serie) !== 2 || digits(nfe.chaveAcesso) !== key) {
    throw new ProductionShipmentError('A nota atual no Bling não está autorizada na série 2 ou sua chave difere da salva. Atualize a consulta antes de criar o envio real.');
  }
  if (digits(object(nfe.contato).numeroDocumento) !== digits(object(quote.client).document)) {
    throw new ProductionShipmentError('O CPF/CNPJ do cliente difere do destinatário da NF-e. Confira a nota e o orçamento.');
  }
  const items = Array.isArray(quote.items) ? quote.items.map(object) : [];
  const invoiceItems = Array.isArray(nfe.itens) ? nfe.itens.map(object) : [];
  const normalize = (value: unknown) => String(value || '').trim().toLocaleLowerCase('pt-BR');
  if (!items.length || items.length !== invoiceItems.length || items.some((item, index) => {
    const actual = invoiceItems[index];
    return normalize(item.description) !== normalize(actual.descricao)
      || Number(item.quantity) !== Number(actual.quantidade) || Number(item.unitPrice) !== Number(actual.valor);
  })) throw new ProductionShipmentError('Os produtos do orçamento diferem da NF-e autorizada. Confira a nota antes de enviar.');
  const source = typeof nfe.xml === 'string' ? nfe.xml : typeof nfe.linkXml === 'string' ? nfe.linkXml : '';
  let xml = source;
  if (!source.trim().startsWith('<')) {
    let url: URL;
    try { url = new URL(source); }
    catch { throw new ProductionShipmentError('O Bling não disponibilizou o XML para confirmar o ambiente da nota. Atualize a consulta no Bling.'); }
    if (url.protocol !== 'https:') throw new ProductionShipmentError('O link do XML retornado pelo Bling não é seguro.', 502);
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new ProductionShipmentError('Não foi possível ler o XML atual do Bling. Nenhum envio real foi criado.', 502);
    xml = await response.text();
  }
  if (xml.length > 2 * 1024 * 1024) throw new ProductionShipmentError('O XML excedeu o limite de conferência. Revise a nota no Bling.', 502);
  assertProductionInvoiceXml(xml, key);
}
