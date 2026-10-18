import { ArrowRight, FileText, Package } from 'lucide-react';
import type { QuoteData } from '../types';
import { quoteStatusLabels } from '../quoteWorkspaceTools';

interface Props {
  quote: QuoteData;
  onPreview: () => void;
  onOpenBling: () => void;
}

export function QuoteSummaryBar({ quote, onPreview, onOpenBling }: Props) {
  const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const units = quote.items.reduce((sum, item) => sum + item.quantity, 0);
  const authorized = Number(quote.bling?.nfe?.situacao) === 5;
  return (
    <section aria-label="Resumo do orçamento" className="fm-summary sticky z-20 border-b border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-mono">{quote.id}</span>
            <span className={quote.status === 'approved' ? 'text-emerald-700 dark:text-emerald-400' : ''}>{quoteStatusLabels[quote.status]}</span>
          </div>
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{quote.client.name || 'Novo orçamento'}</p>
        </div>
        <div className="hidden text-xs text-slate-500 dark:text-slate-400 lg:block">
          <span className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />{units} {units === 1 ? 'peça' : 'peças'}</span>
          <span>{quote.shipping.selectedOption ? `Frete: ${money(quote.financials.shippingAmount)}` : 'Frete não selecionado'}</span>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Total do orçamento</p>
          <p className="whitespace-nowrap text-lg font-bold tabular-nums text-slate-900 dark:text-white">{money(quote.financials.totalAmount)}</p>
        </div>
        <button type="button" onClick={onPreview} disabled={!quote.items.length} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-amber-500 px-3 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50">
          <FileText className="h-4 w-4" /><span className="hidden sm:inline">Ver proposta</span><span className="sm:hidden">Proposta</span>
        </button>
        {quote.status === 'approved' && (
          <button type="button" onClick={onOpenBling} className="hidden min-h-10 cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-amber-600 dark:text-slate-300 sm:flex">
            {authorized ? 'Consultar NF-e' : 'Conferir e faturar'}<ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </section>
  );
}
