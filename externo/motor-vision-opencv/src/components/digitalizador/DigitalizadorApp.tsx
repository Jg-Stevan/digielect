"use client";

// ============================================================
// DIGITALIZADOR E-14 — Shell de la aplicación
// Réplica exacta de los diseños Stitch:
//   · Header industrial "CONTROL ACTAS E-14" (Actas/Resumen)
//   · Header brand "REVISIÓN DE ACTA" (lo pinta cada pantalla)
//   · Bottom nav dual: industrial (esquinas rectas) / brand (glow)
//   · Captura inmersiva sin header ni nav
// ============================================================

import { useEffect, useMemo } from "react";
import {
  BarChart3,
  Camera,
  FileText,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDigitalizador } from "@/lib/digitalizador/store";
import { precalentarEscaner } from "@/lib/digitalizador/escaner";
import type { Vista } from "@/lib/digitalizador/types";
import PantallaCaptura from "./PantallaCaptura";
import PantallaRevision from "./PantallaRevision";
import PantallaContingencia from "./PantallaContingencia";
import PantallaExito from "./PantallaExito";
import PantallaControl from "./PantallaControl";
import PantallaResumen from "./PantallaResumen";

type Tab = "escanear" | "actas" | "resumen";

const VISTA_ACTIVA: Record<Vista, Tab> = {
  captura: "escanear",
  revision: "escanear",
  contingencia: "escanear",
  exito: "escanear",
  control: "actas",
  resumen: "resumen",
};

const VISTAS_POR_TAB: Record<Tab, Vista> = {
  escanear: "captura",
  actas: "control",
  resumen: "resumen",
};

export default function DigitalizadorApp() {
  const vista = useDigitalizador((s) => s.vista);
  const enLinea = useDigitalizador((s) => s.enLinea);
  const consulados = useDigitalizador((s) => s.consulados);
  const irA = useDigitalizador((s) => s.irA);
  const cargarDatos = useDigitalizador((s) => s.cargarDatos);

  useEffect(() => {
    void cargarDatos();
    // Precalentar el worker del escáner cuando el navegador esté libre
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const ric = window as Window & { requestIdleCallback: (cb: () => void) => number };
      const id = ric.requestIdleCallback(() => precalentarEscaner());
      return () => {
        if ("cancelIdleCallback" in window) {
          (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(id);
        }
      };
    }
  }, [cargarDatos]);

  const tabActivo = VISTA_ACTIVA[vista];
  const enCaptura = vista === "captura";

  const totalActas = useMemo(
    () => consulados.reduce((n, c) => n + c.mesas.reduce((m, mesa) => m + mesa.actas.length, 0), 0),
    [consulados]
  );

  const tabs: { id: Tab; label: string; labelBrand: string; icono: React.ComponentType<{ className?: string }>; iconoBrand: React.ComponentType<{ className?: string }> }[] = [
    { id: "escanear", label: "ESCANEAR", labelBrand: "Escanear", icono: Camera, iconoBrand: Camera },
    { id: "actas", label: "ACTAS", labelBrand: `Actas (${totalActas})`, icono: FileText, iconoBrand: FileText },
    { id: "resumen", label: "RESUMEN", labelBrand: "Resumen", icono: BarChart3, iconoBrand: LayoutGrid },
  ];

  return (
    <div className="min-h-[100dvh] bg-[#050705]">
      <main className="flex flex-1 items-center justify-center sm:p-6">
        {/* Marco tipo dispositivo (móvil real = pantalla completa) */}
        <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-black sm:h-[min(880px,92vh)] sm:max-w-[430px] sm:rounded-[1.75rem] sm:border sm:border-ink-border sm:shadow-[0_24px_70px_-20px_rgba(0,230,118,0.18)]">
          {/* ===== HEADER INDUSTRIAL (solo Actas / Resumen) ===== */}
          {(vista === "control" || vista === "resumen") && (
            <header className="z-40 flex h-14 shrink-0 items-center justify-between border-b-2 border-ind-outline-variant bg-ind-bg px-4">
              <h1 className="display-industrial text-ind-primary">CONTROL ACTAS E-14</h1>
              <span
                title={enLinea ? "Conectado al servidor central" : "Sin conexión"}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2 py-1",
                  enLinea
                    ? "border-ind-primary/40 bg-ind-primary/10"
                    : "border-warning/50 bg-warning/10"
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    enLinea ? "animate-pulse-sync bg-ind-primary" : "bg-warning"
                  )}
                />
                <span className="label-caps text-[10px] text-ind-on-surface">
                  {enLinea ? "EN LÍNEA" : "OFFLINE"}
                </span>
              </span>
            </header>
          )}

          {/* ===== CONTENIDO ===== */}
          <div className={cn("min-h-0 flex-1", enCaptura ? "overflow-hidden" : "fine-scroll overflow-y-auto")}>
            {vista === "captura" && <PantallaCaptura />}
            {vista === "revision" && <PantallaRevision />}
            {vista === "contingencia" && <PantallaContingencia />}
            {vista === "exito" && <PantallaExito />}
            {vista === "control" && <PantallaControl />}
            {vista === "resumen" && <PantallaResumen />}
          </div>

          {/* ===== BOTTOM NAV (oculto en captura inmersiva) ===== */}
          {!enCaptura && (
            <NavPrincipal
              estilo={tabActivo === "escanear" ? "brand" : "industrial"}
              activo={tabActivo}
              tabs={tabs}
              onIr={(t) => irA(VISTAS_POR_TAB[t])}
            />
          )}
        </div>
      </main>

      {/* Pie (solo escritorio, queda al fondo sin flotar) */}
      <footer className="hidden py-3 text-center text-[11px] text-muted-foreground sm:block">
        Digitalizador E-14 · escáner con recorte automático y filtro B/N adaptativo · validación RN-02 y cola offline
      </footer>
    </div>
  );
}

// ============================================================
// NAV PRINCIPAL — dos estilos según el tab activo (diseños exactos)
// ============================================================

function NavPrincipal({
  estilo,
  activo,
  tabs,
  onIr,
}: {
  estilo: "industrial" | "brand";
  activo: Tab;
  tabs: { id: Tab; label: string; labelBrand: string; icono: React.ComponentType<{ className?: string }>; iconoBrand: React.ComponentType<{ className?: string }> }[];
  onIr: (t: Tab) => void;
}) {
  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        "z-40 shrink-0 pb-[env(safe-area-inset-bottom)]",
        estilo === "industrial"
          ? "flex h-16 items-stretch justify-around border-t-2 border-ind-outline-variant bg-ind-lowest"
          : "flex items-stretch justify-around border-t border-white/10 bg-black/95 backdrop-blur-xl"
      )}
    >
      {tabs.map((t) => {
        const activoTab = activo === t.id;
        const Icono = estilo === "industrial" ? t.icono : t.iconoBrand;
        const label = estilo === "industrial" ? t.label : t.labelBrand;

        if (estilo === "industrial") {
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onIr(t.id)}
              aria-current={activoTab ? "page" : undefined}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-1 transition-colors duration-100",
                activoTab
                  ? "bg-ind-primary text-ind-on-primary"
                  : "text-ind-on-surface-var hover:bg-ind-high"
              )}
            >
              <Icono className="h-5 w-5" />
              <span className="label-caps text-[11px]">{label}</span>
            </button>
          );
        }

        // estilo brand (tab ESCANEAR activo — diseño de revisión)
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onIr(t.id)}
            aria-current={activoTab ? "page" : undefined}
            className={cn(
              "group flex flex-1 flex-col items-center py-1.5 transition-colors",
              activoTab ? "font-bold text-brand-500" : "text-zinc-400 hover:text-white"
            )}
          >
            <span
              className={cn(
                "mb-0.5 flex h-7 w-10 items-center justify-center rounded-lg",
                activoTab ? "border border-brand-500/40 bg-brand-500/20" : ""
              )}
            >
              <Icono className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
