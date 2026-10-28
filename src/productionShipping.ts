import type { QuoteData } from './types';

export function isProductionShipment(value: unknown): value is NonNullable<QuoteData['productionShipment']> {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.environment === 'production' && ['creating', 'created', 'unknown', 'rejected'].includes(String(record.status))
    && typeof record.requestedAt === 'string' && Number.isFinite(Date.parse(record.requestedAt))
    && (record.id === null || typeof record.id === 'string' && Boolean(record.id))
    && (record.protocol === null || typeof record.protocol === 'string')
    && typeof record.price === 'number' && Number.isFinite(record.price) && record.price > 0
    && (record.error === undefined || typeof record.error === 'string')
    && (record.status !== 'created' || Boolean(record.id));
}

export function productionMissing(quote: QuoteData): string[] {
  const missing: string[] = [];
  if (quote.status !== 'approved') missing.push('Marque o orçamento como aprovado.');
  if (!['SEDEX', 'PAC', 'JADLOG_PACKAGE'].includes(quote.shipping.selectedOption?.service || '')) missing.push('Selecione Sedex, PAC ou Jadlog.');
  const nfe = quote.bling?.nfe;
  if (Number(nfe?.situacao) !== 5 || Number(nfe?.serie) !== 2 || nfe?.chaveAcesso?.replace(/\D/g, '').length !== 44) {
    missing.push('Consulte no Bling a NF-e autorizada, série 2, com chave salva neste orçamento.');
  }
  return missing;
}
