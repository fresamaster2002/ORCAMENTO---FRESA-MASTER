import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, FileSpreadsheet, House, Building, Moon, Sun, Download, Settings, Truck, LogOut } from 'lucide-react';
import { FresaMasterLogo } from './FresaMasterLogo';

interface HeaderProps {
  onOpenApiDocs: () => void;
  onGoHome: () => void;
  onPreviewProposal: () => void;
  onOpenBlingModal: () => void;
  hasItems: boolean;
  isApproved: boolean;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  userEmail?: string;
  onSignOut?: () => void;
  onOpenSandbox?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenApiDocs,
  onGoHome,
  onPreviewProposal,
  onOpenBlingModal,
  hasItems,
  isDarkMode = true,
  onToggleDarkMode,
  userEmail,
  onSignOut,
  onOpenSandbox,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const menuItem =
    'w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-left rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer';

  const corner =
    'inline-flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition cursor-pointer';
  const tab =
    'flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 px-1 sm:px-3 py-1.5 text-[10px] sm:text-xs font-semibold rounded-lg transition cursor-pointer leading-tight bg-transparent text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 focus:outline-none focus:border-[#ff6a00] focus:text-[#ff6a00] focus:shadow-[0_0_0_1px_#ff6a00,0_0_12px_rgba(255,106,0,0.55)] active:border-[#ff6a00]';

  return (
    <>
    <header className="bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-4 pb-3 grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2">
        <div className="flex justify-start">
          {onToggleDarkMode && (
            <button
              id="btn-toggle-dark-mode"
              type="button"
              onClick={onToggleDarkMode}
              title={isDarkMode ? 'Mudar para fundo claro' : 'Mudar para fundo escuro'}
              className={corner}
            >
              {isDarkMode ? <Moon className="w-4 h-4 text-amber-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
            </button>
          )}
        </div>
        <div className="flex justify-center">
          <FresaMasterLogo size="xl" theme={isDarkMode ? 'dark' : 'light'} />
        </div>
        <div className="flex justify-end">
          <div className="relative" ref={menuRef}>
            <button
              id="btn-open-settings"
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              title="Definições"
              className={corner}
            >
              <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-1rem)] p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl z-50">
                {userEmail && (
                  <p className="px-3 py-2 text-[10px] text-slate-500 dark:text-slate-400 truncate border-b border-slate-100 dark:border-slate-800 mb-1">
                    {userEmail}
                  </p>
                )}
                <button
                  id="btn-open-api-docs"
                  type="button"
                  onClick={() => {
                    onOpenApiDocs();
                    setMenuOpen(false);
                  }}
                  className={menuItem}
                >
                  <KeyRound className="w-4 h-4 text-blue-500" />
                  <span>API</span>
                </button>
                <a
                  id="btn-download-project-zip"
                  href="/api/download-project-zip"
                  download="fresa-master-app.zip"
                  onClick={() => setMenuOpen(false)}
                  className={menuItem}
                  title="Baixar projeto completo em ZIP para abrir no VS Code e salvar no GitHub"
                >
                  <Download className="w-4 h-4 text-amber-500" />
                  <span>Backup do projeto (ZIP)</span>
                </a>
                {onSignOut && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onSignOut();
                    }}
                    className={`${menuItem} border-t border-slate-100 dark:border-slate-800 mt-1 rounded-t-none text-rose-600 dark:text-rose-400`}
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sair</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>

      <nav className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-2xl mx-auto px-2 sm:px-6 py-1.5 grid grid-cols-4 gap-1.5">
          <button id="btn-go-home" type="button" onClick={onGoHome} title="Voltar ao início" className={tab}>
            <House className="w-4 h-4" />
            <span>Início</span>
          </button>
          <button id="btn-preview-proposal" type="button" onClick={onPreviewProposal} disabled={!hasItems} className={`${tab} disabled:opacity-40 disabled:cursor-not-allowed`}>
            <FileSpreadsheet className="w-4 h-4" />
            <span>Proposta</span>
          </button>
          <button id="btn-open-bling-modal" type="button" onClick={onOpenBlingModal} className={tab}>
            <Building className="w-4 h-4" />
            <span>Bling</span>
          </button>
          <button id="btn-open-sandbox" type="button" onClick={onOpenSandbox} title="Enviar no sandbox do Melhor Envio" className={tab}>
            <Truck className="w-4 h-4" />
            <span>Sandbox</span>
          </button>
        </div>
      </nav>
    </>
  );
};