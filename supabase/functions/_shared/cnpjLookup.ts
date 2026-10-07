export type CnpjLookupClient = {
  name: string;
  tradeName: string;
  document: string;
  ie: string;
  email: string;
  phone: string;
  cep: string;
  address: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

export type CnpjLookupResult = {
  client: CnpjLookupClient;
  warnings: string[];
  source: string;
};

export class CnpjLookupError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'CnpjLookupError';
    this.status = status;
  }
}

type JsonObject = Record<string, unknown>;

type ProviderResult = {
  data?: JsonObject;
  status?: number;
};

export function normalizeAndValidateCnpj(value: unknown): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return '';

  const calculateDigit = (base: string, weights: number[]) => {
    const sum = [...base].reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const firstDigit = calculateDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = calculateDigit(digits.slice(0, 12) + firstDigit, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

  return digits.endsWith(`${firstDigit}${secondDigit}`) ? digits : '';
}

async function fetchJson(url: string, fetcher: typeof fetch): Promise<ProviderResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'FresaMaster/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) return { status: response.status };
    const data: unknown = await response.json();
    return data && typeof data === 'object' ? { data: data as JsonObject, status: response.status } : { status: response.status };
  } catch {
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

const value = (object: JsonObject | undefined, key: string) => String(object?.[key] ?? '').trim();

function formatCnpj(digits: string): string {
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

function normalizeProviderCnpj(data: JsonObject, digits: string): JsonObject | null {
  const establishment = data.estabelecimento && typeof data.estabelecimento === 'object'
    ? data.estabelecimento as JsonObject
    : data;
  const returnedDigits = String(establishment.cnpj || data.cnpj || '').replace(/\D/g, '');
  if (returnedDigits && returnedDigits !== digits) return null;

  const cityData = establishment.municipio || establishment.cidade;
  const city = cityData && typeof cityData === 'object'
    ? value(cityData as JsonObject, 'nome')
    : value(data, 'municipio');
  const stateData = establishment.estado;
  const state = stateData && typeof stateData === 'object'
    ? value(stateData as JsonObject, 'sigla')
    : value(establishment, 'uf') || value(data, 'uf');
  const areaCode = value(establishment, 'ddd1');
  const telephone = value(establishment, 'telefone1');
  const phone = value(data, 'ddd_telefone_1') || `${areaCode}${telephone}`;
  const phoneDigits = phone.replace(/\D/g, '');
  const formattedPhone = phoneDigits.length >= 10
    ? `(${phoneDigits.slice(0, 2)}) ${phoneDigits.slice(2, -4)}-${phoneDigits.slice(-4)}`
    : phoneDigits;

  return {
    ...data,
    cnpj: returnedDigits || digits,
    razao_social: data.razao_social || establishment.razao_social,
    nome_fantasia: establishment.nome_fantasia || data.nome_fantasia,
    cep: establishment.cep || data.cep,
    descricao_tipo_de_logradouro: establishment.tipo_logradouro || data.descricao_tipo_de_logradouro,
    logradouro: establishment.logradouro || data.logradouro,
    numero: establishment.numero || data.numero,
    complemento: establishment.complemento || data.complemento,
    bairro: establishment.bairro || data.bairro,
    municipio: city,
    uf: state,
    email: establishment.email || data.email,
    ddd_telefone_1: formattedPhone,
  };
}

export async function lookupCnpj(valueToLookup: unknown, fetcher: typeof fetch = fetch): Promise<CnpjLookupResult> {
  const digits = normalizeAndValidateCnpj(valueToLookup);
  if (!digits) throw new CnpjLookupError('Informe um CNPJ válido com 14 dígitos.', 400);

  const [brasilApiResult, cnpjWsResult] = await Promise.all([
    fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, fetcher),
    fetchJson(`https://publica.cnpj.ws/cnpj/${digits}`, fetcher),
  ]);
  const brasilApi = brasilApiResult.data
    ? normalizeProviderCnpj(brasilApiResult.data, digits)
    : null;
  const cnpjWs = cnpjWsResult.data
    ? normalizeProviderCnpj(cnpjWsResult.data, digits)
    : null;
  const registrationData = cnpjWs ? cnpjWsResult.data?.estabelecimento : undefined;
  const establishment = registrationData && typeof registrationData === 'object'
    ? registrationData as JsonObject
    : undefined;
  const base: JsonObject | null = brasilApi && cnpjWs
    ? {
        ...cnpjWs,
        ...brasilApi,
        razao_social: brasilApi.razao_social || cnpjWs.razao_social,
        nome_fantasia: brasilApi.nome_fantasia || cnpjWs.nome_fantasia,
        cep: brasilApi.cep || cnpjWs.cep,
        descricao_tipo_de_logradouro: brasilApi.descricao_tipo_de_logradouro || cnpjWs.descricao_tipo_de_logradouro,
        logradouro: brasilApi.logradouro || cnpjWs.logradouro,
        numero: brasilApi.numero || cnpjWs.numero,
        complemento: brasilApi.complemento || cnpjWs.complemento,
        bairro: brasilApi.bairro || cnpjWs.bairro,
        municipio: brasilApi.municipio || cnpjWs.municipio,
        uf: brasilApi.uf || cnpjWs.uf,
        email: brasilApi.email || cnpjWs.email,
        ddd_telefone_1: brasilApi.ddd_telefone_1 || cnpjWs.ddd_telefone_1,
      }
    : brasilApi || cnpjWs;

  if (!base) {
    if (brasilApiResult.status === 404 && cnpjWsResult.status === 404) {
      throw new CnpjLookupError('CNPJ não encontrado nos serviços de consulta.', 404);
    }
    throw new CnpjLookupError('Os serviços de consulta cadastral estão indisponíveis. Tente novamente mais tarde.', 502);
  }

  const state = value(base, 'uf').toUpperCase();
  const registrations = Array.isArray(establishment?.inscricoes_estaduais)
    ? establishment.inscricoes_estaduais.filter((entry): entry is JsonObject => Boolean(entry && typeof entry === 'object'))
    : [];
  const activeRegistrations = registrations.filter((entry) => entry.ativo === true);
  const matchingRegistration = activeRegistrations.find((entry) => {
    const registrationState = entry.estado && typeof entry.estado === 'object'
      ? value(entry.estado as JsonObject, 'sigla').toUpperCase()
      : '';
    return state && registrationState === state;
  });
  const selectedRegistration = matchingRegistration || (!state && activeRegistrations.length === 1 ? activeRegistrations[0] : undefined);
  const ie = value(selectedRegistration, 'inscricao_estadual');
  const cepDigits = value(base, 'cep').replace(/\D/g, '');
  const streetType = value(base, 'descricao_tipo_de_logradouro');
  const street = value(base, 'logradouro');
  const warnings: string[] = [];

  if (!selectedRegistration) {
    if (activeRegistrations.length > 0) {
      warnings.push('Foram localizadas Inscrições Estaduais ativas, mas não foi possível associá-las com segurança à UF do estabelecimento.');
    } else if (!cnpjWs) {
      warnings.push('Os dados da empresa foram encontrados, mas não foi possível consultar a Inscrição Estadual. Confira com o cliente ou na SEFAZ.');
    } else {
      warnings.push('Nenhuma Inscrição Estadual ativa compatível com a UF foi retornada. Confira com o cliente ou na SEFAZ; a consulta não confirma isenção.');
    }
  }

  const client: CnpjLookupClient = {
    name: value(base, 'razao_social'),
    tradeName: value(base, 'nome_fantasia'),
    document: formatCnpj(digits),
    ie,
    email: value(base, 'email').toLowerCase(),
    phone: value(base, 'ddd_telefone_1'),
    cep: cepDigits.length === 8 ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}` : '',
    address: [streetType, street].filter(Boolean).join(' '),
    number: value(base, 'numero'),
    complement: value(base, 'complemento'),
    neighborhood: value(base, 'bairro'),
    city: value(base, 'municipio'),
    state,
  };

  return { client, warnings, source: brasilApi ? 'BrasilAPI' : 'CNPJ.ws' };
}
