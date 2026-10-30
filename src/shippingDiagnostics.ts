import type { QuoteData } from './types';
import { nfeSituationLabel } from './nfeWorkflow';

export interface ShippingDiagnostic {
  title: string;
  explanation: string;
  steps: string[];
  action: 'delivery' | 'sender' | 'invoice' | 'connection' | null;
  actionLabel?: string;
}

export function shippingErrorDiagnostic(error: string, quote: QuoteData): ShippingDiagnostic {
  if (/cep_destino|to\.postal_code|CEP de entrega recusado/i.test(error)) {
    return {
      title: `Envio bloqueado: CEP de entrega ${quote.shipping.destinationCep || 'não informado'} recusado`,
      explanation: 'O Melhor Envio não aceitou o CEP do cliente. Esse erro é do endereço de entrega; não significa que a NF-e foi rejeitada.',
      steps: ['Confirme com o cliente o CEP correto do local onde ele vai receber.', 'Clique em “Corrigir entrega / CEP”, informe o CEP e aguarde a consulta do endereço.', 'Confira rua, número e bairro, salve a entrega e clique em “Cotar no Melhor Envio”.'],
      action: 'delivery', actionLabel: 'Corrigir CEP de entrega agora',
    };
  }
  if (/cep_origem|from\.postal_code|CEP de origem recusado|CEP do remetente.*(diverge|difere)/i.test(error)) {
    return {
      title: 'Envio bloqueado: confira o CEP de origem',
      explanation: `A origem do orçamento é ${quote.shipping.originCep || 'não informada'}. Ela precisa corresponder ao endereço real de despacho do remetente.`,
      steps: ['Confira os campos do remetente abaixo.', 'Para despachar da Fresa Master, use “Usar origem Fresa Master 13329-350”. Para outro local, confirme o endereço e use “Usar CEP do remetente como origem”.', 'Clique em “Cotar no Melhor Envio” novamente. O destino do cliente não deve ser alterado.'],
      action: 'sender', actionLabel: 'Conferir remetente e origem',
    };
  }
  if (/NF-e|nota.*Bling|pedido Bling vinculado/i.test(error)) {
    return {
      title: 'Envio bloqueado: não foi possível confirmar a NF-e',
      explanation: 'O app precisa consultar a nota vinculada à venda e salvar sua autorização, série 2 e chave. Uma nota emitida diretamente no Bling pode precisar dessa atualização.',
      steps: ['Clique em “Atualizar NF-e do Bling (sem emitir)”. Essa ação não cria nem transmite outra nota.', 'Se o erro continuar, abra “Conferir NF-e e ferramentas no Bling” e confira o pedido, a situação e a série da nota existente.', 'Não emita outra nota só para tentar liberar o envio.'],
      action: 'invoice', actionLabel: 'Atualizar NF-e do Bling (sem emitir)',
    };
  }
  if (/token|OAuth|autoriza.*Melhor Envio|conta.*(desconectada|não conectada)|unauthorized|unauthenticated/i.test(error)) {
    return {
      title: 'Envio bloqueado: confira a conexão com o Melhor Envio',
      explanation: 'A comunicação ou a autorização da conta real não foi confirmada. Corrigir o CEP ou emitir outra NF-e não resolve esse problema.',
      steps: ['Use “Testar conexão Melhor Envio”.', 'Se a conta estiver desconectada ou sem permissão, use “Conectar Melhor Envio (OAuth)” e autorize no site oficial.', 'Volte ao app, teste a conexão e faça uma nova cotação.'],
      action: 'connection', actionLabel: 'Testar conexão Melhor Envio',
    };
  }
  return {
    title: 'Não foi possível concluir esta operação',
    explanation: 'O motivo retornado está nos detalhes abaixo. Não repita a inclusão no carrinho sem conferir se já existe uma solicitação.',
    steps: ['Confira os detalhes do erro.', 'Se você tentou adicionar ao carrinho, consulte o registro salvo e o painel oficial antes de tentar novamente.'],
    action: null,
  };
}

export function shippingInvoiceDiagnostic(quote: QuoteData): ShippingDiagnostic | null {
  const nfe = quote.bling?.nfe;
  if (Number(nfe?.situacao) === 5 && Number(nfe?.serie) === 2 && nfe?.chaveAcesso?.replace(/\D/g, '').length === 44) return null;
  const problems: string[] = [];
  if (!nfe?.id) problems.push('Nenhuma NF-e está salva neste orçamento.');
  else {
    if (Number(nfe.situacao) !== 5) problems.push(`Situação salva: ${nfeSituationLabel(nfe.situacao)} (ainda não confirmada como autorizada pelo app).`);
    if (Number(nfe.serie) !== 2) problems.push(`Série salva: ${nfe.serie ?? 'não informada'}; este fluxo exige série 2.`);
    if (nfe.chaveAcesso?.replace(/\D/g, '').length !== 44) problems.push('A chave de acesso de 44 dígitos está ausente ou incompleta.');
  }
  return {
    title: 'NF-e pendente de conferência — envio bloqueado',
    explanation: problems.join(' '),
    steps: ['Se você já emitiu a nota no Bling, clique em “Atualizar NF-e do Bling (sem emitir)” para buscar e salvar os dados.', 'Se continuar pendente, confira a nota existente no Bling. Não crie outra nota nem mude a numeração para tentar liberar o envio.'],
    action: 'invoice', actionLabel: 'Atualizar NF-e do Bling (sem emitir)',
  };
}
