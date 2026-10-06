import React, { useState } from 'react';
import { MapPin } from 'lucide-react';
import { DeliveryAddress, ShippingInfo } from '../types';

interface DeliveryAddressCardProps {
  shipping: ShippingInfo;
  onChange: (shipping: ShippingInfo) => void;
}

const inputClass =
  'w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-amber-500';
const labelClass = 'block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1';

export const DeliveryAddressCard: React.FC<DeliveryAddressCardProps> = ({ shipping, onChange }) => {
  const [lookupStatus, setLookupStatus] = useState<string | null>(null);
  const delivery: DeliveryAddress = shipping.deliveryAddress || { enabled: false };

  const update = (patch: Partial<DeliveryAddress>, extra: Partial<ShippingInfo> = {}) => {
    onChange({ ...shipping, ...extra, deliveryAddress: { ...delivery, ...patch } });
  };

  const lookupCep = async (rawCep: string) => {
    const clean = rawCep.replace(/\D/g, '');
    if (clean.length !== 8) return;
    setLookupStatus('Buscando endereço...');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (data.erro) {
        setLookupStatus('CEP não encontrado.');
        return;
      }
      update(
        {
          address: data.logradouro || delivery.address,
          neighborhood: data.bairro || delivery.neighborhood,
          city: data.localidade || delivery.city,
          state: data.uf || delivery.state,
        },
        { destinationCep: rawCep }
      );
      setLookupStatus('Endereço preenchido. Clique em "Calcular" no frete para atualizar as cotações.');
    } catch {
      setLookupStatus('Não foi possível consultar o CEP.');
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-4">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={delivery.enabled}
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
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3 mt-3">
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
          {lookupStatus && <p className="sm:col-span-6 text-[11px] text-slate-500 dark:text-slate-400">{lookupStatus}</p>}
        </div>
      )}
    </div>
  );
};
