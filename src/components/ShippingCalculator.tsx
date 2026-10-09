import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { DEFAULT_PACKAGE_DIMENSIONS } from '../../supabase/functions/_shared/shippingDefaults';
import {
  Truck,
  Check,
  RotateCcw,
  Sparkles,
  MapPin,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Scale,
  Settings2,
  Box,
  DollarSign,
  Info,
  Bike,
  Store,
  Gift,
  HelpCircle,
} from 'lucide-react';
import { ShippingInfo, ShippingOption, QuoteItem, PackageDimensions } from '../types';

interface ShippingCalculatorProps {
  shipping: ShippingInfo;
  items: QuoteItem[];
  clientCity?: string;
  clientState?: string;
  onSelectOption: (option: ShippingOption) => void;
  onUpdateDestinationCep: (cep: string) => void;
  onUpdateShipping?: (updatedShipping: ShippingInfo, selectedOption?: ShippingOption) => void;
}

const DEFAULT_ORIGIN_CEP = '13329-350'; // Salto / SP (Expedição Oficial Fresa Master)

export const ShippingCalculator: React.FC<ShippingCalculatorProps> = ({
  shipping,
  items,
  clientCity,
  clientState,
  onSelectOption,
  onUpdateDestinationCep,
  onUpdateShipping,
}) => {
  const [cepInput, setCepInput] = useState(shipping.destinationCep || '');
  const [isCalculating, setIsCalculating] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [meStatus, setMeStatus] = useState<{ state: 'checking' | 'connected' | 'disconnected'; detail?: string }>({ state: 'checking' });

  const checkMelhorEnvio = async () => {
    setMeStatus({ state: 'checking' });
    try {
      const res = await apiFetch('/api/shipping/test-melhor-envio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (res.ok && data.connected) {
        setMeStatus({ state: 'connected', detail: `${data.message} (${data.user?.environment || ''})` });
      } else {
        setMeStatus({ state: 'disconnected', detail: data.message || data.error || 'Token do Melhor Envio inválido ou ausente.' });
      }
    } catch {
      setMeStatus({ state: 'disconnected', detail: 'Não foi possível contatar o servidor.' });
    }
  };

  useEffect(() => {
    checkMelhorEnvio();
  }, []);

  // Settings
  const [originCep, setOriginCep] = useState(shipping.originCep || DEFAULT_ORIGIN_CEP);
  const [insuranceEnabled, setInsuranceEnabled] = useState(shipping.insuranceEnabled ?? false);
  const [customWeight, setCustomWeight] = useState(
    shipping.weightKg ? shipping.weightKg.toString().replace('.', ',') : '0,5'
  );

  // Package Dimensions
  const [heightCm, setHeightCm] = useState(shipping.packageDimensions?.height || DEFAULT_PACKAGE_DIMENSIONS.height);
  const [widthCm, setWidthCm] = useState(shipping.packageDimensions?.width || DEFAULT_PACKAGE_DIMENSIONS.width);
  const [lengthCm, setLengthCm] = useState(shipping.packageDimensions?.length || DEFAULT_PACKAGE_DIMENSIONS.length);

  // Custom shipping
  const [customShippingName, setCustomShippingName] = useState(
    shipping.customShippingName || 'Transportadora Própria'
  );
  const [customShippingAmount, setCustomShippingAmount] = useState(
    shipping.customShippingAmount !== undefined ? shipping.customShippingAmount.toString() : ''
  );
  const [isCustomShippingEnabled, setIsCustomShippingEnabled] = useState(
    shipping.customShippingAmount !== undefined && shipping.customShippingAmount > 0
  );

  // High-level Shipping Mode category:
  // 'melhor_envio' = Sedex, PAC, Jadlog (Correios e Transportadoras)
  // 'motoboy' = Motoboy / Aplicativo (Lalamove, Uber Flash)
  // 'retirada' = Retirada Balcão Salto/SP
  // 'conta_fresa' = Envio por nossa conta (Cortesia Fresa Master)
  // 'proprio' = Transportadora própria com valor negociado
  const getInitialShippingMode = (): 'melhor_envio' | 'motoboy' | 'retirada' | 'conta_fresa' | 'proprio' => {
    const s = shipping.selectedOption?.service;
    if (s === 'MOTOBOY') return 'motoboy';
    if (s === 'RETIRADA') return 'retirada';
    if (s === 'CONTA_FRESA') return 'conta_fresa';
    if (s === 'PROPRIO') return 'proprio';
    return 'melhor_envio';
  };

  const [shippingMode, setShippingMode] = useState<'melhor_envio' | 'motoboy' | 'retirada' | 'conta_fresa' | 'proprio'>(
    getInitialShippingMode()
  );

  // Motoboy custom value state
  const [motoboyPrice, setMotoboyPrice] = useState<string>(() => {
    if (shipping.selectedOption?.service === 'MOTOBOY') {
      return (shipping.selectedOption.price || 0).toString();
    }
    return '0';
  });

  const totalToolPieces = items.reduce((acc, it) => acc + (it.quantity || 1), 0);
  const totalItemsValue = items.reduce((acc, it) => acc + it.totalPrice, 0);

  // Sync shipping mode and motoboy price whenever selectedOption changes
  useEffect(() => {
    const s = shipping.selectedOption?.service;
    if (s === 'MOTOBOY') {
      setShippingMode('motoboy');
      setMotoboyPrice((shipping.selectedOption?.price || 0).toString());
    } else if (s === 'RETIRADA') {
      setShippingMode('retirada');
    } else if (s === 'CONTA_FRESA') {
      setShippingMode('conta_fresa');
    } else if (s === 'PROPRIO') {
      setShippingMode('proprio');
    } else if (s === 'SEDEX' || s === 'PAC' || s === 'JADLOG_PACKAGE') {
      setShippingMode('melhor_envio');
    }
  }, [shipping.selectedOption?.service, shipping.selectedOption?.price]);

  useEffect(() => {
    if (shipping.destinationCep && shipping.destinationCep !== cepInput) {
      setCepInput(shipping.destinationCep);
    }
  }, [shipping.destinationCep]);

  useEffect(() => {
    setHeightCm(shipping.packageDimensions?.height || DEFAULT_PACKAGE_DIMENSIONS.height);
    setWidthCm(shipping.packageDimensions?.width || DEFAULT_PACKAGE_DIMENSIONS.width);
    setLengthCm(shipping.packageDimensions?.length || DEFAULT_PACKAGE_DIMENSIONS.length);
  }, [shipping.packageDimensions?.height, shipping.packageDimensions?.width, shipping.packageDimensions?.length]);

  useEffect(() => {
    if (shipping.insuranceEnabled !== undefined && shipping.insuranceEnabled !== insuranceEnabled) {
      setInsuranceEnabled(shipping.insuranceEnabled);
    }
  }, [shipping.insuranceEnabled]);

  useEffect(() => {
    if (shipping.weightKg !== undefined) {
      setCustomWeight(shipping.weightKg.toString().replace('.', ','));
    }
  }, [shipping.weightKg]);

  const parseWeightValue = (valStr: string): number => {
    const clean = valStr.replace(',', '.').trim();
    const num = parseFloat(clean);
    return isNaN(num) || num <= 0 ? 0.5 : num;
  };

  const handleRecalculate = async (
    targetCep?: string,
    weightVal?: number,
    dims?: PackageDimensions,
    originVal?: string,
    customShip?: { amount: number; name: string },
    insuranceVal?: boolean
  ) => {
    const cepToUse = targetCep || cepInput;
    if (!cepToUse || cepToUse.length < 8) return;

    if (isRecalculating) return;

    const dimsToUse = dims || { height: heightCm, width: widthCm, length: lengthCm };
    if (Object.values(dimsToUse).some((value) => !Number.isFinite(value)) || dimsToUse.height < 2 || dimsToUse.width < 11 || dimsToUse.length < 16) {
      setCalculationError('Informe medidas válidas: altura mínima 2 cm, largura 11 cm e comprimento 16 cm.');
      return;
    }
    setCalculationError(null);
    setIsCalculating(true);
    setIsRecalculating(true);

    const weightToUse = weightVal !== undefined ? weightVal : parseWeightValue(customWeight);
    const originCepToUse = originVal || originCep;
    const insuranceToUse = insuranceVal !== undefined ? insuranceVal : insuranceEnabled;

    let customShippingPayload = undefined;
    if (customShip !== undefined) {
      customShippingPayload = customShip;
    } else if (isCustomShippingEnabled && customShippingAmount) {
      const amt = parseFloat(customShippingAmount.replace(',', '.'));
      if (!isNaN(amt) && amt >= 0) {
        customShippingPayload = { amount: amt, name: customShippingName || 'Frete Próprio' };
      }
    }

    try {
      const res = await apiFetch('/api/shipping/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destinationCep: cepToUse,
          originCep: originCepToUse,
          weightKg: weightToUse,
          packageDimensions: dimsToUse,
          customShipping: customShippingPayload,
          insuranceEnabled: insuranceToUse,
          declaredValue: totalItemsValue,
          items,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.options?.length) {
        throw new Error(data.error || 'Não foi possível recalcular o frete com essas medidas.');
      }
      if (data.success && data.options) {
        let selected =
          data.options.find((o: ShippingOption) => o.service === shipping.selectedOption?.service) ||
          data.options[0];

        if (onUpdateShipping) {
          onUpdateShipping(
            {
              ...shipping,
              originCep: originCepToUse,
              destinationCep: cepToUse,
              weightKg: data.weightKg || weightToUse,
              weightDescription: data.weightDescription,
              packageDimensions: dimsToUse,
              insuranceEnabled: insuranceToUse,
              declaredValue: data.declaredValue ?? totalItemsValue,
              insuranceAmount: data.insuranceAmount ?? (insuranceToUse ? (selected.insuranceCost || 0) : 0),
              customShippingAmount: customShippingPayload?.amount,
              customShippingName: customShippingPayload?.name,
              options: data.options,
              selectedOption: selected,
            },
            selected
          );
        }
      }
    } catch (err) {
      console.error('Erro ao recalcular frete:', err);
      setCalculationError(err instanceof Error ? err.message : 'Não foi possível recalcular o frete.');
    } finally {
      setIsCalculating(false);
      setIsRecalculating(false);
    }
  };

  const handleToggleInsurance = (enabled: boolean) => {
    setInsuranceEnabled(enabled);
    handleRecalculate(undefined, undefined, undefined, undefined, undefined, enabled);
  };

  const handleQuickWeightChange = (weightKg: number) => {
    setCustomWeight(weightKg.toString().replace('.', ','));
    handleRecalculate(undefined, weightKg);
  };

  const handleManualWeightSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseWeightValue(customWeight);
    handleRecalculate(undefined, parsed);
  };

  const handleCepSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateDestinationCep(cepInput);
    handleRecalculate(cepInput);
  };

  // Insurance fee estimation for active quote
  const estimatedInsuranceFee = Math.max(2.5, Number((totalItemsValue * 0.015).toFixed(2)));

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
      {/* Header bar */}
      <div className="px-5 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                Cálculo de Frete & Logística
              </h3>
              <button
                type="button"
                onClick={checkMelhorEnvio}
                title={meStatus.detail || 'Verificar conexão com o Melhor Envio'}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 cursor-pointer transition ${
                  meStatus.state === 'connected'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                    : meStatus.state === 'checking'
                      ? 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                      : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${meStatus.state === 'connected' ? 'bg-emerald-500' : meStatus.state === 'checking' ? 'bg-slate-400 animate-pulse' : 'bg-red-500'}`} />
                {meStatus.state === 'connected' ? 'Melhor Envio conectado' : meStatus.state === 'checking' ? 'Verificando...' : 'Melhor Envio desconectado'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Despacho direto de <span className="font-semibold text-slate-700 dark:text-slate-300">Salto/SP ({originCep})</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 flex items-center gap-1.5 transition cursor-pointer px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span>{showAdvanced ? 'Ocultar Opções' : 'Configurações de Pacote'}</span>
        </button>
      </div>

      <div className="p-5 space-y-4">
        {calculationError && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">{calculationError}</p>}
        {/* Shipping Type Selector: Motoboy, Melhor Envio, Retirada, Por Conta da Fresa */}
        <div>
          <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Tipo de Envio do Pedido:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* 1. Melhor Envio (Correios / Jadlog) */}
            <button
              type="button"
              onClick={() => {
                setShippingMode('melhor_envio');
                const meOption = shipping.options?.find(o => ['SEDEX', 'PAC', 'JADLOG_PACKAGE'].includes(o.service)) || shipping.options?.[0];
                if (meOption) onSelectOption(meOption);
              }}
              className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                shippingMode === 'melhor_envio'
                  ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <Truck className={`w-4 h-4 ${shippingMode === 'melhor_envio' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`} />
                {shippingMode === 'melhor_envio' && <Check className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
              </div>
              <div>
                <span className="block text-xs font-black text-slate-900 dark:text-slate-100">
                  Melhor Envio
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  Sedex, PAC & Jadlog
                </span>
              </div>
            </button>

            {/* 2. Envio por Motoboy */}
            <button
              type="button"
              onClick={() => {
                setShippingMode('motoboy');
                const priceNum = parseFloat(motoboyPrice.replace(',', '.')) || 0;
                const motoboyOpt: ShippingOption = {
                  service: 'MOTOBOY',
                  name: 'Envio por Motoboy',
                  carrier: 'Motoboy / Aplicativo',
                  price: priceNum,
                  deliveryDays: 1,
                  insuranceIncluded: false,
                  insuranceCost: 0,
                  withInsurancePrice: priceNum,
                  withoutInsurancePrice: priceNum,
                };
                onSelectOption(motoboyOpt);
              }}
              className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                shippingMode === 'motoboy'
                  ? 'bg-blue-500/10 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <Bike className={`w-4 h-4 ${shippingMode === 'motoboy' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500'}`} />
                {shippingMode === 'motoboy' && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
              </div>
              <div>
                <span className="block text-xs font-black text-slate-900 dark:text-slate-100">
                  Motoboy
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  {parseFloat(motoboyPrice.replace(',', '.')) > 0 
                    ? `R$ ${parseFloat(motoboyPrice.replace(',', '.')).toFixed(2).replace('.', ',')}`
                    : 'Definir valor do app'}
                </span>
              </div>
            </button>

            {/* 3. Retirada no Balcão */}
            <button
              type="button"
              onClick={() => {
                setShippingMode('retirada');
                const retiradaOpt: ShippingOption = {
                  service: 'RETIRADA',
                  name: 'Retirada no Balcão (Salto/SP)',
                  carrier: 'Balcão Fresa Master',
                  price: 0,
                  deliveryDays: 0,
                  insuranceIncluded: false,
                  insuranceCost: 0,
                  withInsurancePrice: 0,
                  withoutInsurancePrice: 0,
                };
                onSelectOption(retiradaOpt);
              }}
              className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                shippingMode === 'retirada'
                  ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <Store className={`w-4 h-4 ${shippingMode === 'retirada' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`} />
                {shippingMode === 'retirada' && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
              </div>
              <div>
                <span className="block text-xs font-black text-slate-900 dark:text-slate-100">
                  Retirada no Local
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  Salto/SP • Sem frete
                </span>
              </div>
            </button>

            {/* 4. Envio por Nossa Conta (Cortesia) */}
            <button
              type="button"
              onClick={() => {
                setShippingMode('conta_fresa');
                const cortesiaOpt: ShippingOption = {
                  service: 'CONTA_FRESA',
                  name: 'Envio por Nossa Conta (Cortesia Fresa Master)',
                  carrier: 'Fresa Master',
                  price: 0,
                  deliveryDays: 2,
                  insuranceIncluded: false,
                  insuranceCost: 0,
                  withInsurancePrice: 0,
                  withoutInsurancePrice: 0,
                };
                onSelectOption(cortesiaOpt);
              }}
              className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                shippingMode === 'conta_fresa'
                  ? 'bg-purple-500/10 border-purple-500 ring-2 ring-purple-500/20 shadow-xs'
                  : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <Gift className={`w-4 h-4 ${shippingMode === 'conta_fresa' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-500'}`} />
                {shippingMode === 'conta_fresa' && <Check className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />}
              </div>
              <div>
                <span className="block text-xs font-black text-slate-900 dark:text-slate-100">
                  Por Nossa Conta
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  Frete Cortesia / Negociado
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* DETAILS FOR: Motoboy */}
        {shippingMode === 'motoboy' && (
          <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-blue-900 dark:text-blue-300">
                <Bike className="w-4 h-4 text-blue-600" />
                <span>Envio por Motoboy</span>
              </div>
              <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                Lalamove, Uber Flash, 99 ou particular
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Digite apenas o valor informado no aplicativo do motoboy para ser somado diretamente ao orçamento.
            </p>

            <div className="max-w-xs pt-1">
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                Valor do Motoboy no App (R$):
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">R$</span>
                  <input
                    type="text"
                    value={motoboyPrice}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMotoboyPrice(val);
                      const priceNum = parseFloat(val.replace(',', '.')) || 0;
                      onSelectOption({
                        service: 'MOTOBOY',
                        name: 'Envio por Motoboy',
                        carrier: 'Motoboy / Aplicativo',
                        price: priceNum,
                        deliveryDays: 1,
                        insuranceIncluded: false,
                        insuranceCost: 0,
                        withInsurancePrice: priceNum,
                        withoutInsurancePrice: priceNum,
                      });
                    }}
                    placeholder="0,00"
                    className="w-full pl-9 pr-3 py-1.5 text-xs font-mono font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <span className="text-[11px] text-slate-500 shrink-0 font-medium">
                  {parseFloat(motoboyPrice.replace(',', '.')) > 0 ? 'Somado ao total' : 'Cliente paga à parte'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* DETAILS FOR: Retirada */}
        {shippingMode === 'retirada' && (
          <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-300">
                <Store className="w-4 h-4 text-emerald-600" />
                <span>Retirada no Balcão • Fresa Master</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs font-black">
                R$ 0,00 (Grátis)
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              O cliente retira diretamente em nossa unidade em <strong>Salto/SP (CEP {originCep})</strong>. Sem custo adicional de frete.
            </p>
          </div>
        )}

        {/* DETAILS FOR: Por conta Fresa */}
        {shippingMode === 'conta_fresa' && (
          <div className="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/60 space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-purple-900 dark:text-purple-300">
                <Gift className="w-4 h-4 text-purple-600" />
                <span>Envio por Nossa Conta (Frete Cortesia Fresa Master)</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 text-xs font-black">
                Frete Grátis p/ Cliente
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Condição comercial especial onde a Fresa Master absorve o custo de envio. O valor do frete para o cliente é R$ 0,00 com modalidade CIF na NF-e.
            </p>
          </div>
        )}

        {/* ONLY IF MELHOR ENVIO: SHOW CONTROLS */}
        {shippingMode === 'melhor_envio' && (
        <div className="space-y-4 pt-1">
        {/* Main Controls Row: Destination CEP + Weight + Insurance Toggle */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Destination CEP */}
          <div className="md:col-span-4">
            <form onSubmit={handleCepSubmit} className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={cepInput}
                  onChange={(e) => setCepInput(e.target.value)}
                  placeholder="CEP: 00000-000"
                  className="w-full px-3 py-2 pl-8 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              </div>
              <button
                type="submit"
                disabled={isCalculating}
                className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-black dark:hover:bg-slate-600 text-white text-xs font-bold transition cursor-pointer shrink-0 disabled:opacity-50"
              >
                {isCalculating ? (
                  <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Calcular'
                )}
              </button>
            </form>
            {(clientCity || clientState) && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block truncate">
                Destino: {clientCity}{clientState ? `/${clientState}` : ''}
              </span>
            )}
          </div>

          {/* Weight Control: Direct Editable Input + Quick Presets */}
          <div className="md:col-span-4">
            <form onSubmit={handleManualWeightSubmit} className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={customWeight}
                  onChange={(e) => setCustomWeight(e.target.value)}
                  onBlur={() => {
                    const parsed = parseWeightValue(customWeight);
                    if (parsed !== shipping.weightKg) {
                      handleRecalculate(undefined, parsed);
                    }
                  }}
                  placeholder="0,5"
                  title="Digite o peso em kg (Ex: 0,5 ou 1,2) e pressione Enter ou Calcular"
                  className="w-full px-3 py-2 pl-7 pr-7 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
                <Scale className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2.5" />
                <span className="text-[10px] font-bold text-slate-400 absolute right-2 top-2.5">kg</span>
              </div>

              {/* Quick weight shortcuts */}
              <div className="flex items-center gap-1 shrink-0 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => handleQuickWeightChange(0.5)}
                  className={`px-2 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${
                    parseWeightValue(customWeight) === 0.5
                      ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                  title="Tarifa mínima padrão (0,5 kg)"
                >
                  0,5k
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickWeightChange(1.0)}
                  className={`px-2 py-1 text-[11px] font-bold rounded-lg transition cursor-pointer ${
                    parseWeightValue(customWeight) === 1.0
                      ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                  title="Peso para pacotes médios (1,0 kg)"
                >
                  1,0k
                </button>
              </div>
            </form>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block truncate">
              {parseWeightValue(customWeight) <= 0.5 ? 'Tarifa mínima dos Correios (até 500g)' : `Peso tarifado: ${customWeight} kg`}
            </span>
          </div>

          {/* Insurance Toggle - Prominent and Clear */}
          <div className="md:col-span-4">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => handleToggleInsurance(true)}
                className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  insuranceEnabled
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="Garante indenização de 100% do valor das fresas contra extravio, roubo ou dano"
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Com Seguro</span>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  insuranceEnabled ? 'bg-emerald-700/60 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}>
                  +R$ {estimatedInsuranceFee.toFixed(2).replace('.', ',')}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleInsurance(false)}
                className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  !insuranceEnabled
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
                title="Sem seguro de carga adicional dos Correios/Jadlog"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Sem Seguro</span>
              </button>
            </div>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 block truncate">
              {insuranceEnabled 
                ? `Cobre R$ ${totalItemsValue.toFixed(2).replace('.', ',')} (valor integral dos itens)` 
                : 'Indenização padrão básica dos Correios/Jadlog'}
            </span>
          </div>
        </div>

        {/* Collapsible Advanced Settings */}
        {showAdvanced && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs space-y-3 transition-all animate-fadeIn">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  CEP de Origem (Expedição):
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={originCep}
                    onChange={(e) => setOriginCep(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs text-slate-800 dark:text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setOriginCep(DEFAULT_ORIGIN_CEP);
                      handleRecalculate(undefined, undefined, undefined, DEFAULT_ORIGIN_CEP);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title="Restaurar CEP padrão Salto/SP"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Dimensões (Alt x Larg x Comp cm):
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    aria-label="Altura do pacote em cm"
                    min="2"
                    value={heightCm}
                    onChange={(e) => setHeightCm(Number(e.target.value))}
                    className="w-12 px-1.5 py-1.5 text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                  <span className="text-slate-400">x</span>
                  <input
                    type="number"
                    aria-label="Largura do pacote em cm"
                    min="11"
                    value={widthCm}
                    onChange={(e) => setWidthCm(Number(e.target.value))}
                    className="w-12 px-1.5 py-1.5 text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                  <span className="text-slate-400">x</span>
                  <input
                    type="number"
                    aria-label="Comprimento do pacote em cm"
                    min="16"
                    value={lengthCm}
                    onChange={(e) => setLengthCm(Number(e.target.value))}
                    className="w-12 px-1.5 py-1.5 text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setHeightCm(DEFAULT_PACKAGE_DIMENSIONS.height);
                      setWidthCm(DEFAULT_PACKAGE_DIMENSIONS.width);
                      setLengthCm(DEFAULT_PACKAGE_DIMENSIONS.length);
                      handleRecalculate(undefined, undefined, { ...DEFAULT_PACKAGE_DIMENSIONS });
                    }}
                    className="text-xs font-bold text-amber-700 dark:text-amber-400"
                  >
                    Padrão 7 × 12 × 17 cm
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRecalculate()}
                    disabled={isRecalculating}
                    className="px-2.5 py-1.5 bg-slate-900 text-white rounded-lg font-bold text-xs disabled:opacity-50"
                  >
                    Aplicar medidas
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Frete Próprio (Transportadora):
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={customShippingAmount}
                    onChange={(e) => {
                      setCustomShippingAmount(e.target.value);
                      setIsCustomShippingEnabled(Boolean(e.target.value));
                    }}
                    placeholder="R$ 0,00"
                    className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleRecalculate()}
                    className="px-2.5 py-1.5 bg-slate-900 text-white rounded-lg font-bold text-xs"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Clean, High-Contrast Shipping Cards (Sedex, PAC, Jadlog) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(shipping.options || [])
            .filter((opt) => ['SEDEX', 'PAC', 'JADLOG_PACKAGE', 'PROPRIO'].includes(opt.service))
            .map((opt, idx) => {
            const isSelected = shipping.selectedOption?.service === opt.service;
            
            // Clean pricing separation
            const insuranceCost = insuranceEnabled ? (opt.insuranceCost || estimatedInsuranceFee) : 0;
            const baseFreightPrice = opt.withoutInsurancePrice ?? (opt.price - (insuranceEnabled ? insuranceCost : 0));
            const finalCardPrice = insuranceEnabled ? (baseFreightPrice + insuranceCost) : baseFreightPrice;

            return (
              <div
                key={idx}
                onClick={() => onSelectOption({ ...opt, price: finalCardPrice })}
                className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
                    : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50/50 dark:hover:bg-slate-800'
                }`}
              >
                <div>
                  {/* Service & Checkmark */}
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-slate-100">
                      {opt.service === 'SEDEX' && 'SEDEX (Correios)'}
                      {opt.service === 'PAC' && 'PAC (Correios)'}
                      {opt.service === 'JADLOG_PACKAGE' && 'Jadlog .Package'}
                      {opt.service === 'PROPRIO' && 'Transportadora Própria'}
                    </span>
                    {isSelected && (
                      <span className="h-4 w-4 rounded-full bg-amber-600 text-white flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>

                  {/* Delivery ETA */}
                  <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                    <Clock className="w-3 h-3" />
                    <span>
                      {opt.deliveryDays > 0 ? `Entrega em ~${opt.deliveryDays} dias úteis` : 'A combinar'}
                    </span>
                  </div>

                  {/* Price breakdown when insurance is active */}
                  {insuranceEnabled && (
                    <div className="space-y-1 mb-3 pt-2 border-t border-slate-100 dark:border-slate-700/60 text-[11px]">
                      <div className="flex justify-between text-slate-500 dark:text-slate-400">
                        <span>Frete base:</span>
                        <span className="font-mono">
                          {baseFreightPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          <span>Seguro (+1,5%):</span>
                        </span>
                        <span className="font-mono">
                          + {insuranceCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      </div>
                    </div>
                  )}

                  {!insuranceEnabled && (
                    <div className="mb-2 text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-slate-400" />
                      <span>Sem cobertura de seguro</span>
                    </div>
                  )}
                </div>

                {/* Final Total for this option */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex items-baseline justify-between">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold">
                    {opt.carrier}
                  </span>
                  <span className={`text-base font-extrabold ${isSelected ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
                    {finalCardPrice === 0
                      ? 'Grátis'
                      : finalCardPrice.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        </div>
        )}
      </div>
    </div>
  );
};
