import React, { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { apiFetch } from './api';
import { Header } from './components/Header';
import { AuthGate } from './components/AuthGate';
import { QuickOrderInput } from './components/QuickOrderInput';
import { QuoteForm } from './components/QuoteForm';
import { ApiDocsModal } from './components/ApiDocsModal';
import { ProposalModal } from './components/ProposalModal';
import { BlingIntegrationModal } from './components/BlingIntegrationModal';
import { SandboxShipmentModal } from './components/SandboxShipmentModal';
import { SavedQuotesModal } from './components/SavedQuotesModal';
import { QuoteData, ClientInfo } from './types';
import { BLING_FRESA_MASTER_CATALOG } from './blingCatalog';
import { AlertTriangle, KeyRound, Sparkles, Building, CheckCircle2, Truck } from 'lucide-react';
import { allowedAdminEmail, isSupabaseConfigured, supabase } from './supabase';
import { extractCepFromText, extractDiscountAmountFromText, extractUnitPricesFromText, extractMotoboyPriceFromText, extractQuantityFromText } from './quoteParsing';

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
    originCep: '13329-350',
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

const nextQuoteId = (existingIds: string[]): string => {
  const highest = existingIds.reduce((max, id) => {
    const match = /^FM-(\d{1,4})$/.exec(id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `FM-${String(highest + 1).padStart(3, '0')}`;
};

const createEmptyQuote = (existingIds: string[] = []): QuoteData => ({
  ...INITIAL_FRESA_MASTER_QUOTE,
  id: nextQuoteId(existingIds),
  status: 'draft',
  createdAt: new Date().toISOString(),
  client: {
    name: '', tradeName: '', company: '', email: '', phone: '', document: '', ie: 'ISENTO',
    cep: '', address: '', number: '', complement: '', neighborhood: '', city: '', state: '',
  },
  project: { ...INITIAL_FRESA_MASTER_QUOTE.project, description: '', deadline: '', date: new Date().toISOString().split('T')[0] },
  items: [],
  shipping: {
    ...INITIAL_FRESA_MASTER_QUOTE.shipping,
    destinationCep: '',
    selectedOption: undefined,
    options: INITIAL_FRESA_MASTER_QUOTE.shipping.options.map((option) => ({ ...option, selected: false })),
  },
  financials: {
    ...INITIAL_FRESA_MASTER_QUOTE.financials,
    subtotal: 0,
    shippingAmount: 0,
    insuranceAmount: 0,
    discountAmount: 0,
    taxAmount: 0,
    totalAmount: 0,
  },
  observations: [],
  notesForClient: '',
});

const normalizeSavedQuote = (value: unknown): QuoteData | null => {
  if (!value || typeof value !== 'object') return null;

  const saved = value as Record<string, any>;
  if (typeof saved.id !== 'string' || !saved.id) return null;

  const defaults = createEmptyQuote();
  const items = (Array.isArray(saved.items) ? saved.items : []).map((item: Record<string, any>, index: number) => {
    const quantity = Number(item.quantity) || 1;
    const unitPrice = Number(item.unitPrice) || 0;
    return {
      ...item,
      id: String(item.id || `saved-item-${index}`),
      description: String(item.description || ''),
      sku: String(item.sku || ''),
      ncm: String(item.ncm || '8207.70.00'),
      category: String(item.category || 'Fresas Router CNC'),
      quantity,
      unit: String(item.unit || 'un'),
      unitPrice,
      totalPrice: Number(item.totalPrice ?? quantity * unitPrice),
    };
  });

  const savedShipping = saved.shipping && typeof saved.shipping === 'object' ? saved.shipping : {};
  const legacyServiceByMode: Record<string, string> = {
    SEDEX: 'SEDEX',
    PAC: 'PAC',
    RETIRADA: 'RETIRADA',
    MOTOBOY: 'MOTOBOY',
  };
  const legacyService = legacyServiceByMode[String(saved.shippingMode || '').toUpperCase()];
  const selectedOption = savedShipping.selectedOption || (legacyService ? {
    service: legacyService,
    name: String(saved.shippingMode),
    carrier: legacyService === 'MOTOBOY' ? 'Motoboy' : legacyService === 'RETIRADA' ? 'Balcão' : 'Correios',
    price: Number(saved.shippingValue) || 0,
    deliveryDays: 0,
    selected: true,
    insuranceCost: 0,
    withInsurancePrice: Number(saved.shippingValue) || 0,
    withoutInsurancePrice: Number(saved.shippingValue) || 0,
  } : undefined);
  const shippingOptions = Array.isArray(savedShipping.options)
    ? savedShipping.options.map((option: Record<string, any>) => ({
        ...option,
        selected: option.service === selectedOption?.service,
      }))
    : defaults.shipping.options.map((option) => ({
        ...option,
        selected: option.service === selectedOption?.service,
      }));
  if (selectedOption && !shippingOptions.some((option: { service: string }) => option.service === selectedOption.service)) {
    shippingOptions.push(selectedOption);
  }

  const subtotal = Number(saved.financials?.subtotal ?? items.reduce((sum: number, item: QuoteData['items'][number]) => sum + item.totalPrice, 0));
  const shippingAmount = Number(saved.financials?.shippingAmount ?? selectedOption?.price ?? 0);

  return {
    ...defaults,
    ...saved,
    id: saved.id,
    status: ['draft', 'sent', 'approved', 'rejected'].includes(saved.status) ? saved.status : 'draft',
    createdAt: String(saved.createdAt || new Date().toISOString()),
    client: {
      ...defaults.client,
      ...(saved.client || {}),
      name: String(saved.client?.name ?? saved.clientName ?? ''),
      email: String(saved.client?.email ?? saved.clientEmail ?? ''),
      cep: String(saved.client?.cep ?? saved.cep ?? ''),
    },
    project: { ...defaults.project, ...(saved.project || {}) },
    items,
    shipping: {
      ...defaults.shipping,
      ...savedShipping,
      destinationCep: String(savedShipping.destinationCep ?? saved.cep ?? defaults.shipping.destinationCep),
      packageDimensions: { ...defaults.shipping.packageDimensions, ...(savedShipping.packageDimensions || {}) },
      selectedOption,
      options: shippingOptions,
    },
    financials: {
      ...defaults.financials,
      ...(saved.financials || {}),
      subtotal,
      shippingAmount,
      totalAmount: Number(saved.financials?.totalAmount ?? subtotal + shippingAmount),
    },
    observations: Array.isArray(saved.observations) ? saved.observations : defaults.observations,
    notesForClient: String(saved.notesForClient ?? saved.notes ?? defaults.notesForClient),
  };
};

const buildLocalQuoteFallback = (text: string, currentQuote: QuoteData) => {
  const cep = extractCepFromText(text) || currentQuote.client.cep || '';
  const prices = extractUnitPricesFromText(text);
  const spokenDiscount = extractDiscountAmountFromText(text);
  const motoboyPrice = extractMotoboyPriceFromText(text);

  const nextQuote: QuoteData = {
    ...currentQuote,
    client: {
      ...currentQuote.client,
      cep,
    },
    shipping: {
      ...currentQuote.shipping,
      destinationCep: cep || currentQuote.shipping.destinationCep,
      selectedOption: motoboyPrice !== null
        ? {
            service: 'MOTOBOY',
            name: `Motoboy ${motoboyPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
            carrier: 'Motoboy',
            price: motoboyPrice,
            deliveryDays: 1,
            selected: true,
            insuranceCost: 0,
            withInsurancePrice: motoboyPrice,
            withoutInsurancePrice: motoboyPrice,
          }
        : currentQuote.shipping.selectedOption,
    },
  };

  const basePrice = prices[0] ?? currentQuote.items[0]?.unitPrice ?? 0;
  const quantity = extractQuantityFromText(text) || currentQuote.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 1;

  if (basePrice > 0 && quantity > 0) {
    nextQuote.items = nextQuote.items.length
      ? nextQuote.items.map((item) => ({
          ...item,
          quantity,
          unitPrice: basePrice,
          totalPrice: Number((basePrice * quantity).toFixed(2)),
        }))
      : [{
          id: `fallback-${Date.now()}`,
          description: 'Produto local (fallback sem IA)',
          sku: 'LOCAL-FALLBACK',
          ncm: '8207.70.00',
          category: 'Fresas / Ferramentas',
          quantity,
          unit: 'un',
          unitPrice: basePrice,
          totalPrice: Number((basePrice * quantity).toFixed(2)),
          notes: 'Item incluído localmente porque a integração externa não está ativa.',
        }];

    const subtotal = nextQuote.items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);
    const discountPercentage = 0;
    const discountAmount = Math.min(subtotal, spokenDiscount ?? 0);
    nextQuote.financials = {
      ...nextQuote.financials,
      subtotal,
      discountAmount,
      discountPercentage,
      totalAmount: Math.max(0, subtotal - discountAmount + (nextQuote.shipping.selectedOption?.price || 0) + Number(nextQuote.financials.insuranceAmount || 0)),
      shippingAmount: nextQuote.shipping.selectedOption?.price || 0,
    };
  }

  const summary = motoboyPrice !== null
    ? `Orçamento local montado com CEP ${cep || 'não informado'} e frete por motoboy estimado em ${motoboyPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`
    : `Orçamento local montado com CEP ${cep || 'não informado'} sem integração externa ativa.`;

  return {
    quote: nextQuote,
    summary,
    missingInfo: cep ? [] : ['CEP do cliente'],
    confidence: 0.7,
  };
};

export default function App() {
  const [quote, setQuote] = useState<QuoteData>(INITIAL_FRESA_MASTER_QUOTE);
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(isSupabaseConfigured);
  const [isCloudReady, setIsCloudReady] = useState(!isSupabaseConfigured);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState(allowedAdminEmail);
  const [authPassword, setAuthPassword] = useState('');
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [recentQuotes, setRecentQuotes] = useState<QuoteData[]>([]);
  const [cloudSaveState, setCloudSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
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
  const [isSandboxShipmentOpen, setIsSandboxShipmentOpen] = useState(false);
  const [isSavedQuotesOpen, setIsSavedQuotesOpen] = useState(false);

  // Dark mode theme state (default: true for dark background)
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('fresa_master_dark_mode');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user || null;
      setSupabaseUser(user);
      setIsCloudReady(!user);
      setIsPasswordRecovery(event === 'PASSWORD_RECOVERY');
      setIsAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    if (!supabaseUser) {
      setRecentQuotes([]);
      setIsCloudReady(true);
      return;
    }

    if (supabaseUser.email?.toLowerCase() !== allowedAdminEmail) {
      setAuthError(`Acesso permitido somente para ${allowedAdminEmail}.`);
      setIsCloudReady(true);
      void supabase.auth.signOut();
      return;
    }

    let active = true;
    setIsCloudReady(false);
    setAuthError(null);
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('quotes')
          .select('quote')
          .order('updated_at', { ascending: false })
          .limit(500);
        if (error) throw error;

        const savedQuotes = (data || [])
          .map((row) => normalizeSavedQuote(row.quote))
          .filter((savedQuote): savedQuote is QuoteData => savedQuote !== null);
        if (!active) return;
        setRecentQuotes(savedQuotes);
        setQuote(savedQuotes[0] || createEmptyQuote(savedQuotes.map((savedQuote) => savedQuote.id)));
        setCloudSaveState(savedQuotes.length ? 'saved' : 'idle');
      } catch (error: any) {
        if (!active) return;
        setAuthError(`Login concluído, mas não foi possível ler seus orçamentos no Supabase: ${error.message}`);
        setCloudSaveState('error');
        setQuote(createEmptyQuote());
      } finally {
        if (active) setIsCloudReady(true);
      }
    })();

    return () => { active = false; };
  }, [supabaseUser]);

  useEffect(() => {
    const database = supabase;
    if (!isSupabaseConfigured || !database || !supabaseUser || !isCloudReady) return;
    setCloudSaveState('saving');
    const saveTimer = window.setTimeout(async () => {
      try {
        const { error } = await database.from('quotes').upsert({
          id: quote.id,
          owner_id: supabaseUser.id,
          quote: JSON.parse(JSON.stringify(quote)),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'owner_id,id' });
        if (error) throw error;
        setRecentQuotes((current) => [quote, ...current.filter((savedQuote) => savedQuote.id !== quote.id)].slice(0, 500));
        setCloudSaveState('saved');
      } catch (error: any) {
        setCloudSaveState('error');
        setAuthError(`Não foi possível sincronizar o orçamento: ${error.message}`);
      }
    }, 800);

    return () => window.clearTimeout(saveTimer);
  }, [quote, supabaseUser, isCloudReady]);

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
      const token = localStorage.getItem('fresa_master_bling_token') || '';
      let blingCatalogAvailable = true;
      let blingProducts: unknown[] = BLING_FRESA_MASTER_CATALOG.map((product) => ({
        id: product.id,
        codigo: product.sku,
        nome: product.description,
        descricao: product.description,
        preco: product.unitPrice,
        unidade: product.unit,
        pesoLiquido: product.weightGrams / 1000,
        categoriaProduto: { descricao: product.category },
        tributacao: { ncm: product.ncm },
        ncm: product.ncm,
      }));
      try {
        const catalogResponse = await apiFetch('/api/bling/products', {
          headers: token ? { 'X-Bling-Token': token } : {},
        });
        const catalogData = await catalogResponse.json().catch(() => ({}));
        blingCatalogAvailable = Boolean(catalogResponse.ok && catalogData.success);
        if (blingCatalogAvailable) blingProducts = catalogData.products || [];
      } catch {
        // Continua localmente quando a integração externa não está ativa.
      }

      const response = await apiFetch('/api/quote/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          currentQuote: quote,
          blingCatalogAvailable,
          blingProducts,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro ao processar o orçamento Fresa Master.');
      }

      const spokenPrices = extractUnitPricesFromText(text);
      const spokenDiscount = extractDiscountAmountFromText(text);
      const parsedItems = (data.quote.items || []).map((item: QuoteData['items'][number], index: number) => {
        const spokenPrice = spokenPrices.length === 1 ? spokenPrices[0] : spokenPrices[index];
        const unitPrice = spokenPrice ?? Number(item.unitPrice || 0);
        return {
          ...item,
          unitPrice,
          totalPrice: Number((Number(item.quantity || 1) * unitPrice).toFixed(2)),
        };
      });
      const subtotal = parsedItems.reduce((sum: number, item: QuoteData['items'][number]) => sum + item.totalPrice, 0);
      const discountPercentage = 0;
      const discountAmount = Math.min(subtotal, spokenDiscount ?? 0);
      const shippingAmount = Number(data.quote.financials?.shippingAmount || 0);
      const insuranceAmount = Number(data.quote.financials?.insuranceAmount || 0);
      setQuote({
        ...data.quote,
        items: parsedItems,
        financials: {
          ...data.quote.financials,
          subtotal,
          discountPercentage,
          discountAmount,
          totalAmount: Math.max(0, subtotal - discountAmount + shippingAmount + insuranceAmount),
        },
      });
      setSummary(data.summary);
      setMissingInfo(data.missingInfo || []);
      setConfidence(data.confidence || 0.96);
      return;
    } catch (err: any) {
      console.warn('Fallback local de extração ativado:', err.message || err);
      const fallback = buildLocalQuoteFallback(text, quote);
      setQuote(fallback.quote);
      setSummary(fallback.summary);
      setMissingInfo(fallback.missingInfo);
      setConfidence(fallback.confidence);
      setErrorMessage('Integração externa desativada. O app usou o modo local e continua funcionando sem depender de IA ou ERP.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveNow = async () => {
    if (!supabase || !supabaseUser) return;
    setCloudSaveState('saving');
    try {
      const { error } = await supabase.from('quotes').upsert({
        id: quote.id,
        owner_id: supabaseUser.id,
        quote: JSON.parse(JSON.stringify(quote)),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'owner_id,id' });
      if (error) throw error;
      setRecentQuotes((current) => [quote, ...current.filter((savedQuote) => savedQuote.id !== quote.id)].slice(0, 500));
      setCloudSaveState('saved');
    } catch (error: any) {
      setCloudSaveState('error');
      setAuthError(`Não foi possível salvar o orçamento: ${error.message}`);
    }
  };

  const handleDeleteQuote = async (target: QuoteData) => {
    if (!supabase || !supabaseUser) return;
    const { error } = await supabase.from('quotes').delete().eq('id', target.id).eq('owner_id', supabaseUser.id);
    if (error) {
      setAuthError(`Não foi possível remover o orçamento: ${error.message}`);
      return;
    }
    const remaining = recentQuotes.filter((savedQuote) => savedQuote.id !== target.id);
    setRecentQuotes(remaining);
    if (target.id === quote.id) {
      setQuote(remaining[0] || createEmptyQuote(remaining.map((savedQuote) => savedQuote.id)));
    }
  };
  const barBtn = 'cursor-pointer rounded-md border border-slate-300 bg-transparent px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 focus:outline-none focus-visible:outline-none focus:border-[#ff6a00] focus:shadow-[0_0_0_1px_#ff6a00,0_0_10px_rgba(255,106,0,0.55)] active:border-[#ff6a00] dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-500';

  const handleGoHome = () => {
    setIsApiDocsOpen(false);
    setIsProposalOpen(false);
    setIsBlingOpen(false);
    setIsSandboxShipmentOpen(false);
    setIsSavedQuotesOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNewQuote = () => {
    setQuote(createEmptyQuote([quote.id, ...recentQuotes.map((savedQuote) => savedQuote.id)]));
    setSummary('Novo orçamento Fresa Master em branco iniciado.');
    setMissingInfo([]);
  };

  const handlePasswordSignIn = async () => {
    if (!supabase) return;
    setIsAuthLoading(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      if (authEmail.trim().toLowerCase() !== allowedAdminEmail) {
        throw new Error(`Acesso permitido somente para ${allowedAdminEmail}.`);
      }
      if (!authPassword) throw new Error('Informe sua senha.');

      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim().toLowerCase(),
        password: authPassword,
      });
      if (error) throw error;
    } catch (error: any) {
      setAuthError(error.message || 'Não foi possível entrar.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handlePasswordRecovery = async () => {
    if (!supabase) return;
    setIsAuthLoading(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      if (authEmail.trim().toLowerCase() !== allowedAdminEmail) {
        throw new Error(`Acesso permitido somente para ${allowedAdminEmail}.`);
      }

      const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim().toLowerCase(), {
        redirectTo: window.location.href.split('#')[0],
      });
      if (error) throw error;
      setAuthNotice('Enviamos um link para criar ou redefinir sua senha.');
    } catch (error: any) {
      setAuthError(error.message || 'Não foi possível enviar o link de recuperação.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!supabase) return;
    setIsAuthLoading(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      if (authPassword.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');

      const { error } = await supabase.auth.updateUser({ password: authPassword });
      if (error) throw error;
      setAuthPassword('');
      setIsPasswordRecovery(false);
      setAuthNotice('Senha definida. Você já está conectado.');
    } catch (error: any) {
      setAuthError(error.message || 'Não foi possível atualizar a senha.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  const handleUpdateClientFromBling = (updatedClient: ClientInfo) => {
    setQuote((prev) => ({
      ...prev,
      client: updatedClient,
    }));
  };

  const invoiceRequired = ['SEDEX', 'PAC', 'JADLOG_PACKAGE'].includes(
    quote.shipping.selectedOption?.service || ''
  );
  const canCreateSandboxShipment = Boolean(
    quote.status === 'approved' &&
      quote.shipping.selectedOption &&
      ['SEDEX', 'PAC', 'JADLOG_PACKAGE'].includes(quote.shipping.selectedOption.service) &&
      quote.shipping.selectedOption.melhorEnvioServiceId
  );

  const sandboxMissing: string[] = [];
  if (quote.status !== 'approved') sandboxMissing.push('Marcar o pedido como aprovado (botão "Pedido aprovado").');
  if (!quote.shipping.selectedOption) {
    sandboxMissing.push('Escolher uma opção de frete (Sedex, PAC ou Jadlog .Package).');
  } else if (
    !['SEDEX', 'PAC', 'JADLOG_PACKAGE'].includes(quote.shipping.selectedOption.service) ||
    !quote.shipping.selectedOption.melhorEnvioServiceId
  ) {
    sandboxMissing.push('Selecionar um frete cotado no Melhor Envio (Sedex, PAC ou Jadlog .Package).');
  }

  const hasSelectedLiveShipping = Boolean(
    quote.shipping.selectedOption?.isRealTimeMelhorEnvio &&
    quote.shipping.selectedOption.melhorEnvioServiceId
  );

  if (!isSupabaseConfigured && import.meta.env.PROD) {
    return (
      <AuthGate
        needsSetup
        email={authEmail}
        password={authPassword}
        onEmailChange={setAuthEmail}
        onPasswordChange={setAuthPassword}
        onPasswordSignIn={handlePasswordSignIn}
        onPasswordRecovery={handlePasswordRecovery}
        onPasswordUpdate={handlePasswordUpdate}
      />
    );
  }

  if (isSupabaseConfigured && (isPasswordRecovery || !supabaseUser || isAuthLoading || !isCloudReady)) {
    return (
      <AuthGate
        isLoading={isAuthLoading || Boolean(supabaseUser && !isCloudReady)}
        isPasswordRecovery={isPasswordRecovery}
        error={authError}
        notice={authNotice}
        email={authEmail}
        password={authPassword}
        onEmailChange={setAuthEmail}
        onPasswordChange={setAuthPassword}
        onPasswordSignIn={handlePasswordSignIn}
        onPasswordRecovery={handlePasswordRecovery}
        onPasswordUpdate={handlePasswordUpdate}
      />
    );
  }

  return (
      <div className={`min-h-screen ${isDarkMode ? 'dark bg-[#090d16] text-slate-100' : 'bg-slate-100/70 text-slate-800'} flex flex-col font-sans antialiased transition-colors duration-200`}>
        <Header
          onOpenApiDocs={() => setIsApiDocsOpen(true)}
          onGoHome={handleGoHome}
          onPreviewProposal={() => setIsProposalOpen(true)}
          onOpenBlingModal={() => setIsBlingOpen(true)}
          hasItems={quote.items.length > 0}
          isApproved={quote.status === 'approved'}
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
          userEmail={supabaseUser?.email ?? undefined}
          onSignOut={supabaseUser ? handleSignOut : undefined}
          onOpenSandbox={() => setIsSandboxShipmentOpen(true)}
        />

        {supabaseUser && (
          <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <label htmlFor="saved-quotes" className="shrink-0 text-[11px] font-bold text-slate-500 dark:text-slate-400">Orçamentos salvos</label>
                <select
                  id="saved-quotes"
                  value={quote.id}
                  onChange={(event) => {
                    const selected = recentQuotes.find((savedQuote) => savedQuote.id === event.target.value);
                    if (selected) setQuote(selected);
                  }}
                  className="min-w-0 max-w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {!recentQuotes.some((savedQuote) => savedQuote.id === quote.id) && (
                    <option value={quote.id}>{quote.id} • {quote.client.name || 'Novo orçamento'}</option>
                  )}
                  {recentQuotes.map((savedQuote) => (
                    <option key={savedQuote.id} value={savedQuote.id}>
                      {savedQuote.id} • {savedQuote.client.name || 'Cliente novo'}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setIsSavedQuotesOpen(true)} className={barBtn}>Orçamentos</button>
                <button type="button" onClick={handleNewQuote} title="Iniciar novo orçamento" className={barBtn}>Novo</button>
                <button type="button" onClick={handleSaveNow} disabled={cloudSaveState === 'saving'} className={`${barBtn} disabled:opacity-60`}>Salvar</button>
                <span className={`text-[10px] font-semibold ${cloudSaveState === 'error' ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400'}`}>
                  {cloudSaveState === 'saving' ? 'Sincronizando...' : cloudSaveState === 'saved' ? 'Salvo na nuvem' : cloudSaveState === 'error' ? 'Falha ao sincronizar' : 'Nuvem pronta'}
                </span>
              </div>

            </div>
          </div>
        )}

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Error notification */}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl text-xs flex items-center gap-2 shadow-xs">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-semibold">Erro:</span>
            <span>{errorMessage}</span>
          </div>
        )}
        {authError && supabaseUser && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {authError}
          </div>
        )}

        {/* Clean Unified Quick Order Input (Voice or Text) */}
        <QuickOrderInput
          onProcess={handleExtract}
          isLoading={isExtracting}
          summary={summary}
          externalText={transcribedText}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
          <p className="min-w-0 truncate text-xs font-semibold text-slate-600 dark:text-slate-300">
            {quote.client.name || 'Cliente ainda não identificado'} • {quote.items.length} item{quote.items.length === 1 ? '' : 'ns'} • {quote.financials.totalAmount > 0 ? 'Orçamento pronto' : 'Em elaboração'}
          </p>
        </div>
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
            {quote.status === 'approved' && quote.items.length > 0 && !quote.sandboxShipment && (
              <div className="flex flex-col items-center gap-1 sm:items-end">
                <button
                  type="button"
                  onClick={() => setIsSandboxShipmentOpen(true)}
                  disabled={!hasSelectedLiveShipping}
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-4 py-2.5 font-bold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Truck className="h-4 w-4" />
                  Criar envio no Sandbox
                </button>
                {!hasSelectedLiveShipping && <span className="text-[10px] text-slate-500">Recalcule e selecione uma cotação oficial primeiro</span>}
              </div>
            )}
            {quote.sandboxShipment && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Envio de teste criado{quote.sandboxShipment.protocol ? ` • ${quote.sandboxShipment.protocol}` : ''}
              </span>
            )}
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

      <SavedQuotesModal
        isOpen={isSavedQuotesOpen}
        quotes={recentQuotes}
        currentId={quote.id}
        onClose={() => setIsSavedQuotesOpen(false)}
        onOpen={(selected) => { setQuote(selected); setIsSavedQuotesOpen(false); }}
        onDelete={handleDeleteQuote}
      />

      {isSandboxShipmentOpen && (
        <SandboxShipmentModal
          quote={quote}
          missing={sandboxMissing}
          onClose={() => setIsSandboxShipmentOpen(false)}
          onCreated={(shipment) => {
            setQuote((current) => ({ ...current, sandboxShipment: shipment }));
            setIsSandboxShipmentOpen(false);
          }}
        />
      )}
    </div>
  );
}
