import React from 'react';
import { AlertTriangle, LoaderCircle, LockKeyhole } from 'lucide-react';
import { FresaMasterLogo } from './FresaMasterLogo';

interface AuthGateProps {
  needsSetup?: boolean;
  isLoading?: boolean;
  isPasswordRecovery?: boolean;
  error?: string | null;
  notice?: string | null;
  email: string;
  password: string;
  onEmailChange: (email: string) => void;
  onPasswordChange: (password: string) => void;
  onPasswordSignIn: () => void;
  onPasswordRecovery: () => void;
  onPasswordUpdate: () => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  needsSetup = false,
  isLoading = false,
  isPasswordRecovery = false,
  error,
  notice,
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onPasswordSignIn,
  onPasswordRecovery,
  onPasswordUpdate,
}) => (
  <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-5">
    <section className="w-full max-w-md border border-slate-800 bg-slate-900 p-7 shadow-2xl">
      <FresaMasterLogo size="lg" theme="dark" />
      <div className="mt-8 flex items-start gap-3">
        <span className="mt-0.5 rounded-lg bg-amber-500/10 p-2 text-amber-400">
          {needsSetup ? <AlertTriangle className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
        </span>
        <div>
          <h1 className="text-lg font-bold text-white">
            {needsSetup ? 'Configuração necessária' : 'Acesso privado'}
          </h1>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            {needsSetup
              ? 'O Supabase ainda não está configurado neste ambiente. O acesso ao sistema permanece bloqueado.'
              : isPasswordRecovery
                ? 'Escolha uma senha para acessar seus orçamentos.'
                : 'Entre com o e-mail e a senha da conta administradora.'}
          </p>
        </div>
      </div>

      {needsSetup ? (
        <div className="mt-6 space-y-2 border-t border-slate-800 pt-5 text-xs text-slate-400">
          <p>Configure as variáveis Supabase no ambiente de hospedagem:</p>
          <p className="font-mono text-amber-300">VITE_SUPABASE_URL</p>
          <p className="font-mono text-amber-300">VITE_SUPABASE_PUBLISHABLE_KEY</p>
        </div>
      ) : (
        <>
          {error && <p className="mt-5 text-xs text-rose-300">{error}</p>}
          {notice && <p className="mt-5 text-xs text-emerald-300">{notice}</p>}
          <label className="mt-6 block text-xs font-semibold text-slate-300" htmlFor="auth-email">E-mail</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            className="mt-2 w-full border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-amber-400"
          />

          <label className="mt-4 block text-xs font-semibold text-slate-300" htmlFor="auth-password">
            {isPasswordRecovery ? 'Nova senha' : 'Senha'}
          </label>
          <input
            id="auth-password"
            type="password"
            autoComplete={isPasswordRecovery ? 'new-password' : 'current-password'}
            minLength={isPasswordRecovery ? 8 : undefined}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            className="mt-2 w-full border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-amber-400"
          />

          <button
            type="button"
            onClick={isPasswordRecovery ? onPasswordUpdate : onPasswordSignIn}
            disabled={isLoading}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
          >
            {isLoading && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {isLoading ? 'Aguarde...' : isPasswordRecovery ? 'Salvar senha' : 'Entrar'}
          </button>

          {!isPasswordRecovery && (
            <button
              type="button"
              onClick={onPasswordRecovery}
              disabled={isLoading}
              className="mt-3 w-full text-center text-xs font-semibold text-amber-300 hover:text-amber-200 disabled:opacity-60"
            >
              Esqueci a senha
            </button>
          )}
          <p className="mt-4 text-center text-[11px] text-slate-500">Acesso permitido apenas para a conta administradora.</p>
        </>
      )}
    </section>
  </main>
);