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