import React, { useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { AuthGate } from './components/AuthGate';
import { allowedAdminEmail, isSupabaseConfigured, supabase } from './supabase';

type Item = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

type Quote = {
  id: string;
  clientName: string;
  clientEmail: string;
  cep: string;
  items: Item[];
  shippingMode: 'Sedex' | 'PAC' | 'Retirada' | 'Motoboy';
  shippingValue: number;
  notes: string;
};

const makeNewQuote = (): Quote => ({
  id: `FM-${Date.now()}`,
  clientName: '',
  clientEmail: '',
  cep: '',
  items: [{ id: crypto.randomUUID(), description: 'Fresa 3 Cortes TCT 6x22', quantity: 1, unitPrice: 140 }],
  shippingMode: 'Sedex',
  shippingValue: 35,
  notes: '',
});

const formatMoney = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export default function App() {
  const [quote, setQuote] = useState<Quote>(makeNewQuote);
  const [supabaseUser, setSupabaseUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(isSupabaseConfigured);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState(allowedAdminEmail);
  const [authPassword, setAuthPassword] = useState('');
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [cloudSaveState, setCloudSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const subtotal = useMemo(
    () => quote.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
    [quote.items],
  );
  const total = subtotal + quote.shippingValue;

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user || null;
      setSupabaseUser(user);
      setIsPasswordRecovery(event === 'PASSWORD_RECOVERY');
      setIsAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !supabaseUser) return;
    const supabaseClient = supabase;

    if (supabaseUser.email?.toLowerCase() !== allowedAdminEmail) {
      setAuthError(`Acesso permitido somente para ${allowedAdminEmail}.`);
      void supabase.auth.signOut();
      return;
    }

    setCloudSaveState('saving');
    const timer = window.setTimeout(async () => {
      try {
        const payload = {
          id: quote.id,
          owner_id: supabaseUser.id,
          quote: JSON.parse(JSON.stringify(quote)),
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabaseClient.from('quotes').upsert(payload, { onConflict: 'owner_id,id' });
        if (error) throw error;
        setCloudSaveState('saved');
      } catch (error: any) {
        setCloudSaveState('error');
        setAuthError(error.message || 'Não foi possível salvar o orçamento.');
      }
    }, 600);

    return () => window.clearTimeout(timer);
  }, [quote, supabaseUser]);

  const handlePasswordSignIn = async () => {
    if (!supabase) return;

    setIsAuthLoading(true);
    setAuthError(null);
    setAuthNotice(null);

    try {
      if (authEmail.trim().toLowerCase() !== allowedAdminEmail) {
        throw new Error(`Acesso permitido somente para ${allowedAdminEmail}.`);
      }
      if (!authPassword) throw new Error('Informe sua senha.');

      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim().toLowerCase(),
        password: authPassword,
      });

      if (error) throw error;
    } catch (error: any) {
      setAuthError(error.message || 'Não foi possível entrar.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handlePasswordRecovery = async () => {
    if (!supabase) return;

    setIsAuthLoading(true);
    setAuthError(null);
    setAuthNotice(null);

    try {
      if (authEmail.trim().toLowerCase() !== allowedAdminEmail) {
        throw new Error(`Acesso permitido somente para ${allowedAdminEmail}.`);
      }

      const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim().toLowerCase(), {
        redirectTo: window.location.href.split('#')[0],
      });
      if (error) throw error;
      setAuthNotice('Enviamos um link para criar ou redefinir sua senha.');
    } catch (error: any) {
      setAuthError(error.message || 'Não foi possível enviar o link de recuperação.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!supabase) return;

    setIsAuthLoading(true);
    setAuthError(null);
    setAuthNotice(null);

    try {
      if (authPassword.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');

      const { error } = await supabase.auth.updateUser({ password: authPassword });
      if (error) throw error;
      setAuthPassword('');
      setIsPasswordRecovery(false);
      setAuthNotice('Senha definida. Você já está conectado.');
    } catch (error: any) {
      setAuthError(error.message || 'Não foi possível atualizar a senha.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleAddItem = () => {
    setQuote((current) => ({
      ...current,
      items: [...current.items, { id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: 0 }],
    }));
  };

  const handleItemChange = (itemId: string, field: keyof Item, value: string | number) => {
    setQuote((current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId ? { ...item, [field]: value } : item),
    }));
  };

  const handleRemoveItem = (itemId: string) => {
    setQuote((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== itemId),
    }));
  };

  if (!isSupabaseConfigured && import.meta.env.PROD) {
    return (
      <AuthGate
        needsSetup
        email={authEmail}
        password={authPassword}
        onEmailChange={setAuthEmail}
        onPasswordChange={setAuthPassword}
        onPasswordSignIn={handlePasswordSignIn}
        onPasswordRecovery={handlePasswordRecovery}
        onPasswordUpdate={handlePasswordUpdate}
      />
    );
  }

  if (isSupabaseConfigured && (isPasswordRecovery || !supabaseUser || isAuthLoading)) {
    return (
      <AuthGate
        isLoading={isAuthLoading}
        isPasswordRecovery={isPasswordRecovery}
        error={authError}
        notice={authNotice}
        email={authEmail}
        password={authPassword}
        onEmailChange={setAuthEmail}
        onPasswordChange={setAuthPassword}
        onPasswordSignIn={handlePasswordSignIn}
        onPasswordRecovery={handlePasswordRecovery}
        onPasswordUpdate={handlePasswordUpdate}
      />
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4 text-slate-800 md:p-6">
      <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-col gap-3 border-b border-slate-200 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Fresa Master</p>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Orçamento rápido</h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
              {cloudSaveState === 'saved' ? 'Salvo' : cloudSaveState === 'saving' ? 'Salvando...' : cloudSaveState === 'error' ? 'Erro' : 'Pronto'}
            </span>
            <button
              type="button"
              onClick={() => supabase?.auth.signOut()}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Sair
            </button>
          </div>
        </header>

        <div className="grid gap-6 p-5 lg:grid-cols-[1.4fr_0.8fr]">
          <section className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Nome do cliente
                <input
                  value={quote.clientName}
                  onChange={(e) => setQuote((current) => ({ ...current, clientName: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none ring-0 focus:border-slate-400"
                  placeholder="Ex: Móveis Requinte Ltda"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                E-mail
                <input
                  type="email"
                  value={quote.clientEmail}
                  onChange={(e) => setQuote((current) => ({ ...current, clientEmail: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  placeholder="cliente@empresa.com"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                CEP
                <input
                  value={quote.cep}
                  onChange={(e) => setQuote((current) => ({ ...current, cep: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                  placeholder="00000-000"
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Modalidade de frete
                <select
                  value={quote.shippingMode}
                  onChange={(e) => setQuote((current) => ({ ...current, shippingMode: e.target.value as Quote['shippingMode'] }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                >
                  <option value="Sedex">Sedex</option>
                  <option value="PAC">PAC</option>
                  <option value="Retirada">Retirada</option>
                  <option value="Motoboy">Motoboy</option>
                </select>
              </label>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-900">Itens</h2>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"
                >
                  + adicionar item
                </button>
              </div>

              <div className="space-y-3">
                {quote.items.map((item) => (
                  <div key={item.id} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[1.5fr_0.7fr_0.9fr_44px]">
                    <input
                      value={item.description}
                      onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm outline-none focus:border-slate-400"
                      placeholder="Descrição do item"
                    />
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => handleItemChange(item.id, 'quantity', Number(e.target.value || 1))}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm outline-none focus:border-slate-400"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.unitPrice}
                      onChange={(e) => handleItemChange(item.id, 'unitPrice', Number(e.target.value || 0))}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm outline-none focus:border-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100"
                    >
                      X
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <label className="block text-sm font-medium text-slate-700">
              Observações
              <textarea
                value={quote.notes}
                onChange={(e) => setQuote((current) => ({ ...current, notes: e.target.value }))}
                rows={4}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                placeholder="Entrega, prazos, condições, etc."
              />
            </label>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-base font-bold text-slate-900">Resumo</h2>

              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <strong>{formatMoney(subtotal)}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span>Frete</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={quote.shippingValue}
                    onChange={(e) => setQuote((current) => ({ ...current, shippingValue: Number(e.target.value || 0) }))}
                    className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm outline-none focus:border-slate-400"
                  />
                </div>
                <div className="border-t border-slate-200 pt-3 text-lg font-black text-slate-900">
                  <div className="flex items-center justify-between">
                    <span>Total</span>
                    <span>{formatMoney(total)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-900 p-4 text-slate-100">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Status</p>
              <p className="mt-2 text-sm text-slate-200">
                {quote.clientName || 'Cliente sem nome'} • {quote.items.length} item{quote.items.length === 1 ? '' : 'ns'}
              </p>
              <p className="mt-3 text-xs text-slate-400">
                {quote.shippingMode} • {formatMoney(quote.shippingValue)}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
