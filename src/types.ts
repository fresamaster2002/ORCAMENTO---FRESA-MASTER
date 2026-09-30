export interface ClientInfo {
  name: string; // Razão Social ou Nome Completo
  tradeName?: string; // Nome Fantasia
  company?: string;
  email?: string;
  phone?: string;
  document?: string; // CPF ou CNPJ
  ie?: string; // Inscrição Estadual ou "ISENTO"
  cep?: string;
  address?: string; // Logradouro (Rua/Av)
  number?: string;
  complement?: string;
  neighborhood?: string; // Bairro
  city?: string;
  state?: string; // UF
}

export interface ShippingOption {
  service: 'SEDEX' | 'PAC' | 'JADLOG_PACKAGE' | 'RETIRADA' | 'PROPRIO' | 'MOTOBOY' | 'CONTA_FRESA';
  name: string;
  carrier: string;
  price: number;
  deliveryDays: number;
  selected?: boolean;
  insuranceIncluded?: boolean;
  insuranceCost?: number; // Custo do seguro de carga
  withInsurancePrice?: number; // Preço com seguro incluído
  withoutInsurancePrice?: number; // Preço base sem seguro
  melhorEnvioServiceId?: number;
  isRealTimeMelhorEnvio?: boolean;
}

export interface PackageDimensions {
  height: number; // Altura em cm (padrão Correios min 2cm ou 5cm caixa)
  width: number;  // Largura em cm (min 11cm Correios)
  length: number; // Comprimento em cm (min 16cm Correios)
}

export interface ShippingInfo {
  originCep: string;
  destinationCep: string;
  weightKg?: number; // Peso estimado da encomenda em kg (padrão 0,5 kg)
  weightDescription?: string; // Detalhamento do peso das fresas e embalagem
  packageDimensions?: PackageDimensions;
  customShippingAmount?: number; // Valor de frete personalizado/próprio
  customShippingName?: string;   // Nome da transportadora/modalidade própria
  insuranceEnabled?: boolean;    // Se o envio vai com seguro ou sem seguro
  declaredValue?: number;        // Valor declarado das ferramentas para o seguro
  insuranceAmount?: number;      // Valor calculado do seguro
  selectedOption?: ShippingOption;
  options: ShippingOption[];
}

export interface BlingCatalogProduct {
  id: string;
  sku: string;
  description: string;
  category: string;
  unitPrice: number;
  unit: string;
  ncm: string;
  weightGrams: number;
  cutDiameterMm?: number;
  shankDiameterMm?: number;
  cutLengthMm?: number;
  tags: string[];
}

export interface ProjectInfo {
  title: string;
  category: string;
  description: string;
  deadline?: string;
  validityDays: number;
  date: string;
}

export interface QuoteItem {
  id: string;
  description: string;
  category?: string;
  sku?: string;
  ncm?: string; // NCM para NF-e (ex: 8207.70.00 para fresas de usinagem)
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
}

export interface Financials {
  subtotal: number;
  shippingAmount: number;
  insuranceAmount?: number;
  discountPercentage: number;
  discountAmount: number;
  taxPercentage: number;
  taxAmount: number;
  totalAmount: number;
  paymentTerms: string;
  paymentMethod: string;
}

export interface QuoteData {
  id: string;
  status: 'draft' | 'sent' | 'approved' | 'rejected';
  client: ClientInfo;
  project: ProjectInfo;
  items: QuoteItem[];
  shipping: ShippingInfo;
  financials: Financials;
  observations: string[];
  notesForClient: string;
  createdAt: string;
  sandboxShipment?: {
    id: string | null;
    protocol: string | null;
    createdAt: string;
  };
}

export interface ExtractQuoteRequest {
  text: string;
  currentQuote?: Partial<QuoteData>;
  customInstructions?: string;
}

export interface ExtractQuoteResponse {
  success: boolean;
  quote: QuoteData;
  missingInfo: string[];
  confidence: number;
  summary: string;
}

export interface ExtractCadastralRequest {
  text: string;
  currentClient?: Partial<ClientInfo>;
}

export interface ExtractCadastralResponse {
  success: boolean;
  client: ClientInfo;
  summary: string;
}

export interface GenerateProposalRequest {
  quote: QuoteData;
  tone?: 'professional' | 'friendly' | 'formal';
  channel?: 'whatsapp' | 'email';
}

export interface GenerateProposalResponse {
  success: boolean;
  messageText: string;
}
