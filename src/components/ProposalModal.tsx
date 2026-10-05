import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../api';
import {
  ArrowLeft,
  X,
  Printer,
  Download,
  Send,
  Copy,
  Check,
  MessageSquare,
  Building,
  Truck,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  CreditCard,
  FileText,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Info,
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { QuoteData } from '../types';
import { FresaMasterLogo } from './FresaMasterLogo';

interface ProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: QuoteData;
  onOpenBling?: () => void;
}

const PIX_KEY = '59.085.330/0001-70';

const money = (value: number) =>
  (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const convertUnsupportedColorToRgb = (color: string) => {
  const oklch = color.match(/^oklch\(\s*([\d.]+)(%)?\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+)(%)?)?\s*\)$/i);
  const oklab = color.match(/^oklab\(\s*([\d.]+)(%)?\s+(-?[\d.]+)\s+(-?[\d.]+)(?:\s*\/\s*([\d.]+)(%)?)?\s*\)$/i);
  if (!oklch && !oklab) return '#000000';

  const match = oklch || oklab!;
  const lightness = Number(match[1]) / (match[2] ? 100 : 1);
  const a = oklch
    ? Number(match[3]) * Math.cos((Number(match[4]) * Math.PI) / 180)
    : Number(match[3]);
  const b = oklch
    ? Number(match[3]) * Math.sin((Number(match[4]) * Math.PI) / 180)
    : Number(match[4]);
  const l = Math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3);
  const toSrgb = (value: number) => {
    const linear = Math.max(0, Math.min(1, value));
    const encoded = linear <= 0.0031308
      ? linear * 12.92
      : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
    return Math.round(encoded * 255);
  };
  const red = toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  const alpha = match[5]
    ? Number(match[5]) / (match[6] ? 100 : 1)
    : undefined;

  return alpha === undefined
    ? `rgb(${red}, ${green}, ${blue})`
    : `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

export const ProposalModal: React.FC<ProposalModalProps> = ({
  isOpen,
  onClose,
  quote,
  onOpenBling,
}) => {
  const [activeTab, setActiveTab] = useState<'preview' | 'whatsapp'>('preview');
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfSuccess, setPdfSuccess] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pixCopied, setPixCopied] = useState(false);

  const proposalSheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      generateProposalText();
    }
  }, [isOpen, quote]);

  const generateProposalText = async () => {
    setIsGenerating(true);
    try {
      const res = await apiFetch('/api/quote/generate-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote,
          channel: 'whatsapp',
          tone: 'friendly',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setWhatsappMessage(data.messageText);
      }
    } catch (err) {
      console.error('Erro ao gerar proposta:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  // Direct PDF Download using html2canvas and jsPDF
  const handleDownloadPdf = async () => {
    if (!proposalSheetRef.current || isDownloadingPdf) return;

    setIsDownloadingPdf(true);
    setPdfSuccess(false);
    setPdfError(false);

    try {
      const element = proposalSheetRef.current;
      const pixHolder: { box: { x: number; y: number; w: number; h: number } | null } = { box: null };

      const canvas = await html2canvas(element, {
        scale: 4,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 920,
        onclone: (clonedDocument) => {
          const clonedSheet = clonedDocument.querySelector('.printable-quote-paper');
          if (!clonedSheet) return;

          const clonedPix = clonedSheet.querySelector('[data-pix-key]');
          if (clonedPix) {
            const sheetRect = clonedSheet.getBoundingClientRect();
            const pixRect = clonedPix.getBoundingClientRect();
            if (sheetRect.width > 0 && sheetRect.height > 0) {
              pixHolder.box = {
                x: (pixRect.left - sheetRect.left) / sheetRect.width,
                y: (pixRect.top - sheetRect.top) / sheetRect.height,
                w: pixRect.width / sheetRect.width,
                h: pixRect.height / sheetRect.height,
              };
            }
          }

          const elements = [clonedSheet, ...Array.from(clonedSheet.querySelectorAll('*'))];

          for (const element of elements) {
            const computedStyle = clonedDocument.defaultView?.getComputedStyle(element);
            if (!computedStyle) continue;

            for (let index = 0; index < computedStyle.length; index += 1) {
              const property = computedStyle.item(index);
              const isCustomProperty = property.startsWith('--');
              if (isCustomProperty && element !== clonedSheet) continue;

              const isColorProperty = isCustomProperty || /color$/i.test(property) || property === 'fill' || property === 'stroke';
              if (!isColorProperty) continue;

              const value = computedStyle.getPropertyValue(property);
              if (!/oklch\(|oklab\(/i.test(value)) continue;

              const normalizedValue = value.replace(/oklch\([^)]*\)|oklab\([^)]*\)/gi, convertUnsupportedColorToRgb);
              element.setAttribute('style', `${element.getAttribute('style') || ''};${property}:${normalizedValue} !important`);
            }
          }
        },
      });

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 3;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;
      const ratio = maxWidth / canvas.width;
      const imgWidth = maxWidth;
      const imgHeight = canvas.height * ratio;

      if (imgHeight <= maxHeight) {
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, imgWidth, imgHeight, undefined, 'FAST');
      } else {
        const sliceHeightPx = Math.floor(maxHeight / ratio);
        for (let offset = 0, page = 0; offset < canvas.height; offset += sliceHeightPx, page += 1) {
          const currentHeight = Math.min(sliceHeightPx, canvas.height - offset);
          const slice = document.createElement('canvas');
          slice.width = canvas.width;
          slice.height = currentHeight;
          const ctx = slice.getContext('2d');
          if (!ctx) continue;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, slice.width, slice.height);
          ctx.drawImage(canvas, 0, offset, canvas.width, currentHeight, 0, 0, canvas.width, currentHeight);
          if (page > 0) pdf.addPage();
          pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, imgWidth, currentHeight * ratio, undefined, 'FAST');
        }
      }

      // Camada de texto invisível sobre a chave Pix para permitir selecionar/copiar no PDF
      const pixBox = pixHolder.box;
      if (pixBox) {
        const yMm = pixBox.y * imgHeight;
        const pageIndex = imgHeight <= maxHeight ? 0 : Math.floor(yMm / maxHeight);
        const yInPage = imgHeight <= maxHeight ? yMm : yMm - pageIndex * maxHeight;
        const boxHeightMm = pixBox.h * imgHeight;
        pdf.setPage(pageIndex + 1);
        pdf.setFontSize(Math.max(6, boxHeightMm * 2.2));
        pdf.text(PIX_KEY, margin + pixBox.x * imgWidth, margin + yInPage + boxHeightMm * 0.75, { renderingMode: 'invisible' });
      }
      const fileName = `Orcamento_${quote.id || 'FM'}_Fresa_Master.pdf`;
      const pdfBlob = pdf.output('blob');
      const url = URL.createObjectURL(pdfBlob);

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setPdfSuccess(true);
      setTimeout(() => setPdfSuccess(false), 5000);
    } catch (error) {
      console.error('Erro ao gerar arquivo PDF:', error);
      setPdfSuccess(false);
      setPdfError(true);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(whatsappMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenWhatsApp = () => {
    const cleanPhone = (quote.client.phone || '').replace(/\D/g, '');
    const encoded = encodeURIComponent(whatsappMessage);
    const url = cleanPhone
      ? `https://wa.me/55${cleanPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-0 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-white dark:bg-slate-900 sm:rounded-2xl max-w-4xl w-full h-[100dvh] sm:h-auto sm:max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto print:max-h-none print:shadow-none print:border-none print:m-0 print:w-full">
        {/* Modal Top Bar - Hidden during printing */}
        <div className="px-3 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 bg-slate-900 text-white print:hidden shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="sm:hidden inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold rounded-lg bg-white/10 text-white cursor-pointer shrink-0"
              aria-label="Voltar para o orçamento"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar</span>
            </button>
            <div className="hidden sm:block"><FresaMasterLogo size="sm" theme="dark" /></div>
            <div className="sm:pl-3 sm:border-l border-slate-700 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white truncate">
                  <span className="hidden sm:inline">Orçamento Comercial • Fresa Master CNC</span><span className="sm:hidden">Orçamento</span>
                </h3>
                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                  {quote.id}
                </span>
              </div>
              <p className="hidden sm:block text-[11px] text-slate-400">
                Baixe o arquivo PDF oficial ou envie a mensagem pronta via WhatsApp
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Direct PDF Download Button */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className={`inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer shadow-xs ${
                pdfSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold'
              }`}
              title="Salva o arquivo .pdf direto no seu dispositivo"
            >
              {isDownloadingPdf ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Gerando...</span>
                </>
              ) : pdfSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>PDF salvo!</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span><span className="hidden sm:inline">Baixar Arquivo </span>PDF</span>
                </>
              )}
            </button>

            {/* Print Fallback */}
            <button
              type="button"
              onClick={handlePrint}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              title="Abrir tela de impressão do navegador"
            >
              <Printer className="w-3.5 h-3.5 text-slate-300" />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="hidden sm:block p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs - Hidden during printing */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 shrink-0 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 print:hidden text-xs font-semibold">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-200/80 dark:bg-slate-950/70 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`py-2 px-3 sm:px-4 flex-1 sm:flex-none justify-center rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'preview'
                  ? 'bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 font-bold shadow-sm ring-1 ring-amber-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span><span className="hidden sm:inline">Folha Timbrada do Orçamento (PDF Oficial)</span><span className="sm:hidden">Folha do PDF</span></span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('whatsapp')}
              className={`py-2 px-3 sm:px-4 flex-1 sm:flex-none justify-center rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'whatsapp'
                  ? 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-400 font-bold shadow-sm ring-1 ring-emerald-500/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span><span className="hidden sm:inline">Mensagem Formatada p/ WhatsApp</span><span className="sm:hidden">WhatsApp</span></span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 hidden sm:block">
            {pdfError ? (
              <span className="text-red-700 dark:text-red-400 font-medium">
                Não foi possível gerar o PDF. Tente novamente.
              </span>
            ) : activeTab === 'preview' && (
              <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                ✓ Pronto para download em formato A4
              </span>
            )}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-8 overflow-y-auto flex-1 bg-slate-100 dark:bg-slate-950/60 print:bg-white print:p-0">
          {activeTab === 'preview' ? (
            <div className="space-y-4 sm:space-y-5">
              {/* Helpful notification banner */}
              <div className="max-w-3xl mx-auto bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs print:hidden">
                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Clique em <strong>"Baixar Arquivo PDF"</strong> para salvar o documento timbrado pronto para anexar na conversa com seu cliente.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isDownloadingPdf}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-[11px] transition cursor-pointer shrink-0"
                >
                  {isDownloadingPdf ? 'Baixando...' : 'Baixar PDF Agora'}
                </button>
              </div>

              {/* FOLHA TIMBRADA A4 - cores fixas, imune ao modo escuro */}
              <div
                ref={proposalSheetRef}
                className="printable-quote-paper bg-[#ffffff] text-[#0f172a] rounded-xl border-2 border-[#f59e0b] shadow-[0_0_0_4px_rgba(245,158,11,0.18),0_12px_32px_rgba(15,23,42,0.35)] max-w-3xl mx-auto font-sans overflow-hidden print:shadow-none print:border-none print:max-w-none"
                style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
              >
                <div className="h-2" style={{ backgroundImage: 'linear-gradient(90deg, #ff6a00 0%, #ff8a1f 60%, #f59e0b 100%)' }} />
                <div className="relative overflow-hidden bg-[#0b1220] border-b-4 border-[#ff6a00] px-6 py-4 sm:px-10 sm:py-5" style={{ backgroundColor: '#0b1220', backgroundImage: 'linear-gradient(100deg, #070b14 0%, #0f172a 38%, #1f2937 68%, #4b5563 100%)', color: '#f8fafc' }}>
                  <div aria-hidden="true" className="absolute top-0 bottom-0 right-[35%] w-3 bg-[#ff6a00]" style={{ boxShadow: '0 0 16px 2px rgba(255,106,0,0.85)', transform: 'skewX(-22deg)' }} />
                  <div aria-hidden="true" className="absolute top-0 bottom-0 right-[32%] w-1 bg-[#ff8a1f]" style={{ boxShadow: '0 0 10px rgba(255,138,31,0.8)', transform: 'skewX(-22deg)' }} />
                  <div aria-hidden="true" className="absolute top-0 bottom-0 right-[30%] w-0.5 bg-[#ffa94d]" style={{ boxShadow: '0 0 8px rgba(255,169,77,0.8)', transform: 'skewX(-22deg)' }} />
                  <div className="relative flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div className="space-y-1.5">
                      <FresaMasterLogo size="pdf" theme="dark" />
                      <div className="text-[13px] text-[#cbd5e1] leading-snug">
                        <p className="font-semibold text-[#f8fafc]">Ferramentas de Alta Precisão para Router CNC</p>
                        <p>fresamaster0@gmail.com</p>
                        <p>CNPJ 59.085.330/0001-70</p>
                        <p>(11) 99852-4939</p>
                        <p>Salto/SP • CEP 13329-350</p>
                      </div>
                    </div>
                    <div className="sm:text-right shrink-0">
                      <div style={{ display: 'inline-block', width: '210px', height: '32px', lineHeight: '18px', textAlign: 'center', borderRadius: '4px', backgroundColor: '#ff6a00', color: '#0b1220', fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', textIndent: '0.12em' }}>Proposta Comercial</div>
                      <div className="font-mono text-3xl font-black text-[#f8fafc] mt-1">{quote.id}</div>
                      <div className="text-[13px] text-[#cbd5e1]">
                        Emissão: <strong className="text-[#f8fafc]">{new Date(quote.createdAt).toLocaleDateString('pt-BR')}</strong>
                      </div>
                      <div className="text-[13px] font-bold text-[#34d399]">
                        Válida por {quote.project.validityDays || 10} dias
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-6 sm:p-10 space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div className="p-4 rounded-lg border-2 border-[#cbd5e1] bg-[#f8fafc] shadow-sm border-l-4 border-l-[#f59e0b] space-y-1">
                      <div className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Cliente</div>
                      <div className="font-black text-base text-[#0f172a]">{quote.client.name || 'Cliente / Empresa'}</div>
                      <div className="text-[13px] text-[#334155]">
                        CNPJ/CPF: <strong className="font-mono text-[#0f172a]">{quote.client.document || 'A confirmar'}</strong>
                      </div>
                      <div className="text-[13px] text-[#334155]">
                        Inscrição Estadual: <strong className="text-[#0f172a]">{quote.client.ie || 'ISENTO'}</strong>
                      </div>
                      {(quote.client.city || quote.client.state) && (
                        <div className="text-[13px] text-[#334155]">
                          {quote.client.city}{quote.client.city && quote.client.state ? ' / ' : ''}{quote.client.state}
                        </div>
                      )}
                      {quote.client.phone && (
                        <div className="text-[13px] text-[#334155]">Contato: {quote.client.phone}</div>
                      )}
                    </div>

                    <div className="p-4 rounded-lg border-2 border-[#cbd5e1] bg-[#f8fafc] shadow-sm border-l-4 border-l-[#0f172a] space-y-1">
                      <div className="text-xs font-bold text-[#64748b] uppercase tracking-wider flex items-center gap-1">
                        <Truck className="w-4 h-4 text-[#475569]" />
                        <span>Entrega</span>
                      </div>
                      <div className="font-black text-lg text-[#0f172a]">
                        {quote.shipping.selectedOption?.name || 'A combinar'}
                      </div>
                      <div className="text-[13px] text-[#334155]">
                        Destino: CEP {quote.client.cep || quote.shipping.destinationCep || 'A confirmar'}
                      </div>
                      <div className="text-[13px] text-[#334155]">
                        Peso estimado: <strong className="font-mono text-[#0f172a]">{quote.shipping.weightKg || 0.5} kg</strong>
                      </div>
                      <div className="text-[13px] text-[#334155]">
                        Prazo: <strong className="text-[#0f172a]">{quote.project.deadline || '2 a 4 dias úteis após despacho'}</strong>
                      </div>
                      <div className="pt-0.5">
                        {quote.shipping.insuranceEnabled ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-[#065f46] bg-[#d1fae5] px-2 py-0.5 rounded">
                            <ShieldCheck className="w-3 h-3" />
                            <span>Carga segurada</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-[#64748b]">
                            <ShieldAlert className="w-3 h-3" />
                            <span>Sem seguro adicional</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs uppercase font-bold text-[#64748b] tracking-wider">Itens da proposta</div>
                    <div className="overflow-hidden border-2 border-[#0f172a] rounded-lg">
                      <table className="w-full text-sm text-left border-collapse">
                        <thead>
                          <tr className="bg-[#0f172a] text-[#ffffff] font-bold text-xs uppercase tracking-wider">
                            <th className="py-3 px-3 w-10">#</th>
                            <th className="py-3 px-3">Descrição</th>
                            <th className="py-3 px-3 w-24 hidden sm:table-cell">NCM</th>
                            <th className="py-3 px-3 w-12 text-center">Qtd</th>
                            <th className="py-2.5 px-2 sm:px-3 w-24 sm:w-28 text-right">Unitário</th>
                            <th className="py-2.5 px-2 sm:px-3 w-28 sm:w-32 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quote.items.map((item, idx) => (
                            <tr
                              key={idx}
                              className="border-t border-[#e2e8f0]"
                              style={{ backgroundColor: idx % 2 === 1 ? '#f8fafc' : '#ffffff' }}
                            >
                              <td className="py-3 px-3 text-[#94a3b8] font-mono text-[13px]">{idx + 1}</td>
                              <td className="py-3 px-3">
                                <span className="font-bold text-[#0f172a] block leading-tight">{item.description}</span>
                                <span className="text-xs text-[#64748b] block mt-0.5 font-mono">
                                  SKU {item.sku || 'FM-TCT'}
                                </span>
                                {item.notes && <span className="text-xs text-[#64748b] block">{item.notes}</span>}
                              </td>
                              <td className="py-3 px-3 font-mono text-[13px] text-[#475569] hidden sm:table-cell">{item.ncm || '8207.70.00'}</td>
                              <td className="py-3 px-3 text-center font-bold text-[#0f172a]">{item.quantity}</td>
                              <td className="py-3 px-3 text-right font-mono text-[#334155]">{money(item.unitPrice)}</td>
                              <td className="py-3 px-3 text-right font-mono font-bold text-[#0f172a]">{money(item.totalPrice)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 text-sm">
                    <div className="sm:col-span-7 space-y-2">
                      <div className="text-xs uppercase font-bold text-[#64748b] tracking-wider">Pagamento</div>
                      <div className="p-4 rounded-lg border-2 border-[#cbd5e1] bg-[#f8fafc] shadow-sm space-y-2">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-5 h-5 text-[#d97706]" />
                          <span className="font-bold text-[#0f172a]">
                            Pix ou link de pagamento com cartão de crédito
                          </span>
                        </div>
                        <div className="text-[13px] text-[#334155]">
                          Chave Pix (CNPJ):{' '}
                          <strong data-pix-key className="font-mono text-[#0f172a] bg-[#ffffff] px-2 py-0.5 rounded border border-[#e2e8f0]">
                            {PIX_KEY}
                          </strong>
                          <button
                            type="button"
                            data-html2canvas-ignore="true"
                            onClick={() => {
                              navigator.clipboard.writeText(PIX_KEY);
                              setPixCopied(true);
                              setTimeout(() => setPixCopied(false), 2000);
                            }}
                            className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#f59e0b] text-[#0f172a] font-bold text-xs cursor-pointer hover:bg-[#d97706] print:hidden"
                          >
                            {pixCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{pixCopied ? 'Copiado!' : 'Copiar'}</span>
                          </button>
                        </div>
                        <p className="text-xs text-[#64748b] leading-snug">
                          Pagamento via cartão de crédito é feito por link e possui juros.
                        </p>
                      </div>
                    </div>

                    <div className="sm:col-span-5 space-y-2">
                      <div className="text-xs uppercase font-bold text-[#64748b] tracking-wider sm:text-right">Resumo</div>
                      <div className="space-y-1.5 p-4 rounded-lg bg-[#f8fafc] border-2 border-[#cbd5e1]">
                        <div className="flex justify-between text-[#475569]">
                          <span>Ferramentas</span>
                          <span className="font-mono font-semibold text-[#0f172a]">{money(quote.financials.subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-[#475569]">
                          <span>Frete ({quote.shipping.selectedOption?.service || 'Envio'})</span>
                          <span className="font-mono font-semibold text-[#0f172a]">{money(quote.financials.shippingAmount || 0)}</span>
                        </div>
                        {Boolean(quote.shipping.insuranceEnabled && (quote.financials.insuranceAmount || 0) > 0) && (
                          <div className="flex justify-between text-[#065f46]">
                            <span>Seguro de carga</span>
                            <span className="font-mono font-semibold">+ {money(quote.financials.insuranceAmount || 0)}</span>
                          </div>
                        )}
                        {quote.financials.discountAmount > 0 && (
                          <div className="flex justify-between text-[#e11d48] font-semibold">
                            <span>Desconto</span>
                            <span className="font-mono">- {money(quote.financials.discountAmount)}</span>
                          </div>
                        )}
                        <div className="mt-2 -mx-4 -mb-4 px-4 py-3 bg-[#0f172a] rounded-b-lg flex justify-between items-baseline">
                          <span className="font-black text-[13px] uppercase tracking-wider text-[#fcd34d]">Total</span>
                          <span className="font-mono font-black text-2xl text-[#ffffff]">{money(quote.financials.totalAmount)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t-2 border-[#f59e0b] text-center space-y-0.5">
                    <p className="text-[13px] font-semibold text-[#334155]">Obrigado pela preferência! • Fresa Master CNC</p>
                    <p className="text-xs text-[#94a3b8]">
                      CNPJ 59.085.330/0001-70 • fresamaster0@gmail.com • Salto/SP • Garantia contra defeitos de fabricação
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* WhatsApp Tab */
            <div className="max-w-2xl mx-auto space-y-4 text-xs">
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-emerald-600" />
                    <span>Texto Comercial Formatado para WhatsApp</span>
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold transition cursor-pointer flex items-center gap-1 text-xs"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copied ? 'Copiado!' : 'Copiar Texto'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenWhatsApp}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition cursor-pointer flex items-center gap-1.5 text-xs shadow-xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Abrir no WhatsApp</span>
                    </button>
                  </div>
                </div>

                <textarea
                  rows={14}
                  value={whatsappMessage}
                  onChange={(e) => setWhatsappMessage(e.target.value)}
                  className="w-full p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-200 outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="text-emerald-900 dark:text-emerald-300 text-xs">
                  <strong>Fluxo Recomendado:</strong> Baixe o arquivo PDF e anexe diretamente na conversa de WhatsApp com seu cliente junto ao texto de apresentação.
                </div>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="shrink-0 px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar PDF p/ Anexar</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Bar - Hidden during printing */}
        <div className="px-3 sm:px-5 py-3 shrink-0 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between print:hidden">
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Fresa Master CNC</span>
            <span>•</span>
            <span>Melhor Envio & Bling ERP</span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition cursor-pointer flex items-center gap-1.5"
            >
              {isDownloadingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{isDownloadingPdf ? 'Processando...' : 'Salvar PDF'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-300 transition cursor-pointer inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao orçamento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
