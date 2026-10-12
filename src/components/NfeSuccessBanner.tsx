import { CheckCircle2 } from 'lucide-react';

export function NfeSuccessBanner({ situation, number, series }: { situation?: number | null; number?: string | null; series?: number | null }) {
  if (situation !== 5) return null;
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4 text-emerald-950">
      <CheckCircle2 aria-hidden="true" className="h-7 w-7 shrink-0 text-emerald-600" />
      <div>
        <p className="text-base font-bold">NF-e emitida com sucesso!</p>
        <p className="text-sm">Autorizada pela SEFAZ{number ? ` • Nº ${number}` : ''}{series != null ? ` • Série ${series}` : ''}.</p>
        <p className="mt-1 text-xs">Não é necessário emitir novamente. Você já pode abrir o DANFE e compartilhar a nota.</p>
      </div>
    </div>
  );
}
