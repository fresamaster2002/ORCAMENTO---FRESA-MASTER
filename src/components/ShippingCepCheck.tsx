import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import type { QuoteItem, ShippingInfo } from '../types';
import { cepCheckFingerprint, cepCheckInput, readCepCheck, type CepCheckResult } from '../shippingCepCheck';

const pendingChecks = new Map<string, { requestedAt: number; request: Promise<CepCheckResult> }>();
const noItems: QuoteItem[] = [];

interface Props {
  shipping: ShippingInfo;
  items?: QuoteItem[];
  onChange: (shipping: ShippingInfo) => void;
  onWarningChange?: (warning: { fingerprint: string; needsAcknowledgement: boolean }) => void;
}

export function ShippingCepCheck({ shipping, items = noItems, onChange, onWarningChange }: Props) {
  const fingerprint = cepCheckFingerprint(shipping, items);
  const input = cepCheckInput(shipping, items);
  const [result, setResult] = useState<{ fingerprint: string; value: CepCheckResult } | null>(null);
  const [retry, setRetry] = useState(0);
  const latest = useRef({ shipping, onChange });
  latest.current = { shipping, onChange };
  const complete = input.destinationCep.length === 8;
  const current = result?.fingerprint === fingerprint ? result.value : null;
  const acknowledged = shipping.cepWarningAcknowledgement?.fingerprint === fingerprint;
  const needsAcknowledgement = Boolean(current && current.state !== 'available' && !acknowledged);

  useEffect(() => {
    onWarningChange?.({ fingerprint, needsAcknowledgement });
  }, [fingerprint, needsAcknowledgement, onWarningChange]);

  useEffect(() => {
    if (!complete) return;
    let active = true;
    setResult(null);
    const timer = setTimeout(() => {
      for (const [key, entry] of pendingChecks) if (Date.now() - entry.requestedAt > 30000) pendingChecks.delete(key);
      let entry = pendingChecks.get(fingerprint);
      if (!entry) {
        entry = {
          requestedAt: Date.now(),
          request: apiFetch('/api/shipping/check-cep', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: fingerprint, signal: AbortSignal.timeout(25000),
          }).then(readCepCheck),
        };
        pendingChecks.set(fingerprint, entry);
      }
      void entry.request.then((value) => {
        if (active) setResult({ fingerprint, value });
      }).catch((error: unknown) => {
        console.error('Falha na verificação automática do CEP:', error);
        if (active) setResult({ fingerprint, value: { state: 'unverified', error: error instanceof Error ? error.message : 'Falha na comunicação ao verificar o CEP.' } });
      });
    }, 600);
    return () => { active = false; clearTimeout(timer); };
  }, [fingerprint, complete, retry]);

  if (!complete) return <p className="mt-2 text-xs text-slate-500">Complete os 8 dígitos do CEP para verificar o envio automaticamente.</p>;
  if (!current) return <p role="status" className="mt-2 text-xs font-semibold text-amber-700">Verificando CEP {shipping.destinationCep} no Melhor Envio…</p>;
  if (current.state === 'available') {
    const selected = shipping.selectedOption?.melhorEnvioServiceId;
    const matching = selected
      ? current.services.some((service) => service.id === selected)
      : current.services.some((service) => shipping.selectedOption?.service === 'SEDEX' ? service.id === 2 : shipping.selectedOption?.service === 'PAC' ? service.id === 1 : [3, 4, 17].includes(service.id));
    return <div role="status" className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-950">
      <p className="font-bold">CEP {shipping.destinationCep}: cotação disponível no Melhor Envio</p>
      <p>Serviços disponíveis agora: {current.services.map((service) => service.name).join(', ')}.</p>
      {!matching && shipping.selectedOption && ['SEDEX', 'PAC', 'JADLOG_PACKAGE'].includes(shipping.selectedOption.service) && <p className="mt-1 font-bold">A modalidade selecionada não retornou cotação. Selecione um dos serviços disponíveis ao calcular o frete.</p>}
      <p className="mt-1">Verificação preliminar da rota e pacote, não confirmação de postagem. Confira o endereço completo e cote novamente antes de criar o envio.</p>
    </div>;
  }
  return <div role="alert" className="mt-2 space-y-2 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-xs text-amber-950">
    <p className="font-bold">{current.state === 'invalid-destination' ? `CEP de entrega ${shipping.destinationCep} recusado pelo Melhor Envio` : current.state === 'unavailable' ? `Sem cotação disponível para o CEP ${shipping.destinationCep}` : `Não foi possível verificar o CEP ${shipping.destinationCep}`}</p>
    <p>{current.state === 'invalid-destination' ? 'Confirme o CEP com o cliente e consulte o endereço antes de enviar.' : current.state === 'unavailable' ? 'Confira origem, pacote e endereço; a indisponibilidade de cotação não comprova que o CEP não existe.' : 'Pode ser conexão, autorização ou dados do pacote. Não há confirmação de disponibilidade para este CEP.'}</p>
    <button type="button" onClick={() => { pendingChecks.delete(fingerprint); setRetry((value) => value + 1); }} className="rounded-lg border border-amber-700 px-3 py-2 font-bold">Verificar CEP novamente</button>
    <label className="flex items-start gap-2 font-semibold">
      <input type="checkbox" checked={acknowledged} onChange={(event) => {
        const latestValue = latest.current;
        latestValue.onChange({ ...latestValue.shipping, cepWarningAcknowledgement: event.target.checked ? { fingerprint, acknowledgedAt: new Date().toISOString() } : undefined });
      }} />
      <span>Continuar orçamento mesmo com este alerta. Estou ciente de que o envio exige nova cotação aceita pelo Melhor Envio.</span>
    </label>
    {!acknowledged && <p>Para calcular e continuar com este CEP apesar do alerta, marque a opção acima ou corrija o CEP.</p>}
    {acknowledged && <p role="status">Ciência do alerta registrada para esta rota e pacote. Isso não libera envio recusado nem confirma frete.</p>}
    <details className="break-words"><summary className="cursor-pointer">Ver motivo da verificação</summary><p>{current.error}</p></details>
  </div>;
}
