import type { BlingNfe, QuoteData } from './types';

export type NfePreparationStep = 'creating-order' | 'generating-draft' | 'opening-review';

export function nfeWithTransmissionRequest(nfe: BlingNfe, requestedAt?: string): BlingNfe {
  return { ...nfe, transmissionRequestedAt: [2, 4, 5, 6, 7, 9, 11].includes(nfe.situacao ?? 0) ? undefined : requestedAt };
}

export async function synchronizeNfe(
  read: () => Promise<{ success: boolean; error?: string; nfe?: BlingNfe | null }>,
  previous: BlingNfe | undefined,
  persist: (nfe: BlingNfe) => Promise<void>,
): Promise<BlingNfe | null> {
  const data = await read();
  if (!data.success) throw new Error(data.error || 'Não foi possível consultar a NF-e no Bling.');
  if (data.nfe === null) {
    if (previous?.id) throw new Error('O Bling não retornou a nota já vinculada. Confira os vínculos antes de continuar.');
    return null;
  }
  if (!data.nfe?.id || data.nfe.situacao == null) throw new Error('O Bling retornou a nota sem identificação ou situação. O estado salvo foi preservado.');
  if (previous?.id && String(previous.id) !== String(data.nfe.id)) throw new Error('A consulta retornou outra NF-e. O vínculo salvo foi preservado.');
  const next = nfeWithTransmissionRequest({ ...previous, ...data.nfe }, previous?.transmissionRequestedAt);
  await persist(next);
  return next;
}

export async function synchronizeShippingNfe(
  quote: QuoteData,
  read: (link: { orderId: string | number; nfeId?: string | number }) => Promise<{ success: boolean; error?: string; nfe?: BlingNfe | null }>,
  persist: (nfe: BlingNfe) => Promise<void>,
): Promise<BlingNfe | null> {
  const orderId = quote.bling?.orderId;
  if (!orderId) throw new Error('Este orçamento não tem pedido Bling vinculado. Use “Conferir NF-e e ferramentas no Bling” para conferir a venda existente; não crie outra nota.');
  return synchronizeNfe(
    () => read({ orderId, nfeId: quote.bling?.nfe?.id }),
    quote.bling?.nfe,
    persist,
  );
}

export async function prepareNfe(
  quote: QuoteData,
  operations: {
    createOrder: () => Promise<QuoteData | undefined>;
    generateDraft: (saved: QuoteData) => Promise<BlingNfe | undefined>;
    onStep: (step: NfePreparationStep) => void;
    openReview: () => void;
  },
): Promise<void> {
  let saved = quote;
  if (!saved.bling?.orderId) {
    operations.onStep('creating-order');
    const created = await operations.createOrder();
    if (!created) return;
    saved = created;
  }
  if (!saved.bling?.orderId) throw new Error('Pedido sem vínculo salvo. Confira a venda antes de continuar.');
  if (!saved.bling.nfe?.id) {
    operations.onStep('generating-draft');
    const draft = await operations.generateDraft(saved);
    if (!draft?.id) return;
  }
  operations.onStep('opening-review');
  operations.openReview();
}

export async function monitorNfe<T>(
  read: () => Promise<T>,
  situation: (value: T) => number | null | undefined,
  onRead: (value: T) => Promise<void>,
  wait: () => Promise<void>,
  signal: AbortSignal,
  attempts = 6,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    signal.throwIfAborted();
    await wait();
    signal.throwIfAborted();
    const value = await read();
    signal.throwIfAborted();
    await onRead(value);
    const status = situation(value);
    if (status === 5) return true;
    if (status != null && ![1, 3, 8, 10].includes(status)) return false;
  }
  return false;
}

export function nfeSituationLabel(situation: number | null | undefined): string {
  return ({ 1: 'Pendente de envio', 2: 'Cancelada', 3: 'Aguardando recibo', 4: 'Rejeitada', 5: 'Autorizada', 6: 'Emitida DANFE', 7: 'Registrada', 8: 'Aguardando protocolo', 9: 'Denegada', 10: 'Consultando situação', 11: 'Bloqueada' } as Record<number, string>)[situation ?? 0] || `Situação não reconhecida (${situation ?? 'não informada'})`;
}
