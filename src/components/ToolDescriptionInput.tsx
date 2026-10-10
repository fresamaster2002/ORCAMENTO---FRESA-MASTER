import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ToolDescriptionInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function ToolDescriptionInput({ value, onChange }: ToolDescriptionInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(value);
  const titleId = useId();
  const inputId = useId();

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const resize = () => {
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight}px`;
    };
    resize();
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) {
        width = element.clientWidth;
        resize();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [value]);

  return (
    <>
      <button
        type="button"
        aria-label={`Ver e editar descrição: ${value || 'Ferramenta sem descrição'}`}
        aria-haspopup="dialog"
        onClick={() => { setDraft(value); dialogRef.current?.showModal(); }}
        className="block min-h-11 w-full rounded-md p-1 text-left text-sm font-normal leading-5 text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-slate-100 md:hidden"
      >
        <span className="line-clamp-2 break-words">{value || 'Toque para informar a descrição'}</span>
      </button>
      <textarea
        ref={ref}
        aria-label="Descrição completa da ferramenta"
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="hidden w-full resize-none overflow-hidden whitespace-pre-wrap break-words rounded-md bg-transparent p-1 text-sm font-normal leading-5 text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 dark:text-slate-100 md:block"
      />
      {createPortal(
        <dialog
          ref={dialogRef}
          aria-labelledby={titleId}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              dialogRef.current?.close();
            }
          }}
          className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-xl backdrop:bg-slate-950/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <h3 id={titleId} className="mb-4 text-base font-semibold">Descrição da ferramenta</h3>
          <label htmlFor={inputId} className="mb-2 block text-sm text-slate-600 dark:text-slate-300">Nome completo</label>
          <textarea
            id={inputId}
            rows={5}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="w-full resize-y rounded-lg border border-slate-300 bg-transparent p-3 text-base font-normal leading-6 outline-none focus:ring-2 focus:ring-amber-500 dark:border-slate-600"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => dialogRef.current?.close()} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm dark:border-slate-600">Cancelar</button>
            <button type="button" onClick={() => { onChange(draft); dialogRef.current?.close(); }} className="min-h-11 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-slate-950">Salvar descrição</button>
          </div>
        </dialog>,
        document.body,
      )}
    </>
  );
}
