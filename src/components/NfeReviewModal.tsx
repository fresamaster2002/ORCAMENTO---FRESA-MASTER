import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import { nfeTransmissionBlock } from '../nfeTransmissionState';
import { clientFiscalReviewIssue } from '../../supabase/functions/_shared/clientFiscalReview';
import type { BlingNfe, ClientInfo, QuoteData } from '../types';
import type { NfeReview } from '../../supabase/functions/_shared/blingNfeReview';
import { monitorNfe, nfeSituationLabel, nfeWithTransmissionRequest } from '../nfeWorkflow';
import { formatBlingError } from '../../supabase/functions/_shared/blingErrors';
import { NfeSuccessBanner } from './NfeSuccessBanner';

interface Props {
  quote: QuoteData;
  nfeId: string | number;
  orderId: string | number;
  token: string;
  orderChanged: boolean;
  onPersist: (nfe: BlingNfe) => Promise<void>;
  onAdoptRecipient: (client: ClientInfo) => Promise<void>;
  onClose: () => void;
  onReviewClient: () => void;
  onContinueShipping: () => void;
}

interface ReviewResponse {
  success: boolean;
  error?: string;
  review?: NfeReview;
  nfe?: BlingNfe;
  fiscalIssues?: string[];
  warnings?: string[];
  readyToSend?: boolean;
  client?: ClientInfo;
  details?: unknown;
}

const money = (value: number | null) => value === null ? 'Não informado pela API' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-100';

function taxLines(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, entry]) => {
    const label = prefix ? `${prefix} / ${key}` : key;
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) return taxLines(entry as Record<string, unknown>, label);
    return entry == null ? [] : [`${label}: ${String(entry)}`];
  });
}

export function NfeReviewModal({ quote, nfeId, orderId, token, orderChanged, onPersist, onAdoptRecipient, onClose, onReviewClient, onContinueShipping }: Props) {
  const [review, setReview] = useState<NfeReview | null>(null);
  const [edits, setEdits] = useState<Array<{ ncm: string; cfop: string }>>([]);
  const [observations, setObservations] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<'review' | 'update-draft' | 'send-reviewed' | 'adopt-recipient' | 'monitor' | null>('review');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [links, setLinks] = useState<BlingNfe | null>(null);
  const [fiscalDetails, setFiscalDetails] = useState(false);
  const requestedAt = useRef(quote.bling?.nfe?.transmissionRequestedAt);
  const [awaitingResult, setAwaitingResult] = useState(Boolean(requestedAt.current));
  const monitoring = useRef<AbortController | null>(null);
  const operationLock = useRef(false);
  useEffect(() => () => { monitoring.current?.abort(); }, []);
  const editable = review?.situacao === 1 && !awaitingResult;
  const dirty = Boolean(review && (observations !== review.observacoes || edits.some((item, index) => item.ncm !== review.itens[index].ncm || item.cfop !== review.itens[index].cfop)));
  const clientReviewIssue = clientFiscalReviewIssue(quote.client);
  const transmissionBlock = awaitingResult ? 'Envio já solicitado. Consulte a situação; não transmita novamente enquanto o resultado não estiver confirmado.' : nfeTransmissionBlock({ situation: review?.situacao, busy: busy !== null, dirty, ready: ready && !clientReviewIssue, confirmed, orderChanged, error });

  const persistedNfe = (data: ReviewResponse): BlingNfe => {
    if (!data.nfe || String(data.nfe.id) !== String(nfeId)) throw new Error('Resposta não corresponde à NF-e solicitada.');
    const next = nfeWithTransmissionRequest(data.nfe, requestedAt.current);
    requestedAt.current = next.transmissionRequestedAt;
    return next;
  };

  const apply = (data: ReviewResponse) => {
    if (!data.review || !data.nfe || data.review.id !== String(nfeId) || !data.review.revision) throw new Error('O servidor não retornou a conferência da nota solicitada.');
    setReview(data.review);
    setEdits(data.review.itens.map(({ ncm, cfop }) => ({ ncm, cfop })));
    setObservations(data.review.observacoes);
    setIssues(data.fiscalIssues || []);
    setWarnings(data.warnings || []);
    setReady(data.readyToSend === true && !orderChanged);
    setLinks(persistedNfe(data));
    setAwaitingResult(Boolean(requestedAt.current));
    if (data.fiscalIssues?.length) setFiscalDetails(true);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await apiFetch('/api/bling/nfe/review', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nfeId, orderId, quote, token: token.trim() || undefined }),
        });
        const data: ReviewResponse = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Não foi possível conferir a NF-e.');
        if (!cancelled) apply(data);
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : 'Falha ao conferir a NF-e.');
      } finally {
        if (!cancelled) setBusy(null);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [nfeId, orderId]);

  const execute = async (action: 'review' | 'update-draft' | 'send-reviewed') => {
    if (busy || operationLock.current) return;
    if (action === 'send-reviewed' && transmissionBlock) {
      setError(transmissionBlock);
      return;
    }
    if (action === 'send-reviewed' && !window.confirm(`Transmitir a NF-e nº ${review?.numero}, série ${review?.serie}, total ${money(review?.total ?? null)} à SEFAZ? Confira o ambiente configurado no Bling. Após autorização, os dados fiscais não poderão ser editados.`)) return;
    operationLock.current = true;
    setBusy(action);
    setError(null);
    setMessage(null);
    setReady(false);
    setConfirmed(false);
    try {
      if (action === 'send-reviewed') {
        const timestamp = new Date().toISOString();
        await onPersist({ ...links, id: nfeId, transmissionRequestedAt: timestamp });
        requestedAt.current = timestamp;
        setAwaitingResult(true);
      }
      const response = await apiFetch(`/api/bling/nfe/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nfeId, orderId, quote, token: token.trim() || undefined, revision: review?.revision,
          ...(action === 'update-draft' ? { edit: { itens: edits, observacoes: observations } } : {}),
        }),
      });
      const data: ReviewResponse = await response.json();
      if (!response.ok || !data.success) throw new Error(formatBlingError(data.details, data.error || 'Não foi possível concluir a operação.'));
      apply(data);
      if (data.nfe) await onPersist(persistedNfe(data));
      setMessage(action === 'update-draft' ? 'Correções salvas e relidas no Bling. Confira novamente antes de emitir.' : action === 'send-reviewed' ? (data.review?.situacao === 5 ? 'NF-e autorizada pela SEFAZ.' : 'Transmissão solicitada. Consulte a situação antes de repetir.') : 'Dados atualizados do Bling.');
      if (action === 'send-reviewed' && [1, 3, 8, 10].includes(data.review?.situacao ?? 0)) {
        const controller = new AbortController();
        monitoring.current = controller;
        setBusy('monitor');
        setMessage('Envio solicitado. Acompanhando o retorno da SEFAZ, sem repetir a transmissão...');
        await monitorNfe(async () => {
          const response = await apiFetch('/api/bling/nfe/review', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
            body: JSON.stringify({ nfeId, orderId, quote, token: token.trim() || undefined }),
          });
          const next: ReviewResponse = await response.json();
          if (!response.ok || !next.success) throw new Error(next.error || 'Não foi possível acompanhar a NF-e.');
          return next;
        }, (next) => next.review?.situacao, async (next) => {
          apply(next);
          await onPersist(persistedNfe(next));
          setMessage(`Situação consultada: ${nfeSituationLabel(next.review?.situacao)}.`);
        }, () => new Promise<void>((resolve) => window.setTimeout(resolve, 5000)), controller.signal);
        if (requestedAt.current) setMessage('O resultado ainda não foi confirmado. Use Recarregar nota; a transmissão não será repetida automaticamente.');
      }
    } catch (failure) {
      setReady(false);
      if (monitoring.current?.signal.aborted) setMessage('Acompanhamento pausado. O envio não foi cancelado. Consulte a situação antes de qualquer nova tentativa.');
      else setError(failure instanceof Error ? failure.message : 'Falha ao processar a NF-e. Recarregue antes de repetir.');
    } finally {
      setBusy(null);
      operationLock.current = false;
      monitoring.current = null;
    }
  };

  const shareInvoice = async () => {
    if (!review || review.situacao !== 5 || !links?.linkDanfe) return;
    const text = `Fresa Master — NF-e ${review.numero}, série ${review.serie}\nTotal: ${money(review.total)}\nDANFE: ${links.linkDanfe}${links.linkXml ? `\nXML: ${links.linkXml}` : ''}`;
    try {
      if (navigator.share) await navigator.share({ title: 'NF-e Fresa Master', text });
      else { await navigator.clipboard.writeText(text); setMessage('Mensagem com os links copiada. Cole no WhatsApp ou e-mail do cliente.'); }
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') return;
      setError(failure instanceof Error ? failure.message : 'Não foi possível compartilhar a nota.');
    }
  };

  const adoptRecipient = async () => {
    if (busy || !review || dirty || orderChanged) return;
    if (!window.confirm('Usar no orçamento o nome e endereço fiscal já existentes nesta NF-e para o mesmo CPF/CNPJ? Itens, valores, entrega e cadastro do Bling não serão alterados. A condição fiscal precisará ser conferida novamente.')) return;
    setBusy('adopt-recipient');
    setError(null);
    setReady(false);
    setConfirmed(false);
    try {
      const response = await apiFetch('/api/bling/nfe/adopt-recipient', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nfeId, orderId, quote, revision: review.revision, token: token.trim() || undefined }),
      });
      const data: ReviewResponse = await response.json();
      if (!response.ok || !data.success || !data.client) throw new Error(data.error || 'Não foi possível conferir o destinatário da venda.');
      await onAdoptRecipient(data.client);
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Falha ao salvar o destinatário conferido.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/75 p-0 sm:p-4 flex items-center justify-center">
      <section role="dialog" aria-modal="true" aria-labelledby="nfe-review-title" className="w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[94dvh] flex flex-col bg-white text-slate-900 sm:rounded-xl overflow-hidden shadow-2xl">
        <header className="shrink-0 flex items-center justify-between gap-3 p-4 border-b">
          <div><h2 id="nfe-review-title" className="font-bold text-lg">Conferir e editar NF-e</h2><p className="text-xs">Dados reais do Bling • Pedido {orderId} • Orçamento {quote.id}</p></div>
          <button type="button" onClick={onClose} disabled={busy !== null} className="border rounded-lg px-3 py-2 disabled:opacity-50">Voltar</button>
        </header>
        <div className="overflow-y-auto flex-1 min-h-0 p-4 space-y-4 text-sm">
          {busy && <p role="status">{busy === 'review' ? 'Consultando a nota no Bling...' : busy === 'update-draft' ? 'Salvando e conferindo as correções...' : busy === 'adopt-recipient' ? 'Conferindo e salvando o destinatário no orçamento...' : busy === 'monitor' ? 'Aguardando retorno da SEFAZ...' : 'Transmitindo e consultando a SEFAZ...'}</p>}
          {busy === 'monitor' && <button type="button" onClick={() => monitoring.current?.abort()} className="border rounded-lg px-3 py-2 text-xs">Parar acompanhamento (não cancela o envio)</button>}
          {error && <p role="alert" className="p-3 bg-red-50 text-red-800 rounded-lg">{error} Recarregue a nota para conferir o estado atual antes de continuar.</p>}
          {message && <p role="status" className="p-3 bg-emerald-50 text-emerald-800 rounded-lg">{message}</p>}
          {orderChanged && <p role="alert" className="p-3 bg-amber-50 text-amber-900 rounded-lg">{review?.situacao === 5 ? 'O orçamento atual difere da venda desta nota já autorizada. Essa diferença não altera a NF-e emitida e não permite nova transmissão.' : 'O orçamento mudou depois de criar o pedido. A transmissão fica bloqueada até revisar os dados da venda vinculada. Não crie outro pedido para esta nota.'}</p>}
          {clientReviewIssue && review?.situacao !== 5 && <div role="alert" className="p-3 bg-amber-50 text-amber-900 rounded-lg"><p>{clientReviewIssue}</p><button type="button" onClick={onReviewClient} disabled={busy !== null} className="underline">Conferir cadastro fiscal</button></div>}
          {review && <>
            <NfeSuccessBanner situation={review.situacao} number={review.numero} series={review.serie} />
            <div className="p-3 bg-indigo-50 rounded-lg space-y-1">
              <p><strong>NF-e {review.numero || 'sem número'} • Série {review.serie ?? 'não informada'}</strong></p>
              <p>Situação: {nfeSituationLabel(review.situacao)}{review.situacao === 5 ? ' — somente consulta' : ''}</p>
              <p>Natureza: {review.naturezaOperacao === quote.client.operationNature?.id ? quote.client.operationNature.description : `Descrição não confirmada (ID ${review.naturezaOperacao || 'não informado'})`}</p>
              {quote.client.operationNature && review.naturezaOperacao !== quote.client.operationNature.id && <p className="text-amber-900">Divergência: o cadastro selecionou {quote.client.operationNature.description} (ID {quote.client.operationNature.id}).</p>}
              {review.situacao !== 5 && <details><summary className="cursor-pointer text-xs">Sobre o ambiente de emissão</summary><p className="text-xs text-amber-900 pt-2">A transmissão é feita aqui no app. O ambiente produção/homologação segue a configuração de emissão do Bling, que a API não informa. Se você já confirmou essa configuração, não precisa abrir o Bling novamente para cada nota.</p></details>}
            </div>
            {issues.map((issue, index) => <p key={index} role="alert" className="p-2 bg-red-50 text-red-800 rounded">{issue}</p>)}
            {issues.length > 0 && <div className="flex gap-2 text-xs"><button type="button" disabled={busy !== null} onClick={onReviewClient} className="underline">Conferir cadastro fiscal</button><button type="button" onClick={() => setFiscalDetails(true)} className="underline">Ver detalhes fiscais</button><a href={`https://www.bling.com.br/notas.fiscais.php#edit/${nfeId}`} target="_blank" rel="noopener noreferrer" className="underline">Revisar pedido/nota no Bling</a></div>}
            {review.situacao === 4 && <p role="alert" className="p-3 bg-red-50 text-red-800 rounded">A nota foi rejeitada. Confira a mensagem original retornada pelo Bling/SEFAZ e corrija a pendência antes de reenviar. <a href={`https://www.bling.com.br/notas.fiscais.php#edit/${nfeId}`} target="_blank" rel="noopener noreferrer" className="underline">Consultar rejeição no Bling</a></p>}
            {[1, 4].includes(review.situacao ?? 0) && issues.some((issue) => issue.includes('destinatário/endereço fiscal')) && <button type="button" disabled={busy !== null || dirty || orderChanged} onClick={adoptRecipient} className="border border-amber-500 rounded-lg px-3 py-2 disabled:opacity-50">Conferir e usar destinatário desta NF-e no orçamento</button>}
            {warnings.map((warning, index) => <p key={index} className="p-2 bg-amber-50 text-amber-900 rounded">{warning}</p>)}
            <section className="border rounded-lg p-3 space-y-1">
              <h3 className="font-bold">Destinatário / faturamento</h3>
              <p>{review.cliente.nome || 'Não informado'}</p><p>CPF/CNPJ: {review.cliente.documento || 'Não informado'} • IE: {review.cliente.ie || 'Não informada'}</p>
              <p>{review.cliente.endereco || 'Endereço não informado'}</p><p>{review.cliente.email}</p>
            </section>
            <label className="flex gap-2 items-center text-xs"><input type="checkbox" checked={fiscalDetails} onChange={(event) => setFiscalDetails(event.target.checked)} />Mostrar detalhes fiscais / editar</label>
            {fiscalDetails && <p className="text-xs text-slate-600">Cliente, quantidades, preços, frete e pagamento são somente consulta. Para alterá-los, revise o pedido vinculado no Bling. NCM e CFOP devem ser confirmados com o contador; a edição não altera o cadastro do produto.</p>}
            {review.itens.map((item, index) => <section key={index} className="border rounded-lg p-3 space-y-3">
              <h3 className="font-semibold">{index + 1}. {item.descricao}</h3>
              <p>{item.quantidade ?? 'Não informada'} {item.unidade} × {money(item.valor)} • Total do item: {money(item.total)}</p>
              {fiscalDetails && <><div className="grid grid-cols-2 gap-3">
                <label>NCM<input aria-label={`NCM da NF-e item ${index + 1}`} className={inputClass} value={edits[index]?.ncm || ''} disabled={!editable || busy !== null} onChange={(event) => { setConfirmed(false); setEdits((current) => current.map((entry, i) => i === index ? { ...entry, ncm: event.target.value } : entry)); }} /></label>
                <label>CFOP<input aria-label={`CFOP da NF-e item ${index + 1}`} className={inputClass} value={edits[index]?.cfop || ''} disabled={!editable || busy !== null} onChange={(event) => { setConfirmed(false); setEdits((current) => current.map((entry, i) => i === index ? { ...entry, cfop: event.target.value } : entry)); }} /></label>
              </div>
              <details><summary className="cursor-pointer">Impostos informados pelo Bling (somente consulta)</summary><div className="text-xs space-y-1 pt-2">{taxLines(item.impostos).length ? taxLines(item.impostos).map((line) => <p key={line}>{line}</p>) : <p>A API não informou o detalhamento de impostos deste item.</p>}</div></details></>}
            </section>)}
            <section className="border rounded-lg p-3 space-y-1">
              <h3 className="font-bold">Valores e pagamento</h3>
              <p>Frete: {money(review.frete)}</p>
              {fiscalDetails && <><p>Seguro fiscal: {money(review.seguro)}</p><p>Desconto: {money(review.desconto)} • Despesas: {money(review.despesas)}</p></>}
              <p className="text-lg font-bold">Total da NF-e: {money(review.total)}</p>
              <p>Total do orçamento atual: {money(quote.financials.totalAmount)}</p>
              {review.parcelas.map((installment, index) => <p key={index}>Parcela {index + 1}: {money(installment.valor)} • {installment.data}{fiscalDetails ? ` • Forma de pagamento ID ${installment.formaPagamentoId}` : ''}</p>)}
              <p>Pagamento: {quote.financials.paymentMethod}</p>
            </section>
            <section className="border rounded-lg p-3"><h3 className="font-bold">Transporte / entrega</h3><p>{review.transportador || 'Transportador não informado'}</p><p>{review.entrega || 'Endereço de entrega não informado pela API'}</p></section>
            {fiscalDetails ? <label className="block">Observações / informações complementares<textarea aria-label="Observações da NF-e" className={inputClass} rows={4} maxLength={5000} value={observations} disabled={!editable || busy !== null} onChange={(event) => { setConfirmed(false); setObservations(event.target.value); }} /></label> : observations && <p>Observações: {observations}</p>}
            {links?.linkDanfe && <a className="text-indigo-700 underline" href={links.linkDanfe} target="_blank" rel="noopener noreferrer">Abrir DANFE</a>}
            {links?.linkXml && <a className="ml-4 text-indigo-700 underline" href={links.linkXml} target="_blank" rel="noopener noreferrer">Abrir XML</a>}
            {review.situacao === 5 && <section className="p-3 bg-emerald-50 rounded-lg space-y-2"><h3 className="font-bold text-emerald-900">NF-e autorizada — próximos passos</h3><p className="text-xs">Os dados acima são da nota emitida no Bling. Alterações no orçamento não modificam esta NF-e.</p><div className="flex flex-wrap gap-2"><button type="button" onClick={shareInvoice} disabled={!links?.linkDanfe || busy !== null} className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50">Compartilhar com cliente</button><button type="button" onClick={onContinueShipping} disabled={busy !== null} className="border rounded-lg px-3 py-2 text-sm">Continuar para envio</button></div><p className="text-xs">Links do Bling podem expirar. Recarregue a nota para obter links atualizados. O envio usa a conta de produção do Melhor Envio; pagamento e etiqueta são concluídos no painel oficial.</p></section>}
          </>}
        </div>
        <footer className="shrink-0 p-3 border-t space-y-2 bg-slate-50">
          {review && review.situacao !== 5 && <p id="nfe-transmission-help" role="status" className="text-xs text-indigo-900">{transmissionBlock || 'Tudo conferido. O próximo botão transmite esta NF-e à SEFAZ pelo app.'}</p>}
          {review && review.situacao !== 5 && <label className="flex items-start gap-2 text-xs"><input type="checkbox" aria-label="Conferi os dados fiscais e o ambiente de emissão" checked={confirmed} disabled={awaitingResult || busy !== null || dirty || !ready || Boolean(clientReviewIssue) || orderChanged || error !== null} onChange={(event) => setConfirmed(event.target.checked)} /><span>Conferi os dados fiscais, o total e o ambiente de emissão configurado no Bling.</span></label>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy !== null} onClick={() => { if (!dirty || window.confirm('Descartar alterações não salvas e recarregar a nota do Bling?')) execute('review'); }} className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50">Recarregar nota</button>
            {editable && <button type="button" disabled={busy !== null || !dirty} onClick={() => execute('update-draft')} className="rounded-lg px-3 py-2 text-sm bg-emerald-700 text-white disabled:opacity-50">Salvar correções no Bling</button>}
            {review && review.situacao !== 5 && <button type="button" aria-describedby="nfe-transmission-help" disabled={transmissionBlock !== null} onClick={() => execute('send-reviewed')} className="rounded-lg px-3 py-2 text-sm bg-indigo-700 text-white disabled:opacity-50">{busy === 'send-reviewed' ? 'Transmitindo à SEFAZ...' : 'Transmitir NF-e à SEFAZ'}</button>}
          </div>
        </footer>
      </section>
    </div>
  );
}
