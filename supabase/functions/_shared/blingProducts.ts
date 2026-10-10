import { BlingFiscalError, requestBling, type FiscalItem } from './blingFiscal.ts';

type Product = { id?: number; codigo?: string; nome?: string; tributacao?: { ncm?: string } };
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
const validId = (value?: string) => /^\d+$/.test(value || '') && Number.isSafeInteger(Number(value)) && Number(value) > 0;

export async function resolveBlingProducts<T extends FiscalItem>(token: string, items: T[]): Promise<{ items: Array<T & FiscalItem>; warnings: string[] }> {
  if (!token) throw new BlingFiscalError('Conecte o Bling antes de consultar os produtos.', 401);
  if (!Array.isArray(items) || !items.length) throw new BlingFiscalError('Inclua ao menos uma ferramenta.');
  const cache = new Map<string, Product>();
  const warnings: string[] = [];
  const request = async (path: string): Promise<Product | Product[]> => {
    const data = await requestBling(token, path);
    if (!data.data || typeof data.data !== 'object') throw new BlingFiscalError('O Bling não retornou os dados dos produtos.', 502);
    return data.data as Product | Product[];
  };
  const result: T[] = [];
  for (const item of items) {
    const sku = String(item.sku || '').trim();
    let id = item.blingProductId || (validId(sku) ? sku : '');
    if (id && !validId(id)) throw new BlingFiscalError(`ID do produto inválido: ${item.description}. Selecione novamente no catálogo.`);
    if (!id) {
      const field = sku ? 'codigos[]' : 'nome';
      const query = sku || item.description;
      const key = `${field}:${query}`;
      let found = cache.get(key);
      if (!found) {
        const matches: Product[] = [];
        for (let page = 1; ; page++) {
          const data = await request(`/produtos?${field}=${encodeURIComponent(query)}&pagina=${page}&limite=100`);
          if (!Array.isArray(data)) throw new BlingFiscalError('O Bling não retornou a lista de produtos.', 502);
          matches.push(...data.filter((product) => sku ? product.codigo === sku : normalize(product.nome || '') === normalize(query)));
          if (data.length < 100) break;
          if (page >= 100) throw new BlingFiscalError('A consulta de produtos excedeu o limite de páginas.', 502);
        }
        if (matches.length > 1) throw new BlingFiscalError(`Há mais de um produto para "${query}" no Bling. Selecione o produto correto no catálogo; nenhum foi escolhido automaticamente.`, 409);
        found = matches[0];
        if (found) cache.set(key, found);
      }
      id = found?.id ? String(found.id) : '';
    }
    if (!id) {
      if (sku) throw new BlingFiscalError(`O SKU "${sku}" não foi encontrado no Bling. Selecione o produto correto ou deixe o SKU vazio para um item avulso.`);
      warnings.push(`${item.description}: não há correspondência exata no catálogo. Item avulso, com NCM informado no orçamento.`);
      result.push({ ...item, blingProductId: undefined });
      continue;
    }
    let product = cache.get(id);
    if (!product) {
      const data = await request(`/produtos/${id}`);
      if (Array.isArray(data) || String(data.id) !== id) throw new BlingFiscalError('O Bling retornou um produto diferente do solicitado.', 502);
      product = data;
      cache.set(id, product);
    }
    const ncm = String(product.tributacao?.ncm || '').trim();
    if (!ncm) warnings.push(`${item.description}: o NCM está vazio no cadastro do Bling. Foi mantido apenas o NCM já informado no orçamento; confirme-o antes de emitir.`);
    result.push({ ...item, blingProductId: id, sku: product.codigo || '', ncm: ncm || item.ncm || '' });
  }
  return { items: result, warnings };
}
