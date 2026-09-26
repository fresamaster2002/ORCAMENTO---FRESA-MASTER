import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Sparkles, Send, CheckCircle2, ChevronRight } from 'lucide-react';

interface QuickOrderInputProps {
  onProcess: (text: string) => Promise<void>;
  isLoading: boolean;
  externalText?: string;
  summary?: string;
}

const PRESETS = [
  {
    title: '2x TCT + Sedex',
    text: 'Razão social do cliente Móveis Requinte Ltda, CEP 80010-000, serão 2 fresas de 3 cortes TCT por 140 cada, calcule o envio pelo melhor envio sedex.',
  },
  {
    title: 'Motoboy R$ 45',
    text: 'Cliente Marcenaria Modelo, CEP 13320-000, 2 fresas 3 cortes TCT por 140 cada, envio por motoboy 45 reais.',
  },
  {
    title: 'Frete Por Nossa Conta',
    text: 'Cliente Alfa Visual, CEP 04567-000, 3 fresas helicoidais 6mm por 95 cada, envio por nossa conta frete gratis.',
  },
  {
    title: '4x Helicoidal + PAC',
    text: 'Razão social: Art Madeira Marcenaria e CNC, CEP 13010-000 Campinas SP, 4 fresas helicoidais 2 cortes metal duro 6mm por 95 cada, calcular frete PAC Melhor Envio.',
  },
];

export const QuickOrderInput: React.FC<QuickOrderInputProps> = ({
  onProcess,
  isLoading,
  externalText,
  summary,
}) => {
  const [text, setText] = useState(
    externalText ||
      'Razão social do cliente Móveis Requinte Ltda, CEP 80010-000, serão 2 fresas de 3 cortes TCT por 140 cada, calcule o envio pelo melhor envio sedex.'
  );
  const [isRecording, setIsRecording] = useState(false);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (externalText) {
      setText(externalText);
    }
  }, [externalText]);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setHasSpeechSupport(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'pt-BR';

    recognition.onresult = (event: any) => {
      let current = '';
      for (let i = 0; i < event.results.length; i++) {
        current += event.results[i][0].transcript + ' ';
      }
      setText(current.trim());
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech error:', event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch (e) {
        // ignore
      }
    };
  }, []);

  const toggleRecording = () => {
    if (!recognitionRef.current) return;

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
      if (text.trim()) {
        onProcess(text);
      }
    } else {
      setText('');
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.error('Falha ao iniciar microfone:', err);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isLoading) return;
    onProcess(text);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden transition-all">
      <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-3">
        {/* Header bar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Comando Rápido de Orçamento (Voz ou Texto)
            </h2>
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            Conectado ao Catálogo Bling ERP & Melhor Envio
          </span>
        </div>

        {/* Input Text Area with Embedded Actions */}
        <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 focus-within:bg-white dark:focus-within:bg-slate-800 focus-within:border-amber-500 dark:focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/10 transition-all">
          <textarea
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Dite ou digite o pedido: Ex: Cliente Móveis Requinte Ltda, CEP 80010-000, 2 fresas 3 cortes TCT por 140 cada, frete Sedex..."
            className="w-full p-3.5 pr-28 text-xs text-slate-800 dark:text-slate-100 bg-transparent outline-none resize-none placeholder:text-slate-400 dark:placeholder:text-slate-500 leading-relaxed font-normal"
          />

          <div className="absolute right-2.5 bottom-2.5 flex items-center gap-1.5">
            {hasSpeechSupport && (
              <button
                type="button"
                onClick={toggleRecording}
                className={`p-2 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  isRecording
                    ? 'bg-rose-600 text-white animate-pulse shadow-xs'
                    : 'bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600'
                }`}
                title={isRecording ? 'Parar gravação e processar' : 'Gravar comando por voz'}
              >
                {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-rose-500" />}
                <span className="hidden sm:inline">{isRecording ? 'Ouvindo...' : 'Voz'}</span>
              </button>
            )}

            <button
              type="submit"
              disabled={isLoading || !text.trim()}
              className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              {isLoading ? (
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>Processar</span>
            </button>
          </div>
        </div>

        {/* Quick Presets Pills (Clean & Compact) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-0.5 text-xs text-slate-500 dark:text-slate-400 no-scrollbar">
          <span className="text-[11px] font-medium shrink-0 text-slate-400 mr-1">Exemplos:</span>
          {PRESETS.map((p, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setText(p.text);
                onProcess(p.text);
              }}
              className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-700 dark:hover:text-amber-400 text-slate-600 dark:text-slate-300 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              {p.title}
            </button>
          ))}
        </div>

        {/* Clean, Subtle Summary Indicator */}
        {summary && (
          <div className="pt-1 flex items-center gap-2 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">{summary}</span>
          </div>
        )}
      </form>
    </div>
  );
};
