import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Volume2, Sparkles, Play, RotateCcw } from 'lucide-react';

interface AudioVoiceInputProps {
  onTranscriptComplete: (transcript: string) => void;
  isLoading: boolean;
}

export const AudioVoiceInput: React.FC<AudioVoiceInputProps> = ({
  onTranscriptComplete,
  isLoading,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
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
      setTranscript(current.trim());
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error);
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
      if (transcript.trim()) {
        onTranscriptComplete(transcript);
      }
    } else {
      setTranscript('');
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.error('Falha ao iniciar microfone:', err);
      }
    }
  };

  const handleSimulateAudioSample = (sample: string) => {
    setTranscript(sample);
    onTranscriptComplete(sample);
  };

  const SAMPLE_AUDIO_CASES = [
    {
      title: '2 Fresas 3 Cortes TCT (Sedex)',
      text: 'Razão social do cliente Móveis Requinte Ltda, CEP 80010-000, serão duas fresas de três cortes TCT por 140 cada, calcule o envio pelo Melhor Envio Sedex.',
    },
    {
      title: 'Fresa Helicoidal 6mm + V-Bit 90°',
      text: 'Cliente Oficina do CNC e Acrílicos, CNPJ 33.456.789/0001-12, CEP 01310-100, preciso de 4 fresas helicoidais 2 cortes metal duro por 95 cada e 2 fresas V-Bit 90 graus por 110 cada, envio via Melhor Envio PAC.',
    },
  ];

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-5 border border-slate-700 shadow-md">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400">
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <span>Gravar Áudio do Orçamento</span>
              <span className="text-[10px] bg-red-500/20 text-red-300 font-semibold px-2 py-0.5 rounded-full border border-red-500/30">
                Voz Fresa Master
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Fale a razão social, CEP, quantidade de fresas e forma de frete
            </p>
          </div>
        </div>

        {/* Recording Trigger Button */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {speechSupported ? (
            <button
              id="btn-toggle-mic-recording"
              type="button"
              onClick={toggleRecording}
              disabled={isLoading}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer shadow-sm ${
                isRecording
                  ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {isRecording ? (
                <>
                  <MicOff className="w-4 h-4" />
                  <span>Parar Gravação e Processar</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  <span>Gravar por Voz</span>
                </>
              )}
            </button>
          ) : (
            <span className="text-[11px] text-amber-300 bg-amber-950/60 px-3 py-1.5 rounded-lg border border-amber-800">
              Microfone nativo não suportado neste navegador (use os exemplos abaixo)
            </span>
          )}
        </div>
      </div>

      {/* Live recording transcription box */}
      {isRecording && (
        <div className="bg-slate-950/70 border border-red-500/40 rounded-xl p-3 mb-3 animate-fade-in">
          <div className="flex items-center gap-2 text-xs text-red-400 font-semibold mb-1">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
            <span>Ouvindo... Fale agora seu orçamento:</span>
          </div>
          <p className="text-xs text-slate-200 font-medium italic min-h-[36px]">
            {transcript || 'Aguardando sua voz...'}
          </p>
        </div>
      )}

      {/* Quick audio presets simulating user voice */}
      <div className="pt-1 border-t border-slate-700/60 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-amber-400" />
          Testar com simulação de áudio:
        </span>
        {SAMPLE_AUDIO_CASES.map((sample, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSimulateAudioSample(sample.text)}
            className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer flex items-center gap-1.5"
          >
            <Volume2 className="w-3 h-3 text-emerald-400" />
            <span>{sample.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
