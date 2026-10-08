"use client";

import React from "react";
import {
  BarChart3,
  BellRing,
  ClipboardCheck,
  FileUp,
  LayoutGrid,
  LogOut,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import type { NavSection } from "@/lib/types";

interface SidebarProps {
  currentSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  anomaliasCount: number;
  onOpenDigitalizador: () => void;
  /** [OLA3 3.1] Cierra la sesión de verdad (mismo handler que el
   *  botón del header): antes este botón mostraba un aviso falso
   *  de "sesión activa" y no hacía nada. */
  onLogout: () => void;
}

const NAV_ITEMS: {
  id: NavSection;
  label: string;
  icon: React.ElementType;
}[] = [
  { id: "monitor-global", label: "MONITOR GLOBAL", icon: LayoutGrid },
  { id: "carga-masiva", label: "CARGA MASIVA", icon: FileUp },
  { id: "centro-notificaciones", label: "CENTRO NOTIFICACIONES", icon: BellRing },
  { id: "generar-informes", label: "GENERAR INFORMES", icon: BarChart3 },
  { id: "revision-anomalias", label: "REVISIÓN DE ANOMALÍAS", icon: ClipboardCheck },
];

/** Lista de navegación (compartida por el aside y el menú móvil) */
export function NavList({
  currentSection,
  onSelectSection,
  anomaliasCount,
  onAfterSelect,
}: {
  currentSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  anomaliasCount: number;
  onAfterSelect?: () => void;
}) {
  return (
    <ul className="flex flex-col flex-grow gap-1" role="list">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const activo = currentSection === item.id;
        return (
          <li
            key={item.id}
            role="button"
            tabIndex={0}
            aria-current={activo ? "page" : undefined}
            onClick={() => {
              onSelectSection(item.id);
              onAfterSelect?.();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectSection(item.id);
                onAfterSelect?.();
              }
            }}
            className={`px-5 py-3 flex flex-col items-start cursor-pointer transition-all border-l-4 ${
              activo
                ? "bg-surface-container-highest text-primary border-primary font-bold"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-transparent"
            }`}
          >
            <div className="flex items-center gap-3 w-full">
              <Icon className="text-primary" size={20} strokeWidth={activo ? 2.4 : 2} />
              <span className="text-label-caps font-label-caps tracking-wider text-[12px]">
                {item.label}
              </span>
            </div>
            {item.id === "revision-anomalias" && anomaliasCount > 0 && (
              <div className="ml-8 mt-1 flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-error bg-error/15 border border-error/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
                  {anomaliasCount} ANOMALÍAS
                </span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentSection,
  onSelectSection,
  anomaliasCount,
  onOpenDigitalizador,
  onLogout,
}) => {
  return (
    <aside className="bg-surface-dim border-r border-outline-variant/30 flex-col h-screen w-64 shrink-0 fixed left-0 top-0 z-30 select-none hidden lg:flex">
      {/* Marca */}
      <button
        className="px-6 pt-6 pb-4 flex items-center gap-3 cursor-pointer group text-left"
        onClick={() => onSelectSection("monitor-global")}
        aria-label="Ir al Monitor Global"
      >
        <ShieldCheck className="text-primary group-hover:scale-105 transition-transform" size={30} />
        <div className="flex flex-col">
          <span className="font-headline-md font-black text-primary text-[22px] tracking-tight leading-none">
            E-14
          </span>
          <span className="text-[9px] text-on-surface-variant tracking-wider leading-tight mt-1 font-label-caps">
            MÓDULO DE MONITOREO Y AUDITORÍA
          </span>
        </div>
      </button>

      {/* Acceso PWA Digitalizador */}
      <div className="px-4 mb-3">
        <button
          onClick={onOpenDigitalizador}
          className="w-full flex items-center gap-2.5 border border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary px-3 py-2.5 transition-all rounded text-label-caps font-label-caps text-[11px] tracking-wider"
        >
          <Smartphone size={16} />
          <span>PWA DIGITALIZADOR</span>
          <span className="ml-auto text-primary/60 text-[9px] font-mono">SIMULAR</span>
        </button>
      </div>

      <div className="px-6 mb-3 mt-2">
        <h2 className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider text-[11px]">
          MÓDULOS PRINCIPALES
        </h2>
      </div>

      <NavList
        currentSection={currentSection}
        onSelectSection={onSelectSection}
        anomaliasCount={anomaliasCount}
      />

      {/* Cerrar sesión — [OLA3 3.1] funcional: mismo handler que el
          botón CERRAR SESIÓN del header (setAuthUsuario(null)). */}
      <div className="mt-auto p-6 border-t border-outline-variant/30">
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 border border-outline-variant/50 py-2.5 hover:bg-surface-container-high hover:border-danger/60 text-on-surface-variant hover:text-danger transition-all rounded text-label-caps font-label-caps text-[11px] tracking-wider"
          aria-label="Cerrar sesión de supervisor"
        >
          <LogOut size={16} aria-hidden="true" />
          <span>CERRAR SESIÓN</span>
        </button>
      </div>
    </aside>
  );
};
