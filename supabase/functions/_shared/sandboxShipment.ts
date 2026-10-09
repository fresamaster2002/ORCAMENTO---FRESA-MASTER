type Data = Record<string, unknown>;
const object = (v: unknown): Data => v !== null && typeof v === 'object' ? v as Data : {};
const digits = (v: unknown) => String(v || '').replace(/\D/g, '');
const text = (v: unknown) => String(v || '').trim();
const host = 'https://sandbox.melhorenvio.com.br';

export class SandboxShipmentError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function address(input: Data, label: string) {
  const document = digits(input.document);
  if (![11, 14].includes(document.length)) throw new SandboxShipmentError(`Confira o CPF/CNPJ do ${label}.`);
  for (const field of ['name', 'address', 'number', 'neighborhood', 'city', 'state', 'cep']) {
    if (!text(input[field])) throw new SandboxShipmentError(`Preencha ${field} do ${label}.`);
  }
  if (digits(input.cep).length !== 8 || !/^[A-Z]{2}$/.test(text(input.state).toUpperCase())) throw new SandboxShipmentError(`Confira CEP/UF do ${label}.`);
  return {
    name: text(input.name), email: text(input.email), phone: digits(input.phone),
    ...(document.length === 14 ? { company_document: document } : { document }),
    state_register: text(input.ie), address: text(input.address), number: text(input.number),
    complement: text(input.complement), district: text(input.neighborhood), city: text(input.city),
    state_abbr: text(input.state).toUpperCase(), postal_code: digits(input.cep), country_id: 'BR',
  };
}

export function buildSandboxShipment(input: Data) {
  const quote = object(input.quote);
  if (quote.status !== 'approved') throw new SandboxShipmentError('Aprove o orçamento antes de criar o envio de teste.');
  if (object(quote.sandboxShipment).id) throw new SandboxShipmentError('Este orçamento já possui envio de teste. Confira o carrinho Sandbox antes de repetir.', 409);
  const shipping = object(quote.shipping);
  const option = object(shipping.selectedOption);
  if (option.isRealTimeMelhorEnvio !== true || !['SEDEX', 'PAC', 'JADLOG_PACKAGE'].includes(text(option.service)) || ![1, 2, 3, 4, 17].includes(Number(option.melhorEnvioServiceId))) throw new SandboxShipmentError('Selecione um serviço oficial cotado do Melhor Envio antes de criar o envio.');
  const key = digits(input.invoiceKey);
  if (key.length !== 44 || key.slice(20, 22) !== '55' || Number(key.slice(22, 25)) !== 2) throw new SandboxShipmentError('Informe a chave de 44 dígitos de uma NF-e modelo 55, série 2.');
  let sum = 0;
  let weight = 2;
  for (let i = 42; i >= 0; i--) { sum += Number(key[i]) * weight; weight = weight === 9 ? 2 : weight + 1; }
  const remainder = sum % 11;
  if (Number(key[43]) !== (remainder < 2 ? 0 : 11 - remainder)) throw new SandboxShipmentError('A chave da NF-e possui dígito verificador inválido.');
  const sender = object(input.sender);
  if (!text(sender.ie)) throw new SandboxShipmentError('Informe a IE ou a isenção confirmada do remetente.');
  if (digits(sender.document) !== key.slice(6, 20)) throw new SandboxShipmentError('O CNPJ do remetente não corresponde ao emissor da NF-e.');
  const delivery = object(shipping.deliveryAddress);
  const client = object(quote.client);
  const recipient = delivery.enabled ? {
    ...client, ...delivery, name: delivery.recipient || client.name, cep: shipping.destinationCep,
  } : client;
  const from = address(sender, 'remetente');
  const to = address(recipient, 'destinatário');
  if (digits(shipping.originCep) !== from.postal_code) throw new SandboxShipmentError('O CEP do remetente diverge da origem cotada. Recalcule o frete.');
  if (digits(shipping.destinationCep) !== to.postal_code) throw new SandboxShipmentError('O CEP de entrega diverge do destino cotado. Recalcule o frete.');
  const items = Array.isArray(quote.items) ? quote.items.map(object) : [];
  if (!items.length) throw new SandboxShipmentError('Inclua os produtos do envio.');
  const products = items.map((item) => {
    if (!text(item.description) || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) <= 0) throw new SandboxShipmentError('Confira descrição, quantidade e valor dos produtos.');
    return { name: text(item.description), quantity: Number(item.quantity), unitary_value: Number(item.unitPrice) };
  });
  const dimensions = object(shipping.packageDimensions);
  const volume = { height: Number(dimensions.height), width: Number(dimensions.width), length: Number(dimensions.length), weight: Number(shipping.weightKg) };
  if (Object.values(volume).some((n) => !Number.isFinite(n) || n <= 0)) throw new SandboxShipmentError('Confira peso e dimensões do pacote.');
  const subtotal = products.reduce((sum, p) => sum + p.quantity * p.unitary_value, 0);
  const insuranceValue = shipping.insuranceEnabled ? subtotal : 0;
  return {
    service: Number(option.melhorEnvioServiceId), from, to, products, volumes: [volume],
    options: { insurance_value: insuranceValue, receipt: false, own_hand: false, reverse: false, non_commercial: false,
      invoice: { key }, platform: 'Fresa Master', tags: [{ tag: text(quote.id), url: null }] },
  };
}

async function request(token: string, path: string, method = 'GET', payload?: unknown) {
  const response = await fetch(`${host}/api/v2${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'FresaMaster (fresamaster0@gmail.com)' },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }), signal: AbortSignal.timeout(20000),
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const details = object(data);
    const errors = Object.values(object(details.errors)).flat().map(text).filter(Boolean).join(' ');
    throw new SandboxShipmentError(`${text(details.message) || `Melhor Envio Sandbox retornou HTTP ${response.status}.`} ${errors}`.trim(), response.status);
  }
  return data;
}

export async function createSandboxShipment(input: Data, token: string) {
  const payload = buildSandboxShipment(input);
  if (!token) throw new SandboxShipmentError('Configure MELHOR_ENVIO_SANDBOX_TOKEN no backend ou informe o token Sandbox no campo protegido do app. O token de produção não é usado.', 401);
  const rates = await request(token, '/me/shipment/calculate', 'POST', {
    from: { postal_code: payload.from.postal_code }, to: { postal_code: payload.to.postal_code },
    package: payload.volumes[0], options: { insurance_value: payload.options.insurance_value, receipt: false, own_hand: false },
    services: String(payload.service),
  });
  const rate = Array.isArray(rates) ? rates.map(object).find((r) => Number(r.id) === payload.service && !r.error) : undefined;
  if (!rate) throw new SandboxShipmentError('O serviço selecionado não está disponível para essa rota no Sandbox. Confira serviço, endereço e pacote.', 422);
  const result = object(await request(token, '/me/cart', 'POST', payload));
  if (!text(result.id)) throw new SandboxShipmentError('O Sandbox respondeu sem o ID do envio. Confira o carrinho antes de repetir.', 502);
  return { success: true, shipmentId: text(result.id), protocol: text(result.protocol) || null, environment: 'sandbox', message: 'Envio adicionado ao carrinho Sandbox. Nenhuma etiqueta foi comprada ou paga.' };
}
