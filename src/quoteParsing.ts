const parseBrazilianNumber = (value: string) => {
  const normalized = value.includes(',') || /\.\d{3}$/.test(value)
    ? value.replace(/\./g, '').replace(',', '.')
    : value;
  return Number(normalized);
};

export function extractCepFromText(text: string): string {
  const labeledCep = text.match(/\bcep\b\s*(?:é|e|de|do|para|:|=|-)?\s*(\d{5}-?\d{3}|\d{8})/i);
  if (labeledCep) {
    const raw = labeledCep[1].replace(/\D/g, '');
    return raw.length === 8 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : labeledCep[1];
  }

  const cep = text.match(/(?:^|[^\d])(\d{5}-\d{3})(?!\d)/);
  if (cep) return cep[1];

  const plain8 = text.match(/(?:^|[^\d])(\d{8})(?!\d)/);
  if (plain8) return `${plain8[1].slice(0, 5)}-${plain8[1].slice(5)}`;

  return '';
}

export const WORDS_TO_NUMBERS: Record<string, number> = {
  cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, meia: 6, sete: 7, oito: 8, nove: 9,
};

function parseWordNumber(str: string): number | null {
  const words = str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+e\s+|\s+/);
  let total = 0;
  for (const w of words) {
    if (WORDS_TO_NUMBERS[w]) total += WORDS_TO_NUMBERS[w];
  }
  return total > 0 ? total : null;
}

export function extractUnitPricesFromText(text: string): number[] {
  // Normaliza centavos falados: '145 e 50' ou '145 com 50' -> '145,50'
  const normalizedText = text.replace(/(\b\d{2,4})\s+(?:e|com)\s+(\d{1,2})\b(?!\s*(?:cortes|dias|mm|graus))/gi, '$1,$2');

  // Isola a parte do produto antes do frete para que o valor do motoboy/sedex não seja capturado como preço unitário
  const shippingMatch = normalizedText.match(/\b(?:frete|envio|entrega|motoboy|moto boy|sedex|pac|jadlog|transportadora)\b/i);
  const toolText = shippingMatch && shippingMatch.index && shippingMatch.index > 10 ? normalizedText.slice(0, shippingMatch.index) : normalizedText;

  const amount = '(?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
  const price = `(?:R\\$\\s*)?(${amount})`;

  const patterns = [
    // 1. Explícito 'cada': 'por 140 cada', 'a 140 cada', '140 reais cada', '140 cada uma', '140 cada peca'
    new RegExp(`${price}\\s*(?:reais?\\s*)?(?:cada(?:\\s+(?:fresa|unidade|uma|peça|peca|ferramenta))?|por\\s+(?:unidade|peça|peca)|a\\s+(?:unidade|peça|peca))`, 'gi'),
    new RegExp(`cada\\s+(?:fresa|unidade|uma|peça|peca)?\\s*(?:por|a|e|é|de|no valor de)?\\s*${price}`, 'gi'),

    // 2. Palavras de valor/unidade: 'no valor de 140', 'valor de 140', 'valor 140', 'preco 140', 'custando 140', 'sai por 140'
    new RegExp(`(?:no valor de|valor de|valor|preço de|preco de|preço|preco|custando|custa|sai por|sai a|unitário de|unitario de|unitário|unitario)\\s*:?\\s*${price}`, 'gi'),

    // 3. Preposição + preço: 'por 140 reais', 'a 140 reais', 'por 140', 'a 140'
    new RegExp(`(?:\\bpor|\\ba)\\s+${price}\\s*(?:reais)?(?:\\s|$|[,;.]|(?=\\s*(?:e\\s+frete|e\\s+envio)))`, 'gi'),

    // 4. Notação explícita R$
    new RegExp(`R\\$\\s*(${amount})`, 'gi'),
  ];

  const foundPrices: Array<{ index: number; value: number }> = [];
  for (const pattern of patterns) {
    for (const match of toolText.matchAll(pattern)) {
      const value = parseBrazilianNumber(match[1]);
      if (Number.isFinite(value) && value >= 10 && value <= 10000) {
        if (!foundPrices.some((p) => p.value === value || Math.abs(p.index - (match.index || 0)) < 8)) {
          foundPrices.push({ index: match.index || 0, value });
        }
      }
    }
  }

  // Verifica números por extenso caso não tenha encontrado em dígitos: 'por cento e quarenta cada'
  if (foundPrices.length === 0) {
    const spelledMatch = toolText.match(/(?:por|a|valor de|preco de|custando)\s+([a-z\s]+?)\s*(?:reais)?\s*(?:cada|por unidade|$|[,;.])/i);
    if (spelledMatch) {
      const spelledVal = parseWordNumber(spelledMatch[1]);
      if (spelledVal && spelledVal >= 10) {
        foundPrices.push({ index: spelledMatch.index || 0, value: spelledVal });
      }
    }
  }

  foundPrices.sort((a, b) => a.index - b.index);
  return foundPrices.map((p) => p.value);
}

export function extractMotoboyPriceFromText(text: string): number | null {
  const amount = '(?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
  const patterns = [
    new RegExp(`(?:motoboy|moto boy)[^.,;\\n]{0,35}?\\b(?:custou|custa|ficou em|ficou|deu|saiu por|saiu|cobrou|por|a|de|no valor de|valor de|:|-)\\s*(?:R\\$\\s*)?(${amount})(?:\\s*reais?)?`, 'i'),
    new RegExp(`\\b(?:motoboy|moto boy)\\s+(?:R\\$\\s*)?(${amount})(?:\\s*reais?)?`, 'i'),
    new RegExp(`(?:R\\$\\s*)?(${amount})\\s*(?:reais?\\s*)?(?:de|no|para o)?\\s*(?:frete\\s+)?(?:do\\s+)?(?:motoboy|moto boy)`, 'i'),
    new RegExp(`(?:frete|entrega|envio)\\s+(?:por\\s+|de\\s+|do\\s+)?(?:motoboy|moto boy)[^.,;\\n]{0,35}?(?:(?:custou|custa|ficou em|ficou|deu|saiu por|saiu|cobrou|por|a|de|no valor de|valor de|:|-)\\s*)?(?:R\\$\\s*)?(${amount})`, 'i'),
    new RegExp(`(?:frete|entrega|envio)\\s+(?:de\\s+)?(?:R\\$\\s*)?(${amount})\\s*(?:reais?)?[^.,;\\n]{0,25}\\b(?:motoboy|moto boy)\\b`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = parseBrazilianNumber(match[1]);
    if (Number.isFinite(value) && value >= 0) return value;
  }

  return null;
}

export function extractQuantityFromText(text: string): number {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const numWords = Object.keys(WORDS_TO_NUMBERS).join('|');
  const qtyPattern = new RegExp(`\\b(\\d+|${numWords})\\s*(?:fresas?|brocas?|pinças?|pincas?|unidades?|peças?|pecas?|itens?|ferramentas?)\\b`, 'i');
  const match = normalized.match(qtyPattern);
  if (match) {
    const raw = match[1];
    const num = WORDS_TO_NUMBERS[raw] || Number.parseInt(raw, 10);
    if (Number.isFinite(num) && num > 0) return num;
  }

  const actionPattern = new RegExp(`(?:ser[aã]o|seria|manda|enviar?|quer|quero|preciso|adiciona|coloca|vai|tem)\\s+(\\d+|${numWords})\\b`, 'i');
  const matchAction = normalized.match(actionPattern);
  if (matchAction) {
    const raw = matchAction[1];
    const num = WORDS_TO_NUMBERS[raw] || Number.parseInt(raw, 10);
    if (Number.isFinite(num) && num > 0) return num;
  }

  return 1;
}