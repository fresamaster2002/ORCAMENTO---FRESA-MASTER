import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, LoaderCircle, X } from 'lucide-react';
import { apiFetch } from '../api';
import type { BlingNfe, QuoteData, ShippingInfo } from '../types';
import { nfeSituationLabel, synchronizeShippingNfe } from '../nfeWorkflow';
import { initialSender, loadSender, senderFields, SENDER_STORAGE_KEY, type SenderData } from '../shipmentSender';
import { deliveryCorrection, isProductionShipment, productionMissing } from '../productionShipping';
import { DeliveryAddressCard } from './DeliveryAddressCard';
import { ProposalDeliveryAddress } from './ProposalDeliveryAddress';
import { ProductionShipmentNotice } from './ProductionShipmentNotice';
import { shippingErrorDiagnostic, shippingInvoiceDiagnostic, type ShippingDiagnostic } from '../shippingDiagnostics';

interface Props {
  quote: QuoteData;
  onClose: () => void;
  onPrepare: () => Promise<void>;
  onUpdate: (shipment: NonNullable<QuoteData['productionShipment']>) => Promise<void>;
  onUpdateShipping: (shipping: ShippingInfo) => Promise<void>;
  onReviewInvoice: () => void;
  onUpdateNfe: (nfe: BlingNfe) => Promise<void>;
}
const money = (price: number) => price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ProductionShipmentModal({ quote, onClose, onPrepare, onUpdate, onUpdateShipping, onReviewInvoice, onUpdateNfe }: Props) {
  const [sender, setSender] = useState(loadSender);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [invoiceChecked, setInvoiceChecked] = useState(false);
  const [shipment, setShipment] = useState(quote.productionShipment);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [rate, setRate] = useState<{ price: number; serviceId: number; fingerprint: string } | null>(null);
  const [deliveryDraft, setDeliveryDraft] = useState<ShippingInfo | null>(null);
  const [deliveryProcessing, setDeliveryProcessing] = useState(false);
  const operation = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const deliveryRef = useRef<HTMLFieldSetElement>(null);
  const senderRef = useRef<HTMLFieldSetElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const prepareRef = useRef(onPrepare);
  const updateRef = useRef(onUpdate);
  const fiscalRef = useRef({ quote, onUpdateNfe });
  fiscalRef.current = { quote, onUpdateNfe };
  prepareRef.current = onPrepare;
  updateRef.current = onUpdate;
  closeRef.current = onClose;
  busyRef.current = busy;
  const fingerprint = JSON.stringify([sender, quote.shipping, quote.items]);
  const rateCurrent = rate?.fingerprint === fingerprint;
  const missing = productionMissing(quote);
  const errorDiagnostic = error ? shippingErrorDiagnostic(error, quote) : null;
  const invoiceDiagnostic = shippingInvoiceDiagnostic(quote);
  if (sender.cep.replace(/\D/g, '') !== quote.shipping.originCep.replace(/\D/g, '')) {
    missing.push('O CEP do remetente difere da origem do orçamento. Use “Usar CEP do remetente como origem” e cote novamente.');
  }
  const addressAndOrderMissing = missing.filter((item) => !item.startsWith('Consulte no Bling a NF-e autorizada'));

  const readSaved = async () => {
    const response = await apiFetch('/api/shipping/production-shipment', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteId: quote.id }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Não foi possível conferir solicitações anteriores.');
    if (data.shipment !== null && !isProductionShipment(data.shipment)) throw new Error('O registro de envio real é inválido. Confira o painel oficial antes de continuar.');
    setShipment(data.shipment || undefined);
    if (isProductionShipment(data.shipment)) await updateRef.current(data.shipment);
    setChecked(true);
  };

  const refreshInvoice = async (isActive: () => boolean = () => true) => {
    setInvoiceChecked(false);
    setRate(null);
    setConfirmed(false);
    const current = fiscalRef.current;
    const updated = await synchronizeShippingNfe(current.quote, async (link) => {
      const token = localStorage.getItem('fresa_master_bling_token') || '';
      const response = await apiFetch('/api/bling/nfe/status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...link, token: token.trim() || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível consultar a NF-e do Bling. Nenhuma nota foi emitida.');
      return data;
    }, async (next) => {
      if (!isActive()) return;
      await fiscalRef.current.onUpdateNfe(next);
    });
    if (!isActive()) return;
    setInvoiceChecked(true);
    setMessage(updated
      ? `NF-e ${updated.numero || updated.id} • série ${updated.serie ?? 'não informada'} • ${nfeSituationLabel(updated.situacao)}. Situação e chave salvas no orçamento; nenhuma nota foi emitida ou renumerada.`
      : 'O pedido não possui NF-e vinculada no Bling. Confira a venda existente antes de continuar; nenhuma nota foi gerada.');
  };

  useEffect(() => {
    if (error && !busy) {
      errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      errorRef.current?.focus({ preventScroll: true });
    }
  }, [error, busy]);

  useEffect(() => {
    if (deliveryDraft) {
      deliveryRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      deliveryRef.current?.querySelector<HTMLInputElement>('input[placeholder="00000-000"]')?.focus({ preventScroll: true });
    }
  }, [Boolean(deliveryDraft)]);

  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current();
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]') || [])
        .filter((control) => !control.closest('fieldset:disabled'));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  useEffect(() => {
    let active = true;
    setChecked(false);
    setInvoiceChecked(false);
    operation.current = true;
    setBusy(true);
    void (async () => {
      try {
        await prepareRef.current();
        if (active) await readSaved();
        if (active && fiscalRef.current.quote.bling?.orderId) await refreshInvoice(() => active);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Falha ao conferir o envio salvo.');
      } finally {
        if (active) { operation.current = false; setBusy(false); }
      }
    })();
    return () => { active = false; };
  }, [quote.id]);

  const execute = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError(null);
    setMessage('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha na operação de envio real.'); }
    finally { operation.current = false; setBusy(false); }
  };

  const testConnection = () => execute(async () => {
    const response = await apiFetch('/api/shipping/test-production', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const data = await response.json();
    if (!response.ok || !data.success || data.environment !== 'production') throw new Error(data.error || 'Não foi possível validar a conta real.');
    setMessage(`Conta real conectada: ${data.email}. Nenhum envio foi criado, pago ou emitido neste teste.`);
  });

  const connectAccount = () => execute(async () => {
    setAuthorizationUrl(null);
    const response = await apiFetch('/api/shipping/melhor-envio/authorize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    const data = await response.json();
    if (!response.ok || !data.success || typeof data.authorizationUrl !== 'string'
      || !data.authorizationUrl.startsWith('https://melhorenvio.com.br/oauth/authorize?')) {
      throw new Error(data.error || 'Não foi possível iniciar a autorização oficial.');
    }
    setAuthorizationUrl(data.authorizationUrl);
    setMessage('Abra o link de autorização abaixo. Depois de autorizar no Melhor Envio, volte ao app e teste a conta real. Se o link expirar, clique em Conectar novamente.');
  });

  const calculate = () => execute(async () => {
    setRate(null);
    setConfirmed(false);
    const response = await apiFetch('/api/shipping/quote-production', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quote, sender }),
    });
    const data = await response.json();
    const price = Number(data.option?.price);
    const serviceId = Number(data.option?.melhorEnvioServiceId);
    if (!response.ok || !data.success || data.environment !== 'production' || !Number.isFinite(price) || price <= 0 || !Number.isInteger(serviceId)) throw new Error(data.error || 'Cotação real inválida.');
    setRate({ price, serviceId, fingerprint });
    setMessage('Cotação real conferida. O frete cobrado do cliente e a NF-e não foram alterados. O valor será conferido novamente antes da inclusão.');
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!checked || !invoiceChecked || shipment && shipment.status !== 'rejected' || !confirmed || !rateCurrent || !rate || missing.length) return;
    void execute(async () => {
      await prepareRef.current();
      // A network failure after this point must be recovered from the server record, not retried blindly.
      setChecked(false);
      const blingToken = localStorage.getItem('fresa_master_bling_token') || '';
      const response = await apiFetch('/api/shipping/create-production-shipment', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(blingToken ? { 'X-Bling-Token': blingToken } : {}) },
        body: JSON.stringify({ quoteId: quote.id, sender,
          confirmProduction: true, expectedPrice: rate.price, expectedServiceId: rate.serviceId, quotedEnvironment: 'production' }),
      });
      const data = await response.json();
      if (isProductionShipment(data.shipment)) {
        setShipment(data.shipment);
        await updateRef.current(data.shipment);
      }
      if (!response.ok || !data.success) throw new Error(data.error || 'Não foi possível confirmar o envio. Consulte a solicitação salva antes de repetir.');
      if (!isProductionShipment(data.shipment)) throw new Error('Resposta sem registro de envio real. Confira o painel oficial.');
      setChecked(true);
      setMessage(data.shipment.id ? 'Envio real adicionado ao carrinho. Pague e emita a etiqueta somente no painel oficial.' : 'Existe uma solicitação sem confirmação. Confira o carrinho oficial; não repita a inclusão.');
    });
  };

  const updateSender = (key: keyof SenderData, value: string) => {
    const next = { ...sender, [key]: value };
    setSender(next);
    setConfirmed(false);
    try { localStorage.setItem(SENDER_STORAGE_KEY, JSON.stringify(next)); }
    catch (cause) { setError(`Não foi possível salvar o remetente neste navegador: ${cause instanceof Error ? cause.message : String(cause)}. Confira os dados ao reabrir.`); }
  };
  const openDeliveryCorrection = () => {
    setRate(null); setConfirmed(false); setDeliveryDraft(deliveryCorrection(quote));
  };
  const diagnosticAction = (diagnostic: ShippingDiagnostic) => {
    if (diagnostic.action === 'delivery') openDeliveryCorrection();
    else if (diagnostic.action === 'invoice') void execute(() => refreshInvoice());
    else if (diagnostic.action === 'connection') void testConnection();
    else if (diagnostic.action === 'sender') {
      senderRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      senderRef.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    }
  };
  const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-3">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="production-shipment-title" style={{ maxHeight: 'calc(100dvh - var(--fm-nav-h, 0px) - 1.5rem)' }} className="w-full max-w-3xl overflow-y-auto rounded-xl bg-white text-slate-900 shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div><p className="text-xs font-bold text-amber-700">Melhor Envio • PRODUÇÃO</p><h2 id="production-shipment-title" className="text-lg font-bold">Melhor Envio — {quote.id}</h2><p className="text-sm">{quote.client.name}</p></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Fechar envio real" className="p-2"><X className="h-5 w-5" /></button>
        </header>
        <form onSubmit={submit} className="space-y-4 p-5">
          <ProductionShipmentNotice />
          {error && errorDiagnostic && (
            <div ref={errorRef} tabIndex={-1} role="alert" className="space-y-3 rounded-xl border-2 border-red-400 bg-red-50 p-4 text-sm text-red-950">
              <h3 className="flex items-start gap-2 text-base font-bold"><AlertTriangle className="h-5 w-5 shrink-0" />{errorDiagnostic.title}</h3>
              <p>{errorDiagnostic.explanation}</p>
              <p className="font-bold">O que fazer agora:</p>
              <ol className="list-decimal space-y-1 pl-5">{errorDiagnostic.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              {errorDiagnostic.action && (!shipment || shipment.status === 'rejected') && <button type="button" disabled={busy} onClick={() => diagnosticAction(errorDiagnostic)} className="rounded-lg bg-red-800 px-4 py-2 font-bold text-white disabled:opacity-50">{errorDiagnostic.actionLabel}</button>}
              <details className="break-words text-xs"><summary className="cursor-pointer font-semibold">Ver detalhes técnicos do erro</summary><p className="mt-2">{error}</p></details>
            </div>
          )}
          {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
          {shipment && shipment.status !== 'rejected' ? (
            <section className="space-y-2 rounded-lg border border-slate-300 p-4">
              <h3 className="font-bold">{shipment.id ? 'Envio registrado no Melhor Envio' : 'Solicitação do Melhor Envio sem confirmação'}</h3>
              {shipment.id && <p className="break-all text-sm">ID: {shipment.id}{shipment.protocol ? ` • Protocolo: ${shipment.protocol}` : ''}</p>}
              <p className="text-sm">Frete cotado para o envio: {money(shipment.price)}. Confira o preço final no painel oficial.</p>
              <p className="text-sm">{shipment.id ? 'A inclusão no carrinho não confirma pagamento nem etiqueta emitida.' : 'A inclusão pode ter sido recebida. A nova tentativa está bloqueada para evitar duplicação; confira o carrinho e solicite conferência antes de reenviar.'}</p>
            </section>
          ) : (
            <>
              {shipment?.status === 'rejected' && <p role="alert" className="text-sm text-red-800">A inclusão anterior foi recusada pelo Melhor Envio: {shipment.error || 'Confira os dados e a permissão do token real.'} Corrija os dados e faça uma nova cotação.</p>}
              {addressAndOrderMissing.length > 0 && <div className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-bold">Antes de enviar, resolva estas pendências:</p><ul className="mt-2 list-disc space-y-1 pl-5">{addressAndOrderMissing.map((item) => <li key={item}>{item}</li>)}</ul></div>}
              {invoiceDiagnostic && !busy && (
                <section className="space-y-2 rounded-xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
                  <h3 className="font-bold">{invoiceDiagnostic.title}</h3>
                  <p>{invoiceDiagnostic.explanation}</p>
                  <ol className="list-decimal space-y-1 pl-5">{invoiceDiagnostic.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                  <button type="button" onClick={() => diagnosticAction(invoiceDiagnostic)} className="rounded-lg bg-amber-500 px-4 py-2 font-bold">{invoiceDiagnostic.actionLabel}</button>
                </section>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => void execute(() => refreshInvoice())} className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold">Atualizar NF-e do Bling (sem emitir)</button>
                <button type="button" disabled={busy} onClick={openDeliveryCorrection} className="rounded-lg border border-amber-600 px-3 py-2 text-sm font-semibold">Corrigir entrega / CEP</button>
                <button type="button" disabled={busy} onClick={onReviewInvoice} className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold">Conferir NF-e e ferramentas no Bling</button>
              </div>
              {deliveryDraft && (
                <fieldset ref={deliveryRef} disabled={busy} className="space-y-2">
                  <DeliveryAddressCard shipping={deliveryDraft} onChange={setDeliveryDraft} onProcessingChange={setDeliveryProcessing} />
                  <button type="button" disabled={busy || deliveryProcessing} onClick={() => void execute(async () => {
                    await onUpdateShipping(deliveryDraft);
                    setRate(null); setConfirmed(false); setDeliveryDraft(null);
                    setMessage('Entrega salva. A NF-e e o preço cobrado do cliente não foram alterados. Cote novamente antes de criar o envio.');
                  })} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold">Salvar entrega e liberar nova cotação</button>
                  <button type="button" disabled={busy || deliveryProcessing} onClick={() => setDeliveryDraft(null)} className="ml-2 rounded-lg border border-slate-400 px-3 py-2 text-sm">Cancelar correção</button>
                </fieldset>
              )}
              <fieldset ref={senderRef} disabled={busy} className="space-y-3">
                <legend className="font-bold">Confira o remetente real</legend>
                <div className="grid gap-3 sm:grid-cols-2">{senderFields.map(({ key, label, required }) => (
                  <label key={key} className="space-y-1 text-xs font-semibold"><span>{label}{required ? ' *' : ''}</span><input className={inputClass} value={sender[key]} onChange={(event) => updateSender(key, event.target.value)} required={required} maxLength={key === 'state' ? 2 : undefined} /></label>
                ))}</div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void execute(async () => {
                    const { address, number, complement, neighborhood, city, state, cep } = initialSender;
                    const updated = { ...sender, address, number, complement, neighborhood, city, state, cep };
                    await onUpdateShipping({ ...quote.shipping, originCep: cep });
                    localStorage.setItem(SENDER_STORAGE_KEY, JSON.stringify(updated));
                    setSender(updated); setRate(null); setConfirmed(false);
                    setMessage('Origem de despacho salva: 13329-350. Endereço fiscal e destino preservados. Cote novamente.');
                  })} className="rounded-lg border border-amber-600 px-3 py-2 text-sm font-semibold">Usar origem Fresa Master 13329-350</button>
                  <button type="button" onClick={() => void execute(async () => {
                    if (sender.cep.replace(/\D/g, '').length !== 8) throw new Error('Informe um CEP do remetente com 8 dígitos.');
                    await onUpdateShipping({ ...quote.shipping, originCep: sender.cep });
                    setRate(null); setConfirmed(false);
                    setMessage('Origem salva. Confira o remetente e cote novamente.');
                  })} className="rounded-lg border border-slate-400 px-3 py-2 text-sm">Usar CEP do remetente como origem</button>
                </div>
              </fieldset>
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="mb-2 text-sm font-bold">Cliente: {quote.client.name} • {quote.shipping.selectedOption?.name || 'Selecione o frete'}</p>
                <ProposalDeliveryAddress client={quote.client} shipping={quote.shipping} />
                <p className="mt-2 break-all text-xs">NF-e: {quote.bling?.nfe?.chaveAcesso || 'Chave não disponível'}</p>
                <p className="mt-1 text-xs">Pacote: {quote.shipping.packageDimensions?.height} × {quote.shipping.packageDimensions?.width} × {quote.shipping.packageDimensions?.length} cm • {quote.shipping.weightKg} kg</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={connectAccount} className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold">Conectar Melhor Envio (OAuth)</button>
                <button type="button" disabled={busy} onClick={() => void testConnection()} className="rounded-lg border border-slate-400 px-3 py-2 text-sm font-semibold">Testar conexão Melhor Envio</button>
                <button type="button" disabled={busy || Boolean(deliveryDraft) || !checked || !quote.shipping.selectedOption} onClick={() => void calculate()} className="rounded-lg border border-amber-600 px-3 py-2 text-sm font-semibold">Cotar no Melhor Envio</button>
              </div>
              {authorizationUrl && <a href={authorizationUrl} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-700 underline">Autorizar cotação e carrinho no Melhor Envio (sem pagamento automático)</a>}
              {rateCurrent && rate && <p className="text-sm font-bold">Custo real cotado: {money(rate.price)} • Frete no orçamento do cliente: {money(quote.financials.shippingAmount)} (não alterado).</p>}
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy || !rateCurrent || !checked} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" /><span>Conferi remetente, destinatário, NF-e e pacote. Autorizo adicionar este envio ao carrinho REAL, sem pagamento ou emissão automática.</span></label>
              <button type="submit" disabled={busy || !checked || !invoiceChecked || !confirmed || !rateCurrent || missing.length > 0} className="rounded-lg bg-amber-500 px-4 py-3 text-sm font-bold disabled:opacity-40">Adicionar ao carrinho do Melhor Envio (sem pagar)</button>
            </>
          )}
          {!checked && !busy && <button type="button" onClick={() => void execute(async () => { await prepareRef.current(); await readSaved(); if (fiscalRef.current.quote.bling?.orderId) await refreshInvoice(); })} className="rounded-lg border border-slate-400 px-3 py-2 text-sm font-semibold">Conferir solicitação salva / recuperar envio</button>}
          {busy && <p role="status" className="flex gap-2 text-sm"><LoaderCircle className="h-4 w-4 animate-spin" />Conferindo operação…</p>}
        </form>
      </section>
    </div>
  );
}
