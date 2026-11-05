import React, { useMemo, useState } from 'react';
import { ClipboardList, Search } from 'lucide-react';
import type { QuoteData } from '../types';
import { followUpIssues, followUpWhatsapp } from '../commercialTracking';
import { filterQuotes } from '../quoteWorkspaceTools';
import { formatMoney } from '../salesInsights';

export function PendingSales({ quotes, onOpen }: { quotes: QuoteData[]; onOpen: (quote: QuoteData) => void }) {
  const [query, setQuery] = useState('');
  const pending = useMemo(() => quotes.map((quote) => ({ quote, issues: followUpIssues(quote) })).filter((entry) => entry.issues.length), [quotes]);
  const visibleIds = new Set(filterQuotes(pending.map((entry) => entry.quote), query, 'all').map((quote) => quote.id));
  return <section aria-labelledby="pending-title" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
    <h2 id="pending-title" className="flex items-center gap-2 text-lg font-bold"><ClipboardList className="h-5 w-5 text-amber-500" />Central de pendências</h2>
    <p className="text-xs text-slate-500 dark:text-slate-400">Todos os períodos · {pending.length} orçamentos precisam de atenção. Pagamentos são manuais; NF-e e envio refletem o último estado salvo. Nada é cobrado ou transmitido automaticamente.</p>
    <label className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 dark:border-slate-600"><Search className="h-4 w-4 text-slate-400" /><span className="sr-only">Buscar pendências</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cliente, documento ou orçamento..." className="min-w-0 flex-1 bg-transparent py-3 text-sm" /></label>
    <div className="max-h-[32rem] space-y-3 overflow-y-auto">
      {pending.filter((entry) => visibleIds.has(entry.quote.id)).map(({ quote, issues }) => {
        const whatsapp = followUpWhatsapp(quote);
        return <article key={quote.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          <h3 className="break-words font-bold">{quote.id} · {quote.client.name || 'Cliente sem nome'}</h3>
          <p className="mt-1 text-sm text-indigo-600 dark:text-indigo-300">{formatMoney(quote.financials.totalAmount)}</p>
          <ul className="my-3 flex flex-wrap gap-2">{issues.map((issue) => <li key={issue} className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">{issue}</li>)}</ul>
          <div className="flex flex-wrap gap-3"><button type="button" onClick={() => onOpen(quote)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">Abrir e resolver</button>{quote.status === 'sent' && whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">Acompanhar pelo WhatsApp</a>}</div>
        </article>;
      })}
      {!visibleIds.size && <p className="py-5 text-center text-sm text-slate-500">{pending.length ? 'Nenhuma pendência corresponde à busca.' : 'Nenhuma pendência identificada nos dados salvos.'}</p>}
    </div>
  </section>;
}
