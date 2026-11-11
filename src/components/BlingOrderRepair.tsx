import { useRef, useState } from 'react';
import { apiFetch } from '../api';
import { adoptBlingOrderItems, restoreBlingOrderSnapshot } from '../blingOrderSnapshot';
import type { QuoteData } from '../types';

interface Props {
  quote: QuoteData;
  token: string;
  changed: boolean;
  disabled?: boolean;
  onPersist: (quote: QuoteData) => Promise<void>;
  onCorrected: () => void;
}

export function BlingOrderRepair({ quote, token, changed, disabled, onPersist, onCorrected }: Props) {
  const [preview, setPreview] = useState<QuoteData | null>(null);
  const previewSource = useRef('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    previewSource.current = JSON.stringify(quote);
    try {
      if (changed) {
        setPreview(restoreBlingOrderSnapshot(quote));
      } else {
        const response = await apiFetch('/api/bling/nfe/reconcile-items', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: quote.bling?.orderId, quote, token: token.trim() || undefined }),
        });
        const data = await response.json();
        if (!response.ok || !data.success || String(data.orderId) !== String(quote.bling?.orderId) || !Array.isArray(data.items)) throw new Error(data.error || 'Não foi possível conferir o pedido.');
        setPreview(adoptBlingOrderItems(quote, data.items));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível conferir a correção.');
    } finally { lock.current = false; setBusy(false); }
  };
  const apply = async () => {
    if (!preview || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      if (previewSource.current !== JSON.stringify(quote)) throw new Error('O orçamento mudou durante a conferência. Cancele a prévia e confira novamente antes de aplicar.');
      await onPersist(preview);
      setPreview(null);
      onCorrected();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar a correção.');
    } finally { lock.current = false; setBusy(false); }
  };
  return <div className="min-w-0 space-y-2 break-words rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-slate-900">
    <p className="font-semibold">Corrigir sem duplicar o pedido</p>
    <p>{changed ? 'Restaure os itens, cadastro, entrega e valores da versão salva ao criar a venda. Confira antes de aplicar.' : 'Consulte os itens reais do pedido e corrija descrição, SKU e vínculo no orçamento, preservando quantidades e preços.'} A venda e a NF-e no Bling não serão alteradas nem transmitidas.</p>
    {!preview ? <button type="button" disabled={disabled || busy} onClick={load} className="underline font-semibold disabled:opacity-50">{busy ? 'Conferindo...' : changed ? 'Conferir versão salva para restaurar' : 'Conferir e corrigir itens do pedido'}</button> : <>
      <p>{preview.client.name} — Total: {preview.financials.totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
      {changed && <div>
        <p>CPF/CNPJ: {preview.client.document} — Endereço fiscal: {preview.client.address}, {preview.client.number}, {preview.client.city}/{preview.client.state} — CEP {preview.client.cep}</p>
        <p>Entrega: CEP {preview.shipping.destinationCep} — {preview.shipping.selectedOption?.name} — Pagamento: {preview.financials.paymentMethod} — Data: {preview.project.date}</p>
      </div>}
      <ul className="list-disc pl-5">{preview.items.map((item) => <li key={item.id}>{item.description} — SKU {item.sku || 'sem SKU'}{item.blingProductId ? ` — Bling #${item.blingProductId}` : ''} — {item.quantity} × {item.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</li>)}</ul>
      <button type="button" disabled={disabled || busy} onClick={apply} className="rounded-lg bg-indigo-600 px-3 py-2 text-white disabled:opacity-50">{busy ? 'Salvando...' : 'Aplicar correção no orçamento'}</button>
      <button type="button" disabled={busy} onClick={() => setPreview(null)} className="ml-3 underline">Cancelar</button>
    </>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <a className="block underline" target="_blank" rel="noopener noreferrer" href={`https://www.bling.com.br/b/vendas.php#edit/${quote.bling?.orderId}`}>Conferir pedido no Bling</a>
  </div>;
}
