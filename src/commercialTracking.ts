import type { CommercialTracking, ManualPayment, QuoteData } from './types';
import { quoteDate } from './salesInsights';

export function withoutCommercialTracking(quote: QuoteData): Omit<QuoteData, 'commercial'> {
  const { commercial: _commercial, ...external } = quote;
  return external;
}

export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function normalizeCommercialTracking(value: unknown): CommercialTracking | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('O controle comercial salvo tem formato inválido.');
  const record = value as Record<string, unknown>;
  const result: CommercialTracking = {};
  for (const key of ['notes', 'nextContactDate', 'lastContactDate'] as const) {
    const field = record[key];
    if (field !== undefined) {
      if (typeof field !== 'string' || key === 'notes' && field.length > 3000 || key !== 'notes' && field !== '' && !isCalendarDate(field)) throw new Error('Há anotações ou datas inválidas no controle comercial salvo.');
      result[key] = field;
    }
  }
  if (record.payments !== undefined) {
    if (!Array.isArray(record.payments)) throw new Error('A lista de pagamentos salva tem formato inválido.');
    const ids = new Set<string>();
    result.payments = record.payments.map((value: unknown) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Há um pagamento inválido no histórico salvo.');
      const payment = value as Record<string, unknown>;
      if (typeof payment.id !== 'string' || !payment.id || ids.has(payment.id) || typeof payment.amount !== 'number'
        || !Number.isFinite(payment.amount) || payment.amount <= 0 || !Number.isSafeInteger(Math.round(payment.amount * 100))
        || Math.abs(payment.amount * 100 - Math.round(payment.amount * 100)) > 0.00001
        || typeof payment.date !== 'string' || !isCalendarDate(payment.date) || typeof payment.method !== 'string' || !payment.method.trim()
        || payment.method.length > 80 || typeof payment.recordedAt !== 'string' || !Number.isFinite(Date.parse(payment.recordedAt))
        || payment.voidedAt !== undefined && (typeof payment.voidedAt !== 'string' || !Number.isFinite(Date.parse(payment.voidedAt)))) throw new Error('Há um pagamento inválido ou duplicado no histórico salvo.');
      ids.add(payment.id);
      return { id: payment.id, amount: payment.amount, date: payment.date, method: payment.method, recordedAt: payment.recordedAt,
        ...(typeof payment.voidedAt === 'string' ? { voidedAt: payment.voidedAt } : {}) };
    });
  }
  return result;
}

export function parsePaymentAmount(value: string): number {
  const input = value.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(input)) throw new Error('Informe um valor positivo com até duas casas decimais, sem separador de milhar.');
  const amount = Number(input.replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))) throw new Error('O valor do pagamento não é válido.');
  return Math.round(amount * 100) / 100;
}

export function paymentSummary(quote: QuoteData) {
  const payments = quote.commercial?.payments || [];
  const ids = new Set<string>();
  const issues: string[] = [];
  let paidCents = 0;
  for (const payment of payments) {
    if (!payment.id || ids.has(payment.id) || !isCalendarDate(payment.date) || !Number.isFinite(payment.amount)
      || payment.amount <= 0 || Math.abs(payment.amount * 100 - Math.round(payment.amount * 100)) > 0.00001
      || !Number.isSafeInteger(Math.round(payment.amount * 100))) {
      issues.push('Há um registro de pagamento inválido ou duplicado. Confira os lançamentos antes de continuar.');
      continue;
    }
    ids.add(payment.id);
    if (!payment.voidedAt) paidCents += Math.round(payment.amount * 100);
  }
  const totalCents = Math.round(quote.financials.totalAmount * 100);
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) issues.push('O total do orçamento não é válido para controlar pagamentos.');
  if (!Number.isSafeInteger(paidCents)) issues.push('O total dos pagamentos excedeu o limite permitido.');
  const excess = Number.isSafeInteger(totalCents) ? Math.max(0, paidCents - totalCents) / 100 : 0;
  return {
    paid: paidCents / 100, outstanding: Math.max(0, totalCents - paidCents) / 100, excess, issues,
    status: issues.length ? 'Conferir lançamentos' : excess > 0 ? 'Valor excedente' : paidCents === 0 ? 'Não registrado' : paidCents >= totalCents ? 'Pago (manual)' : 'Parcial (manual)',
  };
}

export function recordPayment(quote: QuoteData, payment: ManualPayment, today = localDate()): CommercialTracking {
  const existing = quote.commercial?.payments || [];
  const same = existing.find((entry) => entry.id === payment.id);
  if (same) {
    if (JSON.stringify(same) !== JSON.stringify(payment)) throw new Error('O identificador do pagamento já pertence a outro lançamento.');
    return quote.commercial || {};
  }
  const summary = paymentSummary(quote);
  if (summary.issues.length) throw new Error(summary.issues.join(' '));
  if (quote.status === 'rejected') throw new Error('Não registre pagamento em um orçamento não aprovado. Confira primeiro a situação da venda.');
  if (!payment.id || !payment.method.trim() || payment.method.length > 80 || !Number.isFinite(Date.parse(payment.recordedAt))
    || !isCalendarDate(payment.date) || payment.date > today || payment.voidedAt) throw new Error('Confira a data do recebimento (não futura) e a forma de pagamento.');
  if (!Number.isFinite(payment.amount) || payment.amount <= 0 || Math.abs(payment.amount * 100 - Math.round(payment.amount * 100)) > 0.00001
    || Math.round(payment.amount * 100) > Math.round(summary.outstanding * 100)) throw new Error('O pagamento deve ser positivo, ter até duas casas decimais e não ultrapassar o saldo pendente.');
  return { ...quote.commercial, payments: [...existing, payment] };
}

export function voidPayment(quote: QuoteData, id: string, now = new Date().toISOString()): CommercialTracking {
  if (!quote.commercial?.payments?.some((payment) => payment.id === id)) throw new Error('Pagamento não encontrado. Recarregue o orçamento.');
  return { ...quote.commercial, payments: quote.commercial.payments.map((payment) => payment.id === id && !payment.voidedAt ? { ...payment, voidedAt: now } : payment) };
}

export function followUpIssues(quote: QuoteData, today = localDate()): string[] {
  const issues: string[] = [];
  const tracking = quote.commercial;
  if (tracking?.nextContactDate && !isCalendarDate(tracking.nextContactDate)) issues.push('Data do próximo contato inválida');
  else if (['draft', 'sent'].includes(quote.status) && tracking?.nextContactDate && tracking.nextContactDate <= today) issues.push('Contato agendado para hoje ou atrasado');
  if (quote.status === 'sent') {
    issues.push('Aguardando resposta do cliente');
    const date = quoteDate(quote);
    if (date && Number.isInteger(quote.project.validityDays) && quote.project.validityDays >= 0) {
      const expiry = new Date(`${date}T12:00:00Z`);
      expiry.setUTCDate(expiry.getUTCDate() + quote.project.validityDays);
      if (expiry.toISOString().slice(0, 10) < today) issues.push('Orçamento vencido');
    }
  }
  const summary = paymentSummary(quote);
  issues.push(...summary.issues);
  if (summary.excess > 0) issues.push('Pagamentos excedem o total atual');
  if (quote.status === 'approved') {
    if (!summary.issues.length && summary.outstanding > 0) issues.push('Pagamento pendente (controle manual)');
    if (quote.bling?.nfe?.situacao !== 5) issues.push('NF-e ainda não confirmada como autorizada');
    const service = quote.shipping.selectedOption?.service;
    if (service && !['RETIRADA', 'MOTOBOY', 'PROPRIO', 'CONTA_FRESA'].includes(service) && !quote.productionShipment) issues.push('Envio Melhor Envio ainda não registrado');
  }
  if (quote.bling?.nfe?.situacao === 4) issues.push('NF-e rejeitada: revisar situação fiscal');
  return issues;
}

export function followUpWhatsapp(quote: QuoteData): string | null {
  let phone = quote.client.phone?.replace(/\D/g, '') || '';
  if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
  if (!/^55\d{10,11}$/.test(phone)) return null;
  const message = `Olá, ${quote.client.tradeName || quote.client.name || 'tudo bem'}! Aqui é da Fresa Master. Gostaria de saber se conseguiu avaliar o orçamento ${quote.id}. Posso ajudar com alguma dúvida sobre as ferramentas ou o envio?`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function receiptInsights(quotes: QuoteData[], year: number, month: number | null) {
  const prefix = month ? `${year}-${String(month).padStart(2, '0')}` : `${year}-`;
  let receivedCents = 0;
  let pendingCents = 0;
  let invalidRecords = 0;
  for (const quote of quotes) {
    const summary = paymentSummary(quote);
    if (summary.issues.length) {
      invalidRecords++;
      continue;
    }
    for (const payment of quote.commercial?.payments || []) {
      if (!payment.voidedAt && payment.date.startsWith(prefix)) receivedCents += Math.round(payment.amount * 100);
    }
    if (quote.status === 'approved' && quoteDate(quote)?.startsWith(prefix)) pendingCents += Math.round(summary.outstanding * 100);
  }
  return { received: receivedCents / 100, outstanding: pendingCents / 100, invalidRecords };
}
