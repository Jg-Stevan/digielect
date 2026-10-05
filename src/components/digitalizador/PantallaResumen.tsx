"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — RESUMEN DE TRABAJO
// Diseño oficial "digitalizador_resumen_de_trabajo": progreso
// del puesto, KPIs (cola offline / rescanes), historial de
// últimos envíos y botón de sincronización de la cola.
// ============================================================

import React from "react";
import { Radar, RefreshCw } from "lucide-react";
import type { ConsulateRow } from "@/lib/types";
import { horaEnZona, type SesionStats, type EnvioHistorial } from "./shared";

interface PantallaResumenProps {
  stats: SesionStats;
  historial: EnvioHistorial[];
  consulado: ConsulateRow | null;
  now: Date;
  sincronizando: boolean;
  /** Actas validadas en el dispositivo pendientes de sincronizar (IndexedDB) */
  colaOffline: number;
  onSincronizar: () => void;
}

/** Progreso del puesto: páginas confirmadas / (mesas × 4 páginas) */
function progresoPuesto(consulado: ConsulateRow | null): {
  pct: number;
  completadas: number;
  total: number;
} {
  if (!consulado || consulado.mesas.length === 0) return { pct: 0, completadas: 0, total: 0 };
  let ok = 0;
  for (const mesa of consulado.mesas) {
    if (mesa.delegados.p1 === true) ok++;
    if (mesa.delegados.p2 === true) ok++;
    if (mesa.transmision.p1 === true) ok++;
    if (mesa.transmision.p2 === true) ok++;
  }
  const total = consulado.mesas.length * 4;
  return { pct: Math.round((ok / total) * 100), completadas: ok, total };
}

function rescanesPuesto(consulado: ConsulateRow | null): number {
  if (!consulado) return 0;
  let n = 0;
  for (const mesa of consulado.mesas) {
    if (mesa.delegados.p1 === "rescaneo") n++;
    if (mesa.delegados.p2 === "rescaneo") n++;
    if (mesa.transmision.p1 === "rescaneo") n++;
    if (mesa.transmision.p2 === "rescaneo") n++;
  }
  return n;
}

export const PantallaResumen: React.FC<PantallaResumenProps> = ({
  stats,
  historial,
  consulado,
  now,
  sincronizando,
  colaOffline,
  onSincronizar,
}) => {
  const progreso = progresoPuesto(consulado);
  const rescanes = rescanesPuesto(consulado);
  const ultimaActividad =
    historial.length > 0 ? historial[0].hora : horaEnZona(now, "Europe/Rome");

  return (
    <div className="min-h-full flex flex-col gap-4 p-4">
      {/* ---- Encabezado ---- */}
      <section className="flex justify-between items-end border-b-2 border-outline-variant pb-2">
        <div className="flex flex-col gap-1">
          <span className="font-label-caps text-label-caps text-on-surface-variant">
            PUESTO ACTUAL
          </span>
          <h2 className="font-headline-md text-headline-md text-on-surface uppercase">
            {consulado?.puesto ?? "SIN PUESTO"}
          </h2>
        </div>
        <div className="flex flex-col gap-1 items-end text-right">
          <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-1">
            <Radar size={12} className="text-primary animate-pulse" aria-hidden />
            EN LÍNEA
          </span>
          <span className="font-stats-number text-stats-number text-primary">ID: #A92-F</span>
        </div>
      </section>

      {/* ---- Progreso del puesto ---- */}
      <div className="bg-surface-container border-2 border-primary p-2 flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="font-headline-md text-[18px] text-on-surface">
            PROGRESO DEL PUESTO: {progreso.pct}%
          </span>
        </div>
        <div
          className="w-full bg-surface-variant h-2"
          role="progressbar"
          aria-valuenow={progreso.pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso del puesto"
        >
          <div className="bg-primary h-full" style={{ width: `${progreso.pct}%` }} />
        </div>
        <span className="text-body-sm text-[12px] text-on-surface-variant">
          {progreso.total > 0
            ? `Has completado ${progreso.completadas} de ${progreso.total} páginas asignadas hoy.`
            : "Sin páginas asignadas para este puesto."}
        </span>
      </div>

      {/* ---- KPIs ---- */}
      <div className="grid grid-cols-2 gap-1">
        <div className="bg-surface-container border-2 border-secondary p-2 flex flex-col gap-1">
          <span className="font-stats-number text-[28px] text-secondary">
            {String(colaOffline).padStart(2, "0")}
          </span>
          <span className="font-label-caps text-[11px] text-on-surface-variant">
            PENDIENTES EN COLA (OFFLINE)
          </span>
        </div>
        <div className="bg-surface-container border-2 border-error p-2 flex flex-col gap-1">
          <span className="font-stats-number text-[28px] text-error">
            {String(rescanes).padStart(2, "0")}
          </span>
          <span className="font-label-caps text-[11px] text-on-surface-variant">
            SOLICITUD DE RESCANEO
          </span>
        </div>
      </div>

      {/* ---- Historial ---- */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="font-label-caps text-label-caps text-on-surface-variant">
            ÚLTIMOS ENVÍOS (HISTORIAL)
          </span>
          <span className="font-stats-number text-[12px] text-on-surface-variant">
            ULT. ACT: {ultimaActividad}
          </span>
        </div>
        {historial.length === 0 ? (
          <div className="bg-surface-container border-2 border-outline-variant p-2 text-center">
            <span className="text-body-md text-[12px] text-on-surface-variant">
              Aún no hay envíos en esta sesión.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto no-scrollbar">
            {historial.map((h, i) => (
              <div
                key={`${h.mesa}-${i}`}
                className="bg-surface-container border-2 border-outline-variant p-2 flex justify-between items-center gap-2"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-headline-md text-[14px] text-on-surface truncate">
                    {h.mesa.toUpperCase()} — {h.tipo === "TRANSMISION" ? "TRANSMISIÓN" : "DELEGADOS"} P{h.pagina}
                  </span>
                  <span className="font-stats-number text-[10px] text-on-surface-variant">
                    {h.hora} · {h.origen}
                    {h.score ? ` · ${h.score}` : ""}
                  </span>
                </div>
                {h.estado === "VALIDADO" ? (
                  <span className="px-2 py-0.5 bg-primary/20 text-primary font-stats-number text-[11px] shrink-0">
                    ENVIADO ✓
                  </span>
                ) : h.estado === "ANOMALIA" ? (
                  <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 font-stats-number text-[11px] shrink-0">
                    {h.origen === "EMERGENCIA" ? "EMERGENCIA ⚠️" : "ADVERTENCIA ⚠️"}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-error/20 text-error font-stats-number text-[11px] shrink-0">
                    RESCANEO REQUERIDO ⚠️
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---- Sincronización ---- */}
      <button
        type="button"
        onClick={onSincronizar}
        disabled={sincronizando}
        className="w-full bg-primary text-on-primary font-headline-md py-3 flex items-center justify-center gap-2 disabled:opacity-60"
      >
        <RefreshCw size={18} className={sincronizando ? "animate-spin" : ""} aria-hidden />
        {sincronizando
          ? "SINCRONIZANDO…"
          : `SINCRONIZAR COLA PENDIENTE (${String(colaOffline).padStart(2, "0")})`}
      </button>
    </div>
  );
};
