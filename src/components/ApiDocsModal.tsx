import React, { useState } from 'react';
import { X, Key, Code, Copy, Check, Terminal, ExternalLink, Play, ArrowRight } from 'lucide-react';

interface ApiDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  appUrl?: string;
}

export const ApiDocsModal: React.FC<ApiDocsModalProps> = ({ isOpen, onClose, appUrl }) => {
  const [activeTab, setActiveTab] = useState<'guide' | 'curl' | 'javascript' | 'python' | 'direct-gemini' | 'schema'>('guide');
  const [copied, setCopied] = useState<string | null>(null);
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  if (!isOpen) return null;

  const currentHost = typeof window !== 'undefined' ? window.location.origin : (appUrl || 'https://seu-app.run.app');

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleTestApi = async () => {
    setIsTesting(true);
    setTestResponse(null);
    try {
      const res = await fetch('/api/quote/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Olá! Sou o Carlos da Silva (tel 11 99999-8888). Preciso de orçamento para 30 horas de consultoria técnica e 2 servidores configurados. Entrega em 10 dias.',
        }),
      });
      const data = await res.json();
      setTestResponse(JSON.stringify(data, null, 2));
    } catch (err: any) {
      setTestResponse(JSON.stringify({ error: err.message }, null, 2));
    } finally {
      setIsTesting(false);
    }
  };

  const curlCode = `curl -X POST "${currentHost}/api/quote/extract" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "Olá! Sou o Carlos da Silva (tel: 11 99999-8888). Preciso de orçamento para reforma da recepção de 50m² e pintura completa. Prazo de 15 dias, pagamento 50/50."
  }'`;

  const jsCode = `// No backend do seu aplicativo (Node.js, Next.js, Express, etc.)
async function preencherOrcamentoComIA(mensagemDoCliente) {
  const response = await fetch("${currentHost}/api/quote/extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: mensagemDoCliente,
      customInstructions: "Calcular valores na moeda BRL com 15 dias de validade"
    }),
  });

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Erro ao processar orçamento");
  }

  // Objeto pronto com client, items, financials, project e missingInfo
  console.log("Cliente:", data.quote.client.name);
  console.log("Total R$:", data.quote.financials.totalAmount);
  console.log("Itens extraídos:", data.quote.items);
  return data.quote;
}`;

  const pythonCode = `import requests

def extrair_orcamento_cliente(mensagem_cliente: str):
    url = "${currentHost}/api/quote/extract"
    payload = {
        "text": mensagem_cliente,
        "customInstructions": "Valores em reais (BRL)"
    }
    
    response = requests.post(url, json=payload)
    data = response.json()
    
    if data.get("success"):
        orcamento = data["quote"]
        print(f"Cliente: {orcamento['client']['name']}")
        print(f"Total: R$ {orcamento['financials']['totalAmount']}")
        return orcamento
    else:
        raise Exception(data.get("error", "Erro ao extrair orçamento"))`;

  const geminiDirectCode = `// Se preferir chamar a API Gemini diretamente no seu app usando o SDK @google/genai:
import { GoogleGenAI, Type } from "@google/genai";

// Obtenha sua chave em https://aistudio.google.com/app/apikey
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function extrairFormularioOrcamento(textoCliente) {
  const response = await ai.models.generateContent({
    model: "gemini-3.8-flash",
    contents: \`Extraia os dados deste cliente e monte o orçamento comercial: \${textoCliente}\`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          client: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              company: { type: Type.STRING },
              phone: { type: Type.STRING },
              email: { type: Type.STRING },
            },
            required: ["name"]
          },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING },
                quantity: { type: Type.NUMBER },
                unitPrice: { type: Type.NUMBER },
                totalPrice: { type: Type.NUMBER }
              },
              required: ["description", "quantity", "unitPrice"]
            }
          },
          financials: {
            type: Type.OBJECT,
            properties: {
              subtotal: { type: Type.NUMBER },
              totalAmount: { type: Type.NUMBER },
              paymentTerms: { type: Type.STRING }
            },
            required: ["totalAmount"]
          }
        },
        required: ["client", "items", "financials"]
      }
    }
  });

  return JSON.parse(response.text);
}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Guia de Chave de API & Integração com seu App
              </h3>
              <p className="text-xs text-slate-500">
                Como obter sua chave no Google AI Studio e integrar a extração de orçamentos
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-200 bg-white overflow-x-auto text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('guide')}
            className={`pb-2.5 px-3 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'guide'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            🔑 Como Obter a Chave
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('curl')}
            className={`pb-2.5 px-3 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'curl'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Terminal / cURL
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('javascript')}
            className={`pb-2.5 px-3 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'javascript'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            JavaScript / Node
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('python')}
            className={`pb-2.5 px-3 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'python'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Python
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('direct-gemini')}
            className={`pb-2.5 px-3 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'direct-gemini'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            SDK Gemini Direto
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schema')}
            className={`pb-2.5 px-3 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'schema'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Playground / Testar API
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {activeTab === 'guide' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="font-bold text-blue-900 text-sm mb-1 flex items-center gap-2">
                  <Key className="w-4 h-4 text-blue-600" />
                  Passo a Passo: Como Obter Sua Chave da API Gemini
                </h4>
                <p className="text-blue-800 leading-relaxed mb-3">
                  Para utilizar a inteligência artificial do Google Gemini no seu próprio aplicativo ou conectar nesta API, você precisa de uma chave gratuita oficial gerada no Google AI Studio:
                </p>

                <ol className="list-decimal list-inside space-y-2 text-blue-900 font-medium pl-1">
                  <li>
                    Acesse o portal oficial:{' '}
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-bold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1"
                    >
                      aistudio.google.com/app/apikey <ExternalLink className="w-3 h-3" />
                    </a>
                  </li>
                  <li>Faça login com sua conta Google.</li>
                  <li>
                    Clique no botão azul <strong>"Create API key"</strong> (Criar chave de API).
                  </li>
                  <li>
                    Escolha ou crie um projeto no Google Cloud e copie a sua chave gerada (ela começa com <code className="bg-blue-100 px-1 py-0.5 rounded">AIzaSy...</code>).
                  </li>
                  <li>
                    Guarde-a em local seguro (por exemplo, no arquivo <code className="bg-blue-100 px-1 py-0.5 rounded">.env</code> do seu backend como <code className="bg-blue-100 px-1 py-0.5 rounded">GEMINI_API_KEY</code>).
                  </li>
                </ol>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <h4 className="font-bold text-slate-900 text-sm">
                  Como este aplicativo funciona e como ele se conecta ao seu:
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <span className="font-bold text-slate-800 block mb-1">Opção A: Usar Este App como Microserviço API</span>
                    <p className="text-slate-600 leading-relaxed">
                      Seu app faz requisições HTTP para <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-mono">POST /api/quote/extract</code> enviando a mensagem do cliente. Este app processa e devolve o formulário JSON já preenchido.
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <span className="font-bold text-slate-800 block mb-1">Opção B: Integrar o SDK Gemini no seu App</span>
                    <p className="text-slate-600 leading-relaxed">
                      Você instala a biblioteca oficial <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-mono">@google/genai</code> no seu backend, usa o modelo <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">gemini-3.8-flash</code> e usa nosso schema estruturado de orçamento.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900">
                <span>Quer testar a API agora mesmo via código?</span>
                <button
                  type="button"
                  onClick={() => setActiveTab('curl')}
                  className="inline-flex items-center gap-1 font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
                >
                  Ver exemplos de código <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'curl' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Chamada via cURL no Terminal:</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(curlCode, 'curl')}
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                >
                  {copied === 'curl' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied === 'curl' ? 'Copiado!' : 'Copiar cURL'}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-900 text-emerald-400 rounded-xl font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed">
                {curlCode}
              </pre>
            </div>
          )}

          {activeTab === 'javascript' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Função Node.js / TypeScript / React / Next.js:</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(jsCode, 'js')}
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                >
                  {copied === 'js' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied === 'js' ? 'Copiado!' : 'Copiar Código'}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-900 text-blue-300 rounded-xl font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed">
                {jsCode}
              </pre>
            </div>
          )}

          {activeTab === 'python' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Script Python com Requests:</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(pythonCode, 'python')}
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                >
                  {copied === 'python' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied === 'python' ? 'Copiado!' : 'Copiar Código'}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-900 text-amber-300 rounded-xl font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed">
                {pythonCode}
              </pre>
            </div>
          )}

          {activeTab === 'direct-gemini' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Código para rodar diretamente no seu backend com @google/genai:</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(geminiDirectCode, 'direct')}
                  className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                >
                  {copied === 'direct' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied === 'direct' ? 'Copiado!' : 'Copiar Código'}</span>
                </button>
              </div>
              <pre className="p-4 bg-slate-900 text-purple-300 rounded-xl font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed">
                {geminiDirectCode}
              </pre>
            </div>
          )}

          {activeTab === 'schema' && (
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-slate-900 mb-1">Playground de Teste da API</h4>
                <p className="text-slate-600">
                  Faça um disparo real para o endpoint <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-indigo-700">POST /api/quote/extract</code> deste servidor e inspecione a resposta JSON:
                </p>
              </div>

              <button
                type="button"
                onClick={handleTestApi}
                disabled={isTesting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs transition cursor-pointer"
              >
                {isTesting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Disparando requisição...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Disparar Requisição de Teste (POST /api/quote/extract)</span>
                  </>
                )}
              </button>

              {testResponse && (
                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                    <span>Resposta do Servidor (HTTP 200 JSON):</span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(testResponse, 'resp')}
                      className="text-blue-600 hover:underline cursor-pointer"
                    >
                      {copied === 'resp' ? 'Copiado!' : 'Copiar JSON'}
                    </button>
                  </div>
                  <pre className="p-4 bg-slate-900 text-emerald-300 rounded-xl font-mono text-[11px] max-h-72 overflow-y-auto leading-relaxed">
                    {testResponse}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            Endpoint ativo: <strong className="font-mono text-slate-700">{currentHost}/api/quote/extract</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
