import type { ClientInfo } from './types';

export function preserveQuoteClient(text: string, current: ClientInfo, extracted?: ClientInfo): ClientInfo {
  const command = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const mentionsClient = /\b(cliente|razao social|nome fantasia|cnpj|cpf|inscricao estadual|telefone|email|e-mail|cadastro)\b/.test(command);
  if (!mentionsClient || !extracted) return { ...current };

  const meaningful = Object.fromEntries(Object.entries(extracted).filter(([, value]) =>
    value !== undefined && value !== null && (typeof value !== 'string' || value.trim() !== ''),
  ));
  const normalize = (value?: string) => (value || '').trim().toLowerCase();
  const changedIdentity = (extracted.document && current.document &&
    extracted.document.replace(/\D/g, '') !== current.document.replace(/\D/g, '')) ||
    (extracted.name?.trim() && current.name?.trim() && normalize(extracted.name) !== normalize(current.name));
  if (changedIdentity) return { ...extracted };
  return { ...current, ...meaningful };
}
