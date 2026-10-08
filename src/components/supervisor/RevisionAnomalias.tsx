"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CircleHelp,
  ClipboardCheck,
  MapPinOff,
  RefreshCw,
  Search,
  Timer,
  X,
  XCircle,
} from "lucide-react";
import type { AnomaliaItem, TipoAnomalia } from "@/lib/types";
import {
  RESTANTE_ADVERTENCIA_MIN,
  RESTANTE_CRITICO_MIN,
  SLA_MINUTOS,
  deltaSlaMin,
  etiquetaSla,
  pctSlaRestante,
  urgenciaSla,
} from "@/lib/sla";

interface RevisionAnomaliasProps {
  anomalias: AnomaliaItem[];
  onResolveAnomalia: (anomalia: AnomaliaItem) => void;
}

type FiltroTipo = "TODAS" | TipoAnomalia;

interface TipoMeta {
  chipLabel: string;
  badgeLabel: string;
  icon: React.ElementType;
  badgeClasses: string;
  barraLateral: string;
}

/** Colores por tipo de anomalía (RF-2.2) */
const TIPO_META: Record<TipoAnomalia, TipoMeta> = {
  SIN_FIRMAS: {
    chipLabel: "Sin Firmas",
    badgeLabel: "SIN FIRMAS DETECTADAS",
    icon: AlertTriangle,
    badgeClasses: "bg-orange-500/10 border-orange-500/40 text-orange-400",
    barraLateral: "bg-orange-500",
  },
  ILEGIBLE_RESCANEO: {
    chipLabel: "Ilegibles",
    badgeLabel: "SOLICITUD RESCANEO",
    icon: XCircle,
    badgeClasses: "bg-warning/10 border-warning/40 text-warning",
    barraLateral: "bg-warning",
  },
  CODIGO_NO_DETECTADO: {
    chipLabel: "Código no detectado",
    badgeLabel: "CÓDIGO NO DETECTADO",
    icon: CircleHelp,
    badgeClasses:
      "bg-on-surface-variant/10 border-outline-variant/50 text-on-surface-variant",
    barraLateral: "bg-on-surface-variant",
  },
  /** [post-4.4] Violeta distintivo: ni naranja (firmas) ni ámbar
   *  (ilegible) ni gris (código) — la causa es de INTEGRIDAD de
   *  ubicación, no de calidad de la imagen. */
  UBICACION_DISCREPANTE: {
    chipLabel: "Ubicación",
    badgeLabel: "UBICACIÓN DISCREPANTE",
    icon: MapPinOff,
    badgeClasses: "bg-purple-500/10 border-purple-500/40 text-purple-400",
    barraLateral: "bg-purple-500",
  },
};

/** Color de urgencia del SLA — [OLA3 3.6] fuente única lib/sla.ts
 *  (umbrales 20/45 derivados de SLA_MINUTOS; antes hardcode en esta
 *  pantalla, incoherente con las fases 40/60/120 del Centro de
 *  Notificaciones). */

const FILTROS: { key: FiltroTipo; label: string; icon?: React.ElementType }[] = [
  { key: "TODAS", label: "Todas" },
  { key: "SIN_FIRMAS", label: "Sin Firmas", icon: AlertTriangle },
  { key: "ILEGIBLE_RESCANEO", label: "Ilegibles", icon: XCircle },
  { key: "CODIGO_NO_DETECTADO", label: "Código no detectado", icon: CircleHelp },
  { key: "UBICACION_DISCREPANTE", label: "Ubicación", icon: MapPinOff },
];

export const RevisionAnomalias: React.FC<RevisionAnomaliasProps> = ({
  anomalias,
  onResolveAnomalia,
}) => {
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("TODAS");
  const [busqueda, setBusqueda] = useState("");

  // [OLA3 3.6 / A-1 AN-2] Reloj de 30 s: el SLA restante se computa
  // en CADA render desde createdAt + SLA_MINUTOS. Antes
  // slaMinutesRemaining era un número persistido congelado (40 del
  // seed): contadores, barras y el orden "por urgencia" nunca
  // cambiaban aunque pasara una hora.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const conteoPorTipo = useMemo(() => {
    return anomalias.reduce<Record<string, number>>((acc, a) => {
      acc[a.tipoAnomalia] = (acc[a.tipoAnomalia] ?? 0) + 1;
      return acc;
    }, {});
  }, [anomalias]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return anomalias
      .filter((a) => filtroTipo === "TODAS" || a.tipoAnomalia === filtroTipo)
      .filter((a) => {
        if (!q) return true;
        const texto = `${a.pais} ${a.ciudad} ${a.mesa} ${a.formulario} ${a.tipoLabel} ${a.mesaIdRef}`;
        return texto.toLowerCase().includes(q);
      })
      .map((item) => {
        // [OLA3 3.6] SLA VIVO: createdAt + SLA_MINUTOS − ahora. Sin
        // createdAt (fixture estático de la demo) se usa el valor
        // plano del servidor (congelado, como todo el fixture).
        const delta = item.createdAt
          ? deltaSlaMin(item.createdAt, now)
          : item.slaMinutesRemaining;
        return {
          item,
          delta,
          label: item.createdAt ? etiquetaSla(delta) : item.slaDisplay,
        };
      })
      // Prioridad: menor SLA restante primero (más urgente/vencida)
      .sort((a, b) => a.delta - b.delta);
  }, [anomalias, filtroTipo, busqueda, now]);

  return (
    <div className="flex flex-col w-full max-w-[1440px] mx-auto gap-5 pb-8">
      {/* ============ HEADER ============ */}
      <header className="flex flex-col gap-3 border-b border-outline-variant/40 pb-5">
        <div className="flex flex-wrap items-center gap-4">
          <AlertTriangle size={30} className="text-danger" aria-hidden="true" />
          <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight uppercase">
            Revisión de Anomalías
          </h1>
          <div className="ml-auto flex items-center gap-3">
            <span
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-sm border border-danger/40 bg-danger/10 text-danger font-label-caps text-[11px] uppercase tracking-wider"
              aria-live="polite"
            >
              <span className="font-stats-number text-[14px] font-bold">
                {anomalias.length}
              </span>
              anomalía{anomalias.length === 1 ? "" : "s"} abierta
              {anomalias.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
          Bandeja de entrada centralizada para incidentes detectados
          automáticamente por el sistema de visión artificial o reportados
          manualmente. Requiere acción inmediata del supervisor de
          digitalización.
        </p>
      </header>

      {/* ============ FILTROS + BÚSQUEDA ============ */}
      {/* [OLA5 estilos] Bordes claros en TODOS los tabs (antes los
          inactivos parecían texto plano sin affordance de clic —
          hallazgo VLM) y un divisor que conecta filtros con búsqueda. */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div
          className="flex items-center gap-2 overflow-x-auto pb-1 flex-1"
          role="group"
          aria-label="Filtrar anomalías por tipo"
        >
          {FILTROS.map(({ key, label, icon: Icono }) => {
            const activo = filtroTipo === key;
            const conteo =
              key === "TODAS"
                ? anomalias.length
                : (conteoPorTipo[key] ?? 0);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFiltroTipo(key)}
                aria-pressed={activo}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-sm font-label-caps text-label-caps tracking-wider whitespace-nowrap transition-all border ${
                  activo
                    ? "bg-primary/15 text-primary border-primary/60 font-bold shadow-[inset_0_-2px_0_0_var(--color-primary)]"
                    : "bg-surface-container text-on-surface-variant border-outline-variant/70 hover:border-primary/50 hover:text-on-surface hover:bg-surface-container-high/60"
                }`}
              >
                {Icono && <Icono size={14} aria-hidden="true" />}
                <span className="uppercase">{label}</span>
                <span
                  className={`font-stats-number text-[11px] rounded-full px-1.5 ${
                    activo ? "bg-primary/20 text-primary" : "opacity-80"
                  }`}
                >
                  ({conteo})
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-72 shrink-0">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant/70 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar país, ciudad, mesa…"
            aria-label="Buscar anomalía por país, ciudad, mesa o formulario"
            className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-sm pl-8 pr-8 py-2 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60 outline-none focus:border-primary/60 transition-colors"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface transition-colors"
              aria-label="Limpiar búsqueda"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ============ BANDEJA DE INCIDENTES ============ */}
      <div className="bg-surface-container-low border border-outline-variant/40 rounded-sm overflow-hidden flex flex-col">
        {/* Encabezado de columnas */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 bg-surface-container border-b border-outline-variant/40 font-label-caps text-label-caps text-on-surface-variant uppercase">
          <div className="col-span-2">Hora Alerta</div>
          <div className="col-span-3">Ubicación</div>
          <div className="col-span-2">Formulario</div>
          <div className="col-span-2">Tipo de Anomalía</div>
          <div className="col-span-1 text-right">SLA</div>
          <div className="col-span-2 text-right">Acción</div>
        </div>

        {/* Lista con scroll (regla de listas largas) — [OLA5 estilos]
            filas cebra: en una tabla ancha de 6 columnas el ojo pierde
            la fila sin fondo alterno (hallazgo VLM). */}
        {filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-on-surface-variant">
            <ClipboardCheck
              size={34}
              className="text-on-surface-variant/40"
              aria-hidden="true"
            />
            <p className="font-label-caps text-label-caps uppercase tracking-wider">
              No hay anomalías que coincidan con el filtro
            </p>
            <p className="font-body-md text-body-md">
              {filtroTipo !== "TODAS" || busqueda
                ? "Ajusta los filtros o la búsqueda para ver más resultados."
                : "La bandeja de incidentes está despejada."}
            </p>
          </div>
        ) : (
          <ul className="max-h-96 overflow-y-auto flex flex-col divide-y divide-outline-variant/30">
            {filtradas.map(({ item, delta, label }, idx) => {
              const meta = TIPO_META[item.tipoAnomalia];
              const IconoTipo = meta.icon;
              const urgencia = urgenciaSla(delta);
              // Cuenta visual: ventana completa del SLA desde lib/sla
              const pctRestante = pctSlaRestante(delta);
              return (
                <li
                  key={item.id}
                  className={`relative transition-colors group ${
                    idx % 2 === 1
                      ? "bg-surface-container-low/60 hover:bg-surface-container-high/70"
                      : "bg-surface hover:bg-surface-container-high/60"
                  }`}
                >
                  {/* Barra lateral de severidad */}
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-1 ${meta.barraLateral} opacity-90`}
                    aria-hidden="true"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 px-4 md:px-5 md:pl-6 py-4 items-center">
                    {/* Hora alerta (local + Colombia, mono) */}
                    <div className="md:col-span-2 flex flex-col">
                      <span className="font-stats-number text-[13px] text-on-surface font-semibold">
                        {item.horaAlertaLocal}
                      </span>
                      <span className="font-stats-number text-[11px] text-on-surface-variant">
                        {item.horaAlertaCol}
                      </span>
                    </div>

                    {/* Ubicación */}
                    <div className="md:col-span-3 flex flex-col">
                      <span className="font-headline-md text-[14px] text-on-surface font-bold">
                        {item.pais} &gt; {item.ciudad}
                      </span>
                      <span className="font-stats-number text-[11px] text-on-surface-variant">
                        {item.mesa}
                      </span>
                    </div>

                    {/* Formulario */}
                    <div className="md:col-span-2">
                      <span className="font-body-md text-[12px] text-on-surface">
                        {item.formulario}
                      </span>
                    </div>

                    {/* Tipo de anomalía */}
                    <div className="md:col-span-2">
                      <div
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-sm border ${meta.badgeClasses}`}
                      >
                        <IconoTipo size={13} aria-hidden="true" />
                        <span className="font-label-caps text-[9px] tracking-widest font-bold">
                          {item.tipoLabel || meta.badgeLabel}
                        </span>
                      </div>
                    </div>

                    {/* SLA restante + cuenta visual */}
                    <div className="md:col-span-1 flex md:flex-col items-center md:items-end gap-1.5 md:gap-1">
                      <div className="flex items-center gap-1.5">
                        <Timer
                          size={15}
                          className={urgencia.icono}
                          aria-hidden="true"
                        />
                        <span
                          className={`font-stats-number text-[13px] font-bold ${urgencia.texto}`}
                        >
                          {label}
                        </span>
                      </div>
                      <div
                        className="w-16 h-1 bg-surface-container-high rounded-full overflow-hidden hidden md:block"
                        role="img"
                        aria-label={`Tiempo SLA restante: ${label}`}
                      >
                        <div
                          className={`h-full rounded-full ${urgencia.barra}`}
                          style={{ width: `${pctRestante}%` }}
                        />
                      </div>
                    </div>

                    {/* Acción — [OLA5 estilos] whitespace-nowrap: antes el
                        texto del botón se partía en 2 líneas desalineando
                        la columna (hallazgo VLM). */}
                    <div className="md:col-span-2 md:text-right">
                      <button
                        type="button"
                        onClick={() => onResolveAnomalia(item)}
                        className="w-full md:w-auto inline-flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-fixed text-on-primary font-label-caps text-label-caps px-4 py-2 rounded-sm transition-colors uppercase tracking-wider group-hover:shadow-md group-hover:shadow-primary/10 font-bold whitespace-nowrap"
                        aria-label={`Revisar y resolver anomalía: ${item.tipoLabel || meta.badgeLabel} en ${item.ciudad}, ${item.mesa}`}
                      >
                        <ClipboardCheck size={14} aria-hidden="true" />
                        Revisar y resolver
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Footer */}
        <div className="px-5 py-3 bg-surface-container border-t border-outline-variant/40 flex flex-wrap items-center justify-between gap-2">
          <span className="font-body-md text-[11px] text-on-surface-variant flex items-center gap-1.5">
            <RefreshCw size={11} className="text-primary" aria-hidden="true" />
            Mostrando {filtradas.length} de {anomalias.length} anomalías ·
            ordenadas por urgencia SLA (ventana {SLA_MINUTOS} min, reloj 30 s)
          </span>
          {filtradas.length > 0 && (
            <span className="font-stats-number text-[11px] text-on-surface-variant">
              CRÍTICAS &lt; {RESTANTE_CRITICO_MIN} MIN · ADVERTENCIA &lt;{" "}
              {RESTANTE_ADVERTENCIA_MIN} MIN
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
