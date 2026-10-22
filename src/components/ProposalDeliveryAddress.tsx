import type { QuoteData } from '../types';

export function ProposalDeliveryAddress({ client, shipping }: Pick<QuoteData, 'client' | 'shipping'>) {
  if (shipping.selectedOption?.service === 'RETIRADA') {
    return (
      <div className="text-[13px] text-[#334155]">
        <p className="font-bold text-[#0f172a]">Retirada no estoque Fresa Master — Salto/SP</p>
        <p>Sem envio ao endereço do cliente. Combine o local e o horário da retirada.</p>
      </div>
    );
  }

  const separate = shipping.deliveryAddress?.enabled ? shipping.deliveryAddress : undefined;
  const address = separate || client;
  const cep = separate ? shipping.destinationCep : client.cep || shipping.destinationCep;
  const fields = [
    ['logradouro', address.address], ['número', address.number], ['bairro', address.neighborhood],
    ['cidade', address.city], ['UF', address.state], ['CEP', cep],
  ];
  const missing = fields.filter(([, value]) => !value?.trim()).map(([label]) => label);
  const cepMismatch = !separate && client.cep && shipping.destinationCep
    && client.cep.replace(/\D/g, '') !== shipping.destinationCep.replace(/\D/g, '');

  return (
    <div className="space-y-1 break-words text-[13px] text-[#334155]" aria-label="Endereço de entrega">
      <p className="font-bold text-[#0f172a]">Endereço de entrega{separate ? ' (diferente do cadastro fiscal)' : ''}</p>
      {separate && shipping.deliveryAddress?.recipient && <p>Destinatário: {shipping.deliveryAddress.recipient}</p>}
      <p>{address.address || 'Logradouro a confirmar'}, {address.number || 'número a confirmar'}</p>
      {address.complement && <p>Complemento: {address.complement}</p>}
      <p>Bairro: {address.neighborhood || 'a confirmar'}</p>
      <p>{address.city || 'Cidade a confirmar'} / {address.state || 'UF a confirmar'} — CEP {cep || 'a confirmar'}</p>
      {missing.length > 0 && (
        <p className="font-bold text-[#9a3412]">Endereço incompleto: confirme {missing.join(', ')} antes do envio.</p>
      )}
      {cepMismatch && (
        <p className="font-bold text-[#9a3412]">O CEP do frete difere do cadastro do cliente. Confirme o endereço de entrega e recalcule o frete antes do envio.</p>
      )}
    </div>
  );
}
