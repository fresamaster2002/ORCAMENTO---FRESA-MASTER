type FiscalClient = { document?: unknown; ie?: unknown; state?: unknown; fiscalReviewKey?: unknown };

export function clientFiscalKey(client: FiscalClient): string {
  return JSON.stringify([
    String(client.document || '').replace(/\D/g, ''),
    String(client.ie || '').trim().toUpperCase().replace(/[.\-/\s]/g, ''),
    String(client.state || '').trim().toUpperCase(),
  ]);
}

export function clientFiscalReviewed(client: FiscalClient): boolean {
  return client.fiscalReviewKey === clientFiscalKey(client);
}

export function clientFiscalDescription(client: FiscalClient): string {
  const ie = String(client.ie || '').trim();
  if (/^isent[oa]$/i.test(ie)) return 'IE informada como ISENTO. Isso não distingue, sozinho, contribuinte isento de não contribuinte.';
  if (ie) return 'IE informada: possível contribuinte de ICMS. Confirme a situação atual e a natureza da operação compatível no Bling.';
  return 'Condição de contribuinte de ICMS não confirmada. IE não localizada não significa isenção ou não contribuinte.';
}

export function clientFiscalReviewIssue(client: FiscalClient): string | null {
  if (String(client.document || '').replace(/\D/g, '').length !== 14) return null;
  return clientFiscalReviewed(client) ? null : 'Confira a condição de contribuinte/IE e a natureza da operação no cadastro do cliente antes de gerar ou transmitir a NF-e.';
}
