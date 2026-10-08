"use client";

import React from "react";
import { CircleUser, Download, Loader2, Menu, Smartphone } from "lucide-react";
import { IS_STATIC_EXPORT } from "@/lib/env";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavList } from "./Sidebar";
import { ShieldCheck } from "lucide-react";
import type { NavSection } from "@/lib/types";

interface HeaderProps {
  onToggleMobileMenu?: () => void;
  onOpenDigitalizador?: () => void;
  currentSection: NavSection;
  onSelectSection: (s: NavSection) => void;
  anomaliasCount: number;
  /** [OLA3 3.12] Estado REAL de la conexión (del bootstrap):
   * antes el pill "ONLINE" estaba hardcodeado y seguía verde tras
   * un "Sin conexión con el servidor". */
  connectionState: "connecting" | "online" | "offline";
  /** [OLA3 3.12] Usuario real con sesión (antes "ADM-9482" fijo) */
  usuario: string;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenDigitalizador,
  currentSection,
  onSelectSection,
  anomaliasCount,
  connectionState,
  usuario,
}) => {
  const [menuAbierto, setMenuAbierto] = React.useState(false);

  return (
    <header className="fixed top-0 left-0 lg:left-64 right-0 h-14 bg-surface-dim/95 backdrop-blur-md border-b border-outline-variant/30 z-20 flex justify-between items-center px-4 sm:px-6">
      {/* Título + menú móvil */}
      <div className="flex items-center gap-3 min-w-0">
        <Sheet open={menuAbierto} onOpenChange={setMenuAbierto}>
          <SheetTrigger asChild>
            <button
              className="text-on-surface-variant hover:bg-surface-container-high p-2 rounded transition-colors lg:hidden"
              aria-label="Abrir menú de navegación"
            >
              <Menu size={22} />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="bg-surface-dim border-r border-outline-variant/30 p-0 w-64 [&>button]:text-on-surface-variant">
            <SheetHeader className="px-6 pt-6 pb-2">
              <SheetTitle className="flex items-center gap-3 text-primary">
                <ShieldCheck size={26} />
                <span className="font-headline-md font-black text-[20px]">E-14</span>
              </SheetTitle>
            </SheetHeader>
            <NavList
              currentSection={currentSection}
              onSelectSection={onSelectSection}
              anomaliasCount={anomaliasCount}
              onAfterSelect={() => setMenuAbierto(false)}
            />
          </SheetContent>
        </Sheet>

        <h1 className="text-headline-md font-headline-md font-bold text-on-surface m-0 tracking-tight text-[14px] sm:text-[16px] uppercase truncate">
          SISTEMA DE MONITOREO ELECTORAL E-14
        </h1>
      </div>

      {/* Estado y perfil */}
      <div className="flex items-center gap-3 sm:gap-6">
        {onOpenDigitalizador && (
          <button
            onClick={onOpenDigitalizador}
            className="hidden md:flex items-center gap-2 border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-full transition-colors"
            title="Simular PWA del digitalizador"
          >
            <Smartphone size={14} />
            <span className="text-label-caps font-label-caps text-[10px] tracking-wider">
              DIGITALIZADOR
            </span>
          </button>
        )}

        {/* Descarga del entregable .zip del proyecto: misma vía que
            el apartado del inicio (la ruta no existe en el build
            estático, por eso se oculta allí). */}
        {!IS_STATIC_EXPORT && (
          <a
            href="/api/descargar-proyecto"
            download
            className="hidden md:flex items-center gap-2 border border-outline-variant/60 bg-surface-container-high text-on-surface-variant hover:text-primary hover:border-primary/40 px-3 py-1.5 rounded-full transition-colors"
            title="Descargar el proyecto completo (.zip)"
          >
            <Download size={14} aria-hidden />
            <span className="text-label-caps font-label-caps text-[10px] tracking-wider">
              PROYECTO .ZIP
            </span>
          </a>
        )}

        {/* [OLA3 3.12] Pill de conexión ligado al estado real del
            bootstrap: ONLINE (verde) / OFFLINE (rojo) / CONECTANDO. */}
        {connectionState === "connecting" ? (
          <div
            className="flex items-center gap-2 bg-surface-container-high border border-outline-variant/50 px-3 py-1 rounded-full"
            role="status"
          >
            <Loader2 size={12} className="animate-spin text-on-surface-variant" aria-hidden />
            <span className="text-label-caps font-label-caps text-on-surface-variant tracking-wider text-[11px]">
              CONECTANDO…
            </span>
          </div>
        ) : connectionState === "offline" ? (
          <div
            className="flex items-center gap-2 bg-error/10 border border-error/50 px-3 py-1 rounded-full"
            role="status"
            aria-live="polite"
          >
            <span className="w-2 h-2 rounded-full bg-error" aria-hidden />
            <span className="text-label-caps font-label-caps text-error tracking-wider text-[11px]">
              OFFLINE
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3 py-1 rounded-full">
            <div className="w-2 h-2 rounded-full bg-primary pulse-dot" />
            <span className="text-label-caps font-label-caps text-primary tracking-wider text-[11px]">
              ONLINE
            </span>
          </div>
        )}

        <div className="hidden sm:flex items-center gap-4 border-l border-outline-variant/40 pl-4 sm:pl-6">
          <div className="text-right leading-tight">
            <div className="text-label-caps font-label-caps text-primary text-[11px] font-bold">
              SUPERVISOR
            </div>
            {/* [OLA3 3.12] Usuario REAL de la sesión (antes el ID falso
                "ADM-9482 · SIG-04" sin relación con authUsuario). */}
            <div className="text-[10px] font-stats-number text-on-surface-variant">
              USUARIO: {usuario ? usuario.toUpperCase() : "—"}
            </div>
          </div>
          <button
            className="text-primary hover:bg-surface-container-high p-1.5 rounded-full transition-colors flex items-center justify-center bg-primary/10 border border-primary/20"
            title={`Perfil del supervisor ${usuario}`}
            aria-label={`Perfil del supervisor ${usuario}`}
          >
            <CircleUser size={24} aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
};
