import React from 'react';

interface HeaderProps {
  onToggleMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileMenu }) => {
  return (
    <header className="fixed top-0 left-64 right-0 h-14 bg-surface-dim/95 backdrop-blur-md border-b border-outline-variant/30 z-20 flex justify-between items-center px-6">
      {/* Title */}
      <div className="flex items-center gap-4">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="text-on-surface-variant hover:bg-surface-container-high p-1 rounded transition-colors block md:hidden"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
        )}
        <div className="flex items-center gap-3">
          <h1 className="text-headline-md font-headline-md font-bold text-on-surface m-0 tracking-tight text-[16px] uppercase">
            SISTEMA DE MONITOREO ELECTORAL E-14
          </h1>
        </div>
      </div>

      {/* Status & Profile */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3 py-1 rounded-full">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
          <span className="text-label-caps font-label-caps text-primary tracking-wider text-[11px]">
            ONLINE
          </span>
        </div>

        <div className="flex items-center gap-4 border-l border-outline-variant/40 pl-6">
          <div className="text-right leading-tight">
            <div className="text-label-caps font-label-caps text-primary text-[11px] font-bold">
              SUPERVISOR
            </div>
            <div className="text-[10px] font-stats-number text-on-surface-variant">
              ID: ADM-9482 · SIG-04
            </div>
          </div>
          <button
            className="text-primary hover:bg-surface-container-high p-1.5 rounded-full transition-colors flex items-center justify-center bg-primary/10 border border-primary/20"
            title="Supervisor ADM-9482"
          >
            <span
              className="material-symbols-outlined text-[24px]"
              style={{ fontVariationSettings: '"FILL" 1' }}
            >
              account_circle
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
