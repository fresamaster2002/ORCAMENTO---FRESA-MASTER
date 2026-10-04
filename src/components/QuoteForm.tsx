import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { 
  Plus, 
  Trash2, 
  Building, 
  User, 
  DollarSign, 
  Sparkles, 
  FileCheck, 
  Truck, 
  CheckCircle2, 
  Clock, 
  FileSpreadsheet,
  Layers,
  FileText,
  X,
  Search,
  ShieldCheck,
  Edit3,
  Check,
  Eye,
  Zap
} from 'lucide-react';
import { BlingCatalogProduct, QuoteData, QuoteItem, ShippingOption, ShippingInfo, ClientInfo } from '../types';
import { ShippingCalculator } from './ShippingCalculator';
import { ClientCadastralModal } from './ClientCadastralModal';
import { matchBlingCatalogProduct, normalizeBlingCatalogProducts } from '../blingCatalog';

const calculateDiscountAmount = (subtotal: number, discountPercentage: number, fixedDiscount: number) => {
  const amount = discountPercentage > 0 ? (subtotal * discountPercentage) / 100 : fixedDiscount;
  return Number(Math.min(subtotal, Math.max(0, amount)).toFixed(2));
};

interface QuoteFormProps {
  quote: QuoteData;
  onChange: (updatedQuote: QuoteData) => void;
  onPreview: () => void;
  onOpenBling: () => void;
}

export const QuoteForm: React.FC<QuoteFormProps> = ({
  quote,
  onChange,
  onPreview,
  onOpenBling,
}) => {
  const [isCadastralModalOpen, setIsCadastralModalOpen] = useState(false);
  const [isBlingCatalogModalOpen, setIsBlingCatalogModalOpen] = useState(false);
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [liveBlingCatalog, setLiveBlingCatalog] = useState<BlingCatalogProduct[] | null>(null);
  const [isLoadingBlingCatalog, setIsLoadingBlingCatalog] = useState(false);
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);
  const [pendingQuoteItemId, setPendingQuoteItemId] = useState<string | null>(null);
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [isCreatingBlingProduct, setIsCreatingBlingProduct] = useState(false);
  const [newProductError, setNewProductError] = useState<string | null>(null);
  const [newProductName, setNewProductName] = useState('');
  const [newProductSku, setNewProductSku] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductNcm, setNewProductNcm] = useState('8207.70.00');

  useEffect(() => {
    if (!isBlingCatalogModalOpen) return;
    let cancelled = false;

    const loadBlingCatalog = async () => {
      setIsLoadingBlingCatalog(true);
      setCatalogLoadError(null);
      try {
        const token = localStorage.getItem('fresa_master_bling_token') || '';
        const response = await apiFetch('/api/bling/products', {
          headers: token ? { 'X-Bling-Token': token } : {},
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Não foi possível consultar o Bling.');
        if (!cancelled) setLiveBlingCatalog(normalizeBlingCatalogProducts(data.products || []));
      } catch (error: any) {
        if (!cancelled) {
          setLiveBlingCatalog(null);
          setCatalogLoadError(error.message || 'Conecte o Bling para carregar seus produtos cadastrados.');
        }
      } finally {
        if (!cancelled) setIsLoadingBlingCatalog(false);
      }
    };

    loadBlingCatalog();
    return () => { cancelled = true; };
  }, [isBlingCatalogModalOpen]);

  const addBlingProduct = (product: BlingCatalogProduct, replaceItemId?: string | null) => {
    const updatedItems = replaceItemId
      ? quote.items.map((item) => item.id === replaceItemId ? {
          ...item,
          description: product.description,
          sku: product.sku,
          ncm: product.ncm || item.ncm,
          category: product.category,
          unit: product.unit || item.unit,
          unitPrice: product.unitPrice > 0 ? product.unitPrice : item.unitPrice,
          totalPrice: item.quantity * (product.unitPrice > 0 ? product.unitPrice : item.unitPrice),
          notes: `Produto cadastrado no Bling ERP (${product.sku})`,
        } : item)
      : [...quote.items, {
          id: `bling-${Date.now()}`,
          description: product.description,
          sku: product.sku,
          ncm: product.ncm,
          category: product.category,
          quantity: 1,
          unit: product.unit,
          unitPrice: product.unitPrice,
          totalPrice: product.unitPrice,
          notes: `Produto cadastrado no Bling ERP (${product.sku})`,
        }];
    recalculateFinancials(updatedItems, quote.shipping.selectedOption);
    closeBlingCatalog();
  };

  const openCatalogForItem = (item: QuoteItem) => {
    setPendingQuoteItemId(item.id);
    setCatalogSearch(item.description);
    setNewProductName(item.description);
    setNewProductSku(item.sku || `FM-${Date.now().toString().slice(-6)}`);
    setNewProductPrice(item.unitPrice > 0 ? String(item.unitPrice) : '');
    setNewProductNcm(item.ncm || '8207.70.00');
    setShowNewProductForm(false);
    setNewProductError(null);
    setIsBlingCatalogModalOpen(true);
  };

  const closeBlingCatalog = () => {
    setIsBlingCatalogModalOpen(false);
    setCatalogSearch('');
    setPendingQuoteItemId(null);
    setShowNewProductForm(false);
    setNewProductError(null);
  };

  const createBlingProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsCreatingBlingProduct(true);
    setNewProductError(null);
    try {
      const token = localStorage.getItem('fresa_master_bling_token') || '';
      const response = await apiFetch('/api/bling/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Bling-Token': token } : {}),
        },
        body: JSON.stringify({
          product: {
            name: newProductName,
            sku: newProductSku,
            price: Number(newProductPrice),
            ncm: newProductNcm,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'O Bling não confirmou o cadastro.');

      const created = normalizeBlingCatalogProducts([data.product])[0] || {
        id: newProductSku,
        sku: newProductSku,
        description: newProductName,
        category: 'Produtos Bling',
        unitPrice: Number(newProductPrice),
        unit: 'UN',
        ncm: newProductNcm,
        weightGrams: 0,
        tags: [],
      };
      setLiveBlingCatalog((current) => {
        const products = current ?? [];
        return [...products.filter((item) => item.sku !== created.sku), created];
      });
      addBlingProduct(created, pendingQuoteItemId);
    } catch (error: any) {
      setNewProductError(error.message || 'Falha ao cadastrar produto no Bling.');
    } finally {
      setIsCreatingBlingProduct(false);
    }
  };

  const updateClient = (field: string, val: any) => {
    onChange({
      ...quote,
      client: {
        ...quote.client,
        [field]: val,
      },
    });
  };

  const updateItem = (id: string, field: keyof QuoteItem, val: any) => {
    const updatedItems = quote.items.map((it) => {
      if (it.id === id) {
        const item = { ...it, [field]: val };
        if (field === 'quantity' || field === 'unitPrice') {
          item.totalPrice = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
        }
        return item;
      }
      return it;
    });
    recalculateFinancials(updatedItems, quote.shipping.selectedOption);
  };

  const addItem = (customTitle?: string, customPrice = 140) => {
    const description = customTitle || 'Fresa 3 Cortes TCT para Router CNC';
    const matchedProduct = matchBlingCatalogProduct(description, activeBlingCatalog);
    const unitPrice = matchedProduct ? matchedProduct.unitPrice : customPrice;
    const newItem: QuoteItem = {
      id: `item-${Date.now()}`,
      description: matchedProduct?.description || description,
      sku: matchedProduct?.sku || '',
      ncm: matchedProduct?.ncm || '',
      category: matchedProduct?.category || 'Fresas Router CNC',
      quantity: 1,
      unit: matchedProduct?.unit || 'un',
      unitPrice,
      totalPrice: unitPrice,
      notes: matchedProduct
        ? `Produto cadastrado no Bling ERP (${matchedProduct.sku})`
        : 'Não encontrado no catálogo do Bling. Revise e cadastre antes de faturar.',
    };
    const updatedItems = [...quote.items, newItem];
    recalculateFinancials(updatedItems, quote.shipping.selectedOption);
  };

  const removeItem = (id: string) => {
    const updatedItems = quote.items.filter((it) => it.id !== id);
    recalculateFinancials(updatedItems, quote.shipping.selectedOption);
  };

  const handleSelectShippingOption = (option: ShippingOption) => {
    const isInsured = Boolean(quote.shipping.insuranceEnabled);
    const insuranceCost = isInsured ? (option.insuranceCost || (quote.shipping.insuranceAmount || 0)) : 0;
    const baseShipping = option.withoutInsurancePrice ?? (option.price - insuranceCost);

    const updatedOptions = (quote.shipping.options || []).map((o) => ({
      ...o,
      selected: o.service === option.service,
    }));

    const updatedShipping = {
      ...quote.shipping,
      selectedOption: option,
      insuranceAmount: insuranceCost,
      options: updatedOptions,
    };

    const subtotal = quote.items.reduce((acc, it) => acc + it.totalPrice, 0);
    const discountPct = Number(quote.financials.discountPercentage) || 0;
    const discountAmount = calculateDiscountAmount(subtotal, discountPct, Number(quote.financials.discountAmount) || 0);
    const totalAmount = Number(Math.max(0, subtotal - discountAmount + baseShipping + insuranceCost).toFixed(2));

    onChange({
      ...quote,
      shipping: updatedShipping,
      project: {
        ...quote.project,
        deadline: option.deliveryDays > 0 ? `${option.deliveryDays} dias úteis (${option.name})` : 'Pronta entrega',
      },
      financials: {
        ...quote.financials,
        subtotal,
        shippingAmount: baseShipping,
        insuranceAmount: insuranceCost,
        discountAmount,
        totalAmount,
      },
    });
  };

  const handleUpdateDestinationCep = (cep: string) => {
    onChange({
      ...quote,
      client: {
        ...quote.client,
        cep,
      },
      shipping: {
        ...quote.shipping,
        destinationCep: cep,
      },
    });
  };

  const handleUpdateShippingFull = (updatedShipping: ShippingInfo, selectedOption?: ShippingOption) => {
    const subtotal = quote.items.reduce((acc, it) => acc + it.totalPrice, 0);
    const activeOption = selectedOption || updatedShipping.selectedOption || updatedShipping.options[0];
    const isInsured = Boolean(updatedShipping.insuranceEnabled);
    const insuranceCost = isInsured ? (activeOption?.insuranceCost || updatedShipping.insuranceAmount || 0) : 0;
    const baseShipping = activeOption?.withoutInsurancePrice ?? ((activeOption?.price || 0) - insuranceCost);
    const discountPct = Number(quote.financials.discountPercentage) || 0;
    const discountAmount = calculateDiscountAmount(subtotal, discountPct, Number(quote.financials.discountAmount) || 0);
    const totalAmount = Number(Math.max(0, subtotal - discountAmount + baseShipping + insuranceCost).toFixed(2));

    onChange({
      ...quote,
      shipping: {
        ...updatedShipping,
        insuranceAmount: insuranceCost,
        selectedOption: activeOption,
      },
      project: {
        ...quote.project,
        deadline: activeOption && activeOption.deliveryDays > 0 ? `${activeOption.deliveryDays} dias úteis (${activeOption.name})` : 'Pronta entrega',
      },
      financials: {
        ...quote.financials,
        subtotal,
        shippingAmount: baseShipping,
        insuranceAmount: insuranceCost,
        discountAmount,
        totalAmount,
      },
    });
  };

  const recalculateFinancials = (items: QuoteItem[], shippingOption?: ShippingOption) => {
    const subtotal = items.reduce((acc, it) => acc + it.totalPrice, 0);
    const activeOption = shippingOption || quote.shipping.selectedOption || quote.shipping.options[0];
    const isInsured = Boolean(quote.shipping.insuranceEnabled);
    const insuranceCost = isInsured ? (activeOption?.insuranceCost || quote.shipping.insuranceAmount || 0) : 0;
    const baseShipping = activeOption?.withoutInsurancePrice ?? (quote.financials.shippingAmount || 0);
    const discountPct = Number(quote.financials.discountPercentage) || 0;
    const discountAmount = calculateDiscountAmount(subtotal, discountPct, Number(quote.financials.discountAmount) || 0);
    const totalAmount = Number(Math.max(0, subtotal - discountAmount + baseShipping + insuranceCost).toFixed(2));

    onChange({
      ...quote,
      items,
      financials: {
        ...quote.financials,
        subtotal,
        shippingAmount: baseShipping,
        insuranceAmount: insuranceCost,
        discountAmount,
        totalAmount,
      },
    });
  };

  const toggleStatus = () => {
    const newStatus = quote.status === 'approved' ? 'draft' : 'approved';
    onChange({
      ...quote,
      status: newStatus,
    });
  };

  const updateDiscountAmount = (value: string) => {
    const subtotal = quote.items.reduce((acc, item) => acc + item.totalPrice, 0);
    const enteredAmount = Number(value) || 0;
    const discountAmount = Math.min(subtotal, Math.max(0, enteredAmount));
    const insuranceAmount = Number(quote.financials.insuranceAmount || 0);
    onChange({
      ...quote,
      financials: {
        ...quote.financials,
        discountPercentage: 0,
        discountAmount,
        totalAmount: Number(Math.max(0, subtotal - discountAmount + Number(quote.financials.shippingAmount || 0) + insuranceAmount).toFixed(2)),
      },
    });
  };

  const activeBlingCatalog = liveBlingCatalog ?? [];
  const filteredBlingCatalog = activeBlingCatalog.filter((item) => {
    const query = catalogSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const searchable = [item.description, item.sku, item.category, item.ncm, ...item.tags]
      .join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return (
      searchable.includes(query)
    );
  });

  const invoiceRequired = ['SEDEX', 'PAC', 'JADLOG_PACKAGE'].includes(
    quote.shipping.selectedOption?.service || ''
  );

  const workflowSteps = [
    { label: '1. Pedido', done: quote.items.length > 0 || Boolean(quote.client.name || quote.client.phone) },
    { label: '2. Orçamento', done: quote.financials.totalAmount > 0 },
    { label: '3. Aprovado', done: quote.status === 'approved' },
    {
      label: invoiceRequired ? '4. NF Bling' : '4. Sem NF',
      done: invoiceRequired ? quote.status === 'approved' : true,
    },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden space-y-6">
      <div className="p-4 sm:p-5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-amber-900 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-2.5 py-1 rounded-lg border border-amber-200 dark:border-amber-800">
              {quote.id}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Validade: 10 dias</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onPreview}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition cursor-pointer flex items-center gap-1.5 border border-slate-200 dark:border-slate-700"
            >
              <Eye className="w-3.5 h-3.5 text-slate-500" />
              <span>Visualizar PDF</span>
            </button>

            <button
              type="button"
              onClick={toggleStatus}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs ${
                quote.status === 'approved'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{quote.status === 'approved' ? 'Pedido aprovado ✓' : 'Pedido aprovado'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
          {workflowSteps.map((step) => (
            <div
              key={step.label}
              className={`rounded-xl border px-2.5 py-2 text-[11px] font-semibold transition ${
                step.done
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span>{step.label}</span>
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${step.done ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 sm:px-6 space-y-6">
        {/* Section 1: Client Overview Card (Clean & Compact) */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Dados do Cliente & Faturamento NF-e
              </h3>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCadastralModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-300 border border-amber-300/80 dark:border-amber-700 font-bold text-xs transition cursor-pointer"
                title="Lê Cartão CNPJ, PDF ou mensagem de WhatsApp com IA"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>Preencher c/ IA (Cartão CNPJ)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditingClient(!isEditingClient)}
                className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-semibold px-2 py-1 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-700 transition cursor-pointer flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" />
                <span>{isEditingClient ? 'Ocultar Campos' : 'Editar'}</span>
              </button>
            </div>
          </div>

          {/* Clean Executive Summary Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">Cliente / Razão Social</span>
              <span className="font-bold text-slate-900 dark:text-slate-100 truncate block mt-0.5">
                {quote.client.name || 'Não informado'}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">CNPJ / CPF</span>
              <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate block mt-0.5">
                {quote.client.document || 'Pendente'}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">Cidade / UF</span>
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate block mt-0.5">
                {quote.client.city ? `${quote.client.city} / ${quote.client.state || ''}` : 'Pendente'}
                {quote.client.cep && ` (${quote.client.cep})`}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700">
              <span className="text-[10px] text-slate-400 font-semibold block uppercase">Inscrição Estadual</span>
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate block mt-0.5">
                {quote.client.ie || 'ISENTO'}
              </span>
            </div>
          </div>

          {/* Expandable Manual Form */}
          {isEditingClient && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs animate-fadeIn">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Razão Social / Nome:
                </label>
                <input
                  type="text"
                  value={quote.client.name}
                  onChange={(e) => updateClient('name', e.target.value)}
                  placeholder="Ex: Móveis Requinte Ltda"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  CNPJ ou CPF:
                </label>
                <input
                  type="text"
                  value={quote.client.document || ''}
                  onChange={(e) => updateClient('document', e.target.value)}
                  placeholder="00.000.000/0001-00"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Inscrição Estadual (IE):
                </label>
                <input
                  type="text"
                  value={quote.client.ie || 'ISENTO'}
                  onChange={(e) => updateClient('ie', e.target.value)}
                  placeholder="ISENTO ou número"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  CEP de Destino:
                </label>
                <input
                  type="text"
                  value={quote.client.cep || ''}
                  onChange={(e) => updateClient('cep', e.target.value)}
                  placeholder="00000-000"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-amber-500 font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Cidade / UF:
                </label>
                <input
                  type="text"
                  value={`${quote.client.city || ''}${quote.client.state ? ' / ' + quote.client.state : ''}`}
                  onChange={(e) => {
                    const parts = e.target.value.split('/');
                    updateClient('city', parts[0]?.trim());
                    if (parts[1]) updateClient('state', parts[1]?.trim());
                  }}
                  placeholder="Curitiba / PR"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  WhatsApp / Telefone:
                </label>
                <input
                  type="text"
                  value={quote.client.phone || ''}
                  onChange={(e) => updateClient('phone', e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  E-mail NF-e:
                </label>
                <input
                  type="email"
                  value={quote.client.email || ''}
                  onChange={(e) => updateClient('email', e.target.value)}
                  placeholder="fiscal@cliente.com.br"
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 outline-none focus:border-amber-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Freight Shipping Calculator (Melhor Envio) */}
        <ShippingCalculator
          shipping={quote.shipping}
          items={quote.items}
          clientCity={quote.client.city}
          clientState={quote.client.state}
          onSelectOption={handleSelectShippingOption}
          onUpdateDestinationCep={handleUpdateDestinationCep}
          onUpdateShipping={handleUpdateShippingFull}
        />

        {/* Section 3: CNC Router Bits & Tooling Table */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Fresas & Ferramentas Router CNC (NCM 8207.70.00)
              </h3>
            </div>

            {/* Quick Add Presets and Bling Catalog button */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setPendingQuoteItemId(null);
                  setShowNewProductForm(false);
                  setNewProductError(null);
                  setIsBlingCatalogModalOpen(true);
                }}
                className="text-[11px] px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                <Building className="w-3.5 h-3.5 text-emerald-200" />
                <span>Produtos do Bling ({activeBlingCatalog.length})</span>
              </button>

              <button
                type="button"
                onClick={() => addItem('Fresa 3 Cortes TCT 6x22mm Haste 6mm (Widia)', 140)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 transition cursor-pointer font-medium"
              >
                + 3 Cortes TCT (R$ 140)
              </button>

              <button
                type="button"
                onClick={() => addItem('Fresa Helicoidal 2 Cortes Metal Duro 6x22mm', 95)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition cursor-pointer font-medium"
              >
                + Helicoidal 2C (R$ 95)
              </button>

              <button
                type="button"
                onClick={() => addItem()}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-black dark:hover:bg-slate-600 text-white transition cursor-pointer font-medium flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Item Livre</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="p-3">Descrição da Ferramenta CNC</th>
                  <th className="p-3 w-28">SKU</th>
                  <th className="p-3 w-24">NCM</th>
                  <th className="p-3 w-20 text-center">Qtd</th>
                  <th className="p-3 w-28 text-right">Valor Unit.</th>
                  <th className="p-3 w-28 text-right">Total</th>
                  <th className="p-3 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {quote.items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                    <td className="p-3">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        className="w-full font-semibold text-slate-800 dark:text-slate-100 bg-transparent outline-none focus:underline"
                      />
                      {(!item.sku || item.notes?.includes('Não encontrado no catálogo do Bling')) && (
                        <button
                          type="button"
                          onClick={() => openCatalogForItem(item)}
                          className="mt-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 hover:underline"
                        >
                          Buscar ou cadastrar no Bling
                        </button>
                      )}
                    </td>
                    <td className="p-3 font-mono text-[11px]">
                      <input
                        type="text"
                        value={item.sku || ''}
                        placeholder="Pendente"
                        onChange={(e) => updateItem(item.id, 'sku', e.target.value)}
                        className="w-full text-slate-600 dark:text-slate-400 bg-transparent outline-none"
                      />
                    </td>
                    <td className="p-3 font-mono text-[11px]">
                      <input
                        type="text"
                        value={item.ncm || ''}
                        placeholder="Pendente"
                        onChange={(e) => updateItem(item.id, 'ncm', e.target.value)}
                        className="w-full text-slate-600 dark:text-slate-400 bg-transparent outline-none"
                      />
                    </td>
                    <td className="p-3 text-center">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                        className="w-14 text-center font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 py-1 rounded-lg border border-slate-200 dark:border-slate-700 outline-none"
                      />
                    </td>
                    <td className="p-3 text-right font-mono">
                      <input
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)}
                        className="w-20 text-right font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 py-1 px-1.5 rounded-lg border border-slate-200 dark:border-slate-700 outline-none"
                      />
                    </td>
                    <td className="p-3 text-right font-bold text-slate-900 dark:text-slate-100 font-mono">
                      {item.totalPrice.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-slate-400 hover:text-red-600 transition cursor-pointer p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 4: Financials & Totals Breakdown (Clear addition of insurance!) */}
        <div className="bg-slate-50/70 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between gap-6">
          <div className="space-y-3 text-xs flex-1">
            <h4 className="font-bold text-slate-800 dark:text-slate-200">Condições de Pagamento Fresa Master:</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Forma de Pagamento:</label>
                <input
                  type="text"
                  value={quote.financials.paymentMethod}
                  onChange={(e) =>
                    onChange({
                      ...quote,
                      financials: { ...quote.financials, paymentMethod: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Condição Comercial:</label>
                <input
                  type="text"
                  value={quote.financials.paymentTerms}
                  onChange={(e) =>
                    onChange({
                      ...quote,
                      financials: { ...quote.financials, paymentTerms: e.target.value },
                    })
                  }
                  className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
              Chave Pix Oficial: <strong className="font-mono text-slate-700 dark:text-slate-300">fresamaster0@gmail.com</strong>
            </div>

            {/* Quick One-Click Bling Emission Banner */}
            <div className="mt-4 p-3.5 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Building className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Integração Bling ERP (NF-e)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-800">
                      Conectado
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400">
                    Crie o pedido de venda no Bling com 1 clique para emissão de nota
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenBling}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
              >
                <Zap className="w-4 h-4 text-amber-300" />
                <span>Emitir Pedido no Bling</span>
              </button>
            </div>
          </div>

          {/* Clean, Transparent Totals Breakdown */}
          <div className="w-full md:w-80 space-y-2 border-t md:border-t-0 md:border-l border-slate-200 dark:border-slate-700 pt-4 md:pt-0 md:pl-6 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span>Subtotal Ferramentas:</span>
              <span className="font-mono font-semibold">
                {quote.financials.subtotal.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </span>
            </div>

            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-slate-500" />
                <span>Frete ({quote.shipping.selectedOption?.carrier} {quote.shipping.selectedOption?.service}):</span>
              </span>
              <span className="font-mono font-semibold">
                {(quote.financials.shippingAmount || 0).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </span>
            </div>

            <label className="flex items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
              <span>Desconto (opcional, R$):</span>
              <input
                type="number"
                min="0"
                max={quote.financials.subtotal}
                step="0.01"
                value={quote.financials.discountAmount || ''}
                onChange={(event) => updateDiscountAmount(event.target.value)}
                placeholder="0,00"
                aria-label="Desconto em reais"
                className="w-24 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-right font-mono text-xs text-slate-800 dark:text-slate-100"
              />
            </label>

            {/* Insurance Fee explicitly added when insurance is enabled */}
            {Boolean(quote.shipping.insuranceEnabled && (quote.financials.insuranceAmount || 0) > 0) && (
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Seguro de Carga Incluso:</span>
                </span>
                <span className="font-mono font-bold">
                  + {(quote.financials.insuranceAmount || 0).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </span>
              </div>
            )}

            {quote.financials.discountAmount > 0 && (
              <div className="flex justify-between text-rose-600 font-medium">
                <span>Desconto Comercial:</span>
                <span className="font-mono font-semibold">
                  -{' '}
                  {quote.financials.discountAmount.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </span>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between items-baseline">
              <span className="font-extrabold text-slate-900 dark:text-white text-sm">TOTAL FINAL:</span>
              <span className="font-mono font-extrabold text-xl text-slate-900 dark:text-white">
                {quote.financials.totalAmount.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Bling Catalog Selection Modal */}
      {isBlingCatalogModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-scaleIn">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  Produtos cadastrados no Bling ERP
                </h3>
              </div>
              <button
                type="button"
                onClick={closeBlingCatalog}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Digite nome, SKU, diâmetro ou NCM para buscar..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs outline-none focus:border-emerald-500"
                  autoFocus
                />
                <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                  {isLoadingBlingCatalog
                    ? 'Sincronizando produtos da sua conta...'
                    : liveBlingCatalog !== null
                      ? `${liveBlingCatalog.length} produtos carregados da sua conta Bling`
                      : catalogLoadError || 'Conecte o Bling para carregar seus produtos cadastrados.'}
                </p>
              </div>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1 divide-y divide-slate-100 dark:divide-slate-800">
              {isLoadingBlingCatalog && (
                <div className="py-8 text-center text-xs text-slate-500">Carregando catálogo...</div>
              )}
              {!isLoadingBlingCatalog && filteredBlingCatalog.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => addBlingProduct(prod, pendingQuoteItemId)}
                  className="pt-2 first:pt-0 flex items-center justify-between gap-3 p-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl cursor-pointer transition"
                >
                  <div>
                    <div className="font-bold text-xs text-slate-900 dark:text-slate-100">{prod.description}</div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5 font-mono">
                      <span>SKU: {prod.sku}</span>
                      <span>• NCM: {prod.ncm}</span>
                      <span>• Categoria: {prod.category}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold font-mono text-xs text-emerald-700 dark:text-emerald-400 block">
                      {prod.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">+ Adicionar</span>
                  </div>
                </div>
              ))}

              {!isLoadingBlingCatalog && catalogSearch.trim() && filteredBlingCatalog.length === 0 && (
                <p className="py-5 text-center text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Nenhum produto encontrado no catálogo carregado.
                </p>
              )}

              {!isLoadingBlingCatalog && catalogSearch.trim() && !showNewProductForm && (
                <button
                  type="button"
                  onClick={() => {
                    setNewProductName(catalogSearch.trim());
                    setNewProductSku(`FM-${Date.now().toString().slice(-6)}`);
                    setNewProductPrice('');
                    setNewProductNcm('8207.70.00');
                    setNewProductError(null);
                    setShowNewProductForm(true);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Não encontrou? Cadastrar no Bling
                </button>
              )}

              {showNewProductForm && (
                <form onSubmit={createBlingProduct} className="mt-3 space-y-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 p-3">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Confirmar novo produto no Bling</div>
                  <input
                    required
                    value={newProductName}
                    onChange={(event) => setNewProductName(event.target.value)}
                    placeholder="Descrição do produto"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      required
                      value={newProductSku}
                      onChange={(event) => setNewProductSku(event.target.value)}
                      placeholder="SKU"
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={newProductPrice}
                      onChange={(event) => setNewProductPrice(event.target.value)}
                      placeholder="Preço unitário (R$)"
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                    <input
                      required
                      value={newProductNcm}
                      onChange={(event) => setNewProductNcm(event.target.value)}
                      placeholder="NCM"
                      className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                  </div>
                  {newProductError && <p className="text-[11px] text-red-700 dark:text-red-400">{newProductError}</p>}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setShowNewProductForm(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300">Cancelar</button>
                    <button type="submit" disabled={isCreatingBlingProduct} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold">
                      {isCreatingBlingProduct ? 'Cadastrando...' : 'Confirmar cadastro'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cadastral AI OCR Modal */}
      {isCadastralModalOpen && (
        <ClientCadastralModal
          isOpen={isCadastralModalOpen}
          onClose={() => setIsCadastralModalOpen(false)}
          currentClient={quote.client}
          onApplyClient={(newClient) => {
            onChange({
              ...quote,
              client: newClient,
              shipping: {
                ...quote.shipping,
                destinationCep: newClient.cep || quote.shipping.destinationCep,
              },
            });
          }}
        />
      )}
    </div>
  );
};
