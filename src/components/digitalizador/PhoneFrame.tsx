"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — Marco de teléfono (simulación)
// Notch + barra de estado con reloj en vivo + scroll interno
// + barra de navegación inferior (ESCANEAR / ACTAS / RESUMEN)
// C-15-2-a · capa visual Stitch v2: barra de estado y nav inferior
// industriales (data-mono, ind-lowest/outline-variant, pestaña
// activa como bloque verde sólido con glow).
// ============================================================

import React, { useEffect, useState } from "react";
import { Camera, FileText, LayoutDashboard } from "lucide-react";
import { horaEnZona, zonaHorariaDispositivo, type PwaScreen } from "./shared";
import { useReloj } from "./useReloj";

interface PhoneFrameProps {
  bottomNav?: React.ReactNode;
  children: React.ReactNode;
}

export const PhoneFrame: React.FC<PhoneFrameProps> = ({
  bottomNav,
  children,
}) => {
  // D-06: el reloj del marco usa la zona horaria DEL DISPOSITIVO
  // (antes fijada en "Europe/Rome"). La tz solo existe en cliente:
  // se resuelve tras el montaje para no romper la hidratación.
  // D-22: el tick vive AQUÍ (1 re-render/s del marco, no del árbol).
  const now = useReloj();
  const [hora, setHora] = useState("--:--");
  useEffect(() => {
    setHora(horaEnZona(now, zonaHorariaDispositivo()));
  }, [now]);

  return (
    <div
      className="
        relative w-[390px] max-w-full h-[800px] max-h-[87vh] shrink-0
        rounded-[2.2rem] border-[10px] border-ink-800 bg-ind-bg
        shadow-[0_40px_90px_-24px_rgba(0,0,0,0.85)] overflow-hidden
        flex flex-col select-none
      "
      role="region"
      aria-label="Teléfono simulado de la PWA Digitalizador"
    >
      {/* ---- Barra de estado con notch (estilo industrial: data-mono) ---- */}
      <div className="relative z-20 h-10 shrink-0 bg-ind-lowest bg-scanline border-b border-ind-outline-variant/70 flex items-end justify-between px-6 pb-1">
        <div
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 top-0 w-32 h-[22px] bg-black rounded-b-2xl"
        />
        <span className="data-mono text-[11px] leading-4 text-ind-on-surface tabular-nums" aria-live="off">
          {hora}
        </span>
        <div className="flex items-center gap-1.5" aria-hidden>
          {/* D-06/D-22 pack micro-UX: sin indicadores falsos de wifi ni de
              batería en la maqueta — el estado real de red lo muestran las
              pantallas con navigator.onLine (PantallaControl). */}
          <span className="w-1 h-1 rounded-full bg-ind-primary pulse-dot" />
        </div>
      </div>

      {/* ---- Contenido con scroll interno ---- */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-ind-bg">
        {children}
      </div>

      {/* ---- Navegación inferior (opcional por pantalla) ---- */}
      {bottomNav}

      {/* ---- Home indicator ---- */}
      <div className="shrink-0 h-4 bg-ind-lowest flex items-center justify-center" aria-hidden>
        <div className="w-24 h-1 rounded-full bg-ind-on-surface-var/40" />
      </div>
    </div>
  );
};

// ------------------------------------------------------------
// Barra de navegación inferior de la PWA
// ------------------------------------------------------------

export type NavTab = "escanear" | "actas" | "resumen";

interface BottomNavProps {
  activo: NavTab | null;
  onEscanear: () => void;
  onActas: () => void;
  onResumen: () => void;
}

const TABS: {
  id: NavTab;
  label: string;
  icon: React.ReactNode;
  onClickKey: "onEscanear" | "onActas" | "onResumen";
}[] = [
  { id: "escanear", label: "ESCANEAR", icon: <Camera size={20} aria-hidden />, onClickKey: "onEscanear" },
  { id: "actas", label: "ACTAS", icon: <FileText size={20} aria-hidden />, onClickKey: "onActas" },
  { id: "resumen", label: "RESUMEN", icon: <LayoutDashboard size={20} aria-hidden />, onClickKey: "onResumen" },
];

export const BottomNav: React.FC<BottomNavProps> = ({
  activo,
  onEscanear,
  onActas,
  onResumen,
}) => {
  const handlers: Record<string, () => void> = {
    onEscanear,
    onActas,
    onResumen,
  };
  return (
    <nav
      className="shrink-0 h-16 bg-ind-lowest border-t-2 border-ind-outline-variant grid grid-cols-3"
      aria-label="Navegación principal de la PWA"
    >
      {TABS.map((tab) => {
        const activoTab = activo === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={handlers[tab.onClickKey]}
            aria-current={activoTab ? "page" : undefined}
            className={`
              flex flex-col items-center justify-center gap-1 min-h-[44px] rounded-none
              transition-colors duration-100 ease-linear
              ${
                activoTab
                  ? "bg-ind-primary text-ind-on-primary shadow-glow-pill"
                  : "text-ind-on-surface-var hover:bg-ind-high hover:text-ind-on-surface"
              }
            `}
          >
            {tab.icon}
            <span className="label-caps">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

/** Mapea la pantalla activa a la pestaña resaltada del bottom nav */
export function tabDePantalla(screen: PwaScreen): NavTab | null {
  switch (screen) {
    case "resumen":
      return "resumen";
    case "control":
      return "actas";
    case "captura":
    case "revision":
    case "exito":
    case "contingencia":
      return "escanear";
    default:
      return null;
  }
}
