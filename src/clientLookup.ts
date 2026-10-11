import type { ClientInfo } from './types';
import { normalizeAndValidateCnpj } from '../supabase/functions/_shared/cnpjLookup';

type Lookup = { client: ClientInfo; warnings: string[]; source: string };

export async function fetchClientLookup(cnpj: string, fetcher: typeof fetch): Promise<Lookup> {
  const response = await fetcher('/api/bling/lookup-cnpj', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cnpj }),
  });
  const data = await response.json();
  if (!response.ok || data.success !== true) throw new Error(data.error || 'Não foi possível consultar este CNPJ.');
  if (typeof data.client?.document !== 'string' || typeof data.client?.name !== 'string'
    || normalizeAndValidateCnpj(data.client.document) !== normalizeAndValidateCnpj(cnpj)
    || !normalizeAndValidateCnpj(cnpj)) throw new Error('A consulta não retornou o cadastro do CNPJ solicitado.');
  return {
    client: data.client,
    warnings: Array.isArray(data.warnings) ? data.warnings.filter((item: unknown): item is string => typeof item === 'string') : [],
    source: typeof data.source === 'string' ? data.source : 'serviço público',
  };
}

export async function completeMissingIe(client: ClientInfo, fetcher: typeof fetch): Promise<{ client: ClientInfo; warnings: string[] }> {
  const nextClient: ClientInfo = { ...client, fiscalReviewKey: undefined, registrationLookup: undefined, fiscalCondition: 'unknown', operationNature: undefined };
  if (!normalizeAndValidateCnpj(client.document)) {
    return { client: nextClient, warnings: [] };
  }
  try {
    const result = await fetchClientLookup(client.document!, fetcher);
    const sameState = Boolean(client.state && result.client.state && client.state.trim().toUpperCase() === result.client.state.trim().toUpperCase());
    if (result.client.ie && !sameState) return { client: nextClient, warnings: ['A UF do documento difere da consulta ou está ausente. A IE consultada não foi aplicada; confira o cadastro.'] };
    const hasIe = Boolean(client.ie?.trim() && !/^isent[oa]$/i.test(client.ie.trim()));
    const differentIe = hasIe && result.client.ie && client.ie!.replace(/\D/g, '') !== result.client.ie.replace(/\D/g, '');
    return {
      client: { ...nextClient, ie: hasIe ? client.ie : result.client.ie || client.ie || '', registrationLookup: result.client.registrationLookup, fiscalCondition: sameState && !differentIe ? result.client.fiscalCondition || 'unknown' : 'unknown' },
      warnings: [
        ...(differentIe ? ['A IE do documento difere da consulta; o valor do documento foi preservado. Confira a condição fiscal.'] : result.client.ie ? [`IE ${result.client.ie} localizada automaticamente na consulta por CNPJ. Confira antes de faturar.`] : []),
        ...result.warnings,
      ],
    };
  } catch (failure) {
    return { client: nextClient, warnings: [`Não foi possível completar a IE automaticamente: ${failure instanceof Error ? failure.message : 'falha na consulta'}. Use a busca por CNPJ ou confirme com o cliente/SEFAZ.`] };
  }
}
