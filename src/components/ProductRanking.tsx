import React, { useMemo, useState } from 'react';
import { PackageSearch } from 'lucide-react';
import type { QuoteData } from '../types';
import { productRanking } from '../salesGrowth';
import { formatMoney } from '../salesInsights';

export function ProductRanking({ quotes }: { quotes: QuoteData[] }) {
  const [sort, setSort] = useState<'quantity' | 'revenue'>('quantity');
  const [expanded, setExpanded] = useState(false);
  const { products, invalidItems } = useMemo(() => productRanking(quotes, sort), [quotes, sort]);
  const visible = expanded ? products : products.slice(0, 5);
  const maximum = Math.max(1, ...products.map((product) => sort === 'quantity' ? product.quantity : product.revenue));
  const colors = ['from-sky-400 to-blue-600', 'from-violet-400 to-purple-600', 'from-teal-400 to-emerald-600', 'from-amber-400 to-orange-500', 'from-rose-400 to-pink-600'];
  return <article className="fm-panel min-w-0 p-5 sm:p-6" aria-labelledby="products-title">
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><span className="fm-icon bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300"><PackageSearch className="h-5 w-5" /></span><div><h2 id="products-title" className="text-lg font-bold">Produtos mais vendidos</h2><p className="text-xs text-slate-500 dark:text-slate-400">Orçamentos aprovados no período selecionado</p></div></div>
      <label className="text-xs font-semibold">Ordenar por<select aria-label="Ordenar produtos" value={sort} onChange={(event) => setSort(event.target.value === 'revenue' ? 'revenue' : 'quantity')} className="fm-input mt-1 block"><option value="quantity">Quantidade</option><option value="revenue">Valor dos itens</option></select></label>
    </div>
    {invalidItems > 0 && <p role="alert" className="mt-4 text-sm text-amber-700 dark:text-amber-300">{invalidItems} itens inválidos não entraram no ranking. Confira descrição, quantidade e valor.</p>}
    {!products.length && <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Sem produtos válidos em orçamentos aprovados neste período.</p>}
    <ol className="mt-5 space-y-5">{visible.map((product, index) => <li key={product.key}>
      <div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{index + 1}</span><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-bold">{product.description}</h3><p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">{product.sku || 'Sem SKU'} · {product.orders} orçamentos</p><div className="mt-2 flex flex-wrap justify-between gap-2 text-sm"><strong>{product.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {product.unit}</strong><span className="font-semibold text-indigo-600 dark:text-indigo-300">{formatMoney(product.revenue)}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full bg-gradient-to-r ${colors[index % colors.length]}`} style={{ width: `${(sort === 'quantity' ? product.quantity : product.revenue) / maximum * 100}%` }} /></div></div></div>
    </li>)}</ol>
    {products.length > 5 && <button type="button" onClick={() => setExpanded((value) => !value)} className="fm-secondary mt-5 w-full">{expanded ? 'Mostrar os 5 primeiros' : `Ver todos os ${products.length} produtos`}</button>}
    <p className="mt-5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Valor bruto dos itens, antes do desconto geral e sem frete. Não é lucro nem recebimento. Produtos são agrupados por SKU (ou ID/descrição quando ausente); unidades diferentes ficam separadas.</p>
  </article>;
}
