import { useEffect, useRef, useState } from 'react';

interface Props {
  nfeId: string | number;
  orderId: string | number;
  token: string;
  disabled?: boolean;
}

export function DanfeDownloadButton({ nfeId, orderId, token, disabled }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [ready, setReady] = useState<{ file: File; url: string } | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  useEffect(() => {
    generation.current += 1;
    locked.current = false;
    setReady(null);
    setDownloading(false);
    setError(null);
    return () => { generation.current += 1; };
  }, [nfeId, orderId, token]);
  useEffect(() => () => { if (ready) URL.revokeObjectURL(ready.url); }, [ready]);
  const download = async () => {
    if (locked.current || disabled) return;
    locked.current = true;
    const currentGeneration = generation.current;
    setDownloading(true);
    setError(null);
    try {
      const { prepareDanfePdf } = await import('../danfePdf');
      const file = await prepareDanfePdf(nfeId, orderId, token, message => {
        if (generation.current === currentGeneration) setProgress(message);
      });
      if (generation.current !== currentGeneration) return;
      setReady({ file, url: URL.createObjectURL(file) });
    } catch (failure) {
      console.error('Download do DANFE:', failure);
      if (generation.current === currentGeneration) setError(failure instanceof Error ? failure.message : 'Não foi possível baixar o PDF. Tente novamente.');
    } finally {
      if (generation.current === currentGeneration) {
        setDownloading(false);
        locked.current = false;
      }
    }
  };
  const share = async () => {
    if (!ready) return;
    setError(null);
    try {
      await navigator.share({ files: [ready.file], title: ready.file.name });
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') return;
      console.error('Compartilhamento do PDF:', failure);
      setError('Não foi possível compartilhar o arquivo. Use Salvar PDF ou Abrir PDF pronto abaixo.');
    }
  };
  return <div className="space-y-1">
    {!ready && <button type="button" onClick={download} disabled={disabled || downloading} className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50">
      {downloading ? progress || 'Preparando PDF A4...' : 'Baixar DANFE em PDF A4'}
    </button>}
    {downloading && <p role="status" className="text-xs">Mantenha o app aberto. Ao concluir, toque em Salvar PDF.</p>}
    {ready && <div className="space-y-2">
      <p role="status" className="text-sm font-semibold">PDF A4 pronto. Escolha como salvar ou enviar:</p>
      <div className="flex flex-wrap gap-2">
        <a href={ready.url} download={ready.file.name} className="border rounded-lg px-3 py-2 text-sm font-bold">Salvar PDF</a>
        <a href={ready.url} target="_blank" rel="noopener noreferrer" className="border rounded-lg px-3 py-2 text-sm">Abrir PDF pronto</a>
        {navigator.canShare?.({ files: [ready.file] }) && <button type="button" onClick={share} className="border rounded-lg px-3 py-2 text-sm">Compartilhar arquivo PDF</button>}
      </div>
      <p className="text-xs break-all">{ready.file.name}</p>
      <p className="text-xs">Se o celular abrir uma prévia em vez de baixar, use Compartilhar e Salvar em Arquivos no visualizador.</p>
    </div>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
