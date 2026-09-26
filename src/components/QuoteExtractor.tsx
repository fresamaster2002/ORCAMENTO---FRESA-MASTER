import React, { useState } from 'react';
import { Sparkles, MessageSquare, AlertCircle, CheckCircle2, ChevronRight, Mic } from 'lucide-react';

interface QuoteExtractorProps {
  onExtract: (text: string) => Promise<void>;
  isLoading: boolean;
  summary?: string;
  missingInfo?: string[];
  confidence?: number;
  externalText?: string;
}

const FRESA_MASTER_PRESETS = [
  {
    label: 'Prompt do Usuário',
    title: '2x Fresas 3 Cortes TCT + Sedex',
    text: 'Razão social do cliente Móveis Requinte Ltda, CEP 80010-000, serão 2 fresas de 3 cortes TCT por 140 cada, calcule o envio pelo melhor envio sedex.',
  },
  {
    label: 'Usinagem MDF',
    title: '4x Fresa Helicoidal 6mm + PAC',
    text: 'Razão social: Art Madeira Marcenaria e CNC, CEP 13010-000 Campinas SP. Preciso de 4 fresas helicoidais 2 cortes metal duro 6mm por 95 cada e 1 pinça ER20 6mm por 65, calcular frete PAC Melhor Envio.',
  },
  {
    label: 'Comunicação Visual',
    title: 'Fresas V-Bit 60° e 90° (ACM/Acrílico)',
    text: 'Cliente: Alfa Visual e Letreiros, CNPJ 19.876.543/0001-22, CEP 04567-000 São Paulo/SP. Orçamento para 2 fresas V-Bit 60 graus haste 6mm por 115 cada e 2 fresas de 1 corte para acrílico por 85 cada, envio via Sedex.',
  },
];

export const QuoteExtractor: React.FC<QuoteExtractorProps> = ({
  onExtract,
  isLoading,
  summary,
  missingInfo,
  confidence,
  externalText,
}) => {
  const [inputText, setInputText] = useState(
    externalText || 'Razão social do cliente Móveis Requinte Ltda, CEP 80010-000, serão 2 fresas de 3 cortes TCT por 140 cada, calcule o envio pelo melhor envio sedex.'
  );

  React.useEffect(() => {
    if (externalText) {
      setInputText(externalText);
    }
  }, [externalText]);

  const handleApplyPreset = (presetText: string) => {
    setInputText(presetText);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    onExtract(inputText);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
      <div className="p-5 sm:p-6 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs">
              1
            </div>
            <h2 className="text-base font-bold text-slate-900">
              Texto ou Áudio do Orçamento Fresa Master
            </h2>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold border border-emerald-200 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              Catálogo Bling ERP Conectado
            </span>
            <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-semibold border border-amber-200">
              Gemini 3.8 Flash
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
          Digite ou use o microfone acima para ditar o pedido (ex: razão social, CEP, fresas e frete). A IA <strong>seleciona automaticamente a ferramenta já cadastrada no seu Bling ERP</strong> (com SKU, NCM oficial e preço), calcula as dimensões/peso e busca a melhor cotação de frete.
        </p>

        {/* Quick Presets for Router CNC Tools */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-slate-500 mr-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-500" />
            Exemplos rápidos:
          </span>
          {FRESA_MASTER_PRESETS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleApplyPreset(p.text)}
              className="text-xs px-2.5 py-1 rounded-md bg-slate-50 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300 text-slate-600 border border-slate-200 transition cursor-pointer"
            >
              {p.title}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <textarea
              id="customer-input-textarea"
              rows={4}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Ex: 'Razão social do cliente Móveis Requinte Ltda, CEP 80010-000, serão 2 fresas de 3 cortes TCT por 140 cada, calcule o envio pelo melhor envio sedex...'"
              className="w-full px-3.5 py-3 rounded-xl border border-slate-200 focus:border-amber-500 focus:ring-2 focus:ring-amber-100 text-sm text-slate-800 placeholder-slate-400 resize-y transition outline-none font-sans leading-relaxed"
            />
            {inputText.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setInputText('')}
                className="absolute top-2.5 right-2.5 text-xs text-slate-400 hover:text-slate-600 bg-white/90 px-2 py-0.5 rounded-md border border-slate-100 cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
              <span>{inputText.length} caracteres no pedido</span>
            </div>

            <button
              id="btn-extract-quote"
              type="submit"
              disabled={!inputText.trim() || isLoading}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition cursor-pointer shadow-xs ${
                !inputText.trim() || isLoading
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-600 via-red-600 to-indigo-700 hover:from-amber-700 hover:to-indigo-800 text-white active:scale-98'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Calculando fresas & frete...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-200" />
                  <span>Calcular Orçamento & Frete com IA</span>
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Extracted Status Feedback */}
      {summary && (
        <div className="bg-slate-50/70 p-4 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2 text-slate-700">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-900">Resultado Fresa Master: </span>
              <span>{summary}</span>
            </div>
          </div>
          {confidence !== undefined && (
            <span className="shrink-0 px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full font-bold">
              Precisão: {Math.round(confidence * 100)}%
            </span>
          )}
        </div>
      )}

      {/* Missing Information Alerts */}
      {missingInfo && missingInfo.length > 0 && (
        <div className="bg-amber-50/60 p-4 border-t border-amber-200/60 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-amber-900 mb-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>Dados pendentes para emissão futura da Nota Fiscal no Bling:</span>
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-amber-800 pl-1">
            {missingInfo.map((info, idx) => (
              <li key={idx}>{info}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
