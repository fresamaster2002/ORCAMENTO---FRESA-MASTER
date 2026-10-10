import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { CnpjLookup } from './CnpjLookup';
import { formatBlingError, isDuplicateBlingSale } from '../../supabase/functions/_shared/blingErrors';
import { blingReadinessIssues } from '../../supabase/functions/_shared/blingReadiness';
import { blingOrderSnapshot } from '../blingOrderSnapshot';
import { supabaseUrl } from '../supabase';
import { 
  X, 
  Building, 
  FileText, 
  CheckCircle2, 
  Copy, 
  Check, 
  Download, 
  Sparkles, 
  ArrowRight, 
  Upload, 
  Send,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Paperclip,
  UploadCloud,
  File,
  Trash2,
  KeyRound,
  RefreshCw,
  Zap,
  PackageCheck,
  AlertTriangle,
  Layers
} from 'lucide-react';
import { QuoteData, ClientInfo, BlingNfe } from '../types';

interface BlingIntegrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  quote: QuoteData;
  onUpdateClient: (client: ClientInfo) => void;
  onUpdateBling: (quoteId: string, bling: NonNullable<QuoteData['bling']>) => Promise<void>;
}

export const BlingIntegrationModal: React.FC<BlingIntegrationModalProps> = ({
  isOpen,
  onClose,
  quote,
  onUpdateClient,
  onUpdateBling,
}) => {
  // Bling API Token State
  const DEFAULT_BLING_TOKEN = '';
  const [blingToken, setBlingToken] = useState<string>(() => {
    return localStorage.getItem('fresa_master_bling_token') || DEFAULT_BLING_TOKEN;
  });
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'testing' | 'connected' | 'disconnected'>('idle');
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);

  // Direct Order Submission State
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [orderResult, setOrderResult] = useState<{
    orderId: string | number;
    orderNumber: string | number;
    orderUrl?: string;
  } | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [duplicateOrder, setDuplicateOrder] = useState(false);

  // NF-e State
  const [nfe, setNfe] = useState<BlingNfe | null>(null);
  const [nfeBusy, setNfeBusy] = useState<'generate' | 'send' | 'status' | null>(null);
  const [nfeError, setNfeError] = useState<string | null>(null);
  const [nfeReadyToSend, setNfeReadyToSend] = useState(false);
  const [nfeFiscalIssues, setNfeFiscalIssues] = useState<string[]>([]);

  // Live Products Sync State
  const [isSyncingProducts, setIsSyncingProducts] = useState(false);
  const [syncedProducts, setSyncedProducts] = useState<any[] | null>(null);

  // Cadastral Input State
  const [cadastralInput, setCadastralInput] = useState('');
  const [attachedDoc, setAttachedDoc] = useState<{
    name: string;
    size: number;
    type: string;
    base64: string;
    previewUrl?: string;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [clientData, setClientData] = useState<ClientInfo>(quote.client);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [blingXml, setBlingXml] = useState('');
  const [blingJson, setBlingJson] = useState<any>(null);
  const [payloadError, setPayloadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'direct' | 'app_register' | 'cadastral' | 'products' | 'xml' | 'json' | 'manual'>('direct');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const blingFileInputRef = React.useRef<HTMLInputElement>(null);
  const readinessIssues = blingReadinessIssues({ ...quote, client: clientData });
  const orderChanged = Boolean(quote.bling?.orderSnapshot && quote.bling.orderSnapshot !== blingOrderSnapshot({ ...quote, client: clientData }));

  useEffect(() => {
    const saved = quote.bling;
    setOrderResult(saved?.orderId ? { orderId: saved.orderId, orderNumber: saved.orderNumber || saved.orderId, orderUrl: saved.orderUrl } : null);
    setNfe(saved?.nfe || null);
    setNfeReadyToSend(false);
    setNfeFiscalIssues([]);
    setNfeError(null);
    setOrderError(null);
    setDuplicateOrder(false);
  }, [quote.id, isOpen]);

  // OAuth 2.0 App credentials
  const [authMethod, setAuthMethod] = useState<'token' | 'oauth'>('token');
  const [clientId, setClientId] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('fresa_master_bling_client_id') || '' : '';
  });
  const [clientSecret, setClientSecret] = useState<string>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('fresa_master_bling_client_secret') || '' : '';
  });
  const [authCode, setAuthCode] = useState<string>('');
  const [isExchangingCode, setIsExchangingCode] = useState(false);

  // Listen for OAuth callback postMessage
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === 'BLING_AUTH_CODE' && event.data.code) {
        const receivedCode = event.data.code;
        setAuthCode(receivedCode);
        const currentCId = clientId || localStorage.getItem('fresa_master_bling_client_id') || '';
        const currentCSec = clientSecret || localStorage.getItem('fresa_master_bling_client_secret') || '';
        if (currentCId && currentCSec) {
          await handleExchangeCode(receivedCode, currentCId, currentCSec);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [clientId, clientSecret]);

  useEffect(() => { setClientData(quote.client); }, [quote.id, quote.client]);

  useEffect(() => {
    if (!isOpen) return;

    // Fetch token from server if not set
    const initTokenAndConnection = async () => {
      let tokenToUse = blingToken;
      let serverHasToken = false;
      if (!tokenToUse || !tokenToUse.trim()) {
        try {
          const statusRes = await apiFetch('/api/bling/status');
          const statusData = await statusRes.json();
          serverHasToken = Boolean(statusData.hasToken);
        } catch (error) {
          setConnectionStatus('disconnected');
          setConnectionMessage(error instanceof Error ? error.message : 'Não foi possível consultar a conexão do Bling.');
        }
      }

      if (((tokenToUse && tokenToUse.trim()) || serverHasToken) && connectionStatus !== 'connected') {
        testBlingConnection(tokenToUse);
      }
    };

    initTokenAndConnection();
  }, [isOpen, quote.id]);

  useEffect(() => {
    if (!isOpen || !['xml', 'json'].includes(activeTab)) return;
    let cancelled = false;
    const controller = new AbortController();
    setBlingXml('');
    setBlingJson(null);
    const issues = blingReadinessIssues(quote);
    if (issues.length) {
      setPayloadError(issues.join(' '));
      return;
    }
    setPayloadError(null);
    apiFetch('/api/bling/generate-payload', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: blingToken.trim() || undefined, quote }),
      signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Não foi possível gerar os arquivos do Bling.');
      if (!cancelled) { setBlingXml(data.blingXml); setBlingJson(data.blingJson); }
    }).catch((error: unknown) => {
      if (!cancelled) setPayloadError(error instanceof Error ? error.message : 'Falha ao gerar os arquivos do Bling.');
    });
    return () => { cancelled = true; controller.abort(); };
  }, [isOpen, activeTab, quote, blingToken]);

  const handleSaveToken = async (newToken: string) => {
    const trimmed = newToken.trim();
    setBlingToken(trimmed);
    localStorage.setItem('fresa_master_bling_token', trimmed);
    if (trimmed) {
      await testBlingConnection(trimmed);
    } else {
      setConnectionStatus('disconnected');
      setConnectionMessage('Token removido.');
    }
  };

  const handleStartOAuth = () => {
    if (!clientId.trim()) {
      alert('Informe o Client ID do seu aplicativo Bling.');
      return;
    }
    localStorage.setItem('fresa_master_bling_client_id', clientId.trim());
    localStorage.setItem('fresa_master_bling_client_secret', clientSecret.trim());
    
    const redirectUri = encodeURIComponent(`${supabaseUrl}/functions/v1/api/bling/oauth/callback`);
    const authUrl = `https://bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId.trim())}&state=fresa_master&redirect_uri=${redirectUri}`;
    
    // Open in comfortably sized window or new tab if screen is small
    const width = Math.min(850, window.screen.width - 40);
    const height = Math.min(850, window.screen.height - 80);
    const left = Math.max(0, (window.screen.width - width) / 2);
    const top = Math.max(0, (window.screen.height - height) / 2);
    
    const popup = window.open(
      authUrl,
      'BlingOAuthPopup',
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`
    );
    if (!popup) {
      window.open(authUrl, '_blank');
    }
  };

  const handleExchangeCode = async (codeToUse?: string, cId?: string, cSec?: string) => {
    const code = codeToUse || authCode;
    const cid = cId || clientId;
    const csec = cSec || clientSecret;

    if (!code.trim()) {
      alert('Informe o código de autorização gerado pelo Bling.');
      return;
    }
    if (!cid.trim() || !csec.trim()) {
      alert('Informe o Client ID e o Client Secret.');
      return;
    }

    setIsExchangingCode(true);
    setConnectionMessage('Trocando código de autorização pelo Token oficial do Bling...');

    try {
      const redirectUri = `${supabaseUrl}/functions/v1/api/bling/oauth/callback`;
      const res = await apiFetch('/api/bling/oauth/token-exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          clientId: cid.trim(),
          clientSecret: csec.trim(),
          redirectUri,
        }),
      });

      const data = await res.json();
      if (data.success && data.accessToken) {
        await handleSaveToken(data.accessToken);
        localStorage.setItem('fresa_master_bling_client_id', cid.trim());
        localStorage.setItem('fresa_master_bling_client_secret', csec.trim());
      } else {
        setConnectionStatus('disconnected');
        setConnectionMessage(`Falha na autorização: ${data.error || 'Erro ao obter token'}`);
      }
    } catch (err: any) {
      setConnectionStatus('disconnected');
      setConnectionMessage(`Erro de rede ao trocar código: ${err.message}`);
    } finally {
      setIsExchangingCode(false);
    }
  };

  const testBlingConnection = async (tokenToTest?: string) => {
    const token = tokenToTest || blingToken;
    setConnectionStatus('testing');
    setConnectionMessage('Testando conexão com a API v3 do Bling ERP...');

    try {
      const res = await apiFetch('/api/bling/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(token.trim() ? { token: token.trim() } : {}),
      });
      const data = await res.json();

      if (data.connected) {
        setConnectionStatus('connected');
        setConnectionMessage(data.message || 'Conectado com sucesso ao Bling ERP!');
      } else {
        setConnectionStatus('disconnected');
        setConnectionMessage(data.message || 'Não foi possível autenticar no Bling.');
      }
    } catch (err: any) {
      setConnectionStatus('disconnected');
      setConnectionMessage(`Erro na conexão: ${err.message}`);
    }
  };

  const callNfe = async (action: 'generate' | 'send' | 'status', payload: Record<string, unknown>) => {
    if (action !== 'status' && orderChanged) {
      setNfeError('O orçamento mudou depois de salvar o pedido. Revise os valores e itens no pedido existente no Bling antes de continuar; uma venda nova não será criada automaticamente.');
      return;
    }
    setNfeBusy(action);
    setNfeError(null);
    setNfeReadyToSend(false);
    try {
      const res = await apiFetch(`/api/bling/nfe/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote: { items: quote.items, financials: quote.financials }, ...payload, paymentMethod: quote.financials.paymentMethod, token: blingToken.trim() || undefined }),
      });
      const data = await res.json();
      if (data.nfeId || data.nfe?.id) {
        const nextNfe: BlingNfe = { ...(nfe || {}), ...(data.nfe || {}), id: data.nfeId ?? data.nfe?.id };
        setNfe(nextNfe);
        await onUpdateBling(quote.id, { ...quote.bling, ...(orderResult || {}), nfe: nextNfe });
      }
      setNfeReadyToSend(data.success === true && data.readyToSend === true);
      setNfeFiscalIssues(Array.isArray(data.fiscalIssues) ? data.fiscalIssues : []);
      if (!data.success) setNfeError(formatBlingError(data.details, data.error || 'Erro ao processar a NF-e no Bling.'));
    } catch (err: any) {
      setNfeError(`Falha de rede ou servidor: ${err.message}`);
    } finally {
      setNfeBusy(null);
    }
  };

  const handleCreateDirectOrder = async () => {
    if (orderResult || isSubmittingOrder) return;
    if (readinessIssues.length) { setOrderError(readinessIssues.join(' ')); return; }
    setIsSubmittingOrder(true);
    setOrderError(null);
    setDuplicateOrder(false);
    setOrderResult(null);
    setNfe(null);
    setNfeError(null);
    setNfeReadyToSend(false);
    setNfeFiscalIssues([]);

    try {
      const res = await apiFetch('/api/bling/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote: {
            ...quote,
            client: clientData,
          },
          token: blingToken.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        if (!data.blingOrderId) throw new Error('O Bling respondeu sem ID do pedido. Confira a venda no Bling antes de repetir.');
        setOrderResult({
          orderId: data.blingOrderId,
          orderNumber: data.blingOrderNumber,
          orderUrl: data.blingOrderUrl,
        });
        await onUpdateBling(quote.id, { orderId: data.blingOrderId, orderNumber: data.blingOrderNumber, orderUrl: data.blingOrderUrl, orderSnapshot: blingOrderSnapshot({ ...quote, client: clientData }) });
        setStatusMessage(`Pedido #${data.blingOrderNumber} criado com sucesso diretamente no Bling ERP!`);
      } else {
        setDuplicateOrder(isDuplicateBlingSale(data.blingDetails));
        setOrderError(
          data.blingDetails?.error?.type === 'insufficient_scope'
            ? 'O Bling conectado não tem permissão para criar Pedidos de Venda / NF-e (insufficient_scope).'
            : formatBlingError(data.blingDetails, data.error || 'Erro ao enviar o pedido para o Bling.')
        );
      }
    } catch (err: any) {
      setOrderError(`Falha de rede ou servidor: ${err.message}`);
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleSyncProducts = async () => {
    setIsSyncingProducts(true);
    try {
      const res = await apiFetch('/api/bling/products', {
        headers: blingToken.trim() ? { 'X-Bling-Token': blingToken.trim() } : {},
      });
      const data = await res.json();
      if (data.success) {
        setSyncedProducts(data.products || []);
      } else {
        alert(data.error || 'Não foi possível sincronizar os produtos do Bling.');
      }
    } catch (err: any) {
      alert(`Erro ao sincronizar produtos: ${err.message}`);
    } finally {
      setIsSyncingProducts(false);
    }
  };

  if (!isOpen) return null;

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCadastralFileUpload = (file: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setStatusMessage('Formato inválido. Selecione imagem (JPG/PNG) ou PDF do Cartão CNPJ.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const resultStr = e.target?.result as string;
      const isImage = file.type.startsWith('image/');
      setAttachedDoc({
        name: file.name,
        size: file.size,
        type: file.type,
        base64: resultStr,
        previewUrl: isImage ? resultStr : undefined,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleProcessCadastral = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!cadastralInput.trim() && !attachedDoc) return;

    setIsProcessing(true);
    setStatusMessage(null);

    try {
      const payload: any = {
        text: cadastralInput,
        currentClient: clientData,
      };

      if (attachedDoc) {
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
        setClientData(data.client);
        onUpdateClient(data.client);
        setStatusMessage(
          attachedDoc
            ? 'Dados cadastrais do Cartão CNPJ lidos e estruturados com sucesso para o Bling!'
            : 'Dados cadastrais extraídos com sucesso para emissão de NF-e!'
        );
        setActiveTab('direct');
      } else {
        setStatusMessage('Não foi possível extrair todos os dados cadastrais.');
      }
    } catch (err: any) {
      console.error('Erro:', err);
      setStatusMessage('Falha ao processar dados cadastrais.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCnpjFound = async (lookupClient: ClientInfo) => {
    const sameClient = String(clientData.document || '').replace(/\D/g, '') === String(lookupClient.document || '').replace(/\D/g, '');
    const nextClient = sameClient
      ? {
          ...clientData,
          ...lookupClient,
          email: lookupClient.email || clientData.email || '',
          phone: lookupClient.phone || clientData.phone || '',
          ie: lookupClient.ie || (/^\s*isent[oa]\s*$/i.test(clientData.ie || '') ? '' : clientData.ie || ''),
        }
      : lookupClient;
    setClientData(nextClient);
    onUpdateClient(nextClient);
    setStatusMessage('Cadastro localizado. Confira os dados e a Inscrição Estadual antes de emitir a NF-e.');
  };

  const handleDownloadXml = () => {
    const dataStr = 'data:text/xml;charset=utf-8,' + encodeURIComponent(blingXml);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `pedido-venda-bling-${quote.id}.xml`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const SAMPLE_CADASTRAL = `Razão Social: MÓVEIS REQUINTE INDUSTRIA E COMERCIO LTDA
Nome Fantasia: Móveis Requinte CNC
CNPJ: 14.890.123/0001-45
Inscrição Estadual: 90812345-67
Endereço: Rua das Indústrias Moveleiras, 500 - Galpão 2
Bairro: Polo Industrial
Cidade: Curitiba - PR
CEP: 80010-000
E-mail para envio de XML/DANFE: fiscal@moveisrequinte.com.br
Telefone/WhatsApp: (41) 98888-5544`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-5xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 sm:px-7 py-4 sm:py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 text-white">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  Integração Bling ERP &amp; NF-e
                </h3>
                <span className="text-[11px] font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-400/40">
                  API v3
                </span>
                {connectionStatus === 'connected' && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/50">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    Bling Online &amp; Conectado
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
                Fresa Master ➔ Pedido de Venda com classificação fiscal conferida e cálculo de frete
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmittingOrder || nfeBusy !== null}
            className="p-2 sm:p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Fechar Janela"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Workflow Steps Indicator */}
        <div className="bg-slate-50 dark:bg-slate-950/70 px-5 sm:px-7 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs sm:text-sm font-semibold overflow-x-auto gap-4">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>1. Orçamento ({quote.id})</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 dark:text-slate-600 shrink-0" />
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 shrink-0">
            <FileText className="w-4 h-4 text-blue-600 shrink-0" />
            <span>2. Dados Cadastrais / CNPJ</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 dark:text-slate-600 shrink-0" />
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold shrink-0">
            <Zap className="w-4 h-4 text-amber-500 shrink-0" />
            <span>3. Criação Direta no Bling</span>
          </div>
        </div>

        {/* Tabs - Spacious and Touch Friendly */}
        <div className="flex items-center gap-2 px-5 sm:px-7 pt-3.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto text-xs sm:text-sm font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('direct')}
            className={`pb-3 px-4 border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === 'direct'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 font-black'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Zap className="w-4 h-4 text-emerald-600" />
            <span>🚀 Conectar &amp; Criar Pedido</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cadastral')}
            className={`pb-3 px-4 border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === 'cadastral'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 font-black'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <FileText className="w-4 h-4 text-blue-500" />
            <span>📋 Dados Cadastrais (CNPJ)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('products')}
            className={`pb-3 px-4 border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === 'products'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 font-black'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <Layers className="w-4 h-4 text-amber-500" />
            <span>📦 Catálogo do Bling</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('app_register')}
            className={`pb-3 px-4 border-b-2 transition whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === 'app_register'
                ? 'border-amber-500 text-amber-700 dark:text-amber-400 font-black'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <KeyRound className="w-4 h-4 text-amber-500" />
            <span>🔑 Instruções &amp; Links</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('xml')}
            className={`pb-3 px-3 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'xml'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 font-black'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            📄 XML
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('json')}
            className={`pb-3 px-3 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'json'
                ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 font-black'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            ⚡ JSON
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4 text-xs">
          {statusMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* TAB: DIRECT BLING CONNECTION & INSTANT ORDER CREATION */}
          {activeTab === 'direct' && (
            <div className="space-y-4">
              {/* Token Configuration Box */}
              <div className="bg-gradient-to-br from-emerald-500/5 via-teal-500/5 to-slate-50 dark:to-slate-950/80 border border-emerald-500/30 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-200/50 dark:border-slate-800/80 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Building className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 dark:text-slate-100 text-base">
                          Conta Oficial Fresa Master no Bling
                        </span>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Pronto para Pedidos
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        API v3 oficial integrada com Salto/SP • Criação direta de Pedido de Venda e NF-e
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => testBlingConnection(blingToken)}
                      disabled={connectionStatus === 'testing'}
                      className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold border border-slate-200 dark:border-slate-700 transition cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                      title="Testa a comunicação com o Bling"
                    >
                      {connectionStatus === 'testing' ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                          <span>Testando...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Testar Conexão</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {connectionMessage && (
                  <div className={`p-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 ${
                    connectionStatus === 'connected'
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                      : connectionStatus === 'testing'
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
                  }`}>
                    {connectionStatus === 'connected' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <span>{connectionMessage}</span>
                  </div>
                )}

                {/* Collapsible token edit for simplicity */}
                <details className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer pt-1">
                  <summary className="font-bold text-slate-700 dark:text-slate-300 hover:text-emerald-600 transition select-none flex items-center gap-1">
                    <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                    <span>Ver ou alterar Token do Bling manualmente</span>
                  </summary>
                  <div className="mt-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <label className="text-[11px] font-bold text-slate-500 block">
                      Token Bearer API v3:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={blingToken}
                        onChange={(e) => setBlingToken(e.target.value)}
                        placeholder="Token de acesso do Bling..."
                        className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 font-mono bg-slate-50 dark:bg-slate-950"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveToken(blingToken)}
                        className="px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-lg hover:bg-emerald-700 transition"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                </details>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-800 leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    💡 <strong>Prefere sem burocracia?</strong> Acesse seu Bling em <em>Preferências &gt; Sistema &gt; Usuários e Usuário API</em> para gerar a chave em 1 minuto sem precisar de aplicativo nem Swagger.
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('app_register')}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-xs font-bold transition cursor-pointer whitespace-nowrap self-start sm:self-auto shrink-0 flex items-center gap-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                    <span>Ver Links &amp; Escopos do Bling</span>
                  </button>
                </div>
              </div>

              {/* Instant Order Creation Action Card */}
              <div className="bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/40 border-2 border-emerald-500/40 rounded-2xl p-5 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-200/60 dark:border-emerald-900/40 pb-3">
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-emerald-600" />
                      <span>Criar Pedido de Venda Diretamente no Bling ERP</span>
                    </h4>
                    <p className="text-slate-600 dark:text-slate-400 text-xs mt-0.5">
                      Envia o pedido via API v3 com itens, pagamento, frete e dados cadastrais. Confirme o NCM vigente de cada item antes de emitir.
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Total do Pedido:</span>
                    <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-400 font-mono">
                      R$ {Number(quote.financials?.totalAmount || 0).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                </div>

                {/* Summary checklist before sending */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[11px]">
                  <div className="bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 block font-medium">Cliente / Faturamento:</span>
                    <strong className="text-slate-800 dark:text-slate-200 truncate block">
                      {clientData.name || 'Cliente Não Informado'}
                    </strong>
                    <span className="text-[10px] text-slate-500">
                      {clientData.document ? `Doc: ${clientData.document}` : '⚠️ Sem CNPJ/CPF'}
                    </span>
                  </div>

                  <div className="bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 block font-medium">Fresas & Ferramentas:</span>
                    <strong className="text-slate-800 dark:text-slate-200 block">
                      {quote.items.length} {quote.items.length === 1 ? 'ferramenta' : 'ferramentas'} (NCM por item)
                    </strong>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                      Subtotal: R$ {Number(quote.financials?.subtotal || 0).toFixed(2).replace('.', ',')}
                    </span>
                  </div>

                  <div className="bg-white dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 block font-medium">Frete & Envio:</span>
                    <strong className="text-slate-800 dark:text-slate-200 truncate block">
                      {quote.shipping?.selectedOption?.name || 'Sedex (Melhor Envio)'}
                    </strong>
                    <span className="text-[10px] text-slate-500 font-mono">
                      R$ {Number(quote.financials?.shippingAmount || 0).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                </div>

                {/* Error Banner */}
                {readinessIssues.length > 0 && (
                  <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-200">
                    <strong>Corrija estas pendências antes de criar a venda:</strong>
                    <ul className="mt-2 list-disc space-y-1 pl-5">{readinessIssues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                    <p className="mt-2">Feche este modal para editar os itens; use o catálogo para selecionar o SKU. Dados fiscais não são substituídos automaticamente.</p>
                  </div>
                )}
                {orderError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl text-red-800 dark:text-red-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block">Erro no Bling ERP:</strong>
                      <span>{orderError}</span>
                      <p className="mt-1 text-[11px] text-red-700 dark:text-red-400">
                        {duplicateOrder
                          ? 'O Bling bloqueou uma venda duplicada. Confira o pedido já salvo em Vendas > Pedidos de Venda e continue o faturamento nele. Não altere os dados apenas para contornar esse bloqueio.'
                          : orderError.includes('permissão')
                          ? 'No painel de desenvolvedor do Bling, abra o aplicativo, marque as permissões "Pedidos de Vendas" e "Notas Fiscais" (leitura e gravação), salve e depois reconecte o Bling.'
                          : 'Dica: Verifique se os dados do cliente possuem Razão Social e CNPJ válidos na aba "📋 Dados do Cliente".'}
                      </p>
                      {duplicateOrder && (
                        <a href="https://www.bling.com.br/b/vendas.php" target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-bold underline">
                          Conferir pedidos no Bling <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* Success Banner with Direct Bling Link */}
                {orderResult && (
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/60 border-2 border-emerald-500 rounded-xl text-emerald-900 dark:text-emerald-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div>
                          <strong className="text-sm block">Pedido Criado Diretamente no Bling com Sucesso!</strong>
                          <span className="text-xs text-emerald-700 dark:text-emerald-300">
                            Número do Pedido no Bling: <strong>#{orderResult.orderNumber}</strong> (ID: {orderResult.orderId})
                          </span>
                        </div>
                      </div>
                      {orderResult.orderUrl && (
                        <a
                          href={orderResult.orderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 shrink-0"
                        >
                          <span>Abrir no Bling</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                    <p className="text-[11px] text-emerald-800 dark:text-emerald-300 border-t border-emerald-200 dark:border-emerald-800/60 pt-2">
                      O pedido foi salvo no Bling. A NF-e ainda exige conferência fiscal, série 2 e confirmação do ambiente antes da transmissão.
                    </p>
                  </div>
                )}

                {orderResult && (
                  <div className="p-4 bg-white dark:bg-slate-900 border-2 border-indigo-500 rounded-xl space-y-3">
                    <strong className="text-sm block text-indigo-900 dark:text-indigo-200">Nota Fiscal (NF-e)</strong>
                    {orderChanged && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">O orçamento mudou após criar o pedido. Restaure no orçamento os dados da venda já salva ou conclua a revisão e emissão no Bling. Geração e transmissão ficam bloqueadas aqui para não faturar dados diferentes.</p>}
                    {!nfe?.id ? (
                      <button
                        type="button"
                        onClick={() => callNfe('generate', { orderId: orderResult.orderId, quote: { items: quote.items, financials: quote.financials } })}
                        disabled={nfeBusy !== null || readinessIssues.length > 0 || orderChanged}
                        className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs disabled:opacity-50 cursor-pointer"
                      >
                        {nfeBusy === 'generate' ? 'Gerando NF-e...' : 'Gerar NF-e a partir do pedido'}
                      </button>
                    ) : (
                      <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                        <p>
                          Situação: <strong>{String(nfe.situacao ?? 'rascunho')}</strong>
                          {nfe.numero ? <> • Número: <strong>{nfe.numero}</strong></> : null}
                          {nfe.serie ? <> • Série: <strong>{nfe.serie}</strong></> : null}
                        </p>
                        {nfe.chaveAcesso && <p className="break-all">Chave de acesso: <strong>{nfe.chaveAcesso}</strong></p>}
                        <div className="flex flex-wrap gap-2">
                          <a href={`https://www.bling.com.br/notas.fiscais.php#edit/${nfe.id}`} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 font-bold">Revisar no Bling</a>
                          <button type="button" onClick={() => { if (window.confirm('Confirme o ambiente da nota no Bling e a série 2 antes de enviar. Transmitir esta NF-e para a SEFAZ? Depois de autorizada, só pode ser cancelada dentro do prazo legal.')) callNfe('send', { nfeId: nfe.id }); }} disabled={nfeBusy !== null || !nfeReadyToSend || orderChanged} className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold disabled:opacity-50 cursor-pointer">
                            {nfeBusy === 'send' ? 'Enviando...' : 'Enviar à SEFAZ'}
                          </button>
                          <button type="button" onClick={() => callNfe('status', { nfeId: nfe.id })} disabled={nfeBusy !== null} className="px-3 py-2 rounded-lg border border-slate-300 font-bold disabled:opacity-50 cursor-pointer">
                            {nfeBusy === 'status' ? 'Consultando...' : 'Atualizar status'}
                          </button>
                          {nfe.linkDanfe && <a href={nfe.linkDanfe} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-lg border border-emerald-400 text-emerald-700 font-bold">DANFE</a>}
                        </div>
                      </div>
                    )}
                    {nfeError && <p className="text-xs text-red-600 font-semibold">{nfeError}</p>}
                    {nfeFiscalIssues.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300 font-semibold">{nfeFiscalIssues.join(' ')}</p>}
                  </div>
                )}

                {/* Big Action Submit Button */}                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Transmissão segura via API v3 oficial do Bling ERP</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateDirectOrder}
                    disabled={isSubmittingOrder || readinessIssues.length > 0 || Boolean(orderResult)}
                    className="px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm shadow-lg hover:shadow-xl transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSubmittingOrder ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>Criando Pedido no Bling ERP...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-5 h-5 text-amber-300" />
                        <span>{orderResult ? 'Pedido já vinculado — continue na NF-e acima' : '🚀 Criar Pedido de Venda no Bling Agora'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: BLING APP REGISTRATION GUIDE (LINKS & SCOPES) */}
          {activeTab === 'app_register' && (() => {
            const origin = typeof window !== 'undefined' ? window.location.origin : 'https://fresamaster.run.app';
            const redirectUrl = `${supabaseUrl}/functions/v1/api/bling/oauth/callback`;
            const homepageUrl = `${origin}/`;
            const manualUrl = `${origin}/manual`;
            const logoUrl = `${origin}/logo.svg`;
            const scopesList = [
              { code: 'pedidos:vendas:write', label: 'Pedidos de Venda - Gravação', desc: 'Necessário para enviar o pedido aprovado com fresas e frete.' },
              { code: 'pedidos:vendas:read', label: 'Pedidos de Venda - Leitura', desc: 'Para consultar o número do pedido gerado no Bling e acompanhar faturamento.' },
              { code: 'contatos:write', label: 'Contatos / Clientes - Gravação', desc: 'Para cadastrar a Razão Social, CNPJ, IE e endereço de entrega do cliente.' },
              { code: 'contatos:read', label: 'Contatos / Clientes - Leitura', desc: 'Para buscar clientes já cadastrados e evitar duplicidade.' },
              { code: 'produtos:read', label: 'Produtos / Fresas - Leitura', desc: 'Para sincronizar o catálogo de ferramentas e consultar SKUs cadastrados.' },
              { code: 'produtos:write', label: 'Produtos / Fresas - Gravação', desc: 'Necessário para cadastrar produtos novos diretamente no Bling.' },
            ];
            const allScopesString = scopesList.map(s => s.code).join(' ');

            return (
              <div className="space-y-4">
                {/* Alternative Quick Route Banner */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 text-slate-800 dark:text-slate-200">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                          ⚡ Atalho de 1 Minuto: Criar "Usuário API" (Sem Burocracia)
                        </h4>
                        <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-300 dark:border-amber-800">
                          Recomendado para Uso Próprio
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        Se você precisa da integração para a <strong>sua própria conta da Fresa Master emitir pedidos e NF-e</strong>, você <strong>não precisa passar pelo processo de aprovação de aplicativo do Bling</strong>! Faça o seguinte:
                      </p>
                      <ol className="text-xs text-slate-700 dark:text-slate-300 list-decimal pl-4 space-y-1 pt-1">
                        <li>No Bling, clique na <strong>engrenagem (Preferências) &gt; Sistema &gt; Usuários e Usuário API</strong>.</li>
                        <li>Clique em <strong>"Incluir Usuário"</strong> e selecione o tipo <strong>"Usuário API"</strong>.</li>
                        <li>Preencha o Nome (ex: <em>Fresa Master API</em>) e e-mail (<em>fresamaster0@gmail.com</em>).</li>
                        <li>Na aba <strong>Permissões</strong>, marque <strong>Vendas &gt; Pedidos de Venda</strong> e <strong>Cadastros &gt; Contatos e Produtos</strong>.</li>
                        <li>Clique em <strong>Gerar API Key</strong> (ou Salvar). Copie a chave e cole diretamente na aba <em>"🚀 Conectar &amp; Criar Pedido"</em>. Não precisa de vídeo nem aprovação!</li>
                      </ol>
                    </div>
                  </div>
                </div>

                {/* Official Application Registration Form Fields */}
                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-4">
                  <div>
                    <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-emerald-600" />
                      <span>Campos para o Formulário "Cadastrar Aplicativo" no Bling</span>
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Se você optou por cadastrar o aplicativo na Central de Desenvolvedores, copie os dados abaixo:
                    </p>
                  </div>

                  {/* Field 1: Nome do Aplicativo */}
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Nome do Aplicativo</span>
                      <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                        Fresa Master CNC
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText('Fresa Master CNC', 'app_name')}
                      className="px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {copiedKey === 'app_name' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'app_name' ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>

                  {/* Field 2: Link de Redirecionamento (Callback URI) */}
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Link de Redirecionamento (Callback URI / Redirect URL)</span>
                        <span className="text-[9px] font-extrabold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.2 rounded">Obrigatório</span>
                      </div>
                      <div className="font-mono text-xs text-emerald-600 dark:text-emerald-400 truncate">
                        {redirectUrl}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText(redirectUrl, 'redirect_url')}
                      className="px-2.5 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                    >
                      {copiedKey === 'redirect_url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'redirect_url' ? 'Copiado!' : 'Copiar Link'}</span>
                    </button>
                  </div>

                  {/* Field 3: Link da Homepage */}
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Link da Homepage (URL do Aplicativo)</span>
                      <div className="font-mono text-xs text-slate-800 dark:text-slate-200 truncate">
                        {homepageUrl}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText(homepageUrl, 'homepage_url')}
                      className="px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                    >
                      {copiedKey === 'homepage_url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'homepage_url' ? 'Copiado!' : 'Copiar Link'}</span>
                    </button>
                  </div>

                  {/* Field 4: Link do Manual */}
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Link do Manual (Documentação e Avaliação Bling)</span>
                        <a 
                          href="/manual" 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                        >
                          <span>Abrir Manual</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <div className="font-mono text-xs text-blue-600 dark:text-blue-400 truncate">
                        {manualUrl}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText(manualUrl, 'manual_url')}
                      className="px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                    >
                      {copiedKey === 'manual_url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'manual_url' ? 'Copiado!' : 'Copiar Link'}</span>
                    </button>
                  </div>

                  {/* Field 5: Imagem do Aplicativo (Ícone) */}
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-slate-900 border border-slate-700 overflow-hidden shrink-0 flex items-center justify-center p-1">
                        <img src="/logo.svg" alt="Fresa Master Logo" className="w-full h-full object-contain" />
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Imagem do Aplicativo (Ícone 512x512 Oficial)</span>
                        <div className="font-mono text-xs text-slate-800 dark:text-slate-200 truncate">
                          {logoUrl}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href="/logo.svg"
                        target="_blank"
                        rel="noreferrer"
                        className="px-2 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1"
                        title="Ver Imagem"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Ver</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => copyText(logoUrl, 'logo_url')}
                        className="px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                      >
                        {copiedKey === 'logo_url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'logo_url' ? 'Copiado!' : 'Copiar Link'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Field 6: Link do Vídeo Demonstrativo */}
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Link do Vídeo Demonstrativo</span>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        O Bling pede um vídeo no YouTube (pode ser <strong>Não Listado</strong>) de ~1 minuto mostrando o Fresa Master calculando frete e gerando o pedido.
                      </p>
                      <div className="font-mono text-xs text-indigo-600 dark:text-indigo-400">
                        https://www.youtube.com/watch?v=dQw4w9WgXcQ
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'video_url')}
                      className="px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 self-start sm:self-auto"
                    >
                      {copiedKey === 'video_url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'video_url' ? 'Copiado!' : 'Copiar Link'}</span>
                    </button>
                  </div>
                </div>

                {/* Field 7: Lista de Escopos (Scopes) */}
                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>Lista de Escopos Necessários para o Bling</span>
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Selecione estas permissões na tela do Bling para que a integração funcione:
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText(allScopesString, 'all_scopes')}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0"
                    >
                      {copiedKey === 'all_scopes' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Copiar Todos os Escopos</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {scopesList.map((scope, idx) => (
                      <div key={idx} className="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-800">
                              {scope.code}
                            </span>
                            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                              {scope.label}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {scope.desc}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyText(scope.code, `scope_${idx}`)}
                          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer shrink-0"
                          title="Copiar escopo"
                        >
                          {copiedKey === `scope_${idx}` ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl text-blue-900 dark:text-blue-200 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Após salvar o cadastro no Bling:</strong> O Bling disponibilizará o seu <strong>Token de Acesso</strong> ou Client ID/Secret. Copie o Token e cole na aba <em>"🚀 Conectar &amp; Criar Pedido no Bling"</em>.
                  </div>
                </div>
              </div>
            );
          })()}

          {/* TAB: CADASTRAL DATA / CARTAO CNPJ */}
          {activeTab === 'cadastral' && (
            <div className="space-y-4">
              <CnpjLookup initialCnpj={clientData.document} onFound={handleCnpjFound} />

              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl p-4">
                <h4 className="font-bold text-blue-900 dark:text-blue-200 mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  Preenchimento Cadastral com IA:
                </h4>
                <p className="text-blue-800 dark:text-blue-300 leading-relaxed">
                  Quando o cliente aprovar o orçamento da Fresa Master, peça os dados cadastrais (por WhatsApp, e-mail ou foto do Cartão CNPJ). Cole a mensagem ou anexe o PDF/imagem e a IA preencherá automaticamente a Razão Social, CNPJ, Inscrição Estadual e CEP para o Bling.
                </p>
                <button
                  type="button"
                  onClick={() => setCadastralInput(SAMPLE_CADASTRAL)}
                  className="mt-2 text-[11px] font-semibold text-blue-700 dark:text-blue-400 underline cursor-pointer"
                >
                  Carregar exemplo de cadastro completo
                </button>
              </div>

              <form onSubmit={handleProcessCadastral} className="space-y-3">
                {/* File Upload for Cartão CNPJ */}
                <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Anexar Cartão CNPJ (Foto / PDF):</span>
                    </label>
                    <span className="text-[10px] text-slate-400">Opcional</span>
                  </div>

                  {!attachedDoc ? (
                    <div
                      onClick={() => blingFileInputRef.current?.click()}
                      className="border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 bg-white dark:bg-slate-900 rounded-lg p-3 text-center cursor-pointer transition flex items-center justify-center gap-2"
                    >
                      <UploadCloud className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                        Clique para anexar foto ou PDF do Cartão CNPJ
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg p-2">
                      <div className="flex items-center gap-2 truncate">
                        <File className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span className="font-semibold text-emerald-900 dark:text-emerald-200 truncate text-xs">
                          {attachedDoc.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAttachedDoc(null)}
                        className="text-red-600 hover:text-red-700 text-xs font-semibold px-2 cursor-pointer flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remover</span>
                      </button>
                    </div>
                  )}

                  <input
                    ref={blingFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/jpg,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleCadastralFileUpload(e.target.files[0]);
                      }
                    }}
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Ou cole aqui os dados cadastrais enviados pelo cliente:
                  </label>
                  <textarea
                    rows={5}
                    value={cadastralInput}
                    onChange={(e) => setCadastralInput(e.target.value)}
                    placeholder="Ex: Razão Social da empresa, CNPJ, Inscrição Estadual, CEP, Endereço com número, E-mail para NF-e..."
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:border-emerald-500 outline-none leading-relaxed"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isProcessing || (!cadastralInput.trim() && !attachedDoc)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs transition cursor-pointer disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Extraindo e formatando para o Bling...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{attachedDoc ? 'Ler Cartão CNPJ com IA' : 'Processar Cadastro com IA'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Current Extracted Client Summary */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50 dark:bg-slate-950/60 space-y-2">
                <h5 className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Dados Atuais do Cliente para a NF-e:</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    {clientData.document ? `CNPJ/CPF: ${clientData.document}` : 'Aguardando CNPJ'}
                  </span>
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                  <p><strong>Razão Social:</strong> {clientData.name || 'Não informado'}</p>
                  <p><strong>Nome Fantasia:</strong> {clientData.tradeName || '-'}</p>
                  <p><strong>Inscrição Estadual:</strong> {clientData.ie || 'Não informada'}</p>
                  <p><strong>CEP:</strong> {clientData.cep || 'Não informado'}</p>
                  <p><strong>Cidade/UF:</strong> {clientData.city || '-'}/{clientData.state || '-'}</p>
                  <p><strong>E-mail NF-e:</strong> {clientData.email || 'Não informado'}</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB: SYNC LIVE PRODUCTS FROM BLING */}
          {activeTab === 'products' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950/60 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-slate-100">Catálogo de Produtos do seu Bling ERP</h4>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                    Sincronize as fresas e ferramentas cadastradas diretamente na sua conta do Bling
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSyncProducts}
                  disabled={isSyncingProducts || !blingToken.trim()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingProducts ? 'animate-spin' : ''}`} />
                  <span>Sincronizar Produtos do Bling</span>
                </button>
              </div>

              {syncedProducts && syncedProducts.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {syncedProducts.length} produtos localizados na sua conta Bling:
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                    {syncedProducts.map((p: any, idx: number) => (
                      <div key={idx} className="p-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between">
                        <div className="truncate pr-2">
                          <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400 font-bold block">{p.codigo || 'Sem SKU'}</span>
                          <strong className="text-slate-800 dark:text-slate-200 text-xs block truncate">{p.nome || p.descricao}</strong>
                        </div>
                        <span className="font-mono font-bold text-emerald-600 text-xs shrink-0">
                          R$ {Number(p.preco || 0).toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  <PackageCheck className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
                  <p>Clique em <strong>"Sincronizar Produtos do Bling"</strong> para puxar os itens cadastrados no seu ERP.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB: XML FILE */}
          {activeTab === 'xml' && (
            <div className="space-y-4">
              {payloadError && <p className="text-xs text-red-600 font-semibold">{payloadError}</p>}
              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h4 className="font-bold text-emerald-900 dark:text-emerald-200 mb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Arquivo de Importação XML Pronto para o Bling
                  </h4>
                  <p className="text-emerald-800 dark:text-emerald-300 text-[11px] leading-relaxed">
                    Baixe o arquivo XML abaixo. No Bling, acesse <strong>Vendas &gt; Pedidos de Venda &gt; Opções &gt; Importar Pedidos de Venda via XML</strong>. Confira o NCM dos itens, pagamento, frete e cadastro fiscal antes de gerar a NF-e.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadXml}
                  disabled={!blingXml}
                  className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-sm transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar XML do Bling</span>
                </button>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between font-semibold text-slate-600 dark:text-slate-400">
                  <span>Conteúdo do Arquivo XML:</span>
                  <button
                    type="button"
                    onClick={() => copyText(blingXml, 'xml')}
                    disabled={!blingXml}
                    className="text-blue-600 hover:underline cursor-pointer flex items-center gap-1"
                  >
                    {copiedKey === 'xml' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'xml' ? 'Copiado!' : 'Copiar XML'}</span>
                  </button>
                </div>
                <pre className="p-4 bg-slate-900 text-emerald-400 rounded-xl font-mono text-[11px] max-h-72 overflow-y-auto leading-relaxed border border-slate-800">
                  {blingXml}
                </pre>
              </div>
            </div>
          )}

          {/* TAB: JSON PAYLOAD */}
          {activeTab === 'json' && (
            <div className="space-y-3">
              {payloadError && <p className="text-xs text-red-600 font-semibold">{payloadError}</p>}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200">Payload Bling API v3 (/pedidos/vendas)</h4>
                  <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                    Utilize caso queira inspecionar ou enviar o pedido via endpoint manual da API do Bling
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!blingJson}
                  onClick={() => copyText(JSON.stringify(blingJson, null, 2), 'json')}
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                >
                  {copiedKey === 'json' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'json' ? 'Copiado!' : 'Copiar JSON'}</span>
                </button>
              </div>

              <pre className="p-4 bg-slate-900 text-blue-300 rounded-xl font-mono text-[11px] max-h-72 overflow-y-auto leading-relaxed border border-slate-800">
                {JSON.stringify(blingJson, null, 2)}
              </pre>
            </div>
          )}

          {/* TAB: MANUAL QUICK COPY */}
          {activeTab === 'manual' && (
            <div className="space-y-3">
              <p className="text-slate-600 dark:text-slate-400">
                Precisa preencher algum campo manualmente no Bling? Clique no botão ao lado para copiar instantaneamente:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { label: 'Razão Social', val: clientData.name, key: 'name' },
                  { label: 'CNPJ / CPF', val: clientData.document, key: 'doc' },
                  { label: 'Inscrição Estadual', val: clientData.ie, key: 'ie' },
                  { label: 'CEP', val: clientData.cep, key: 'cep' },
                  { label: 'Endereço', val: `${clientData.address || ''}, ${clientData.number || 'S/N'}`, key: 'addr' },
                  { label: 'Bairro', val: clientData.neighborhood, key: 'bairro' },
                  { label: 'Cidade/UF', val: `${clientData.city || ''}/${clientData.state || ''}`, key: 'city' },
                  { label: 'E-mail para NF-e', val: clientData.email, key: 'email' },
                  { label: 'Telefone', val: clientData.phone, key: 'phone' },
                  { label: 'Valor Frete (R$)', val: Number(quote.financials.shippingAmount || 0).toFixed(2), key: 'frete' },
                  { label: 'Total do Pedido (R$)', val: Number(quote.financials.totalAmount || 0).toFixed(2), key: 'total' },
                ].map((item, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between gap-2">
                    <div className="truncate">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">{item.label}</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">{item.val || '-'}</span>
                    </div>
                    {item.val && (
                      <button
                        type="button"
                        onClick={() => copyText(String(item.val), item.key)}
                        className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition cursor-pointer"
                        title="Copiar"
                      >
                        {copiedKey === item.key ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Fresa Master ➔ Bling Pedido de Venda com <strong>NCM confirmado por item</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmittingOrder || nfeBusy !== null}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
