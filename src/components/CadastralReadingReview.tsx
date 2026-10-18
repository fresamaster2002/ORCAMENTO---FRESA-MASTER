import { AlertTriangle, FileSearch } from 'lucide-react';
import { cadastralWarnings } from '../cadastralDocument';

export interface ReadingReview {
  warnings: string[];
  evidence: Record<string, string>;
  verification: string;
}

export function readingReview(data: { warnings?: unknown; evidence?: unknown; verification?: unknown }, lookupWarnings: string[] = []): ReadingReview {
  const evidence = data.evidence && typeof data.evidence === 'object' && !Array.isArray(data.evidence)
    ? Object.fromEntries(Object.entries(data.evidence).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && Boolean(entry[1].trim())))
    : {};
  return { warnings: [...new Set([...cadastralWarnings(data.warnings), ...lookupWarnings])], evidence, verification: typeof data.verification === 'string' ? data.verification : '' };
}

const labels: Record<string, string> = {
  name: 'Razão social', tradeName: 'Nome fantasia', document: 'CPF/CNPJ', ie: 'IE', email: 'E-mail fiscal',
  phone: 'Telefone', cep: 'CEP', address: 'Logradouro', number: 'Número', complement: 'Complemento',
  neighborhood: 'Bairro', city: 'Cidade', state: 'UF',
};

export function CadastralReadingReview({ review }: { review: ReadingReview }) {
  return (
    <section aria-label="Conferência da leitura cadastral" className="space-y-3 text-xs">
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700 dark:border-slate-700 dark:text-slate-300">
        <FileSearch className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">{review.verification === 'double-read' ? 'Documento lido em duas passagens' : 'Dados lidos para revisão'}</p>
          <p className="mt-1">Confira com o original. A leitura não confirma a condição fiscal. A consulta pública só complementa a IE ausente quando compatível com o CNPJ e a UF.</p>
        </div>
      </div>
      {review.warnings.length > 0 && (
        <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="mb-2 flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4 shrink-0" />Pontos para conferir</p>
          <ul className="list-disc space-y-1.5 pl-5">{review.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
        </div>
      )}
      {Object.keys(review.evidence).length > 0 && (
        <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <summary className="cursor-pointer font-semibold text-slate-700 dark:text-slate-200">Ver trechos usados na leitura</summary>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(review.evidence).filter(([field]) => field in labels).map(([field, evidence]) => (
              <div key={field} className="min-w-0 rounded-lg bg-slate-50 p-2">
                <dt className="font-semibold text-slate-500">{labels[field]}</dt>
                <dd className="mt-1 whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">{evidence}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-slate-500">Trechos transcritos pela IA, não uma validação independente. Uma IE completada em consulta pública pode não constar no documento.</p>
        </details>
      )}
    </section>
  );
}
