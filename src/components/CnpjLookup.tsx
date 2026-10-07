import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, Search } from 'lucide-react';
import { apiFetch } from '../api';
import { ClientInfo } from '../types';

interface CnpjLookupProps {
  initialCnpj?: string;
  onFound: (client: ClientInfo, warnings: string[]) => void | Promise<void>;
}

const parseClient = (value: unknown): ClientInfo | null => {
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (typeof data.document !== 'string' || typeof data.name !== 'string') return null;
  return {
    name: data.name,
    tradeName: String(data.tradeName || ''),
    document: data.document,
    ie: String(data.ie || ''),
    email: String(data.email || ''),
    phone: String(data.phone || ''),
    cep: String(data.cep || ''),
    address: String(data.address || ''),
    number: String(data.number || ''),
    complement: String(data.complement || ''),
    neighborhood: String(data.neighborhood || ''),
    city: String(data.city || ''),
    state: String(data.state || ''),
  };
};

export const CnpjLookup: React.FC<CnpjLookupProps> = ({ initialCnpj = '', onFound }) => {
  const [cnpj, setCnpj] = useState(initialCnpj);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (initialCnpj) setCnpj(initialCnpj);
  }, [initialCnpj]);

  const handleLookup = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setNotice(null);
    setWarnings([]);

    try {
      const response = await apiFetch('/api/bling/lookup-cnpj', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cnpj }),
      });
      const data: unknown = await response.json();
      const result = data && typeof data === 'object' ? data as Record<string, unknown> : {};
      if (!response.ok || result.success !== true) {
        throw new Error(String(result.error || 'Não foi possível consultar este CNPJ.'));
      }
      const client = parseClient(result.client);
      if (!client) throw new Error('A consulta retornou dados cadastrais incompletos. Tente novamente.');
      const messages = Array.isArray(result.warnings)
        ? result.warnings.filter((item): item is string => typeof item === 'string')
        : [];
      await onFound(client, messages);
      setWarnings(messages);
      setNotice(`Cadastro localizado em ${String(result.source || 'serviço público')}. Confira os dados antes de emitir a NF-e.`);
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : 'Falha ao consultar o CNPJ.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-900 dark:bg-blue-950/30">
      <form onSubmit={handleLookup} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-bold text-slate-800 dark:text-slate-200">
            Buscar cadastro e Inscrição Estadual pelo CNPJ
          </span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={18}
            value={cnpj}
            onChange={(event) => setCnpj(event.target.value)}
            placeholder="00.000.000/0000-00"
            aria-label="CNPJ para consulta cadastral"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </label>
        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {isLoading ? 'Consultando...' : 'Consultar CNPJ'}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {notice}
        </p>
      )}
      {warnings.map((warning) => (
        <p key={warning} className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-200">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {warning}
        </p>
      ))}
      <p className="mt-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
        Consulta dados cadastrais públicos. A Inscrição Estadual pode não constar ou estar desatualizada; confirme-a antes de faturar. Ausência de resultado não significa “ISENTO”.
      </p>
    </section>
  );
};
