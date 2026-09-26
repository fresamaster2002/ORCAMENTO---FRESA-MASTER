import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { QuickOrderInput } from './components/QuickOrderInput';
import { QuoteForm } from './components/QuoteForm';
import { ApiDocsModal } from './components/ApiDocsModal';
import { ProposalModal } from './components/ProposalModal';
import { BlingIntegrationModal } from './components/BlingIntegrationModal';
import { QuoteData, ClientInfo } from './types';
import { AlertTriangle, KeyRound, Sparkles, Building, CheckCircle2 } from 'lucide-react';

const INITIAL_FRESA_MASTER_QUOTE: QuoteData = {
  id: 'FM-849201',
  status: 'draft',
  createdAt: new Date().toISOString(),
  client: {
    name: 'Móveis Requinte Ltda',
    tradeName: 'Móveis Requinte CNC',
    company: 'Móveis Requinte Ltda',
    email: 'financeiro@moveisrequinte.com.br',
    phone: '(41) 98888-1234',
    document: '14.890.123/0001-45',
    ie: '90812345-67',
    cep: '80010-000',
    address: 'Rua das Indústrias Moveleiras',
    number: '500',
    complement: 'Galpão 2',
    neighborhood: 'Polo Industrial',
    city: 'Curitiba',
    state: 'PR',
  },
  project: {
    title: 'Fornecimento de Fresas Router CNC - Fresa Master',
    category: 'Ferramentas Router CNC',
    description: 'Fresas de 3 cortes TCT de alto rendimento para corte de MDF, compensado e madeira maciça.',
    deadline: '2 dias úteis (Sedex)',
    validityDays: 10,
    date: new Date().toISOString().split('T')[0],
  },
  items: [
    {
      id: 'fresa-1',
      description: 'Fresa 3 Cortes TCT 6x22mm Haste 6mm para MDF e Madeira (Widia)',
      sku: 'FM-TCT-6X22',
      ncm: '8207.70.00',
      category: 'Fresas 3 Cortes TCT',
      quantity: 2,
      unit: 'un',
      unitPrice: 140,
      totalPrice: 280,
      notes: 'Produto cadastrado no Bling ERP (FM-TCT-6X22)',
    },
  ],
  shipping: {
    originCep: '13321-472',
    destinationCep: '80010-000',
    weightKg: 0.5,
    weightDescription: '0,5 kg (padrão até 0,5 kg c/ embalagem)',
    packageDimensions: {
      height: 5,
      width: 12,
      length: 18,
    },
    insuranceEnabled: false,
    declaredValue: 280,
    insuranceAmount: 0,
    selectedOption: {
      service: 'SEDEX',
      name: 'Sedex (Melhor Envio)',
      carrier: 'Correios',
      price: 28.5,
      deliveryDays: 2,
      selected: true,
      insuranceCost: 4.2,
      withInsurancePrice: 32.7,
      withoutInsurancePrice: 28.5,
    },
    options: [
      {
        service: 'SEDEX',
        name: 'Sedex (Melhor Envio)',
        carrier: 'Correios',
        price: 28.5,
        deliveryDays: 2,
        selected: true,
        insuranceCost: 4.2,
        withInsurancePrice: 32.7,
        withoutInsurancePrice: 28.5,
      },
      {
        service: 'PAC',
        name: 'PAC (Melhor Envio)',
        carrier: 'Correios',
        price: 18.9,
        deliveryDays: 5,
        selected: false,
        insuranceCost: 4.2,
        withInsurancePrice: 23.1,
        withoutInsurancePrice: 18.9,
      },
      {
        service: 'JADLOG_PACKAGE',
        name: 'Jadlog .Package',
        carrier: 'Jadlog',
        price: 17.4,
        deliveryDays: 4,
        selected: false,
        insuranceCost: 4.2,
        withInsurancePrice: 21.6,
        withoutInsurancePrice: 17.4,
      },
      {
        service: 'RETIRADA',
        name: 'Retirada na Fresa Master',
        carrier: 'Balcão',
        price: 0,
        deliveryDays: 0,
        selected: false,
        insuranceCost: 0,
        withInsurancePrice: 0,
        withoutInsurancePrice: 0,
      },
    ],
  },
  financials: {
    subtotal: 280,
    shippingAmount: 28.5,
    discountPercentage: 0,
    discountAmount: 0,
    taxPercentage: 0,
    taxAmount: 0,
    totalAmount: 308.5,
    paymentTerms: 'À vista via Pix ou Boleto',
    paymentMethod: 'Pix',
  },
  observations: [
    'Envio via Melhor Envio com seguro de carga incluso.',
    'Ferramentas com tolerância h6 para balanceamento perfeito em alta rotação (até 24.000 RPM).',
    'Após a confirmação, envie os dados cadastrais para emissão da Nota Fiscal (NF-e).',
  ],
  notesForClient: 'Fresa Master • Especialistas em Fresas para Router CNC. Agradecemos a preferência!',
};

export default function App() {
  const [quote, setQuote] = useState<QuoteData>(INITIAL_FRESA_MASTER_QUOTE);
  const [isExtracting, setIsExtracting] = useState(false);
  const [transcribedText, setTranscribedText] = useState<string>('');
  const [summary, setSummary] = useState<string | undefined>(
    'Orçamento Fresa Master carregado com cálculo de frete Melhor Envio Sedex.'
  );
  const [missingInfo, setMissingInfo] = useState<string[] | undefined>([]);
  const [confidence, setConfidence] = useState<number | undefined>(0.98);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals
  const [isApiDocsOpen, setIsApiDocsOpen] = useState(false);
  const [isProposalOpen, setIsProposalOpen] = useState(false);
  const [isBlingOpen, setIsBlingOpen] = useState(false);

  // Dark mode theme state (default: true for dark background)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('fresa_master_dark_mode');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('fresa_master_dark_mode', String(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  const handleExtract = async (text: string) => {
    setIsExtracting(true);
    setErrorMessage(null);
    setTranscribedText(text);

    try {
      const response = await fetch('/api/quote/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          currentQuote: quote,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro ao processar o orçamento Fresa Master.');
      }

      setQuote(data.quote);
      setSummary(data.summary);
      setMissingInfo(data.missingInfo || []);
      setConfidence(data.confidence || 0.96);
    } catch (err: any) {
      console.error('Falha na extração:', err);
      setErrorMessage(err.message || 'Falha na conexão com a API de orçamento.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleNewQuote = () => {
    const newId = `FM-${Math.floor(100000 + Math.random() * 900000)}`;
    setQuote({
      ...INITIAL_FRESA_MASTER_QUOTE,
      id: newId,
      status: 'draft',
      createdAt: new Date().toISOString(),
      client: {
        name: '',
        tradeName: '',
        company: '',
        email: '',
        phone: '',
        document: '',
        ie: 'ISENTO',
        cep: '',
        address: '',
        number: '',
        complement: '',
        neighborhood: '',
        city: '',
        state: '',
      },
      items: [],
      financials: {
        subtotal: 0,
        shippingAmount: 28.5,
        discountPercentage: 0,
        discountAmount: 0,
        taxPercentage: 0,
        taxAmount: 0,
        totalAmount: 28.5,
        paymentTerms: 'À vista via Pix',
        paymentMethod: 'Pix',
      },
    });
    setSummary('Novo orçamento Fresa Master em branco iniciado.');
    setMissingInfo([]);
  };

  const handleUpdateClientFromBling = (updatedClient: ClientInfo) => {
    setQuote((prev) => ({
      ...prev,
      client: updatedClient,
    }));
  };

  return (
      <div className={`min-h-screen ${isDarkMode ? 'dark bg-[#090d16] text-slate-100' : 'bg-slate-100/70 text-slate-800'} flex flex-col font-sans antialiased transition-colors duration-200`}>
        <Header
          onOpenApiDocs={() => setIsApiDocsOpen(true)}
          onNewQuote={handleNewQuote}
          onPreviewProposal={() => setIsProposalOpen(true)}
          onOpenBlingModal={() => setIsBlingOpen(true)}
          hasItems={quote.items.length > 0}
          isApproved={quote.status === 'approved'}
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
        />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Error notification */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl text-xs flex items-center gap-2 shadow-xs">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-semibold">Erro:</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Clean Unified Quick Order Input (Voice or Text) */}
        <QuickOrderInput
          onProcess={handleExtract}
          isLoading={isExtracting}
          summary={summary}
          externalText={transcribedText}
        />

        {/* Form with CNC Tools, Shipping Calculator & Totals */}
        <QuoteForm
          quote={quote}
          onChange={(updated) => setQuote(updated)}
          onPreview={() => setIsProposalOpen(true)}
          onOpenBling={() => setIsBlingOpen(true)}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700">Fresa Master CNC</span>
            <span>•</span>
            <span>Melhor Envio & Bling ERP NF-e Integration</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsBlingOpen(true)}
              className="text-emerald-700 font-semibold hover:underline cursor-pointer"
            >
              Exportar para o Bling
            </button>
            <button
              type="button"
              onClick={() => setIsProposalOpen(true)}
              className="text-indigo-600 hover:underline cursor-pointer"
            >
              Proposta & WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setIsApiDocsOpen(true)}
              className="text-slate-600 hover:underline cursor-pointer"
            >
              API REST
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <ApiDocsModal
        isOpen={isApiDocsOpen}
        onClose={() => setIsApiDocsOpen(false)}
      />

      <ProposalModal
        isOpen={isProposalOpen}
        onClose={() => setIsProposalOpen(false)}
        quote={quote}
        onOpenBling={() => setIsBlingOpen(true)}
      />

      <BlingIntegrationModal
        isOpen={isBlingOpen}
        onClose={() => setIsBlingOpen(false)}
        quote={quote}
        onUpdateClient={handleUpdateClientFromBling}
      />
    </div>
  );
}
