"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — RESUMEN DE TRABAJO
// Diseño oficial "digitalizador_resumen_de_trabajo": progreso
// del puesto, KPIs (cola offline / rescanes), historial de
// últimos envíos y botón de sincronización de la cola.
// C-15-2-a · capa visual Stitch v2 (fork motor-vision-opencv):
// superficies ind-container/ind-lowest, números data-mono,
// badges de historial con bordes rectos y acentos verde/ámbar.
// ============================================================

import React, { useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import type { ConsulateRow } from "@/lib/types";
import {
  horaEnZona,
  zonaHorariaDispositivo,
  type SesionStats,
  type EnvioHistorial,
} from "./shared";
import { useReloj } from "./useReloj";
import { ChipMono, IndicadorEnLinea } from "./stitch";

// §4.2.9 — estado online honesto (mismo store que PantallaControl).
function suscribirOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
const onlineCliente = () => navigator.onLine;
const onlineServidor = () => true;

interface PantallaResumenProps {
  stats: SesionStats;
  historial: EnvioHistorial[];
  consulado: ConsulateRow | null;
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
  sincronizando,
  colaOffline,
  onSincronizar,
}) => {
  // D-22: el reloj corre aquí (solo esta pantalla se re-renderiza)
  const now = useReloj();
  // §4.2.9: online honesto · §4.2.10: sin ID hardcodeado (código real del puesto)
  const online = useSyncExternalStore(suscribirOnline, onlineCliente, onlineServidor);
  const progreso = progresoPuesto(consulado);
  const rescanes = rescanesPuesto(consulado);
  // D-06: zona horaria del dispositivo (antes "Europe/Rome" fija)
  const ultimaActividad =
    historial.length > 0
      ? historial[0].hora
      : horaEnZona(now, zonaHorariaDispositivo());

  return (
    <div className="min-h-full flex flex-col gap-4 bg-ind-bg bg-scanline p-4">
      {/* ---- Encabezado (estilo industrial) ---- */}
      <section className="flex justify-between items-end gap-2 border-b-2 border-ind-outline-variant pb-2">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="label-caps text-ind-on-surface-var">
            PUESTO ACTUAL
          </span>
          <h2 className="display-industrial text-ind-on-surface">
            {consulado?.puesto ?? "SIN PUESTO"}
          </h2>
        </div>
        <div className="flex shrink-0 flex-col gap-1 items-end text-right">
          {/* §4.2.9 — online honesto (navigator.onLine) vía componente del diseño */}
          <IndicadorEnLinea enLinea={online} />
          <ChipMono className="border-ind-primary/40 bg-ind-primary/10 text-[15px] text-ind-primary-container">
            {consulado?.code ?? "—"}
          </ChipMono>
        </div>
      </section>

      {/* ---- Progreso del puesto ---- */}
      <div className="rounded-none border-2 border-ind-primary bg-ind-container p-2 flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="font-headline-md text-headline-md text-ind-on-surface">
            PROGRESO DEL PUESTO: {progreso.pct}%
          </span>
        </div>
        <div
          className="w-full bg-ind-variant h-2"
          role="progressbar"
          aria-valuenow={progreso.pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso del puesto"
        >
          <div className="bg-ind-primary h-full" style={{ width: `${progreso.pct}%` }} />
        </div>
        <span className="text-[12px] text-ind-on-surface-var">
          {progreso.total > 0
            ? `Has completado ${progreso.completadas} de ${progreso.total} páginas asignadas hoy.`
            : "Sin páginas asignadas para este puesto."}
        </span>
      </div>

      {/* ---- KPIs (números mono grandes del diseño) ---- */}
      <div className="grid grid-cols-2 gap-1">
        <div className="rounded-none border-2 border-ind-secondary bg-ind-container p-2 flex flex-col gap-1">
          <span className="data-mono text-[28px] leading-none font-semibold text-ind-secondary">
            {String(colaOffline).padStart(2, "0")}
          </span>
          <span className="label-caps text-ind-on-surface-var">
            PENDIENTES EN COLA (OFFLINE)
          </span>
        </div>
        <div className="rounded-none border-2 border-ind-error bg-ind-container p-2 flex flex-col gap-1">
          <span className="data-mono text-[28px] leading-none font-semibold text-ind-error">
            {String(rescanes).padStart(2, "0")}
          </span>
          <span className="label-caps text-ind-on-surface-var">
            SOLICITUD DE RESCANEO
          </span>
        </div>
      </div>

      {/* ---- Historial ---- */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center gap-2">
          <span className="label-caps text-ind-on-surface-var">
            ÚLTIMOS ENVÍOS (HISTORIAL)
          </span>
          <span className="data-mono text-[12px] text-ind-on-surface-var">
            ULT. ACT: {ultimaActividad}
          </span>
        </div>
        {historial.length === 0 ? (
          <div className="rounded-none border-2 border-dashed border-ind-outline-variant bg-ind-lowest p-4 text-center">
            <span className="text-body-md text-[12px] text-ind-on-surface-var">
              Aún no hay envíos en esta sesión.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto fine-scroll">
            {historial.map((h, i) => (
              <div
                key={`${h.mesa}-${i}`}
                className="rounded-none border-2 border-ind-outline-variant bg-ind-container p-2 flex justify-between items-center gap-2"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-headline-md text-[14px] text-ind-on-surface truncate">
                    {h.mesa.toUpperCase()} — {h.tipo === "TRANSMISION" ? "TRANSMISIÓN" : "DELEGADOS"} P{h.pagina}
                  </span>
                  <span className="data-mono text-[10px] text-ind-on-surface-var">
                    {h.hora} · {h.origen}
                    {h.score ? ` · ${h.score}` : ""}
                  </span>
                </div>
                {h.estado === "VALIDADO" ? (
                  <span className="data-mono px-2 py-0.5 border border-ind-primary/60 bg-ind-primary/15 text-ind-primary text-[11px] shrink-0">
                    ENVIADO ✓
                  </span>
                ) : h.estado === "ANOMALIA" ? (
                  <span className="data-mono px-2 py-0.5 border border-ind-secondary/60 bg-ind-secondary/10 text-ind-secondary text-[11px] shrink-0">
                    {h.origen === "EMERGENCIA" ? "EMERGENCIA ⚠️" : "ADVERTENCIA ⚠️"}
                  </span>
                ) : (
                  <span className="data-mono px-2 py-0.5 border border-ind-error/60 bg-ind-error/10 text-ind-error text-[11px] shrink-0">
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
        className="w-full rounded-none bg-ind-primary text-ind-on-primary font-headline-md py-3 min-h-[44px] flex items-center justify-center gap-2 transition-colors hover:bg-ind-primary/90 disabled:opacity-60"
      >
        <RefreshCw size={18} className={sincronizando ? "animate-spin" : ""} aria-hidden />
        {sincronizando
          ? "SINCRONIZANDO…"
          : `SINCRONIZAR COLA PENDIENTE (${String(colaOffline).padStart(2, "0")})`}
      </button>
    </div>
  );
};
