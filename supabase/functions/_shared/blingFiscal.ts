import { formatBlingError } from './blingErrors.ts';

type Data = Record<string, unknown>;
export type FiscalItem = { sku?: string; description: string; quantity: number; unitPrice: number; ncm?: string };
export type PaymentQuote = {
  items: FiscalItem[];
  project?: { date?: string };
  financials?: { shippingAmount?: number; discountAmount?: number; paymentMethod?: string };
};

function object(value: unknown): Data {
  return value !== null && typeof value === 'object' ? value as Data : {};
}

function records(value: unknown): Data[] {
  return Array.isArray(value) ? value.map(object) : [];
}

const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const validId = (value: unknown) => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0;

export class BlingFiscalError extends Error {
  constructor(message: string, public status = 400, public details?: unknown) {
    super(message);
  }
}

export function validateFiscalItems(items: FiscalItem[]): void {
  if (!Array.isArray(items) || !items.length) throw new BlingFiscalError('Inclua ao menos um item antes de emitir.');
  for (const item of items) {
    const ncm = String(item.ncm || '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(ncm) || ncm === '00000000' || ncm === '82077000') {
      throw new BlingFiscalError(`NCM inválido ou não confirmado para ${item.description}: ${item.ncm || 'não informado'}. Confirme o código vigente com o contador; 8207.70.00 não é aceito para emissão.`);
    }
    if (!String(item.sku || '').trim() || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) <= 0) {
      throw new BlingFiscalError(`Confira SKU, quantidade e preço do item ${item.description} antes de emitir.`);
    }
  }
}

async function requestBling(token: string, path: string, method = 'GET', body?: unknown): Promise<Data> {
  const response = await fetch(`https://api.bling.com.br/Api/v3${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  const data: unknown = await response.json();
  if (!response.ok) throw new BlingFiscalError(formatBlingError(data, `Falha ao consultar o Bling (HTTP ${response.status}).`), response.status, data);
  return object(data);
}

export async function resolvePayment(token: string, method: string): Promise<number> {
  const name = normalize(method);
  if (!name) throw new BlingFiscalError('Informe a forma de pagamento do orçamento.');
  const matches: Data[] = [];
  for (let page = 1; ; page++) {
    const response = await requestBling(token, `/formas-pagamentos?pagina=${page}&limite=100&situacao=1&descricao=${encodeURIComponent(method.trim())}`);
    if (!Array.isArray(response.data)) throw new BlingFiscalError('O Bling não retornou a lista de formas de pagamento.', 502);
    const entries = records(response.data);
    matches.push(...entries.filter((entry) => normalize(entry.descricao) === name && Number(entry.situacao) === 1 && [2, 3].includes(Number(entry.finalidade)) && validId(entry.id)));
    if (entries.length < 100) break;
    if (page >= 100) throw new BlingFiscalError('A consulta de formas de pagamento excedeu o limite de páginas.', 502);
  }
  if (matches.length !== 1) throw new BlingFiscalError(`Cadastre ou confira uma única forma de recebimento ativa "${method}" no Bling. Nenhuma forma alternativa será usada automaticamente.`);
  const payment = matches[0];
  if (name === 'pix' && ![17, 20].includes(Number(payment.tipoPagamento))) {
    throw new BlingFiscalError('A forma Pix do Bling está cadastrada com tipo fiscal diferente de Pix. Confira seu cadastro antes de emitir.');
  }
  return Number(payment.id);
}

export async function buildSalePayment(token: string, quote: PaymentQuote) {
  validateFiscalItems(quote.items);
  if (!token) throw new BlingFiscalError('Conecte o Bling para resolver a forma de pagamento antes de exportar ou criar a venda.', 401);
  const paymentId = await resolvePayment(token, quote.financials?.paymentMethod || 'Pix');
  const subtotal = quote.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
  const shipping = Number(quote.financials?.shippingAmount || 0);
  const discount = Number(quote.financials?.discountAmount || 0);
  if (!Number.isFinite(shipping) || shipping < 0 || !Number.isFinite(discount) || discount < 0 || discount > subtotal) throw new BlingFiscalError('Confira os valores de frete e desconto antes de criar a venda.');
  const total = Math.round((subtotal + shipping - discount) * 100) / 100;
  return {
    parcelas: [{ dataVencimento: quote.project?.date || new Date().toISOString().slice(0, 10), valor: total, formaPagamento: { id: paymentId } }],
    ...(discount > 0 ? { desconto: { valor: discount, unidade: 'REAL' } } : {}),
  };
}

export function buildSaleItems(items: Array<FiscalItem & { unit?: string }>) {
  return items.map((item) => ({
    ...(/^\d+$/.test(String(item.sku || '')) ? { produto: { id: Number(item.sku) } } : {}),
    codigo: item.sku, descricao: item.description, unidade: item.unit || 'UN',
    quantidade: Number(item.quantity), valor: Number(item.unitPrice),
  }));
}

function summarize(n: Data) {
  return { id: n.id, numero: n.numero, serie: n.serie, situacao: n.situacao, chaveAcesso: n.chaveAcesso, linkDanfe: n.linkDanfe || n.linkPDF, xml: n.xml, linkXml: n.xml, tipo: n.tipo };
}

async function readNfe(token: string, id: string): Promise<Data> {
  const response = await requestBling(token, `/nfe/${id}`);
  const nfe = object(response.data);
  if (!validId(nfe.id)) throw new BlingFiscalError('O Bling não retornou os dados da NF-e.', 502);
  return nfe;
}

async function fiscalIssues(token: string, nfe: Data, expectedPayment?: string): Promise<string[]> {
  const issues: string[] = [];
  const items = records(nfe.itens);
  if (!items.length) issues.push('A NF-e não contém itens.');
  items.forEach((item) => {
    const ncm = String(item.classificacaoFiscal || '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(ncm) || ['00000000', '82077000'].includes(ncm)) issues.push(`NCM inválido ou não confirmado: ${item.descricao}. Revise a classificação fiscal no Bling.`);
    if (!/^\d{4}$/.test(String(item.cfop || '')) || String(item.cfop) === '0000') issues.push(`CFOP ausente ou inválido: ${item.descricao}.`);
  });
  const installments = records(nfe.parcelas);
  const total = Number(nfe.valorNota);
  const paid = installments.reduce((sum, p) => sum + Number(p.valor), 0);
  if (!Number.isFinite(total) || !Number.isFinite(paid) || Math.round(total * 100) !== Math.round(paid * 100)) issues.push('O valor das parcelas não corresponde ao total da NF-e.');
  if (!installments.length || installments.some((p) => !validId(object(p.formaPagamento).id))) issues.push('A NF-e não possui forma de pagamento válida em todas as parcelas.');
  else if (expectedPayment) {
    const expectedId = await resolvePayment(token, expectedPayment);
    if (installments.some((p) => Number(object(p.formaPagamento).id) !== expectedId)) issues.push(`O pagamento da NF-e não corresponde a "${expectedPayment}" do orçamento.`);
  }
  return issues;
}

async function prepareDraft(token: string, nfeId: string, order: Data, input: Data): Promise<Data> {
  const draft = await readNfe(token, nfeId);
  if (Number(draft.situacao) !== 1) throw new BlingFiscalError('A NF-e vinculada não está pendente. Confira a nota existente no Bling; ela não será alterada.', 409);
  const saleItems = records(order.itens);
  const draftItems = records(draft.itens);
  const quote = object(input.quote);
  const quoteItems = records(quote.items);
  if (!saleItems.length || draftItems.length !== saleItems.length || (quoteItems.length && quoteItems.length !== saleItems.length)) throw new BlingFiscalError('Os itens da nota, pedido e orçamento não correspondem. Confira no Bling.', 409);
  const items: Data[] = [];
  for (let index = 0; index < saleItems.length; index++) {
    const sale = saleItems[index];
    const draftItem = draftItems[index];
    const supplied = quoteItems[index];
    if (normalize(sale.descricao) !== normalize(draftItem.descricao) || Number(sale.quantidade) !== Number(draftItem.quantidade) || Number(sale.valor) !== Number(draftItem.valor)) throw new BlingFiscalError('Os itens da nota não correspondem ao pedido. Não foi aplicado ajuste automático.', 409);
    let ncm: string;
    if (supplied) {
      const sku = String(supplied.sku || '');
      if (normalize(supplied.description) !== normalize(sale.descricao) || Number(supplied.quantity) !== Number(sale.quantidade) || Number(supplied.unitPrice) !== Number(sale.valor) || (sku !== String(sale.codigo || '') && sku !== String(object(sale.produto).id || ''))) throw new BlingFiscalError('O orçamento não corresponde aos itens do pedido salvo. Confira antes de gerar a nota.', 409);
      ncm = String(supplied.ncm || '');
    } else {
      const productId = object(sale.produto).id;
      if (!validId(productId)) throw new BlingFiscalError('Envie o orçamento com o NCM confirmado ou vincule os produtos do pedido ao catálogo do Bling.');
      const product = object((await requestBling(token, `/produtos/${productId}`)).data);
      ncm = String(object(product.tributacao).ncm || '');
    }
    validateFiscalItems([{ sku: String(sale.codigo || object(sale.produto).id || ''), description: String(sale.descricao), quantity: Number(sale.quantidade), unitPrice: Number(sale.valor), ncm }]);
    const uf = String(object(object(draft.contato).endereco).uf || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(uf) || uf === 'EX') throw new BlingFiscalError('Confira a UF do destinatário antes de ajustar o CFOP.');
    items.push({ ...draftItem, codigo: draftItem.codigo || sale.codigo || supplied?.sku || String(object(sale.produto).id), classificacaoFiscal: ncm.replace(/\D/g, '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3'), cfop: uf === 'SP' ? '5102' : '6102' });
  }
  const parcelas = records(order.parcelas).map((p) => ({ data: p.dataVencimento, valor: p.valor, observacoes: p.observacoes, caut: p.caut, formaPagamento: p.formaPagamento }));
  if (!parcelas.length || parcelas.some((p) => !validId(object(p.formaPagamento).id))) throw new BlingFiscalError('O pedido não possui pagamento válido. Confira a forma de pagamento no Bling.');
  const saleDiscount = object(order.desconto);
  const subtotal = saleItems.reduce((sum, item) => sum + Number(item.quantidade) * Number(item.valor), 0);
  const discountValue = Number(saleDiscount.valor ?? object(quote.financials).discountAmount ?? 0);
  const discount = saleDiscount.unidade === 'PERCENTUAL' ? subtotal * discountValue / 100 : discountValue;
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) throw new BlingFiscalError('O desconto do pedido não é válido. Confira antes de ajustar a nota.');
  const { id: _id, situacao: _s, chaveAcesso: _c, xml: _x, linkDanfe: _d, linkPDF: _p, dataEmissao: _e, valorNota: _v, valorFrete, numeroPedidoLoja: _n, ...rest } = draft;
  await requestBling(token, `/nfe/${nfeId}`, 'PUT', { ...rest, desconto: Math.round(discount * 100) / 100, despesas: Number(order.outrasDespesas) || 0, itens: items, parcelas, transporte: { ...object(rest.transporte), frete: Number(valorFrete) || 0 } });
  const updated = await readNfe(token, nfeId);
  const savedItems = records(updated.itens);
  if (savedItems.length !== items.length || savedItems.some((item, i) => String(item.classificacaoFiscal).replace(/\D/g, '') !== String(items[i].classificacaoFiscal).replace(/\D/g, '') || String(item.cfop) !== String(items[i].cfop))) throw new BlingFiscalError('O Bling não persistiu NCM/CFOP conforme solicitado. Revise o rascunho; não transmita.', 409);
  if (Math.round(Number(updated.valorNota) * 100) !== Math.round(Number(draft.valorNota) * 100) || Math.round(Number(updated.valorFrete) * 100) !== Math.round(Number(draft.valorFrete) * 100)) throw new BlingFiscalError('O Bling alterou o total ou frete durante o ajuste. Revise o rascunho; não transmita.', 409);
  return updated;
}

export async function handleBlingNfe(action: string, input: Data, token: string): Promise<{ status: number; body: Data }> {
  let nfeId = String(input.nfeId || '');
  try {
    if (!token) throw new BlingFiscalError('Conecte o Bling antes de emitir a NF-e.', 401);
    let nfe: Data;
    if (action === 'generate') {
      const orderId = String(input.orderId || '');
      if (!validId(orderId)) throw new BlingFiscalError('Informe o ID do pedido de venda do Bling.');
      if (input.quote) validateFiscalItems(records(object(input.quote).items).map((item) => ({ sku: String(item.sku || ''), description: String(item.description || ''), quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), ncm: String(item.ncm || '') })));
      const order = object((await requestBling(token, `/pedidos/vendas/${orderId}`)).data);
      if (!validId(order.id)) throw new BlingFiscalError('O Bling não retornou o pedido de venda.', 502);
      const linkedId = object(order.notaFiscal).id;
      if (validId(linkedId)) nfeId = String(linkedId);
      else {
        const response = await requestBling(token, `/pedidos/vendas/${orderId}/gerar-nfe`, 'POST');
        const data = object(response.data);
        const generatedId = response.idNotaFiscal ?? data.idNotaFiscal ?? data.id;
        if (!validId(generatedId)) throw new BlingFiscalError('O Bling respondeu sem o ID da NF-e. Confira o pedido antes de tentar gerar novamente.', 502);
        nfeId = String(generatedId);
      }
      nfe = await prepareDraft(token, nfeId, order, input);
    } else {
      if (!validId(nfeId)) throw new BlingFiscalError('Informe o ID da NF-e.');
      nfe = await readNfe(token, nfeId);
      if (input.fix) throw new BlingFiscalError('Para ajustar o rascunho, use a geração com o pedido e orçamento correspondentes.');
      if (action === 'send') {
        const issues = await fiscalIssues(token, nfe, String(input.paymentMethod || ''));
        if (![1, 4].includes(Number(nfe.situacao))) issues.push('A situação da NF-e não permite nova transmissão.');
        if (issues.length) throw new BlingFiscalError(issues.join(' '), 409);
        await requestBling(token, `/nfe/${nfeId}/enviar`, 'POST');
        nfe = await readNfe(token, nfeId);
      } else if (action !== 'status') throw new BlingFiscalError('Ação de NF-e não encontrada.', 404);
    }
    const method = String(input.paymentMethod || object(object(input.quote).financials).paymentMethod || '');
    const issues = await fiscalIssues(token, nfe, method);
    return { status: 200, body: { success: true, nfeId: Number(nfeId), nfe: summarize(nfe), fiscalIssues: issues, readyToSend: !issues.length && [1, 4].includes(Number(nfe.situacao)), ...(input.debug ? { raw: nfe } : {}) } };
  } catch (error) {
    if (error instanceof BlingFiscalError) return { status: error.status, body: { success: false, error: error.message, details: error.details, ...(validId(nfeId) ? { nfeId: Number(nfeId), nfe: { id: Number(nfeId) }, readyToSend: false } : {}) } };
    console.error('Falha no processamento da NF-e:', error);
    return { status: 502, body: { success: false, error: 'Falha de comunicação com o Bling. Confira a nota existente antes de repetir a operação.', ...(validId(nfeId) ? { nfeId: Number(nfeId), nfe: { id: Number(nfeId) }, readyToSend: false } : {}) } };
  }
}
