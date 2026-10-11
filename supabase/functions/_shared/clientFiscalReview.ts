export type BlingNature = { id: string; description: string };
export type FiscalClient = { document?: unknown; ie?: unknown; state?: unknown; fiscalReviewKey?: unknown; fiscalCondition?: unknown; operationNature?: { id?: unknown; description?: unknown }; registrationLookup?: { cnpjStatusCode?: unknown; document?: unknown } };

const normalized = (value: unknown) => String(value || '').trim().toLocaleLowerCase('pt-BR');

export function suggestedNature(natures: BlingNature[], condition: string): BlingNature | undefined {
  const name = condition === 'contributor' ? 'Venda de mercadoria' : condition === 'non-contributor' ? 'Venda de mercadoria a não contribuinte' : '';
  const matches = name ? natures.filter((nature) => normalized(nature.description) === normalized(name)) : [];
  return matches.length === 1 ? matches[0] : undefined;
}

export function natureSelectionIssue(client: FiscalClient): string | null {
  if (!/^\d+$/.test(String(client.operationNature?.id || '')) || !['contributor', 'non-contributor', 'exempt'].includes(String(client.fiscalCondition))) return 'Selecione a condição fiscal e uma natureza de operação válida antes de emitir.';
  const name = normalized(client.operationNature?.description);
  if (!/^venda de mercadoria(?:$| )/.test(name)) return 'Selecione uma natureza de venda de mercadoria cadastrada no Bling.';
  if (name === 'venda de mercadoria a não contribuinte' && client.fiscalCondition !== 'non-contributor') return 'A natureza de venda a não contribuinte exige a condição não contribuinte confirmada.';
  if (name === 'venda de mercadoria' && client.fiscalCondition === 'non-contributor') return 'Cliente não contribuinte: selecione a natureza de venda a não contribuinte.';
  return null;
}

export function clientFiscalKey(client: FiscalClient): string {
  return JSON.stringify([
    String(client.document || '').replace(/\D/g, ''),
    String(client.ie || '').trim().toUpperCase().replace(/[.\-/\s]/g, ''),
    String(client.state || '').trim().toUpperCase(),
    client.fiscalCondition || '', client.operationNature?.id || '', client.operationNature?.description || '',
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
  const lookup = client.registrationLookup;
  if (lookup && String(lookup.document) === String(client.document || '').replace(/\D/g, '') && lookup.cnpjStatusCode && String(lookup.cnpjStatusCode) !== '2') {
    return 'A consulta não retornou CNPJ ativo. Confira a situação cadastral antes de faturar; isso não determina não contribuinte de ICMS.';
  }
  if (client.operationNature || client.fiscalCondition || [11, 14].includes(String(client.document || '').replace(/\D/g, '').length)) {
    const issue = natureSelectionIssue(client);
    if (issue) return issue;
  }
  if (client.fiscalCondition === 'contributor' && (!client.ie || /^isent[oa]$/i.test(String(client.ie).trim()))) return 'Contribuinte: informe a IE antes de emitir.';
  if (client.operationNature && !clientFiscalReviewed(client)) return 'Confira a condição de contribuinte/IE e a natureza selecionada antes de emitir.';
  if (String(client.document || '').replace(/\D/g, '').length !== 14) return null;
  return clientFiscalReviewed(client) ? null : 'Confira a condição de contribuinte/IE e a natureza da operação no cadastro do cliente antes de gerar ou transmitir a NF-e.';
}
