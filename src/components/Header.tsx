import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, FileSpreadsheet, RefreshCw, Building, Moon, Sun, Download, Settings, LogOut, ChevronDown } from 'lucide-react';
import { FresaMasterLogo } from './FresaMasterLogo';

interface HeaderProps {
  onOpenApiDocs: () => void;
  onNewQuote: () => void;
  onPreviewProposal: () => void;
  onOpenBlingModal: () => void;
  hasItems: boolean;
  isApproved: boolean;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  userEmail?: string;
  onSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenApiDocs,
  onNewQuote,
  onPreviewProposal,
  onOpenBlingModal,
  hasItems,
  isDarkMode = true,
  onToggleDarkMode,
  userEmail,
  onSignOut,
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

  return (
    <>
    <header className="bg-white dark:bg-slate-900">
      <div className="max-w-7xl mx-auto px-4 pt-5 pb-4 flex justify-center">
        <FresaMasterLogo size="xl" theme={isDarkMode ? 'dark' : 'light'} />
      </div>
    </header>

      <nav className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 flex items-center justify-center gap-2 flex-wrap">
          <button
            id="btn-reset-quote"
            type="button"
            onClick={onNewQuote}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer border border-slate-200 dark:border-slate-700"
            title="Iniciar novo orçamento"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Novo</span>
          </button>

          <button
            id="btn-preview-proposal"
            type="button"
            onClick={onPreviewProposal}
            disabled={!hasItems}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer ${
              hasItems
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed border border-slate-200 dark:border-slate-700'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Gerar Proposta</span>
          </button>

          <button
            id="btn-open-bling-modal"
            type="button"
            onClick={onOpenBlingModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition cursor-pointer shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Building className="w-4 h-4 text-emerald-200" />
            <span>Bling ERP</span>
          </button>

          <div className="relative" ref={menuRef}>
            <button
              id="btn-open-settings"
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer border border-slate-200 dark:border-slate-700"
            >
              <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <span>Definições</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto mt-2 w-64 max-w-[calc(100vw-1.5rem)] p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl z-50">
                {userEmail && (
                  <p className="px-3 py-2 text-[10px] text-slate-500 dark:text-slate-400 truncate border-b border-slate-100 dark:border-slate-800 mb-1">
                    {userEmail}
                  </p>
                )}
                {onToggleDarkMode && (
                  <button
                    id="btn-toggle-dark-mode"
                    type="button"
                    onClick={() => {
                      onToggleDarkMode();
                      setMenuOpen(false);
                    }}
                    className={menuItem}
                  >
                    {isDarkMode ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-amber-500" />}
                    <span>{isDarkMode ? 'Mudar para fundo claro' : 'Mudar para fundo escuro'}</span>
                  </button>
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
      </nav>
    </>
  );
};