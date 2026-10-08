"use client";

// ============================================================
// DIGIELECT · SALUD DEL SISTEMA — PICO DE CIERRE
// Panel de capacidad de ingesta frente a la ola de cierres:
//  · Cada puesto consular cierra 16:00 HORA LOCAL; con los
//    offsets UTC reales (67 países) se calcula cuántos puestos
//    y mesas cierran por hora UTC a lo largo de la jornada.
//  · Throughput estimado (4 páginas por mesa), utilización
//    frente a la capacidad declarada, latencia y cola de la
//    ingesta (simulación determinística derivada de la carga
//    de cada instante — sin datos aleatorios).
//  · Arquitectura de picos: ingesta asíncrona encolada con ack
//    inmediato, workers de análisis escalables horizontalmente
//    y escrituras por lotes (ver README).
// ============================================================

import React, { useEffect, useMemo, useState } from "react";
import { Activity, Clock4, Gauge, Zap } from "lucide-react";
import type { ConsulateRow } from "@/lib/types";
import { COT_OFFSET_MIN, offsetZoneMin, zonaIanaDePuesto } from "@/lib/hora-zona";
import { DemoBadge } from "./DemoBadge";

/** Capacidad declarada de ingesta (actas/min sostenidos) */
const CAPACIDAD_ACTAS_MIN = 480;
/** Páginas E-14 esperadas por mesa: Delegados P1/P2 + Transmisión P1/P2 */
const PAGINAS_POR_MESA = 4;
// [S-38] COT_OFFSET_MIN vive en hora-zona.ts (única fuente); ya NO se
// duplica un "+5" con signo invertido en la etiqueta COT.

interface BucketCierre {
  horaUTC: number;
  puestos: number;
  mesas: number;
}

function calcularBuckets(consulates: ConsulateRow[]): BucketCierre[] {
  const ahora = new Date();
  const buckets = new Map<number, BucketCierre>();
  for (const c of consulates) {
    // [B-11/S-38] Offset UTC del país desde la zona IANA (DST vigente),
    // NO desde el utcOffsetMin estático del seed ni de una suma propia:
    // la misma fuente que el monitor → los relojes COINCIDEN.
    // [OLA6-TZ · 6.8] Zona por CIUDAD (V-5): el `puesto` lleva el
    // standName completo, así que "04 - San Francisco - Denver" cierra
    // a las 16:00 de Denver (Mountain), no de Nueva York (Eastern) —
    // este cálculo alimenta "PUESTOS CERRANDO AHORA".
    const offsetUTC = offsetZoneMin(ahora, zonaIanaDePuesto(c.pais, c.puesto));
    const raw = c.horaCierreLocalRaw ?? "16:00";
    const partes = raw.split(":");
    const h = parseInt(partes[0] ?? "", 10);
    const m = parseInt(partes[1] ?? "", 10);
    const cierreLocal = (Number.isFinite(h) ? h : 16) * 60 + (Number.isFinite(m) ? m : 0);
    const cierreUTC = cierreLocal - offsetUTC;
    const hora = ((Math.floor(cierreUTC / 60) % 24) + 24) % 24;
    const b = buckets.get(hora) ?? { horaUTC: hora, puestos: 0, mesas: 0 };
    b.puestos += 1;
    b.mesas += c.numMesas;
    buckets.set(hora, b);
  }
  return [...buckets.values()].sort((a, b) => a.horaUTC - b.horaUTC);
}

function hhmm(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

interface MetricaProps {
  icon: React.ReactNode;
  label: string;
  valor: string;
  sub: string;
  colorClases?: string;
  /** [OLA3 3.4] Insignia opcional para métricas derivadas de
   *  simulación (latencia/cola no tienen telemetría real). */
  badge?: { texto: string; motivo: string };
}

const Metrica: React.FC<MetricaProps> = ({
  icon,
  label,
  valor,
  sub,
  colorClases,
  badge,
}) => (
  <div className="border border-outline-variant bg-surface-container-highest/60 px-3 py-2.5 rounded-sm flex flex-col gap-1 min-w-0">
    <span className="font-label-caps text-label-caps text-on-surface-variant flex items-center gap-1.5 truncate">
      {icon}
      {label}
      {badge && <DemoBadge texto={badge.texto} motivo={badge.motivo} />}
    </span>
    <span
      className={`font-stats-number text-[22px] leading-6 tabular-nums ${
        colorClases ?? "text-on-surface"
      }`}
    >
      {valor}
    </span>
    <span className="font-label-caps text-[9px] text-on-surface-variant truncate">
      {sub}
    </span>
  </div>
);

export function SaludSistema({ consulates }: { consulates: ConsulateRow[] }) {
  // Reloj en vivo (re-evalúa métricas cada 30 s)
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const buckets = useMemo(() => calcularBuckets(consulates), [consulates]);

  const totalMesas = useMemo(
    () => consulates.reduce((acc, c) => acc + c.numMesas, 0),
    [consulates]
  );

  const ahoraHoraUTC = now.getUTCHours();
  const bucketAhora = buckets.find((b) => b.horaUTC === ahoraHoraUTC) ?? null;
  const pico = buckets.reduce<BucketCierre | null>(
    (max, b) => (!max || b.mesas > max.mesas ? b : max),
    null
  );

  const mesasAhora = bucketAhora?.mesas ?? 0;
  const puestosAhora = bucketAhora?.puestos ?? 0;
  const actasMinAhora = (mesasAhora * PAGINAS_POR_MESA) / 60;
  const actasMinPico = ((pico?.mesas ?? 0) * PAGINAS_POR_MESA) / 60;
  const utilizacion =
    CAPACIDAD_ACTAS_MIN > 0 ? actasMinAhora / CAPACIDAD_ACTAS_MIN : 0;

  // Simulación determinística de infraestructura (derivada de la carga)
  const latenciaP99 = 140 + Math.round(Math.min(utilizacion, 1.4) * 620);
  const colaIngesta = Math.round(mesasAhora * 0.42);

  const salud =
    utilizacion < 0.35
      ? { label: "SALUDABLE", clases: "text-success border-success/50 bg-success/10" }
      : utilizacion < 0.7
        ? { label: "CARGA MEDIA", clases: "text-warning border-warning/50 bg-warning/10" }
        : { label: "PICO CRÍTICO", clases: "text-error border-error/50 bg-error/10" };

  const maxMesas = Math.max(1, ...buckets.map((b) => b.mesas));

  return (
    <section
      aria-labelledby="salud-sistema-title"
      className="border border-outline-variant bg-surface-container rounded-sm p-4 sm:p-5 flex flex-col gap-4 mb-4"
    >
      {/* ---- Encabezado ---- */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <Activity size={18} className="text-primary shrink-0" aria-hidden />
          <div className="min-w-0">
            <h2
              id="salud-sistema-title"
              className="font-headline-md text-headline-md text-on-surface truncate"
            >
              SALUD DEL SISTEMA · PICO DE CIERRE
            </h2>
            <p className="font-label-caps text-label-caps text-on-surface-variant">
              CAPACIDAD DE INGESTA FRENTE A LA OLA DE CIERRES 16:00 LOCAL
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`font-label-caps text-label-caps border px-2 py-1 rounded-sm ${salud.clases}`}
          >
            {salud.label}
          </span>
          <span className="font-label-caps text-[10px] text-on-surface-variant border border-outline-variant/60 px-2 py-1 rounded-sm">
            {totalMesas.toLocaleString("es-CO")} MESAS ·{" "}
            {(totalMesas * PAGINAS_POR_MESA).toLocaleString("es-CO")} PÁGINAS E-14
          </span>
        </div>
      </div>

      {/* ---- Métricas ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Metrica
          icon={<Clock4 size={12} aria-hidden />}
          label="PUESTOS CERRANDO AHORA"
          valor={`${puestosAhora}`}
          sub={`${mesasAhora.toLocaleString("es-CO")} mesas · ${hhmm(ahoraHoraUTC * 60)} UTC`}
        />
        <Metrica
          icon={<Zap size={12} aria-hidden />}
          label="THROUGHPUT ESTIMADO"
          valor={`${actasMinAhora.toFixed(1)}`}
          sub="ACTAS/MIN DURANTE LA OLA ACTUAL"
          colorClases={utilizacion >= 0.7 ? "text-error" : utilizacion >= 0.35 ? "text-warning" : "text-success"}
        />
        {/* [OLA3 3.4 / A-3 AN-2] Latencia y cola son una simulación
            determinística derivada de la carga (no hay telemetría
            real de infraestructura en esta build) → DemoBadge
            "ESTIMADO" (misma convención que el Servidor OCR). */}
        <Metrica
          icon={<Gauge size={12} aria-hidden />}
          label="LATENCIA P99 INGESTA"
          valor={`${latenciaP99} ms`}
          sub={`COLA: ${colaIngesta} ACTAS · ACK INMEDIATO`}
          badge={{
            texto: "ESTIMADO",
            motivo:
              "Latencia y cola se derivan de la carga del instante (simulación determinística): no hay telemetría real de infraestructura en esta build.",
          }}
        />
        <Metrica
          icon={<Activity size={12} aria-hidden />}
          label="UTILIZACIÓN vs CAPACIDAD"
          valor={`${Math.round(utilizacion * 100)}%`}
          sub={`CAP. ${CAPACIDAD_ACTAS_MIN} ACTAS/MIN · ${
            pico ? `PICO ${hhmm(pico.horaUTC * 60)} UTC` : "—"
          }`}
        />
      </div>

      {/* ---- Gráfico: mesas que cierran por hora UTC ---- */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="font-label-caps text-label-caps text-on-surface-variant">
            MESAS CERRANDO POR HORA (UTC · JORNADA COMPLETA)
          </span>
          {pico && (
            <span className="font-stats-number text-[10px] text-on-surface-variant">
              {/* [S-38] COT derivado de COT_OFFSET_MIN (antes: "+5" con
                  signo invertido — mostraba 19:00 COT por un 14:00 UTC). */}
              PICO MÁXIMO {hhmm(pico.horaUTC * 60)} UTC ({pico.horaUTC * 60 + COT_OFFSET_MIN < 0 ? "-1d " : ""}
              {hhmm(pico.horaUTC * 60 + COT_OFFSET_MIN)} COT) · {pico.puestos} PUESTOS ·{" "}
              {actasMinPico.toFixed(0)} ACTAS/MIN
            </span>
          )}
        </div>
        <div
          className="flex items-end gap-[3px] h-24 border-b border-outline-variant pb-0"
          role="img"
          aria-label={`Gráfico de barras de mesas que cierran por hora UTC. Pico de ${pico?.mesas ?? 0} mesas a las ${
            pico ? hhmm(pico.horaUTC * 60) : ""
          } UTC.`}
        >
          {Array.from({ length: 24 }, (_, h) => {
            const b = buckets.find((x) => x.horaUTC === h);
            const altura = b ? Math.max(4, Math.round((b.mesas / maxMesas) * 100)) : 2;
            const esAhora = h === ahoraHoraUTC;
            return (
              <div key={h} className="flex-1 flex flex-col justify-end items-center h-full">
                <div
                  className={`w-full rounded-t-[1px] transition-all ${
                    esAhora
                      ? "bg-primary"
                      : b
                        ? "bg-secondary-fixed-dim/70"
                        : "bg-outline-variant/40"
                  }`}
                  style={{ height: `${altura}%` }}
                  title={
                    b
                      ? `${hhmm(h * 60)} UTC · ${b.puestos} puestos · ${b.mesas.toLocaleString("es-CO")} mesas`
                      : `${hhmm(h * 60)} UTC · sin cierres`
                  }
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-[3px]">
          {Array.from({ length: 24 }, (_, h) => (
            <span
              key={h}
              className={`flex-1 text-center font-stats-number text-[8px] tabular-nums ${
                h === ahoraHoraUTC ? "text-primary" : "text-on-surface-variant/70"
              }`}
            >
              {h % 3 === 0 ? String(h).padStart(2, "0") : "·"}
            </span>
          ))}
        </div>
      </div>

      {/* ---- Nota de arquitectura ---- */}
      <p className="font-label-caps text-[10px] text-on-surface-variant leading-relaxed border-t border-outline-variant/60 pt-2.5">
        ARQUITECTURA PARA PICOS: INGESTA ASÍNCRONA ENCOLADA (ACK INMEDIATO AL
        DIGITALIZADOR) · WORKERS DE ANÁLISIS ESCALABLES HORIZONTALMENTE ·
        ESCRITURAS POR LOTES · CAPACIDAD {CAPACIDAD_ACTAS_MIN} ACTAS/MIN ≈{" "}
        {actasMinPico > 0 ? Math.round(CAPACIDAD_ACTAS_MIN / actasMinPico) : "∞"}× EL
        PICO ESTIMADO DEL CIERRE EXTERIOR
      </p>
    </section>
  );
}
