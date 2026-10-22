import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ClientInfo, ShippingInfo, ShippingOption } from '../types';
import { ProposalDeliveryAddress } from './ProposalDeliveryAddress';

const client: ClientInfo = {
  name: 'Cliente Teste', address: 'Rua Fiscal', number: '217', complement: 'Galpão B',
  neighborhood: 'Industrial', city: 'Salto', state: 'SP', cep: '13329-350',
};
const shipping = (service?: ShippingOption['service']): ShippingInfo => ({
  originCep: '13329-350', destinationCep: '13329-350', options: [],
  selectedOption: service ? { service, name: service, carrier: 'Teste', price: 0, deliveryDays: 0 } : undefined,
});
const render = (freight: ShippingInfo, customer = client) =>
  renderToStaticMarkup(<ProposalDeliveryAddress client={customer} shipping={freight} />);

test('todas as modalidades de envio e modalidade não selecionada exibem endereço completo', () => {
  for (const service of ['SEDEX', 'PAC', 'JADLOG_PACKAGE', 'PROPRIO', 'MOTOBOY', 'CONTA_FRESA', undefined] as const) {
    const html = render(shipping(service));
    for (const text of ['Rua Fiscal', '217', 'Galpão B', 'Industrial', 'Salto', 'SP', '13329-350']) assert.ok(html.includes(text), `${service}: ${text}`);
    assert.doesNotMatch(html, /Endereço incompleto/);
  }
});

test('endereço separado inclui destinatário e complemento sem misturar o cadastro fiscal', () => {
  const freight = shipping('MOTOBOY');
  freight.destinationCep = '80010-000';
  freight.deliveryAddress = { enabled: true, recipient: 'Recebedor', address: 'Rua Entrega', number: '99', complement: 'Sala 2', neighborhood: 'Centro', city: 'Curitiba', state: 'PR' };
  const html = render(freight);
  for (const text of ['Recebedor', 'Rua Entrega', '99', 'Sala 2', 'Centro', 'Curitiba', 'PR', '80010-000']) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /Rua Fiscal|Galpão B|Salto|13329-350/);
  freight.deliveryAddress.number = '';
  assert.match(render(freight), /Endereço incompleto: confirme número/);
  assert.doesNotMatch(render(freight), /217/);
});

test('retirada identifica estoque sem sugerir envio ao cliente ou inventar endereço do estoque', () => {
  const html = render(shipping('RETIRADA'));
  assert.match(html, /Retirada no estoque Fresa Master/);
  assert.match(html, /Combine o local e o horário/);
  assert.doesNotMatch(html, /Rua Fiscal|Endereço incompleto|CEP/);
});

test('cadastro incompleto e CEP divergente são avisados sem inventar número', () => {
  const html = render(shipping('PAC'), { name: 'Cliente', cep: '13329-350' });
  assert.match(html, /Endereço incompleto: confirme logradouro, número, bairro, cidade, UF/);
  assert.doesNotMatch(html, /S\/N/);
  const freight = shipping('SEDEX');
  freight.destinationCep = '80010-000';
  assert.match(render(freight), /CEP do frete difere/);
  assert.match(render(freight), /13329-350/);
  freight.deliveryAddress = { enabled: false, address: 'Endereço desativado' };
  assert.doesNotMatch(render(freight), /Endereço desativado/);
});
