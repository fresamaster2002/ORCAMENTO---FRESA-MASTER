import { BlingCatalogProduct } from './types';

export interface BlingProductRecord {
  id?: string | number;
  codigo?: string;
  nome?: string;
  descricao?: string;
  descricaoCurta?: string;
  preco?: number | string;
  unidade?: string;
  pesoLiquido?: number | string;
  categoriaProduto?: { descricao?: string };
  tributacao?: { ncm?: string };
  ncm?: string;
}

export const BLING_FRESA_MASTER_CATALOG: BlingCatalogProduct[] = [
  // 1. Fresas 3 Cortes TCT (Widia)
  {
    id: 'bling-tct-6mm-22',
    sku: 'FM-TCT-6X22',
    description: 'Fresa 3 Cortes TCT 6x22mm Haste 6mm para MDF e Madeira (Widia)',
    category: 'Fresas 3 Cortes TCT',
    unitPrice: 140,
    unit: 'un',
    ncm: '8207.70.00',
    weightGrams: 110,
    cutDiameterMm: 6,
    shankDiameterMm: 6,
    cutLengthMm: 22,
    tags: ['tct', 'widia', '3 cortes', '6mm', 'mdf', 'madeira', 'corte reto'],
  },
  {
    id: 'bling-tct-6mm-32',
    sku: 'FM-TCT-6X32',
    description: 'Fresa 3 Cortes TCT 6x32mm Haste 6mm para Chapas Grossas MDF',
    category: 'Fresas 3 Cortes TCT',
    unitPrice: 160,
    unit: 'un',
    ncm: '8207.70.00',
    weightGrams: 120,
    cutDiameterMm: 6,
    shankDiameterMm: 6,
    cutLengthMm: 32,
    tags: ['tct', 'widia', '3 cortes', '6x32', '32mm', 'mdf grosso'],
  },
  {
    id: 'bling-tct-4mm-17',
    sku: 'FM-TCT-4X17',
    description: 'Fresa 3 Cortes TCT 4x17mm Haste 4mm para Recortes Detalhados',
    category: 'Fresas 3 Cortes TCT',
    unitPrice: 125,
    unit: 'un',
    ncm: '8207.70.00',
    weightGrams: 85,
    cutDiameterMm: 4,
    shankDiameterMm: 4,
    cutLengthMm: 17,
    tags: ['tct', 'widia', '3 cortes', '4mm', 'detalhe'],
  },

  // 2. Fresas Helicoidais em Metal Duro Integral (1 e 2 Cortes)
  {
    id: 'bling-hel-2c-6mm',
    sku: 'FM-HEL-2C-6X22',
    description: 'Fresa Helicoidal 2 Cortes Metal Duro 6x22mm para MDF e Compensado',
    category: 'Fresas Helicoidais Metal Duro',
    unitPrice: 95,
    unit: 'un',
    ncm: '8207.70.00',
    weightGrams: 55,
    cutDiameterMm: 6,
    shankDiameterMm: 6,
    cutLengthMm: 22,
    tags: ['helicoidal', '2 cortes', 'metal duro', '6mm', 'mdf', 'upcut'],
  },
  {
    id: 'bling-hel-2c-4mm',
    sku: 'FM-HEL-2C-4X17',
    description: 'Fresa Helicoidal 2 Cortes Metal Duro 4x17mm Haste 4mm',
    category: 'Fresas Helicoidais Metal Duro',
    unitPrice: 75,
    unit: 'un',
    ncm: '8207.70.00',
    weightGrams: 40,
    cutDiameterMm: 4,
    shankDiameterMm: 4,
    cutLengthMm: 17,
    tags: ['helicoidal', '2 cortes', 'metal duro', '4mm'],
  },
  {
    id: 'bling-hel-1c-acrilico-6mm',
    sku: 'FM-HEL-1C-6X22-ACR',
    description: 'Fresa Helicoidal 1 Corte Metal Duro 6x22mm para Acrílico e Alumínio',
    category: 'Fresas para Acrílico & Alumínio',
    unitPrice: 85,
    unit: 'un',
    ncm: '8207.70.00',
    weightGrams: 50,
    cutDiameterMm: 6,
    shankDiameterMm: 6,
    cutLengthMm: 22,
    tags: ['1 corte', 'acrílico', 'acrilico', 'aluminio', 'alumínio', 'acm', 'polimento'],
  },
  {
    id: 'bling-hel-1c-acrilico-4mm',
    sku: 'FM-HEL-1C-4X15-ACR',
    description: 'Fresa Helicoidal 1 Corte Metal Duro 4x15mm para Acrílico e Plásticos',
    category: 'Fresas para Acrílico & Alumínio',
    unitPrice: 65,
    unit: 'un',
    ncm: '8207.70.00',
    weightGrams: 35,
    cutDiameterMm: 4,
    shankDiameterMm: 4,
    cutLengthMm: 15,
    tags: ['1 corte', 'acrílico', 'acrilico', '4mm'],
  },
  {
    id: 'bling-hel-downcut-6mm',
    sku: 'FM-DOWN-2C-6X22',
    description: 'Fresa Helicoidal Downcut (Corte Descendente) 6x22mm Acabamento Superior',
    category: 'Fresas Downcut',
    unitPrice: 110,
    unit: 'un',
    ncm: '8207.70.00',
    weightGrams: 55,
    cutDiameterMm: 6,
    shankDiameterMm: 6,
    cutLengthMm: 22,
    tags: ['downcut', 'descendente', 'acabamento superior', 'sem rebarba', 'melamina'],
  },

  // 3. Fresas V-Bit (Chanfro e Gravação 3D / ACM / Letras Caixa)
  {
    id: 'bling-vbit-60',
    sku: 'FM-VBIT-60-1/2',
    description: 'Fresa V-Bit 60° Diâmetro 32mm Haste 6mm para Gravação e Chanfro',
    category: 'Fresas V-Bit & Gravação',
    unitPrice: 115,
    unit: 'un',
    ncm: '8207.70.00',
    weightGrams: 90,
    tags: ['v-bit', 'vbit', '60 graus', '60°', 'chanfro', 'gravacao', 'gravação'],
  },
  {
    id: 'bling-vbit-90',
    sku: 'FM-VBIT-90-1/2',
    description: 'Fresa V-Bit 90° Diâmetro 32mm Haste 6mm para Dobra de ACM e Chanfro',
    category: 'Fresas V-Bit & Gravação',
    unitPrice: 110,
    unit: 'un',
    ncm: '8207.70.00',
    weightGrams: 90,
    tags: ['v-bit', 'vbit', '90 graus', '90°', 'acm', 'dobra', 'chanfro 90'],
  },

  // 4. Pinças de Precisão ER (Spindles CNC)
  {
    id: 'bling-er20-6mm',
    sku: 'FM-PINCA-ER20-6MM',
    description: 'Pinça de Alta Precisão ER20 6mm Batimento < 0.008mm para Spindle',
    category: 'Pinças de Precisão ER',
    unitPrice: 65,
    unit: 'un',
    ncm: '8466.10.00',
    weightGrams: 85,
    tags: ['pinça', 'pinca', 'er20', '6mm', 'spindle'],
  },
  {
    id: 'bling-er20-4mm',
    sku: 'FM-PINCA-ER20-4MM',
    description: 'Pinça de Alta Precisão ER20 4mm Batimento < 0.008mm para Spindle',
    category: 'Pinças de Precisão ER',
    unitPrice: 65,
    unit: 'un',
    ncm: '8466.10.00',
    weightGrams: 85,
    tags: ['pinça', 'pinca', 'er20', '4mm', 'spindle'],
  },
  {
    id: 'bling-er11-6mm',
    sku: 'FM-PINCA-ER11-6MM',
    description: 'Pinça de Precisão ER11 6mm para Spindles Compactos',
    category: 'Pinças de Precisão ER',
    unitPrice: 55,
    unit: 'un',
    ncm: '8466.10.00',
    weightGrams: 45,
    tags: ['pinça', 'pinca', 'er11', '6mm'],
  },
  {
    id: 'bling-er25-12mm',
    sku: 'FM-PINCA-ER25-12MM',
    description: 'Pinça de Alta Precisão ER25 12mm para Fresas Pesadas',
    category: 'Pinças de Precisão ER',
    unitPrice: 85,
    unit: 'un',
    ncm: '8466.10.00',
    weightGrams: 110,
    tags: ['pinça', 'pinca', 'er25', '12mm'],
  },
];

const normalizeText = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function normalizeBlingCatalogProducts(records: unknown[]): BlingCatalogProduct[] {
  return records.flatMap((record, index) => {
    if (!record || typeof record !== 'object') return [];
    const product = record as BlingProductRecord;
    const description = product.nome?.trim() || product.descricao?.trim() || product.descricaoCurta?.trim();
    if (!description) return [];

    const sku = product.codigo?.trim() || String(product.id || `BLING-${index + 1}`);
    const category = product.categoriaProduto?.descricao || 'Produtos Bling';
    const price = Number(product.preco) || 0;
    const weight = Number(product.pesoLiquido) || 0;

    return [{
      id: String(product.id || sku),
      sku,
      description,
      category,
      unitPrice: price,
      unit: product.unidade || 'un',
      ncm: product.tributacao?.ncm || product.ncm || '8207.70.00',
      weightGrams: weight * 1000,
      tags: [sku, category, product.descricaoCurta || '', description]
        .join(' ')
        .split(/[^\p{L}\p{N}]+/u)
        .filter((tag) => tag.length > 1),
    }];
  });
}

// Find the closest catalog match using SKU, product family, and technical terms.
export function matchBlingCatalogProduct(
  query: string,
  catalog: BlingCatalogProduct[] = BLING_FRESA_MASTER_CATALOG,
): BlingCatalogProduct | null {
  if (!query) return null;
  const q = normalizeText(query);
  const queryTokens = [...new Set(q.split(' ').filter((token) => token.length > 1))];
  if (!queryTokens.length) return null;

  // Exact SKU match
  const skuMatch = catalog.find((product) => {
    const sku = normalizeText(product.sku);
    return sku === q || (sku.length > 3 && q.includes(sku));
  });
  if (skuMatch) return skuMatch;

  let bestProduct: BlingCatalogProduct | null = null;
  let highestScore = 0;
  const families = [
    ['tct', 'widia'],
    ['3 cortes', 'tres cortes'],
    ['2 cortes', 'dois cortes'],
    ['1 corte', 'um corte'],
    ['helicoidal'],
    ['downcut', 'descendente'],
    ['vbit', 'v bit', 'v-bit'],
    ['pinca', 'er11', 'er16', 'er20', 'er25', 'er32'],
  ];
  const queryFamilies = families.filter((family) => family.some((term) => q.includes(normalizeText(term))));
  const queryDimensions = query.match(/\b\d+(?:\.\d+)?\b/g) || [];

  for (const prod of catalog) {
    let score = 0;
    const searchable = normalizeText([prod.description, prod.category, prod.sku, ...prod.tags].join(' '));
    const productTokens = new Set(searchable.split(' '));
    const productNumbers = new Set(searchable.match(/\d+(?:\.\d+)?/g) || []);
    const productFamilies = families.filter((family) => family.some((term) => searchable.includes(normalizeText(term))));

    if (queryFamilies.length && !queryFamilies.every((family) => productFamilies.includes(family))) continue;

    for (const token of queryTokens) {
      if (productTokens.has(token)) score += /^\d/.test(token) ? 5 : token.length > 3 ? 3 : 1;
    }
    for (const dimension of queryDimensions) {
      if (productNumbers.has(dimension)) score += 4;
    }

    const queryAngle = q.match(/\b(60|90)\b/);
    if (queryAngle && searchable.includes(`${queryAngle[1]} graus`)) score += 5;
    if (searchable.includes(q)) score += 8;

    if (score > highestScore) {
      highestScore = score;
      bestProduct = prod;
    }
  }

  return highestScore >= 6 ? bestProduct : null;
}
