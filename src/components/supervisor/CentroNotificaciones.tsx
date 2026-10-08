"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BadgeCheck,
  BellRing,
  Clock,
  Download,
  History,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquare,
  Phone,
  Settings,
  Table,
  TrendingUp,
} from "lucide-react";
import type { NotifChannel, SlaFase, SlaRegion, SlaRow } from "@/lib/types";
import { LEYENDA_FASES, TITULO_FASES } from "@/lib/sla";
import { DemoBadge } from "./DemoBadge";

interface CentroNotificacionesProps {
  slaRows: SlaRow[];
  onOpenWhatsApp: (name: string) => void;
  onOpenHistorial: (row: SlaRow) => void;
  onOpenConfigSla: () => void;
  onExportReport: () => void;
  /** [OLA3 3.7] Refresco de datos (mismo refetch del botón REFRESCAR):
   *  lo invoca el polling de 30 s para que "SLA ENGINE: EN VIVO (30s)"
   *  sea verdad (antes el indicador era puramente decorativo). */
  onRefresh: () => void;
}

type RegionFilter = "all" | SlaRegion;

/** Chips de filtro por región (RN-06 · matriz de mora por puesto) */
const REGION_CHIPS: { key: RegionFilter; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "europa", label: "Europa" },
  { key: "america", label: "América" },
  { key: "asia", label: "Asia" },
  { key: "africa", label: "África" },
  { key: "oceania", label: "Oceanía" },
];

/** UI por fase de escalamiento SLA (F1 verde / F2 amarillo / F3 rojo) */
const FASE_UI: Record<
  SlaFase,
  { label: string; badge: string; dot: string; time: string; edge: string }
> = {
  fase1: {
    label: "FASE 1 · TOLERANCIA",
    badge: "bg-primary/10 text-primary border-primary/40",
    dot: "bg-primary",
    time: "bg-primary/10 border-primary/40 text-primary",
    edge: "border-l-primary",
  },
  fase2: {
    label: "FASE 2 · ADVERTENCIA",
    badge: "bg-warning/15 text-warning border-warning/40",
    dot: "bg-warning",
    time: "bg-warning/10 border-warning/40 text-warning",
    edge: "border-l-warning",
  },
  fase3: {
    label: "FASE 3 · CRÍTICA",
    badge: "bg-danger/15 text-danger border-danger/40",
    dot: "bg-danger animate-pulse",
    time: "bg-danger/10 border-danger/40 text-danger",
    edge: "border-l-danger",
  },
};

// [OLA7 · M-3 AN-2] Fallback defensivo: si la BD/API entrega una fase o
// canal fuera del union (dato corrupto, deploy parcial), la tabla NO
// crashea con "Cannot read properties of undefined" — cae al neutro y
// el ErrorBoundary global queda como última línea.
const FASE_FALLBACK: (typeof FASE_UI)[SlaFase] = {
  label: "FASE ·",
  badge: "bg-surface-container-high/60 text-on-surface-variant border-outline-variant/40",
  dot: "bg-on-surface-variant",
  time: "bg-surface-container-high/60 border-outline-variant/40 text-on-surface-variant",
  edge: "border-l-outline-variant",
};
const CANAL_FALLBACK: (typeof CHANNEL_UI)[NotifChannel] = {
  icon: MessageSquare,
  label: "—",
  cls: "bg-surface-container-high/60 text-on-surface-variant border-outline-variant/40",
};

/** UI por canal de notificación (WA / SMS / EMAIL) */
const CHANNEL_UI: Record<
  NotifChannel,
  { icon: LucideIcon; label: string; cls: string }
> = {
  WA: {
    icon: MessageCircle,
    label: "WA",
    cls: "bg-whatsapp/15 text-whatsapp border-whatsapp/40",
  },
  SMS: {
    icon: MessageSquare,
    label: "SMS",
    cls: "bg-surface-container-highest text-on-surface-variant border-outline-variant/40",
  },
  EMAIL: {
    icon: Mail,
    label: "EMAIL",
    cls: "bg-secondary-fixed-dim/10 text-secondary-fixed-dim border-secondary-fixed-dim/40",
  },
};

export const CentroNotificaciones: React.FC<CentroNotificacionesProps> = ({
  slaRows,
  onOpenWhatsApp,
  onOpenHistorial,
  onOpenConfigSla,
  onExportReport,
  onRefresh,
}) => {
  const [region, setRegion] = useState<RegionFilter>("all");
  // [S-26] El toast distingue acción REAL de acción de teatro (demo):
  // CORREO/TELÉFONO no tienen backend — se marcan, nunca se simulan como
  // enviados con éxito limpio.
  const [toast, setToast] = useState<{ mensaje: string; demo: boolean } | null>(
    null
  );
  const toastTimer = useRef<number | null>(null);

  // Limpieza del temporizador del toast al desmontar
  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  // [OLA3 3.7 / A-2 AN-2] POLLING REAL de 30 s: el claim "SLA ENGINE:
  //  EN VIVO (30s)" ahora es verdad — refresca los datos igual que el
  //  botón REFRESCAR del header (solo con la pestaña visible, con
  //  cleanup correcto). Antes no existía ningún intervalo.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") onRefresh();
    }, 30_000);
    return () => window.clearInterval(t);
  }, [onRefresh]);

  const showToast = (message: string, demo = false) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ mensaje: message, demo });
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  };

  /** Métricas de fases calculadas sobre los datos reales de SLA */
  const stats = useMemo(() => {
    const porFase = (f: SlaFase) => slaRows.filter((r) => r.fase === f).length;
    const totalMesas = slaRows.reduce(
      (acc, r) => acc + r.mesasInactivas.length,
      0
    );
    const moraPromedio = slaRows.length
      ? Math.round(
          slaRows.reduce((acc, r) => acc + r.tiempoTranscurridoMin, 0) /
            slaRows.length
        )
      : 0;
    return {
      f1: porFase("fase1"),
      f2: porFase("fase2"),
      f3: porFase("fase3"),
      totalMesas,
      moraPromedio,
    };
  }, [slaRows]);

  const regionCount = (key: RegionFilter) =>
    key === "all" ? slaRows.length : slaRows.filter((r) => r.region === key).length;

  const filteredRows = useMemo(
    () =>
      region === "all"
        ? slaRows
        : slaRows.filter((r) => r.region === region),
    [slaRows, region]
  );

  const totalRows = Math.max(slaRows.length, 1);
  const pct = (n: number) => `${Math.round((n / totalRows) * 100)}%`;

  const kpiCards: {
    label: string;
    value: string;
    unit: string;
    sub: string;
    icon: LucideIcon;
    iconCls: string;
    barCls: string;
    width: string;
    topBorder: string;
  }[] = [
    {
      // [OLA3 3.6] Umbrales desde la fuente única lib/sla.ts
      label: TITULO_FASES.f1,
      value: String(stats.f1),
      unit: "PUESTOS",
      sub: "Dentro de la ventana estándar post-cierre",
      icon: BadgeCheck,
      iconCls: "text-primary",
      barCls: "bg-primary",
      width: pct(stats.f1),
      topBorder: "border-t-primary",
    },
    {
      label: TITULO_FASES.f2,
      value: String(stats.f2),
      unit: "PUESTOS",
      sub: "Alerta Nivel 1 · WhatsApp automático al digitalizador",
      icon: Clock,
      iconCls: "text-warning",
      barCls: "bg-warning",
      width: pct(stats.f2),
      topBorder: "border-t-warning",
    },
    {
      label: TITULO_FASES.f3,
      value: String(stats.f3),
      unit: "PUESTOS",
      sub: "Escalamiento Nivel 2 · Delegado Consular",
      icon: AlertTriangle,
      iconCls: "text-danger",
      barCls: "bg-danger",
      width: pct(stats.f3),
      topBorder: "border-t-danger",
    },
    {
      label: "Mora promedio post-cierre",
      value: `+${stats.moraPromedio}`,
      unit: "MIN",
      sub: `${stats.totalMesas} mesas inactivas en seguimiento · Meta 1ª página < 25 min`,
      icon: TrendingUp,
      iconCls: "text-primary",
      barCls: "bg-primary",
      width: `${Math.min(100, stats.moraPromedio)}%`,
      topBorder: "border-t-outline",
    },
  ];

  return (
    <div className="flex flex-col w-full max-w-[1440px] mx-auto pb-16 gap-5">
      {/* Toast de confirmación de envío */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-20 right-4 z-50 bg-surface-container border border-primary text-primary px-4 py-2.5 rounded-sm shadow-xl flex items-center gap-2 text-label-caps font-label-caps print:hidden"
        >
          <BadgeCheck size={16} aria-hidden="true" />
          <span>{toast.mensaje}</span>
          {toast.demo && (
            <DemoBadge
              texto="DEMO"
              motivo="Sin backend de correo/teléfono en esta build: la acción no se despacha realmente."
            />
          )}
        </div>
      )}

      {/* Encabezado del módulo */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 border-b border-outline-variant/40">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <span className="p-1.5 rounded-sm bg-surface-container-high text-primary border border-primary/25 flex items-center justify-center">
              <BellRing size={18} aria-hidden="true" />
            </span>
            <h1 className="font-headline-lg text-headline-lg text-on-surface uppercase tracking-tight">
              Centro de Control SLA
            </h1>
            <span className="font-label-caps text-label-caps px-2 py-0.5 rounded-sm bg-surface-container-highest text-on-surface-variant">
              Matriz SLA por puesto
            </span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant md:ml-10">
            Mesas inactivas tras cierre local 16:00 · Tolerancia de escaneo y
            escalamiento progresivo de alertas en consulados del exterior
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-sm border border-outline-variant/40">
            <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
            <span className="font-label-caps text-label-caps text-on-surface tracking-wider text-[10px]">
              SLA ENGINE: EN VIVO (30s)
            </span>
          </div>

          <button
            onClick={onOpenConfigSla}
            aria-label="Configurar umbrales SLA"
            className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant/50 transition-colors font-label-caps text-label-caps tracking-wider"
          >
            <Settings size={14} aria-hidden="true" />
            CONFIGURAR SLA
          </button>

          <button
            onClick={onExportReport}
            aria-label="Exportar reporte de mora"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-sm bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant/50 transition-colors font-label-caps text-label-caps tracking-wider"
          >
            <Download size={14} aria-hidden="true" />
            EXPORTAR REPORTE
          </button>
        </div>
      </div>

      {/* Sub-barra de contexto operativo */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 pb-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-high rounded-sm border border-primary/30">
          <Clock size={14} className="text-primary" aria-hidden="true" />
          <span className="font-label-caps text-label-caps text-primary uppercase">
            Control de mora operativa (SLA)
          </span>
          <span className="px-1.5 rounded-sm bg-primary/10 text-primary font-stats-number text-[11px] font-bold">
            {String(stats.f2 + stats.f3).padStart(2, "0")}
          </span>
        </div>

        <div className="flex items-center gap-3 font-body-md text-body-md text-on-surface-variant">
          <span className="flex items-center gap-1.5">
            Ventana de tolerancia activa:
            <span className="text-on-surface font-stats-number font-bold">
              POST-CIERRE 16:00
            </span>
          </span>
          <span className="h-3 w-px bg-outline-variant/50" aria-hidden="true" />
          <span className="flex items-center gap-1.5">
            <BadgeCheck size={13} className="text-primary" aria-hidden="true" />
            Auditoría Legal SLA
          </span>
        </div>
      </div>

      {/* KPIs de fases de escalamiento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => {
          const CardIcon = card.icon;
          return (
            <div
              key={card.label}
              className={`bg-surface-container-low rounded-sm border-r border-b border-outline-variant/25 border-t-2 ${card.topBorder} p-4 flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-label-caps text-label-caps text-on-surface-variant tracking-wider uppercase text-[10px]">
                  {card.label}
                </span>
                <CardIcon size={18} className={card.iconCls} aria-hidden="true" />
              </div>
              <div className="flex items-baseline gap-2">
                <span
                  className={`font-stats-number text-stats-number font-bold ${
                    card.barCls === "bg-danger"
                      ? "text-danger"
                      : card.barCls === "bg-warning"
                        ? "text-warning"
                        : "text-on-surface"
                  }`}
                >
                  {card.value}
                </span>
                <span className="font-body-md text-body-md text-on-surface-variant font-medium">
                  {card.unit}
                </span>
              </div>
              <div className="mt-2 text-on-surface-variant font-body-md text-[11px] flex items-center gap-1">
                {card.iconCls === "text-danger" ? (
                  <AlertTriangle size={12} className="text-danger shrink-0" aria-hidden="true" />
                ) : (
                  <BadgeCheck size={12} className="text-primary shrink-0" aria-hidden="true" />
                )}
                {card.sub}
              </div>
              <div className="w-full bg-surface-container-highest h-1 rounded-full mt-3 overflow-hidden">
                <div
                  className={`h-full rounded-full ${card.barCls}`}
                  style={{ width: card.width }}
                  role="progressbar"
                  aria-label={card.label}
                  aria-valuenow={parseInt(card.width, 10)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Filtro por región */}
      <div className="bg-surface-container-low p-3 rounded-sm border border-outline-variant/30 flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Filtrar matriz de mora por región"
          className="flex flex-wrap gap-1.5"
        >
          {REGION_CHIPS.map((chip) => {
            const active = region === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                aria-pressed={active}
                onClick={() => setRegion(chip.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm border font-label-caps text-label-caps tracking-wider transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary font-bold"
                    : "bg-surface-container text-on-surface-variant border-outline-variant/40 hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                {chip.label}
                <span
                  className={`font-stats-number text-[10px] px-1 rounded-sm ${
                    active
                      ? "bg-primary-foreground/15 text-primary-foreground"
                      : "bg-surface-container-highest text-on-surface-variant"
                  }`}
                >
                  {regionCount(chip.key)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-on-surface-variant font-body-md text-[11px]">
          <MapPin size={13} className="text-primary" aria-hidden="true" />
          <span>
            <span className="text-on-surface font-bold">{filteredRows.length}</span>{" "}
            de {slaRows.length} puestos en mora ·{" "}
            <span className="text-on-surface font-bold">{stats.totalMesas}</span>{" "}
            mesas inactivas
          </span>
        </div>
      </div>

      {/* Matriz central de mora por puesto */}
      <div className="bg-surface-container-low rounded-sm border border-outline-variant/30 overflow-hidden">
        <div className="p-4 border-b border-outline-variant/30 bg-surface-container flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Table size={16} className="text-primary" aria-hidden="true" />
            <h2 className="font-headline-md text-headline-md text-on-surface font-bold uppercase tracking-tight">
              Matriz de seguimiento de mora por puesto
            </h2>
            <span className="font-label-caps text-label-caps px-2 py-0.5 rounded-sm bg-danger/15 text-danger border border-danger/40 text-[10px]">
              {String(stats.f2 + stats.f3).padStart(2, "0")} EN ATENCIÓN
              PRIORITARIA
            </span>
          </div>
          <div className="font-body-md text-on-surface-variant text-[11px]">
            Corte de auditoría electoral:
            <span className="text-primary font-stats-number font-bold">
              {" "}
              16:55:00 UTC
            </span>
          </div>
        </div>

        {/* [OLA7 · M-7/M-13] Contenedor con scroll vertical propio: la
            cabecera queda sticky REAL (antes overflow-x-auto mataba el
            sticky) y la tabla no estira la página con cientos de filas. */}
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-left border-collapse min-w-[1080px]">
            <caption className="sr-only">
              Matriz de mora operativa SLA: puestos con mesas inactivas tras el
              cierre local de urnas, fase de escalamiento y trazabilidad de
              notificaciones
            </caption>
            <thead className="sticky top-0 z-10 bg-[#141b1b] shadow-[0_1px_0_0_rgba(255,255,255,0.08)]">
              <tr className="bg-surface-container-high/60 border-b border-outline-variant/40 font-label-caps text-label-caps text-on-surface-variant uppercase">
                <th scope="col" className="py-3 px-4 w-56 text-left">
                  Puesto / Ubicación
                </th>
                <th scope="col" className="py-3 px-4 w-44 text-left">
                  Mesas inactivas
                </th>
                <th scope="col" className="py-3 px-4 w-32 text-left">
                  Hora cierre local
                </th>
                <th scope="col" className="py-3 px-4 w-36 text-left">
                  Tiempo transcurrido (mora)
                </th>
                <th scope="col" className="py-3 px-4 w-48 text-left">
                  Fase / Nivel de alerta
                </th>
                <th scope="col" className="py-3 px-4 text-left">
                  Trazabilidad última notificación
                </th>
                <th scope="col" className="py-3 px-4 w-72 text-right">
                  Acción operativa
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 font-body-md text-body-md text-on-surface">
              {filteredRows.map((row) => {
                const fase = FASE_UI[row.fase] ?? FASE_FALLBACK;
                const canal = CHANNEL_UI[row.notifChannel] ?? CANAL_FALLBACK;
                const CanalIcon = canal.icon;
                const extra = row.notifChannelExtra
                  ? CHANNEL_UI[row.notifChannelExtra] ?? CANAL_FALLBACK
                  : null;
                const ExtraIcon = extra?.icon;
                return (
                  <tr
                    key={row.id}
                    className="hover:bg-surface-container/60 transition-colors"
                  >
                    {/* Consulado / ubicación */}
                    <td className="py-3 px-4 align-top">
                      <div className="border-l-2 pl-3 -ml-1 py-0.5">
                        <div className="font-headline-md text-[13px] text-primary font-bold tracking-tight">
                          {row.consulateName}
                        </div>
                        <div className="text-[10px] text-on-surface-variant tracking-wider uppercase mt-0.5 flex items-center gap-1">
                          <MapPin size={10} className="shrink-0" aria-hidden="true" />
                          <span>{row.pais}</span>
                          <span className="text-outline-variant" aria-hidden="true">
                            &gt;
                          </span>
                          <span>ZONA {row.zona}</span>
                          <span className="text-outline-variant" aria-hidden="true">
                            &gt;
                          </span>
                          <span className="text-on-surface font-stats-number">
                            {row.puesto}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Mesas inactivas */}
                    <td className="py-3 px-4 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {row.mesasInactivas.map((m) => (
                          <span
                            key={m}
                            className="px-2 py-0.5 rounded-sm bg-surface-container-highest border border-outline-variant/40 font-stats-number text-[11px] text-primary font-semibold"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Hora de cierre local */}
                    <td className="py-3 px-4 align-top whitespace-nowrap">
                      <span className="px-2 py-1 rounded-sm bg-surface-container font-stats-number text-[11px] text-on-surface border border-outline-variant/30">
                        {row.horaCierreLocal}
                      </span>
                    </td>

                    {/* Tiempo transcurrido */}
                    <td className="py-3 px-4 align-top whitespace-nowrap">
                      <div
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm font-stats-number font-bold text-[12px] border ${fase.time}`}
                      >
                        <Clock size={13} aria-hidden="true" />
                        {row.tiempoTranscurridoLabel}
                      </div>
                    </td>

                    {/* Fase / nivel de alerta */}
                    <td className="py-3 px-4 align-top">
                      <div
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border font-label-caps text-label-caps font-bold tracking-wider ${fase.badge}`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${fase.dot}`}
                          aria-hidden="true"
                        />
                        {fase.label}
                      </div>
                      <div className="text-[10px] text-on-surface-variant font-body-md mt-1">
                        {row.subFaseDesc}
                      </div>
                    </td>

                    {/* Trazabilidad de notificación */}
                    <td className="py-3 px-4 align-top">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-bold border ${canal.cls}`}
                        >
                          <CanalIcon size={11} aria-hidden="true" />
                          {canal.label}
                        </span>
                        {extra && ExtraIcon && (
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-bold border ${extra.cls}`}
                          >
                            <ExtraIcon size={11} aria-hidden="true" />
                            {extra.label}
                          </span>
                        )}
                        <span className="text-[11px] text-on-surface-variant font-stats-number">
                          {row.notifDespacho}
                        </span>
                      </div>
                      <div
                        className="text-[11px] mt-1 flex items-start gap-1"
                        style={{ color: row.notifEstadoColor }}
                      >
                        {row.notifHasWarning && (
                          <AlertTriangle
                            size={12}
                            className="shrink-0 mt-0.5 text-warning"
                            aria-label="Advertencia: sin acuse de recibo"
                          />
                        )}
                        <span>{row.notifEstado}</span>
                      </div>
                    </td>

                    {/* Acción operativa */}
                    <td className="py-3 px-4 align-top">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <button
                          onClick={() => onOpenWhatsApp(row.consulateName)}
                          aria-label={`Abrir chat de WhatsApp con ${row.consulateName}`}
                          className="px-2.5 py-1.5 rounded-sm bg-whatsapp/15 hover:bg-whatsapp/25 text-whatsapp border border-whatsapp/40 font-label-caps text-label-caps font-bold transition-colors flex items-center gap-1"
                        >
                          <MessageCircle size={13} aria-hidden="true" />
                          CHAT WA
                        </button>

                        {/* [S-26] Sin backend de correo/teléfono: toast
                            de demo MARCADO, no un éxito simulado. */}
                        <button
                          onClick={() =>
                            showToast(
                              `Correo de escalamiento a ${row.consulateName} — sin envío real en esta build`,
                              true
                            )
                          }
                          aria-label={`Enviar correo de escalamiento a ${row.consulateName} (demo)`}
                          className="px-2.5 py-1.5 rounded-sm bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant/50 font-label-caps text-label-caps font-semibold transition-colors flex items-center gap-1"
                        >
                          <Mail size={13} aria-hidden="true" />
                          {row.fase === "fase2" ? "REENVIAR" : "CORREO"}
                          <DemoBadge
                            texto="DEMO"
                            motivo="Sin backend de correo en esta build: el botón registra la intención, no el envío."
                          />
                        </button>

                        <button
                          onClick={() =>
                            showToast(
                              `Llamada a ${row.consulateName} — sin marcado real en esta build`,
                              true
                            )
                          }
                          aria-label={`Llamar al delegado consular de ${row.consulateName} (demo)`}
                          className="px-2.5 py-1.5 rounded-sm bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant/50 font-label-caps text-label-caps font-semibold transition-colors flex items-center gap-1"
                        >
                          <Phone size={13} aria-hidden="true" />
                          TELÉFONO
                          <DemoBadge
                            texto="DEMO"
                            motivo="Sin backend de telefonía en esta build: el botón registra la intención, no la llamada."
                          />
                        </button>

                        <button
                          onClick={() => onOpenHistorial(row)}
                          aria-label={`Ver historial de notificaciones de ${row.consulateName}`}
                          className="px-2.5 py-1.5 rounded-sm bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-primary/30 font-label-caps text-label-caps font-semibold transition-colors flex items-center gap-1"
                        >
                          <History size={13} className="text-primary" aria-hidden="true" />
                          HISTORIAL
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-10 px-4 text-center text-on-surface-variant font-body-md text-body-md"
                  >
                    Sin puestos en mora para la región seleccionada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Leyenda de fases y telemetría */}
        <div className="p-3 bg-surface-container border-t border-outline-variant/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-on-surface-variant font-body-md text-[11px]">
          <div className="flex flex-wrap items-center gap-3">
            {/* [OLA3 3.6] Leyenda desde la fuente única lib/sla.ts
                (antes: literales 0-40/40-60/>2h en esta pantalla y
                umbrales 20/45 distintos en RevisionAnomalias). */}
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary" aria-hidden="true" />
              {LEYENDA_FASES.f1}
            </span>
            <span className="h-3 w-px bg-outline-variant/50" aria-hidden="true" />
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-warning" aria-hidden="true" />
              {LEYENDA_FASES.f2}
            </span>
            <span className="h-3 w-px bg-outline-variant/50" aria-hidden="true" />
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-danger" aria-hidden="true" />
              {LEYENDA_FASES.f3}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span>
              Mostrando{" "}
              <span className="text-on-surface font-bold">{filteredRows.length}</span>{" "}
              de{" "}
              <span className="text-on-surface font-bold">{slaRows.length}</span>{" "}
              puestos con mesas fuera de SLA
            </span>
            <span className="h-3 w-px bg-outline-variant/50" aria-hidden="true" />
            {/* [OLA3 3.7] Ahora es verdad: el componente refresca los
                datos cada 30 s (polling real, ver useEffect). */}
            <span className="flex items-center gap-1.5 text-primary">
              <span
                className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"
                aria-hidden="true"
              />
              SLA ENGINE EN VIVO (REFRESCO 30 s)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
