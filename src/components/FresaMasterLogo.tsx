import React from 'react';

interface FresaMasterLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'pdf';
  className?: string;
  theme?: 'dark' | 'light' | 'print';
}

export const FresaMasterLogo: React.FC<FresaMasterLogoProps> = ({
  size = 'md',
  className = '',
  theme = 'dark',
}) => {
  const isPrint = theme === 'print';
  const isLight = theme === 'light';

  // Strict typographic sizing
  const getTypography = () => {
    switch (size) {
      case 'sm':
        return {
          title: 'text-sm font-black tracking-wider',
          sub: 'text-[9px] font-bold tracking-[0.25em]',
          badge: 'text-[9px] px-1.5 py-0.5',
          spacing: 'space-y-0.5',
        };
      case 'lg':
        return {
          title: 'text-lg sm:text-xl font-black tracking-wider',
          sub: 'text-[11px] sm:text-xs font-bold tracking-[0.28em]',
          badge: 'text-[10px] px-2 py-0.5',
          spacing: 'space-y-1',
        };
      case 'xl':
        return {
          title: 'text-2xl font-black tracking-widest',
          sub: 'text-xs font-bold tracking-[0.3em]',
          badge: 'text-xs px-2.5 py-0.5',
          spacing: 'space-y-1',
        };
      case 'pdf':
        return {
          title: 'text-xl font-black tracking-wider',
          sub: 'text-[11px] font-extrabold tracking-[0.28em]',
          badge: 'text-[10px] px-2 py-0.5',
          spacing: 'space-y-1',
        };
      case 'md':
      default:
        return {
          title: 'text-base font-black tracking-wider',
          sub: 'text-[10px] font-bold tracking-[0.25em]',
          badge: 'text-[9px] px-1.5 py-0.5',
          spacing: 'space-y-0.5',
        };
    }
  };

  const style = getTypography();

  const emblemPx = size === 'pdf' ? 72 : size === 'xl' ? 60 : size === 'lg' ? 52 : size === 'sm' ? 38 : 44;

  return (
    <div className={`inline-flex items-center gap-3 select-none ${className}`}>
      <img
        src={`${import.meta.env.BASE_URL}fresa-master-emblem.png`}
        alt="Fresa Master"
        height={emblemPx}
        className="shrink-0 object-contain"
        style={{ height: emblemPx, width: 'auto' }}
      />
      <div className={`inline-flex flex-col ${style.spacing}`}>
      {/* Primary Brand Line: FRESA MASTER */}
      <div className="flex items-center gap-2 leading-none">
        <span
          className={`${style.title} uppercase font-black ${isPrint || isLight ? 'text-slate-950' : 'text-white'}`}
          style={{ letterSpacing: '0.06em' }}
        >
          FRESA MASTER
        </span>
      </div>

      {/* Subtitle: CNC MACHINING */}
      <span
        className={`${style.sub} uppercase ${
          isPrint
            ? 'font-extrabold'
            : 'text-amber-600 dark:text-amber-400'
        }`}
        style={{ letterSpacing: '0.22em', ...(isPrint ? { color: '#92400e' } : {}) }}
      >
        CNC MACHINING
      </span>
      </div>
    </div>
  );
};
