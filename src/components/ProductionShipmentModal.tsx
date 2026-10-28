import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { apiFetch } from '../api';
import type { QuoteData } from '../types';
import { loadSender, senderFields, SENDER_STORAGE_KEY, type SenderData } from '../shipmentSender';
import { isProductionShipment, productionMissing } from '../productionShipping';
import { ProposalDeliveryAddress } from './ProposalDeliveryAddress';
import { ProductionShipmentNotice } from './ProductionShipmentNotice';

interface Props {
  quote: QuoteData;
  onClose: () => void;
  onPrepare: () => Promise<void>;
  onUpdate: (shipment: NonNullable<QuoteData['productionShipment']>) => Promise<void>;
}
const money = (price: number) => price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function ProductionShipmentModal({ quote, onClose, onPrepare, onUpdate }: Props) {
  const [sender, setSender] = useState(loadSender);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [shipment, setShipment] = useState(quote.productionShipment);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [rate, setRate] = useState<{ price: number; serviceId: number; fingerprint: string } | null>(null);
  const operation = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  const prepareRef = useRef(onPrepare);
  const updateRef = useRef(onUpdate);
  prepareRef.current = onPrepare;
  updateRef.current = onUpdate;
  closeRef.current = onClose;
  busyRef.current = busy;
  const fingerprint = JSON.stringify([sender, quote.shipping, quote.items]);
  const rateCurrent = rate?.fingerprint === fingerprint;
  const missing = productionMissing(quote);
  if (sender.cep.replace(/\D/g, '') !== quote.shipping.originCep.replace(/\D/g, '')) {
    missing.push('O CEP do remetente difere da origem do orçamento. Ajuste a origem no painel de frete e recalcule antes de criar.');
  }

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
    operation.current = true;
    setBusy(true);
    void (async () => {
      try {
        await prepareRef.current();
        if (active) await readSaved();
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
    if (!checked || shipment && shipment.status !== 'rejected' || !confirmed || !rateCurrent || !rate || missing.length) return;
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
  const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-3">
      <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="production-shipment-title" style={{ maxHeight: 'calc(100dvh - var(--fm-nav-h, 0px) - 1.5rem)' }} className="w-full max-w-3xl overflow-y-auto rounded-xl bg-white text-slate-900 shadow-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div><p className="text-xs font-bold text-amber-700">Melhor Envio • PRODUÇÃO</p><h2 id="production-shipment-title" className="text-lg font-bold">Melhor Envio — {quote.id}</h2></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Fechar envio real" className="p-2"><X className="h-5 w-5" /></button>
        </header>
        <form onSubmit={submit} className="space-y-4 p-5">
          <ProductionShipmentNotice />
          {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
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
              {missing.length > 0 && <ul className="list-disc pl-5 text-sm text-amber-900">{missing.map((item) => <li key={item}>{item}</li>)}</ul>}
              <fieldset disabled={busy} className="space-y-3">
                <legend className="font-bold">Confira o remetente real</legend>
                <div className="grid gap-3 sm:grid-cols-2">{senderFields.map(({ key, label, required }) => (
                  <label key={key} className="space-y-1 text-xs font-semibold"><span>{label}{required ? ' *' : ''}</span><input className={inputClass} value={sender[key]} onChange={(event) => updateSender(key, event.target.value)} required={required} maxLength={key === 'state' ? 2 : undefined} /></label>
                ))}</div>
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
                <button type="button" disabled={busy || !checked || !quote.shipping.selectedOption} onClick={() => void calculate()} className="rounded-lg border border-amber-600 px-3 py-2 text-sm font-semibold">Cotar no Melhor Envio</button>
              </div>
              {authorizationUrl && <a href={authorizationUrl} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-700 underline">Autorizar cotação e carrinho no Melhor Envio (sem pagamento automático)</a>}
              {rateCurrent && rate && <p className="text-sm font-bold">Custo real cotado: {money(rate.price)} • Frete no orçamento do cliente: {money(quote.financials.shippingAmount)} (não alterado).</p>}
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy || !rateCurrent || !checked} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" /><span>Conferi remetente, destinatário, NF-e e pacote. Autorizo adicionar este envio ao carrinho REAL, sem pagamento ou emissão automática.</span></label>
              <button type="submit" disabled={busy || !checked || !confirmed || !rateCurrent || missing.length > 0} className="rounded-lg bg-amber-500 px-4 py-3 text-sm font-bold disabled:opacity-40">Adicionar ao carrinho do Melhor Envio (sem pagar)</button>
            </>
          )}
          {!checked && !busy && <button type="button" onClick={() => void execute(async () => { await prepareRef.current(); await readSaved(); })} className="rounded-lg border border-slate-400 px-3 py-2 text-sm font-semibold">Conferir solicitação salva / recuperar envio</button>}
          {busy && <p role="status" className="flex gap-2 text-sm"><LoaderCircle className="h-4 w-4 animate-spin" />Conferindo operação…</p>}
        </form>
      </section>
    </div>
  );
}
