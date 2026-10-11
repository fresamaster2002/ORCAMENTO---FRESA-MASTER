type Data = Record<string, unknown>;
const object = (value: unknown): Data => value !== null && typeof value === 'object' ? value as Data : {};
const text = (value: unknown) => String(value ?? '');
const amount = (value: unknown): number | null => value == null || !Number.isFinite(Number(value)) ? null : Number(value);

export interface NfeReview {
  revision: string;
  id: string;
  numero: string;
  serie: number | null;
  situacao: number | null;
  cliente: { nome: string; documento: string; ie: string; email: string; endereco: string };
  itens: Array<{ descricao: string; unidade: string; quantidade: number | null; valor: number | null; total: number | null; ncm: string; cfop: string; impostos: Data }>;
  parcelas: Array<{ data: string; valor: number | null; formaPagamentoId: string }>;
  total: number | null;
  frete: number | null;
  seguro: number | null;
  desconto: number | null;
  despesas: number | null;
  observacoes: string;
  transportador: string;
  entrega: string;
  naturezaOperacao: string;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}

export async function nfeRevision(nfe: Data): Promise<string> {
  const { xml: _xml, linkXml: _linkXml, linkDanfe: _danfe, linkPDF: _pdf, ...fiscal } = nfe;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(fiscal))));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function address(value: unknown): string {
  const data = object(value);
  return [data.endereco, data.numero, data.complemento, data.bairro, data.municipio, data.uf, data.cep].filter((entry) => entry != null && entry !== '').join(', ');
}

export async function buildNfeReview(nfe: Data): Promise<NfeReview> {
  const client = object(nfe.contato);
  const transport = object(nfe.transporte);
  return {
    revision: await nfeRevision(nfe), id: text(nfe.id), numero: text(nfe.numero),
    serie: amount(nfe.serie), situacao: amount(nfe.situacao),
    cliente: { nome: text(client.nome), documento: text(client.numeroDocumento), ie: text(client.ie), email: text(client.email), endereco: address(client.endereco) },
    itens: (Array.isArray(nfe.itens) ? nfe.itens : []).map((value) => {
      const item = object(value);
      return { descricao: text(item.descricao), unidade: text(item.unidade), quantidade: amount(item.quantidade), valor: amount(item.valor), total: amount(item.valorTotal), ncm: text(item.classificacaoFiscal), cfop: text(item.cfop), impostos: object(item.impostos) };
    }),
    parcelas: (Array.isArray(nfe.parcelas) ? nfe.parcelas : []).map((value) => {
      const installment = object(value);
      return { data: text(installment.data), valor: amount(installment.valor), formaPagamentoId: text(object(installment.formaPagamento).id) };
    }),
    total: amount(nfe.valorNota), frete: amount(nfe.valorFrete), seguro: amount(nfe.seguro),
    desconto: amount(nfe.desconto), despesas: amount(nfe.despesas), observacoes: text(nfe.observacoes),
    transportador: text(object(transport.transportador).nome), entrega: address(transport.etiqueta),
    naturezaOperacao: text(object(nfe.naturezaOperacao).id),
  };
}

export function invoiceWritePayload(nfe: Data): Data {
  const fields = ['tipo', 'numero', 'dataOperacao', 'contato', 'naturezaOperacao', 'loja', 'operacaoComExterior', 'exportacao', 'finalidade', 'tipoNota', 'seguro', 'despesas', 'desconto', 'observacoes', 'documentoReferenciado', 'documentosReferenciados', 'itens', 'parcelas', 'transporte', 'notaFiscalProdutorRuralReferenciada', 'intermediador'];
  const payload = Object.fromEntries(fields.filter((key) => key in nfe).map((key) => [key, nfe[key]]));
  payload.transporte = { ...object(nfe.transporte), frete: nfe.valorFrete };
  return payload;
}
