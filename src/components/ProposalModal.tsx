import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../api';
import {
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

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 920,
        onclone: (clonedDocument) => {
          const clonedSheet = clonedDocument.querySelector('.printable-quote-paper');
          if (!clonedSheet) return;

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
      const margin = 8;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;
      const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
      const imgWidth = canvas.width * ratio;
      const imgHeight = canvas.height * ratio;
      const x = (pageWidth - imgWidth) / 2;
      const y = (pageHeight - imgHeight) / 2;

      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight, undefined, 'FAST');

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
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto print:max-h-none print:shadow-none print:border-none print:m-0 print:w-full">
        {/* Modal Top Bar - Hidden during printing */}
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-900 text-white print:hidden">
          <div className="flex items-center gap-3">
            <FresaMasterLogo size="sm" theme="dark" />
            <div className="pl-3 border-l border-slate-700">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  Orçamento Comercial • Fresa Master CNC
                </h3>
                <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30">
                  {quote.id}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Baixe o arquivo PDF oficial ou envie a mensagem pronta via WhatsApp
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Direct PDF Download Button */}
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition cursor-pointer shadow-xs ${
                pdfSuccess
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold'
              }`}
              title="Salva o arquivo .pdf direto no seu dispositivo"
            >
              {isDownloadingPdf ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Gerando PDF...</span>
                </>
              ) : pdfSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>PDF Salvo com Sucesso!</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Arquivo PDF</span>
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
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs - Hidden during printing */}
        <div className="flex items-center justify-between px-5 pt-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 print:hidden text-xs font-semibold">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`pb-2.5 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'preview'
                  ? 'border-amber-600 text-amber-700 dark:text-amber-400 font-bold'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Folha Timbrada do Orçamento (PDF Oficial)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('whatsapp')}
              className={`pb-2.5 px-3 border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'whatsapp'
                  ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 font-bold'
                  : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>Mensagem Formatada p/ WhatsApp</span>
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
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-100 dark:bg-slate-950/60 print:bg-white print:p-0">
          {activeTab === 'preview' ? (
            <div className="space-y-3">
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

              {/* PRINTABLE TIMBRADA EXECUTIVE A4 SHEET */}
              <div
                ref={proposalSheetRef}
                className="printable-quote-paper bg-white text-slate-900 p-8 sm:p-10 rounded-2xl border border-slate-200 shadow-sm max-w-3xl mx-auto space-y-6 font-sans print:shadow-none print:border-none print:p-0 print:max-w-none"
                style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
              >
                {/* 1. Header with Official Fresa Master Logo at the start */}
                <div className="flex justify-between items-start border-b-2 border-slate-900 pb-5">
                  <div className="space-y-1">
                    {/* Official Typographic Logo */}
                    <FresaMasterLogo size="pdf" theme="print" />

                    <div className="pt-2 text-[11px] text-slate-600 space-y-0.5">
                      <p className="font-semibold text-slate-700">
                        Fresa Master Comercial de Ferramentas de Usinagem
                      </p>
                      <p>E-mail: <strong className="font-mono text-slate-800">fresamaster0@gmail.com</strong></p>
                      <p>Expedição / Coleta: <span className="font-medium text-slate-800">Salto - SP (CEP 13321-472)</span></p>
                      <p>Classificação Fiscal Padrão: <span className="font-mono text-slate-700">NCM 8207.70.00</span></p>
                    </div>
                  </div>

                  {/* Proposal Metadata Badge */}
                  <div className="text-right shrink-0">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded bg-slate-900 text-white inline-block mb-1.5">
                      PROPOSTA COMERCIAL
                    </span>
                    <div className="font-mono text-xl font-black text-slate-950 block">
                      {quote.id}
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      Data: <strong className="text-slate-800">{new Date(quote.createdAt).toLocaleDateString('pt-BR')}</strong>
                    </div>
                    <div className="text-xs text-emerald-800 font-bold mt-0.5">
                      Validade: {quote.project.validityDays || 10} dias
                    </div>
                  </div>
                </div>

                {/* 2. Client & Delivery Details (Executive 2-Column Cards) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  {/* Client Card */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Destinatário / Cliente
                    </div>
                    <div className="font-black text-sm text-slate-900">
                      {quote.client.name || 'Cliente / Empresa'}
                    </div>
                    <div className="font-mono text-slate-700 text-[11px]">
                      CNPJ/CPF: <strong className="text-slate-900">{quote.client.document || 'A confirmar'}</strong>
                    </div>
                    <div className="text-slate-700 text-[11px]">
                      Inscrição Estadual: <strong className="text-slate-900">{quote.client.ie || 'ISENTO'}</strong>
                    </div>
                    {(quote.client.city || quote.client.state) && (
                      <div className="text-slate-700 text-[11px]">
                        Cidade/UF: {quote.client.city} / {quote.client.state}
                      </div>
                    )}
                    {quote.client.phone && (
                      <div className="text-slate-700 text-[11px]">
                        WhatsApp/Tel: {quote.client.phone}
                      </div>
                    )}
                  </div>

                  {/* Shipping & Delivery Card */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-slate-600" />
                      <span>Logística & Envio (Melhor Envio)</span>
                    </div>
                    <div className="font-bold text-sm text-slate-900">
                      {quote.shipping.selectedOption?.name || 'Correios SEDEX (Melhor Envio Oficial)'}
                    </div>
                    <div className="text-slate-700 text-[11px]">
                      Origem: Salto/SP ({quote.shipping.originCep || '13321-472'})
                    </div>
                    <div className="text-slate-700 text-[11px]">
                      Destino: CEP {quote.client.cep || quote.shipping.destinationCep || 'A confirmar'}
                    </div>
                    <div className="text-slate-700 text-[11px]">
                      Peso Tarifado: <strong className="font-mono text-slate-800">{quote.shipping.weightKg || 0.5} kg</strong>
                    </div>

                    {/* Insurance Status with Clean Badge */}
                    <div className="pt-1 flex items-center gap-1.5">
                      {quote.shipping.insuranceEnabled ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-300">
                          <ShieldCheck className="w-3 h-3 text-emerald-700" />
                          <span>Carga Segurada com Valor Declarado</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                          <ShieldAlert className="w-3 h-3 text-slate-400" />
                          <span>Envio Padrão sem Seguro Adicional</span>
                        </span>
                      )}
                    </div>

                    <div className="text-slate-800 font-semibold text-[11px] pt-0.5">
                      Prazo Previsto: {quote.project.deadline || '2 a 4 dias úteis após despacho'}
                    </div>
                  </div>
                </div>

                {/* 3. CNC Tools Table (Clean, High-Readability) */}
                <div className="space-y-2">
                  <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    Ferramental de Usinagem & Especificações Técnicas
                  </div>
                  <div className="overflow-hidden border border-slate-200 rounded-xl">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-white font-bold text-[10px] uppercase tracking-wider">
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Descrição da Ferramenta CNC</th>
                          <th className="py-2.5 px-3 w-28">SKU Bling</th>
                          <th className="py-2.5 px-3 w-24">NCM</th>
                          <th className="py-2.5 px-3 w-14 text-center">Qtd</th>
                          <th className="py-2.5 px-3 w-24 text-right">Unitário</th>
                          <th className="py-2.5 px-3 w-28 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {quote.items.map((item, idx) => (
                          <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'}>
                            <td className="py-2.5 px-3 text-slate-400 font-mono text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-slate-900 block leading-tight">
                                {item.description}
                              </span>
                              {item.notes && (
                                <span className="text-[10px] text-slate-500 block mt-0.5">
                                  {item.notes}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                              {item.sku || 'FM-TCT'}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                              {item.ncm || '8207.70.00'}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-slate-900">
                              {item.quantity}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                              {item.unitPrice.toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                              {item.totalPrice.toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 4. Totals Breakdown & Commercial Conditions */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 pt-2 border-t border-slate-200">
                  {/* Left: Payment Terms & Pix */}
                  <div className="sm:col-span-7 space-y-2 text-xs">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                      Condições Comerciais & Pagamento
                    </div>
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-amber-600" />
                        <span className="font-bold text-slate-900">
                          {quote.financials.paymentTerms || 'À vista via Pix ou Boleto'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-700">
                        Chave Pix Oficial:{' '}
                        <strong className="font-mono text-slate-950 bg-white px-2 py-0.5 rounded border border-slate-200">
                          fresamaster0@gmail.com
                        </strong>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-tight">
                        <strong>Faturamento NF-e:</strong> A Nota Fiscal Eletrônica é emitida diretamente via Bling ERP com chave de acesso acompanhando o DANFE na caixa de despacho.
                      </p>
                    </div>
                  </div>

                  {/* Right: Transparent Totals Table */}
                  <div className="sm:col-span-5 space-y-2 text-xs">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider text-right">
                      Fechamento do Pedido
                    </div>

                    <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="flex justify-between text-slate-600">
                        <span>Subtotal Ferramentas:</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {quote.financials.subtotal.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>

                      <div className="flex justify-between text-slate-600">
                        <span>
                          Frete ({quote.shipping.selectedOption?.service || 'Sedex'}):
                        </span>
                        <span className="font-mono font-semibold text-slate-900">
                          {(quote.financials.shippingAmount || 0).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>

                      {Boolean(quote.shipping.insuranceEnabled && (quote.financials.insuranceAmount || 0) > 0) && (
                        <div className="flex justify-between text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <span className="flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            <span>Seguro de Carga:</span>
                          </span>
                          <span className="font-mono">
                            + {(quote.financials.insuranceAmount || 0).toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                        </div>
                      )}

                      {quote.financials.discountAmount > 0 && (
                        <div className="flex justify-between text-rose-600 font-semibold">
                          <span>Desconto Comercial:</span>
                          <span className="font-mono">
                            -{' '}
                            {quote.financials.discountAmount.toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </span>
                        </div>
                      )}

                      <div className="pt-2 border-t-2 border-slate-900 flex justify-between items-baseline">
                        <span className="font-black text-sm text-slate-950 uppercase">
                          TOTAL DO PEDIDO:
                        </span>
                        <span className="font-mono font-black text-lg text-slate-950">
                          {quote.financials.totalAmount.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. Clean Institutional Footer */}
                <div className="pt-4 border-t border-slate-200 text-center space-y-1">
                  <p className="text-[11px] font-semibold text-slate-700">
                    Fresa Master • Ferramentas de Alta Precisão para Router CNC
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Salto/SP • E-mail fresamaster0@gmail.com • Garantia técnica contra defeitos de fabricação
                  </p>
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
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Fresa Master CNC</span>
            <span>•</span>
            <span>Melhor Envio & Bling ERP</span>
          </div>

          <div className="flex items-center gap-2">
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
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-300 transition cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
