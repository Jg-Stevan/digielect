import React from 'react';
import { NavSection } from '../types';

interface SidebarProps {
  currentSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  anomaliasCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentSection,
  onSelectSection,
  anomaliasCount,
}) => {
  return (
    <aside className="bg-surface-dim border-r border-outline-variant/30 flex flex-col h-screen w-64 shrink-0 fixed left-0 top-0 z-30 select-none">
      {/* Brand Header */}
      <div
        className="px-6 pt-6 pb-4 flex items-center gap-3 cursor-pointer group"
        onClick={() => onSelectSection('monitor-global')}
      >
        <span
          className="material-symbols-outlined text-primary text-[28px] group-hover:scale-105 transition-transform"
          style={{ fontVariationSettings: '"FILL" 1' }}
        >
          admin_panel_settings
        </span>
        <div className="flex flex-col">
          <span className="font-headline-md font-black text-primary text-[22px] tracking-tight leading-none">
            E-14
          </span>
          <span className="text-[9px] text-on-surface-variant tracking-wider leading-tight mt-1 font-label-caps">
            MÓDULO DE MONITOREO Y AUDITORÍA
          </span>
        </div>
      </div>

      <div className="px-6 mb-3 mt-4">
        <h2 className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider text-[11px]">
          MÓDULOS PRINCIPALES
        </h2>
      </div>

      {/* Nav List */}
      <ul className="flex flex-col flex-grow gap-1">
        {/* Monitor Global */}
        <li
          onClick={() => onSelectSection('monitor-global')}
          className={`pl-5 pr-6 py-3 flex items-center gap-3 cursor-pointer transition-all ${
            currentSection === 'monitor-global'
              ? 'bg-surface-container-highest text-primary border-l-4 border-primary font-bold'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-l-4 border-transparent'
          }`}
        >
          <span
            className="material-symbols-outlined text-[20px] text-primary"
            style={{ fontVariationSettings: currentSection === 'monitor-global' ? '"FILL" 1' : '"FILL" 0' }}
          >
            grid_view
          </span>
          <span className="text-label-caps font-label-caps tracking-wider text-[12px]">
            MONITOR GLOBAL
          </span>
        </li>

        {/* Carga Masiva */}
        <li
          onClick={() => onSelectSection('carga-masiva')}
          className={`pl-5 pr-6 py-3 flex items-center gap-3 cursor-pointer transition-all ${
            currentSection === 'carga-masiva'
              ? 'bg-surface-container-highest text-primary border-l-4 border-primary font-bold'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-l-4 border-transparent'
          }`}
        >
          <span
            className="material-symbols-outlined text-[20px] text-primary"
            style={{ fontVariationSettings: currentSection === 'carga-masiva' ? '"FILL" 1' : '"FILL" 0' }}
          >
            upload_file
          </span>
          <span className="text-label-caps font-label-caps tracking-wider text-[12px]">
            CARGA MASIVA
          </span>
        </li>

        {/* Centro Notificaciones */}
        <li
          onClick={() => onSelectSection('centro-notificaciones')}
          className={`pl-5 pr-6 py-3 flex items-center gap-3 cursor-pointer transition-all ${
            currentSection === 'centro-notificaciones'
              ? 'bg-surface-container-highest text-primary border-l-4 border-primary font-bold'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-l-4 border-transparent'
          }`}
        >
          <span
            className="material-symbols-outlined text-[20px] text-primary"
            style={{ fontVariationSettings: currentSection === 'centro-notificaciones' ? '"FILL" 1' : '"FILL" 0' }}
          >
            notification_important
          </span>
          <span className="text-label-caps font-label-caps tracking-wider text-[12px]">
            CENTRO NOTIFICACIONES
          </span>
          <span className="ml-auto text-[10px] font-bold text-secondary-fixed-dim bg-secondary-container/10 border border-secondary-container/20 px-1.5 py-0.5 rounded">
            RESCANEO
          </span>
        </li>

        {/* Generar Informes */}
        <li
          onClick={() => onSelectSection('generar-informes')}
          className={`pl-5 pr-6 py-3 flex items-center gap-3 cursor-pointer transition-all ${
            currentSection === 'generar-informes'
              ? 'bg-surface-container-highest text-primary border-l-4 border-primary font-bold'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-l-4 border-transparent'
          }`}
        >
          <span
            className="material-symbols-outlined text-[20px] text-primary"
            style={{ fontVariationSettings: currentSection === 'generar-informes' ? '"FILL" 1' : '"FILL" 0' }}
          >
            bar_chart
          </span>
          <span className="text-label-caps font-label-caps tracking-wider text-[12px]">
            GENERAR INFORMES
          </span>
        </li>

        {/* Revisión de Anomalías */}
        <li
          onClick={() => onSelectSection('revision-anomalias')}
          className={`pl-5 pr-6 py-3 flex flex-col items-start cursor-pointer transition-all ${
            currentSection === 'revision-anomalias'
              ? 'bg-surface-container-highest text-primary border-l-4 border-primary font-bold'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-l-4 border-transparent'
          }`}
        >
          <div className="flex items-center gap-3 w-full">
            <span
              className="material-symbols-outlined text-[20px] text-primary"
              style={{ fontVariationSettings: currentSection === 'revision-anomalias' ? '"FILL" 1' : '"FILL" 0' }}
            >
              rule
            </span>
            <span className="text-label-caps font-label-caps tracking-wider text-[12px]">
              REVISIÓN DE ANOMALÍAS
            </span>
          </div>
          <div className="ml-8 mt-1 flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-error bg-error/15 border border-error/30 px-1.5 py-0.2 rounded flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>
              {anomaliasCount} ANOMALÍAS
            </span>
          </div>
        </li>
      </ul>

      {/* Logout button */}
      <div className="mt-auto p-6 border-t border-outline-variant/30">
        <button
          onClick={() => {
            alert('Sesión de supervisor activa: ADM-9482 (Estación SIG-04).');
          }}
          className="w-full flex items-center justify-center gap-2 border border-outline-variant/50 py-2.5 hover:bg-surface-container-high hover:border-outline-variant text-on-surface-variant hover:text-on-surface transition-all rounded text-label-caps font-label-caps text-[11px] tracking-wider"
        >
          <span className="material-symbols-outlined text-[16px]">logout</span>
          <span>CERRAR SESIÓN</span>
        </button>
      </div>
    </aside>
  );
};
