import type { QuoteData } from './types';

export function adoptBlingRecipient(quote: QuoteData, client: QuoteData['client']): string {
  if (blingOrderChanged(quote)) throw new Error('O orçamento mudou após salvar a venda. Não é possível adotar apenas o destinatário; confira todas as diferenças.');
  const saved = quote.bling?.orderSnapshot;
  if (!saved) throw new Error('A venda não possui uma referência salva para conferir o destinatário.');
  const snapshot = JSON.parse(saved);
  const digits = (value: unknown) => String(value || '').replace(/\D/g, '');
  if (!digits(client.document) || digits(snapshot.client?.document) !== digits(client.document)
    || digits(quote.client.document) !== digits(client.document)) throw new Error('O CPF/CNPJ do destinatário não corresponde à venda salva.');
  return JSON.stringify({ ...snapshot, client });
}

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
      && !(path === 'client' && key === 'fiscalReviewKey')
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
