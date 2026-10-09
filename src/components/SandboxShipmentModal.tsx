import { FormEvent, useState } from 'react';
import { apiFetch } from '../api';
import { AlertTriangle, CheckCircle2, LoaderCircle, X } from 'lucide-react';
import { QuoteData } from '../types';

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
  onCreated: (shipment: { id: string | null; protocol: string | null; createdAt: string }) => void;
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
  cep: '13321-472',
};

const SENDER_STORAGE_KEY = 'fresa_master_sender_v2';

function loadSender(): SenderData {
  try {
    const saved = localStorage.getItem(SENDER_STORAGE_KEY);
    return saved ? { ...initialSender, ...JSON.parse(saved) } : initialSender;
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

export function SandboxShipmentModal({ quote, missing = [], onClose, onCreated }: SandboxShipmentModalProps) {
  const [sender, setSender] = useState(loadSender);
  const [invoiceKey, setInvoiceKey] = useState('');
  const [sandboxToken, setSandboxToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      onCreated({
        id: result.shipmentId,
        protocol: result.protocol || null,
        createdAt: new Date().toISOString(),
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Falha de comunicação com o servidor.');
    } finally {
      setIsSubmitting(false);
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
          <button type="button" onClick={onClose} className="rounded p-2 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={submit} className="space-y-5 p-5">
          <div className="flex gap-3 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p>Este passo exige a chave de uma NF-e série 2 já emitida no Bling. Confira o remetente e o mesmo CEP de origem cotado ({quote.shipping.originCep}). Ele apenas cria o envio no carrinho sandbox; não compra nem paga a etiqueta e não vale para postagem real.</p>
          </div>

          {missing.length > 0 && (
            <div className="border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">
              <p className="mb-1 font-bold">Antes de enviar, falta:</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {missing.map((item) => (
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
                    maxLength={key === 'state' ? 2 : undefined}
                    autoComplete="off"
                  />
                </label>
              ))}
            </div>
          </div>

          <label className="block space-y-1 text-xs font-semibold text-slate-700">
            <span>Token do Melhor Envio Sandbox (opcional se configurado no servidor)</span>
            <input className={inputClass} type="password" autoComplete="off" value={sandboxToken} onChange={(event) => setSandboxToken(event.target.value)} placeholder="Use somente um token da conta Sandbox" />
            <span className="block font-normal">Não é salvo no navegador. Nunca use o token da conta de produção.</span>
          </label>
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
            />
          </label>

          <div className="border-t border-slate-200 pt-4">
            <div className="mb-4 flex items-start gap-2 text-xs text-slate-600">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
              <span>Orçamento {quote.id} • {quote.shipping.selectedOption?.name || 'Frete não selecionado'} • Destino {quote.client.cep || 'CEP ausente'}</span>
            </div>
            {error && <p role="alert" className="mb-3 border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
            <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
              <button type="button" onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">Cancelar</button>
              <button type="submit" disabled={isSubmitting || invoiceKey.length !== 44 || missing.length > 0} className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50">
                {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Adicionar ao carrinho sandbox
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}