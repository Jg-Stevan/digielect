"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Clock,
  FileText,
  Globe2,
  History,
  Printer,
  RefreshCw,
  Table,
  TrendingUp,
} from "lucide-react";
import type {
  AnomaliaItem,
  ConsulateRow,
  ResumenGlobal,
  SlaRow,
} from "@/lib/types";
import { apiInformes } from "@/lib/api-client";

interface GenerarInformesProps {
  consulates: ConsulateRow[];
  anomalias: AnomaliaItem[];
  slaRows: SlaRow[];
  /** [OLA3 3.12] Usuario real de la sesión para el banner impreso
   *  (antes "Supervisor ADM-9482" falso en el PDF). */
  supervisorUsuario?: string;
}

// ------------------------------------------------------------
// Contrato de la respuesta de GET /api/informes
// ------------------------------------------------------------
interface EscrutinioCandidato {
  candidato: string;
  votos: number;
  percent: number;
}

interface ActaReciente {
  id: string;
  barcode15: string | null;
  tipoEjemplar: string;
  pagina: number;
  estado: string;
  scoreCalidad: number | null;
  consulado: string;
  mesa: string;
  createdAt: string;
  imagenUrl: string | null;
  resultados: { candidato: string; votos: number }[];
}

interface AuditEntry {
  time: string;
  title: string;
  desc: string;
  usuario: string;
}

interface AvanceNacional {
  corporacion: string;
  mesasEsperadas: number;
  actasPublicadas: number;
  percent: string;
  departamentos: {
    codigo: string;
    nombre: string;
    esperadas: number;
    publicadas: number;
  }[];
}

interface InformesData {
  ok: boolean;
  resumen: ResumenGlobal;
  avanceNacional?: AvanceNacional | null;
  escrutinio: { totalVotos: number; candidatos: EscrutinioCandidato[] };
  actasRecientes: ActaReciente[];
  anomaliasResueltas: number;
  auditTrail: AuditEntry[];
  generadoEn: string;
}

/** UI de badge por estado del acta */
const ESTADO_ACTA_UI: Record<string, string> = {
  VALIDADO: "bg-primary/10 text-primary border-primary/40",
  ANOMALIA: "bg-warning/15 text-warning border-warning/40",
  RECHAZADO: "bg-danger/15 text-danger border-danger/40",
  OFFLINE: "bg-surface-container-highest text-on-surface-variant border-outline-variant/40",
  PENDIENTE: "bg-warning/10 text-warning border-warning/40",
  EN_COLA: "bg-surface-container-highest text-on-surface-variant border-outline-variant/40",
};

/** Icono + color por tipo de evento del audit trail */
function auditIcon(accion: string): { icon: LucideIcon; cls: string } {
  if (
    accion.includes("RESUELTA") ||
    accion.includes("APROBAR") ||
    accion.includes("CONFIRMAR")
  ) {
    return { icon: BadgeCheck, cls: "text-primary bg-primary/10 border-primary/40" };
  }
  if (accion.includes("ALERTA")) {
    return { icon: AlertTriangle, cls: "text-warning bg-warning/10 border-warning/40" };
  }
  if (accion.includes("DESCART")) {
    return { icon: AlertTriangle, cls: "text-danger bg-danger/10 border-danger/40" };
  }
  if (accion.startsWith("INICIO")) {
    return { icon: Clock, cls: "text-primary bg-primary/10 border-primary/40" };
  }
  if (accion.includes("LOTE") || accion.includes("BATCH")) {
    return { icon: Table, cls: "text-secondary-fixed-dim bg-secondary-fixed-dim/10 border-secondary-fixed-dim/40" };
  }
  return { icon: FileText, cls: "text-on-surface-variant bg-surface-container-highest border-outline-variant/40" };
}

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const fmtHora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour12: false,
  });

const scoreCls = (score: number | null): string => {
  if (score === null) return "text-on-surface-variant";
  if (score >= 9) return "text-primary";
  if (score >= 7) return "text-warning";
  return "text-danger";
};

export const GenerarInformes: React.FC<GenerarInformesProps> = ({
  consulates,
  anomalias,
  slaRows,
  supervisorUsuario,
}) => {
  // Resiliencia de contrato: page.tsx pasa `data.consolados` (typo → undefined)
  // en runtime. Mismo patrón defensivo que MonitorGlobal (ver worklog).
  const consulatesList: ConsulateRow[] = Array.isArray(consulates)
    ? consulates
    : [];
  const anomaliasList: AnomaliaItem[] = Array.isArray(anomalias)
    ? anomalias
    : [];
  const slaRowsList: SlaRow[] = Array.isArray(slaRows) ? slaRows : [];

  const [informe, setInforme] = useState<InformesData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refetching, setRefetching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const cargarInforme = useCallback(async (esRefresco: boolean) => {
    if (esRefresco) setRefetching(true);
    try {
      const data = await apiInformes();
      if (!data.ok || !data.resumen || !data.escrutinio) {
        setError(
          (data as { error?: string }).error ??
            "El servidor no pudo generar el informe consolidado."
        );
        setInforme(null);
        return;
      }
      setInforme(data as InformesData);
      setError(null);
    } catch {
      setError("Sin conexión con el servidor de informes.");
    } finally {
      setLoading(false);
      setRefetching(false);
    }
  }, []);

  useEffect(() => {
    void cargarInforme(false);
  }, [cargarInforme]);

  // ---------------- Sección 1: tarjetas del resumen ----------------
  const resumenCards: {
    label: string;
    value: string;
    icon: LucideIcon;
    iconCls: string;
    valueCls: string;
    barCls: string;
    width: string;
  }[] = informe
    ? [
        {
          label: "Total puestos exteriores",
          value: String(informe.resumen.totalPuestos),
          icon: BarChart3,
          iconCls: "text-on-surface-variant",
          valueCls: "text-on-surface",
          barCls: "bg-outline",
          width: "100%",
        },
        {
          label: "Puestos completos",
          value: String(informe.resumen.completo),
          icon: BadgeCheck,
          iconCls: "text-primary",
          valueCls: "text-primary",
          barCls: "bg-primary",
          width: `${(informe.resumen.completo / Math.max(informe.resumen.totalPuestos, 1)) * 100}%`,
        },
        {
          label: "Puestos críticos",
          value: String(informe.resumen.critico),
          icon: AlertTriangle,
          iconCls: "text-danger",
          valueCls: "text-danger",
          barCls: "bg-danger",
          width: `${(informe.resumen.critico / Math.max(informe.resumen.totalPuestos, 1)) * 100}%`,
        },
        {
          label: "Puestos pendientes",
          value: String(informe.resumen.pendiente),
          icon: Clock,
          iconCls: "text-warning",
          valueCls: "text-warning",
          barCls: "bg-warning",
          width: `${(informe.resumen.pendiente / Math.max(informe.resumen.totalPuestos, 1)) * 100}%`,
        },
        {
          label: "No iniciados",
          value: String(informe.resumen.noIniciado),
          icon: Clock,
          iconCls: "text-on-surface-variant",
          valueCls: "text-on-surface-variant",
          barCls: "bg-outline-variant",
          width: `${(informe.resumen.noIniciado / Math.max(informe.resumen.totalPuestos, 1)) * 100}%`,
        },
        {
          label: "Actas E-14 ingestadas",
          value: String(informe.resumen.actasIngestadas),
          icon: FileText,
          iconCls: "text-primary",
          valueCls: "text-on-surface",
          barCls: "bg-primary",
          width: "100%",
        },
        {
          label: "Anomalías abiertas",
          value: String(informe.resumen.anomaliasAbiertas),
          icon: AlertTriangle,
          iconCls: "text-warning",
          valueCls: "text-warning",
          barCls: "bg-warning",
          width: `${(informe.resumen.anomaliasAbiertas / Math.max(informe.resumen.actasIngestadas, 1)) * 100}%`,
        },
        {
          label: "Anomalías resueltas",
          value: String(informe.anomaliasResueltas),
          icon: BadgeCheck,
          iconCls: "text-primary",
          valueCls: "text-primary",
          barCls: "bg-primary",
          width: `${(informe.anomaliasResueltas / Math.max(informe.anomaliasResueltas + informe.resumen.anomaliasAbiertas, 1)) * 100}%`,
        },
      ]
    : [];

  // ---------------- Render ----------------

  return (
    <div className="flex flex-col w-full max-w-[1440px] mx-auto pb-16 gap-6">
      {/* Encabezado */}
      <div className="flex flex-col gap-2 border-b border-outline-variant/40 pb-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="p-1.5 rounded-sm bg-surface-container-high text-primary border border-primary/25 flex items-center justify-center">
            <BarChart3 size={20} aria-hidden="true" />
          </span>
          <h1 className="font-headline-lg text-headline-lg text-on-surface uppercase tracking-tight">
            Informes y Auditoría E-14
          </h1>
          {informe && (
            <span className="font-label-caps text-label-caps px-2 py-0.5 rounded-sm bg-surface-container-highest text-on-surface-variant font-stats-number text-[10px]">
              GENERADO {fmtHora(informe.generadoEn)} COT
            </span>
          )}
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
          Consolidado oficial de la jornada de digitalización, escrutinio
          acumulado del exterior y bitácora de auditoría para supervisores y
          misiones de observación electoral.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3 mt-1">
          <div className="flex flex-wrap items-center gap-3 font-body-md text-[11px] text-on-surface-variant">
            <span>
              <span className="text-on-surface font-bold">{consulatesList.length}</span>{" "}
              CONSULADOS
            </span>
            <span className="h-3 w-px bg-outline-variant/50" aria-hidden="true" />
            <span>
              <span className="text-warning font-bold">{anomaliasList.length}</span>{" "}
              ANOMALÍAS ABIERTAS
            </span>
            <span className="h-3 w-px bg-outline-variant/50" aria-hidden="true" />
            <span>
              <span className="text-on-surface font-bold">{slaRowsList.length}</span>{" "}
              PUESTOS EN MORA SLA
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button
              onClick={() => window.print()}
              aria-label="Exportar PDF o imprimir el informe consolidado"
              className="flex items-center gap-2 px-3.5 py-2 rounded-sm bg-primary text-primary-foreground hover:brightness-110 active:scale-95 transition-all font-label-caps text-label-caps font-bold tracking-wider shadow-lg shadow-primary/20"
            >
              <Printer size={14} aria-hidden="true" />
              EXPORTAR PDF / IMPRIMIR
            </button>
            <button
              onClick={() => void cargarInforme(true)}
              disabled={refetching}
              aria-label="Recargar datos del informe"
              className="flex items-center gap-2 px-3 py-2 rounded-sm bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-outline-variant/50 transition-colors font-label-caps text-label-caps tracking-wider disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={refetching ? "animate-spin" : ""}
                aria-hidden="true"
              />
              {refetching ? "RECARGANDO..." : "RECARGAR DATOS"}
            </button>
          </div>
        </div>
      </div>

      {/* Banner solo visible al imprimir */}
      <div className="hidden print:block border-b border-outline-variant pb-3">
        <p className="font-label-caps text-label-caps text-on-surface font-bold">
          SISTEMA DE MONITOREO ELECTORAL E-14 · INFORME CONSOLIDADO DEL EXTERIOR
        </p>
        <p className="font-body-md text-body-md text-on-surface-variant">
          Generado:{" "}
          {informe ? fmtFecha(informe.generadoEn) : "No disponible"} · Supervisor{" "}
          {supervisorUsuario ? supervisorUsuario.toUpperCase() : "—"} · Estación
          local
        </p>
      </div>

      {/* Estados de carga y error */}
      {loading && (
        <div className="flex flex-col gap-6" aria-label="Cargando informe consolidado">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="bg-surface-container border border-outline-variant/30 h-24 animate-pulse rounded-sm"
              />
            ))}
          </div>
          <div className="bg-surface-container border border-outline-variant/30 h-48 animate-pulse rounded-sm" />
          <div className="bg-surface-container border border-outline-variant/30 h-72 animate-pulse rounded-sm" />
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="bg-surface-container-low border border-danger/40 rounded-sm p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle size={22} className="text-danger shrink-0" aria-hidden="true" />
            <div>
              <p className="font-headline-md text-headline-md text-danger uppercase">
                Error generando el informe
              </p>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                {error}
              </p>
            </div>
          </div>
          <button
            onClick={() => void cargarInforme(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-sm bg-primary text-primary-foreground font-label-caps text-label-caps font-bold tracking-wider hover:brightness-110 transition-all print:hidden"
          >
            <RefreshCw size={14} aria-hidden="true" />
            REINTENTAR
          </button>
        </div>
      )}

      {informe && !loading && (
        <div className="flex flex-col gap-6">
          {/* Avance nacional REAL · Registraduría (visor E-14) */}
          {informe.avanceNacional && (
            <section
              aria-labelledby="titulo-avance-nacional"
              className="bg-surface-container border border-primary/30 rounded-sm overflow-hidden"
            >
              <div className="flex flex-col lg:flex-row items-stretch">
                <div className="flex-1 p-4 md:p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Globe2 size={16} className="text-primary" aria-hidden="true" />
                    <h2
                      id="titulo-avance-nacional"
                      className="font-label-caps text-label-caps text-primary font-bold tracking-widest"
                    >
                      AVANCE NACIONAL · PUBLICACIÓN E-14 (DATOS REALES REGISTRADURÍA)
                    </h2>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface-variant mb-3">
                    {informe.avanceNacional.corporacion} · Fuente:{" "}
                    <span className="text-on-surface font-mono text-[12px]">
                      e14segundavueltapresidente.registraduria.gov.co
                    </span>
                  </p>
                  <div className="flex items-baseline gap-3 mb-3">
                    <span className="font-stats-number text-stats-number text-primary text-3xl">
                      {informe.avanceNacional.actasPublicadas.toLocaleString("es-CO")}
                    </span>
                    <span className="font-body-md text-body-md text-on-surface-variant">
                      de{" "}
                      {informe.avanceNacional.mesasEsperadas.toLocaleString("es-CO")}{" "}
                      mesas publicadas
                    </span>
                    <span className="font-stats-number text-stats-number text-primary text-lg">
                      {informe.avanceNacional.percent}%
                    </span>
                  </div>
                  <div
                    className="h-2 bg-surface-container-highest rounded-full overflow-hidden"
                    role="progressbar"
                    aria-valuenow={Math.round(
                      (informe.avanceNacional.actasPublicadas /
                        Math.max(informe.avanceNacional.mesasEsperadas, 1)) *
                        100
                    )}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Avance nacional de publicación E-14"
                  >
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: `${
                          (informe.avanceNacional.actasPublicadas /
                            Math.max(informe.avanceNacional.mesasEsperadas, 1)) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>
                <div className="lg:w-[340px] border-t lg:border-t-0 lg:border-l border-outline-variant/40 p-4 md:p-5 bg-surface-container-low">
                  <p className="font-label-caps text-label-caps text-on-surface-variant font-bold tracking-widest mb-2">
                    TOP DEPARTAMENTOS (EXTERIOR DESTACADO)
                  </p>
                  <ul className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                    {[...informe.avanceNacional.departamentos]
                      .sort((a, b) => b.esperadas - a.esperadas)
                      .slice(0, 5)
                      .map((d) => (
                        <li
                          key={d.codigo}
                          className="flex items-center justify-between gap-3 font-body-md text-[12px]"
                        >
                          <span className="text-on-surface truncate">{d.nombre}</span>
                          <span className="font-stats-number text-on-surface-variant shrink-0">
                            {d.publicadas}/{d.esperadas}
                          </span>
                        </li>
                      ))}
                    {/* [S-11] ELIMINADA la fila inyectada "88 · CONSULADOS
                        3670/3670": un informe imprimible no puede afirmar
                        una publicación exterior 100% que no viene de datos
                        reales — el exterior se reporta por sus actas
                        ingestadas (secciones 2/3 del informe). */}
                  </ul>
                </div>
              </div>
            </section>
          )}

          {/* Sección 1 · Informe general de jornada */}
          <section aria-labelledby="titulo-informe-general">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={15} className="text-primary" aria-hidden="true" />
              <h2
                id="titulo-informe-general"
                className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider"
              >
                1 · Informe general de jornada
              </h2>
              <div className="flex-1 h-px bg-outline-variant/30" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {resumenCards.map((card) => {
                const CardIcon = card.icon;
                return (
                  <div
                    key={card.label}
                    className="bg-surface-container-low rounded-sm border border-outline-variant/30 p-4 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider text-[10px]">
                        {card.label}
                      </span>
                      <CardIcon size={16} className={card.iconCls} aria-hidden="true" />
                    </div>
                    <span
                      className={`font-stats-number text-stats-number font-bold ${card.valueCls}`}
                    >
                      {card.value}
                    </span>
                    <div className="w-full bg-surface-container-highest h-1 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${card.barCls}`}
                        style={{ width: card.width }}
                        role="progressbar"
                        aria-label={card.label}
                        aria-valuenow={Math.round(parseFloat(card.width)) || 0}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Sección 2 · Escrutinio acumulado del exterior */}
          <section aria-labelledby="titulo-escrutinio">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={15} className="text-primary" aria-hidden="true" />
              <h2
                id="titulo-escrutinio"
                className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider"
              >
                2 · Escrutinio acumulado del exterior
              </h2>
              <div className="flex-1 h-px bg-outline-variant/30" aria-hidden="true" />
              <span className="font-label-caps text-label-caps px-2 py-0.5 rounded-sm bg-primary/10 text-primary border border-primary/30 text-[10px]">
                PRESIDENCIA 2026 · 2ª VUELTA
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Total de votos */}
              <div className="bg-surface-container-low rounded-sm border border-outline-variant/30 p-5 flex flex-col justify-between gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider text-[10px]">
                    Total votos registrados
                  </span>
                  <TrendingUp size={16} className="text-primary" aria-hidden="true" />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-stats-number text-stats-number text-primary font-bold text-[40px] leading-none">
                    {informe.escrutinio.totalVotos.toLocaleString("es-CO")}
                  </span>
                  <span className="font-body-md text-body-md text-on-surface-variant">
                    VOTOS
                  </span>
                </div>
                <p className="font-body-md text-[11px] text-on-surface-variant">
                  Suma consolidada de resultados extraídos por IA (VLM) de las
                  actas E-14 validadas en el exterior.
                </p>
                <div className="font-body-md text-[10px] text-on-surface-variant font-stats-number border-t border-outline-variant/30 pt-2">
                  ESCRUTINIO PARCIAL · EN ACTUALIZACIÓN CONTINUA
                </div>
              </div>

              {/* Barras por candidato */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                {informe.escrutinio.candidatos.map((c, i) => (
                  <div
                    key={c.candidato}
                    className="bg-surface-container-low rounded-sm border border-outline-variant/30 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-headline-md text-[13px] text-on-surface font-bold uppercase tracking-tight">
                          {c.candidato}
                        </span>
                        {i === 0 && (
                          <span className="font-label-caps text-label-caps px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary border border-primary/40 text-[9px]">
                            A LA CABEZA
                          </span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-2 font-stats-number">
                        <span
                          className={`text-[16px] font-bold ${
                            i === 0 ? "text-primary" : "text-on-surface"
                          }`}
                        >
                          {c.votos.toLocaleString("es-CO")}
                        </span>
                        <span className="text-[11px] text-on-surface-variant">
                          VOTOS · {c.percent.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div
                      className="w-full bg-surface-container-highest h-3 rounded-full overflow-hidden"
                      role="progressbar"
                      aria-label={`Votos de ${c.candidato}`}
                      aria-valuenow={Math.round(c.percent)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={`h-full rounded-full ${
                          i === 0 ? "bg-primary" : "bg-secondary-fixed-dim"
                        }`}
                        style={{ width: `${Math.min(100, c.percent)}%` }}
                      />
                    </div>
                  </div>
                ))}

                {informe.escrutinio.candidatos.length === 0 && (
                  <div className="bg-surface-container-low rounded-sm border border-outline-variant/30 p-6 text-center text-on-surface-variant font-body-md text-body-md">
                    Aún no hay resultados consolidados de votación.
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Sección 3 · Actas recientes */}
          <section aria-labelledby="titulo-actas">
            <div className="flex items-center gap-2 mb-3">
              <Table size={15} className="text-primary" aria-hidden="true" />
              <h2
                id="titulo-actas"
                className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider"
              >
                3 · Actas recientes
              </h2>
              <div className="flex-1 h-px bg-outline-variant/30" aria-hidden="true" />
              <span className="font-label-caps text-label-caps px-2 py-0.5 rounded-sm bg-surface-container-highest text-on-surface-variant border border-outline-variant/40 text-[10px]">
                {informe.actasRecientes.length} REGISTROS
              </span>
            </div>

            <div className="bg-surface-container-low rounded-sm border border-outline-variant/30 overflow-hidden">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <caption className="sr-only">
                    Últimas actas E-14 ingresadas al sistema con su código de
                    barras 15D, estado de validación y score de calidad IA
                  </caption>
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-surface-container-high border-b border-outline-variant/40 font-label-caps text-label-caps text-on-surface-variant uppercase">
                      <th scope="col" className="py-2.5 px-4 text-left">
                        Código de barras 15D
                      </th>
                      <th scope="col" className="py-2.5 px-4 text-left">
                        Ejemplar
                      </th>
                      <th scope="col" className="py-2.5 px-4 text-left">
                        Pág.
                      </th>
                      <th scope="col" className="py-2.5 px-4 text-left">
                        Estado
                      </th>
                      <th scope="col" className="py-2.5 px-4 text-left">
                        Score
                      </th>
                      <th scope="col" className="py-2.5 px-4 text-left">
                        Consulado
                      </th>
                      <th scope="col" className="py-2.5 px-4 text-left">
                        Mesa
                      </th>
                      <th scope="col" className="py-2.5 px-4 text-left">
                        Fecha ingesta
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20 font-body-md text-body-md text-on-surface">
                    {informe.actasRecientes.map((a) => (
                      <tr
                        key={a.id}
                        className="hover:bg-surface-container/60 transition-colors"
                      >
                        <td className="py-2.5 px-4 font-stats-number text-[11px] text-primary whitespace-nowrap">
                          {a.barcode15 ?? "—"}
                        </td>
                        <td className="py-2.5 px-4 text-[11px] text-on-surface-variant uppercase tracking-wider">
                          {a.tipoEjemplar === "DELEGADOS"
                            ? "Delegados"
                            : "Transmisión"}
                        </td>
                        <td className="py-2.5 px-4 font-stats-number text-[11px]">
                          {a.pagina}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border text-[10px] font-label-caps font-bold ${
                              ESTADO_ACTA_UI[a.estado] ??
                              "bg-surface-container-highest text-on-surface-variant border-outline-variant/40"
                            }`}
                          >
                            {a.estado}
                          </span>
                        </td>
                        <td
                          className={`py-2.5 px-4 font-stats-number text-[11px] font-bold ${scoreCls(
                            a.scoreCalidad
                          )}`}
                        >
                          {a.scoreCalidad !== null ? `${a.scoreCalidad}/10` : "—"}
                        </td>
                        <td className="py-2.5 px-4 text-[11px] text-on-surface-variant">
                          {a.consulado}
                        </td>
                        <td className="py-2.5 px-4 font-stats-number text-[11px]">
                          {a.mesa}
                        </td>
                        <td className="py-2.5 px-4 font-stats-number text-[10px] text-on-surface-variant whitespace-nowrap">
                          {fmtFecha(a.createdAt)}
                        </td>
                      </tr>
                    ))}

                    {informe.actasRecientes.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          className="py-8 px-4 text-center text-on-surface-variant"
                        >
                          No hay actas registradas todavía.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Sección 4 · Audit trail */}
          <section aria-labelledby="titulo-audit">
            <div className="flex items-center gap-2 mb-3">
              <History size={15} className="text-primary" aria-hidden="true" />
              <h2
                id="titulo-audit"
                className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider"
              >
                4 · Audit trail (bitácora de auditoría)
              </h2>
              <div className="flex-1 h-px bg-outline-variant/30" aria-hidden="true" />
              <span className="font-label-caps text-label-caps px-2 py-0.5 rounded-sm bg-surface-container-highest text-on-surface-variant border border-outline-variant/40 text-[10px]">
                {informe.auditTrail.length} EVENTOS
              </span>
            </div>

            <div className="bg-surface-container-low rounded-sm border border-outline-variant/30 overflow-hidden">
              <ol className="max-h-96 overflow-y-auto divide-y divide-outline-variant/20">
                {informe.auditTrail.map((e, i) => {
                  const meta = auditIcon(e.title);
                  const MetaIcon = meta.icon;
                  return (
                    <li
                      key={`${e.time}-${i}`}
                      className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-start gap-3 hover:bg-surface-container/50 transition-colors"
                    >
                      <span
                        className={`shrink-0 w-8 h-8 rounded-sm border flex items-center justify-center ${meta.cls}`}
                        aria-hidden="true"
                      >
                        <MetaIcon size={15} />
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <time
                            dateTime={e.time}
                            className="font-stats-number text-[11px] text-on-surface-variant whitespace-nowrap"
                          >
                            {fmtFecha(e.time)}
                          </time>
                          <span className="font-label-caps text-label-caps text-on-surface font-bold tracking-wider">
                            {e.title}
                          </span>
                        </div>
                        <p className="font-body-md text-[11px] text-on-surface-variant mt-0.5 leading-relaxed">
                          {e.desc}
                        </p>
                      </div>

                      <span className="shrink-0 self-start sm:self-center px-2 py-0.5 rounded-sm bg-surface-container-highest border border-outline-variant/40 font-stats-number text-[10px] text-on-surface-variant">
                        {e.usuario}
                      </span>
                    </li>
                  );
                })}

                {informe.auditTrail.length === 0 && (
                  <li className="p-8 text-center text-on-surface-variant font-body-md text-body-md">
                    No hay eventos registrados en la bitácora.
                  </li>
                )}
              </ol>
            </div>
          </section>

          {/* Pie del informe */}
          <footer className="border-t border-outline-variant/30 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 font-body-md text-[10px] text-on-surface-variant">
            <span>
              Informe generado el {fmtFecha(informe.generadoEn)} (hora Colombia) ·
              Sistema de Monitoreo Electoral E-14 · Digielect
            </span>
            {/* [S-11] SIN sello criptográfico fabricado: antes afirmaba
                "SELLO CRIPTO: SHA-256 (VERIFICADO)" sin ningún hash real. */}
            <span className="font-stats-number">
              DOCUMENTO DE TRABAJO · SIN SELLO CRIPTOGRÁFICO
            </span>
          </footer>
        </div>
      )}
    </div>
  );
};
