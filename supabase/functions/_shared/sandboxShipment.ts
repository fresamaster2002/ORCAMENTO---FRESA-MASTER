type Data = Record<string, unknown>;
const object = (v: unknown): Data => v !== null && typeof v === 'object' ? v as Data : {};
const digits = (v: unknown) => String(v || '').replace(/\D/g, '');
const text = (v: unknown) => String(v || '').trim();
const host = 'https://sandbox.melhorenvio.com.br';

function errorMessages(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap(errorMessages);
  return Object.values(object(value)).flatMap(errorMessages);
}

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
    const errors = [...new Set(errorMessages([details.message, details.error, details.errors, Array.isArray(data) ? data : undefined]))].join(' ');
    throw new SandboxShipmentError(errors || `Melhor Envio Sandbox retornou HTTP ${response.status}.`, response.status);
  }
  return data;
}

function shipmentRecord(value: unknown, shipmentId: string): Data {
  const response = object(value);
  const record = Object.keys(object(response.data)).length ? object(response.data) : response;
  if (text(record.id) !== shipmentId) throw new SandboxShipmentError('O Melhor Envio não retornou o envio solicitado. Não tente pagar novamente antes de conferir o carrinho.', 502);
  return record;
}

function paymentStatus(record: Data): 'pending' | 'paid' | 'unavailable' {
  const status = text(record.status).toLowerCase();
  if (record.paid_at || ['paid', 'released'].includes(status)) return 'paid';
  if (status === 'pending') return 'pending';
  return 'unavailable';
}

export async function getSandboxShipmentStatus(input: Data, token: string) {
  if (!token) throw new SandboxShipmentError('Configure ou informe o token da conta Sandbox.', 401);
  const shipmentId = text(input.shipmentId);
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(shipmentId)) throw new SandboxShipmentError('ID do envio Sandbox inválido.');
  const record = shipmentRecord(await request(token, `/me/cart/${encodeURIComponent(shipmentId)}`), shipmentId);
  return {
    success: true, environment: 'sandbox', shipmentId,
    status: paymentStatus(record), rawStatus: text(record.status),
    paidAt: text(record.paid_at) || null, price: Number(record.price ?? record.quote) || null,
  };
}

export async function checkoutSandboxShipment(input: Data, token: string) {
  if (!token) throw new SandboxShipmentError('Configure ou informe o token da conta Sandbox.', 401);
  if (input.confirmSandbox !== true) throw new SandboxShipmentError('Confirme que deseja usar o saldo fictício do Sandbox.', 400);
  const shipmentId = text(input.shipmentId);
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(shipmentId)) throw new SandboxShipmentError('ID do envio Sandbox inválido.');
  const existing = shipmentRecord(await request(token, `/me/cart/${encodeURIComponent(shipmentId)}`), shipmentId);
  const currentStatus = paymentStatus(existing);
  if (currentStatus === 'paid') {
    return { success: true, environment: 'sandbox', shipmentId, status: 'paid', paidAt: text(existing.paid_at) || null, message: 'Este envio já consta como pago no Sandbox.' };
  }
  if (currentStatus !== 'pending') throw new SandboxShipmentError('O envio não está pendente no Sandbox. Atualize a situação e confira o carrinho antes de continuar.', 409);
  await request(token, '/me/shipment/checkout', 'POST', { orders: [shipmentId] });
  const result = await getSandboxShipmentStatus({ shipmentId }, token);
  return {
    ...result, message: result.status === 'paid'
      ? 'Pagamento confirmado com saldo fictício do Sandbox. Nenhuma etiqueta foi gerada.'
      : 'Checkout enviado ao Sandbox; o envio ainda aparece pendente. Atualize a situação antes de repetir o pagamento.',
  };
}

export async function createSandboxShipment(input: Data, token: string) {
  const payload = buildSandboxShipment(input);
  if (!token) throw new SandboxShipmentError('Configure MELHOR_ENVIO_SANDBOX_TOKEN no backend ou informe o token Sandbox no campo protegido do app. O token de produção não é usado.', 401);
  const rates = await request(token, '/me/shipment/calculate', 'POST', {
    from: { postal_code: payload.from.postal_code }, to: { postal_code: payload.to.postal_code },
    package: payload.volumes[0], options: { insurance_value: payload.options.insurance_value, receipt: false, own_hand: false },
    services: String(payload.service),
  });
  const rate = (Array.isArray(rates) ? rates : [rates]).map(object).find((r) => Number(r.id) === payload.service);
  if (!rate || rate.error) throw new SandboxShipmentError(`O serviço selecionado não está disponível para essa rota no Sandbox. ${text(rate?.error) || 'Confira serviço, endereço e pacote.'}`, 422);
  const result = object(await request(token, '/me/cart', 'POST', payload));
  if (!text(result.id)) throw new SandboxShipmentError('O Sandbox respondeu sem o ID do envio. Confira o carrinho antes de repetir.', 502);
  return { success: true, shipmentId: text(result.id), protocol: text(result.protocol) || null, environment: 'sandbox', message: 'Envio adicionado ao carrinho Sandbox. Nenhuma etiqueta foi comprada ou paga.' };
}

export async function quoteSandboxShipment(input: Data, token: string) {
  if (!token) throw new SandboxShipmentError('Informe o token Sandbox ou configure MELHOR_ENVIO_SANDBOX_TOKEN no backend.', 401);
  const quote = object(input.quote);
  const shipping = object(quote.shipping);
  const originCep = digits(object(input.sender).cep);
  const destinationCep = digits(shipping.destinationCep);
  if (originCep.length !== 8 || destinationCep.length !== 8) throw new SandboxShipmentError('Confira os CEPs do remetente e da entrega antes de cotar.');
  const dimensions = object(shipping.packageDimensions);
  const volume = { height: Number(dimensions.height), width: Number(dimensions.width), length: Number(dimensions.length), weight: Number(shipping.weightKg) };
  if (Object.values(volume).some((n) => !Number.isFinite(n) || n <= 0)) throw new SandboxShipmentError('Confira peso e dimensões do pacote.');
  const items = Array.isArray(quote.items) ? quote.items.map(object) : [];
  if (items.some((item) => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || !Number.isFinite(Number(item.unitPrice)) || Number(item.unitPrice) <= 0)) throw new SandboxShipmentError('Confira quantidade e valor dos produtos antes de cotar.');
  const declaredValue = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
  if (!items.length || !Number.isFinite(declaredValue) || declaredValue <= 0) throw new SandboxShipmentError('Inclua produtos com quantidade e valor válidos antes de cotar.');
  const rates = await request(token, '/me/shipment/calculate', 'POST', {
    from: { postal_code: originCep }, to: { postal_code: destinationCep }, package: volume,
    options: { insurance_value: shipping.insuranceEnabled ? declaredValue : 0, receipt: false, own_hand: false },
    services: '2',
  });
  const rate = (Array.isArray(rates) ? rates : [rates]).map(object).find((r) => Number(r.id) === 2);
  if (!rate || rate.error) throw new SandboxShipmentError(text(rate?.error) || 'Sedex indisponível para essa rota no Sandbox.', 422);
  const price = Number(rate.custom_price ?? rate.price);
  const deliveryDays = Number(rate.custom_delivery_time ?? rate.delivery_time);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(deliveryDays) || deliveryDays < 0) throw new SandboxShipmentError('A cotação Sandbox retornou preço ou prazo inválido.', 502);
  return {
    success: true, environment: 'sandbox', originCep, destinationCep,
    option: { service: 'SEDEX', melhorEnvioServiceId: 2, name: 'SEDEX (Melhor Envio Sandbox)', carrier: 'Correios',
      price, deliveryDays, selected: true, insuranceIncluded: Boolean(shipping.insuranceEnabled),
      insuranceCost: 0, isRealTimeMelhorEnvio: true },
  };
}
