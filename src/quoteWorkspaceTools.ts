import type { QuoteData } from './types';

export const quoteStatusLabels: Record<QuoteData['status'], string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  approved: 'Aprovado',
  rejected: 'Não aprovado',
};

const searchable = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function filterQuotes(quotes: QuoteData[], query: string, status: QuoteData['status'] | 'all') {
  const terms = searchable(query.trim()).split(/\s+/).filter(Boolean);
  return quotes.filter((quote) => {
    if (status !== 'all' && quote.status !== status) return false;
    const text = searchable([quote.id, quote.client.name, quote.client.tradeName, quote.client.document,
      quote.client.document?.replace(/\D/g, '')].filter(Boolean).join(' '));
    return terms.every((term) => text.includes(term) || /^\d[.\d/-]+$/.test(term) && text.includes(term.replace(/\D/g, '')));
  });
}

export function duplicateQuote(source: QuoteData, empty: QuoteData): QuoteData {
  const subtotal = source.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const discountAmount = Math.min(subtotal, Math.max(0, source.financials.discountPercentage > 0
    ? subtotal * source.financials.discountPercentage / 100 : source.financials.discountAmount));
  return {
    ...empty,
    status: 'draft',
    client: { ...structuredClone(source.client), fiscalReviewKey: undefined },
    project: { ...source.project, date: empty.project.date, deadline: '' },
    items: source.items.map((item, index) => ({
      ...item, id: `${empty.id}-item-${index + 1}`, totalPrice: item.quantity * item.unitPrice,
    })),
    shipping: {
      ...empty.shipping,
      originCep: source.shipping.originCep,
      destinationCep: source.shipping.destinationCep,
      deliveryAddress: source.shipping.deliveryAddress ? { ...source.shipping.deliveryAddress } : undefined,
      packageDimensions: source.shipping.packageDimensions ? { ...source.shipping.packageDimensions } : empty.shipping.packageDimensions,
      weightKg: source.shipping.weightKg,
      weightDescription: source.shipping.weightDescription,
      insuranceEnabled: source.shipping.insuranceEnabled,
      declaredValue: subtotal,
      insuranceAmount: 0,
      options: [],
      selectedOption: undefined,
    },
    financials: {
      ...source.financials, subtotal, discountAmount, shippingAmount: 0, insuranceAmount: 0,
      totalAmount: Number(Math.max(0, subtotal - discountAmount).toFixed(2)),
    },
    observations: [...source.observations],
    notesForClient: source.notesForClient,
    bling: undefined,
    sandboxShipment: undefined,
    productionShipment: undefined,
  };
}
