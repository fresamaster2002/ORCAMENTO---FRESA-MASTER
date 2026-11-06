import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, CircleDollarSign, MessageCircle } from 'lucide-react';
import type { ManualPayment, QuoteData, SaveCommercialTracking } from '../types';
import { followUpWhatsapp, isCalendarDate, localDate, parsePaymentAmount, paymentSummary, recordPayment, voidPayment } from '../commercialTracking';
import { formatMoney } from '../salesInsights';

export function CommercialControls({ quote, onSave }: { quote: QuoteData; onSave: SaveCommercialTracking }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localDate());
  const [method, setMethod] = useState('Pix');
  const [notes, setNotes] = useState(quote.commercial?.notes || '');
  const [nextContact, setNextContact] = useState(quote.commercial?.nextContactDate || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const lock = useRef(false);
  const pendingPayment = useRef<ManualPayment | null>(null);
  const summary = paymentSummary(quote);
  const whatsapp = followUpWhatsapp(quote);
  useEffect(() => {
    if (pendingPayment.current && quote.commercial?.payments?.some((payment) => payment.id === pendingPayment.current?.id)) {
      pendingPayment.current = null;
      setAmount('');
    }
  }, [quote.commercial]);

  const execute = async (update: Parameters<SaveCommercialTracking>[1], message: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      await onSave(quote.id, update);
      setNotice(message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar o controle comercial. Confira os lançamentos e a sincronização antes de repetir.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const input = 'w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800';
  return <section aria-label={`Controle comercial ${quote.id}`} className="space-y-5 rounded-2xl border border-indigo-200 bg-white p-5 dark:border-indigo-900 dark:bg-slate-900">
    <div><h2 className="flex items-center gap-2 text-lg font-bold"><CircleDollarSign className="h-5 w-5 text-emerald-500" />Pagamentos e acompanhamento · {quote.id}</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Controle manual e interno. Não confirma Pix, não cobra o cliente nem altera pedido, NF-e ou envio no Bling.</p></div>
    {quote.status === 'approved' && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Aprovado: pagamento confirmado pelo operador no fluxo da Fresa Master. Os campos abaixo detalham os recebimentos para os relatórios; um valor ainda não registrado não significa cobrança pendente.</p>}
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
    {summary.issues.map((issue) => <p role="alert" key={issue} className="text-sm text-rose-600">{issue}</p>)}
    <div className="grid gap-3 sm:grid-cols-3">{[
      ['Registrado como recebido', formatMoney(summary.paid)], ['Valor a detalhar no registro', summary.issues.length ? 'Conferir total' : formatMoney(summary.outstanding)], ['Situação dos lançamentos', summary.status],
    ].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500 dark:text-slate-400">{label}</p><p className="mt-1 font-bold">{value}</p></div>)}</div>
    {summary.excess > 0 && <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">Os pagamentos excedem o total atual em {formatMoney(summary.excess)}. Confira alterações no orçamento; cancelar um lançamento não devolve dinheiro ao cliente.</p>}
    <form onSubmit={(event) => {
      event.preventDefault();
      void execute((current) => {
        const payment = pendingPayment.current || { id: crypto.randomUUID(), amount: parsePaymentAmount(amount), date, method, recordedAt: new Date().toISOString() };
        const updated = recordPayment(current, payment);
        pendingPayment.current = payment;
        return updated;
      }, 'Pagamento registrado. Confira a indicação de sincronização da nuvem.');
    }} className="grid items-end gap-3 sm:grid-cols-4">
      <label className="text-xs font-semibold">Valor recebido (R$)<input aria-label="Valor recebido" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ex.: 140,50" disabled={busy} required className={`${input} mt-1`} /></label>
      <label className="text-xs font-semibold">Data do recebimento<input aria-label="Data do recebimento" type="date" value={date} max={localDate()} onChange={(event) => setDate(event.target.value)} disabled={busy} required className={`${input} mt-1`} /></label>
      <label className="text-xs font-semibold">Forma de pagamento<select aria-label="Forma do pagamento recebido" value={method} onChange={(event) => setMethod(event.target.value)} disabled={busy} className={`${input} mt-1`}>{['Pix', 'Dinheiro', 'Boleto', 'Cartão', 'Transferência'].map((value) => <option key={value}>{value}</option>)}</select></label>
      <button type="submit" disabled={busy || summary.issues.length > 0 || summary.outstanding <= 0 || quote.status === 'rejected'} className="rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40">Registrar recebimento</button>
    </form>
    <ul className="space-y-2" aria-label="Lançamentos de pagamento">{(quote.commercial?.payments || []).map((payment) => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
      <span className={payment.voidedAt ? 'text-slate-500 line-through' : ''}>{formatMoney(payment.amount)} · {payment.date.split('-').reverse().join('/')} · {payment.method}</span>
      {payment.voidedAt ? <span className="text-xs text-slate-500">Lançamento cancelado (mantido no histórico)</span> : <button type="button" disabled={busy} onClick={() => {
        if (window.confirm('Cancelar este lançamento manual? O histórico será preservado. Isso não estorna dinheiro nem altera a NF-e.')) void execute((current) => voidPayment(current, payment.id), 'Lançamento cancelado no controle manual.');
      }} className="text-xs font-semibold text-rose-600 disabled:opacity-40">Cancelar lançamento</button>}
    </li>)}</ul>
    <form onSubmit={(event) => {
      event.preventDefault();
      void execute((current) => {
        if (nextContact && !isCalendarDate(nextContact)) throw new Error('Informe uma data válida para o próximo contato.');
        if (notes.length > 3000) throw new Error('Use até 3000 caracteres nas anotações.');
        return { ...current.commercial, notes, nextContactDate: nextContact };
      }, 'Anotações e próximo contato salvos.');
    }} className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
      <h3 className="flex items-center gap-2 font-bold"><CalendarDays className="h-4 w-4 text-indigo-500" />Relacionamento e próximo contato</h3>
      <label className="block text-xs font-semibold">Anotações internas deste orçamento<textarea aria-label="Anotações comerciais" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={3000} disabled={busy} rows={3} placeholder="Preferências, negociação, dúvidas do cliente..." className={`${input} mt-1`} /></label>
      <div className="flex flex-wrap items-end gap-3"><label className="text-xs font-semibold">Próximo contato<input aria-label="Próximo contato" type="date" value={nextContact} onChange={(event) => setNextContact(event.target.value)} disabled={busy} className={`${input} mt-1`} /></label>
        <button type="submit" disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Salvar acompanhamento</button>
        <button type="button" disabled={busy} onClick={() => void execute((current) => ({ ...current.commercial, lastContactDate: localDate() }), 'Contato de hoje registrado. Ajuste o próximo contato quando necessário.')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-40 dark:border-slate-600">Registrar contato hoje</button>
        {whatsapp ? <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"><MessageCircle className="h-4 w-4" />Acompanhar pelo WhatsApp</a> : <span className="text-xs text-slate-500">Cadastre um telefone brasileiro com DDD para abrir o WhatsApp.</span>}
      </div>
      {quote.commercial?.lastContactDate && <p className="text-xs text-slate-500">Último contato registrado: {quote.commercial.lastContactDate.split('-').reverse().join('/')}</p>}
    </form>
  </section>;
}
