import { blingOrderDifferences } from '../blingOrderSnapshot';
import type { QuoteData } from '../types';

const labels: Record<string, string> = {
  client: 'Cadastro fiscal', name: 'Nome', document: 'CPF/CNPJ', ie: 'IE',
  email: 'E-mail', phone: 'Telefone', address: 'Endereço', number: 'Número',
  complement: 'Complemento', neighborhood: 'Bairro', city: 'Cidade', state: 'UF', cep: 'CEP',
  tradeName: 'Nome fantasia', company: 'Empresa', fiscalCondition: 'Condição fiscal',
  operationNature: 'Natureza da operação', date: 'Data',
  items: 'Produtos', description: 'Descrição', sku: 'SKU', ncm: 'NCM',
  quantity: 'Quantidade', unit: 'Unidade', unitPrice: 'Preço unitário',
  shipping: 'Entrega / frete', originCep: 'CEP de origem', destinationCep: 'CEP de entrega',
  deliveryAddress: 'Endereço de entrega separado', enabled: 'Ativado', recipient: 'Destinatário',
  selectedOption: 'Modalidade selecionada', service: 'Serviço', carrier: 'Transportadora',
  price: 'Preço', deliveryDays: 'Prazo', weightKg: 'Peso', weightDescription: 'Descrição do peso',
  packageDimensions: 'Medidas', height: 'Altura', width: 'Largura', length: 'Comprimento',
  insuranceEnabled: 'Seguro', declaredValue: 'Valor declarado', insuranceAmount: 'Seguro',
  financials: 'Valores / pagamento', subtotal: 'Subtotal', shippingAmount: 'Frete',
  discountPercentage: 'Desconto (%)', discountAmount: 'Desconto', totalAmount: 'Total',
  taxPercentage: 'Imposto (%)', taxAmount: 'Imposto', paymentMethod: 'Forma de pagamento',
  paymentTerms: 'Condições de pagamento', invalidSnapshot: 'Referência da venda salva inválida',
};

export function BlingOrderDifferences({ quote }: { quote: QuoteData }) {
  const differences = blingOrderDifferences(quote);
  if (!differences.length) return null;
  return <div className="text-sm space-y-2">
    <p className="font-semibold">Campos diferentes desde a criação do pedido:</p>
    <ul className="list-disc pl-5">
      {differences.map((path) => <li key={path}>{path.split('.').map((part) => /^\d+$/.test(part) ? `Item ${Number(part) + 1}` : labels[part] || part).join(' → ')}</li>)}
    </ul>
    <p>Entrega diferente do endereço do CNPJ é permitida. O bloqueio compara o orçamento com a venda salva, não os dois endereços entre si.</p>
    <p>Confira estes campos no pedido e no rascunho já existentes no Bling. Não exclua o vínculo nem crie outra venda para contornar o bloqueio.</p>
    {quote.bling?.orderId && <a className="underline" href={quote.bling.orderUrl || `https://www.bling.com.br/b/vendas.php#edit/${quote.bling.orderId}`} target="_blank" rel="noopener noreferrer">Abrir pedido vinculado no Bling</a>}
  </div>;
}
