import React, { useMemo, useState } from 'react';
import { Copy, MessageCircle, RotateCcw, Search } from 'lucide-react';
import type { QuoteData } from '../types';
import { repurchaseCandidates } from '../salesGrowth';
import { searchCustomers } from '../salesInsights';
import { followUpWhatsapp, localDate } from '../commercialTracking';

export function RepurchasePanel({ quotes, onOpen, onDuplicate }: { quotes: QuoteData[]; onOpen: (quote: QuoteData) => void; onDuplicate: (quote: QuoteData) => void }) {
  const [days, setDays] = useState(30);
  const [query, setQuery] = useState('');
  const today = localDate();
  const { candidates, invalidDates } = useMemo(() => repurchaseCandidates(quotes, today, days), [quotes, today, days]);
  const visibleKeys = new Set(searchCustomers(candidates, query).map((customer) => customer.key));
  const visible = candidates.filter((customer) => visibleKeys.has(customer.key));
  return <section className="fm-panel p-5 sm:p-6" aria-labelledby="repurchase-title">
    <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-3"><span className="fm-icon bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300"><RotateCcw className="h-5 w-5" /></span><div><h2 id="repurchase-title" className="text-lg font-bold">Oportunidades de recompra</h2><p className="text-xs text-slate-500 dark:text-slate-400">Transforme seu histórico em novos pedidos</p></div></div><div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800" aria-label="Tempo sem compra">{[30, 60, 90].map((value) => <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)} className={`rounded-lg px-3 py-2 text-xs font-bold ${days === value ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>{value}+ dias</button>)}</div></div>
    <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Todos os períodos · clientes sem orçamento aprovado há pelo menos {days} dias, pela data do orçamento — não pela emissão da NF-e. Novos rascunhos não contam como compra. Sugestões de contato, sem envio automático.</p>
    {invalidDates > 0 && <p role="alert" className="mt-3 text-sm text-amber-700 dark:text-amber-300">{invalidDates} aprovados sem data válida: os respectivos clientes não são sugeridos até a correção.</p>}
    <label className="fm-input mt-4 flex items-center gap-2"><Search className="h-4 w-4 shrink-0 text-teal-500" /><span className="sr-only">Pesquisar clientes para recompra</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, documento ou contato..." className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none" /></label>
    <p aria-live="polite" className="my-4 text-xs font-semibold text-slate-500 dark:text-slate-400">{visible.length} clientes encontrados</p>
    <div className="grid max-h-[36rem] gap-3 overflow-y-auto lg:grid-cols-2">{visible.map((customer) => {
      const { latest, client } = customer;
      const message = `Olá, ${client.tradeName || client.name || 'tudo bem'}! Aqui é da Fresa Master. Como estão suas ferramentas? Se precisar repor fresas ou pinças, posso preparar um novo orçamento para você.`;
      const whatsapp = followUpWhatsapp({ ...latest, client }, message);
      const nextContact = customer.quotes.find((quote) => quote.commercial?.nextContactDate)?.commercial?.nextContactDate;
      const lastContact = customer.quotes.map((quote) => quote.commercial?.lastContactDate).filter((date): date is string => Boolean(date)).sort().at(-1);
      return <article key={customer.key} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
        <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 break-words font-bold">{client.name || client.company || client.tradeName}</h3><span className="shrink-0 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-300">{customer.days} dias</span></div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Último aprovado: {customer.date.split('-').reverse().join('/')} · {latest.id}</p>
        <p className="mt-3 break-words text-sm text-slate-600 dark:text-slate-300">{latest.items.map((item) => `${item.quantity} × ${item.description}`).join(' · ') || 'Sem itens registrados'}</p>
        {(nextContact || lastContact) && <p className="mt-3 text-xs text-teal-700 dark:text-teal-300">{lastContact && `Último contato registrado: ${lastContact.split('-').reverse().join('/')}. `}{nextContact && `Contato agendado: ${nextContact.split('-').reverse().join('/')}.`}</p>}
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="fm-primary inline-flex items-center gap-2" onClick={() => onDuplicate(latest)}><Copy className="h-3.5 w-3.5" />Preparar novo orçamento</button><button type="button" className="fm-secondary" onClick={() => onOpen(latest)}>Ver última compra</button>{whatsapp ? <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="fm-secondary inline-flex items-center gap-2 !text-emerald-700 dark:!text-emerald-300"><MessageCircle className="h-3.5 w-3.5" />WhatsApp</a> : <span className="self-center text-xs text-slate-500">Cadastre telefone com DDD para WhatsApp.</span>}</div>
      </article>;
    })}</div>
    {!visible.length && <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">Nenhum cliente para este intervalo e pesquisa. Experimente outro filtro.</p>}
  </section>;
}
