import type { ClientInfo } from '../types';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import { suggestedNature, type BlingNature, natureSelectionIssue } from '../../supabase/functions/_shared/clientFiscalReview';
import { clientFiscalDescription, clientFiscalKey, clientFiscalReviewed } from '../../supabase/functions/_shared/clientFiscalReview';

export function ClientFiscalReview({ client, onChange }: { client: ClientInfo; onChange: (client: ClientInfo) => void }) {
  const [natures, setNatures] = useState<BlingNature[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const requestNumber = useRef(0);
  const document = String(client.document || '').replace(/\D/g, '');
  const load = async () => {
    const currentRequest = ++requestNumber.current;
    setLoading(true); setError('');
    try {
      const response = await apiFetch('/api/bling/natures');
      const data = await response.json();
      if (!response.ok || !data.success || !Array.isArray(data.natures)) throw new Error(data.error || 'Não foi possível consultar as naturezas do Bling.');
      if (currentRequest === requestNumber.current) setNatures(data.natures);
    } catch (failure) { if (currentRequest === requestNumber.current) setError(failure instanceof Error ? failure.message : 'Falha na consulta das naturezas.'); }
    finally { if (currentRequest === requestNumber.current) setLoading(false); }
  };
  useEffect(() => {
    setNatures([]);
    if ([11, 14].includes(document.length)) void load();
    return () => { requestNumber.current++; };
  }, [document]);
  useEffect(() => {
    if (!natures.length || client.operationNature || !client.fiscalCondition || client.fiscalCondition === 'unknown') return;
    const nature = suggestedNature(natures, client.fiscalCondition);
    if (nature) onChange({ ...client, operationNature: nature, fiscalReviewKey: undefined });
  }, [natures, client.fiscalCondition, client.operationNature?.id]);
  if (![11, 14].includes(document.length)) return null;
  const lookup = client.registrationLookup?.document === document && client.registrationLookup.state === client.state
    && client.registrationLookup.ie.replace(/\D/g, '') === String(client.ie || '').replace(/\D/g, '') ? client.registrationLookup : undefined;
  const condition = client.fiscalCondition || 'unknown';
  return (
    <section className="border border-amber-300 rounded-xl p-3 space-y-2 bg-amber-50 text-amber-950 text-xs">
      <h4 className="font-bold">Condição fiscal do cliente / natureza da operação</h4>
      <p>IE: <strong>{client.ie || 'Não localizada / não informada'}</strong> • UF: {client.state || 'Não informada'}</p>
      <p>{clientFiscalDescription(client)}</p>
      {lookup && <div className="space-y-1">
        <p>Situação do CNPJ na Receita: <strong>{lookup.cnpjStatus || 'Não informada pela fonte'}</strong></p>
        <p>IE na consulta: <strong>{lookup.ieStatus === 'active' ? 'Ativa na UF do estabelecimento' : lookup.ieStatus === 'inactive' ? 'Inativa na UF; condição de ICMS não confirmada' : 'Não confirmada pela consulta'}</strong></p>
        <p>Fonte: {lookup.source} • Consulta: {new Date(lookup.consultedAt).toLocaleString('pt-BR')}</p>
      </div>}
      <p>CNPJ ativo não significa contribuinte de ICMS. IE ativa consultada sugere contribuinte; sem evidência conclusiva, escolha a condição confirmada com o cliente/SEFAZ. CPF também pode ser contribuinte. Consumidor final e operações com ST exigem conferência das regras do Bling.</p>
      <label className="block">Condição de ICMS do destinatário
        <select aria-label="Condição de ICMS do destinatário" className="w-full rounded border p-2 text-slate-900" value={condition} onChange={(event) => {
          const fiscalCondition = event.target.value as NonNullable<ClientInfo['fiscalCondition']>;
          onChange({ ...client, fiscalCondition, operationNature: suggestedNature(natures, fiscalCondition), fiscalReviewKey: undefined });
        }}>
          <option value="unknown">Não confirmada — conferir</option>
          <option value="contributor">Contribuinte com IE</option>
          <option value="non-contributor">Não contribuinte (condição confirmada)</option>
          <option value="exempt">Contribuinte isento de IE (condição confirmada)</option>
        </select>
      </label>
      <label className="block">Natureza de operação cadastrada no Bling
        <select aria-label="Natureza de operação para a NF-e" className="w-full rounded border p-2 text-slate-900" disabled={loading} value={client.operationNature?.id || ''} onChange={(event) => onChange({ ...client, operationNature: natures.find((nature) => nature.id === event.target.value), fiscalReviewKey: undefined })}>
          <option value="">{loading ? 'Consultando Bling...' : 'Selecione / confirme a natureza'}</option>
          {natures.filter((nature) => /^venda de mercadoria/i.test(nature.description)).map((nature) => <option key={nature.id} value={nature.id}>{nature.description}</option>)}
        </select>
      </label>
      {error && <p role="alert">{error} <button type="button" onClick={load} className="underline">Tentar novamente</button></p>}
      {natureSelectionIssue(client) && <p>{natureSelectionIssue(client)}</p>}
      <label className="flex items-start gap-2">
        <input type="checkbox" aria-label="Conferi a condição fiscal do cliente e a natureza da operação no Bling" disabled={Boolean(natureSelectionIssue(client)) || loading || Boolean(error)} checked={clientFiscalReviewed(client)} onChange={(event) => onChange({ ...client, fiscalReviewKey: event.target.checked ? clientFiscalKey(client) : undefined })} />
        <span>Conferi a condição de contribuinte/isenção, a IE e a natureza da operação configurada no Bling para esta venda.</span>
      </label>
      <p>A natureza selecionada será enviada nos itens do novo pedido. O app verificará a natureza da NF-e gerada antes de transmitir; notas existentes com outra natureza ficam bloqueadas, não são reclassificadas silenciosamente.</p>
    </section>
  );
}
