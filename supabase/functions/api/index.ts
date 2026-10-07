import { completeDeliveryByCep, deliveryExtractionInstruction, deliveryExtractionSchema, normalizeExtractedDelivery } from '../_shared/deliveryExtraction.ts';
import { CnpjLookupError, lookupCnpj } from '../_shared/cnpjLookup.ts';
import { formatBlingError } from '../_shared/blingErrors.ts';

type EdgeRuntime = {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
type JsonObject = Record<string, any>;

const edge = (globalThis as typeof globalThis & { Deno?: EdgeRuntime }).Deno;
const env = (name: string, fallback = '') => edge?.env.get(name) || fallback;
const allowedEmail = 'fresamaster0@gmail.com';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-bling-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

type CatalogProduct = {
  id: string;
  sku: string;
  description: string;
  category: string;
  unitPrice: number;
  unit: string;
  ncm: string;
  weightGrams: number;
  tags: string[];
};

const normalizeText = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function normalizeBlingCatalogProducts(records: unknown[]): CatalogProduct[] {
  return records.flatMap((record, index) => {
    if (!record || typeof record !== 'object') return [];
    const product = record as JsonObject;
    const description = String(product.nome || product.descricao || product.descricaoCurta || '').trim();
    if (!description) return [];
    const sku = String(product.codigo || product.id || `BLING-${index + 1}`).trim();
    const category = String(product.categoriaProduto?.descricao || 'Produtos Bling');
    return [{
      id: String(product.id || sku), sku, description, category,
      unitPrice: Number(product.preco) || 0,
      unit: String(product.unidade || 'un'),
      ncm: String(product.tributacao?.ncm || product.ncm || '8207.70.00'),
      weightGrams: (Number(product.pesoLiquido) || 0) * 1000,
      tags: [sku, category, product.descricaoCurta || '', description].join(' ').split(/[^\p{L}\p{N}]+/u).filter((tag: string) => tag.length > 1),
    }];
  });
}

function matchBlingCatalogProduct(query: string, catalog: CatalogProduct[]): CatalogProduct | null {
  if (!query) return null;
  const normalizedQuery = normalizeText(query);
  const queryTokens = [...new Set(normalizedQuery.split(' ').filter((token) => token.length > 1))];
  const exact = catalog.find((product) => {
    const sku = normalizeText(product.sku);
    return sku === normalizedQuery || (sku.length > 3 && normalizedQuery.includes(sku));
  });
  if (exact) return exact;
  const families = [['tct', 'widia'], ['3 cortes', 'tres cortes'], ['2 cortes', 'dois cortes'], ['1 corte', 'um corte'], ['helicoidal'], ['downcut', 'descendente'], ['vbit', 'v bit', 'v-bit'], ['pinca', 'er11', 'er16', 'er20', 'er25', 'er32']];
  const queryFamilies = families.filter((family) => family.some((term) => normalizedQuery.includes(normalizeText(term))));
  const queryDimensions = normalizedQuery.match(/\b\d+(?:\.\d+)?\b/g) || [];
  let best: CatalogProduct | null = null;
  let bestScore = 0;
  for (const product of catalog) {
    const searchable = normalizeText([product.description, product.category, product.sku, ...product.tags].join(' '));
    const productTokens = new Set(searchable.split(' '));
    const productNumbers = new Set(searchable.match(/\d+(?:\.\d+)?/g) || []);
    const productFamilies = families.filter((family) => family.some((term) => searchable.includes(normalizeText(term))));
    if (queryFamilies.length && !queryFamilies.every((family) => productFamilies.includes(family))) continue;
    let score = 0;
    for (const token of queryTokens) if (productTokens.has(token)) score += /^\d/.test(token) ? 5 : token.length > 3 ? 3 : 1;
    for (const dimension of queryDimensions) if (productNumbers.has(dimension)) score += 4;
    const angle = normalizedQuery.match(/\b(60|90)\b/);
    if (angle && searchable.includes(`${angle[1]} graus`)) score += 5;
    if (searchable.includes(normalizedQuery)) score += 8;
    if (score > bestScore) { best = product; bestScore = score; }
  }
  return bestScore >= 6 ? best : null;
}

function extractCepFromText(text: string): string {
  const labeled = text.match(/\bcep\b\s*(?:é|e|de|do|para|:|=|-)?\s*(\d{5}-?\d{3}|\d{8})/i);
  if (labeled) {
    const raw = labeled[1].replace(/\D/g, '');
    return raw.length === 8 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : labeled[1];
  }
  const match = text.match(/(?:^|[^\d])(\d{5}-\d{3})(?!\d)/);
  if (match) return match[1];
  const plain8 = text.match(/(?:^|[^\d])(\d{8})(?!\d)/);
  if (plain8) return `${plain8[1].slice(0, 5)}-${plain8[1].slice(5)}`;
  return '';
}

function parseBrazilianNumber(value: string): number {
  const normalized = value.includes(',') || /\.\d{3}$/.test(value) ? value.replace(/\./g, '').replace(',', '.') : value;
  return Number(normalized);
}

const WORDS_TO_NUMBERS: Record<string, number> = {
  cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, meia: 6, sete: 7, oito: 8, nove: 9,
};

function parseWordNumber(str: string): number | null {
  const words = str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+e\s+|\s+/);
  let total = 0;
  for (const w of words) {
    if (WORDS_TO_NUMBERS[w]) total += WORDS_TO_NUMBERS[w];
  }
  return total > 0 ? total : null;
}

function extractUnitPricesFromText(text: string): number[] {
  // Normaliza centavos falados: '145 e 50' ou '145 com 50' -> '145,50'
  const normalizedText = text
    .replace(/(\b\d{2,4})\s*reais?\s*(?:e|com)\s*(\d{1,2})(?:\s*centavos)?\b/gi, '$1,$2')
    .replace(/(\b\d{2,4})\s+(?:e|com)\s+(\d{1,2})\b(?!\s*(?:cortes|corte|dias|mm|graus))/gi, '$1,$2');

  // Isola a parte do produto antes do frete para que o valor do motoboy/sedex não seja capturado como preço unitário
  const toolText = normalizedText.replace(/\b(?:frete|envio|entrega|motoboy|moto boy|sedex|pac|jadlog|transportadora)\b(?:[^.;,\n]|,(?=\d))*/gi, ' ');

  const amount = '(?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
  const price = `(?:R\\$\\s*)?(${amount})`;
  const discountSpans = [...toolText.matchAll(new RegExp(
    `\\b(?:desconto|abatimento)\\b[^\\d\\n.;]{0,30}?(?:R\\$\\s*)?${amount}|(?:R\\$\\s*)?${amount}\\s*(?:reais?\\s*)?(?:de\\s+)?(?:desconto|abatimento)\\b`,
    'gi',
  ))].map((match) => [match.index || 0, (match.index || 0) + match[0].length]);

  const patterns = [
    // 1. Explícito 'cada': 'por 140 cada', 'a 140 cada', '140 reais cada', '140 cada uma', '140 cada peca'
    new RegExp(`${price}\\s*(?:reais?\\s*)?(?:cada(?:\\s+(?:fresa|unidade|uma|peça|peca|ferramenta))?|por\\s+(?:unidade|peça|peca)|a\\s+(?:unidade|peça|peca))`, 'gi'),
    new RegExp(`cada\\s+(?:fresa|unidade|uma|peça|peca)?\\s*(?:por|a|e|é|de|no valor de)?\\s*${price}`, 'gi'),

    // 2. Palavras de valor/unidade: 'no valor de 140', 'valor de 140', 'valor 140', 'preco 140', 'custando 140', 'sai por 140'
    new RegExp(`(?:no valor de|valor de|valor|preço de|preco de|preço|preco|custando|custa|sai por|sai a|unitário de|unitario de|unitário|unitario)\\s*:?\\s*${price}`, 'gi'),

    // 3. Preposição + preço: 'por 140 reais', 'a 140 reais', 'por 140', 'a 140'
    new RegExp(`(?:\\bpor|\\ba)\\s+${price}\\s*(?:reais)?(?:\\s|$|[,;.]|(?=\\s*(?:e\\s+frete|e\\s+envio)))`, 'gi'),

    // 4. Notação explícita R$
    new RegExp(`R\\$\\s*(${amount})`, 'gi'),
  ];

  const foundPrices: Array<{ index: number; value: number }> = [];
  for (const pattern of patterns) {
    for (const match of toolText.matchAll(pattern)) {
      const value = parseBrazilianNumber(match[1]);
      const matchStart = match.index || 0;
      if (discountSpans.some(([start, end]) => matchStart >= start && matchStart < end)) continue;
      if (Number.isFinite(value) && value >= 10 && value <= 10000) {
        if (!foundPrices.some((p) => p.value === value || Math.abs(p.index - matchStart) < 8)) {
          foundPrices.push({ index: matchStart, value });
        }
      }
    }
  }

  // Verifica números por extenso caso não tenha encontrado em dígitos: 'por cento e quarenta cada'
  if (foundPrices.length === 0) {
    const spelledMatch = toolText.match(/(?:por|a|valor de|preco de|custando)\s+([a-z\s]+?)\s*(?:reais)?\s*(?:cada|por unidade|$|[,;.])/i);
    if (spelledMatch) {
      const spelledVal = parseWordNumber(spelledMatch[1]);
      if (spelledVal && spelledVal >= 10) {
        foundPrices.push({ index: spelledMatch.index || 0, value: spelledVal });
      }
    }
  }

  // Último recurso: primeiro número com cara de preço fora de CEP, desconto, medidas e quantidades
  if (foundPrices.length === 0) {
    let rest = toolText;
    for (const [start, end] of [...discountSpans].sort((a, b) => b[0] - a[0])) rest = `${rest.slice(0, start)} ${rest.slice(end)}`;
    rest = rest.replace(/\bcep\b\s*[:\-]?\s*[\d.\-]+/gi, ' ').replace(/\d{5}-?\d{3}/g, ' ');
    for (const match of rest.matchAll(new RegExp(`(?<![\\d,.])(${amount})(?![\\d,.]*\\d)(?!\\s*(?:cortes?|corte|mm|graus|dias|x|fresas?|unidades?|pecas?|peças?|%))`, 'gi'))) {
      const value = parseBrazilianNumber(match[1]);
      if (Number.isFinite(value) && value >= 30 && value <= 10000) {
        foundPrices.push({ index: match.index || 0, value });
        break;
      }
    }
  }

  foundPrices.sort((a, b) => a.index - b.index);
  return foundPrices.map((p) => p.value);
}

function extractDiscountAmountFromText(text: string): number | null {
  if (/\b(?:sem desconto|sem abatimento|não (?:dei|apliquei|concedi|quero dar|vou dar) (?:nenhum )?(?:desconto|abatimento))\b/i.test(text)) return 0;
  const amount = '(\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
  const patterns = [
    new RegExp(`\\b(?:desconto|abatimento)\\b[^\\d\\n.;]{0,30}?(?:R\\$\\s*)?${amount}(?:\\s*reais?)?`, 'i'),
    new RegExp(`(?:R\\$\\s*)?${amount}\\s*(?:reais?\\s*)?(?:de\\s+)?(?:desconto|abatimento)\\b`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const beforeMatch = text.slice(Math.max(0, (match.index || 0) - 40), match.index);
    if (/\b(?:sem|nenhum|nenhuma|não|nao)\s+(?:(?:quero|dar|dê|de|aplique|um|o)\s+)*$/i.test(beforeMatch)) continue;
    const value = parseBrazilianNumber(match[1]);
    if (Number.isFinite(value) && value > 0 && value <= 10000) return value;
  }
  return null;
}

function extractMotoboyPriceFromText(text: string): number | null {
  const amount = '(?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)';
  const patterns = [
    new RegExp(`(?:motoboy|moto boy)[^.,;\\n]{0,35}?\\b(?:custou|custa|ficou em|ficou|deu|saiu por|saiu|cobrou|por|a|de|no valor de|valor de|:|-)\\s*(?:R\\$\\s*)?(${amount})(?:\\s*reais?)?`, 'i'),
    new RegExp(`\\b(?:motoboy|moto boy)\\s+(?:R\\$\\s*)?(${amount})(?:\\s*reais?)?`, 'i'),
    new RegExp(`(?:R\\$\\s*)?(${amount})\\s*(?:reais?\\s*)?(?:de|no|para o)?\\s*(?:frete\\s+)?(?:do\\s+)?(?:motoboy|moto boy)`, 'i'),
    new RegExp(`(?:frete|entrega|envio)\\s+(?:por\\s+|de\\s+|do\\s+)?(?:motoboy|moto boy)[^.,;\\n]{0,35}?(?:(?:custou|custa|ficou em|ficou|deu|saiu por|saiu|cobrou|por|a|de|no valor de|valor de|:|-)\\s*)?(?:R\\$\\s*)?(${amount})`, 'i'),
    new RegExp(`(?:frete|entrega|envio)\\s+(?:de\\s+)?(?:R\\$\\s*)?(${amount})\\s*(?:reais?)?[^.,;\\n]{0,25}\\b(?:motoboy|moto boy)\\b`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = parseBrazilianNumber(match[1]);
      if (Number.isFinite(value) && value >= 0) return value;
    }
  }
  return null;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function html(content: string, status = 200): Response {
  return new Response(content, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function routePath(request: Request): string {
  const pathname = new URL(request.url).pathname;
  const functionPrefix = '/functions/v1/api';
  const prefixIndex = pathname.indexOf(functionPrefix);
  const route = prefixIndex >= 0 ? pathname.slice(prefixIndex + functionPrefix.length) : pathname;
  return route.replace(/^\/api(?=\/|$)/, '') || '/';
}

function isPublicRoute(path: string, method: string): boolean {
  return method === 'GET' && (
    path === '/health' ||
    path === '/bling/oauth/callback' ||
    path === '/shipping/melhor-envio/callback'
  );
}

async function authorize(request: Request, path: string): Promise<Response | null> {
  if (isPublicRoute(path, request.method)) return null;

  const projectUrl = env('SUPABASE_URL');
  const publishableKey = env('SUPABASE_ANON_KEY') || env('SUPABASE_PUBLISHABLE_KEY');
  const accessToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!projectUrl || !publishableKey) return json({ error: 'Autenticação Supabase não está configurada nesta função.' }, 503);
  if (!accessToken) return json({ error: 'Faça login para acessar este recurso.' }, 401);

  try {
    const response = await fetch(`${projectUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return json({ error: 'Sessão expirada. Entre novamente para continuar.' }, 401);
    const user = await response.json();
    if (user.email_confirmed_at == null || user.email?.toLowerCase() !== allowedEmail) {
      return json({ error: 'Esta conta não tem autorização para acessar o Fresa Master.' }, 403);
    }
  } catch {
    return json({ error: 'Não foi possível validar a sessão Supabase.' }, 503);
  }
  return null;
}

async function readJson(request: Request): Promise<JsonObject> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function callGemini(parts: JsonObject[], systemInstruction: string, responseSchema?: JsonObject, maxOutputTokens = 1200, modelOverride?: string): Promise<JsonObject | string | null> {
  const apiKey = env('GEMINI_API_KEY');
  if (!apiKey) return null;
  const model = modelOverride || env('GEMINI_MODEL', 'gemini-3.5-flash-lite');
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
          maxOutputTokens,
          ...(responseSchema ? { responseMimeType: 'application/json', responseSchema } : {}),
        },
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const text = payload.candidates?.[0]?.content?.parts?.map((part: JsonObject) => part.text || '').join('').trim();
    return text ? (responseSchema ? JSON.parse(text) : text) : null;
  } catch {
    return null;
  }
}

function calculatePackageWeight(items: Array<{ description?: string; quantity?: number }>) {
  let grams = 150;
  let totalPieces = 0;
  for (const item of items || []) {
    const quantity = Number(item.quantity) || 1;
    totalPieces += quantity;
    const description = (item.description || '').toLowerCase();
    const toolWeight = /tct|widia|3 cortes|corte reto/.test(description) ? 110
      : /pinça|pinca|er11|er16|er20|er25|er32/.test(description) ? 85
      : /v-bit|chanfro|desbaste|12mm|1\/2/.test(description) ? 85
      : /acrílico|alumínio|1 corte|2 cortes/.test(description) ? 45 : 45;
    grams += quantity * toolWeight;
  }
  const rawKg = grams / 1000;
  const weightKg = rawKg <= 0.5 ? 0.5 : Number((Math.ceil(rawKg * 10) / 10).toFixed(1));
  return {
    weightKg,
    totalPieces,
    description: weightKg <= 0.5 ? '0,5 kg (padrão até 0,5 kg)' : `${weightKg.toFixed(1).replace('.', ',')} kg (${totalPieces} ferramentas com embalagem protetora)`,
  };
}

function calculateShippingRates(
  destinationCep: string,
  originCep = '13329-350',
  weightKg = 0.5,
  dimensions: JsonObject = { height: 5, width: 12, length: 18 },
  customShipping?: JsonObject,
  insuranceEnabled = false,
  declaredValue = 280,
) {
  const destination = destinationCep.replace(/\D/g, '');
  const origin = originCep.replace(/\D/g, '') || '13329350';
  const destDigit = destination ? Number(destination[0]) : 1;
  const originDigit = origin ? Number(origin[0]) : 1;
  const sameState = destDigit === originDigit;
  const closeRegion = Math.abs(destDigit - originDigit) <= 1;
  const zoneFactor = sameState ? 0.95 : closeRegion ? 1.15 : 1.35;
  const extraWeight = Math.max(0, weightKg - 0.5);
  const cubicWeight = ((dimensions.height || 5) * (dimensions.width || 12) * (dimensions.length || 18)) / 6000;
  const effectiveExtra = Math.max(extraWeight, cubicWeight > 1 ? cubicWeight - 0.5 : 0);
  const insuranceCost = declaredValue > 0 ? Number(Math.max(3.5, declaredValue * 0.015).toFixed(2)) : 0;
  const sedexBase = Number((28.5 * zoneFactor + effectiveExtra * 5.8 * zoneFactor).toFixed(2));
  const pacBase = Number((18.9 * zoneFactor + effectiveExtra * 3.2 * zoneFactor).toFixed(2));
  const jadlogBase = Number((17.4 * zoneFactor + effectiveExtra * 2.9 * zoneFactor).toFixed(2));
  const withInsurance = (price: number) => insuranceEnabled ? Number((price + insuranceCost).toFixed(2)) : price;
  const pacDays = sameState ? 4 : closeRegion ? 6 : 8;
  const options: JsonObject[] = [
    { service: 'SEDEX', name: insuranceEnabled ? 'Sedex c/ Seguro' : 'Sedex (Melhor Envio)', carrier: 'Correios', price: withInsurance(sedexBase), deliveryDays: sameState ? 2 : closeRegion ? 3 : 4, selected: true, insuranceIncluded: insuranceEnabled, insuranceCost, withInsurancePrice: Number((sedexBase + insuranceCost).toFixed(2)), withoutInsurancePrice: sedexBase },
    { service: 'PAC', name: insuranceEnabled ? 'PAC c/ Seguro' : 'PAC (Melhor Envio)', carrier: 'Correios', price: withInsurance(pacBase), deliveryDays: pacDays, selected: false, insuranceIncluded: insuranceEnabled, insuranceCost, withInsurancePrice: Number((pacBase + insuranceCost).toFixed(2)), withoutInsurancePrice: pacBase },
    { service: 'JADLOG_PACKAGE', name: insuranceEnabled ? 'Jadlog .Package c/ Seguro' : 'Jadlog .Package', carrier: 'Jadlog', price: withInsurance(jadlogBase), deliveryDays: Math.max(2, pacDays - 1), selected: false, insuranceIncluded: insuranceEnabled, insuranceCost, withInsurancePrice: Number((jadlogBase + insuranceCost).toFixed(2)), withoutInsurancePrice: jadlogBase },
    { service: 'RETIRADA', name: 'Retirada na Fresa Master', carrier: 'Balcão (Salto/SP)', price: 0, deliveryDays: 0, selected: false, insuranceIncluded: false, insuranceCost: 0, withInsurancePrice: 0, withoutInsurancePrice: 0 },
    { service: 'MOTOBOY', name: 'Envio por Motoboy / Aplicativo (Lalamove, Uber Flash)', carrier: 'Motoboy / App', price: 0, deliveryDays: 1, selected: false, insuranceIncluded: false, insuranceCost: 0, withInsurancePrice: 0, withoutInsurancePrice: 0 },
    { service: 'CONTA_FRESA', name: 'Envio por Nossa Conta (Cortesia Fresa Master)', carrier: 'Fresa Master', price: 0, deliveryDays: 2, selected: false, insuranceIncluded: false, insuranceCost: 0, withInsurancePrice: 0, withoutInsurancePrice: 0 },
  ];
  if (customShipping && Number(customShipping.amount) >= 0) {
    const base = Number(Number(customShipping.amount).toFixed(2));
    const insurance = insuranceEnabled && base > 0 ? insuranceCost : 0;
    options.unshift({ service: 'PROPRIO', name: customShipping.name || 'Frete Fresa Master (Transportadora Própria)', carrier: 'Fresa Master', price: Number((base + insurance).toFixed(2)), deliveryDays: 2, selected: false, insuranceIncluded: insurance > 0, insuranceCost: insurance, withInsurancePrice: Number((base + insuranceCost).toFixed(2)), withoutInsurancePrice: base });
  }
  return options;
}

function buildShipTo(quote: JsonObject) {
  const d = quote.shipping?.deliveryAddress;
  if (d?.enabled) {
    return { nome: d.recipient || quote.client?.name, endereco: d.address || '', numero: d.number || 'S/N', complemento: d.complement || '', bairro: d.neighborhood || '', cep: String(quote.shipping?.destinationCep || '').replace(/\D/g, ''), municipio: d.city || '', uf: d.state || 'SP' };
  }
  const c = quote.client || {};
  return { nome: c.name, endereco: c.address || '', numero: c.number || 'S/N', complemento: c.complement || '', bairro: c.neighborhood || '', cep: String(c.cep || '').replace(/\D/g, ''), municipio: c.city || '', uf: c.state || 'SP' };
}
async function lookupViaCep(cep: string): Promise<JsonObject | null> {
  const clean = (cep || '').replace(/\D/g, '');
  if (clean.length !== 8) return null;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    const data = await response.json();
    if (!response.ok || data.erro) return null;
    return { logradouro: data.logradouro || '', bairro: data.bairro || '', cidade: data.localidade || '', uf: data.uf || '', ddd: data.ddd || '' };
  } catch {
    return null;
  }
}

async function liveShippingRates(destinationCep: string, originCep: string, weightKg: number, dimensions: JsonObject, insuranceEnabled: boolean, declaredValue: number, token?: string, sandbox?: boolean): Promise<JsonObject[] | null> {
  const accessToken = token || env('MELHOR_ENVIO_TOKEN');
  const destination = (destinationCep || '').replace(/\D/g, '');
  if (!accessToken || destination.length !== 8) return null;
  const isSandbox = sandbox ?? env('MELHOR_ENVIO_SANDBOX') === 'true';
  const host = isSandbox ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
  try {
    const response = await fetch(`${host}/api/v2/me/shipment/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken.trim()}`, 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'FresaMaster (fresamaster0@gmail.com)' },
      body: JSON.stringify({
        from: { postal_code: (originCep || '13329-350').replace(/\D/g, '') },
        to: { postal_code: destination },
        package: { height: Math.max(2, Number(dimensions.height) || 5), width: Math.max(11, Number(dimensions.width) || 12), length: Math.max(16, Number(dimensions.length) || 18), weight: Math.max(0.1, weightKg || 0.5) },
        options: { insurance_value: insuranceEnabled ? declaredValue : 0, receipt: false, own_hand: false },
        services: '1,2,3,4,17',
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data)) return null;
    const insuranceFallback = Math.max(2.5, Number((declaredValue * 0.015).toFixed(2)));
    return data.flatMap((item: JsonObject) => {
      if (item.error) return [];
      const price = Number(item.custom_price || item.price || 0);
      if (!price) return [];
      const label = String(item.name || '').toLowerCase();
      const service = label.includes('sedex') ? 'SEDEX' : label.includes('pac') ? 'PAC' : 'JADLOG_PACKAGE';
      const insurance = insuranceEnabled ? Number(Math.max(2.5, declaredValue * (service === 'SEDEX' ? 0.009 : 0.012)).toFixed(2)) : insuranceFallback;
      const base = insuranceEnabled ? Number(Math.max(0, price - insurance).toFixed(2)) : price;
      const insured = insuranceEnabled ? price : Number((price + insurance).toFixed(2));
      return [{ service, melhorEnvioServiceId: Number(item.id), name: `${item.name} (Melhor Envio Oficial)`, carrier: item.company?.name || (label.includes('jadlog') ? 'Jadlog' : 'Correios'), price: insuranceEnabled ? insured : base, deliveryDays: Number(item.custom_delivery_time || item.delivery_time || 2), selected: false, insuranceIncluded: insuranceEnabled, insuranceCost: insurance, withInsurancePrice: insured, withoutInsurancePrice: base, isRealTimeMelhorEnvio: true }];
    });
  } catch {
    return null;
  }
}

function chooseRequestedCarrier(text: string, options: JsonObject[], price?: number | null): JsonObject {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalized.includes('motoboy') || normalized.includes('moto boy')) {
    const value = price ?? 0;
    return { service: 'MOTOBOY', name: 'Envio por Motoboy', carrier: 'Motoboy / Aplicativo', price: value, deliveryDays: 1, selected: true, insuranceIncluded: false, insuranceCost: 0, withInsurancePrice: value, withoutInsurancePrice: value };
  }
  if (/(nossa conta|por conta|gratis|cortesia)/.test(normalized)) return options.find((item) => item.service === 'CONTA_FRESA') || options[0];
  if (normalized.includes('pac')) return options.find((item) => item.service === 'PAC') || options[0];
  if (normalized.includes('jadlog')) return options.find((item) => item.service === 'JADLOG_PACKAGE') || options[0];
  if (normalized.includes('retirada') || normalized.includes('balcao')) return options.find((item) => item.service === 'RETIRADA') || options[0];
  if (normalized.includes('proprio') || normalized.includes('transportadora')) return options.find((item) => item.service === 'PROPRIO') || options[0];
  return options.find((item) => item.service === 'SEDEX') || options[0];
}

function extractClientName(text: string, currentName = ''): string {
  const match = text.match(/(?:raz[aã]o social(?:\s+do cliente)?|nome do cliente|cliente)\s*(?:(?:é|eh|e|:|=|se chama|chama-se|chamado|chamada)\s*)?([^,;\n.]+)/i);
  let name = (match?.[1] || '')
    .replace(/\s+\b(?:cep|cnpj|cpf|telefone|e-?mail)\b.*$/i, '')
    .replace(/\s+\b(?:ser[aã]o?|vai|quer|pediu|solicitou|precisa|calcule|calcular)\b.*$/i, '')
    .replace(/^(?:é|eh|e|se chama|chama-se|chamado|chamada)\s+/i, '')
    .trim();
  if (name) {
    name = name.replace(/\b[a-z\u00C0-\u00FF]/g, (char) => char.toUpperCase());
  }
  return name || currentName || 'Cliente CNC Router';
}

function extractQuantityFromText(text: string): number {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const numWords = Object.keys(WORDS_TO_NUMBERS).join('|');
  const qtyPattern = new RegExp(`\\b(\\d+|${numWords})\\s*(?:fresas?|brocas?|pinças?|pincas?|unidades?|peças?|pecas?|itens?|ferramentas?)\\b`, 'i');
  const match = normalized.match(qtyPattern);
  if (match) {
    const raw = match[1];
    const num = WORDS_TO_NUMBERS[raw] || Number.parseInt(raw, 10);
    if (Number.isFinite(num) && num > 0) return num;
  }

  const actionPattern = new RegExp(`(?:ser[aã]o|seria|manda|enviar?|quer|quero|preciso|adiciona|coloca|vai|tem)\\s+(\\d+|${numWords})\\b`, 'i');
  const matchAction = normalized.match(actionPattern);
  if (matchAction) {
    const raw = matchAction[1];
    const num = WORDS_TO_NUMBERS[raw] || Number.parseInt(raw, 10);
    if (Number.isFinite(num) && num > 0) return num;
  }

  return 1;
}

function extractProductDescription(text: string, previousDescription = ''): string {
  const numWords = Object.keys(WORDS_TO_NUMBERS).join('|');
  const priceKeywords = 'por|a|no valor de|valor de|valor|custando|custa|sai por|sai a|preço de|preco de|preço|preco|unitário de|unitario de|unitário|unitario';
  const spelledPriceNum = 'cento|cem|duzentos|trezentos|quatrocentos|quinhentos|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|dez';
  const stop = `(?=\\s+(?:${priceKeywords})\\s*(?:R\\$\\s*)?(?:[\\d.,]+|${spelledPriceNum})|\\s+\\b(?:frete|envio|entrega|calcule|calcular|cotar|cotação|sedex|pac|jadlog|motoboy|retirada|grátis|gratis)\\b|[,;\\n.]|$)`;
  const quantityMatch = text.match(new RegExp(`\\b(?:\\d+|${numWords})\\s*(?:fresas?|unidades?|itens?|peças?|pecas?)\\s*(?:(?:de|do tipo|tipo)\\s+)?(.+?)${stop}`, 'i'));
  const productMatch = text.match(new RegExp(`\\b(?:fresas?|brocas?|pinças?|pincas?|ferramentas?)\\s+(?:(?:de|do tipo|tipo)\\s+)?(.+?)${stop}`, 'i'));
  let description = (quantityMatch?.[1] || productMatch?.[1] || '')
    .replace(/^(?:de|do tipo|tipo)\s+/i, '')
    .replace(/^(?:da|do)\s+(?:fresa|pinça|pinca|ferramenta)\s+/i, '')
    .replace(/[\s,;:.]+$/, '')
    .trim();

  if (!description && previousDescription && !/\b(?:raz[aã]o social|nome do cliente|\bcep\b|melhor envio|calcule|frete|envio)\b/i.test(previousDescription)) {
    description = previousDescription.trim();
  }
  if (!description) return 'Fresa para Router CNC';
  if (/pinç|pinc/i.test(text) && !/pinç|pinc/i.test(description)) {
    description = `Pinça ${description}`;
  } else if (!/^(?:fresa|fresas|broca|brocas|pinça|pinca|ferramenta)/i.test(description)) {
    description = `Fresa ${description}`;
  }
  return description;
}

async function fallbackQuote(text: string, currentQuote: JsonObject = {}, catalog: CatalogProduct[] = []): Promise<JsonObject> {
  const cep = extractCepFromText(text);
  const quantity = extractQuantityFromText(text);
  const spokenPrices = extractUnitPricesFromText(text);
  const previousDescription = currentQuote.items?.[0]?.description || '';
  const parsedDescription = extractProductDescription(text, previousDescription);
  const matched = matchBlingCatalogProduct(parsedDescription, catalog);
  const unitPrice = spokenPrices[0] || matched?.unitPrice || 0;
  const item = {
    id: 'item-1', description: matched?.description || parsedDescription, category: matched?.category || 'Fresas Router CNC',
    sku: matched?.sku || '', ncm: matched?.ncm || '', quantity, unit: 'un', unitPrice,
    totalPrice: quantity * unitPrice,
    notes: matched ? `Item cadastrado no Bling ERP (${matched.sku})` : 'Não localizado no catálogo real do Bling. Revise ou cadastre antes de faturar.',
  };
  const weight = calculatePackageWeight([item]);
  const shipping = currentQuote.shipping || {};
  const dimensions = shipping.packageDimensions || { height: 5, width: 12, length: 18 };
  const customShipping = shipping.customShippingAmount === undefined ? undefined : { amount: shipping.customShippingAmount, name: shipping.customShippingName };
  const subtotal = quantity * unitPrice;
  const spokenDiscount = extractDiscountAmountFromText(text);
  const discountPercentage = 0;
  const discountAmount = Number(Math.min(
    subtotal,
    spokenDiscount ?? 0,
  ).toFixed(2));
  const insuranceEnabled = Boolean(shipping.insuranceEnabled);
  const liveOptions = await liveShippingRates(
    cep,
    shipping.originCep || '13329-350',
    weight.weightKg,
    dimensions,
    insuranceEnabled,
    subtotal,
  );
  const options = liveOptions?.length
    ? liveOptions
    : calculateShippingRates(cep || '00000000', shipping.originCep || '13329-350', weight.weightKg, dimensions, customShipping, insuranceEnabled, subtotal);
  for (const option of [
    { service: 'RETIRADA', name: 'Retirada na Fresa Master', carrier: 'Balcão (Salto/SP)', price: 0, deliveryDays: 0, selected: false, insuranceIncluded: false, insuranceCost: 0, withInsurancePrice: 0, withoutInsurancePrice: 0 },
    { service: 'MOTOBOY', name: 'Envio por Motoboy / Aplicativo', carrier: 'Motoboy / App', price: 0, deliveryDays: 1, selected: false, insuranceIncluded: false, insuranceCost: 0, withInsurancePrice: 0, withoutInsurancePrice: 0 },
    { service: 'CONTA_FRESA', name: 'Envio por Nossa Conta (Cortesia Fresa Master)', carrier: 'Fresa Master', price: 0, deliveryDays: 2, selected: false, insuranceIncluded: false, insuranceCost: 0, withInsurancePrice: 0, withoutInsurancePrice: 0 },
  ]) {
    if (!options.some((existing) => existing.service === option.service)) options.push(option);
  }
  const carrierPrice = extractMotoboyPriceFromText(text);
  const selected = chooseRequestedCarrier(text, options, carrierPrice);
  if (!options.some((option) => option.service === selected.service)) options.push(selected);
  else options[options.findIndex((option) => option.service === selected.service)] = selected;
  const selectedOptions = options.map((option) => ({ ...option, selected: option.service === selected.service }));
  const address = await lookupViaCep(cep);
  const previousClient = currentQuote.client || {};
  const clientName = extractClientName(text, previousClient.name || '');
  return {
    id: currentQuote.id || `FM-${Math.floor(100000 + Math.random() * 900000)}`, status: currentQuote.status || 'draft', createdAt: currentQuote.createdAt || new Date().toISOString(),
    client: { ...previousClient, name: clientName, tradeName: previousClient.tradeName || '', company: previousClient.company || clientName, email: previousClient.email || '', phone: previousClient.phone || '', document: previousClient.document || '', ie: previousClient.ie || '', cep: cep || previousClient.cep || '', address: address?.logradouro || previousClient.address || '', number: previousClient.number || '', neighborhood: address?.bairro || previousClient.neighborhood || '', city: address?.cidade || previousClient.city || '', state: address?.uf || previousClient.state || '' },
    project: { title: 'Fornecimento de Fresas Router CNC - Fresa Master', category: 'Ferramentas Router CNC', description: `Fornecimento de ${item.description} para usinagem CNC.`, deadline: `${selected.deliveryDays} dias úteis (${selected.name})`, validityDays: 10, date: new Date().toISOString().split('T')[0] },
    items: [item],
    shipping: { ...shipping, originCep: shipping.originCep || '13329-350', destinationCep: cep || previousClient.cep || '', weightKg: weight.weightKg, weightDescription: weight.description, packageDimensions: dimensions, customShippingAmount: customShipping?.amount, customShippingName: customShipping?.name, insuranceEnabled, selectedOption: selected, options: selectedOptions },
    financials: { subtotal, shippingAmount: Number(selected.price || 0), insuranceAmount: 0, discountPercentage, discountAmount, taxPercentage: 0, taxAmount: 0, totalAmount: Math.max(0, subtotal - discountAmount + Number(selected.price || 0)), paymentTerms: 'À vista via Pix ou Boleto', paymentMethod: 'Pix' },
    observations: ['Envio pelo Melhor Envio com seguro total.', 'Garantia contra defeitos de fabricação e balanceamento.'],
    notesForClient: 'Fresa Master - Sua router CNC trabalhando com máxima precisão.',
  };
}

async function extractQuote(body: JsonObject): Promise<Response> {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return json({ success: false, error: "O campo 'text' é obrigatório com a mensagem ou áudio transcrito do cliente." }, 400);
  if (text.length > 8000) return json({ success: false, error: 'O texto do pedido excede o limite de 8.000 caracteres.' }, 413);
  const catalog = normalizeBlingCatalogProducts(Array.isArray(body.blingProducts) ? body.blingProducts : []);
  const current = body.currentQuote || {};
  const schema = {
    type: 'OBJECT',
    properties: {
      summary: { type: 'STRING' }, confidence: { type: 'NUMBER' }, detectedCep: { type: 'STRING' }, detectedCarrier: { type: 'STRING' }, missingInfo: { type: 'ARRAY', items: { type: 'STRING' } }, observations: { type: 'ARRAY', items: { type: 'STRING' } },
      client: { type: 'OBJECT', properties: { name: { type: 'STRING' }, tradeName: { type: 'STRING' }, company: { type: 'STRING' }, email: { type: 'STRING' }, phone: { type: 'STRING' }, document: { type: 'STRING' }, ie: { type: 'STRING' }, cep: { type: 'STRING' }, address: { type: 'STRING' }, number: { type: 'STRING' }, neighborhood: { type: 'STRING' }, city: { type: 'STRING' }, state: { type: 'STRING' } }, required: ['name'] },
      items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { description: { type: 'STRING' }, category: { type: 'STRING' }, sku: { type: 'STRING' }, ncm: { type: 'STRING' }, quantity: { type: 'NUMBER' }, unit: { type: 'STRING' }, unitPrice: { type: 'NUMBER' }, notes: { type: 'STRING' } }, required: ['description', 'quantity'] } },
      financials: { type: 'OBJECT', properties: { discountPercentage: { type: 'NUMBER' }, paymentTerms: { type: 'STRING' }, paymentMethod: { type: 'STRING' } }, required: [] },
    }, required: ['summary', 'client', 'items'],
  };
  const ai = await callGemini([{ text: `Extraia os dados deste orçamento da Fresa Master: ${text}\n\nIdentifique cliente, CEP, itens, quantidade, preços unitários ditados, frete e observações. Preserve valores e CEP explicitamente informados. O motoboy é frete, não produto. Não invente SKU, NCM ou preço. NCM padrão de fresas: 8207.70.00. Catálogo Bling disponível: ${JSON.stringify(catalog)}` }], 'Você é o assistente comercial da Fresa Master para ferramentas de router CNC. Retorne somente os dados solicitados em JSON.', schema);
  const parsed = ai && typeof ai === 'object' ? ai : null;
  const fallback = await fallbackQuote(text, current, catalog);
  if (!parsed) return json({ success: true, summary: 'Orçamento preenchido pelo analisador local Fresa Master.', confidence: 0.9, missingInfo: [], quote: fallback });

  const unitPrices = extractUnitPricesFromText(text);
  const items = (parsed.items || []).map((item: JsonObject, index: number) => {
    const match = matchBlingCatalogProduct(item.description || '', catalog) || ((parsed.items || []).length === 1 ? matchBlingCatalogProduct(text, catalog) : null);
    const quantity = Number(item.quantity) || 1;
    const spokenPrice = unitPrices.length === 1 ? unitPrices[0] : unitPrices[index];
    const unitPrice = spokenPrice || (match ? match.unitPrice : Number(item.unitPrice) || 0);
    return { id: `item-${index + 1}`, description: match?.description || item.description || 'Fresa para Router CNC', category: match?.category || item.category || 'Fresas Router CNC', sku: match?.sku || '', ncm: match?.ncm || '', quantity, unit: item.unit || 'un', unitPrice, totalPrice: quantity * unitPrice, notes: match ? `Item cadastrado no Bling ERP (${match.sku})` : 'Não localizado no catálogo real do Bling. Revise ou cadastre antes de faturar.' };
  });
  const cep = extractCepFromText(text) || parsed.detectedCep || parsed.client?.cep || current.client?.cep || '';
  const weight = calculatePackageWeight(items);
  const shippingState = current.shipping || {};
  const shippingOptions = calculateShippingRates(cep || '00000000', shippingState.originCep || '13329-350', weight.weightKg, shippingState.packageDimensions, undefined, Boolean(shippingState.insuranceEnabled), items.reduce((sum: number, item: JsonObject) => sum + item.totalPrice, 0));
  const selected = chooseRequestedCarrier(`${text} ${parsed.detectedCarrier || ''}`, shippingOptions, extractMotoboyPriceFromText(text));
  if (!shippingOptions.some((option) => option.service === selected.service)) shippingOptions.push(selected);
  else shippingOptions[shippingOptions.findIndex((option) => option.service === selected.service)] = selected;
  const address = await lookupViaCep(cep);
  const client = { name: parsed.client?.name || 'Cliente Fresa Master', tradeName: parsed.client?.tradeName || '', company: parsed.client?.company || '', email: parsed.client?.email || '', phone: parsed.client?.phone || '', document: parsed.client?.document || '', ie: parsed.client?.ie || '', cep, address: parsed.client?.address || address?.logradouro || '', number: parsed.client?.number || '', neighborhood: parsed.client?.neighborhood || address?.bairro || '', city: parsed.client?.city || address?.cidade || '', state: parsed.client?.state || address?.uf || '' };
  const subtotal = items.reduce((sum: number, item: JsonObject) => sum + item.totalPrice, 0);
  const spokenDiscount = extractDiscountAmountFromText(text);
  const discountPercentage = 0;
  const discountAmount = Number(Math.min(
    subtotal,
    spokenDiscount ?? 0,
  ).toFixed(2));
  const quote = { ...fallback, client, items, shipping: { ...fallback.shipping, destinationCep: cep, weightKg: weight.weightKg, weightDescription: weight.description, packageDimensions: shippingState.packageDimensions || { height: 5, width: 12, length: 18 }, selectedOption: selected, options: shippingOptions }, financials: { ...fallback.financials, subtotal, shippingAmount: Number(selected.price || 0), discountPercentage, discountAmount, totalAmount: Number(Math.max(0, subtotal - discountAmount + Number(selected.price || 0)).toFixed(2)), paymentTerms: parsed.financials?.paymentTerms || 'À vista via Pix ou Boleto', paymentMethod: parsed.financials?.paymentMethod || 'Pix' }, observations: parsed.observations || fallback.observations };
  return json({ success: true, summary: parsed.summary || 'Orçamento Fresa Master gerado com sucesso.', confidence: parsed.confidence || 0.95, missingInfo: parsed.missingInfo || [], quote });
}

async function extractDelivery(body: JsonObject): Promise<Response> {
  const text = body.text;
  if (typeof text !== 'string' || !text.trim()) return json({ error: 'Cole a mensagem com o endereço de entrega.' }, 400);
  if (text.length > 5000) return json({ error: 'O endereço excede o limite de 5.000 caracteres.' }, 413);
  try {
    const parsed = await callGemini([{ text }], deliveryExtractionInstruction, deliveryExtractionSchema);
    if (!parsed) {
      console.error('IA indisponível na extração do endereço de entrega.');
      return json({ error: 'Não foi possível consultar a IA. Tente novamente ou preencha o endereço manualmente.' }, 503);
    }
    const delivery = normalizeExtractedDelivery(parsed);
    return json({ success: true, ...await completeDeliveryByCep(delivery) });
  } catch (error) {
    console.error('Erro na extração do endereço de entrega:', error);
    return json({ error: error instanceof Error ? error.message : 'Não foi possível extrair o endereço de entrega.' }, 502);
  }
}

async function extractCadastral(body: JsonObject): Promise<Response> {
  const text = typeof body.text === 'string' ? body.text : '';
  const file = body.file || {};
  if (!text.trim() && !file.base64) return json({ error: 'Texto ou documento com dados cadastrais é obrigatório.' }, 400);
  if (text.length > 5000) return json({ error: 'O texto cadastral excede o limite de 5.000 caracteres.' }, 413);
  if (typeof file.base64 === 'string' && file.base64.length > 9000000) return json({ error: 'O documento excede o limite de tamanho.' }, 413);
  const schema = { type: 'OBJECT', properties: { summary: { type: 'STRING' }, client: { type: 'OBJECT', properties: { name: { type: 'STRING' }, tradeName: { type: 'STRING' }, document: { type: 'STRING' }, ie: { type: 'STRING' }, email: { type: 'STRING' }, phone: { type: 'STRING' }, cep: { type: 'STRING' }, address: { type: 'STRING' }, number: { type: 'STRING' }, complement: { type: 'STRING' }, neighborhood: { type: 'STRING' }, city: { type: 'STRING' }, state: { type: 'STRING' } }, required: ['name'] } }, required: ['client', 'summary'] };
  const prompt = `Leia com atenção TODO o documento/texto e extraia os dados fiscais brasileiros para cadastro no Bling. Se for Cartão CNPJ (Comprovante de Inscrição e de Situação Cadastral), retorne: NOME EMPRESARIAL em name, TÍTULO DO ESTABELECIMENTO (nome fantasia) em tradeName, número de inscrição (CNPJ) com 14 dígitos em document, LOGRADOURO em address, NÚMERO em number, COMPLEMENTO em complement, CEP em cep (formato 00000-000), BAIRRO/DISTRITO em neighborhood, MUNICÍPIO em city, UF em state, endereço eletrônico em email e telefone em phone. IE: use somente o número expresso no documento; se não estiver disponível, deixe string vazia e não presuma "ISENTO". Nunca deixe um campo vazio se a informação está no documento; se ela NÃO existir, deixe string vazia (não invente, não use "não informado" nem zeros). Texto adicional do operador: ${text || '(nenhum)'}`;
  const parts: JsonObject[] = [];
  if (file.base64 && file.mimeType) parts.push({ inlineData: { data: String(file.base64).replace(/^data:[^;]+;base64,/, ''), mimeType: file.mimeType } });
  parts.push({ text: prompt });
  let parsedObject: JsonObject | null = null;
  const models = file.base64 ? ['gemini-3.6-flash', 'gemini-3.8-flash', env('GEMINI_MODEL', 'gemini-3.5-flash-lite')] : [env('GEMINI_MODEL', 'gemini-3.5-flash-lite'), 'gemini-3.6-flash', 'gemini-3.8-flash'];
  const score = (o: JsonObject | null) => {
    const c = (o?.client || {}) as JsonObject;
    return (String(c.document || '').replace(/\D/g, '').length >= 11 ? 5 : 0) + ['name', 'cep', 'address', 'city', 'state'].filter((k) => String(c[k] || '').trim()).length;
  };
  for (const model of models) {
    const parsed = await callGemini(parts, 'Você é especialista em dados cadastrais brasileiros para NF-e. Transcreva fielmente os dados do documento, sem aspas ou pontuação extra. Não invente informações.', schema, 3000, model);
    if (parsed && typeof parsed === 'object' && parsed.client) {
      if (!parsedObject) parsedObject = parsed;
      else {
        const base = parsedObject.client as JsonObject;
        for (const [k, v] of Object.entries(parsed.client as JsonObject)) if (typeof v === 'string' && v.trim() && !String(base[k] || '').trim()) base[k] = v;
      }
      if (score(parsedObject) >= 8) break;
    }
  }
  if (parsedObject?.client) {
    for (const [k, v] of Object.entries(parsedObject.client as JsonObject)) if (typeof v === 'string') {
      const cleaned = v.split(/\r?\n|==End/)[0].replace(/^[\s"'“”]+|[\s"'“”,;]+$/g, '');
      const placeholder = /^(n[aã]o\s*informad[oa]|n\/?a|null|undefined|desconhecido|[0\s()-]+)$/i.test(cleaned) || /naoinformado|@email\.com$/i.test(cleaned);
      (parsedObject.client as JsonObject)[k] = placeholder ? '' : cleaned;
    }
  }
  if (parsedObject?.client) {
    const current = body.currentClient || {};
    const ai = parsedObject.client as JsonObject;
    const client: JsonObject = { ...current };
    for (const [key, value] of Object.entries(ai)) if (typeof value === 'string' && value.trim()) client[key] = value.trim();
    const digits = String(client.document || '').replace(/\D/g, '');
    if (digits.length === 14) {
      client.document = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
      try {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, { headers: { 'User-Agent': 'Mozilla/5.0 FresaMaster', Accept: 'application/json' } });
        let d: JsonObject | null = res.ok ? await res.json() : null;
        if (!d) {
          const alt = await fetch(`https://publica.cnpj.ws/cnpj/${digits}`, { headers: { 'User-Agent': 'Mozilla/5.0 FresaMaster' } });
          if (alt.ok) {
            const w = await alt.json();
            const e = w.estabelecimento || {};
            d = { razao_social: w.razao_social, nome_fantasia: e.nome_fantasia, cep: e.cep, descricao_tipo_de_logradouro: e.tipo_logradouro, logradouro: e.logradouro, numero: e.numero, complemento: e.complemento, bairro: e.bairro, municipio: e.cidade?.nome, uf: e.estado?.sigla, email: e.email, ddd_telefone_1: `${e.ddd1 || ''}${e.telefone1 || ''}` };
          }
        }
        const words = (v: unknown) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !/^(ltda|eireli|epp|sa|me|com|industria|comercio|dos|das|del)$/.test(w));
        const readWords = words(client.name).concat(words(client.tradeName));
        const regWords = words(d?.razao_social).concat(words(d?.nome_fantasia));
        const sameCompany = !readWords.length || readWords.some((w) => regWords.includes(w));
        if (d && sameCompany) {
          const cleanCep = String(d.cep || '').replace(/\D/g, '');
          const title = (v: unknown) => String(v || '').trim();
          const force = Boolean(file.base64);
          const put = (key: string, value: string) => { if (value && (force || !client[key])) client[key] = value; };
          put('name', title(d.razao_social));
          put('tradeName', title(d.nome_fantasia) || String(client.name || ''));
          if (cleanCep.length === 8) put('cep', `${cleanCep.slice(0, 5)}-${cleanCep.slice(5)}`);
          put('address', [title(d.descricao_tipo_de_logradouro), title(d.logradouro)].filter(Boolean).join(' '));
          put('number', title(d.numero));
          put('complement', title(d.complemento));
          put('neighborhood', title(d.bairro));
          put('city', title(d.municipio));
          put('state', title(d.uf));          if (!client.email && title(d.email)) client.email = title(d.email).toLowerCase();
          if (!client.phone && title(d.ddd_telefone_1)) {
            const p = title(d.ddd_telefone_1).replace(/\D/g, '');
            client.phone = p.length >= 10 ? `(${p.slice(0, 2)}) ${p.slice(2, p.length - 4)}-${p.slice(-4)}` : p;
          }
        }
      } catch { /* mantém os dados lidos pela IA */ }
    }
    const address = await lookupViaCep(String(client.cep || ''));
    if (address) {
      client.address ||= address.logradouro;
      client.neighborhood ||= address.bairro;
      client.city ||= address.cidade;
      client.state ||= address.uf;
    }
    return json({ success: true, summary: parsedObject.summary, client });
  }
  if (file.base64 && !text.trim()) return json({ error: 'A IA não conseguiu ler o documento agora. Tente novamente ou cole o texto.' }, 502);  const cnpj = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/) || text.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
  const cepMatch = text.match(/\bcep\b\s*:?\s*(\d{5}-?\d{3})/i) || text.match(/(?<![\d-])(\d{5}-\d{3})(?!\d)/);
  const email = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const name = text.match(/(?:raz[aã]o social|nome empresarial|empresa|cliente)\s*:?\s*([^,\n\r]+)/i);
  const tradeName = text.match(/(?:nome fantasia|fantasia)\s*:?\s*([^,\n\r]+)/i);
  const phone = text.match(/(?:\+?55\s*)?\(?\b(\d{2})\)?\s*(9?\d{4})[-\s]?(\d{4})\b/);
  const addressLine = text.match(/(?:endere[cç]o|logradouro)\s*:?\s*([^\n\r]+)/i)?.[1] || '';
  const streetParts = addressLine.split(/\s*,\s*|\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const streetNumber = addressLine.match(/,\s*(\d+[A-Za-z]?)\b|\s-\s*(\d+[A-Za-z]?)\b/);
  const cityState = text.match(/([A-Za-zÀ-ú' ]{3,})\s*[-/]\s*([A-Z]{2})\b(?!\w)/);
  const addressInfo = await lookupViaCep(cepMatch?.[1] || body.currentClient?.cep || '');
  const current = body.currentClient || {};
  const client = { ...current, name: name?.[1]?.trim() || current.name || 'Empresa Cliente Ltda', tradeName: tradeName?.[1]?.trim() || name?.[1]?.trim() || current.tradeName || '', document: cnpj?.[0] || current.document || '', ie: text.match(/(?:\bie\b|inscri[cç][aã]o estadual)\s*:?\s*([0-9.-]+|isento)/i)?.[1] || current.ie || '', cep: cepMatch?.[1] || current.cep || '', email: email?.[0] || current.email || '', phone: phone ? `(${phone[1]}) ${phone[2]}-${phone[3]}` : current.phone || '', address: addressInfo?.logradouro || streetParts[0] || current.address || '', number: streetNumber?.[1] || streetNumber?.[2] || current.number || '', complement: streetParts.find((part) => /galp[aã]o|sala|andar|bloco|apto|conj/i.test(part)) || current.complement || '', neighborhood: addressInfo?.bairro || streetParts.find((part) => /bairro|jardim|vila|distrito/i.test(part))?.replace(/^bairro\s*/i, '') || current.neighborhood || '', city: addressInfo?.cidade || cityState?.[1]?.trim() || current.city || '', state: addressInfo?.uf || cityState?.[2] || current.state || '' };
  return json({ success: true, summary: 'Dados cadastrais extraídos pelo analisador local.', client });
}

function generateBlingPayload(quote: JsonObject): JsonObject {
  const client = quote.client || {};
  const cleanDocument = String(client.document || '').replace(/\D/g, '');
  const cleanCep = String(client.cep || '').replace(/\D/g, '');
  const cleanPhone = String(client.phone || '').replace(/\D/g, '');
  const date = quote.project?.date || new Date().toISOString().split('T')[0];
  const items = quote.items || [];
  const blingJson = { numero: String(quote.id || '').replace(/\D/g, '') || String(Date.now()).slice(-6), numeroLoja: 'FRESA-MASTER', data: date, dataSaida: date, contato: { nome: client.name, tipoPessoa: cleanDocument.length === 14 ? 'J' : 'F', numeroDocumento: cleanDocument, ie: client.ie || '', email: client.email || '', telefone: cleanPhone, endereco: { endereco: client.address || '', numero: client.number || 'S/N', complemento: client.complement || '', bairro: client.neighborhood || '', cep: cleanCep, municipio: client.city || '', uf: client.state || 'SP' } }, itens: items.map((item: JsonObject, index: number) => ({ codigo: item.sku || `FM-${index + 1}`, descricao: item.description, unidade: item.unit || 'UN', quantidade: Number(item.quantity) || 1, valor: Number(item.unitPrice) || 0, ncm: item.ncm || '8207.70.00' })), transporte: { fretePorConta: 0, transportador: { nome: quote.shipping?.selectedOption?.carrier || 'Melhor Envio / Correios' }, frete: Number(quote.financials?.shippingAmount) || 0, etiqueta: buildShipTo(quote), volumes: [{ servico: quote.shipping?.selectedOption?.name || 'Sedex', pesoBruto: 0.35, pesoLiquido: 0.25 }] }, pagamento: { formaPagamento: { descricao: quote.financials?.paymentMethod || 'Pix' } }, observacoes: `Orçamento ${quote.id} gerado pela Fresa Master. ${(quote.observations || []).join(' ')}` };
  const cdata = (value: unknown) => String(value || '').replace(/\]\]>/g, ']]]]><![CDATA[>');
  const xmlItems = items.map((item: JsonObject, index: number) => `<item><codigo>${item.sku || `FM-${index + 1}`}</codigo><descricao><![CDATA[${cdata(item.description)}]]></descricao><un>${item.unit || 'UN'}</un><qtde>${Number(item.quantity) || 1}</qtde><vlr_unit>${Number(item.unitPrice || 0).toFixed(2)}</vlr_unit><tipo>P</tipo><origem>0</origem><class_fiscal>${item.ncm || '8207.70.00'}</class_fiscal></item>`).join('');
  const shipTo = buildShipTo(quote);
  const blingXml = `<?xml version="1.0" encoding="UTF-8"?><pedido><cliente><nome><![CDATA[${cdata(client.name)}]]></nome><tipoPessoa>${cleanDocument.length === 14 ? 'J' : 'F'}</tipoPessoa><cpf_cnpj>${cleanDocument}</cpf_cnpj><ie>${client.ie || ''}</ie><endereco><![CDATA[${cdata(client.address)}]]></endereco><numero>${client.number || 'S/N'}</numero><complemento><![CDATA[${cdata(client.complement)}]]></complemento><bairro><![CDATA[${cdata(client.neighborhood)}]]></bairro><cep>${cleanCep}</cep><cidade><![CDATA[${cdata(client.city)}]]></cidade><uf>${client.state || 'SP'}</uf><fone>${cleanPhone}</fone><email>${client.email || ''}</email></cliente><transporte><transportadora><![CDATA[${cdata(quote.shipping?.selectedOption?.carrier || 'Correios')}]]></transportadora><tipo_frete>R</tipo_frete><servico_correios>${quote.shipping?.selectedOption?.name || 'Sedex'}</servico_correios><dados_etiqueta><nome><![CDATA[${cdata(shipTo.nome)}]]></nome><endereco><![CDATA[${cdata(shipTo.endereco)}]]></endereco><numero>${shipTo.numero}</numero><complemento><![CDATA[${cdata(shipTo.complemento)}]]></complemento><bairro><![CDATA[${cdata(shipTo.bairro)}]]></bairro><cep>${shipTo.cep}</cep><municipio><![CDATA[${cdata(shipTo.municipio)}]]></municipio><uf>${shipTo.uf}</uf></dados_etiqueta></transporte><itens>${xmlItems}</itens><vlr_frete>${Number(quote.financials?.shippingAmount || 0).toFixed(2)}</vlr_frete><vlr_desconto>${Number(quote.financials?.discountAmount || 0).toFixed(2)}</vlr_desconto><obs><![CDATA[Orçamento Fresa Master ${quote.id}.]]></obs></pedido>`;
  return { blingJson, blingXml };
}

async function shippingCalculate(body: JsonObject): Promise<Response> {
  const destinationCep = String(body.destinationCep || '');
  if (!destinationCep) return json({ error: 'CEP de destino é obrigatório.' }, 400);
  const items = Array.isArray(body.items) ? body.items : [];
  let weight = Number(body.weightKg) > 0 ? Number(body.weightKg) : items.length ? calculatePackageWeight(items).weightKg : 0.5;
  const weightDescription = Number(body.weightKg) > 0 ? `${weight.toFixed(1).replace('.', ',')} kg (definido manualmente)` : calculatePackageWeight(items).description;
  let declaredValue = Number(body.declaredValue) || items.reduce((sum: number, item: JsonObject) => sum + (Number(item.totalPrice) || 0), 0) || 280;
  const dimensions = body.packageDimensions || { height: 5, width: 12, length: 18 };
  const originCep = body.originCep || '13329-350';
  const insuranceEnabled = Boolean(body.insuranceEnabled);
  let options = await liveShippingRates(destinationCep, originCep, weight, dimensions, insuranceEnabled, declaredValue, body.melhorEnvioToken);
  const isLiveApi = Boolean(options?.length);
  if (!options?.length) options = calculateShippingRates(destinationCep, originCep, weight, dimensions, body.customShipping, insuranceEnabled, declaredValue);
  else {
    options.push(
      { service: 'RETIRADA', name: 'Retirada na Fresa Master', carrier: 'Balcão (Salto/SP)', price: 0, deliveryDays: 0, selected: false, insuranceIncluded: false, insuranceCost: 0, withInsurancePrice: 0, withoutInsurancePrice: 0 },
      { service: 'MOTOBOY', name: 'Envio por Motoboy / Aplicativo (Lalamove, Uber Flash)', carrier: 'Motoboy / App', price: 0, deliveryDays: 1, selected: false, insuranceIncluded: false, insuranceCost: 0, withInsurancePrice: 0, withoutInsurancePrice: 0 },
      { service: 'CONTA_FRESA', name: 'Envio por Nossa Conta (Cortesia Fresa Master)', carrier: 'Fresa Master', price: 0, deliveryDays: 2, selected: false, insuranceIncluded: false, insuranceCost: 0, withInsurancePrice: 0, withoutInsurancePrice: 0 },
    );
    if (body.customShipping && Number(body.customShipping.amount) >= 0) options.unshift({ service: 'PROPRIO', name: body.customShipping.name || 'Frete Fresa Master (Transportadora Própria)', carrier: 'Fresa Master', price: Number(Number(body.customShipping.amount).toFixed(2)), deliveryDays: 2, selected: false, insuranceIncluded: false, insuranceCost: 0, withInsurancePrice: Number(body.customShipping.amount), withoutInsurancePrice: Number(body.customShipping.amount) });
  }
  const address = await lookupViaCep(destinationCep);
  const insuranceAmount = insuranceEnabled ? Math.max(2.5, Number((declaredValue * 0.015).toFixed(2))) : 0;
  return json({ success: true, weightKg: weight, weightDescription, packageDimensions: dimensions, insuranceEnabled, declaredValue, insuranceAmount, isLiveApi, options, address });
}

const BLING_REDIRECT_URI = 'https://jnakhctoigbepxwbaygk.supabase.co/functions/v1/api/bling/oauth/callback';

async function blingDb(method: string, body?: unknown): Promise<any> {
  const base = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!base || !key) return null;
  const headers: Record<string, string> = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (method === 'POST') headers.Prefer = 'resolution=merge-duplicates,return=minimal';
  const response = await fetch(`${base}/rest/v1/bling_tokens${method === 'GET' ? '?id=eq.1&select=*' : '?on_conflict=id'}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) { const detail = await response.text().catch(() => ''); console.error('bling_tokens', response.status, detail); if (method === 'POST') throw new Error('Não foi possível salvar o token do Bling (HTTP ' + response.status + '): ' + detail.slice(0, 200)); return null; }
  return method === 'GET' ? (await response.json().catch(() => []))[0] || null : true;
}

async function blingTokenRequest(params: URLSearchParams): Promise<JsonObject> {
  const credentials = btoa(`${env('BLING_CLIENT_ID')}:${env('BLING_CLIENT_SECRET')}`);
  const response = await fetch('https://api.bling.com.br/Api/v3/oauth/token', { method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: params.toString() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error?.description || data.error_description || data.error || `HTTP ${response.status}`);
  await blingDb('POST', { id: 1, access_token: data.access_token, refresh_token: data.refresh_token, expires_at: new Date(Date.now() + (Number(data.expires_in) || 21600) * 1000).toISOString(), updated_at: new Date().toISOString() });
  return data;
}

async function getBlingToken(): Promise<string> {
  const row = await blingDb('GET');
  if (row?.access_token) {
    if (new Date(row.expires_at).getTime() - Date.now() > 120000) return row.access_token;
    if (row.refresh_token && env('BLING_CLIENT_ID') && env('BLING_CLIENT_SECRET')) {
      try {
        const data = await blingTokenRequest(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: row.refresh_token }));
        return String(data.access_token);
      } catch { /* cai para o token estático */ }
    }
  }
  return env('BLING_API_TOKEN') || '';
}
async function testBling(token: string): Promise<JsonObject> {
  if (!token.trim()) return { success: false, connected: false, message: 'Nenhum token de API do Bling fornecido.' };
  const headers = { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' };
  const [contacts, products] = await Promise.all([
    fetch('https://api.bling.com.br/Api/v3/contatos?limite=1', { headers }),
    fetch('https://api.bling.com.br/Api/v3/produtos?pagina=1&limite=1', { headers }),
  ]);
  if (contacts.status === 401 || products.status === 401) return { success: false, connected: false, message: 'Token do Bling não autorizado ou expirado.' };
  if (!contacts.ok) return { success: false, connected: false, message: `Não foi possível validar a conta Bling (HTTP ${contacts.status}).` };
  const productData = products.ok ? await products.json().catch(() => ({})) : null;
  const count = Array.isArray(productData?.data) ? productData.data.length : 0;
  return { success: true, connected: true, productsReadable: products.ok, productCount: count, message: products.ok ? `Bling conectado. A permissão de produtos está ativa (${count} produto(s) nesta página).` : `Conta conectada, mas o Bling negou acesso a produtos (HTTP ${products.status}). Reative produtos:read.` };
}

async function route(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const path = routePath(request);
  const authError = await authorize(request, path);
  if (authError) return authError;
  const url = new URL(request.url);
  const body = request.method === 'POST' ? await readJson(request) : {};

  try {
    if (path === '/health' && request.method === 'GET') return json({ status: 'ok', company: 'Fresa Master', hasApiKey: Boolean(env('GEMINI_API_KEY')), model: env('GEMINI_MODEL', 'gemini-3.5-flash-lite'), timestamp: new Date().toISOString() });
    if (path === '/quote/extract' && request.method === 'POST') return await extractQuote(body);
    if (path === '/shipping/extract-delivery' && request.method === 'POST') return await extractDelivery(body);
    if (path === '/bling/lookup-cnpj' && request.method === 'POST') {
      try {
        return json({ success: true, ...await lookupCnpj(body.cnpj) });
      } catch (error) {
        if (error instanceof CnpjLookupError) return json({ success: false, error: error.message }, error.status);
        console.error('Erro na consulta cadastral por CNPJ:', error);
        return json({ success: false, error: 'Não foi possível consultar os dados deste CNPJ.' }, 502);
      }
    }
    if (path === '/bling/extract-cadastral' && request.method === 'POST') return await extractCadastral(body);
    if (path === '/bling/generate-payload' && request.method === 'POST') {
      if (!body.quote?.client) return json({ error: 'Orçamento inválido.' }, 400);
      return json({ success: true, ...generateBlingPayload(body.quote) });
    }
    if (path === '/quote/generate-proposal' && request.method === 'POST') {
      const quote = body.quote || {};
      const total = Number(quote.financials?.totalAmount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const shippingName = quote.shipping?.selectedOption?.name || 'Sedex (Melhor Envio)';
      const shippingCost = Number(quote.financials?.shippingAmount || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const discountAmount = Number(quote.financials?.discountAmount || 0);
      const discountLine = discountAmount > 0
        ? `\n🏷️ *Desconto:* -${discountAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
        : '';
      const prompt = `Crie uma mensagem comercial da Fresa Master para ${body.channel === 'email' ? 'e-mail' : 'WhatsApp'} em tom ${body.tone || 'friendly'}. Cliente: ${quote.client?.name || ''}. CEP: ${quote.client?.cep || ''}. Itens: ${(quote.items || []).map((item: JsonObject) => `${item.description}: ${item.quantity} ${item.unit} x R$ ${Number(item.unitPrice).toFixed(2)} = R$ ${Number(item.totalPrice).toFixed(2)}`).join('; ')}. Subtotal R$ ${Number(quote.financials?.subtotal || 0).toFixed(2)}. Frete ${shippingName}: ${shippingCost}.${discountAmount > 0 ? ` Desconto concedido: R$ ${discountAmount.toFixed(2)}. Informe o desconto na mensagem.` : ' Não invente nem mencione desconto, pois nenhum foi aplicado.'} Prazo: ${quote.project?.deadline || 'A combinar'}. Total: ${total}. Pagamento: Pix (chave CNPJ 59.085.330/0001-70) ou link de pagamento com cartão de crédito (com juros). Peça confirmação do pedido. Não mencione nota fiscal, NF-e nem Bling.`;
      const ai = await callGemini([{ text: prompt }], 'Você é o assistente comercial da Fresa Master.', undefined, 700);
      const messageText = typeof ai === 'string' ? ai : '';
      const fallback = `Olá, *${quote.client?.name || 'cliente'}*! Tudo bem? Aqui é da *Fresa Master*.\n\nSegue o orçamento das ferramentas para sua router CNC:\n\n${(quote.items || []).map((item: JsonObject) => `🔹 *${item.description}*\n   ${item.quantity} un x R$ ${Number(item.unitPrice).toFixed(2)} = R$ ${Number(item.totalPrice).toFixed(2)}`).join('\n\n')}\n\n📦 *Frete:* ${shippingName} (${shippingCost})${discountLine}\n⏱️ *Prazo:* ${quote.project?.deadline || 'A combinar'}\n\n💰 *VALOR TOTAL:* ${total}\n💳 *Pagamento:* Pix (chave CNPJ 59.085.330/0001-70) ou link de pagamento com cartão de crédito (com juros)\n\nAssim que aprovar, é só nos avisar que já preparamos seu pedido!`;
      return json({ success: true, messageText: messageText || fallback });
    }
    if (path === '/shipping/calculate' && request.method === 'POST') return await shippingCalculate(body);
    if (path === '/shipping/create-sandbox-shipment' && request.method === 'POST') return json({ success: false, error: 'A criação de remessas sandbox ainda não está disponível nesta aplicação.' }, 501);
    if (path === '/bling/status' && request.method === 'GET') return json({ connected: Boolean(await getBlingToken()), hasToken: Boolean(await getBlingToken()), authorizeUrl: `https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=${env('BLING_CLIENT_ID')}&state=fresa_master` });
    if (path === '/bling/test-connection' && request.method === 'POST') return json(await testBling(body.token || await getBlingToken()));
    if (path === '/bling/products' && request.method === 'GET') {
      const token = await getBlingToken() || request.headers.get('x-bling-token')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || '';
      if (!token) return json({ success: false, error: 'Token de API do Bling não configurado.' }, 400);
      const products: JsonObject[] = [];
      for (let page = 1; page <= 20; page += 1) {
        const response = await fetch(`https://api.bling.com.br/Api/v3/produtos?pagina=${page}&limite=100`, { headers: { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return json({ success: false, error: `Falha ao consultar produtos no Bling: ${data.error?.description || data.message || `HTTP ${response.status}`}. Verifique produtos:read.` }, response.status);
        const pageProducts = Array.isArray(data.data) ? data.data : [];
        const activeProducts = pageProducts.filter((p: JsonObject) => p.situacao !== 'I');
        products.push(...activeProducts);
        if (pageProducts.length < 100) break;
      }
      return json({ success: true, products });
    }
    if (path === '/bling/products' && request.method === 'POST') {
      const token = request.headers.get('x-bling-token')?.replace(/^Bearer\s+/i, '') || body.token || await getBlingToken();
      const product = body.product || {};
      const name = String(product.name || '').trim();
      const sku = String(product.sku || '').trim();
      const price = Number(product.price);
      const ncm = String(product.ncm || '').replace(/\D/g, '');
      if (!token) return json({ success: false, error: 'Conecte o Bling antes de cadastrar o produto.' }, 401);
      if (!name || !sku || !Number.isFinite(price) || price <= 0 || ncm.length !== 8) return json({ success: false, error: 'Informe descrição, SKU, preço maior que zero e NCM com 8 dígitos.' }, 400);
      const response = await fetch('https://api.bling.com.br/Api/v3/produtos', { method: 'POST', headers: { Authorization: `Bearer ${String(token).trim()}`, Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: name, codigo: sku, preco: price, tipo: 'P', situacao: 'A', formato: 'S', unidade: 'UN', pesoLiquido: 0, pesoBruto: 0, tributacao: { ncm } }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return json({ success: false, error: data.error?.description || data.message || 'O Bling recusou o cadastro do produto.', details: data }, response.status);
      return json({ success: true, product: data.data }, 201);
    }
    if (path === '/bling/create-order' && request.method === 'POST') {
      const quote = body.quote;
      const token = body.token || await getBlingToken();
      if (!quote?.client) return json({ success: false, error: 'Dados do orçamento ou cliente não fornecidos.' }, 400);
      if (!token) return json({ success: false, error: 'Token de API do Bling não configurado.' }, 400);
      const missing = (quote.items || []).filter((item: JsonObject) => !String(item.sku || '').trim() || String(item.ncm || '').replace(/\D/g, '').length !== 8 || Number(item.unitPrice) <= 0);
      if (missing.length) return json({ success: false, error: `Cadastre ou selecione no catálogo do Bling antes de emitir: ${missing.map((item: JsonObject) => item.description).join(', ')}.` }, 400);
      const doc = String(quote.client.document || '').replace(/\D/g, '');
      const payload = { numeroLoja: quote.id, data: quote.project?.date || new Date().toISOString().slice(0, 10), dataSaida: quote.project?.date || new Date().toISOString().slice(0, 10), contato: { nome: quote.client.name || 'Cliente Fresa Master', tipoPessoa: doc.length === 14 ? 'J' : 'F', numeroDocumento: doc || undefined, ie: quote.client.ie || '', email: quote.client.email || undefined, telefone: String(quote.client.phone || '').replace(/\D/g, '') || undefined, endereco: { endereco: quote.client.address || 'Rua de Entrega', numero: quote.client.number || 'S/N', complemento: quote.client.complement || undefined, bairro: quote.client.neighborhood || 'Centro', cep: String(quote.client.cep || '').replace(/\D/g, '') || undefined, municipio: quote.client.city || 'Curitiba', uf: quote.client.state || 'PR' } }, itens: quote.items.map((item: JsonObject, index: number) => ({ ...(/^\d+$/.test(String(item.sku || '')) ? { produto: { id: Number(item.sku) } } : {}), codigo: item.sku || `FM-${index + 1}`, descricao: item.description, unidade: item.unit || 'UN', quantidade: Number(item.quantity) || 1, valor: Number(item.unitPrice) || 0, ncm: item.ncm || '8207.70.00' })), transporte: { fretePorConta: 0, transportador: { nome: quote.shipping?.selectedOption?.carrier || 'Melhor Envio / Correios' }, frete: Number(quote.financials?.shippingAmount) || 0, etiqueta: buildShipTo(quote), volumes: [{ servico: quote.shipping?.selectedOption?.name || 'Sedex', pesoBruto: quote.shipping?.weightKg || 0.5 }] }, pagamento: { formaPagamento: { descricao: quote.financials?.paymentMethod || 'Pix' } }, observacoes: `Pedido gerado pelo aplicativo Fresa Master • Orçamento ${quote.id}.` };
      const bh = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' };
      let contactId: number | undefined;
      if (doc) {
        const found = await fetch('https://api.bling.com.br/Api/v3/contatos?numeroDocumento=' + doc, { headers: bh }).then((r) => r.json()).catch(() => ({}));
        contactId = found?.data?.[0]?.id;
      }
      if (!contactId) {
        const isExempt = String(payload.contato.ie || '').trim().toUpperCase() === 'ISENTO';
        const created = await fetch('https://api.bling.com.br/Api/v3/contatos', { method: 'POST', headers: bh, body: JSON.stringify({ nome: payload.contato.nome, tipo: payload.contato.tipoPessoa, numeroDocumento: payload.contato.numeroDocumento, situacao: 'A', indicadorIe: isExempt ? 2 : payload.contato.ie ? 1 : 9, ie: payload.contato.ie || undefined, email: payload.contato.email, ...(/^\d{10,11}$/.test(String(payload.contato.telefone || '')) ? { telefone: payload.contato.telefone } : {}), endereco: { geral: { endereco: payload.contato.endereco.endereco, numero: payload.contato.endereco.numero, complemento: payload.contato.endereco.complemento, bairro: payload.contato.endereco.bairro, cep: payload.contato.endereco.cep, municipio: payload.contato.endereco.municipio, uf: payload.contato.endereco.uf } } }) });
        const cdata = await created.json().catch(() => ({}));
        contactId = cdata?.data?.id;
        if (!contactId) return json({ success: false, error: cdata?.error?.description || cdata?.error?.message || 'N?o foi poss?vel cadastrar o cliente no Bling.', blingDetails: cdata }, created.status || 400);
      }
      (payload as JsonObject).contato = { id: contactId };
      const response = await fetch('https://api.bling.com.br/Api/v3/pedidos/vendas', { method: 'POST', headers: { Authorization: `Bearer ${String(token).trim()}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return json({ success: false, error: formatBlingError(data), blingDetails: data }, response.status);
      const orderId = data?.data?.id || data?.id;
      const orderNumber = data?.data?.numero || data?.numero || payload.numeroLoja;
      return json({ success: true, blingOrderId: orderId, blingOrderNumber: orderNumber, blingOrderUrl: orderId ? `https://www.bling.com.br/b/vendas.php#edit/${orderId}` : undefined, message: `Pedido #${orderNumber} criado diretamente no Bling com sucesso!`, data });
    }
    if (path.startsWith('/bling/nfe/') && request.method === 'POST') {
      const token = await getBlingToken();
      if (!token) return json({ success: false, error: 'Conecte o Bling antes de emitir a NF-e.' }, 401);
      const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' };
      const summarize = (n: JsonObject) => ({ id: n.id, numero: n.numero, serie: n.serie, situacao: n.situacao, chaveAcesso: n.chaveAcesso, linkDanfe: n.linkDanfe || n.linkPDF, xml: n.xml, linkXml: n.xml, tipo: n.tipo });
      const readNfe = async (id: string | number) => {
        const r = await fetch(`https://api.bling.com.br/Api/v3/nfe/${id}`, { headers });
        const d = await r.json().catch(() => ({}));
        return { ok: r.ok, status: r.status, data: d };
      };
      const ensureFiscal = async (nfeId: string | number, orderId?: string) => {
        let info = await readNfe(nfeId);
        let fiscalWarning: string | undefined;
        let newId: string | number = nfeId;
        const draft = info.ok ? info.data.data : null;
        if (draft) {
          const uf = String(draft.contato?.endereco?.uf || '').toUpperCase();
          const cfop = uf === 'SP' ? '5102' : '6102';
          const needsFix = (draft.itens || []).some((i: JsonObject) => String(i.cfop) !== cfop);
          if (needsFix && uf) {
            const { id: _id, chaveAcesso: _c, xml: _x, linkDanfe: _d, linkPDF: _p, situacao: _s, dataEmissao: _e, ...rest } = draft;
            const orderItems = orderId ? ((await fetch(`https://api.bling.com.br/Api/v3/pedidos/vendas/${orderId}`, { headers }).then((r) => r.json()).catch(() => ({})))?.data?.itens || []) : [];
            const updated = { ...rest, transporte: { ...(rest.transporte || {}), frete: Number(rest.valorFrete) || 0 }, itens: (draft.itens || []).map((i: JsonObject, idx: number) => ({ ...i, codigo: i.codigo || orderItems[idx]?.codigo || `FM-${idx + 1}`, cfop })) };
            const u = await fetch(`https://api.bling.com.br/Api/v3/nfe/${nfeId}`, { method: 'PUT', headers, body: JSON.stringify(updated) });
            if (!u.ok) fiscalWarning = `N?o foi poss?vel ajustar o CFOP automaticamente: ${JSON.stringify(await u.json().catch(() => ({}))).slice(0, 700)}`;
            else info = await readNfe(nfeId);
          }
        }
        return { info, fiscalWarning, nfeId: newId };
      };
      if (path === '/bling/nfe/generate') {
        const orderId = String(body.orderId || '').trim();
        if (!orderId) return json({ success: false, error: 'Informe o ID do pedido de venda do Bling.' }, 400);
        const r = await fetch(`https://api.bling.com.br/Api/v3/pedidos/vendas/${orderId}/gerar-nfe`, { method: 'POST', headers });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json({ success: false, error: d.error?.description || d.error?.message || `O Bling recusou gerar a NF-e (HTTP ${r.status}).`, details: d }, r.status);
        const nfeId = d.data?.id;
        const fixed = nfeId ? await ensureFiscal(nfeId, orderId) : null;
        const finalId = fixed?.nfeId ?? nfeId;
        const info = fixed?.info ?? null;
        const fiscalWarning = fixed?.fiscalWarning;
        return json({ success: true, nfeId: finalId, fiscalWarning, nfe: info?.ok ? summarize(info.data.data || {}) : d.data, message: 'NF-e gerada no Bling como rascunho. Confira e envie à SEFAZ.' });
      }
      if (path === '/bling/nfe/send') {
        const nfeId = String(body.nfeId || '').trim();
        if (!nfeId) return json({ success: false, error: 'Informe o ID da NF-e.' }, 400);
        const r = await fetch(`https://api.bling.com.br/Api/v3/nfe/${nfeId}/enviar`, { method: 'POST', headers });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) return json({ success: false, error: d.error?.description || d.error?.message || `A SEFAZ/Bling recusou o envio (HTTP ${r.status}).`, details: d }, r.status);
        const info = await readNfe(nfeId);
        return json({ success: true, nfe: info.ok ? summarize(info.data.data || {}) : d.data, message: 'NF-e enviada para autorização.' });
      }
      if (path === '/bling/nfe/status') {
        const nfeId = String(body.nfeId || '').trim();
        if (!nfeId) return json({ success: false, error: 'Informe o ID da NF-e.' }, 400);
        if (body.fix) { const fx = await ensureFiscal(nfeId, String(body.orderId || '')); return json({ success: !fx.fiscalWarning, fiscalWarning: fx.fiscalWarning, nfe: fx.info.ok ? summarize(fx.info.data.data || {}) : undefined, raw: body.debug ? fx.info.data.data : undefined }); }
        const info = await readNfe(nfeId);
        if (!info.ok) return json({ success: false, error: info.data.error?.description || `Falha ao consultar a NF-e (HTTP ${info.status}).` }, info.status);
        return json({ success: true, nfe: summarize(info.data.data || {}), raw: body.debug ? info.data.data : undefined });
      }
    }
    if (path === '/bling/oauth/token-exchange' && request.method === 'POST') {
      const { code, clientId, clientSecret, redirectUri } = body;
      if (!code || !clientId || !clientSecret) return json({ success: false, error: 'Parâmetros obrigatórios ausentes: code, clientId e clientSecret.' }, 400);
      const credentials = btoa(`${String(clientId).trim()}:${String(clientSecret).trim()}`);
      const params = new URLSearchParams({ grant_type: 'authorization_code', code: String(code).trim() });
      if (redirectUri) params.set('redirect_uri', String(redirectUri).trim());
      const response = await fetch('https://bling.com.br/Api/v3/oauth/token', { method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: params.toString() });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return json({ success: false, error: data.error_description || data.error || 'Erro ao obter token do Bling.', details: data }, response.status);
      return json({ success: true, accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in, tokenType: data.token_type });
    }
    if (path === '/bling/oauth/callback' && request.method === 'GET') {
      const params = url.searchParams;
      const code = params.get('code') || '';
      const error = params.get('error') || '';
      let connectedMsg = '';
      if (code && !error && env('BLING_CLIENT_ID') && env('BLING_CLIENT_SECRET')) {
        try {
          await blingTokenRequest(new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: BLING_REDIRECT_URI }));
          connectedMsg = 'ok';
        } catch (err) {
          return html(`<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:32px"><h1>Falha ao conectar o Bling</h1><p>${String((err as Error).message).replace(/[<>&]/g, '')}</p></body>`, 400);
        }
      }
      if (connectedMsg) return html('<!doctype html><meta charset="utf-8"><title>Bling conectado</title><body style="font:18px system-ui;background:#0f172a;color:#f8fafc;display:grid;place-items:center;min-height:100vh;margin:0"><main style="text-align:center"><h1>Bling conectado com sucesso!</h1><p>Pode fechar esta aba e voltar ao app da Fresa Master.</p></main></body>');
      const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
      return html(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autorização Bling - Fresa Master</title><body style="font:16px system-ui;background:#0f172a;color:#f8fafc;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:560px;padding:32px;background:#1e293b;border:1px solid #334155"><h1>${error ? 'Erro na autorização' : 'Autorização recebida'}</h1><p>${escape(error || 'O Bling autorizou a integração Fresa Master.')}</p><code id="code">${escape(code)}</code></main><script>const code=${JSON.stringify(code)};if(code&&window.opener)window.opener.postMessage({type:'BLING_AUTH_CODE',code},'*');</script></body></html>`);
    }
    if (path === '/shipping/test-melhor-envio' && request.method === 'POST') {
      const token = body.token || env('MELHOR_ENVIO_TOKEN');
      if (!token) return json({ success: false, connected: false, message: 'Nenhum token do Melhor Envio fornecido.' }, 400);
      const host = body.isSandbox ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
      const response = await fetch(`${host}/api/v2/me`, { headers: { Authorization: `Bearer ${String(token).trim()}`, Accept: 'application/json', 'User-Agent': 'FresaMaster (fresamaster0@gmail.com)' } });
      if (!response.ok) return json({ success: false, connected: false, message: response.status === 401 ? 'Token não autorizado ou expirado.' : `Melhor Envio retornou HTTP ${response.status}.` });
      const user = await response.json();
      return json({ success: true, connected: true, user: { name: user.firstname ? `${user.firstname} ${user.lastname || ''}`.trim() : user.name || 'Usuário', email: user.email, company: user.company_name, environment: body.isSandbox ? 'Sandbox (Testes)' : 'Produção (Oficial)' }, calculationActive: true, message: `Conectado à conta de ${user.firstname || 'Melhor Envio'} (${user.email}).` });
    }
    if (path === '/shipping/melhor-envio/exchange-code' && request.method === 'POST') {
      const { code, redirectUri, isSandbox } = body;
      const clientId = body.clientId || env('MELHOR_ENVIO_CLIENT_ID');
      const clientSecret = body.clientSecret || env('MELHOR_ENVIO_CLIENT_SECRET');
      if (!code) return json({ success: false, error: "Código de autorização 'code' não fornecido." }, 400);
      if (!clientId || !clientSecret) return json({ success: false, error: 'Client ID e Client Secret do Melhor Envio não configurados.' }, 400);
      const host = isSandbox ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
      const response = await fetch(`${host}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'FresaMaster (fresamaster0@gmail.com)' }, body: JSON.stringify({ grant_type: 'authorization_code', client_id: String(clientId).trim(), client_secret: String(clientSecret).trim(), redirect_uri: redirectUri, code: String(code).trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return json({ success: false, error: data.message || data.error_description || data.error || 'Falha na troca do token.', details: data }, response.status);
      return json({ success: true, accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in });
    }
    if (path === '/shipping/melhor-envio/callback' && request.method === 'GET') {
      const code = url.searchParams.get('code') || '';
      const error = url.searchParams.get('error') || '';
      return html(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Autorização Melhor Envio</title><body style="font:16px system-ui;background:#0f172a;color:#f8fafc;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:560px;padding:32px;background:#1e293b;border:1px solid #334155"><h1>${error ? 'Erro na autorização' : 'Autorização recebida'}</h1><code id="code">${String(code).replace(/[&<>]/g, '')}</code></main><script>const code=${JSON.stringify(code)};if(code&&window.opener)window.opener.postMessage({type:'MELHOR_ENVIO_AUTH_CODE',code},'*');</script></body></html>`);
    }
    return json({ success: false, error: 'Rota não encontrada.' }, 404);
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Erro interno da função.' }, 500);
  }
}

if (edge) edge.serve(route);
