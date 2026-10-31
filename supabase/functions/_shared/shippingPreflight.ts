import { DEFAULT_ORIGIN_CEP, DEFAULT_PACKAGE_DIMENSIONS } from './shippingDefaults.ts';
import { requestShipmentApi, SandboxShipmentError } from './sandboxShipment.ts';

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function shippingPreflight(input: Record<string, unknown>, token: string) {
  if (!token) throw new SandboxShipmentError('Conecte a conta real do Melhor Envio para verificar este CEP.', 401);
  const destination = String(input.destinationCep || '').replace(/\D/g, '');
  const origin = String(input.originCep || DEFAULT_ORIGIN_CEP).replace(/\D/g, '');
  if (destination.length !== 8 || origin.length !== 8) throw new SandboxShipmentError('Informe CEPs de origem e entrega com 8 dígitos.', 400);
  const dimensions = { ...DEFAULT_PACKAGE_DIMENSIONS, ...object(input.packageDimensions) };
  const volume = { height: Number(dimensions.height), width: Number(dimensions.width), length: Number(dimensions.length), weight: Number(input.weightKg ?? 0.5) };
  if (Object.values(volume).some((value) => !Number.isFinite(value) || value <= 0)) throw new SandboxShipmentError('Confira o peso e as dimensões para verificar o envio.', 400);
  const declaredValue = Number(input.declaredValue ?? 0);
  if (!Number.isFinite(declaredValue) || declaredValue < 0) throw new SandboxShipmentError('Valor declarado inválido para verificar o envio.', 400);
  const response = await requestShipmentApi(token, '/me/shipment/calculate', 'POST', {
    from: { postal_code: origin }, to: { postal_code: destination },
    package: volume, services: '1,2,3,4,17',
    options: { insurance_value: input.insuranceEnabled ? declaredValue : 0, receipt: false, own_hand: false },
  }, 'production');
  if (!Array.isArray(response)) throw new SandboxShipmentError('O Melhor Envio retornou uma verificação sem lista de serviços. Tente novamente.', 502);
  const services = response.flatMap((value) => {
    const rate = object(value);
    const id = Number(rate.id);
    const price = Number(rate.custom_price ?? rate.price);
    const days = Number(rate.custom_delivery_time ?? rate.delivery_time);
    if (![1, 2, 3, 4, 17].includes(id) || rate.error || !Number.isFinite(price) || price <= 0 || !Number.isFinite(days) || days < 0) return [];
    return [{ id, name: String(rate.name || (id === 1 ? 'PAC' : id === 2 ? 'Sedex' : 'Jadlog')), price, deliveryDays: days }];
  });
  return { success: true, environment: 'production', status: services.length ? 'available' : 'unavailable', originCep: origin, destinationCep: destination, services };
}
