import type { ShippingInfo, QuoteItem } from './types';
import { DEFAULT_ORIGIN_CEP, DEFAULT_PACKAGE_DIMENSIONS } from '../supabase/functions/_shared/shippingDefaults';

export function cepCheckInput(shipping: ShippingInfo, items: QuoteItem[]) {
  return {
    originCep: (shipping.originCep || DEFAULT_ORIGIN_CEP).replace(/\D/g, ''),
    destinationCep: (shipping.destinationCep || '').replace(/\D/g, ''),
    weightKg: shipping.weightKg ?? 0.5,
    packageDimensions: shipping.packageDimensions || { ...DEFAULT_PACKAGE_DIMENSIONS },
    insuranceEnabled: Boolean(shipping.insuranceEnabled),
    declaredValue: items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
  };
}

export function cepCheckFingerprint(shipping: ShippingInfo, items: QuoteItem[]): string {
  return JSON.stringify(cepCheckInput(shipping, items));
}

export type CepCheckResult =
  | { state: 'available'; services: Array<{ id: number; name: string }> }
  | { state: 'unavailable' | 'invalid-destination' | 'unverified'; error: string };

export async function readCepCheck(response: Response): Promise<CepCheckResult> {
  const data = await response.json();
  if (!response.ok || !data.success) {
    const error = typeof data.error === 'string' ? data.error : `Não foi possível verificar o CEP (HTTP ${response.status}).`;
    return { state: /cep_destino|to\.postal_code|CEP de entrega recusado/i.test(error) ? 'invalid-destination' : 'unverified', error };
  }
  if (data.environment !== 'production' || !['available', 'unavailable'].includes(data.status) || !Array.isArray(data.services)) {
    throw new Error('Resposta inválida ao verificar o CEP. Nenhum envio foi confirmado.');
  }
  if (data.status === 'unavailable' && data.services.length === 0) return { state: 'unavailable', error: 'Nenhum serviço de Correios/Jadlog retornou cotação para esta rota e pacote.' };
  if (data.status !== 'available' || data.services.length === 0 || data.services.some((service: { id?: unknown; name?: unknown }) =>
    !service || ![1, 2, 3, 4, 17].includes(Number(service.id)) || typeof service.name !== 'string')) {
    throw new Error('Lista de serviços inválida ao verificar o CEP. Tente novamente.');
  }
  return { state: 'available', services: data.services };
}
