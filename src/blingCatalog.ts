import { BlingCatalogProduct } from './types';

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

// Helper to find the best match in Bling's catalog based on item description
export function matchBlingCatalogProduct(query: string): BlingCatalogProduct | null {
  if (!query) return null;
  const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Exact SKU match
  const skuMatch = BLING_FRESA_MASTER_CATALOG.find(
    (p) => p.sku.toLowerCase() === q || q.includes(p.sku.toLowerCase())
  );
  if (skuMatch) return skuMatch;

  // Score match based on tags and description
  let bestProduct: BlingCatalogProduct | null = null;
  let highestScore = 0;

  for (const prod of BLING_FRESA_MASTER_CATALOG) {
    let score = 0;
    const prodDesc = prod.description.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    for (const tag of prod.tags) {
      const cleanTag = tag.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (q.includes(cleanTag)) {
        score += 3;
      }
    }

    if (q.includes('tct') && prodDesc.includes('tct')) score += 5;
    if (q.includes('widia') && prodDesc.includes('widia')) score += 5;
    if ((q.includes('3 cortes') || q.includes('tres cortes') || q.includes('3 corte')) && prodDesc.includes('3 cortes')) score += 6;
    if ((q.includes('2 cortes') || q.includes('dois cortes')) && prodDesc.includes('2 cortes')) score += 5;
    if (q.includes('1 corte') && prodDesc.includes('1 corte')) score += 5;
    if (q.includes('acrilico') && prodDesc.includes('acrilico')) score += 4;
    if (q.includes('aluminio') && prodDesc.includes('aluminio')) score += 4;
    if (q.includes('v-bit') || q.includes('vbit')) {
      if (prodDesc.includes('v-bit')) score += 4;
      if (q.includes('60') && prodDesc.includes('60°')) score += 5;
      if (q.includes('90') && prodDesc.includes('90°')) score += 5;
    }
    if (q.includes('6mm') && prodDesc.includes('6mm')) score += 2;
    if (q.includes('4mm') && prodDesc.includes('4mm')) score += 2;
    if (q.includes('pinca') || q.includes('pinça')) {
      if (prodDesc.includes('pinca') || prodDesc.includes('pinça')) score += 6;
      if (q.includes('er20') && prodDesc.includes('er20')) score += 4;
      if (q.includes('er11') && prodDesc.includes('er11')) score += 4;
    }

    if (score > highestScore) {
      highestScore = score;
      bestProduct = prod;
    }
  }

  return highestScore >= 3 ? bestProduct : null;
}
