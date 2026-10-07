"use client";

// ============================================================
// DIGITALIZADOR E-14 — Componentes compartidos de la UI
// Estilo industrial (Control / Resumen) + utilidades brand.
// ============================================================

import { useEffect, useState } from "react";
import { Radar, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ESTADO_BADGE, horaBogota } from "@/lib/digitalizador/reglas";

/** Badge de estado de un acta (mono, esquinas rectas) */
export function BadgeEstado({ estado, className }: { estado: string; className?: string }) {
  const badge = ESTADO_BADGE[estado] ?? ESTADO_BADGE.PENDIENTE;
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

/** Indicador EN LÍNEA / SIN CONEXIÓN industrial */
export function IndicadorEnLinea({ enLinea }: { enLinea: boolean }) {
  return (
    <span
      className={cn(
        "label-caps inline-flex items-center gap-1 border px-1.5 py-0.5",
        enLinea
          ? "border-transparent bg-transparent text-ind-primary-container"
          : "border-warning/50 bg-warning/10 text-warning"
      )}
    >
      {enLinea ? (
        <>
          <Radar className="h-3 w-3 animate-pulse" />
          EN LÍNEA
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3" />
          SIN CONEXIÓN
        </>
      )}
    </span>
  );
}

/** Reloj en vivo (hora de Bogotá). Se hidrata tras el mount. */
export function RelojBogota({ className }: { className?: string }) {
  const [hora, setHora] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setHora(horaBogota());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      className={cn("data-mono text-[10px] font-semibold text-ind-on-surface-var", className)}
    >
      {hora ? `BOG ${hora}` : "--:--:--"}
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
