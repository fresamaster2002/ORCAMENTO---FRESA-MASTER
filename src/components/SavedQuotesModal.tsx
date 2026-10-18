import React, { useEffect, useRef, useState } from 'react';
import { Copy, FolderOpen, Search, Trash2, X } from 'lucide-react';
import type { QuoteData } from '../types';
import { filterQuotes, quoteStatusLabels } from '../quoteWorkspaceTools';

interface SavedQuotesModalProps {
  isOpen: boolean;
  quotes: QuoteData[];
  currentId: string;
  onClose: () => void;
  onOpen: (quote: QuoteData) => void;
  onDelete: (quote: QuoteData) => Promise<void> | void;
  onDuplicate: (quote: QuoteData) => void;
}

const formatBrl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const SavedQuotesModal: React.FC<SavedQuotesModalProps> = ({ isOpen, quotes, currentId, onClose, onOpen, onDelete, onDuplicate }) => {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<QuoteData['status'] | 'all'>('all');
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busyId);
  closeRef.current = onClose;
  busyRef.current = busyId;

  useEffect(() => {
    if (!isOpen) return;
    setConfirmId(null);
    const previous = document.activeElement;
    searchRef.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current();
      if (event.key !== 'Tab') return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;
  const visibleQuotes = filterQuotes(quotes, query, status);

  const handleDelete = async (quote: QuoteData) => {
    setBusyId(quote.id);
    try {
      await onDelete(quote);
    } finally {
      setBusyId(null);
      setConfirmId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-quotes-title"
        style={{ maxHeight: 'min(85dvh, calc(100dvh - var(--fm-nav-h, 0px) - 1.5rem))' }}
        className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div>
            <h3 id="saved-quotes-title" className="text-base font-bold text-slate-900 dark:text-white">Seus orçamentos</h3>
            <p className="mt-0.5 text-xs text-slate-500">Encontre uma venda ou use uma anterior como ponto de partida.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="cursor-pointer rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
          <label className="flex min-w-0 flex-1 basis-52 items-center gap-2 rounded-lg border border-slate-300 px-3 dark:border-slate-700">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="sr-only">Buscar orçamento</span>
            <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, CNPJ ou nº do orçamento" className="min-h-11 w-full min-w-0 bg-transparent text-sm outline-none" />
          </label>
          <label>
            <span className="sr-only">Situação do orçamento</span>
            <select value={status} onChange={(event) => {
              const value = event.target.value;
              if (value === 'all' || value === 'draft' || value === 'sent' || value === 'approved' || value === 'rejected') setStatus(value);
            }} className="min-h-11 rounded-lg border border-slate-300 bg-transparent px-3 text-sm dark:border-slate-700">
              <option value="all">Todas as situações</option>
              {Object.entries(quoteStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <p aria-live="polite" className="w-full text-xs text-slate-500">{visibleQuotes.length} de {quotes.length} orçamentos</p>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {quotes.length === 0 && (
            <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">Nenhum orçamento salvo ainda.</p>
          )}
          {quotes.length > 0 && visibleQuotes.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">
              <p>Nenhum orçamento corresponde à busca.</p>
              <button type="button" onClick={() => { setQuery(''); setStatus('all'); }} className="mt-3 cursor-pointer font-semibold text-amber-700 dark:text-amber-400">Limpar filtros</button>
            </div>
          )}
          {visibleQuotes.map((item) => (
            <div
              key={item.id}
              className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-3 ${item.id === currentId ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-700'}`}
            >
              <div className="min-w-0 flex-1 basis-48">
                <div className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                  {item.id} • {item.client.name || 'Cliente novo'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {new Date(item.createdAt).toLocaleDateString('pt-BR')} • {item.items.length} {item.items.length === 1 ? 'item' : 'itens'} • {formatBrl(item.financials.totalAmount || 0)}
                </div>
                <span className={`mt-1 inline-block text-[11px] font-semibold ${item.status === 'approved' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  {quoteStatusLabels[item.status]}{item.id === currentId ? ' · Em edição' : ''}
                </span>
              </div>

              {confirmId === item.id ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => handleDelete(item)}
                    className="cursor-pointer rounded-md bg-rose-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-rose-700 disabled:opacity-60"
                  >
                    {busyId === item.id ? 'Removendo...' : 'Confirmar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(null)}
                    className="cursor-pointer rounded-md bg-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpen(item)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-amber-600"
                  >
                    <FolderOpen className="h-3.5 w-3.5" /> Abrir
                  </button>
                  <button type="button" onClick={() => onDuplicate(item)} title="Copia itens e condições, sem pedidos, NF-e, envios ou frete anterior" className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-md border border-slate-300 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    <Copy className="h-3.5 w-3.5" /> Duplicar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(item.id)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-rose-300 px-2.5 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remover
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
