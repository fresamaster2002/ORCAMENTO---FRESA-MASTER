import type { QuoteData } from './types';

export function blingOrderSnapshot(quote: QuoteData): string {
  return JSON.stringify({
    client: quote.client,
    date: quote.project.date,
    items: quote.items.map(({ description, sku, ncm, quantity, unit, unitPrice }) => ({ description, sku, ncm, quantity, unit, unitPrice })),
    shipping: quote.shipping,
    financials: quote.financials,
  });
}
