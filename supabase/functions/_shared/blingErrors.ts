function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function formatBlingError(value: unknown, fallback = 'O Bling recusou o pedido de venda.'): string {
  const response = record(value);
  const error = record(response.error);
  const message = text(error.message) || text(response.message) || fallback;
  const fields = Array.isArray(error.fields) ? error.fields : [];
  const details = fields.flatMap((value) => {
    const field = record(value);
    const message = text(field.msg) || text(field.message);
    if (!message) return [];
    const element = text(field.element);
    return [element ? `${element}: ${message}` : message];
  });
  return [...new Set([message, ...details])].join(' ');
}

export function isDuplicateBlingSale(value: unknown): boolean {
  const error = record(record(value).error);
  return Array.isArray(error.fields) && error.fields.some((value) => {
    const field = record(value);
    return field.namespace === 'VENDAS' && String(field.code) === '3';
  });
}
