import React, { useMemo, useState } from 'react';
import { BadgeCheck, Copy, FolderOpen, Search, Users, Clock3, FileText, MessageCircle } from 'lucide-react';
import type { QuoteData, SaveCommercialTracking } from '../types';
import { customerHistories, customersWithOpenQuotes, openCustomerQuotes, formatMoney, quoteDate, searchCustomers } from '../salesInsights';
import { quoteStatusLabels } from '../quoteWorkspaceTools';
import { CommercialControls } from './CommercialControls';
import { followUpWhatsapp, paymentSummary } from '../commercialTracking';
import { RepurchasePanel } from './RepurchasePanel';

interface Props {
  quotes: QuoteData[];
  onOpen: (quote: QuoteData) => void;
  onDuplicate: (quote: QuoteData) => void;
  onSaveCommercial?: SaveCommercialTracking;
}

export function CustomersPage({ quotes, onOpen, onDuplicate, onSaveCommercial }: Props) {
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'open'>('all');
  const customers = useMemo(() => customerHistories(quotes), [quotes]);
  const openCustomers = useMemo(() => customersWithOpenQuotes(customers), [customers]);
  const openQuotes = useMemo(() => openCustomers.flatMap(openCustomerQuotes), [openCustomers]);
  const visible = useMemo(() => searchCustomers(filter === 'open' ? openCustomers : customers, query), [customers, openCustomers, query, filter]);
  const selected = visible.find((customer) => customer.key === selectedKey) || visible[0];
  const selectedQuotes = selected ? filter === 'open' ? openCustomerQuotes(selected) : selected.quotes : [];
  const statusStyle = {
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    sent: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    rejected: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  };
  const panel = 'fm-panel';
  return <section aria-labelledby="customers-title" className="space-y-6">
    <div className="fm-hero p-6 text-white sm:p-8">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-200"><Users className="h-5 w-5" />Relacionamento</p>
      <h1 id="customers-title" className="text-2xl font-bold sm:text-3xl">Seus clientes, sempre por perto</h1>
      <p className="mt-2 max-w-2xl text-sm text-indigo-100">Pesquise o histórico e transforme um orçamento anterior em uma nova oportunidade.</p>
      <p className="mt-4 text-sm font-semibold">{customers.length} clientes · {quotes.length} orçamentos no histórico carregado</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Resumo de relacionamento">
      {[
        { label: 'Clientes no histórico', value: customers.length, detail: 'Todos os períodos', icon: Users, color: 'text-indigo-500' },
        { label: 'Clientes com orçamento em aberto', value: openCustomers.length, detail: `${openQuotes.length} rascunhos ou enviados`, icon: Clock3, color: 'text-amber-500' },
        { label: 'Clientes com aprovados', value: customers.filter((customer) => customer.quotes.some((quote) => quote.status === 'approved')).length, detail: 'Pode incluir clientes com novos orçamentos em aberto', icon: BadgeCheck, color: 'text-emerald-500' },
      ].map(({ label, value, detail, icon: Icon, color }) => <article key={label} className={`${panel} p-4 sm:p-5`}><div className="flex items-start justify-between gap-3"><h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</h2><Icon className={`h-5 w-5 shrink-0 ${color}`} /></div><p className="mt-2 text-3xl font-bold tracking-tight">{value}</p><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{detail}</p></article>)}
    </div>
    <div className={`${panel} space-y-4 p-4 sm:p-5`}>
    <div className="flex flex-wrap gap-2" aria-label="Filtrar clientes">
      <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={filter === 'all' ? 'fm-primary' : 'fm-secondary'}>Todos os clientes ({customers.length})</button>
      <button type="button" aria-pressed={filter === 'open'} onClick={() => setFilter('open')} className={filter === 'open' ? 'fm-primary' : 'fm-secondary'}>Com orçamento em aberto ({openCustomers.length})</button>
    </div>
    <label className="fm-input flex items-center gap-3">
      <Search className="h-5 w-5 shrink-0 text-indigo-500" />
      <span className="sr-only">Pesquisar clientes</span>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, CPF/CNPJ, telefone, e-mail ou orçamento..." className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none" />
    </label>
    <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">Em aberto = rascunho ou enviado, ainda sem aprovação. Aprovados e não aprovados não entram nesse filtro; não indica pendência de pagamento, NF-e ou envio.</p>
    </div>
    <p aria-live="polite" className="text-sm text-slate-500 dark:text-slate-400">{visible.length} clientes encontrados. Sem CPF/CNPJ, o agrupamento usa nome e contato; confira o cadastro antes de replicar.</p>
    {!selected ? <div className={`${panel} p-10 text-center text-slate-500 dark:text-slate-400`}><Search className="mx-auto mb-3 h-8 w-8 text-slate-400" />{filter === 'open' ? 'Nenhum cliente com orçamento em aberto corresponde à pesquisa.' : 'Nenhum cliente encontrado. Cadastre o cliente em um orçamento ou ajuste a pesquisa.'}</div> :
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(240px,1fr)_2fr]">
        <div className={`${panel} max-h-[34rem] space-y-1 overflow-y-auto p-2`} aria-label="Clientes encontrados">
          {visible.map((customer) => <button key={customer.key} type="button" aria-pressed={selected.key === customer.key} onClick={() => setSelectedKey(customer.key)}
            className={`w-full rounded-xl border p-4 text-left transition ${selected.key === customer.key ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/50' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            <span className="block break-words font-bold">{customer.client.name || customer.client.company || customer.client.tradeName}</span>
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{customer.client.document || 'Sem CPF/CNPJ'} · {customer.quotes.length} orçamentos</span>
            <span className="mt-2 block text-xs text-indigo-600 dark:text-indigo-300">Último orçamento: {quoteDate(customer.quotes[0])?.split('-').reverse().join('/') || 'Data não informada'}</span>
            {openCustomerQuotes(customer).length > 0 && <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-200"><Clock3 className="h-3 w-3" />{openCustomerQuotes(customer).length} em aberto</span>}
          </button>)}
        </div>
        <div className={`${panel} min-w-0 overflow-hidden`}>
          <div className="border-b border-slate-200 bg-slate-50/60 p-5 dark:border-slate-800 dark:bg-slate-800/40">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-300">Perfil do cliente</p>
            <h2 className="break-words text-xl font-bold">{selected.client.name || selected.client.company || selected.client.tradeName}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{selected.client.tradeName}</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              {[
                ['CPF/CNPJ', selected.client.document], ['Telefone', selected.client.phone],
                ['E-mail', selected.client.email], ['Cidade / UF', [selected.client.city, selected.client.state].filter(Boolean).join(' / ')],
              ].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl border border-slate-200/70 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900"><dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 break-words font-medium">{value || 'Não informado'}</dd></div>)}
            </dl>
          </div>
          <div className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-bold"><FileText className="h-4 w-4 text-indigo-500" />{filter === 'open' ? 'Orçamentos em aberto' : 'Histórico de orçamentos'} <span className="text-xs font-medium text-slate-500">({selectedQuotes.length})</span></h3>{filter === 'open' && <button type="button" className="fm-secondary" onClick={() => { setSelectedKey(selected.key); setFilter('all'); }}>Ver histórico completo</button>}</div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Replicar cria um novo rascunho. Frete, pedido, NF-e e envios antigos não são reaproveitados.</p>
            <div className="mt-4 space-y-3">
              {selectedQuotes.map((quote) => <article key={quote.id} className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex flex-wrap justify-between gap-2">
                  <div><h4 className="font-bold">{quote.id}</h4><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{quoteDate(quote)?.split('-').reverse().join('/') || 'Data não informada'}{quote.bling?.nfe?.situacao === 5 ? ' · NF-e autorizada' : ''}</p><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${statusStyle[quote.status]}`}>{quoteStatusLabels[quote.status]}</span></div>
                  <strong className="text-indigo-600 dark:text-indigo-300">{formatMoney(quote.financials.totalAmount)}</strong>
                </div>
                <p className="my-3 break-words text-sm text-slate-600 dark:text-slate-300">{quote.items.map((item) => `${item.quantity} × ${item.description}`).join(' · ') || 'Sem itens'}</p>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{paymentSummary(quote).status}{quote.commercial?.notes ? ` · Anotação: ${quote.commercial.notes}` : ''}{quote.commercial?.nextContactDate ? ` · Próximo contato: ${quote.commercial.nextContactDate.split('-').reverse().join('/')}` : ''}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onOpen(quote)} className="fm-secondary inline-flex items-center gap-2"><FolderOpen className="h-4 w-4" />Abrir orçamento</button>
                  <button type="button" onClick={() => onDuplicate(quote)} className="fm-primary inline-flex items-center gap-2"><Copy className="h-4 w-4" />Replicar orçamento</button>
                  {quote.status === 'sent' && (followUpWhatsapp(quote) ? <a href={followUpWhatsapp(quote)!} target="_blank" rel="noopener noreferrer" className="fm-secondary inline-flex items-center gap-2 !text-emerald-700 dark:!text-emerald-300"><MessageCircle className="h-4 w-4" />Acompanhar pelo WhatsApp</a> : <span className="self-center text-xs text-slate-500 dark:text-slate-400">Cadastre telefone com DDD para acompanhar pelo WhatsApp.</span>)}
                </div>
                {onSaveCommercial && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold text-indigo-600 dark:text-indigo-300">Pagamentos e anotações de {quote.id}</summary><div className="mt-3"><CommercialControls key={quote.id} quote={quote} onSave={onSaveCommercial} /></div></details>}
              </article>)}
            </div>
          </div>
        </div>
      </div>}
    <RepurchasePanel quotes={quotes} onOpen={onOpen} onDuplicate={onDuplicate} />
  </section>;
}
