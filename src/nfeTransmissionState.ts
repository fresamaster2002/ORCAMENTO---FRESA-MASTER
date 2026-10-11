interface TransmissionState {
  situation: number | null | undefined;
  busy: boolean;
  dirty: boolean;
  ready: boolean;
  confirmed: boolean;
  orderChanged: boolean;
  error: string | null;
}

export function nfeTransmissionBlock(state: TransmissionState): string | null {
  if (state.situation === 5) return 'Esta NF-e já está autorizada. Não transmita novamente.';
  if (state.busy) return 'Aguarde a operação em andamento.';
  if (state.error) return 'Recarregue a nota para conferir o estado atual após o erro.';
  if (state.situation == null) return 'Recarregue a nota para consultar sua situação.';
  if (state.orderChanged) return 'O orçamento difere da venda vinculada. Confira os itens e valores antes de transmitir.';
  if (state.dirty) return 'Salve as correções antes de confirmar a transmissão.';
  if (!state.ready) return 'Transmissão bloqueada: confira as pendências fiscais indicadas acima.';
  if (!state.confirmed) return 'Marque a confirmação dos dados fiscais abaixo para liberar a transmissão.';
  return null;
}
