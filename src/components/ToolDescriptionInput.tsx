import { useLayoutEffect, useRef } from 'react';

interface ToolDescriptionInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function ToolDescriptionInput({ value, onChange }: ToolDescriptionInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

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
    <textarea
      ref={ref}
      aria-label="Descrição completa da ferramenta"
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="block w-full resize-none overflow-hidden whitespace-pre-wrap break-words rounded-md bg-transparent p-1 text-base font-semibold leading-tight text-slate-800 outline-none focus:ring-2 focus:ring-amber-500 dark:text-slate-100 md:text-sm"
    />
  );
}
