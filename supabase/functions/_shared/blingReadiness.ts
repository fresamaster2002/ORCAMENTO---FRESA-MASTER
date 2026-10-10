type Item = { description?: string; sku?: string; ncm?: string; quantity?: number; unitPrice?: number };
type Client = { name?: string; document?: string; ie?: string; address?: string; number?: string; neighborhood?: string; city?: string; state?: string; cep?: string };

export function blingReadinessIssues(quote: {
  items?: Item[];
  client?: Client;
  financials?: { paymentMethod?: string; shippingAmount?: number; discountAmount?: number };
}, options: { checkNcm?: boolean } = {}): string[] {
  const issues: string[] = [];
  const client = quote.client || {};
  if (!client.name?.trim()) issues.push('Informe a razão social ou nome do cliente.');
  const document = String(client.document || '').replace(/\D/g, '');
  let validDocument = false;
  if (document.length === 14) {
    try { normalizeAndValidateCnpj(document); validDocument = true; } catch { validDocument = false; }
  } else if (document.length === 11 && !/^(\d)\1+$/.test(document)) {
    const digit = (length: number) => {
      const sum = [...document.slice(0, length)].reduce((total, value, index) => total + Number(value) * (length + 1 - index), 0);
      const remainder = (sum * 10) % 11;
      return remainder === 10 ? 0 : remainder;
    };
    validDocument = Number(document[9]) === digit(9) && Number(document[10]) === digit(10);
  }
  if (!validDocument) issues.push('Confira o CPF/CNPJ do cliente, incluindo os dígitos verificadores.');
  if (document.length === 14 && !client.ie?.trim()) issues.push('Informe a IE ou a condição ISENTO confirmada do cliente.');
  for (const [field, label] of [['address', 'logradouro'], ['number', 'número'], ['neighborhood', 'bairro'], ['city', 'cidade']] as const) {
    if (!client[field]?.trim()) issues.push(`Informe ${label} do endereço fiscal.`);
  }
  if (String(client.cep || '').replace(/\D/g, '').length !== 8) issues.push('Confira o CEP do endereço fiscal.');
  if (!/^[A-Z]{2}$/.test(String(client.state || '').toUpperCase())) issues.push('Confira a UF do endereço fiscal.');
  if (!quote.items?.length) issues.push('Inclua ao menos uma ferramenta.');
  for (const [index, item] of (quote.items || []).entries()) {
    const label = item.description?.trim() || `Item ${index + 1}`;
    if (!item.description?.trim()) issues.push(`${label}: informe a descrição.`);
    const ncm = String(item.ncm || '').replace(/\D/g, '');
    if (options.checkNcm !== false && (!/^\d{8}$/.test(ncm) || ['00000000', '82077000'].includes(ncm))) issues.push(`${label}: NCM inválido ou não confirmado (${item.ncm || 'ausente'}). Consulte o cadastro do produto no Bling ou confirme o código com o contador.`);
    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) issues.push(`${label}: confira a quantidade.`);
    if (!Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) <= 0) issues.push(`${label}: confira o preço unitário.`);
  }
  if (!quote.financials?.paymentMethod?.trim()) issues.push('Informe a forma de pagamento.');
  const shipping = Number(quote.financials?.shippingAmount ?? 0);
  const discount = Number(quote.financials?.discountAmount ?? 0);
  const subtotal = (quote.items || []).reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
  if (!Number.isFinite(shipping) || shipping < 0) issues.push('Confira o valor do frete.');
  if (!Number.isFinite(discount) || discount < 0 || discount > subtotal) issues.push('Confira o desconto do pedido.');
  return issues;
}
import { normalizeAndValidateCnpj } from './cnpjLookup.ts';
