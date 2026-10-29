import { useState } from 'react';

interface Props {
  nfeId: string | number;
  orderId: string | number;
  token: string;
  disabled?: boolean;
}

export function DanfeDownloadButton({ nfeId, orderId, token, disabled }: Props) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    if (downloading || disabled) return;
    setDownloading(true);
    setError(null);
    try {
      const { downloadDanfePdf } = await import('../danfePdf');
      await downloadDanfePdf(nfeId, orderId, token);
    } catch (failure) {
      console.error('Download do DANFE:', failure);
      setError(failure instanceof Error ? failure.message : 'Não foi possível baixar o PDF. Tente novamente.');
    } finally {
      setDownloading(false);
    }
  };
  return <div className="space-y-1">
    <button type="button" onClick={download} disabled={disabled || downloading} className="border rounded-lg px-3 py-2 text-sm disabled:opacity-50">
      {downloading ? 'Preparando PDF A4...' : 'Baixar DANFE em PDF A4'}
    </button>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
