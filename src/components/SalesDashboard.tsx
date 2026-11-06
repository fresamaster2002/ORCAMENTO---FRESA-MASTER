import React, { useMemo, useState } from 'react';
import { BadgeCheck, BarChart3, Receipt, Target, TrendingUp, CalendarSearch, CircleDollarSign } from 'lucide-react';
import type { QuoteData } from '../types';
import { formatMoney, quoteDate, salesInsights } from '../salesInsights';
import { quoteStatusLabels } from '../quoteWorkspaceTools';
import { receiptInsights } from '../commercialTracking';
import { PendingSales } from './PendingSales';
import { SalesGoals } from './SalesGoals';
import { ProductRanking } from './ProductRanking';
import { RepurchasePanel } from './RepurchasePanel';
import type { salesGoalsStore } from '../salesGoalsStore';

export function SalesDashboard({ quotes, onOpen, onDuplicate, ownerId, goalStore }: { quotes: QuoteData[]; onOpen?: (quote: QuoteData) => void; onDuplicate?: (quote: QuoteData) => void; ownerId?: string; goalStore?: ReturnType<typeof salesGoalsStore> }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState<number | null>(null);
  const years = [...new Set([currentYear, year, ...quotes.flatMap((quote) => {
    const date = quoteDate(quote);
    return date ? [Number(date.slice(0, 4))] : [];
  })])].sort((a, b) => b - a);
  const data = useMemo(() => salesInsights(quotes, year, month), [quotes, year, month]);
  const receipts = useMemo(() => receiptInsights(quotes, year, month), [quotes, year, month]);
  const monthOptions = Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: new Date(2026, index, 1).toLocaleDateString('pt-BR', { month: 'long' }) }));
  const periodLabel = month ? `${monthOptions[month - 1].label} de ${year}` : `ano ${year}`;
  const previousYear = month === 1 ? year - 1 : month ? year : year - 1;
  const previousMonth = month === 1 ? 12 : month ? month - 1 : null;
  const previous = salesInsights(quotes, previousYear, previousMonth);
  const change = previous.approvedTotal > 0 ? (data.approvedTotal - previous.approvedTotal) / previous.approvedTotal * 100 : null;
  const maximum = Math.max(1, ...data.months.flatMap((month) => [month.approved, month.authorized]));
  const panel = 'fm-panel p-5 sm:p-6';
  const statusColors = { draft: '#94a3b8', sent: '#3b82f6', approved: '#10b981', rejected: '#f43f5e' };
  let angle = 0;
  const segments = Object.entries(data.statuses).map(([status, count]) => {
    const start = angle;
    angle += data.period.length ? count / data.period.length * 360 : 0;
    return `${statusColors[status as QuoteData['status']]} ${start}deg ${angle}deg`;
  });
  const metrics = [
    { title: 'Orçamentos aprovados', value: formatMoney(data.approvedTotal), detail: `${data.approvedCount} aprovados · ${change === null ? 'Sem base positiva no período anterior' : `${change > 0 ? '+' : ''}${change.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% vs. ${month ? 'mês' : 'ano'} anterior`}`, icon: BadgeCheck, color: 'from-emerald-500 to-teal-600' },
    { title: 'Com NF-e autorizada', value: formatMoney(data.authorizedTotal), detail: `${data.authorizedCount} notas distintas vinculadas`, icon: Receipt, color: 'from-indigo-500 to-violet-600' },
    { title: 'Ticket médio aprovado', value: formatMoney(data.average), detail: 'Valor aprovado ÷ orçamentos aprovados', icon: TrendingUp, color: 'from-sky-500 to-blue-600' },
    { title: 'Taxa de aprovação', value: `${data.conversion.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`, detail: `${data.approvedCount} de ${data.period.length} orçamentos`, icon: Target, color: 'from-amber-500 to-orange-600' },
    { title: 'Recebimentos registrados', value: formatMoney(receipts.received), detail: 'Pela data do recebimento · controle manual', icon: CircleDollarSign, color: 'from-fuchsia-500 to-purple-600' },
    { title: 'Saldo dos aprovados', value: formatMoney(receipts.outstanding), detail: 'Saldo atual dos orçamentos do período · manual', icon: Receipt, color: 'from-rose-500 to-pink-600' },
  ];
  return <section aria-labelledby="dashboard-title" className="space-y-6">
    <div className="fm-hero flex flex-wrap items-end justify-between gap-4 p-6 text-white sm:p-8">
      <div><p className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-200"><BarChart3 className="h-5 w-5" />Visão comercial</p>
        <h1 id="dashboard-title" className="text-2xl font-bold sm:text-3xl">Resultados da Fresa Master</h1><p className="mt-2 text-sm text-indigo-100">Acompanhe oportunidades, aprovações e notas vinculadas mês a mês.</p></div>
      <label className="text-sm font-semibold">Ano de análise<select aria-label="Ano de análise" value={year} onChange={(event) => setYear(Number(event.target.value))} className="ml-3 rounded-lg border border-white/30 bg-slate-900 px-4 py-2 text-white">{years.map((option) => <option key={option}>{option}</option>)}</select></label>
    </div>
    <div role="search" aria-label="Pesquisar dashboard por mês e ano" className={`${panel} flex flex-wrap items-end gap-4`}>
      <CalendarSearch className="mb-2 h-5 w-5 text-indigo-500" />
      <label className="text-sm font-semibold">Mês<select aria-label="Mês de análise" value={month || ''} onChange={(event) => setMonth(event.target.value ? Number(event.target.value) : null)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 capitalize dark:border-slate-600 dark:bg-slate-800"><option value="">Todos os meses</option>{monthOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label className="text-sm font-semibold">Ano<select aria-label="Ano do período" value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-600 dark:bg-slate-800">{years.map((option) => <option key={option}>{option}</option>)}</select></label>
      <button type="button" onClick={() => { setYear(new Date().getFullYear()); setMonth(new Date().getMonth() + 1); }} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white">Este mês</button>
      <button type="button" onClick={() => setMonth(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600">Ano inteiro</button>
      <p aria-live="polite" className="w-full text-sm font-semibold capitalize">Exibindo {periodLabel} · {data.period.length} orçamentos</p>
    </div>
    <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">Base: data do orçamento, não data de pagamento ou emissão. Valores incluem frete e descontos do orçamento; não representam recebimentos nem o total fiscal consultado da NF-e. Aprovados e autorizados são visões sobrepostas: não some os dois. Situação da NF-e conforme última sincronização salva no app.</p>
    {(data.invalidDates > 0 || data.invalidAmounts > 0) && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{data.invalidDates} registros sem data válida foram excluídos da análise. {data.invalidAmounts} registros do período têm valor inválido: são contados, mas não somados aos valores.</p>}
    {receipts.invalidRecords > 0 && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-900">{receipts.invalidRecords} orçamentos têm pagamentos ou totais inconsistentes e não entram nos indicadores de recebimentos/saldo. Confira os lançamentos na central.</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(({ title, value, detail, icon: Icon, color }) => <article key={title} className={`${panel} fm-metric`}>
      <div className={`mb-4 inline-flex rounded-xl bg-gradient-to-br ${color} p-3 text-white shadow-sm`}><Icon className="h-5 w-5" /></div>
      <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</h2><p className="mt-2 break-words text-2xl font-bold tracking-tight">{value}</p><p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </article>)}</div>
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <SalesGoals ownerId={ownerId} year={year} month={month} months={data.months} store={goalStore} />
      <ProductRanking quotes={data.period} />
    </div>
    {data.period.length === 0 && <p role="status" className={`${panel} text-center text-slate-500`}>{month ? 'Nenhum orçamento neste mês.' : 'Nenhum orçamento neste ano.'} Selecione outro período ou crie seu primeiro orçamento.</p>}
    <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
      <article className={`${panel} min-w-0`}>
        <h2 className="text-lg font-bold">Evolução mensal</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Valores dos orçamentos · {periodLabel}</p>
        <div className="mt-4 flex flex-wrap gap-4 text-xs"><span className="flex items-center gap-2"><i className="h-3 w-3 rounded bg-emerald-500" />Aprovados</span><span className="flex items-center gap-2"><i className="h-3 w-3 rounded bg-indigo-500" />Com NF-e autorizada</span></div>
        <div className="mt-4 overflow-x-auto">
          <svg viewBox="0 0 720 265" role="img" aria-label={`Gráfico mensal: ${periodLabel}. Valores detalhados na tabela abaixo.`} className="min-w-[580px] w-full">
            {[0, 1, 2, 3, 4].map((step) => <g key={step}><line x1="74" x2="712" y1={210 - step * 45} y2={210 - step * 45} stroke="currentColor" opacity=".1" /><text x="66" y={214 - step * 45} textAnchor="end" fill="currentColor" opacity=".7" fontSize="10">{new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(maximum * step / 4)}</text></g>)}
            {data.months.map((month, index) => <g key={month.key}>
              <title>{`${month.label}: aprovados ${formatMoney(month.approved)}, com NF-e ${formatMoney(month.authorized)}`}</title>
              <rect x={data.months.length === 1 ? 340 : 85 + index * 52} y={210 - month.approved / maximum * 180} width={data.months.length === 1 ? 32 : 16} height={month.approved / maximum * 180} rx="3" fill="#10b981" />
              <rect x={data.months.length === 1 ? 380 : 104 + index * 52} y={210 - month.authorized / maximum * 180} width={data.months.length === 1 ? 32 : 16} height={month.authorized / maximum * 180} rx="3" fill="#6366f1" />
              <text x={data.months.length === 1 ? 375 : 102 + index * 52} y="235" textAnchor="middle" fill="currentColor" fontSize="11">{month.label}</text>
            </g>)}
          </svg>
        </div>
      </article>
      <article className={panel}>
        <h2 className="text-lg font-bold">Situação dos orçamentos</h2>
        <div role="img" aria-label={`Distribuição: ${Object.entries(data.statuses).map(([status, count]) => `${quoteStatusLabels[status as QuoteData['status']]} ${count}`).join(', ')}`}
          className="relative mx-auto my-6 flex h-40 w-40 items-center justify-center rounded-full" style={{ background: data.period.length ? `conic-gradient(${segments.join(',')})` : '#cbd5e1' }}>
          <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white dark:bg-slate-900"><strong className="text-3xl">{data.period.length}</strong><span className="text-xs text-slate-500">orçamentos</span></div>
        </div>
        <ul className="space-y-3">{Object.entries(data.statuses).map(([status, count]) => <li key={status} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full" style={{ backgroundColor: statusColors[status as QuoteData['status']] }} />{quoteStatusLabels[status as QuoteData['status']]}</span><strong>{count}</strong></li>)}</ul>
      </article>
    </div>
    <div className="grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
      <article className={`${panel} min-w-0`}><h2 className="text-lg font-bold">Detalhamento por mês</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Valores dos orçamentos em {year}</caption><thead><tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700"><th className="py-3">Mês</th><th className="p-3 text-right">Orçamentos</th><th className="p-3 text-right">Aprovados</th><th className="py-3 text-right">Com NF-e</th></tr></thead><tbody>{data.months.map((month) => <tr key={month.key} className="border-b border-slate-100 last:border-0 dark:border-slate-800"><th className="py-3 capitalize font-medium">{month.label}</th><td className="p-3 text-right">{month.count}</td><td className="whitespace-nowrap p-3 text-right text-emerald-700 dark:text-emerald-400">{formatMoney(month.approved)}</td><td className="whitespace-nowrap py-3 text-right text-indigo-600 dark:text-indigo-300">{formatMoney(month.authorized)}</td></tr>)}</tbody></table></div></article>
      <article className={panel}><h2 className="text-lg font-bold">Clientes em destaque</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Maiores valores em orçamentos aprovados no período</p>
        {!data.topCustomers.length && <p className="mt-6 text-sm text-slate-500">Sem orçamentos aprovados neste período.</p>}
        <ol className="mt-5 space-y-5">{data.topCustomers.map((customer, index) => <li key={index}><div className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 font-bold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300">{index + 1}</span><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{customer.name}</p><p className="mt-1 text-xs text-slate-500">{customer.count} aprovados · {formatMoney(customer.total)}</p></div></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" style={{ width: `${data.topCustomers[0].total ? customer.total / data.topCustomers[0].total * 100 : 0}%` }} /></div></li>)}</ol>
      </article>
    </div>
    {onOpen && onDuplicate && <RepurchasePanel quotes={quotes} onOpen={onOpen} onDuplicate={onDuplicate} />}
    {onOpen && <PendingSales quotes={quotes} onOpen={onOpen} />}
  </section>;
}
