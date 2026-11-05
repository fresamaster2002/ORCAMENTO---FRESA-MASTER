import React, { useMemo, useState } from 'react';
import { Copy, FolderOpen, Search, Users } from 'lucide-react';
import type { QuoteData } from '../types';
import { customerHistories, formatMoney, quoteDate, searchCustomers } from '../salesInsights';
import { quoteStatusLabels } from '../quoteWorkspaceTools';

interface Props {
  quotes: QuoteData[];
  onOpen: (quote: QuoteData) => void;
  onDuplicate: (quote: QuoteData) => void;
}

export function CustomersPage({ quotes, onOpen, onDuplicate }: Props) {
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const customers = useMemo(() => customerHistories(quotes), [quotes]);
  const visible = useMemo(() => searchCustomers(customers, query), [customers, query]);
  const selected = visible.find((customer) => customer.key === selectedKey) || visible[0];
  const panel = 'rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
  return <section aria-labelledby="customers-title" className="space-y-6">
    <div className="rounded-2xl bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-800 p-6 text-white sm:p-8">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-200"><Users className="h-5 w-5" />Relacionamento</p>
      <h1 id="customers-title" className="text-2xl font-bold sm:text-3xl">Seus clientes, sempre por perto</h1>
      <p className="mt-2 max-w-2xl text-sm text-indigo-100">Pesquise o histórico e transforme um orçamento anterior em uma nova oportunidade.</p>
      <p className="mt-4 text-sm font-semibold">{customers.length} clientes · {quotes.length} orçamentos no histórico carregado</p>
    </div>
    <label className={`${panel} flex items-center gap-3 px-4 py-3`}>
      <Search className="h-5 w-5 shrink-0 text-indigo-500" />
      <span className="sr-only">Pesquisar clientes</span>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome, CPF/CNPJ, telefone, e-mail ou orçamento..." className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none" />
    </label>
    <p aria-live="polite" className="text-sm text-slate-500 dark:text-slate-400">{visible.length} clientes encontrados. Sem CPF/CNPJ, o agrupamento usa nome e contato; confira o cadastro antes de replicar.</p>
    {!selected ? <div className={`${panel} p-10 text-center text-slate-500`}>Nenhum cliente encontrado. Cadastre o cliente em um orçamento ou ajuste a pesquisa.</div> :
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(240px,1fr)_2fr]">
        <div className={`${panel} max-h-[34rem] space-y-1 overflow-y-auto p-2`} aria-label="Clientes encontrados">
          {visible.map((customer) => <button key={customer.key} type="button" aria-pressed={selected.key === customer.key} onClick={() => setSelectedKey(customer.key)}
            className={`w-full rounded-xl border p-4 text-left transition ${selected.key === customer.key ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/50' : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            <span className="block break-words font-bold">{customer.client.name || customer.client.company || customer.client.tradeName}</span>
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{customer.client.document || 'Sem CPF/CNPJ'} · {customer.quotes.length} orçamentos</span>
            <span className="mt-2 block text-xs text-indigo-600 dark:text-indigo-300">Último orçamento: {quoteDate(customer.quotes[0])?.split('-').reverse().join('/') || 'Data não informada'}</span>
          </button>)}
        </div>
        <div className={`${panel} min-w-0 overflow-hidden`}>
          <div className="border-b border-slate-200 p-5 dark:border-slate-800">
            <h2 className="break-words text-xl font-bold">{selected.client.name || selected.client.company || selected.client.tradeName}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{selected.client.tradeName}</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              {[
                ['CPF/CNPJ', selected.client.document], ['Telefone', selected.client.phone],
                ['E-mail', selected.client.email], ['Cidade / UF', [selected.client.city, selected.client.state].filter(Boolean).join(' / ')],
              ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt><dd className="break-words font-medium">{value || 'Não informado'}</dd></div>)}
            </dl>
          </div>
          <div className="p-5">
            <h3 className="font-bold">Histórico de orçamentos</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Replicar cria um novo rascunho. Frete, pedido, NF-e e envios antigos não são reaproveitados.</p>
            <div className="mt-4 space-y-3">
              {selected.quotes.map((quote) => <article key={quote.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex flex-wrap justify-between gap-2">
                  <div><h4 className="font-bold">{quote.id}</h4><p className="text-xs text-slate-500 dark:text-slate-400">{quoteDate(quote)?.split('-').reverse().join('/') || 'Data não informada'} · {quoteStatusLabels[quote.status]}{quote.bling?.nfe?.situacao === 5 ? ' · NF-e autorizada' : ''}</p></div>
                  <strong className="text-indigo-600 dark:text-indigo-300">{formatMoney(quote.financials.totalAmount)}</strong>
                </div>
                <p className="my-3 break-words text-sm text-slate-600 dark:text-slate-300">{quote.items.map((item) => `${item.quantity} × ${item.description}`).join(' · ') || 'Sem itens'}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onOpen(quote)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold dark:border-slate-600"><FolderOpen className="h-4 w-4" />Abrir orçamento</button>
                  <button type="button" onClick={() => onDuplicate(quote)} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500"><Copy className="h-4 w-4" />Replicar orçamento</button>
                </div>
              </article>)}
            </div>
          </div>
        </div>
      </div>}
  </section>;
}
