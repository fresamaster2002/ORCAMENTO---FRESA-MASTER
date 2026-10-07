import React, { useState, useRef } from 'react';
import { apiFetch } from '../api';
import { CnpjLookup } from './CnpjLookup';
import { 
  Sparkles, 
  X, 
  UserCheck, 
  Building2, 
  FileText, 
  Check, 
  Loader2, 
  AlertCircle,
  UploadCloud,
  FileImage,
  Paperclip,
  Trash2,
  File,
  Info
} from 'lucide-react';
import { ClientInfo } from '../types';

interface ClientCadastralModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentClient: ClientInfo;
  onApplyClient: (client: ClientInfo) => void;
}

interface AttachedDocument {
  name: string;
  size: number;
  type: string;
  base64: string;
  previewUrl?: string;
}

export const ClientCadastralModal: React.FC<ClientCadastralModalProps> = ({
  isOpen,
  onClose,
  currentClient,
  onApplyClient,
}) => {
  const [activeMode, setActiveMode] = useState<'both' | 'document' | 'text'>('both');
  const [inputText, setInputText] = useState('');
  const [attachedDoc, setAttachedDoc] = useState<AttachedDocument | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedPreview, setExtractedPreview] = useState<ClientInfo | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [textFromAi, setTextFromAi] = useState(false);
  const [applyState, setApplyState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const SAMPLE_CADASTRAL = `Razão Social: MÓVEIS REQUINTE INDUSTRIA E COMERCIO LTDA
Nome Fantasia: Móveis Requinte CNC
CNPJ: 14.890.123/0001-45
Inscrição Estadual: 90812345-67
Endereço: Rua das Indústrias Moveleiras, 500 - Galpão 2
Bairro: Polo Industrial
Cidade: Curitiba - PR
CEP: 80010-000
E-mail Fiscal (XML/DANFE): fiscal@moveisrequinte.com.br
Telefone/WhatsApp: (41) 98888-5544`;

  const handleFileProcess = (file: File) => {
    // Check type: images (png, jpg, jpeg, webp) or PDF
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setErrorMessage('Formato inválido. Anexe uma imagem (JPG, PNG, WEBP) ou PDF do Cartão CNPJ.');
      return;
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('O arquivo deve ter no máximo 10MB.');
      return;
    }

    setErrorMessage(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const resultStr = e.target?.result as string;
      const isImage = file.type.startsWith('image/');
      const finish = (base64: string, type: string) => setAttachedDoc({
        name: file.name,
        size: file.size,
        type,
        base64,
        previewUrl: isImage ? base64 : undefined,
      });
      if (!isImage) return finish(resultStr, file.type);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return finish(resultStr, file.type);
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/jpeg', 0.88), 'image/jpeg');
      };
      img.onerror = () => finish(resultStr, file.type);
      img.src = resultStr;
    };    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleExtractWithAi = async () => {
    if (!inputText.trim() && !attachedDoc) {
      setErrorMessage('Por favor, cole os dados em texto ou anexe um documento/foto do Cartão CNPJ.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const payload: any = {
        text: inputText,
        currentClient: attachedDoc && !(textFromAi && inputText.trim()) ? {} : (extractedPreview || currentClient),
      };

      if (attachedDoc && !(textFromAi && inputText.trim())) {
        payload.file = {
          base64: attachedDoc.base64,
          mimeType: attachedDoc.type,
          fileName: attachedDoc.name,
        };
      }

      const res = await apiFetch('/api/bling/extract-cadastral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success && data.client) {
        setExtractedPreview(data.client);
        setInputText(clientToText(data.client));
        setTextFromAi(true);
        setStatusMessage(
          attachedDoc
            ? 'Dados cadastrais do Cartão CNPJ lidos e estruturados com sucesso pela IA!'
            : data.summary || 'Dados cadastrais identificados pela IA!'
        );
      } else {
        setErrorMessage(data.error || 'Não foi possível extrair os dados cadastrais.');
      }
    } catch (err: any) {
      console.error('Erro na extração cadastral:', err);
      setErrorMessage('Falha ao comunicar com o serviço de extração de dados.');
    } finally {
      setIsProcessing(false);
    }
  };

  const clientToText = (c: ClientInfo) => [
    `Razão Social: ${c.name || ''}`,
    `Nome Fantasia: ${c.tradeName || ''}`,
    `CNPJ/CPF: ${c.document || ''}`,
    `Inscrição Estadual: ${c.ie || ''}`,
    `Endereço: ${c.address || ''}, ${c.number || 'S/N'}${c.complement ? ' - ' + c.complement : ''}`,
    `Bairro: ${c.neighborhood || ''}`,
    `Cidade: ${c.city || ''} - ${c.state || ''}`,
    `CEP: ${c.cep || ''}`,
    `E-mail: ${c.email || ''}`,
    `Telefone: ${c.phone || ''}`,
  ].join('\n');

  const handleCnpjFound = (client: ClientInfo) => {
    const base = extractedPreview || currentClient;
    const sameClient = String(base.document || '').replace(/\D/g, '') === String(client.document || '').replace(/\D/g, '');
    const nextClient = sameClient
      ? {
          ...base,
          ...client,
          email: client.email || base.email || '',
          phone: client.phone || base.phone || '',
          ie: client.ie || (/^\s*isent[oa]\s*$/i.test(base.ie || '') ? '' : base.ie || ''),
        }
      : client;
    setAttachedDoc(null);
    setExtractedPreview(nextClient);
    setInputText(clientToText(nextClient));
    setTextFromAi(true);
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const updateField = (key: keyof ClientInfo, value: string) => {
    setExtractedPreview((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [key]: value };
      setInputText(clientToText(next));
      return next;
    });
  };

  const handleConfirmAndApply = () => {
    if (!extractedPreview) return;
    if (applyState !== 'idle') return;
    setApplyState('saving');
    onApplyClient(extractedPreview);
    window.setTimeout(() => setApplyState('saved'), 600);
    window.setTimeout(() => onClose(), 1600);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-amber-600 via-amber-700 to-slate-900 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center text-white shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  Leitor de Dados Cadastrais com IA
                </h3>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-white/20 text-amber-100 border border-white/30">
                  Cartão CNPJ & Texto
                </span>
              </div>
              <p className="text-xs text-amber-100">
                Anexe o Cartão CNPJ (foto, PDF ou print) ou cole o texto do cliente para a IA ler e preencher todos os dados
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-black/20 hover:bg-black/30 flex items-center justify-center text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          <CnpjLookup initialCnpj={currentClient.document} onFound={handleCnpjFound} />

          {/* Top Options / File Upload */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Column 1: Document Upload (Cartão CNPJ) */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-amber-600" />
                  <span>Anexar Cartão CNPJ (Foto / PDF):</span>
                </label>
                <span className="text-[10px] font-medium text-slate-400">PDF, JPG, PNG até 10MB</span>
              </div>

              {!attachedDoc ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition flex-1 min-h-[140px] ${
                    isDragging
                      ? 'border-amber-500 bg-amber-50/50'
                      : 'border-slate-300 hover:border-amber-400 bg-slate-50/70 hover:bg-amber-50/30'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/jpg,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileProcess(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-2 shadow-2xs">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <span className="font-bold text-slate-800 text-xs mb-0.5">
                    Clique para selecionar ou arraste o arquivo
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Foto do celular, PDF da Receita Federal ou print do WhatsApp
                  </span>
                </div>
              ) : (
                <div className="border border-amber-300 bg-amber-50/40 rounded-xl p-3 flex flex-col justify-between flex-1 min-h-[140px]">
                  <div className="flex items-start gap-3">
                    {attachedDoc.previewUrl ? (
                      <div className="h-16 w-16 rounded-lg overflow-hidden border border-slate-200 bg-white shrink-0">
                        <img
                          src={attachedDoc.previewUrl}
                          alt="Prévia"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-16 w-16 rounded-lg bg-red-100 border border-red-200 text-red-700 flex flex-col items-center justify-center shrink-0">
                        <File className="w-6 h-6" />
                        <span className="text-[9px] font-bold uppercase mt-1">PDF</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-[11px] mb-0.5">
                        <Check className="w-3.5 h-3.5" />
                        <span>Documento pronto para leitura</span>
                      </div>
                      <p className="font-semibold text-slate-800 truncate text-xs">
                        {attachedDoc.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {formatFileSize(attachedDoc.size)} • {attachedDoc.type.split('/')[1]?.toUpperCase()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-amber-200/70 mt-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[11px] font-semibold text-amber-800 hover:text-amber-900 cursor-pointer underline"
                    >
                      Trocar documento
                    </button>
                    <button
                      type="button"
                      onClick={() => setAttachedDoc(null)}
                      className="text-[11px] font-semibold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remover</span>
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/jpg,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileProcess(e.target.files[0]);
                      }
                    }}
                  />
                </div>
              )}
            </div>

            {/* Column 2: Optional text / notes */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-bold text-slate-800 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-600" />
                  <span>Ou cole o texto enviado pelo cliente:</span>
                </label>
                <button
                  type="button"
                  onClick={() => setInputText(SAMPLE_CADASTRAL)}
                  className="text-[11px] text-amber-700 hover:text-amber-800 font-semibold hover:underline cursor-pointer"
                >
                  Usar exemplo
                </button>
              </div>
              <textarea
                value={inputText}
                onChange={(e) => { setInputText(e.target.value); if (!attachedDoc) setTextFromAi(false); }}
                placeholder="Exemplo de mensagem:
Razão Social: Indústria de Móveis Requinte Ltda
CNPJ: 14.890.123/0001-45
IE: 90812345-67
Endereço: Rua das Indústrias, 500 - Galpão 2
Curitiba - PR - CEP: 80010-000
E-mail fiscal: fiscal@cliente.com.br"
                rows={5}
                className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-800 text-xs font-mono outline-none focus:border-amber-500 focus:bg-white transition flex-1 min-h-[140px]"
              />
            </div>
          </div>

          {/* Action Trigger Button */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={handleExtractWithAi}
              disabled={isProcessing || (!inputText.trim() && !attachedDoc)}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition cursor-pointer flex items-center gap-2 shadow-xs disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {attachedDoc ? 'IA lendo Cartão CNPJ e dados...' : 'IA lendo dados cadastrais...'}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {attachedDoc ? 'Ler Cartão CNPJ com IA' : 'Ler e Extrair com IA'}
                  </span>
                </>
              )}
            </button>

            {(inputText.trim() || attachedDoc) && (
              <button
                type="button"
                onClick={() => {
                  setInputText('');
                  setAttachedDoc(null);
                  setExtractedPreview(null);
                  setStatusMessage(null);
                  setErrorMessage(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
              >
                Limpar tudo
              </button>
            )}
          </div>

          {/* Messages */}
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-xl flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {statusMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl flex items-center gap-2 text-xs font-medium">
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Extracted Preview Card */}
          {extractedPreview && (
            <div className="bg-slate-50 border border-amber-300 rounded-xl p-4 space-y-3 mt-2 shadow-xs animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>Dados Cadastrais Identificados com Sucesso:</span>
                </span>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                  Pronto para aplicar no orçamento
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
                {([
                  ['name', 'Razão Social', 'sm:col-span-2'],
                  ['tradeName', 'Nome Fantasia', ''],
                  ['document', 'CNPJ / CPF', ''],
                  ['ie', 'Inscrição Estadual (IE)', ''],
                  ['cep', 'CEP', ''],
                  ['address', 'Logradouro', 'sm:col-span-2'],
                  ['number', 'Número', ''],
                  ['complement', 'Complemento', ''],
                  ['neighborhood', 'Bairro', ''],
                  ['city', 'Cidade', ''],
                  ['state', 'UF', ''],
                  ['email', 'E-mail para NF-e', 'sm:col-span-2'],
                  ['phone', 'Telefone / WhatsApp', ''],
                ] as Array<[keyof ClientInfo, string, string]>).map(([key, label, span]) => (
                  <label key={key} className={`bg-white p-2 rounded-lg border border-slate-200 block ${span}`}>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">{label}:</span>
                    <input
                      value={(extractedPreview[key] as string) || ''}
                      onChange={(e) => updateField(key, e.target.value)}
                      className="w-full text-xs font-semibold text-slate-800 outline-none bg-transparent focus:bg-amber-50 rounded"
                    />
                  </label>
                ))}
              </div>            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirmAndApply}
            disabled={!extractedPreview || applyState !== 'idle'}
            className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition cursor-pointer flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {applyState === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>{applyState === 'saving' ? 'Salvando...' : applyState === 'saved' ? 'Salvo no orçamento!' : 'Preencher Dados no Orçamento'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
