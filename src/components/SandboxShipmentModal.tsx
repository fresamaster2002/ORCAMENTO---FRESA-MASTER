import { FormEvent, useRef, useState } from 'react';
import { apiFetch } from '../api';
import { AlertTriangle, CheckCircle2, LoaderCircle, X } from 'lucide-react';
import { QuoteData, ShippingOption } from '../types';

interface SenderData {
  name: string;
  document: string;
  ie: string;
  email: string;
  phone: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
}

interface SandboxShipmentModalProps {
  quote: QuoteData;
  missing?: string[];
  onClose: () => void;
  onUpdateShipment: (shipment: NonNullable<QuoteData['sandboxShipment']>) => Promise<void>;
  onQuoted: (originCep: string, option: ShippingOption) => void;
}

const initialSender: SenderData = {
  name: 'Fresa Master',
  document: '59.085.330/0001-70',
  ie: '600320622110',
  email: 'fresamaster0@gmail.com',
  phone: '(11) 99852-4939',
  address: 'Rua Presidente Geisel',
  number: '62',
  complement: '',
  neighborhood: 'Jardim Santo Antonio',
  city: 'Salto',
  state: 'SP',
  cep: '13329-350',
};

const SENDER_STORAGE_KEY = 'fresa_master_sender_v2';
const PREVIOUS_DEFAULT_SENDER_CEP = '13321472';

function loadSender(): SenderData {
  try {
    const saved = localStorage.getItem(SENDER_STORAGE_KEY);
    if (!saved) return initialSender;
    const sender = { ...initialSender, ...JSON.parse(saved) };
    if (sender.cep.replace(/\D/g, '') === PREVIOUS_DEFAULT_SENDER_CEP) sender.cep = initialSender.cep;
    return sender;
  } catch {
    return initialSender;
  }
}

const fields: Array<{ key: keyof SenderData; label: string; required?: boolean }> = [
  { key: 'name', label: 'Nome / Razão social', required: true },
  { key: 'document', label: 'CPF / CNPJ', required: true },
  { key: 'ie', label: 'Inscrição estadual / isenção confirmada', required: true },
  { key: 'email', label: 'E-mail' },
  { key: 'phone', label: 'Telefone' },
  { key: 'address', label: 'Endereço', required: true },
  { key: 'number', label: 'Número', required: true },
  { key: 'complement', label: 'Complemento' },
  { key: 'neighborhood', label: 'Bairro', required: true },
  { key: 'city', label: 'Cidade', required: true },
  { key: 'state', label: 'UF', required: true },
  { key: 'cep', label: 'CEP', required: true },
];

export function SandboxShipmentModal({ quote, missing = [], onClose, onUpdateShipment, onQuoted }: SandboxShipmentModalProps) {
  const [sender, setSender] = useState(loadSender);
  const [invoiceKey, setInvoiceKey] = useState(() => quote.bling?.nfe?.serie === 2 ? quote.bling.nfe.chaveAcesso || '' : '');
  const [sandboxToken, setSandboxToken] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isCheckoutSubmitting, setIsCheckoutSubmitting] = useState(false);
  const [isCheckingPayment, setIsCheckingPayment] = useState(false);
  const [checkoutConfirmed, setCheckoutConfirmed] = useState(false);
  const operationLock = useRef(false);
  const isBusy = isSubmitting || isTestingConnection || isQuoting || isCheckoutSubmitting || isCheckingPayment;
  const [error, setError] = useState<string | null>(null);
  const checkoutMayHaveBeenSent = Boolean(quote.sandboxShipment?.checkoutRequestedAt);
  const routeMismatch = sender.cep.replace(/\D/g, '') !== quote.shipping.originCep.replace(/\D/g, '');
  const allMissing = [...missing, ...(routeMismatch ? ['O CEP do remetente difere da origem cotada. Corrija a origem e recalcule o frete antes de criar o envio.'] : [])];

  const quoteSandbox = async () => {
    if (operationLock.current || quote.sandboxShipment?.id) return;
    operationLock.current = true;
    setIsQuoting(true);
    setError(null);
    setConnectionMessage(null);
    try {
      const response = await apiFetch('/api/shipping/quote-sandbox', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote, sender, sandboxToken: sandboxToken.trim() || undefined }),
      });
      const result = await response.json();
      if (!response.ok || !result.success || !result.option) throw new Error(result.error || 'Não foi possível cotar a modalidade selecionada no Sandbox.');
      onQuoted(result.originCep, result.option);
      setConnectionMessage(`${result.option.name} cotado diretamente no Sandbox. Origem e valor atualizados somente neste orçamento; nenhuma etiqueta criada.`);
    } catch (quoteError) {
      setError(quoteError instanceof Error ? quoteError.message : 'Falha ao cotar o frete Sandbox.');
    } finally {
      setIsQuoting(false);
      operationLock.current = false;
    }
  };

  const testConnection = async () => {
    if (operationLock.current) return;
    operationLock.current = true;
    setIsTestingConnection(true);
    setConnectionMessage(null);
    setError(null);
    try {
      const response = await apiFetch('/api/shipping/test-melhor-envio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isSandbox: true, token: sandboxToken.trim() || undefined }),
      });
      const result = await response.json();
      if (!response.ok || !result.connected) throw new Error(result.message || result.error || 'Não foi possível conectar ao Sandbox.');
      setConnectionMessage('Conta Sandbox conectada. Nenhum envio ou etiqueta foi criado neste teste de conexão.');
    } catch (connectionError) {
      setError(connectionError instanceof Error ? connectionError.message : 'Falha ao testar a conexão Sandbox.');
    } finally {
      setIsTestingConnection(false);
      operationLock.current = false;
    }
  };

  const updateShipmentPayment = async (patch: Partial<NonNullable<QuoteData['sandboxShipment']>>) => {
    const shipment = quote.sandboxShipment;
    if (!shipment?.id) throw new Error('Não foi encontrado o envio Sandbox deste orçamento.');
    await onUpdateShipment({ ...shipment, ...patch });
  };

  const checkPaymentStatus = async () => {
    const shipment = quote.sandboxShipment;
    if (operationLock.current || !shipment?.id) return;
    operationLock.current = true;
    setIsCheckingPayment(true);
    setError(null);
    try {
      const response = await apiFetch('/api/shipping/sandbox-shipment-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentId: shipment.id, sandboxToken: sandboxToken.trim() || undefined }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Não foi possível consultar o envio no Sandbox.');
      await updateShipmentPayment({
        paymentStatus: result.status,
        paymentCheckedAt: new Date().toISOString(),
        paidAt: result.paidAt || null,
      });
      setConnectionMessage(result.status === 'paid'
        ? 'Pagamento confirmado no Sandbox. A etiqueta ainda não foi gerada.'
        : result.status === 'pending'
          ? 'O envio ainda está pendente e não consta como pago.'
          : `O envio está no Sandbox com situação "${result.rawStatus || result.status}".`);
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Falha ao consultar pagamento Sandbox.');
    } finally {
      setIsCheckingPayment(false);
      operationLock.current = false;
    }
  };

  const checkout = async () => {
    const shipment = quote.sandboxShipment;
    if (operationLock.current || !shipment?.id || !checkoutConfirmed || shipment.checkoutRequestedAt || shipment.paymentStatus === 'paid' || shipment.paymentStatus === 'processing' || shipment.paymentStatus === 'unknown' || shipment.paymentStatus === 'unavailable') return;
    operationLock.current = true;
    setIsCheckoutSubmitting(true);
    setError(null);
    setConnectionMessage(null);
    let checkoutStarted = false;
    try {
      await updateShipmentPayment({
        paymentStatus: 'processing',
        checkoutRequestedAt: new Date().toISOString(),
      });
      checkoutStarted = true;
      const response = await apiFetch('/api/shipping/checkout-sandbox', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentId: shipment.id, confirmSandbox: true, sandboxToken: sandboxToken.trim() || undefined }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        if (response.status === 401 && result.error === 'Configure ou informe o token da conta Sandbox.') {
          await updateShipmentPayment({ paymentStatus: 'pending', checkoutRequestedAt: undefined });
          checkoutStarted = false;
          setCheckoutConfirmed(false);
        }
        throw new Error(result.error || 'Não foi possível finalizar o pagamento Sandbox.');
      }
      await updateShipmentPayment({
        paymentStatus: result.status,
        paymentCheckedAt: new Date().toISOString(),
        paidAt: result.paidAt || null,
        purchaseId: result.purchaseId || null,
        purchaseProtocol: result.purchaseProtocol || null,
      });
      setConnectionMessage(result.message || (result.status === 'paid'
        ? 'Pagamento confirmado com saldo fictício do Sandbox. Nenhuma etiqueta foi gerada.'
        : 'O checkout foi recebido pelo Sandbox. Consulte novamente antes de tentar pagar outra vez.'));
    } catch (checkoutError) {
      if (checkoutStarted) {
        try {
          await updateShipmentPayment({ paymentStatus: 'unknown' });
        } catch (persistError) {
          setError(`${checkoutError instanceof Error ? checkoutError.message : 'Falha ao finalizar pagamento.'} Não foi possível salvar o estado do envio; confira o carrinho Sandbox antes de qualquer nova tentativa.`);
          setIsCheckoutSubmitting(false);
          operationLock.current = false;
          return;
        }
      }
      setError(checkoutError instanceof Error ? checkoutError.message : 'Falha ao finalizar pagamento Sandbox. Consulte o estado antes de repetir.');
    } finally {
      setIsCheckoutSubmitting(false);
      operationLock.current = false;
    }
  };

  const updateSender = (key: keyof SenderData, value: string) => {
    setSender((current) => {
      const next = { ...current, [key]: value };
      try {
        localStorage.setItem(SENDER_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // sem armazenamento local: segue sem salvar
      }
      return next;
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (operationLock.current) return;
    operationLock.current = true;
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await apiFetch('/api/shipping/create-sandbox-shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote, sender, invoiceKey, sandboxToken }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Não foi possível adicionar o envio ao carrinho de teste.');
      }
      if (!result.shipmentId) throw new Error('O servidor respondeu sem o ID do envio. Confira o carrinho antes de repetir.');

      await onUpdateShipment({
        id: result.shipmentId,
        protocol: result.protocol || null,
        createdAt: new Date().toISOString(),
        paymentStatus: 'pending',
      });
      setConnectionMessage('Envio adicionado ao carrinho Sandbox. Nenhuma cobrança foi feita; continue abaixo para revisar o checkout.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha de comunicação com o servidor.');
    } finally {
      setIsSubmitting(false);
      operationLock.current = false;
    }
  };

  const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-3 sm:p-6" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="sandbox-shipment-title" className="my-auto max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white text-slate-900 shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase text-emerald-700">Melhor Envio Sandbox</p>
            <h2 id="sandbox-shipment-title" className="text-lg font-bold">Adicionar envio ao carrinho de teste</h2>
          </div>
          <button type="button" onClick={onClose} disabled={isBusy} className="rounded p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={submit} className="space-y-5 p-5">
          <div className="flex gap-3 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p>{quote.sandboxShipment?.id
              ? 'Ambiente de teste isolado. O checkout usa somente o saldo fictício da conta Sandbox; não há acesso à carteira ou ao host de produção.'
              : `Este passo exige a chave de uma NF-e série 2 já emitida no Bling. Confira o remetente e o mesmo CEP de origem cotado (${quote.shipping.originCep}). A inclusão no carrinho não cobra nem gera etiqueta.`}</p>
          </div>

          {quote.sandboxShipment?.id ? (
            <section className="space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4" aria-label="Pagamento de teste Sandbox">
              <div>
                <h3 className="font-bold text-emerald-950">Envio {quote.sandboxShipment.protocol || quote.sandboxShipment.id}</h3>
                <p className="mt-1 text-sm text-emerald-900">Status do pagamento: <strong>{quote.sandboxShipment.paymentStatus === 'paid' ? 'Pago no Sandbox' : quote.sandboxShipment.paymentStatus === 'processing' ? 'Checkout em andamento' : quote.sandboxShipment.paymentStatus === 'unknown' ? 'Confirmação necessária' : quote.sandboxShipment.paymentStatus === 'unavailable' ? 'Revisar no carrinho' : 'Pendente'}</strong></p>
                <p className="mt-1 text-sm text-slate-700">Valor do frete: <strong>R$ {Number(quote.shipping.selectedOption?.price || 0).toFixed(2).replace('.', ',')}</strong></p>
                <p className="mt-2 text-xs text-slate-700">Este checkout usa o saldo de teste do Sandbox. Pagamento não gera etiqueta automaticamente; nenhuma etiqueta será comprada ou impressa pelo app.</p>
              </div>

              {quote.sandboxShipment.paymentStatus === 'paid' ? (
                <p role="status" className="rounded border border-emerald-300 bg-white p-3 text-sm font-semibold text-emerald-900">Pagamento confirmado no Sandbox. A etiqueta ainda não foi gerada. Acompanhe o envio no painel Sandbox.</p>
              ) : quote.sandboxShipment.paymentStatus === 'unavailable' ? (
                <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">O envio não aparece como pendente nem pago. Não repita o checkout; confira o carrinho Sandbox e resolva o status primeiro.</p>
              ) : (
                <>
                  <label className="block space-y-1 text-xs font-semibold text-slate-700">
                    <span>Token do Melhor Envio Sandbox (opcional se configurado no servidor)</span>
                    <input
                      className={inputClass}
                      type="password"
                      autoComplete="off"
                      disabled={isBusy}
                      value={sandboxToken}
                      onChange={(event) => setSandboxToken(event.target.value)}
                      placeholder="Use somente um token da conta Sandbox"
                    />
                    <span className="block font-normal">Não é salvo no navegador. Nunca use o token da conta de produção.</span>
                  </label>
                  {quote.sandboxShipment.paymentStatus === 'unknown' || quote.sandboxShipment.paymentStatus === 'processing' || checkoutMayHaveBeenSent ? (
                    <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">O checkout já foi enviado ou pode ter sido enviado. Não repita o pagamento, mesmo que ainda apareça pendente; consulte o status do envio.</p>
                  ) : (
                    <label className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                      <input type="checkbox" checked={checkoutConfirmed} onChange={(event) => setCheckoutConfirmed(event.target.checked)} disabled={isBusy} className="mt-0.5" />
                      <span>Confirmo finalizar o pagamento deste envio usando somente o saldo fictício da conta Sandbox. Sei que essa ação altera o carrinho de teste; nenhum pagamento de produção será iniciado.</span>
                    </label>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {quote.sandboxShipment.paymentStatus !== 'unknown' && quote.sandboxShipment.paymentStatus !== 'processing' && !checkoutMayHaveBeenSent && (
                      <button type="button" onClick={checkout} disabled={isBusy || !checkoutConfirmed} className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                        {isCheckoutSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Finalizar pagamento Sandbox
                      </button>
                    )}
                    <button type="button" onClick={checkPaymentStatus} disabled={isBusy} className="rounded-md border border-emerald-700 px-4 py-2.5 text-sm font-bold text-emerald-900 disabled:opacity-50">
                      {isCheckingPayment ? 'Consultando...' : 'Verificar situação no Sandbox'}
                    </button>
                  </div>
                </>
              )}
              {error && <p role="alert" className="border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
              {connectionMessage && <p role="status" className="text-sm text-emerald-800">{connectionMessage}</p>}
              <button type="button" onClick={onClose} disabled={isBusy} className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Fechar</button>
            </section>
          ) : (
          <>
          {allMissing.length > 0 && (
            <div className="border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
              <p className="mb-1 font-bold">Antes de enviar, falta:</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {allMissing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="mb-3 text-sm font-bold">Dados do remetente</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {fields.map(({ key, label, required }) => (
                <label key={key} className="space-y-1 text-xs font-semibold text-slate-700">
                  <span>{label}{required ? ' *' : ''}</span>
                  <input
                    className={inputClass}
                    value={sender[key]}
                    onChange={(event) => updateSender(key, event.target.value)}
                    required={required}
                    disabled={isBusy}
                    maxLength={key === 'state' ? 2 : undefined}
                    autoComplete="off"
                  />
                </label>
              ))}
            </div>
          </div>

          <label className="block space-y-1 text-xs font-semibold text-slate-700">
            <span>Token do Melhor Envio Sandbox (opcional se configurado no servidor)</span>
            <input className={inputClass} type="password" autoComplete="off" disabled={isBusy} value={sandboxToken} onChange={(event) => setSandboxToken(event.target.value)} placeholder="Use somente um token da conta Sandbox" />
            <span className="block font-normal">Não é salvo no navegador. Nunca use o token da conta de produção.</span>
          </label>
          <button type="button" onClick={testConnection} disabled={isBusy} className="rounded-md border border-emerald-700 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50">
            {isTestingConnection ? 'Testando Sandbox...' : 'Testar conexão Sandbox'}
          </button>
          <button type="button" onClick={quoteSandbox} disabled={isBusy || Boolean(quote.sandboxShipment?.id)} className="ml-2 rounded-md border border-emerald-700 px-3 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50">
            {isQuoting ? 'Cotando Sandbox...' : `Cotar ${quote.shipping.selectedOption?.name || 'modalidade selecionada'} no Sandbox`}
          </button>
          <p className="text-xs text-slate-600">Cota no Sandbox a modalidade selecionada (Sedex, PAC ou Jadlog), atualizando a origem pelo CEP do remetente e o frete deste orçamento com valor e prazo oficiais do Sandbox.</p>
          {connectionMessage && <p role="status" className="text-sm text-emerald-800">{connectionMessage}</p>}
          <label className="block space-y-1 text-xs font-semibold text-slate-700">
            <span>Chave de acesso da NF-e (44 dígitos) *</span>
            <input
              className={`${inputClass} font-mono`}
              inputMode="numeric"
              value={invoiceKey}
              onChange={(event) => setInvoiceKey(event.target.value.replace(/\D/g, '').slice(0, 44))}
              minLength={44}
              maxLength={44}
              pattern="[0-9]{44}"
              placeholder="Digite a chave da NF-e emitida no Bling"
              required
              disabled={isBusy}
            />
          </label>

          <div className="border-t border-slate-200 pt-4">
            <div className="mb-4 flex items-start gap-2 text-xs text-slate-600">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
              <span>Orçamento {quote.id} • {quote.shipping.selectedOption?.name || 'Frete não selecionado'} • Destino {quote.shipping.destinationCep || 'CEP ausente'} • Pacote {quote.shipping.packageDimensions?.height} × {quote.shipping.packageDimensions?.width} × {quote.shipping.packageDimensions?.length} cm</span>
            </div>
            {error && <p role="alert" className="mb-3 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
              <button type="button" onClick={onClose} disabled={isBusy} className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">Cancelar</button>
              <button type="submit" disabled={isBusy || quote.sandboxShipment?.id != null || invoiceKey.length !== 44 || allMissing.length > 0} className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Adicionar ao carrinho sandbox
              </button>
            </div>
          </div>
          </>
          )}
        </form>
      </section>
    </div>
  );
}