"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — Componentes de diseño Stitch v2
// C-15: port del diseño del fork externo del usuario
// (externo/motor-vision-opencv · rama feature/motor-vision-opencv).
// Sólo presentación: NO contiene lógica de negocio. Los valores
// de estado/online SIEMPRE los decide el llamador (datos veraces).
// ============================================================

import { Radar, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mapa estado → estilo del badge (diseño industrial, esquinas rectas) */
const ESTADO_STITCH: Record<string, { label: string; clase: string }> = {
  VALIDADO: {
    label: "VALIDADO",
    clase: "border-brand-500/60 bg-brand-500/15 text-brand-400",
  },
  AUTO: {
    label: "AUTO",
    clase: "border-brand-500/60 bg-brand-500/15 text-brand-400",
  },
  ANOMALIA: {
    label: "ANOMALÍA",
    clase: "border-ind-secondary/60 bg-ind-secondary/10 text-ind-secondary",
  },
  ADVERTENCIA: {
    label: "ADVERTENCIA",
    clase: "border-ind-secondary/60 bg-ind-secondary/10 text-ind-secondary",
  },
  RECHAZADO: {
    label: "RECHAZADO",
    clase: "border-destructive/60 bg-destructive/10 text-destructive",
  },
  PENDIENTE: {
    label: "PENDIENTE",
    clase: "border-ind-outline-variant bg-ind-variant/60 text-ind-on-surface-var",
  },
};

/** Badge de estado de un acta (mono, esquinas rectas — diseño Stitch) */
export function BadgeEstado({
  estado,
  className,
}: {
  estado: string;
  className?: string;
}) {
  const badge = ESTADO_STITCH[estado] ?? ESTADO_STITCH.PENDIENTE;
  return (
    <span
      className={cn(
        "data-mono inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-semibold leading-none",
        badge.clase,
        className
      )}
    >
      {badge.label}
    </span>
  );
}

/** Indicador EN LÍNEA / SIN CONEXIÓN industrial (radar pulsante) */
export function IndicadorEnLinea({
  enLinea,
  className,
}: {
  enLinea: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "label-caps inline-flex items-center gap-1 border border-transparent px-1.5 py-0.5",
        enLinea
          ? "bg-transparent text-ind-primary-container"
          : "border-ind-secondary/50 bg-ind-secondary/10 text-ind-secondary",
        className
      )}
      role="status"
    >
      {enLinea ? (
        <>
          <Radar className="h-3 w-3 animate-pulse" aria-hidden />
          EN LÍNEA
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3" aria-hidden />
          SIN CONEXIÓN
        </>
      )}
    </span>
  );
}

/** Chip mono industrial (esquinas rectas, borde 1px) */
export function ChipMono({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "data-mono inline-flex items-center gap-1 border border-ind-outline-variant bg-ind-variant px-1.5 py-0.5 text-[10px] font-semibold text-ind-on-surface-var",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Chip de datos del visor (estilo brand: fondo negro/60 con borde) */
export function ChipHud({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "data-mono inline-flex items-center gap-1 rounded border border-white/20 bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Encabezado industrial de pantalla (label-caps + display) */
export function TituloIndustrial({
  label,
  titulo,
  acciones,
  className,
}: {
  label?: string;
  titulo: string;
  acciones?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("bg-scanline px-4 pt-safe pb-3", className)}>
      {label ? (
        <p className="label-caps text-ind-on-surface-var">{label}</p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <h2 className="display-industrial text-brand-500">{titulo}</h2>
        {acciones}
      </div>
    </header>
  );
}
