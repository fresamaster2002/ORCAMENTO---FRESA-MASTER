import type { QuoteData } from './types';

export interface WorkspaceView {
  modal: 'home' | 'bling' | 'sandbox' | 'proposal' | 'saved' | 'api';
  quickText: string;
  scrollY: number;
  blingTab: 'direct' | 'app_register' | 'cadastral' | 'products' | 'xml' | 'json' | 'manual';
  clientEditing: boolean;
  cadastralDraft: { quoteId: string; text: string } | null;
  invoiceDraft: { quoteId: string; key: string } | null;
}

export interface PendingQuote {
  quote: QuoteData;
  updatedAt: string;
}

export interface WorkspaceSession {
  version: 1;
  quote: QuoteData;
  pending: Record<string, PendingQuote>;
  view: WorkspaceView;
}

export const defaultWorkspaceView: WorkspaceView = {
  modal: 'home', quickText: '', scrollY: 0, blingTab: 'direct',
  clientEditing: false, cadastralDraft: null, invoiceDraft: null,
};

export const workspaceKey = (ownerId: string) => `fresa_master_workspace_v1_${ownerId}`;

export function workspaceErrorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string') return cause.message;
  return String(cause);
}

export function readWorkspace(
  storage: Pick<Storage, 'getItem'>,
  ownerId: string,
  normalize: (value: unknown) => QuoteData | null,
): WorkspaceSession | null {
  const raw = storage.getItem(workspaceKey(ownerId));
  if (!raw) return null;
  const value = JSON.parse(raw) as Partial<WorkspaceSession>;
  const quote = normalize(value.quote);
  if (value.version !== 1 || !quote) throw new Error('O rascunho local tem formato inválido.');
  const pending: Record<string, PendingQuote> = {};
  for (const [id, entry] of Object.entries(value.pending || {})) {
    const saved = normalize(entry.quote);
    if (!saved || saved.id !== id || !Number.isFinite(Date.parse(entry.updatedAt))) {
      throw new Error('Há um orçamento pendente inválido no armazenamento local.');
    }
    pending[id] = { quote: saved, updatedAt: entry.updatedAt };
  }
  const view = value.view;
  return {
    version: 1, quote, pending,
    view: {
      modal: view && ['home', 'bling', 'sandbox', 'proposal', 'saved', 'api'].includes(view.modal) ? view.modal : 'home',
      quickText: typeof view?.quickText === 'string' ? view.quickText : '',
      scrollY: typeof view?.scrollY === 'number' && Number.isFinite(view.scrollY) ? Math.max(0, view.scrollY) : 0,
      blingTab: view && ['direct', 'app_register', 'cadastral', 'products', 'xml', 'json', 'manual'].includes(view.blingTab) ? view.blingTab : 'direct',
      clientEditing: view?.clientEditing === true,
      cadastralDraft: typeof view?.cadastralDraft?.quoteId === 'string' && typeof view.cadastralDraft.text === 'string'
        ? view.cadastralDraft : null,
      invoiceDraft: typeof view?.invoiceDraft?.quoteId === 'string' && typeof view.invoiceDraft.key === 'string'
        ? { quoteId: view.invoiceDraft.quoteId, key: view.invoiceDraft.key.replace(/\D/g, '').slice(0, 44) } : null,
    },
  };
}

export function mergeWorkspaceQuotes(cloud: QuoteData[], local: WorkspaceSession | null): QuoteData[] {
  const merged = new Map(cloud.map((quote) => [quote.id, quote]));
  for (const entry of Object.values(local?.pending || {})) merged.set(entry.quote.id, entry.quote);
  return [...merged.values()];
}

export function resumeWorkspaceQuote(cloud: QuoteData[], local: WorkspaceSession | null): QuoteData | null {
  if (!local) return cloud[0] || null;
  return local.pending[local.quote.id]?.quote
    || cloud.find((quote) => quote.id === local.quote.id)
    || local.quote;
}
