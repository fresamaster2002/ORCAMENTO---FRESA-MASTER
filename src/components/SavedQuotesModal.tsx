import React, { useState } from 'react';
import { FolderOpen, Trash2, X } from 'lucide-react';
import type { QuoteData } from '../types';

interface SavedQuotesModalProps {
  isOpen: boolean;
  quotes: QuoteData[];
  currentId: string;
  onClose: () => void;
  onOpen: (quote: QuoteData) => void;
  onDelete: (quote: QuoteData) => Promise<void> | void;
}

const formatBrl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const SavedQuotesModal: React.FC<SavedQuotesModalProps> = ({ isOpen, quotes, currentId, onClose, onOpen, onDelete }) => {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!isOpen) return null;

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
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <h3 className="text-sm font-black text-slate-900 dark:text-white">Orçamentos ({quotes.length})</h3>
          <button type="button" onClick={onClose} aria-label="Fechar" className="cursor-pointer rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {quotes.length === 0 && (
            <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">Nenhum orçamento salvo ainda.</p>
          )}
          {quotes.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${item.id === currentId ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-700'}`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-slate-900 dark:text-slate-100">
                  {item.id} • {item.client.name || 'Cliente novo'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {new Date(item.createdAt).toLocaleDateString('pt-BR')} • {item.items.length} {item.items.length === 1 ? 'item' : 'itens'} • {formatBrl(item.financials.totalAmount || 0)}
                </div>
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
