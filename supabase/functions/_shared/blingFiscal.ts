import { formatBlingError } from './blingErrors.ts';
import { resolveBlingProducts } from './blingProducts.ts';
import { blingFetch } from './blingTransport.ts';
import { buildNfeReview, invoiceWritePayload, nfeRevision } from './blingNfeReview.ts';
import { clientFiscalReviewIssue } from './clientFiscalReview.ts';
import { selectedBlingNature } from './blingNature.ts';
import { DanfeDocumentError, fetchBlingDanfe } from './blingDanfe.ts';
import { hasProductionAuthorization, readBlingInvoiceXml } from './invoiceAuthorization.ts';

type Data = Record<string, unknown>;
export type FiscalItem = { sku?: string; blingProductId?: string; description: string; quantity: number; unitPrice: number; ncm?: string };
export type PaymentQuote = {
  items: FiscalItem[];
  project?: { date?: string };
  financials?: { shippingAmount?: number; insuranceAmount?: number; discountAmount?: number; paymentMethod?: string };
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

export function blingFreight(financials: PaymentQuote['financials']): number {
  const base = Number(financials?.shippingAmount || 0);
  const insurance = Number(financials?.insuranceAmount || 0);
  if (!Number.isFinite(base) || base < 0 || !Number.isFinite(insurance) || insurance < 0) throw new BlingFiscalError('Confira o frete e o seguro antes de criar ou transmitir a nota.');
  return Math.round((base + insurance) * 100) / 100;
}

export function validateFiscalItems(items: FiscalItem[]): void {
  if (!Array.isArray(items) || !items.length) throw new BlingFiscalError('Inclua ao menos um item antes de emitir.');
  for (const item of items) {
    const ncm = String(item.ncm || '').replace(/\D/g, '');
    if (!/^\d{8}$/.test(ncm) || ncm === '00000000' || ncm === '82077000') {
      throw new BlingFiscalError(`NCM inválido ou não confirmado para ${item.description}: ${item.ncm || 'não informado'}. Confirme o código vigente com o contador; 8207.70.00 não é aceito para emissão.`);
    }
    if (!String(item.description || '').trim() || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) <= 0) {
      throw new BlingFiscalError(`Confira descrição, quantidade e preço do item ${item.description} antes de emitir.`);
    }
  }
}

export async function requestBling(token: string, path: string, method = 'GET', body?: unknown): Promise<Data> {
  const response = await blingFetch(token, path, method, body);
  const data: unknown = await response.json();
  if (!response.ok) throw new BlingFiscalError(formatBlingError(data, `Falha ao consultar o Bling (HTTP ${response.status}).`), response.status, data);
  return object(data);
}

export async function resolveSaleContact(token: string, client: Data): Promise<number> {
  const document = String(client.document || '').replace(/\D/g, '');
  const indicator = client.fiscalCondition === 'contributor' ? 1 : client.fiscalCondition === 'exempt' ? 2 : 9;
  const found = records((await requestBling(token, `/contatos?numeroDocumento=${document}`)).data);
  if (found.length > 1) throw new BlingFiscalError('Mais de um contato corresponde ao documento no Bling. Confira o cadastro antes de criar a venda.', 409);
  if (found.length) {
    if (!validId(found[0].id)) throw new BlingFiscalError('O Bling não retornou ID válido do contato.', 502);
    const contact = object((await requestBling(token, `/contatos/${found[0].id}`)).data);
    if (String(contact.numeroDocumento || '').replace(/\D/g, '') !== document || Number(contact.indicadorIe) !== indicator) throw new BlingFiscalError('A condição de ICMS do contato no Bling difere da confirmada no app. Confira o cadastro no ERP; ele não foi alterado.', 409);
    return Number(found[0].id);
  }
  const phone = String(client.phone || '').replace(/\D/g, '');
  const response = await requestBling(token, '/contatos', 'POST', {
    nome: client.name, tipo: document.length === 14 ? 'J' : 'F', numeroDocumento: document, situacao: 'A',
    indicadorIe: indicator, ie: indicator === 1 ? client.ie : undefined, email: client.email || undefined,
    ...(/^\d{10,11}$/.test(phone) ? { telefone: phone } : {}),
    endereco: { geral: { endereco: client.address, numero: client.number, complemento: client.complement,
      bairro: client.neighborhood, cep: String(client.cep || '').replace(/\D/g, ''), municipio: client.city, uf: client.state } },
  });
  const id = object(response.data).id;
  if (!validId(id)) throw new BlingFiscalError('O Bling respondeu sem o ID do contato criado. Confira o cadastro antes de repetir.', 502);
  return Number(id);
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
  const shipping = blingFreight(quote.financials);
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
    ...(validId(item.blingProductId || item.sku) ? { produto: { id: Number(item.blingProductId || item.sku) } } : {}),
    ...(item.sku ? { codigo: item.sku } : {}), descricao: item.description, unidade: item.unit || 'UN',
    quantidade: Number(item.quantity), valor: Number(item.unitPrice),
  }));
}

function summarize(n: Data) {
  return { id: n.id, numero: n.numero, serie: n.serie, situacao: n.situacao, chaveAcesso: n.chaveAcesso, linkDanfe: n.linkDanfe || n.linkPDF, xml: n.xml, linkXml: n.xml, tipo: n.tipo, naturezaOperacao: n.naturezaOperacao };
}

export async function readNfe(token: string, id: string): Promise<Data> {
  const response = await requestBling(token, `/nfe/${id}`);
  const nfe = object(response.data);
  if (!validId(nfe.id) || String(nfe.id) !== id) throw new BlingFiscalError('O Bling não retornou os dados da NF-e solicitada.', 502);
  if (Number(nfe.situacao) === 6) {
    let xml: string;
    try {
      xml = await readBlingInvoiceXml(String(nfe.xml || nfe.linkXml || ''));
    } catch (error) {
      throw new BlingFiscalError(`O Bling informa “Emitida DANFE”, mas não foi possível conferir a autorização: ${error instanceof Error ? error.message : 'falha na leitura do XML'} Consulte a situação no Bling; não transmita novamente.`, 502);
    }
    if (!hasProductionAuthorization(xml, String(nfe.chaveAcesso || '').replace(/\D/g, ''))) {
      throw new BlingFiscalError('A situação “Emitida DANFE” não confirma autorização em produção no XML desta chave. Consulte a nota na SEFAZ pelo Bling antes de emitir ou enviar; não crie outra nota.', 409);
    }
    return { ...nfe, situacao: 5 };
  }
  return nfe;
}

async function fiscalIssues(token: string, nfe: Data, expectedPayment?: string, quote?: Data, reviewedNcm = false): Promise<string[]> {
  const issues: string[] = [];
  if (Number(nfe.serie) !== 2) issues.push('A NF-e precisa estar na série 2. Ajuste a série e a numeração no Bling antes de transmitir.');
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
  if (quote) {
    const expectedItems = records(quote.items);
    if (items.length !== expectedItems.length || items.some((item, index) => {
      const expected = expectedItems[index];
      return !expected || normalize(item.descricao) !== normalize(expected.description)
        || Number(item.quantidade) !== Number(expected.quantity) || Number(item.valor) !== Number(expected.unitPrice)
        || (!reviewedNcm && String(item.classificacaoFiscal || '').replace(/\D/g, '') !== String(expected.ncm || '').replace(/\D/g, ''));
    })) issues.push('Os itens/NCM da NF-e divergem do orçamento atual. Confira o pedido e a nota existentes no Bling.');
    const financials = object(quote.financials);
    const subtotal = expectedItems.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
    const expectedTotal = subtotal + blingFreight(financials) - Number(financials.discountAmount || 0);
    if (!Number.isFinite(expectedTotal) || Math.round(expectedTotal * 100) !== Math.round(total * 100)) issues.push('O total da NF-e diverge do orçamento atual.');
    if (quote.client) {
      const client = object(quote.client);
      const clientReviewIssue = clientFiscalReviewIssue(client);
      if (clientReviewIssue && Number(nfe.situacao) !== 5) issues.push(clientReviewIssue);
      const recipient = object(nfe.contato);
      const nature = object(client.operationNature);
      if (validId(nature.id) && String(object(nfe.naturezaOperacao).id) !== String(nature.id)) issues.push('A natureza da NF-e difere da selecionada no cadastro do cliente. Confira o rascunho no Bling e suas regras tributárias antes de transmitir; o app não troca somente o título sem recalcular impostos.');
      if (nature.id && Number(nfe.situacao) !== 5 && validId(recipient.id)) {
        const contact = object((await requestBling(token, `/contatos/${recipient.id}`)).data);
        const expected = client.fiscalCondition === 'contributor' ? 1 : client.fiscalCondition === 'exempt' ? 2 : 9;
        if (Number(contact.indicadorIe) !== expected) issues.push('A condição de ICMS do contato no Bling difere da confirmada no app. Confira o cadastro fiscal no ERP antes de transmitir.');
      }
      const address = object(recipient.endereco);
      const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
      if (digits(client.document) !== digits(recipient.numeroDocumento)
        || normalize(client.name) !== normalize(recipient.nome)
        || normalize(client.ie) !== normalize(recipient.ie)
        || [['address', 'endereco'], ['number', 'numero'], ['complement', 'complemento'], ['neighborhood', 'bairro'], ['city', 'municipio'], ['state', 'uf']].some(([a, b]) => normalize(client[a]) !== normalize(address[b]))
        || digits(client.cep) !== digits(address.cep)) issues.push('O destinatário/endereço fiscal da NF-e diverge do orçamento. Revise o pedido vinculado no Bling.');
    }
  }
  return issues;
}

function validateOrderMatchesQuote(order: Data, quote: Data): void {
  const saleItems = records(order.itens);
  const quoteItems = records(quote.items);
  if (saleItems.length !== quoteItems.length || saleItems.some((sale, index) => {
    const supplied = quoteItems[index];
    const sku = String(supplied?.sku || '');
    return !supplied || normalize(supplied.description) !== normalize(sale.descricao)
      || Number(supplied.quantity) !== Number(sale.quantidade) || Number(supplied.unitPrice) !== Number(sale.valor)
      || (supplied.blingProductId
        ? (validId(object(sale.produto).id)
          ? String(supplied.blingProductId) !== String(object(sale.produto).id)
          : !sku || sku !== String(sale.codigo || ''))
        : Boolean(sku) && sku !== String(sale.codigo || '') && sku !== String(object(sale.produto).id || ''));
  })) throw new BlingFiscalError('O orçamento não corresponde aos itens do pedido salvo. Confira antes de gerar a nota.', 409);
}

async function prepareDraft(token: string, nfeId: string, order: Data, input: Data): Promise<Data> {
  const draft = await readNfe(token, nfeId);
  if (Number(draft.situacao) !== 1) throw new BlingFiscalError('A NF-e vinculada não está pendente. Confira a nota existente no Bling; ela não será alterada.', 409);
  const selectedNature = object(object(object(input.quote).client).operationNature);
  if (selectedNature.id && String(object(draft.naturezaOperacao).id) !== String(selectedNature.id)) throw new BlingFiscalError('O Bling gerou a NF-e com natureza diferente da selecionada nos itens do pedido. Confira o rascunho e suas regras no Bling; não será aplicado apenas um título diferente sem recalcular impostos.', 409);
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
    items.push({ ...draftItem, codigo: draftItem.codigo || sale.codigo || supplied?.sku || String(object(sale.produto).id), classificacaoFiscal: ncm.replace(/\D/g, '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3') });
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

async function reviewInvoice(action: string, input: Data, token: string, nfeId: string): Promise<Data> {
  if (!validId(nfeId) || !validId(input.orderId) || !input.quote) throw new BlingFiscalError('Informe a nota, o pedido vinculado e o orçamento para conferir a NF-e.');
  const order = object((await requestBling(token, `/pedidos/vendas/${input.orderId}`)).data);
  if (String(object(order.notaFiscal).id) !== nfeId) throw new BlingFiscalError('A NF-e não corresponde ao pedido vinculado. Confira os vínculos no Bling.', 409);
  let nfe = await readNfe(token, nfeId);
  const quote = object(input.quote);
  const method = String(object(quote.financials).paymentMethod || '');
  const orderIssues: string[] = [];
  try { validateOrderMatchesQuote(order, quote); }
  catch (error) {
    if (!(error instanceof BlingFiscalError)) throw error;
    orderIssues.push(error.message);
  }
  if (action !== 'review') {
    if (orderIssues.length) throw new BlingFiscalError(orderIssues.join(' '), 409);
    if (input.revision !== await nfeRevision(nfe)) throw new BlingFiscalError('A NF-e mudou no Bling depois da conferência. Recarregue a nota e confira novamente.', 409);
    if (action === 'adopt-recipient') {
      if (![1, 4].includes(Number(nfe.situacao))) throw new BlingFiscalError('Só é possível conferir o destinatário de uma nota ainda não autorizada.', 409);
      const recipient = object(nfe.contato);
      const current = object(quote.client);
      const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
      if (!digits(current.document) || digits(current.document) !== digits(recipient.numeroDocumento)) throw new BlingFiscalError('O CPF/CNPJ da nota não corresponde ao cliente do orçamento.', 409);
      const address = object(recipient.endereco);
      const client = {
        name: String(recipient.nome || ''), document: String(recipient.numeroDocumento || ''),
        ie: String(recipient.ie || ''), email: String(recipient.email || ''), phone: String(recipient.telefone || ''),
        address: String(address.endereco || ''), number: String(address.numero || ''), complement: String(address.complemento || ''),
        neighborhood: String(address.bairro || ''), city: String(address.municipio || ''), state: String(address.uf || ''), cep: String(address.cep || ''),
        ...(normalize(current.ie) === normalize(recipient.ie) && normalize(current.state) === normalize(address.uf)
          ? { fiscalCondition: current.fiscalCondition, operationNature: current.operationNature ? object(current.operationNature) : undefined, registrationLookup: current.registrationLookup ? object(current.registrationLookup) : undefined }
          : {}),
      };
      if (!client.name || !client.address || !client.number || !client.neighborhood || !client.city
        || !/^[A-Z]{2}$/.test(client.state) || digits(client.cep).length !== 8) throw new BlingFiscalError('O cadastro fiscal da nota está incompleto. Confira o destinatário no Bling.', 409);
      const issues = await fiscalIssues(token, nfe, method, { ...quote, client }, true);
      const otherIssues = issues.filter((issue) => issue !== clientFiscalReviewIssue(client));
      if (otherIssues.length) throw new BlingFiscalError(otherIssues.join(' '), 409);
      return { success: true, client, nfe: summarize(nfe), review: await buildNfeReview(nfe) };
    } else if (action === 'update-draft') {
      if (Number(nfe.situacao) !== 1) throw new BlingFiscalError('Somente uma NF-e pendente pode ser editada. Notas autorizadas não serão alteradas.', 409);
      const edit = object(input.edit);
      if (Object.keys(edit).some((key) => !['itens', 'observacoes'].includes(key)) || typeof edit.observacoes !== 'string' || edit.observacoes.length > 5000) throw new BlingFiscalError('Edite somente NCM, CFOP e observações (até 5000 caracteres).');
      const sourceItems = records(nfe.itens);
      const editItems = records(edit.itens);
      if (!sourceItems.length || sourceItems.length !== editItems.length) throw new BlingFiscalError('A edição deve manter os mesmos itens da nota.');
      const updatedItems = sourceItems.map((item, index) => {
        const patch = editItems[index];
        if (Object.keys(patch).some((key) => !['ncm', 'cfop'].includes(key)) || typeof patch.ncm !== 'string' || typeof patch.cfop !== 'string') throw new BlingFiscalError('Quantidades, valores, cliente e impostos não podem ser editados nesta tela.');
        const ncm = patch.ncm.replace(/[.\s]/g, '');
        const cfop = patch.cfop.trim();
        validateFiscalItems([{ description: String(item.descricao), quantity: Number(item.quantidade), unitPrice: Number(item.valor), ncm }]);
        if (!/^[1-7]\d{3}$/.test(cfop)) throw new BlingFiscalError(`Confira o CFOP de ${item.descricao}; informe quatro dígitos válidos.`);
        return { ...item, classificacaoFiscal: ncm.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3'), cfop };
      });
      const expected = { ...nfe, itens: updatedItems, observacoes: edit.observacoes };
      await requestBling(token, `/nfe/${nfeId}`, 'PUT', invoiceWritePayload(expected));
      const updated = await readNfe(token, nfeId);
      const updatedItemsSaved = records(updated.itens);
      if (updatedItemsSaved.length !== updatedItems.length || updatedItemsSaved.some((item, index) => String(item.classificacaoFiscal).replace(/\D/g, '') !== String(updatedItems[index].classificacaoFiscal).replace(/\D/g, '') || item.cfop !== updatedItems[index].cfop)
        || String(updated.observacoes || '') !== edit.observacoes) throw new BlingFiscalError('O Bling não persistiu todas as correções. Recarregue e revise a nota; não transmita.', 409);
      const unchanged = (value: Data) => {
        const { frete: _frete, ...transport } = object(value.transporte);
        return {
          ...value, observacoes: '', transporte: transport,
          itens: records(value.itens).map(({ classificacaoFiscal: _ncm, cfop: _cfop, ...item }) => item),
        };
      };
      if (await nfeRevision(unchanged(nfe)) !== await nfeRevision(unchanged(updated))) throw new BlingFiscalError('O Bling alterou outros dados fiscais durante o salvamento. Recarregue e confira a nota antes de emitir.', 409);
      nfe = updated;
    } else if (action === 'send-reviewed') {
      const issues = await fiscalIssues(token, nfe, method, quote, true);
      if (![1, 4].includes(Number(nfe.situacao))) issues.push('A situação da NF-e não permite nova transmissão.');
      if (issues.length) throw new BlingFiscalError(issues.join(' '), 409);
      await requestBling(token, `/nfe/${nfeId}/enviar`, 'POST');
      nfe = await readNfe(token, nfeId);
    }
  }
  const issues = [...orderIssues, ...await fiscalIssues(token, nfe, method, quote, true)];
  const ncmCorrections = records(nfe.itens).some((item, index) => String(item.classificacaoFiscal || '').replace(/\D/g, '') !== String(records(quote.items)[index]?.ncm || '').replace(/\D/g, ''));
  return {
    success: true, nfeId: Number(nfeId), nfe: summarize(nfe), review: await buildNfeReview(nfe),
    fiscalIssues: issues, readyToSend: issues.length === 0 && [1, 4].includes(Number(nfe.situacao)),
    warnings: ncmCorrections ? ['O NCM desta nota difere do orçamento/catálogo. Confira a classificação corrigida com o contador; o cadastro do produto e o orçamento não foram alterados.'] : [],
  };
}

export async function handleBlingNfe(action: string, input: Data, token: string): Promise<{ status: number; body: Data }> {
  let nfeId = String(input.nfeId || '');
  try {
    if (!token) throw new BlingFiscalError('Conecte o Bling antes de emitir a NF-e.', 401);
    if (action === 'danfe-document') {
      if (!validId(nfeId) || !validId(input.orderId)) throw new BlingFiscalError('Informe a NF-e e o pedido vinculado para baixar o DANFE.');
      const order = object((await requestBling(token, `/pedidos/vendas/${input.orderId}`)).data);
      if (String(order.id) !== String(input.orderId) || String(object(order.notaFiscal).id) !== nfeId) {
        throw new BlingFiscalError('A NF-e não corresponde ao pedido vinculado. Recarregue a nota antes de baixar.', 409);
      }
      const current = await readNfe(token, nfeId);
      if (Number(current.situacao) !== 5) throw new BlingFiscalError('O download está disponível somente para NF-e autorizada.', 409);
      const document = await fetchBlingDanfe(current.linkDanfe || current.linkPDF);
      return { status: 200, body: { success: true, nfeId: Number(nfeId), numero: current.numero, serie: current.serie, clientName: object(current.contato).nome, issuedAt: current.dataEmissao, document } };
    }
    if (action === 'status') {
      if (input.orderId != null) {
        const orderId = String(input.orderId);
        if (!validId(orderId)) throw new BlingFiscalError('Informe o ID do pedido de venda do Bling.');
        const order = object((await requestBling(token, `/pedidos/vendas/${orderId}`)).data);
        if (String(order.id) !== orderId) throw new BlingFiscalError('O Bling não retornou o pedido solicitado.', 502);
        const linkedId = object(order.notaFiscal).id;
        if (!validId(linkedId)) {
          if (nfeId) throw new BlingFiscalError('A nota salva no app não está vinculada ao pedido no Bling. Confira os vínculos sem gerar outra nota.', 409);
          return { status: 200, body: { success: true, nfe: null, readyToSend: false, fiscalIssues: [], message: 'O pedido ainda não possui NF-e vinculada no Bling.' } };
        }
        if (nfeId && nfeId !== String(linkedId)) throw new BlingFiscalError('A NF-e salva difere da nota vinculada ao pedido no Bling. Confira os vínculos antes de continuar.', 409);
        nfeId = String(linkedId);
      }
      if (!validId(nfeId)) throw new BlingFiscalError('Informe o ID da NF-e ou do pedido vinculado.');
      const current = await readNfe(token, nfeId);
      return { status: 200, body: { success: true, nfeId: Number(nfeId), nfe: summarize(current), fiscalIssues: [], readyToSend: false } };
    }
    if (['review', 'update-draft', 'send-reviewed', 'adopt-recipient'].includes(action)) return { status: 200, body: await reviewInvoice(action, input, token, nfeId) };
    let nfe: Data;
    if (action === 'generate') {
      const orderId = String(input.orderId || '');
      if (!validId(orderId)) throw new BlingFiscalError('Informe o ID do pedido de venda do Bling.');
      const clientReviewIssue = clientFiscalReviewIssue(object(object(input.quote).client));
      if (clientReviewIssue) throw new BlingFiscalError(clientReviewIssue, 409);
      const order = object((await requestBling(token, `/pedidos/vendas/${orderId}`)).data);
      if (!validId(order.id)) throw new BlingFiscalError('O Bling não retornou o pedido de venda.', 502);
      const linkedId = object(order.notaFiscal).id;
      if (validId(linkedId)) nfeId = String(linkedId);
      if (input.quote) validateOrderMatchesQuote(order, object(input.quote));
      const fiscalClient = object(object(input.quote).client);
      if (fiscalClient.operationNature) {
        let nature;
        try { nature = await selectedBlingNature(token, fiscalClient); }
        catch (error) { throw new BlingFiscalError(error instanceof Error ? error.message : 'Confira a natureza da operação.', 409); }
        if (records(order.itens).some((item) => String(object(item.naturezaOperacao).id) !== nature.id)) throw new BlingFiscalError('A natureza dos itens do pedido difere da selecionada. Confira o pedido existente no Bling; nenhum novo documento foi gerado.', 409);
      }
      if (input.quote) {
        const quote = object(input.quote);
        const supplied = records(quote.items).map((item, index) => ({
          ...item,
          sku: String(item.sku || ''),
          blingProductId: String(object(records(order.itens)[index].produto).id || item.blingProductId || ''),
          description: String(item.description || ''), quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), ncm: String(item.ncm || ''),
        }));
        const resolved = await resolveBlingProducts(token, supplied);
        validateFiscalItems(resolved.items);
        input = { ...input, quote: { ...quote, items: resolved.items } };
      }
      if (!validId(linkedId)) {
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
        const issues = await fiscalIssues(token, nfe, String(input.paymentMethod || ''), input.quote ? object(input.quote) : undefined);
        if (![1, 4].includes(Number(nfe.situacao))) issues.push('A situação da NF-e não permite nova transmissão.');
        if (issues.length) throw new BlingFiscalError(issues.join(' '), 409);
        await requestBling(token, `/nfe/${nfeId}/enviar`, 'POST');
        nfe = await readNfe(token, nfeId);
      } else if (action !== 'status') throw new BlingFiscalError('Ação de NF-e não encontrada.', 404);
    }
    const method = String(input.paymentMethod || object(object(input.quote).financials).paymentMethod || '');
    const issues = await fiscalIssues(token, nfe, method, input.quote ? object(input.quote) : undefined);
    return { status: 200, body: { success: true, nfeId: Number(nfeId), nfe: summarize(nfe), fiscalIssues: issues, readyToSend: !issues.length && [1, 4].includes(Number(nfe.situacao)), ...(input.debug ? { raw: nfe } : {}) } };
  } catch (error) {
    if (error instanceof DanfeDocumentError) return { status: error.status, body: { success: false, error: error.message } };
    if (error instanceof BlingFiscalError) return { status: error.status, body: { success: false, error: error.message, details: error.details, ...(validId(nfeId) ? { nfeId: Number(nfeId), nfe: { id: Number(nfeId) }, readyToSend: false } : {}) } };
    console.error('Falha no processamento da NF-e:', error);
    return { status: 502, body: { success: false, error: 'Falha de comunicação com o Bling. Confira a nota existente antes de repetir a operação.', ...(validId(nfeId) ? { nfeId: Number(nfeId), nfe: { id: Number(nfeId) }, readyToSend: false } : {}) } };
  }
}
