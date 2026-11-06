import React, { useEffect, useRef, useState } from 'react';
import { Cloud, RefreshCw, Target, Trophy } from 'lucide-react';
import { formatMoney } from '../salesInsights';
import { goalProgress, type SalesGoals as Goals } from '../salesGrowth';
import { parsePaymentAmount } from '../commercialTracking';
import type { salesGoalsStore } from '../salesGoalsStore';
import { workspaceErrorMessage } from '../workspaceSession';

interface Props {
  ownerId?: string;
  year: number;
  month: number | null;
  months: { key: string; approved: number }[];
  store?: ReturnType<typeof salesGoalsStore>;
}

export function SalesGoals(props: Props) {
  return <GoalPanel key={`${props.ownerId || 'signed-out'}:${props.year}`} {...props} />;
}

function GoalPanel({ ownerId, year, month, months, store }: Props) {
  const [goals, setGoals] = useState<Goals>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const alive = useRef(true);
  const lock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setError(null);
    if (!store || !ownerId) return;
    void store.load(year).then((values) => {
      if (active) { setGoals(values); setLoaded(true); }
    }).catch((cause: unknown) => {
      if (active) setError(`Não foi possível carregar as metas: ${workspaceErrorMessage(cause)}`);
    });
    return () => { active = false; };
  }, [ownerId, year, reload, store]);
  const period = month ? `${year}-${String(month).padStart(2, '0')}` : null;
  const progress = goalProgress(months, goals);
  const save = async (amount: number | null) => {
    if (lock.current) { setError('Aguarde o salvamento da meta.'); return; }
    if (!store || !ownerId || !period || !loaded) { setError('Carregue as metas da conta antes de salvar.'); return; }
    lock.current = true;
    setBusy(true);
    setNotice('');
    setError(null);
    try {
      await store.save(period, amount);
      if (alive.current) {
        setGoals((current) => {
          const next = { ...current };
          if (amount === null) delete next[period];
          else next[period] = amount;
          return next;
        });
        setNotice(amount === null ? 'Meta removida da conta.' : 'Meta salva na conta. Disponível nos outros dispositivos ao abrir ou atualizar o dashboard.');
      }
    } catch (cause) {
      if (alive.current) setError(`Não foi possível salvar a meta. Confira a conexão e tente novamente: ${workspaceErrorMessage(cause)}`);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  };
  return <article className="fm-panel overflow-hidden p-5 sm:p-6" aria-labelledby="goals-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3"><span className="fm-icon bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><Target className="h-5 w-5" /></span><div><h2 id="goals-title" className="text-lg font-bold">Metas de vendas</h2><p className="text-xs text-slate-500 dark:text-slate-400">Orçamentos aprovados · pela data do orçamento</p></div></div>
      <button type="button" disabled={busy || !ownerId || !store} onClick={() => { setNotice(''); setReload((value) => value + 1); }} className="fm-secondary inline-flex items-center gap-2 text-xs" aria-label="Atualizar metas da conta"><RefreshCw className="h-3.5 w-3.5" />Atualizar metas</button>
    </div>
    <p className="mt-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><Cloud className="h-4 w-4 shrink-0" />Metas mensais salvas na conta, não apenas neste navegador.</p>
    {!ownerId || !store ? <p role="status" className="mt-4 text-sm text-slate-500">Entre na conta com conexão à nuvem para definir e consultar metas.</p> : <>
      {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
      {!loaded && !error && <p role="status" className="mt-4 text-sm">Carregando metas da conta…</p>}
      {loaded && <>
        <div className="my-5 flex flex-wrap items-end justify-between gap-3"><div className="min-w-0"><p className="text-xs text-slate-500 dark:text-slate-400">{month ? 'Realizado / meta do mês' : `Realizado / metas de ${progress.configured} de 12 meses`}</p><p className="mt-1 break-words text-2xl font-bold tracking-tight">{progress.configured ? <>{formatMoney(progress.achieved)} <span className="text-sm font-medium text-slate-500">/ {formatMoney(progress.target)}</span></> : 'Meta ainda não definida'}</p></div>{progress.configured > 0 && <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{progress.percentage >= 100 && <Trophy className="h-4 w-4" />}{progress.percentage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>}</div>
        <div role="progressbar" aria-label="Progresso da meta de vendas" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, progress.percentage)} aria-valuetext={progress.configured ? `${progress.percentage.toFixed(1)}% da meta` : 'Sem meta definida'} className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500" style={{ width: `${Math.min(100, progress.percentage)}%` }} /></div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{!progress.configured ? 'Defina uma meta mensal para acompanhar seu progresso.' : progress.remaining > 0 ? `Faltam ${formatMoney(progress.remaining)} para atingir a meta.` : 'Meta alcançada! Continue acompanhando suas vendas.'}</p>
        {!month && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Na visão anual, somente meses com metas entram nesta comparação. Selecione um mês no filtro para definir ou alterar sua meta.</p>}
        {period && <GoalEditor key={period} amount={goals[period]} busy={busy} onSave={save} />}
      </>}
      {notice && <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>}
    </>}
    <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-400">Inclui frete e descontos do orçamento. Não é meta de lucro nem de recebimentos. Alterações na data, valor ou aprovação atualizam o realizado.</p>
  </article>;
}

function GoalEditor({ amount, busy, onSave }: { amount?: number; busy: boolean; onSave: (amount: number | null) => Promise<void> }) {
  const [input, setInput] = useState(amount?.toFixed(2).replace('.', ',') || '');
  const [error, setError] = useState('');
  useEffect(() => { setInput(amount?.toFixed(2).replace('.', ',') || ''); }, [amount]);
  return <form className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800" onSubmit={(event) => {
    event.preventDefault();
    try {
      const value = parsePaymentAmount(input);
      setError('');
      void onSave(value);
    } catch (cause) { setError(workspaceErrorMessage(cause)); }
  }}>
    <label className="min-w-0 flex-1 text-xs font-semibold">Meta mensal (R$)<input aria-label="Meta mensal em reais" inputMode="decimal" value={input} disabled={busy} onChange={(event) => setInput(event.target.value)} placeholder="Ex.: 15000,00" className="fm-input mt-1 w-full" /></label>
    <button type="submit" disabled={busy} className="fm-primary">{busy ? 'Salvando…' : 'Salvar meta'}</button>
    {amount !== undefined && <button type="button" disabled={busy} className="fm-secondary" onClick={() => {
      if (window.confirm('Remover a meta deste mês? Os orçamentos não serão alterados.')) void onSave(null);
    }}>Remover meta</button>}
    {error && <p role="alert" className="w-full text-sm text-rose-600 dark:text-rose-300">{error}</p>}
  </form>;
}
