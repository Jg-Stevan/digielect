"use client";

import React from "react";
import { CircleUser, Menu, Smartphone } from "lucide-react";
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
}

export const Header: React.FC<HeaderProps> = ({
  onOpenDigitalizador,
  currentSection,
  onSelectSection,
  anomaliasCount,
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

        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3 py-1 rounded-full">
          <div className="w-2 h-2 rounded-full bg-primary pulse-dot" />
          <span className="text-label-caps font-label-caps text-primary tracking-wider text-[11px]">
            ONLINE
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-4 border-l border-outline-variant/40 pl-4 sm:pl-6">
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
            <CircleUser size={24} />
          </button>
        </div>
      </div>
    </header>
  );
};
