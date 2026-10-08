// ============================================================
// DIGIELECT — Fuente ÚNICA de umbrales SLA (OLA3 · 3.6)
//
// Antes de este módulo coexistían 3 escalas incoherentes:
//  · RevisionAnomalias: urgencia por restante 20/45 min (hardcode)
//  · CentroNotificaciones: fases de mora 0-40 / 40-60 / >2h (texto)
//  · ConfigSlaModal: defectos 40/60/120 (literales sueltos)
// Todas las pantallas beben de aquí para que los textos y los
// umbrales de color digan lo mismo en todo el supervisor.
// ============================================================

/** Ventana total (min) para resolver una anomalía desde su creación */
export const SLA_MINUTOS = 60;

/** Fases de escalamiento por mora post-cierre (minutos, RN-06) */
export const FASES_SLA = [
  { fase: 1, min: 40 },
  { fase: 2, min: 60 },
  { fase: 3, min: 120 },
] as const;

/** Umbrales de urgencia por tiempo RESTANTE (bandeja de anomalías) */
export const RESTANTE_CRITICO_MIN = Math.round(SLA_MINUTOS / 3); // 20
export const RESTANTE_ADVERTENCIA_MIN = Math.round(SLA_MINUTOS * 0.75); // 45

/**
 * Delta SLA de una anomalía en minutos: positivos = minutos que
 * QUEDAN de la ventana; 0 o negativos = minutos EXCEDIDOS tras el
 * vencimiento. Se computa en render (reloj vivo, OLA3 3.6) desde
 * createdAt + SLA_MINUTOS — el valor persistido
 * slaMinutesRemaining era un número congelado que ningún job
 * decrementaba.
 */
export function deltaSlaMin(
  createdAtIso: string,
  ahora: number = Date.now()
): number {
  const deadline = new Date(createdAtIso).getTime() + SLA_MINUTOS * 60_000;
  return Math.ceil((deadline - ahora) / 60_000);
}

/** Etiqueta del tiempo restante/excedido: "45m" · "1h 05m" · "VENCIDA +2h 03m" */
export function etiquetaSla(deltaMin: number): string {
  if (deltaMin > 0) {
    if (deltaMin < 60) return `${deltaMin}m`;
    const h = Math.floor(deltaMin / 60);
    const m = deltaMin % 60;
    return `${h}h ${String(m).padStart(2, "0")}m`;
  }
  const excedidos = Math.abs(deltaMin);
  const h = Math.floor(excedidos / 60);
  const m = excedidos % 60;
  return h > 0 ? `VENCIDA +${h}h ${String(m).padStart(2, "0")}m` : `VENCIDA +${m}m`;
}

/** Urgencia visual por tiempo restante (bandeja de anomalías) */
export function urgenciaSla(deltaMin: number): {
  texto: string;
  icono: string;
  barra: string;
} {
  // Vencida (<=0) o por vencer (<RESTANTE_CRITICO_MIN) en rojo
  if (deltaMin < RESTANTE_CRITICO_MIN)
    return {
      texto: "text-danger",
      icono: "text-danger animate-pulse",
      barra: "bg-danger",
    };
  if (deltaMin < RESTANTE_ADVERTENCIA_MIN)
    return { texto: "text-warning", icono: "text-warning", barra: "bg-warning" };
  return { texto: "text-primary", icono: "text-primary", barra: "bg-primary" };
}

/** Porcentaje de ventana restante para la barra visual (0-100) */
export function pctSlaRestante(deltaMin: number): number {
  return Math.max(0, Math.min(100, Math.round((deltaMin / SLA_MINUTOS) * 100)));
}

/** Leyenda de fases de mora (CentroNotificaciones · una sola fuente) */
export const LEYENDA_FASES = {
  f1: `F1 0-${FASES_SLA[0].min}m tolerancia`,
  f2: `F2 ${FASES_SLA[0].min}-${FASES_SLA[1].min}m advertencia`,
  f3: `F3 >${FASES_SLA[2].min}m crítica`,
} as const;

/** Títulos de las tarjetas KPI por fase (CentroNotificaciones) */
export const TITULO_FASES = {
  f1: `Fase 1 · Tolerancia (0-${FASES_SLA[0].min} min)`,
  f2: `Fase 2 · Advertencia (${FASES_SLA[0].min}-${FASES_SLA[1].min} min)`,
  f3: `Fase 3 · Mora crítica (> ${FASES_SLA[2].min} min)`,
} as const;
