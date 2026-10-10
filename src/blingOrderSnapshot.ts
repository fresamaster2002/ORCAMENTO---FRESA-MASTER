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

function canonicalSnapshot(value: unknown, path = ''): unknown {
  if (Array.isArray(value)) return value.map((entry) => canonicalSnapshot(entry));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .filter(([key, entry]) => !(path === 'shipping' && key === 'options')
      && !(path === 'client' && key !== 'name' && (entry === '' || entry == null)))
    .map(([key, entry]) => [key, canonicalSnapshot(entry, key)]));
}

export function blingOrderChanged(quote: QuoteData): boolean {
  const saved = quote.bling?.orderSnapshot;
  if (!saved) return false;
  try {
    return JSON.stringify(canonicalSnapshot(JSON.parse(saved)))
      !== JSON.stringify(canonicalSnapshot(JSON.parse(blingOrderSnapshot(quote))));
  } catch (error) {
    if (error instanceof SyntaxError) return true;
    throw error;
  }
}
