import type { ClientInfo, QuoteData } from './types';

export const formatMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function quoteDate(quote: QuoteData): string | null {
  const date = quote.project.date || quote.createdAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

export interface CustomerHistory {
  key: string;
  client: ClientInfo;
  quotes: QuoteData[];
}

function customerKey(client: ClientInfo): string | null {
  const document = client.document?.replace(/\D/g, '');
  const name = normalizeSearch(client.name || client.company || client.tradeName || '');
  if (!document && !name) return null;
  // Sem documento, contatos diferentes não devem ser unidos apenas pelo nome.
  return document ? `doc:${document}` : `name:${name}|${normalizeSearch(client.email || '')}|${client.phone?.replace(/\D/g, '') || ''}`;
}

export function customerHistories(quotes: QuoteData[]): CustomerHistory[] {
  const customers = new Map<string, CustomerHistory>();
  const sorted = [...quotes].sort((a, b) => (quoteDate(b) || '').localeCompare(quoteDate(a) || '') || b.createdAt.localeCompare(a.createdAt));
  for (const quote of sorted) {
    const client = quote.client;
    const key = customerKey(client);
    if (!key) continue;
    const existing = customers.get(key);
    if (existing) existing.quotes.push(quote);
    else customers.set(key, { key, client, quotes: [quote] });
  }
  return [...customers.values()];
}

export function searchCustomers(customers: CustomerHistory[], query: string): CustomerHistory[] {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  return customers.filter(({ quotes }) => {
    const text = normalizeSearch(quotes.map(({ id, client }) => [
      id, client.name, client.tradeName, client.company, client.document, client.email, client.phone, client.city, client.state,
      client.document?.replace(/\D/g, ''), client.phone?.replace(/\D/g, ''),
    ].filter(Boolean).join(' ')).join(' '));
    return terms.every((term) => text.includes(term) || /^[\d()./+-]+$/.test(term) && Boolean(term.replace(/\D/g, '')) && text.includes(term.replace(/\D/g, '')));
  });
}

export function salesInsights(quotes: QuoteData[], year: number) {
  const months = Array.from({ length: 12 }, (_, month) => ({
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    label: new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
    approved: 0, authorized: 0, count: 0,
  }));
  const statuses: Record<QuoteData['status'], number> = { draft: 0, sent: 0, approved: 0, rejected: 0 };
  const period = quotes.filter((quote) => quoteDate(quote)?.startsWith(`${year}-`));
  let approvedCount = 0;
  let authorizedCount = 0;
  const invoiceIds = new Set<string>();
  const invalidAmounts = period.filter((quote) => !Number.isFinite(quote.financials.totalAmount) || quote.financials.totalAmount < 0).length;
  const amount = (quote: QuoteData) => Number.isFinite(quote.financials.totalAmount) && quote.financials.totalAmount >= 0 ? quote.financials.totalAmount : 0;
  const customers = new Map<string, { name: string; total: number; count: number }>();
  for (const quote of period) {
    const month = months[Number(quoteDate(quote)!.slice(5, 7)) - 1];
    month.count++;
    statuses[quote.status]++;
    if (quote.status === 'approved') {
      month.approved += amount(quote);
      approvedCount++;
      const key = customerKey(quote.client) || quote.id;
      const customer = customers.get(key) || { name: quote.client.name || 'Cliente sem nome', total: 0, count: 0 };
      customer.total += amount(quote);
      customer.count++;
      customers.set(key, customer);
    }
    const invoice = quote.bling?.nfe;
    if (invoice?.situacao === 5 && !invoiceIds.has(String(invoice.id))) {
      month.authorized += amount(quote);
      authorizedCount++;
      invoiceIds.add(String(invoice.id));
    }
  }
  const approvedTotal = months.reduce((sum, month) => sum + month.approved, 0);
  const authorizedTotal = months.reduce((sum, month) => sum + month.authorized, 0);
  return {
    months, statuses, period, approvedTotal, authorizedTotal, approvedCount, authorizedCount,
    average: approvedCount ? approvedTotal / approvedCount : 0,
    conversion: period.length ? approvedCount / period.length * 100 : 0,
    topCustomers: [...customers.values()].sort((a, b) => b.total - a.total).slice(0, 5),
    invalidDates: quotes.filter((quote) => !quoteDate(quote)).length,
    invalidAmounts,
  };
}
