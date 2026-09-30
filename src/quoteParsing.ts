const parseBrazilianNumber = (value: string) => {
  const normalized = value.includes(',') || /\.\d{3}$/.test(value)
    ? value.replace(/\./g, '').replace(',', '.')
    : value;
  return Number(normalized);
};

export function extractCepFromText(text: string): string {
  const labeledCep = text.match(/\bcep\b\s*(?:é|e|de|do|para|:|=|-)?\s*(\d{5}-?\d{3})/i);
  if (labeledCep) return labeledCep[1];

  const cep = text.match(/(?:^|[^\d])(\d{5}-\d{3})(?!\d)/);
  return cep?.[1] || '';
}

export function extractUnitPricesFromText(text: string): number[] {
  const amount = '(?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
  const price = `(?:R\\$\\s*)?(${amount})`;
  const patterns = [
    new RegExp(`${price}\\s*(?:reais?\\s*)?(?:cada(?:\\s+(?:fresa|unidade|uma))?|por\\s+unidade)`, 'gi'),
    new RegExp(`cada\\s+(?:fresa|unidade|uma)?\\s*(?:por|a|e|é|de|no valor de)?\\s*${price}`, 'gi'),
  ];
  const matches: Array<{ index: number; value: number }> = [];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = parseBrazilianNumber(match[1]);
      if (Number.isFinite(value) && value > 0) matches.push({ index: match.index || 0, value });
    }
  }

  matches.sort((left, right) => left.index - right.index);
  return matches.reduce<number[]>((prices, match, index) => {
    const previous = matches[index - 1];
    if (!previous || Math.abs(match.index - previous.index) > 5 || match.value !== previous.value) {
      prices.push(match.value);
    }
    return prices;
  }, []);
}

export function extractMotoboyPriceFromText(text: string): number | null {
  const amount = '(?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
  const patterns = [
    new RegExp(`\\b(?:motoboy|moto boy)\\s*(?:(?:por|a|custa|de|no valor de|:|-)\\s*)?(?:R\\$\\s*)?(${amount})(?:\\s*reais?)?`, 'i'),
    new RegExp(`(?:R\\$\\s*)?(${amount})\\s*(?:reais?\\s*)?(?:de|no)\\s*(?:frete|motoboy)`, 'i'),
    new RegExp(`(?:frete|entrega)\\s+(?:de\\s+)?(?:R\\$\\s*)?(${amount})\\s*(?:reais?)?[^.]{0,20}\\b(?:motoboy|moto boy)\\b`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = parseBrazilianNumber(match[1]);
    if (Number.isFinite(value) && value >= 0) return value;
  }

  return null;
}