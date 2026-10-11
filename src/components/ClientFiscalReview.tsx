import type { ClientInfo } from '../types';
import { clientFiscalDescription, clientFiscalKey, clientFiscalReviewed } from '../../supabase/functions/_shared/clientFiscalReview';

export function ClientFiscalReview({ client, onChange }: { client: ClientInfo; onChange: (client: ClientInfo) => void }) {
  if (String(client.document || '').replace(/\D/g, '').length !== 14) return null;
  return (
    <section className="border border-amber-300 rounded-xl p-3 space-y-2 bg-amber-50 text-amber-950 text-xs">
      <h4 className="font-bold">Condição fiscal do cliente / natureza da operação</h4>
      <p>IE: <strong>{client.ie || 'Não localizada / não informada'}</strong> • UF: {client.state || 'Não informada'}</p>
      <p>{clientFiscalDescription(client)}</p>
      <p>A consulta de CNPJ não define a natureza da venda. O app mantém a natureza cadastrada no Bling. Se o cliente for contribuinte, não confirme “Venda de mercadoria a não contribuinte” sem revisar com o responsável fiscal.</p>
      <label className="flex items-start gap-2">
        <input type="checkbox" aria-label="Conferi a condição fiscal do cliente e a natureza da operação no Bling" checked={clientFiscalReviewed(client)} onChange={(event) => onChange({ ...client, fiscalReviewKey: event.target.checked ? clientFiscalKey(client) : undefined })} />
        <span>Conferi a condição de contribuinte/isenção, a IE e a natureza da operação configurada no Bling para esta venda.</span>
      </label>
      <p>Alterar CNPJ, IE ou UF exige nova conferência. Essa confirmação não altera cadastros fiscais no ERP.</p>
    </section>
  );
}
