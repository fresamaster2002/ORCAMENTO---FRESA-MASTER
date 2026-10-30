import type { BlingCatalogProduct, QuoteItem } from './types';
import { resolveToolNcm } from '../supabase/functions/_shared/toolNcm';

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
const confirmedNcm = (value?: string) => /^\d{8}$/.test((value || '').replace(/\D/g, '')) && !['00000000', '82077000'].includes((value || '').replace(/\D/g, ''));

export function resolveSelectedProductNcm(item: QuoteItem, product: BlingCatalogProduct): string {
  if (product.ncm?.trim()) return resolveToolNcm(product.ncm, product.description);
  const sameProduct = item.blingProductId === product.id || Boolean(item.sku && item.sku === product.sku) || normalize(item.description) === normalize(product.description);
  if (sameProduct && confirmedNcm(item.ncm)) return item.ncm || '';
  return resolveToolNcm('', product.description);
}

export function bindBlingProduct(item: QuoteItem, product: BlingCatalogProduct): QuoteItem {
  return {
    ...item,
    description: product.description,
    sku: product.sku,
    blingProductId: /^\d+$/.test(product.id) ? product.id : undefined,
    ncm: resolveSelectedProductNcm(item, product),
    category: product.category,
    unit: product.unit || item.unit,
    totalPrice: item.quantity * item.unitPrice,
    notes: `Produto cadastrado no Bling ERP (${product.sku})`,
  };
}
