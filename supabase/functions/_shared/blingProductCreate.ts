import { BlingFiscalError, requestBling } from './blingFiscal.ts';

export async function prepareBlingProduct(token: string, product: Record<string, unknown>) {
  if (!token) throw new BlingFiscalError('Conecte o Bling antes de cadastrar o produto.', 401);
  const name = String(product.name || '').trim();
  const sku = String(product.sku || '').trim();
  const price = Number(product.price);
  const ncm = String(product.ncm || '').replace(/\D/g, '');
  if (!name || name.length > 120 || !sku || !Number.isFinite(price) || price <= 0 || !/^\d{8}$/.test(ncm)) {
    throw new BlingFiscalError('Informe descrição de até 120 caracteres, SKU, preço maior que zero e NCM com 8 dígitos.');
  }
  if (['00000000', '82077000'].includes(ncm)) throw new BlingFiscalError('NCM zerado ou 8207.70.00 não é aceito. Confirme a classificação fiscal do produto antes de cadastrá-lo.');
  const origin = product.origin;
  if (origin != null && (!Number.isInteger(origin) || Number(origin) < 0 || Number(origin) > 8)) {
    throw new BlingFiscalError('Selecione uma origem fiscal válida da mercadoria (0 a 8).');
  }
  const existing = await requestBling(token, `/produtos?codigos[]=${encodeURIComponent(sku)}&pagina=1&limite=100`);
  if (!Array.isArray(existing.data)) throw new BlingFiscalError('O Bling não retornou a consulta do SKU. Confira o catálogo antes de cadastrar.', 502);
  if (existing.data.some((entry) => entry && typeof entry === 'object' && String(entry.codigo || '').trim().toLowerCase() === sku.toLowerCase())) {
    throw new BlingFiscalError(`O SKU "${sku}" já está cadastrado no Bling. Use “Buscar SKU no catálogo” para vincular o produto existente ou informe outro SKU.`, 409);
  }
  return {
    nome: name, codigo: sku, preco: price, tipo: 'P', situacao: 'A', formato: 'S',
    unidade: 'UN', tributacao: { ncm, ...(origin != null ? { origem: origin } : {}) },
  };
}
