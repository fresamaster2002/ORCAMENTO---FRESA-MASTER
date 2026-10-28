import { buildShipmentPayload, quoteMelhorEnvioShipment, requestShipmentApi, SandboxShipmentError } from './sandboxShipment.ts';

type Data = Record<string, unknown>;
const object = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export interface ProductionShipment {
  environment: 'production';
  status: 'creating' | 'created' | 'unknown' | 'rejected';
  requestedAt: string;
  id: string | null;
  protocol: string | null;
  price: number;
  error?: string;
}

export class ProductionShipmentError extends SandboxShipmentError {
  constructor(message: string, status = 400, public shipment?: ProductionShipment) { super(message, status); }
}

export interface ShipmentQuoteRecord {
  quote: Data;
  revision: string;
}
export interface ShipmentQuoteStore {
  load: (quoteId: string) => Promise<ShipmentQuoteRecord>;
  save: (record: ShipmentQuoteRecord, shipment: ProductionShipment) => Promise<ShipmentQuoteRecord>;
}

export function productionToken(production: string): string {
  return production.trim();
}

export async function testProductionConnection(token: string) {
  if (!token) throw new ProductionShipmentError('Conecte a conta de produção do Melhor Envio ou configure MELHOR_ENVIO_PRODUCTION_TOKEN no servidor.', 401);
  const account = object(await requestShipmentApi(token, '/me', 'GET', undefined, 'production'));
  if (!text(account.email)) throw new ProductionShipmentError('Não foi possível identificar a conta real do Melhor Envio.', 502);
  return { success: true, environment: 'production', email: text(account.email), name: text(account.firstname) || text(account.name) };
}

export async function createProductionShipment(input: Data, token: string, store: ShipmentQuoteStore, verifyInvoice: (quote: Data) => Promise<void>) {
  const quoteId = text(input.quoteId);
  if (!quoteId || quoteId.length > 100) throw new ProductionShipmentError('Orçamento inválido.');
  const saved = await store.load(quoteId);
  const previous = object(saved.quote.productionShipment);
  if (previous.id || previous.requestedAt && previous.status !== 'rejected') {
    return { success: true, environment: 'production', shipment: previous, reused: true };
  }
  if (input.confirmProduction !== true) throw new ProductionShipmentError('Confirme a inclusão no carrinho real do Melhor Envio. O pagamento será feito no painel oficial.');
  if (!token) throw new ProductionShipmentError('Conecte a conta de produção do Melhor Envio ou configure MELHOR_ENVIO_PRODUCTION_TOKEN no servidor.', 401);
  const nfe = object(object(saved.quote.bling).nfe);
  const key = text(nfe.chaveAcesso).replace(/\D/g, '');
  if (Number(nfe.situacao) !== 5 || Number(nfe.serie) !== 2 || !key) {
    throw new ProductionShipmentError('Consulte a NF-e no Bling e confirme que está autorizada, série 2, com chave de acesso salva neste orçamento.');
  }
  const payload = buildShipmentPayload({ quote: saved.quote, sender: input.sender, invoiceKey: key }, 'production');
  await verifyInvoice(saved.quote);
  const rate = await quoteMelhorEnvioShipment({ quote: saved.quote, sender: input.sender }, token, 'production');
  if (input.quotedEnvironment !== 'production' || !Number.isFinite(Number(input.expectedPrice))
    || Math.round(Number(input.expectedPrice) * 100) !== Math.round(rate.option.price * 100)
    || Number(input.expectedServiceId) !== payload.service || Number(rate.option.melhorEnvioServiceId) !== payload.service) {
    throw new ProductionShipmentError('Cote novamente em produção e confira o valor atualizado antes de adicionar ao carrinho.', 409);
  }
  const reserved: ProductionShipment = {
    environment: 'production', status: 'creating', requestedAt: new Date().toISOString(),
    id: null, protocol: null, price: rate.option.price,
  };
  const reservation = await store.save(saved, reserved);
  let shipment: ProductionShipment = reserved;
  try {
    const result = object(await requestShipmentApi(token, '/me/cart', 'POST', payload, 'production'));
    if (!text(result.id)) throw new ProductionShipmentError('O Melhor Envio respondeu sem ID. Confira o carrinho real antes de qualquer nova tentativa.', 502);
    shipment = { ...reserved, status: 'created', id: text(result.id), protocol: text(result.protocol) || null };
    await store.save(reservation, shipment);
    return { success: true, environment: 'production', shipment, reused: false };
  } catch (cause) {
    if (shipment.id) {
      throw new ProductionShipmentError('O envio real foi criado, mas houve falha ao salvar o vínculo na nuvem. Guarde o ID mostrado e confira o painel oficial; não crie outro envio.', 502, shipment);
    }
    const rejected = cause instanceof SandboxShipmentError && [400, 401, 403, 404, 422].includes(cause.status);
    const unknown: ProductionShipment = { ...reserved, status: rejected ? 'rejected' : 'unknown', ...(rejected ? { error: cause.message } : {}) };
    try {
      await store.save(reservation, unknown);
    } catch (saveError) {
      console.error('Falha ao registrar situação incerta do envio real:', saveError);
    }
    console.error('Falha ao incluir envio no carrinho real:', cause);
    if (rejected) throw new ProductionShipmentError(`O Melhor Envio recusou a inclusão: ${cause.message}. Confira a solicitação salva, corrija os dados e cote novamente. Nenhum pagamento foi feito.`, cause.status, unknown);
    throw new ProductionShipmentError('Não foi possível confirmar a criação. A solicitação ficou bloqueada para evitar duplicação. Confira o carrinho real antes de qualquer nova tentativa.', 502, unknown);
  }
}

export function createShipmentQuoteStore(baseUrl: string, apiKey: string, authorization: string): ShipmentQuoteStore {
  if (!baseUrl || !apiKey || !authorization) throw new ProductionShipmentError('Entre na conta e configure o armazenamento Supabase antes de criar envios reais.', 503);
  const headers = { apikey: apiKey, Authorization: authorization, 'Content-Type': 'application/json' };
  const owners = new Map<string, string>();
  return {
    async load(quoteId) {
      const params = new URLSearchParams({ id: `eq.${quoteId}`, select: 'quote,updated_at,owner_id', limit: '1' });
      const response = await fetch(`${baseUrl}/rest/v1/quotes?${params}`, { headers, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new ProductionShipmentError('Não foi possível ler o orçamento salvo. Nenhum envio novo foi solicitado.', 503);
      const rows: unknown = await response.json();
      const row = object(Array.isArray(rows) ? rows[0] : undefined);
      if (!text(row.updated_at) || !object(row.quote).id) throw new ProductionShipmentError('Salve o orçamento na nuvem antes de criar o envio real.', 409);
      owners.set(quoteId, text(row.owner_id));
      const operationParams = new URLSearchParams({ id: `eq.ME-PRODUCTION:${quoteId}`, select: 'quote,updated_at', limit: '1' });
      const operationResponse = await fetch(`${baseUrl}/rest/v1/quotes?${operationParams}`, { headers, signal: AbortSignal.timeout(15000) });
      if (!operationResponse.ok) throw new ProductionShipmentError('Não foi possível conferir solicitações anteriores. Nenhum envio novo foi solicitado.', 503);
      const operations: unknown = await operationResponse.json();
      const operation = object(Array.isArray(operations) ? operations[0] : undefined);
      const quote = { ...object(row.quote), productionShipment: object(operation.quote).productionShipment };
      return { quote, revision: text(operation.updated_at) };
    },
    async save(record, shipment) {
      const quoteId = text(record.quote.id);
      const revision = new Date(Math.max(Date.now(), (Date.parse(record.revision) || 0) + 1)).toISOString();
      // A separate, owner-scoped row survives stale quote upserts and interrupted requests.
      const metadata = { sourceQuoteId: quoteId, productionShipment: shipment };
      const params = new URLSearchParams({ select: 'quote,updated_at' });
      if (record.revision) {
        params.set('id', `eq.ME-PRODUCTION:${quoteId}`);
        params.set('updated_at', `eq.${record.revision}`);
      }
      const response = await fetch(`${baseUrl}/rest/v1/quotes?${params}`, {
        method: record.revision ? 'PATCH' : 'POST', headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(record.revision ? { quote: metadata, updated_at: revision }
          : { id: `ME-PRODUCTION:${quoteId}`, owner_id: owners.get(quoteId), quote: metadata, updated_at: revision }),
        signal: AbortSignal.timeout(15000),
      });
      if (response.status === 409) throw new ProductionShipmentError('Já existe uma solicitação de envio real para este orçamento. Reabra a tela e confira o carrinho.', 409);
      if (!response.ok) throw new ProductionShipmentError('Não foi possível salvar a solicitação de envio. Confira o orçamento na nuvem antes de continuar.', 503);
      const rows: unknown = await response.json();
      const row = object(Array.isArray(rows) ? rows[0] : undefined);
      if (!text(row.updated_at)) throw new ProductionShipmentError('O orçamento foi alterado em outra operação. Reabra o envio real para conferir a solicitação antes de continuar.', 409);
      return { quote: { ...record.quote, productionShipment: shipment }, revision: text(row.updated_at) };
    },
  };
}
