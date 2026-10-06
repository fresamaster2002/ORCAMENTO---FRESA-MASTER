import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Sparkles } from 'lucide-react';
import { DeliveryAddress, ShippingInfo } from '../types';
import { apiFetch } from '../api';
import { completeDeliveryByCep, normalizeExtractedDelivery } from '../../supabase/functions/_shared/deliveryExtraction';

interface DeliveryAddressCardProps {
  shipping: ShippingInfo;
  onChange: (shipping: ShippingInfo) => void;
}

const inputClass =
  'w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-amber-500';
const labelClass = 'block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1';

export const DeliveryAddressCard: React.FC<DeliveryAddressCardProps> = ({ shipping, onChange }) => {
  const [lookupStatus, setLookupStatus] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const latest = useRef({ shipping, onChange });
  latest.current = { shipping, onChange };
  const requestId = useRef(0);
  useEffect(() => () => { requestId.current += 1; }, []);
  const delivery: DeliveryAddress = shipping.deliveryAddress || { enabled: false };

  const update = (patch: Partial<DeliveryAddress>, extra: Partial<ShippingInfo> = {}) => {
    const current = latest.current;
    current.onChange({
      ...current.shipping, ...extra,
      deliveryAddress: { ...current.shipping.deliveryAddress, enabled: true, ...patch },
    });
  };

  const extractDelivery = async () => {
    const id = ++requestId.current;
    setIsProcessing(true);
    setErrorMessage(null);
    setLookupStatus(null);
    try {
      const response = await apiFetch('/api/shipping/extract-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Não foi possível preencher o endereço.');
      const { cep, ...extracted } = normalizeExtractedDelivery(data.delivery);
      if (id !== requestId.current) return;
      update(extracted, { destinationCep: cep });
      const warnings = Array.isArray(data.warnings)
        ? data.warnings.filter((warning: unknown): warning is string => typeof warning === 'string')
        : [];
      setLookupStatus([
        'Endereço preenchido. Confira os campos abaixo antes de enviar.',
        ...warnings,
        'Clique em "Calcular" no frete para atualizar as cotações.',
      ].join(' '));
    } catch (error) {
      console.error('Erro ao preencher entrega com IA:', error);
      if (id === requestId.current) setErrorMessage(error instanceof Error ? error.message : 'Falha ao comunicar com a IA.');
    } finally {
      if (id === requestId.current) setIsProcessing(false);
    }
  };

  const lookupCep = async (rawCep: string) => {
    if (isProcessing) return;
    const clean = rawCep.replace(/\D/g, '');
    if (!clean) return;
    if (clean.length !== 8) {
      setErrorMessage('Informe um CEP com 8 dígitos para consultar o endereço.');
      return;
    }
    const id = ++requestId.current;
    setIsProcessing(true);
    setErrorMessage(null);
    setLookupStatus('Buscando endereço...');
    try {
      const result = await completeDeliveryByCep(normalizeExtractedDelivery({
        ...delivery, cep: rawCep, address: '', neighborhood: '', city: '', state: '',
      }));
      if (id !== requestId.current) return;
      if (!result.delivery.city) {
        setErrorMessage(result.warnings.join(' '));
        setLookupStatus(null);
        return;
      }
      const { cep, ...address } = result.delivery;
      update({
        ...address,
        address: address.address || delivery.address,
        neighborhood: address.neighborhood || delivery.neighborhood,
      }, { destinationCep: cep });
      setLookupStatus([...result.warnings, 'CEP consultado. Confira o endereço e clique em "Calcular" no frete para atualizar as cotações.'].join(' '));
    } catch (error) {
      console.error('Erro ao consultar CEP de entrega:', error);
      if (id === requestId.current) setErrorMessage('Não foi possível consultar o CEP.');
    } finally {
      if (id === requestId.current) setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-4">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={delivery.enabled}
          disabled={isProcessing}
          onChange={(e) => update({ enabled: e.target.checked })}
          className="accent-amber-500"
        />
        <MapPin className="w-4 h-4 text-amber-600" />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
          Entregar em outro endereço (diferente do Cartão CNPJ)
        </span>
      </label>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
        {delivery.enabled
          ? 'A NF-e continua com o endereço do CNPJ; frete, etiqueta e orçamento usam o endereço de entrega abaixo.'
          : 'Marque quando o cliente mudou de endereço e a entrega deve ir para o local atual.'}
      </p>

      {delivery.enabled && (
        <fieldset disabled={isProcessing} className="grid grid-cols-1 sm:grid-cols-6 gap-3 mt-3">
          <div className="sm:col-span-6 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-3">
            <label htmlFor="delivery-message" className={labelClass}>Cole o endereço que o cliente enviou:</label>
            <textarea
              id="delivery-message"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              maxLength={5000}
              rows={3}
              placeholder={'Ex.: Entregar para João, CEP 13321-472, número 250, galpão 2.'}
              className={`${inputClass} resize-y`}
            />
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Pode colar a mensagem do WhatsApp mesmo incompleta. O CEP completa os dados disponíveis; número e complemento precisam ser informados pelo cliente.
            </p>
            <button
              type="button"
              onClick={extractDelivery}
              disabled={isProcessing || !inputText.trim()}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {isProcessing ? 'Preenchendo endereço...' : 'Preencher entrega com IA'}
            </button>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>CEP de entrega:</label>
            <input
              type="text"
              value={shipping.destinationCep || ''}
              onChange={(e) => onChange({ ...shipping, destinationCep: e.target.value })}
              onBlur={(e) => lookupCep(e.target.value)}
              placeholder="00000-000"
              className={`${inputClass} font-mono font-bold`}
            />
          </div>
          <div className="sm:col-span-4">
            <label className={labelClass}>Quem recebe (opcional):</label>
            <input
              type="text"
              value={delivery.recipient || ''}
              onChange={(e) => update({ recipient: e.target.value })}
              placeholder="Nome / empresa na etiqueta"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-4">
            <label className={labelClass}>Rua / Avenida:</label>
            <input type="text" value={delivery.address || ''} onChange={(e) => update({ address: e.target.value })} className={inputClass} />
          </div>
          <div className="sm:col-span-1">
            <label className={labelClass}>Nº:</label>
            <input type="text" value={delivery.number || ''} onChange={(e) => update({ number: e.target.value })} className={inputClass} />
          </div>
          <div className="sm:col-span-1">
            <label className={labelClass}>Compl.:</label>
            <input type="text" value={delivery.complement || ''} onChange={(e) => update({ complement: e.target.value })} className={inputClass} />
          </div>
          <div className="sm:col-span-3">
            <label className={labelClass}>Bairro:</label>
            <input type="text" value={delivery.neighborhood || ''} onChange={(e) => update({ neighborhood: e.target.value })} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Cidade:</label>
            <input type="text" value={delivery.city || ''} onChange={(e) => update({ city: e.target.value })} className={inputClass} />
          </div>
          <div className="sm:col-span-1">
            <label className={labelClass}>UF:</label>
            <input type="text" maxLength={2} value={delivery.state || ''} onChange={(e) => update({ state: e.target.value.toUpperCase() })} className={inputClass} />
          </div>
          {errorMessage && <p role="alert" className="sm:col-span-6 text-xs text-red-600 dark:text-red-400">{errorMessage}</p>}
          {lookupStatus && <p role="status" className="sm:col-span-6 text-[11px] text-slate-600 dark:text-slate-300">{lookupStatus}</p>}
        </fieldset>
      )}
    </div>
  );
};
