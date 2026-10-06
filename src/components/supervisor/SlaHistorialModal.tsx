"use client";

import React, { useEffect } from "react";
import {
  BellRing,
  CheckCircle2,
  History,
  Mail,
  MessageCircle,
  Smartphone,
  X,
} from "lucide-react";
import type { NotifChannel, SlaRow } from "@/lib/types";
import { DemoBadge } from "./DemoBadge";

interface SlaHistorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  consulate: SlaRow | null;
}

interface HistorialEvento {
  hora: string;
  etiqueta: string;
  descripcion: string;
  tipo: "success" | "error" | "warning" | "info";
  canales: NotifChannel[];
}

/** Extrae HH:MM de etiquetas como "16:00 Local" o "Despachado 16:45" */
function parseHora(texto: string): number | null {
  const m = /(\d{1,2}):(\d{2})/.exec(texto);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function formatHora(minutos: number): string {
  const m = ((minutos % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Genera la bitácora de eventos del consulado a partir de los datos base
 * del SlaRow (fase actual, canales, despacho y estado del acuse).
 * Los tiempos derivan de la hora de cierre local declarada.
 * [S-27] ORDENADA POR HORA (desc): antes un reintento temprano quedaba
 * ENCIMA de un despacho tardío (timeline no monótona) — la bitácora es
 * RECONSTRUIDA a partir del estado actual, no un log real: la UI la
 * marca con <DemoBadge texto="RECONSTRUIDO" />.
 */
function generarEventos(c: SlaRow): HistorialEvento[] {
  const cierreMin = parseHora(c.horaCierreLocal) ?? 16 * 60;
  const canalesBase: NotifChannel[] = c.notifChannelExtra
    ? [c.notifChannel, c.notifChannelExtra]
    : [c.notifChannel];
  const despachoMin = parseHora(c.notifDespacho) ?? cierreMin + 45;
  const acuseMin = parseHora(c.notifEstado) ?? despachoMin + 3;

  const eventos: HistorialEvento[] = [];

  // --- Evento más reciente: acuse o reintento pendiente ---
  if (c.notifHasWarning) {
    eventos.push({
      hora: formatHora(despachoMin + 5),
      etiqueta: "REINTENTO PROGRAMADO",
      descripcion: `Sin acuse de entrega verificado. El motor SLA reintentará el despacho por ${c.notifChannel} en 5 minutos. ${c.notifEstado}`,
      tipo: "warning",
      canales: [c.notifChannel],
    });
  } else {
    eventos.push({
      hora: formatHora(acuseMin),
      etiqueta: "ACUSE DE RECIBO",
      descripcion: `El delegado consular confirmó la lectura de la alerta y notificó que el operador inició el lote de escaneo. Estado: ${c.notifEstado}.`,
      tipo: "success",
      canales: [c.notifChannel],
    });
  }

  // --- Fases del protocolo (solo hasta la fase actual) ---
  if (c.fase === "fase3" || c.fase === "fase2") {
    eventos.push({
      hora: formatHora(cierreMin + 22),
      etiqueta: "DESPACHO ALERTA · FASE 2",
      descripcion:
        "Advertencia preventiva por superar la ventana de tolerancia de escaneo post-cierre. Notificación enviada a la terminal móvil del enlace consular.",
      tipo: "warning",
      canales: canalesBase,
    });
  }
  if (c.fase === "fase3") {
    eventos.push({
      hora: formatHora(despachoMin),
      etiqueta: "DESPACHO ALERTA · FASE 3",
      descripcion:
        "Disparo automático de notificación de mora crítica con escalamiento a la Dirección de Asuntos Migratorios y Consulares.",
      tipo: "error",
      canales: ["WA", "SMS", "EMAIL"],
    });
  }

  // --- Fase 1: recordatorio preventivo (siempre que hay fase activa) ---
  eventos.push({
    hora: formatHora(cierreMin + 18),
    etiqueta: "RECORDATORIO · FASE 1",
    descripcion:
      "Recordatorio de ventana de tolerancia enviado al enlace consular vía WhatsApp Business API antes del vencimiento del SLA base.",
    tipo: "info",
    canales: ["WA"],
  });

  // --- Cierre de urnas: origen de la línea de tiempo ---
  eventos.push({
    hora: formatHora(cierreMin),
    etiqueta: "CIERRE DE URNAS",
    descripcion: `El puesto ${c.puesto} declaró formalmente cerrada la jornada de sufragio con presencia de testigos. Inicia el conteo de la ventana de tolerancia SLA.`,
    tipo: "info",
    canales: [],
  });

  // [S-27] Línea de tiempo MONÓTONA: orden por hora (descendente =
  // evento más reciente arriba, como el orden de inserción original).
  eventos.sort(
    (a, b) => (parseHora(b.hora) ?? 0) - (parseHora(a.hora) ?? 0)
  );
  return eventos;
}

const DOT_CLASES: Record<HistorialEvento["tipo"], string> = {
  success: "bg-primary",
  error: "bg-danger",
  warning: "bg-warning",
  info: "bg-outline",
};

const TAG_CLASES: Record<HistorialEvento["tipo"], string> = {
  success: "bg-primary/10 border-primary/30 text-primary",
  error: "bg-danger/10 border-danger/30 text-danger",
  warning: "bg-warning/10 border-warning/30 text-warning",
  info: "bg-surface-container-lowest border-outline-variant/50 text-on-surface-variant",
};

const CANAL_META: Record<
  NotifChannel,
  { label: string; icon: React.ElementType; clases: string }
> = {
  WA: {
    label: "WhatsApp",
    icon: MessageCircle,
    clases: "bg-whatsapp/10 border-whatsapp/40 text-whatsapp",
  },
  SMS: {
    label: "SMS",
    icon: Smartphone,
    clases: "bg-on-surface-variant/10 border-outline-variant/50 text-on-surface-variant",
  },
  EMAIL: {
    label: "Email",
    icon: Mail,
    clases: "bg-primary/10 border-primary/30 text-primary",
  },
};

export const SlaHistorialModal: React.FC<SlaHistorialModalProps> = ({
  isOpen,
  onClose,
  consulate,
}) => {
  // Cierre con tecla Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen || !consulate) return null;

  const eventos = generarEventos(consulate);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Historial de trazabilidad SLA de ${consulate.consulateName}`}
    >
      <div className="bg-surface-container border border-outline-variant/50 w-full max-w-xl flex flex-col shadow-2xl rounded-sm overflow-hidden max-h-[90vh]">
        {/* ============ HEADER ============ */}
        <div className="bg-surface-container-high px-5 sm:px-6 py-4 border-b border-outline-variant/40 flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <History size={22} className="text-primary shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="font-headline-md text-headline-md text-on-surface font-bold uppercase flex items-center gap-2">
                Historial de Trazabilidad SLA
                {/* [S-27] La bitácora se RECONSTRUYE del estado actual —
                    no es un log real de eventos persistidos. */}
                <DemoBadge
                  texto="RECONSTRUIDO"
                  motivo="La bitácora se deriva del estado SLA actual (fase, canales, acuse): no existe un log persistido de eventos."
                />
              </h2>
              <span className="font-stats-number text-[11px] text-on-surface-variant truncate block">
                {consulate.consulateName} — {consulate.puesto}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1.5 rounded-sm hover:bg-surface-container-highest transition-colors shrink-0"
            aria-label="Cerrar historial SLA"
          >
            <X size={18} />
          </button>
        </div>

        {/* ============ CONTENIDO ============ */}
        <div className="p-5 sm:p-6 flex flex-col gap-5 overflow-y-auto">
          {/* Datos base del consulado */}
          <dl className="grid grid-cols-2 gap-3 bg-surface-container-lowest p-4 rounded-sm border border-outline-variant/30 font-stats-number text-[11px]">
            <div>
              <dt className="text-on-surface-variant uppercase text-[9px] tracking-wider">
                País / Jurisdicción
              </dt>
              <dd className="text-on-surface font-bold mt-0.5">
                {consulate.pais} · Z. {consulate.zona}
              </dd>
            </div>
            <div>
              <dt className="text-on-surface-variant uppercase text-[9px] tracking-wider">
                Estado de Mora
              </dt>
              <dd className="text-warning font-bold mt-0.5">
                {consulate.tiempoTranscurridoLabel}
              </dd>
            </div>
            <div>
              <dt className="text-on-surface-variant uppercase text-[9px] tracking-wider">
                Fase Actual
              </dt>
              <dd className="text-on-surface font-bold mt-0.5">
                {consulate.faseLabel}
              </dd>
            </div>
            <div>
              <dt className="text-on-surface-variant uppercase text-[9px] tracking-wider">
                Mesas Inactivas
              </dt>
              <dd className="text-on-surface font-bold mt-0.5">
                {consulate.mesasInactivas.length} ·{" "}
                {consulate.mesasInactivas.join(", ")}
              </dd>
            </div>
          </dl>

          {/* Línea de tiempo de notificaciones */}
          <div className="flex flex-col gap-5 relative pl-5 border-l-2 border-outline-variant/40 ml-2">
            {eventos.map((ev, i) => {
              const dot = DOT_CLASES[ev.tipo];
              const tag = TAG_CLASES[ev.tipo];
              return (
                <div key={`${ev.etiqueta}-${i}`} className="relative">
                  <div
                    className={`absolute -left-[26px] top-1.5 w-3 h-3 rounded-full border-2 border-surface-container ${dot}`}
                    aria-hidden="true"
                  />
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-stats-number text-[11px] font-bold text-primary">
                        {ev.hora}
                      </span>
                      <span
                        className={`font-label-caps text-[9px] font-bold px-1.5 py-0.5 rounded-sm border uppercase tracking-wider ${tag}`}
                      >
                        {ev.etiqueta}
                      </span>
                    </div>
                    {ev.canales.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {ev.canales.map((canal) => {
                          const meta = CANAL_META[canal];
                          const IconoCanal = meta.icon;
                          return (
                            <span
                              key={canal}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border font-label-caps text-[9px] uppercase ${meta.clases}`}
                            >
                              <IconoCanal size={10} aria-hidden="true" />
                              {meta.label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-[11px] text-on-surface-variant leading-relaxed font-body-md">
                      {ev.descripcion}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Nota del motor */}
          <div className="flex items-start gap-2 bg-surface-container-lowest border border-outline-variant/30 rounded-sm p-3">
            <BellRing
              size={13}
              className="text-primary mt-0.5 shrink-0"
              aria-hidden="true"
            />
            <p className="font-body-md text-[10px] text-on-surface-variant uppercase tracking-wider flex items-center gap-2 flex-wrap">
              <span>Motor SLA en vivo · intervalo de evaluación 30 s · protocolo de escalamiento RN-06</span>
              {/* [S-10/S-27] El intervalo de 30 s es el objetivo del motor;
                  el polling del cliente llega en OLA-B4 — marcado. */}
              <DemoBadge
                texto="DEMO"
                motivo="El motor SLA server-side y el polling de 30 s del monitor se implementan en OLA-B4/C: por ahora la vista no se refresca sola."
              />
            </p>
          </div>
        </div>

        {/* ============ FOOTER ============ */}
        <div className="p-4 bg-surface-container-high border-t border-outline-variant/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-primary text-on-primary font-label-caps font-bold rounded-sm text-[11px] uppercase tracking-wider hover:bg-primary-fixed transition-colors inline-flex items-center gap-2"
          >
            <CheckCircle2 size={13} aria-hidden="true" />
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
