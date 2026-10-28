import { useCallback, useEffect, useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import type { QuoteData } from './types';
import { isSupabaseConfigured, supabase } from './supabase';
import {
  defaultWorkspaceView, mergeWorkspaceQuotes, readWorkspace, resumeWorkspaceQuote, workspaceKey, workspaceErrorMessage,
  type WorkspaceSession, type WorkspaceView,
} from './workspaceSession';

export function useWorkspaceSession(
  ownerId: string | null,
  initialQuote: QuoteData,
  normalize: (value: unknown) => QuoteData | null,
  createEmpty: (ids: string[]) => QuoteData,
) {
  const [quote, setQuoteState] = useState(initialQuote);
  const [recentQuotes, setRecentQuotes] = useState<QuoteData[]>([]);
  const [view, setViewState] = useState<WorkspaceView>(defaultWorkspaceView);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [storageError, setStorageError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const session = useRef<WorkspaceSession | null>(null);
  const storageOwner = useRef<string | null>(null);
  const cloudReadable = useRef(false);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const effectiveOwner = isSupabaseConfigured ? ownerId : 'local';

  const persistLocal = useCallback(() => {
    if (!session.current || !storageOwner.current) return;
    try {
      localStorage.setItem(workspaceKey(storageOwner.current), JSON.stringify(session.current));
    } catch (cause) {
      const message = workspaceErrorMessage(cause);
      console.error('Falha ao salvar rascunho local:', cause);
      setStorageError(`Não foi possível salvar neste navegador: ${message}. Mantenha o app aberto até sincronizar.`);
      setStatus('error');
    }
  }, []);

  const setQuote = useCallback((update: SetStateAction<QuoteData>) => {
    const current = session.current;
    if (!current) return;
    const next = typeof update === 'function' ? update(current.quote) : update;
    current.quote = next;
    current.pending[next.id] = { quote: next, updatedAt: new Date().toISOString() };
    if (isSupabaseConfigured) setStatus(cloudReadable.current ? 'saving' : 'error');
    persistLocal();
    setQuoteState(next);
    setRecentQuotes((quotes) => [next, ...quotes.filter((saved) => saved.id !== next.id)].slice(0, 500));
    setRevision((value) => value + 1);
  }, [persistLocal]);

  const setView = useCallback((patch: Partial<WorkspaceView>) => {
    if (!session.current) return;
    session.current.view = { ...session.current.view, ...patch };
    persistLocal();
    setViewState(session.current.view);
  }, [persistLocal]);

  useEffect(() => {
    let active = true;
    setReady(false);
    cloudReadable.current = false;
    storageOwner.current = effectiveOwner;
    session.current = null;
    setStorageError(null);
    setSyncError(null);
    setRecentQuotes([]);
    setViewState(defaultWorkspaceView);
    if (!effectiveOwner) return;
    let local: WorkspaceSession | null = null;
    try {
      local = readWorkspace(localStorage, effectiveOwner, normalize);
    } catch (cause) {
      console.error('Falha ao recuperar rascunho local:', cause);
      setStorageError(`Não foi possível recuperar o rascunho deste navegador: ${workspaceErrorMessage(cause)}`);
    }
    void (async () => {
      let cloud: QuoteData[] = [];
      let loaded = !isSupabaseConfigured;
      try {
        if (supabase && ownerId) {
          const { data, error: readError } = await supabase.from('quotes').select('quote')
            .eq('owner_id', ownerId).not('id', 'like', 'ME-PRODUCTION:%').order('updated_at', { ascending: false }).limit(500)
            .abortSignal(AbortSignal.timeout(15000));
          if (readError) throw readError;
          cloud = (data || []).map((row) => normalize(row.quote)).filter((saved): saved is QuoteData => saved !== null);
          loaded = true;
        }
      } catch (cause) {
        if (!active) return;
        setSyncError(`Não foi possível ler a nuvem. O rascunho local foi preservado; a sincronização está pausada: ${workspaceErrorMessage(cause)}`);
        setStatus('error');
      }
      if (!active) return;
      const merged = mergeWorkspaceQuotes(cloud, local);
      const restored = resumeWorkspaceQuote(cloud, local) || createEmpty(merged.map((saved) => saved.id));
      session.current = local
        ? { ...local, quote: restored }
        : { version: 1, quote: restored, pending: {}, view: { ...defaultWorkspaceView } };
      cloudReadable.current = loaded;
      setQuoteState(restored);
      setRecentQuotes(merged);
      setViewState(session.current.view);
      setReady(true);
      if (loaded) setStatus(Object.keys(session.current.pending).length ? 'saving' : cloud.length ? 'saved' : 'idle');
      persistLocal();
      setRevision((value) => value + 1);
    })();
    return () => { active = false; };
  }, [effectiveOwner, ownerId, normalize, createEmpty, persistLocal]);

  const saveNow = useCallback(() => {
    const owner = storageOwner.current;
    const database = supabase;
    const task = writes.current.catch(() => undefined).then(async () => {
      if (!database || !owner || owner === 'local') return;
      if (!cloudReadable.current) throw new Error('A leitura da nuvem falhou. Reabra o app com conexão para sincronizar o rascunho preservado.');
      if (!Object.keys(session.current?.pending || {}).length) return;
      setStatus('saving');
      while (owner === storageOwner.current && session.current) {
        const entry = Object.values(session.current.pending)[0];
        if (!entry) break;
        const { error: writeError } = await database.from('quotes').upsert({
          id: entry.quote.id, owner_id: owner, quote: entry.quote, updated_at: entry.updatedAt,
        }, { onConflict: 'owner_id,id' }).abortSignal(AbortSignal.timeout(15000));
        if (writeError) throw writeError;
        if (owner !== storageOwner.current) return;
        if (session.current?.pending[entry.quote.id] === entry) {
          delete session.current.pending[entry.quote.id];
          persistLocal();
        }
      }
      if (owner === storageOwner.current) {
        setStatus('saved');
        setSyncError(null);
      }
    });
    writes.current = task;
    return task.catch((cause: unknown) => {
      if (owner === storageOwner.current) {
        setStatus('error');
        setSyncError(`Não foi possível sincronizar; o rascunho permanece neste navegador: ${workspaceErrorMessage(cause)}`);
      }
      throw cause;
    });
  }, [persistLocal]);

  const persistQuote = useCallback(async (next: QuoteData) => {
    if (!session.current) throw new Error('A sessão ainda não está pronta para salvar.');
    session.current.pending[next.id] = { quote: next, updatedAt: new Date().toISOString() };
    if (session.current.quote.id === next.id) {
      session.current.quote = next;
      setQuoteState(next);
    }
    persistLocal();
    setRecentQuotes((quotes) => [next, ...quotes.filter((saved) => saved.id !== next.id)].slice(0, 500));
    await saveNow();
  }, [persistLocal, saveNow]);

  useEffect(() => {
    if (!ready || !effectiveOwner || !cloudReadable.current) return;
    const sync = () => { void saveNow().catch(() => { /* Error is displayed by saveNow. */ }); };
    const timer = window.setTimeout(sync, 800);
    window.addEventListener('online', sync);
    const onHidden = () => { if (document.visibilityState === 'hidden') sync(); };
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [revision, ready, effectiveOwner, saveNow]);

  const forgetQuote = useCallback((id: string) => {
    if (session.current) delete session.current.pending[id];
    persistLocal();
  }, [persistLocal]);

  return { quote, setQuote, recentQuotes, setRecentQuotes, view, setView, ready, status, error: storageError || syncError, saveNow, persistQuote, forgetQuote };
}
