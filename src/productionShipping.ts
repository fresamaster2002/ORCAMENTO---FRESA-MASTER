import type { QuoteData, ShippingInfo } from './types';

export function deliveryCorrection(quote: QuoteData): ShippingInfo {
  const delivery = quote.shipping.deliveryAddress;
  if (delivery?.enabled) return { ...quote.shipping, deliveryAddress: { ...delivery } };
  const { address, number, complement, neighborhood, city, state } = quote.client;
  return {
    ...quote.shipping,
    destinationCep: quote.shipping.destinationCep || quote.client.cep || '',
    deliveryAddress: { enabled: true, recipient: quote.client.name, address, number, complement, neighborhood, city, state },
  };
}

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
  const delivery = quote.shipping.deliveryAddress?.enabled ? quote.shipping.deliveryAddress : quote.client;
  if (quote.shipping.destinationCep.replace(/\D/g, '').length !== 8) missing.push('Corrija o CEP de entrega: informe 8 dígitos e consulte o endereço.');
  const fields = [['logradouro', delivery.address], ['número', delivery.number], ['bairro', delivery.neighborhood], ['cidade', delivery.city], ['UF', delivery.state]];
  const absent = fields.filter(([, value]) => !value?.trim()).map(([label]) => label);
  if (absent.length) missing.push(`Corrija o endereço de entrega: confirme ${absent.join(', ')}.`);
  if (!quote.shipping.deliveryAddress?.enabled && quote.client.cep?.replace(/\D/g, '') !== quote.shipping.destinationCep.replace(/\D/g, '')) {
    missing.push('O CEP de entrega difere do cadastro fiscal. Confirme o endereço em “Corrigir entrega / CEP”.');
  }
  const nfe = quote.bling?.nfe;
  if (Number(nfe?.situacao) !== 5 || Number(nfe?.serie) !== 2 || nfe?.chaveAcesso?.replace(/\D/g, '').length !== 44) {
    missing.push('Consulte no Bling a NF-e autorizada, série 2, com chave salva neste orçamento.');
  }
  return missing;
}
