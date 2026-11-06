import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Sparkles, Send, CheckCircle2, ChevronRight } from 'lucide-react';

interface QuickOrderInputProps {
  onProcess: (text: string) => Promise<void>;
  isLoading: boolean;
  externalText?: string;
  summary?: string;
  draftText: string;
  onDraftChange: (text: string) => void;
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
  draftText,
  onDraftChange,
}) => {
  const text = draftText;
  const draftChangeRef = useRef(onDraftChange);
  draftChangeRef.current = onDraftChange;
  const setText = (value: string) => draftChangeRef.current(value);
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
    <div className="fm-panel overflow-hidden transition-all">
      <form onSubmit={handleSubmit}>
        {/* Header bar */}
        <div className="fm-hero fm-hero-inset p-6 sm:p-8">
          <p className="fm-hero-kicker mb-2 flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-5 w-5" />Comando rápido · Voz ou texto</p>
          <h2 className="text-2xl font-bold sm:text-3xl">Seu próximo orçamento começa aqui</h2>
          <p className="fm-hero-description mt-2 max-w-2xl text-sm">Dite ou digite o pedido para preencher os produtos, o cliente e o frete.</p>
          <p className="fm-hero-kicker mt-4 text-xs font-semibold">Catálogo Bling ERP · Melhor Envio</p>
        </div>

        <div className="p-4 sm:p-5 space-y-3">
        {/* Input Text Area with Embedded Actions */}
        <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 focus-within:bg-white dark:focus-within:bg-slate-800 focus-within:border-blue-500 dark:focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10 transition-all">
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
                {isRecording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 fm-accent" />}
                <span className="hidden sm:inline">{isRecording ? 'Ouvindo...' : 'Voz'}</span>
              </button>
            )}

            <button
              type="submit"
              disabled={isLoading || !text.trim()}
              className="fm-action px-3 py-2 rounded-lg disabled:opacity-50 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
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
              className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 hover:text-blue-700 dark:hover:text-blue-300 text-slate-600 dark:text-slate-300 transition cursor-pointer whitespace-nowrap shrink-0"
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
        </div>
      </form>
    </div>
  );
};
