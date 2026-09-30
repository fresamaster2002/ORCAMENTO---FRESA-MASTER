import React from 'react';
import { KeyRound, FileSpreadsheet, RefreshCw, Building, Moon, Sun, Download } from 'lucide-react';
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
}

export const Header: React.FC<HeaderProps> = ({
  onOpenApiDocs,
  onNewQuote,
  onPreviewProposal,
  onOpenBlingModal,
  hasItems,
  isApproved,
  isDarkMode = true,
  onToggleDarkMode,
}) => {
  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FresaMasterLogo size="lg" theme={isDarkMode ? 'dark' : 'light'} />
          <div className="hidden md:block pl-3 border-l border-slate-200 dark:border-slate-800">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              Router CNC & Bling ERP
            </span>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Cotação Melhor Envio & Pedidos de Venda
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
          {/* Dark / Light Mode Toggle */}
          {onToggleDarkMode && (
            <button
              id="btn-toggle-dark-mode"
              type="button"
              onClick={onToggleDarkMode}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition cursor-pointer border border-slate-200 dark:border-slate-700"
              title={isDarkMode ? 'Mudar para Fundo Claro' : 'Mudar para Fundo Escuro'}
            >
              {isDarkMode ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Fundo Escuro</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden sm:inline">Fundo Claro</span>
                </>
              )}
            </button>
          )}

          <a
            id="btn-download-project-zip"
            href="/api/download-project-zip"
            download="fresa-master-app.zip"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 transition cursor-pointer shadow-xs"
            title="Baixar projeto completo em ZIP para abrir no VS Code e salvar no GitHub"
          >
            <Download className="w-3.5 h-3.5 text-slate-950" />
            <span className="inline">Baixar ZIP (VS Code)</span>
          </a>

          <button
            id="btn-open-bling-modal"
            type="button"
            onClick={onOpenBlingModal}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-black rounded-xl transition cursor-pointer shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Building className="w-4 h-4 text-emerald-200" />
            <span>Bling ERP</span>
          </button>

          <button
            id="btn-preview-proposal"
            type="button"
            onClick={onPreviewProposal}
            disabled={!hasItems}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition cursor-pointer ${
              hasItems
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed border border-slate-200 dark:border-slate-700'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Gerar Proposta</span>
          </button>

          <button
            id="btn-open-api-docs"
            type="button"
            onClick={onOpenApiDocs}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer border border-slate-200 dark:border-slate-700"
          >
            <KeyRound className="w-3.5 h-3.5 text-blue-500" />
            <span className="hidden md:inline">API</span>
          </button>

          <button
            id="btn-reset-quote"
            type="button"
            onClick={onNewQuote}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer border border-slate-200 dark:border-slate-700"
            title="Iniciar novo orçamento"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Novo</span>
          </button>

        </div>
      </div>
    </header>
  );
};
