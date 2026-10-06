// ============================================================
// DIGIELECT — Insignia de datos/accciones de TEATRO (demo)
//
// Convención transversal del plan de auditoría v3 (reporte
// supervisor v2 §4): toda métrica decorativa o acción simulada
// que aún no tiene backend real debe marcarse SIEMPRE con este
// componente (o con el sufijo textual que expone). El objetivo:
// el supervisor de la jornada NUNCA confunde teatro con datos
// vivos (S-11, S-12, S-16, S-26, S-27, B-21).
//
// Uso:
//   <DemoBadge />                          → "DEMO"
//   <DemoBadge texto="ESTIMADO" />         → "ESTIMADO"
//   <DemoBadge texto="RECONSTRUIDO" />     → bitácora reconstruida
// ============================================================

import { cn } from "@/lib/utils";

interface DemoBadgeProps {
  /** Texto de la insignia (default "DEMO") */
  texto?: string;
  /** Explicación del tooltip (default genérico) */
  motivo?: string;
  className?: string;
}

export function DemoBadge({
  texto = "DEMO",
  motivo = "Dato o acción de demostración: no hay backend real detrás todavía.",
  className,
}: DemoBadgeProps) {
  return (
    <span
      className={cn(
        // Lenguaje visual del repo: etiqueta caps pequeña con borde
        "inline-flex items-center font-label-caps text-[9px] leading-none tracking-wide",
        "border border-warning/60 bg-warning/10 text-warning",
        "rounded-sm px-1 py-[2px] select-none align-middle",
        className
      )}
      title={motivo}
      aria-label={`${texto}: ${motivo}`}
      role="note"
    >
      {texto}
    </span>
  );
}
