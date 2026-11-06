import type { QuoteData } from './types';
import { customerHistories, normalizeSearch, quoteDate } from './salesInsights';
import { isCalendarDate } from './commercialTracking';

export const SALES_GOAL_PREFIX = 'SALES-GOAL:';
export type SalesGoals = Record<string, number>;

export function goalRecordId(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month) || !isCalendarDate(`${month}-01`)) {
    throw new Error('Selecione um mês válido para a meta.');
  }
  return `${SALES_GOAL_PREFIX}${month}`;
}

export function normalizeGoalRecords(rows: { id: string; quote: unknown }[]): SalesGoals {
  const goals: SalesGoals = {};
  for (const row of rows) {
    const month = row.id.slice(SALES_GOAL_PREFIX.length);
    if (row.id !== goalRecordId(month)) throw new Error('Identificação de meta inválida na nuvem.');
    const value = row.quote;
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1 ||
      !('amount' in value) || typeof value.amount !== 'number' || !Number.isSafeInteger(Math.round(value.amount * 100)) ||
      value.amount <= 0 || Math.abs(value.amount * 100 - Math.round(value.amount * 100)) > 0.00001) {
      throw new Error(`A meta de ${month} está inválida. Confira o registro antes de continuar.`);
    }
    goals[month] = value.amount;
  }
  return goals;
}

export function goalProgress(months: { key: string; approved: number }[], goals: SalesGoals) {
  const configured = months.filter((month) => goals[month.key] > 0);
  const targetCents = configured.reduce((sum, month) => sum + Math.round(goals[month.key] * 100), 0);
  const achievedCents = configured.reduce((sum, month) => sum + Math.round(month.approved * 100), 0);
  return {
    configured: configured.length,
    target: targetCents / 100,
    achieved: achievedCents / 100,
    remaining: Math.max(0, targetCents - achievedCents) / 100,
    percentage: targetCents ? achievedCents / targetCents * 100 : 0,
  };
}

export function productRanking(quotes: QuoteData[], sort: 'quantity' | 'revenue' = 'quantity') {
  const products = new Map<string, { key: string; description: string; sku: string; unit: string; quantity: number; revenue: number; orders: number }>();
  let invalidItems = 0;
  for (const quote of quotes) {
    if (quote.status !== 'approved') continue;
    const counted = new Set<string>();
    for (const item of quote.items) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.totalPrice) || item.totalPrice < 0 ||
        !Number.isSafeInteger(Math.round(item.totalPrice * 100)) || typeof item.description !== 'string' || !item.description.trim()) {
        invalidItems++;
        continue;
      }
      const sku = item.sku?.trim().toUpperCase() || '';
      const unit = normalizeSearch(item.unit || 'un');
      const identity = sku ? `sku:${sku}` : item.blingProductId ? `bling:${item.blingProductId}` : `name:${normalizeSearch(item.description)}`;
      const key = `${identity}|unit:${unit}`;
      const product = products.get(key) || { key, description: item.description, sku, unit, quantity: 0, revenue: 0, orders: 0 };
      product.quantity += item.quantity;
      product.revenue += Math.round(item.totalPrice * 100);
      if (!counted.has(key)) product.orders++;
      counted.add(key);
      products.set(key, product);
    }
  }
  return {
    products: [...products.values()].map((product) => ({ ...product, revenue: product.revenue / 100 }))
      .sort((a, b) => sort === 'quantity'
        ? b.quantity - a.quantity || b.revenue - a.revenue || a.key.localeCompare(b.key)
        : b.revenue - a.revenue || b.quantity - a.quantity || a.key.localeCompare(b.key)),
    invalidItems,
  };
}

export function repurchaseCandidates(quotes: QuoteData[], today: string, minimumDays: number) {
  if (!isCalendarDate(today) || ![30, 60, 90].includes(minimumDays)) {
    throw new Error('Informe uma data válida e um intervalo de 30, 60 ou 90 dias.');
  }
  const todayTime = Date.parse(`${today}T12:00:00Z`);
  const invalidDates = quotes.filter((quote) => quote.status === 'approved' && !quoteDate(quote)).length;
  const candidates = customerHistories(quotes).flatMap((customer) => {
    const approved = customer.quotes.filter((quote) => quote.status === 'approved');
    // Datas inválidas ou futuras não permitem afirmar há quanto tempo o cliente não compra.
    if (approved.some((quote) => !quoteDate(quote) || quoteDate(quote)! > today)) return [];
    const latest = approved[0];
    if (!latest) return [];
    const date = quoteDate(latest)!;
    const days = Math.floor((todayTime - Date.parse(`${date}T12:00:00Z`)) / 86400000);
    return days >= minimumDays ? [{ ...customer, latest, date, days }] : [];
  }).sort((a, b) => b.days - a.days || a.key.localeCompare(b.key));
  return { candidates, invalidDates };
}
