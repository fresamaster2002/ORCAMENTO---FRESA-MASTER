export interface MelhorEnvioTokenRecord {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  pendingState?: string;
  pendingCreatedAt?: string;
}

export interface MelhorEnvioTokenStore {
  load: () => Promise<MelhorEnvioTokenRecord | null>;
  save: (record: MelhorEnvioTokenRecord) => Promise<void>;
}

type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  store: MelhorEnvioTokenStore;
  now?: () => number;
  fetcher?: typeof fetch;
};

export class MelhorEnvioOAuthError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'MelhorEnvioOAuthError';
  }
}

const endpoint = 'https://melhorenvio.com.br/oauth/token';
const userAgent = 'FresaMaster (fresamaster0@gmail.com)';
const clock = (config: OAuthConfig) => config.now?.() ?? Date.now();
const request = (config: OAuthConfig, input: RequestInfo | URL, init?: RequestInit) => (config.fetcher || fetch)(input, init);

async function exchange(config: OAuthConfig, body: URLSearchParams): Promise<MelhorEnvioTokenRecord> {
  if (!config.clientId || !config.clientSecret) {
    throw new MelhorEnvioOAuthError('Configure MELHOR_ENVIO_CLIENT_ID e MELHOR_ENVIO_CLIENT_SECRET como secrets da função api.', 503);
  }
  const response = await request(config, endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': userAgent },
    body: JSON.stringify(Object.fromEntries(body)),
    signal: AbortSignal.timeout(15000),
  });
  const data: unknown = await response.json().catch(() => ({}));
  const result = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  if (!response.ok || typeof result.access_token !== 'string' || typeof result.refresh_token !== 'string') {
    const reason = String(result.error_description || result.message || result.error || `HTTP ${response.status}`);
    throw new MelhorEnvioOAuthError(`O Melhor Envio não concluiu a autorização OAuth: ${reason}`, response.status || 502);
  }
  const expiresIn = Number(result.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn < 60) {
    throw new MelhorEnvioOAuthError('O Melhor Envio retornou um prazo de token inválido.', 502);
  }
  return {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresAt: new Date(clock(config) + expiresIn * 1000).toISOString(),
  };
}

export async function beginProductionOAuth(config: OAuthConfig): Promise<string> {
  if (!config.clientId || !config.clientSecret) {
    throw new MelhorEnvioOAuthError('Cadastre MELHOR_ENVIO_CLIENT_ID e MELHOR_ENVIO_CLIENT_SECRET nos secrets da função api antes de conectar.', 503);
  }
  const state = crypto.randomUUID();
  const previous = await config.store.load();
  await config.store.save({
    accessToken: previous?.accessToken || '',
    refreshToken: previous?.refreshToken || '',
    expiresAt: previous?.expiresAt || new Date(0).toISOString(),
    pendingState: state,
    pendingCreatedAt: new Date(clock(config)).toISOString(),
  });
  const authorize = new URL('https://melhorenvio.com.br/oauth/authorize');
  authorize.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    state,
    scope: 'shipping-calculate users-read cart-write',
  }).toString();
  return authorize.toString();
}

export async function completeProductionOAuth(config: OAuthConfig, code: string, state: string): Promise<void> {
  if (!code || code.length > 2048 || !state || state.length > 128) {
    throw new MelhorEnvioOAuthError('Retorno OAuth incompleto. Inicie novamente a conexão com Melhor Envio.');
  }
  const previous = await config.store.load();
  const issued = Date.parse(previous?.pendingCreatedAt || '');
  if (!previous?.pendingState || previous.pendingState !== state || !Number.isFinite(issued) || clock(config) - issued > 10 * 60 * 1000) {
    throw new MelhorEnvioOAuthError('A autorização expirou ou não corresponde à solicitação iniciada. Feche esta página e conecte novamente.', 403);
  }
  await config.store.save({
    accessToken: previous.accessToken,
    refreshToken: previous.refreshToken,
    expiresAt: previous.expiresAt,
  });
  const tokens = await exchange(config, new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code,
  }));
  await config.store.save(tokens);
}

export async function productionAccessToken(config: OAuthConfig, staticToken = ''): Promise<string> {
  const saved = await config.store.load();
  if (!saved?.refreshToken) {
    if (staticToken) return staticToken;
    throw new MelhorEnvioOAuthError('Conecte a conta de produção do Melhor Envio ou configure MELHOR_ENVIO_PRODUCTION_TOKEN.', 401);
  }
  const expiry = Date.parse(saved.expiresAt);
  if (saved.accessToken && Number.isFinite(expiry) && expiry - clock(config) > 5 * 60 * 1000) return saved.accessToken;
  const tokens = await exchange(config, new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: saved.refreshToken,
  }));
  await config.store.save(tokens);
  return tokens.accessToken;
}
