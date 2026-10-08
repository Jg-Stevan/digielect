"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Badge,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Contrast,
  Info,
  Loader2,
  Maximize,
  RotateCcw,
  RotateCw,
  Send,
  ShieldAlert,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { ReinspectionTarget, TipoAnomalia } from "@/lib/types";
import { withBasePath } from "@/lib/env";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { DemoBadge } from "./DemoBadge";

interface ReinspectionModalProps {
  isOpen: boolean;
  target: ReinspectionTarget | null;
  onClose: () => void;
  /** [OLA3 3.2] Devuelve el resultado: el modal SOLO se cierra en
   * éxito; en error permanece abierto con la justificación
   * preservada (antes el finally del padre lo cerraba siempre). */
  onResolve: (
    action: "APROBADA" | "RESCANEO_CONFIRMADO",
    justificacion: string
  ) => Promise<{ ok: boolean; error?: string }>;
}

type FormType = "DELEGADOS" | "TRANSMISIÓN";

interface TimelineItem {
  time: string;
  title: string;
  desc: string;
  color: string;
  textColor: string;
}

const IMAGEN_FALLBACK = withBasePath(
  "/actas/E14_XXX_X_88_495_010_02_000_X_XXX-2.jpg"
);

const MIN_JUSTIFICACION = 10;

/**
 * [OLA3 3.3] Timeline inicial derivada del tipo REAL de la anomalía
 * y de la hora real de la alerta. Antes: "14:20 SOLICITUD DE
 * RESCANEO… sesión #A92-F" hardcode para cualquier caso. La
 * bitácora sigue siendo ilustrativa (no hay audit trail por evento
 * persistido en esta build) → la sección se marca con DemoBadge
 * "EVIDENCIA SIMULADA".
 */
function timelineInicial(
  tipo: TipoAnomalia | undefined,
  horaAlerta?: string
): TimelineItem[] {
  const descAlerta =
    tipo === "SIN_FIRMAS"
      ? "Alerta automática: firmas de jurados no detectadas"
      : tipo === "ILEGIBLE_RESCANEO"
        ? "Alerta automática: folio ilegible — se solicitó rescaneo"
        : tipo === "CODIGO_NO_DETECTADO"
          ? "Alerta automática: código de barras no detectado"
          : tipo === "UBICACION_DISCREPANTE"
            ? "Alerta automática: la mesa declarada difiere de la computada por el cruce QR↔VLM — acta archivada en la computada"
            : "Revisión manual abierta por el supervisor";
  return [
    {
      time: horaAlerta ?? "—",
      title: "ANOMALÍA ABIERTA",
      desc: descAlerta,
      color: "bg-error",
      textColor: "text-error",
    },
    {
      time: "—",
      title: "PENDIENTE DE DECISIÓN",
      desc: "En bandeja del supervisor (justificación obligatoria)",
      color: "bg-outline",
      textColor: "text-on-surface-variant",
    },
  ];
}

/** Extrae el tipo de formulario del campo formulario del target */
function parseFormType(formulario?: string): FormType {
  return formulario?.toUpperCase().includes("DELEGADOS")
    ? "DELEGADOS"
    : "TRANSMISIÓN";
}

/** Extrae la página del campo formulario del target */
function parsePage(formulario?: string): 1 | 2 {
  return formulario?.toUpperCase().includes("PÁGINA 1") ? 1 : 2;
}

/** Selecciona la imagen del folio activo cuando es un acta de ejemplo */
function imagenDePagina(baseUrl: string, pagina: 1 | 2): string {
  if (pagina === 2) return baseUrl;
  return baseUrl.replace(/-(\d)\.(jpg|jpeg|png)$/i, "-1.$2");
}

export const ReinspectionModal: React.FC<ReinspectionModalProps> = ({
  isOpen,
  target,
  onClose,
  onResolve,
}) => {
  const [formType, setFormType] = useState<FormType>("TRANSMISIÓN");
  const [activePage, setActivePage] = useState<1 | 2>(2);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [justificacion, setJustificacion] = useState<string>("");
  const [errorJust, setErrorJust] = useState<string | null>(null);
  /** [OLA3 3.2] Error de la acción (inline): el modal NO se cierra */
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [resolving, setResolving] = useState<
    "APROBADA" | "RESCANEO_CONFIRMADO" | null
  >(null);
  const [actionDone, setActionDone] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>(() =>
    timelineInicial(undefined)
  );
  const [imgError, setImgError] = useState<boolean>(false);

  // [OLA3 3.11] Focus trap: Tab/Shift+Tab ciclan dentro del diálogo,
  // foco inicial al abrir y restauración al trigger al cerrar.
  const trapRef = useFocusTrap<HTMLDivElement>(isOpen);

  // Datos del objetivo (con fallback si no hay target)
  const mesaLabel = target?.mesaLabel ?? "Mesa 001 · CONSULADO ROMA";
  const formulario = target?.formulario ?? "TRANSMISIÓN - PÁGINA 2";
  const tipoLabel = target?.tipoLabel ?? "REVISIÓN MANUAL";
  const imagenBase = target?.actaImagenUrl || IMAGEN_FALLBACK;
  const imagenUrl = useMemo(
    () => imagenDePagina(imagenBase, activePage),
    [imagenBase, activePage]
  );

  // Reinicia el estado del visor al abrir / cambiar de mesa
  useEffect(() => {
    if (!isOpen) return;
    setFormType(parseFormType(target?.formulario));
    setActivePage(parsePage(target?.formulario));
    setZoomLevel(100);
    setRotation(0);
    setHighContrast(false);
    setJustificacion("");
    setErrorJust(null);
    setErrorAccion(null);
    setResolving(null);
    setActionDone(null);
    setTimeline(timelineInicial(target?.tipoAnomalia, target?.horaAlerta));
    setImgError(false);
  }, [isOpen, target]);

  // Cierre con tecla Escape (bloqueado mientras se resuelve)
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !resolving) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, resolving, onClose]);

  if (!isOpen) return null;

  // [OLA3 3.3] Evidencia derivada del tipoAnomalia REAL: los overlays
  // solo aparecen en el folio bajo auditoría y para el tipo detectado
  // (antes "FIRMA JURADO 2 — NO DETECTADA" y "CÓDIGO PARCIALMENTE
  // ILEGIBLE" estaban fijos sobre CUALQUIER acta).
  const tipoAnomalia = target?.tipoAnomalia;
  const enPaginaAuditada = activePage === parsePage(target?.formulario);
  const overlayFirmas = tipoAnomalia === "SIN_FIRMAS";
  const overlayIlegible = tipoAnomalia === "ILEGIBLE_RESCANEO";
  const overlayCodigo = tipoAnomalia === "CODIGO_NO_DETECTADO";
  // [OLA3 3.2] Sin anomalía real no hay decisión que registrar:
  // APROBAR/RECHAZAR enviaban un POST sin anomaliaId → 400 críptico.
  const sinAnomaliaReal = !target?.anomaliaId;

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 20, 200));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 20, 60));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleContrastToggle = () => setHighContrast((prev) => !prev);
  const handleReset = () => {
    setZoomLevel(100);
    setRotation(0);
    setHighContrast(false);
  };

  const charCount = justificacion.trim().length;

  const registrarTimeline = (
    action: "APROBADA" | "RESCANEO_CONFIRMADO",
    obsText: string
  ) => {
    const now = new Date();
    const timeStr = `${now
      .getHours()
      .toString()
      .padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")} LOCAL`;
    const entry: TimelineItem =
      action === "APROBADA"
        ? {
            time: timeStr,
            title: "APROBADA Y VALIDADA",
            desc: obsText,
            color: "bg-primary",
            textColor: "text-primary",
          }
        : {
            time: timeStr,
            title: "RESCANEO CONFIRMADO",
            desc: obsText,
            color: "bg-error",
            textColor: "text-error",
          };
    setTimeline([entry, ...timeline]);
  };

  const handleResolve = async (
    action: "APROBADA" | "RESCANEO_CONFIRMADO"
  ) => {
    const obsText = justificacion.trim();
    if (obsText.length < MIN_JUSTIFICACION) {
      setErrorJust(
        `La justificación es obligatoria (mínimo ${MIN_JUSTIFICACION} caracteres).`
      );
      return;
    }
    setErrorJust(null);
    setErrorAccion(null);
    setResolving(action);
    try {
      const res = await onResolve(action, obsText);
      if (!res.ok) {
        // [OLA3 3.2] Error: el modal permanece ABIERTO con mensaje
        // inline y la justificación PRESERVADA (antes se cerraba en
        // el finally y se perdía).
        setErrorAccion(
          res.error ?? "No se pudo registrar la decisión. Inténtelo de nuevo."
        );
        return;
      }
      // Éxito: confirmación visible ~1 s (antes este estado era
      // código muerto — el padre cerraba el modal al instante) y
      // luego cierre con toast de éxito (lo emite el padre).
      setActionDone(action);
      registrarTimeline(action, obsText);
      window.setTimeout(() => onClose(), 900);
    } finally {
      setResolving(null);
    }
  };

  const btnBase =
    "w-full py-2.5 font-label-caps font-bold rounded transition-all flex items-center justify-center gap-2 text-[12px] disabled:opacity-60 disabled:cursor-not-allowed";

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={`Modal de auditoría y reinspección del acta E-14 de ${mesaLabel}`}
      id="reinspection-modal"
    >
      <div className="bg-surface-container border border-[#242E2E] w-full max-w-[1440px] h-[92vh] flex flex-col shadow-2xl overflow-hidden rounded-md">
        {/* Cabecera del modal */}
        <header className="flex flex-wrap gap-3 justify-between items-center px-6 py-3 border-b border-[#242E2E] bg-[#090f0f] shrink-0">
          {/* LADO IZQUIERDO: trazabilidad del objetivo */}
          <div className="flex flex-col gap-1 min-w-[240px]">
            <div className="flex items-center gap-1 text-[11px] font-label-caps text-[#869583] tracking-widest uppercase">
              <span>AUDITORÍA DE ACTA E-14</span>
              <ChevronRight size={12} aria-hidden="true" />
              <span className="text-on-surface uppercase">{mesaLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-[#171d1d] border border-[#242E2E] px-2 py-0.5">
                <ShieldAlert
                  size={14}
                  className="text-error shrink-0"
                  aria-hidden="true"
                />
                <span className="text-headline-md font-headline-md font-bold text-on-surface px-2 tracking-tight text-[13px]">
                  {mesaLabel.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-label-caps text-[#869583]">
                <span className="px-2 py-0.5 bg-[#1b2121] border border-[#242E2E] text-primary font-stats-number text-[10px]">
                  FORMULARIO: {formulario}
                </span>
                {target?.anomaliaId && (
                  <span className="px-2 py-0.5 bg-[#1b2121] border border-[#242E2E] text-on-surface-variant font-stats-number text-[10px]">
                    ANOMALÍA: {target.anomaliaId.slice(0, 8)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* CENTRO: navegador de formulario y páginas */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Selector de tipo de formulario */}
            <div
              className="flex items-center bg-[#0e1414] border border-[#242E2E] p-1 rounded-sm"
              role="group"
              aria-label="Selector de tipo de formulario E-14"
            >
              <button
                onClick={() => setFormType("DELEGADOS")}
                aria-pressed={formType === "DELEGADOS"}
                className={`px-3 py-1 text-label-caps font-label-caps transition-all flex items-center gap-1.5 ${
                  formType === "DELEGADOS"
                    ? "font-bold bg-[#003912] text-primary border border-primary"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                }`}
              >
                <Badge size={14} aria-hidden="true" />
                <span>DELEGADOS</span>
              </button>
              <button
                onClick={() => setFormType("TRANSMISIÓN")}
                aria-pressed={formType === "TRANSMISIÓN"}
                className={`px-3 py-1 text-label-caps font-label-caps transition-all flex items-center gap-1.5 ${
                  formType === "TRANSMISIÓN"
                    ? "font-bold bg-[#003912] text-primary border border-primary"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                }`}
              >
                <Send size={14} aria-hidden="true" />
                <span>TRANSMISIÓN</span>
              </button>
            </div>

            <div className="w-px h-6 bg-[#242E2E]"></div>

            {/* Conmutador de folio / páginas */}
            <div
              className="flex items-center bg-[#0e1414] border border-[#242E2E] p-1 gap-1 rounded-sm"
              role="group"
              aria-label="Selector de página del formulario"
            >
              <button
                onClick={() => {
                  setActivePage(1);
                  setImgError(false);
                }}
                aria-pressed={activePage === 1}
                className={`px-3 py-1 text-label-caps font-label-caps transition-all flex items-center gap-1.5 border ${
                  activePage === 1
                    ? "border-primary text-primary bg-[#003912]/30 font-bold"
                    : "text-on-surface-variant hover:bg-surface-container-high border-transparent"
                }`}
              >
                <span>PÁGINA 1</span>
                <CheckCircle2
                  size={11}
                  className="text-primary"
                  aria-hidden="true"
                />
              </button>
              <button
                onClick={() => {
                  setActivePage(2);
                  setImgError(false);
                }}
                aria-pressed={activePage === 2}
                className={`px-3 py-1 text-label-caps font-label-caps font-bold transition-all flex items-center gap-1.5 border ${
                  activePage === 2
                    ? "text-error bg-[#410004]/20 border-error animate-pulse"
                    : "text-error hover:bg-surface-container-high border-transparent"
                }`}
              >
                <span>PÁGINA 2</span>
                <AlertTriangle
                  size={11}
                  className="bg-[#410004] text-error rounded"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          {/* LADO DERECHO: alerta y cerrar */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-[#410004]/20 border border-[#410004] text-error px-3 py-1.5 rounded-full">
              <AlertTriangle size={16} aria-hidden="true" />
              <span className="text-label-caps font-label-caps tracking-wider text-[10px]">
                MOTIVO: {tipoLabel}
              </span>
            </div>
            <button
              onClick={onClose}
              disabled={!!resolving}
              className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded transition-colors disabled:opacity-50"
              title="Cerrar ventana"
              aria-label="Cerrar ventana de auditoría"
            >
              <X size={22} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Contenido del modal */}
        <div className="flex flex-col md:flex-row flex-1 overflow-y-auto md:overflow-hidden relative">
          {/* Área principal: visor de imagen de alta resolución */}
          <div className="flex-1 min-h-[55vh] md:min-h-0 bg-surface-container-lowest relative overflow-hidden flex flex-col">
            {/* Barra de controles flotante */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-[#121919]/90 backdrop-blur p-1.5 border border-[#242E2E] shadow-xl rounded">
              <button
                onClick={handleZoomIn}
                className="p-1.5 hover:bg-surface-container-highest text-on-surface transition-colors flex items-center rounded"
                title="Acercar (+)"
                aria-label="Acercar imagen del acta"
              >
                <ZoomIn size={18} aria-hidden="true" />
              </button>
              <button
                onClick={handleZoomOut}
                className="p-1.5 hover:bg-surface-container-highest text-on-surface transition-colors flex items-center rounded"
                title="Alejar (-)"
                aria-label="Alejar imagen del acta"
              >
                <ZoomOut size={18} aria-hidden="true" />
              </button>
              <span
                className="text-[11px] font-stats-number text-[#869583] px-1 select-none"
                aria-live="polite"
              >
                {zoomLevel}%
              </span>
              <div className="w-px h-5 bg-[#242E2E] my-auto"></div>
              <button
                onClick={handleRotate}
                className="p-1.5 hover:bg-surface-container-highest text-on-surface transition-colors flex items-center rounded"
                title="Rotar 90°"
                aria-label="Rotar imagen 90 grados"
              >
                <RotateCw size={18} aria-hidden="true" />
              </button>
              <button
                onClick={handleContrastToggle}
                aria-pressed={highContrast}
                className={`p-1.5 transition-colors flex items-center rounded ${
                  highContrast
                    ? "bg-primary text-on-primary"
                    : "hover:bg-surface-container-highest text-on-surface"
                }`}
                title="Ajustar Contraste B/N"
                aria-label="Alternar alto contraste"
              >
                <Contrast size={18} aria-hidden="true" />
              </button>
              <div className="w-px h-5 bg-[#242E2E] my-auto"></div>
              <button
                onClick={handleReset}
                className="p-1.5 hover:bg-surface-container-highest text-on-surface transition-colors flex items-center rounded"
                title="Restablecer vista"
                aria-label="Restablecer vista de la imagen"
              >
                <Maximize size={18} aria-hidden="true" />
              </button>
            </div>

            {/* Flechas laterales de navegación rápida */}
            <button
              onClick={() => {
                setActivePage(1);
                setImgError(false);
              }}
              disabled={activePage === 1}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-[#0e1414]/90 hover:bg-surface-container-high border border-[#242E2E] text-on-surface hover:text-primary flex items-center justify-center transition-colors shadow-lg rounded disabled:opacity-40"
              title="Página anterior (Pág 1)"
              aria-label="Ir a página 1 del formulario"
            >
              <ChevronLeft size={24} aria-hidden="true" />
            </button>
            <button
              onClick={() => {
                setActivePage(2);
                setImgError(false);
              }}
              disabled={activePage === 2}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-[#0e1414]/90 hover:bg-surface-container-high border border-[#242E2E] text-on-surface hover:text-primary flex items-center justify-center transition-colors shadow-lg rounded disabled:opacity-40"
              title="Página siguiente (Pág 2)"
              aria-label="Ir a página 2 del formulario"
            >
              <ChevronRight size={24} aria-hidden="true" />
            </button>

            {/* Área de visualización de la imagen */}
            <div className="flex-1 flex items-center justify-center p-6 overflow-auto relative">
              <div
                style={{
                  transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                  filter: highContrast
                    ? "contrast(200%) brightness(120%)"
                    : "none",
                  transition: "transform 0.2s ease-out",
                }}
                className="w-full max-w-xl bg-[#1b2121] border-2 border-[#3c4a3c] flex flex-col shadow-2xl relative select-none rounded"
              >
                {/* Cabecera del formulario E-14 — [OLA3 3.3] ya no
                    afirma "DOCUMENTO VÁLIDO" para el folio que no está
                    bajo auditoría: el estado real es consulta/referencia. */}
                <div className="bg-[#090f0f] border-b border-[#242E2E] p-3 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {tipoAnomalia && enPaginaAuditada ? (
                      <span className="bg-error text-[#690005] text-[10px] font-bold px-1.5 py-0.5 rounded">
                        FOLIO BAJO AUDITORÍA
                      </span>
                    ) : tipoAnomalia ? (
                      <span className="bg-surface-container-highest text-on-surface-variant text-[10px] font-bold px-1.5 py-0.5 rounded">
                        FOLIO DE REFERENCIA
                      </span>
                    ) : (
                      <span className="bg-surface-container-highest text-on-surface-variant text-[10px] font-bold px-1.5 py-0.5 rounded">
                        VISTA DE CONSULTA
                      </span>
                    )}
                    <span className="text-[11px] font-stats-number text-[#dee4e3]">
                      FORMULARIO E-14 ({formType})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-stats-number text-primary border border-primary px-1.5 py-0.5 rounded">
                      FOLIO: 00{activePage}/002
                    </span>
                  </div>
                </div>

                {/* Imagen real del acta + marcos de detección de errores */}
                <div className="relative bg-[#121919]">
                  {imgError ? (
                    <div className="w-full aspect-[3/4] flex flex-col items-center justify-center gap-2 text-on-surface-variant">
                      <AlertTriangle size={28} className="text-error" aria-hidden="true" />
                      <span className="text-[11px] font-label-caps uppercase tracking-wider">
                        No se pudo cargar la imagen del acta
                      </span>
                      <span className="text-[10px] font-stats-number text-[#869583]">
                        {imagenUrl}
                      </span>
                    </div>
                  ) : (
                    <img
                      src={imagenUrl}
                      alt={`Acta E-14 de ${mesaLabel} — formulario ${formType}, página ${activePage}`}
                      className="block w-full h-auto opacity-95"
                      onError={() => setImgError(true)}
                      draggable={false}
                    />
                  )}

                  {/* [OLA3 3.3] Marcos de detección derivados del
                      tipoAnomalia REAL (antes "FIRMA JURADO 2 — NO
                      DETECTADA" y "CÓDIGO PARCIALMENTE ILEGIBLE" fijos
                      para CUALQUIER acta). Solo en el folio auditado;
                      la posición es ESTIMADA (no hay bounding boxes
                      del análisis persistidas). */}
                  {enPaginaAuditada && !imgError && overlayFirmas && (
                    <div
                      className="absolute left-[8%] right-[8%] bottom-[6%] h-[16%] border-2 border-dashed border-error bg-error/10 pointer-events-none rounded"
                      aria-hidden="true"
                    >
                      <div className="absolute -top-3 left-2 bg-[#410004] text-error text-[9px] font-label-caps px-1.5 py-0.5 flex items-center gap-1 rounded">
                        <AlertTriangle size={10} aria-hidden="true" />
                        FIRMAS DE JURADOS — NO DETECTADAS · POSICIÓN ESTIMADA
                      </div>
                    </div>
                  )}

                  {enPaginaAuditada && !imgError && overlayIlegible && (
                    <div
                      className="absolute left-[58%] right-[6%] top-[16%] h-[10%] border-2 border-dashed border-warning bg-warning/10 pointer-events-none rounded"
                      aria-hidden="true"
                    >
                      <div className="absolute -top-3 right-2 bg-[#544600] text-secondary-fixed-dim text-[9px] font-label-caps px-1.5 py-0.5 flex items-center gap-1 rounded">
                        <AlertTriangle size={10} aria-hidden="true" />
                        CÓDIGO PARCIALMENTE ILEGIBLE · POSICIÓN ESTIMADA
                      </div>
                    </div>
                  )}

                  {enPaginaAuditada && !imgError && overlayCodigo && (
                    <div
                      className="absolute left-[58%] right-[6%] top-[16%] h-[10%] border-2 border-dashed border-error bg-error/10 pointer-events-none rounded"
                      aria-hidden="true"
                    >
                      <div className="absolute -top-3 right-2 bg-[#410004] text-error text-[9px] font-label-caps px-1.5 py-0.5 flex items-center gap-1 rounded">
                        <AlertTriangle size={10} aria-hidden="true" />
                        CÓDIGO NO DETECTADO · POSICIÓN ESTIMADA
                      </div>
                    </div>
                  )}
                </div>

                {/* Pie del documento */}
                <div className="bg-[#090f0f] border-t border-[#242E2E] px-3 py-1.5 flex justify-between items-center">
                  <span className="text-[9px] font-stats-number text-[#869583]">
                    DIGITALIZACIÓN ORIGINAL · ALTA RESOLUCIÓN
                  </span>
                  <span className="text-[9px] font-stats-number text-[#869583]">
                    {mesaLabel.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Indicador inferior sutil de folio */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-[#121919]/90 border border-[#242E2E] px-3 py-1 text-[11px] font-label-caps text-[#869583] rounded-full shadow-md">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  activePage === 2 ? "bg-error animate-pulse" : "bg-primary"
                }`}
                aria-hidden="true"
              ></span>
              <span>
                PÁGINA {activePage} DE 2 — FORMULARIO {formType} (E-14)
              </span>
            </div>
          </div>

          {/* Panel lateral de decisiones (RF-2.3) */}
          <aside className="w-full md:w-80 border-t md:border-t-0 md:border-l border-[#242E2E] bg-surface-container-low p-5 flex flex-col justify-between shrink-0 overflow-y-auto">
            <div className="flex flex-col gap-5">
              {/* Confirmación de acción registrada — [OLA3 3.2] ahora
                  sí es visible: el modal se cierra ~1 s tras el éxito
                  (antes era código muerto). */}
              {actionDone && (
                <div
                  className={`p-3 rounded border text-center font-label-caps text-[11px] ${
                    actionDone === "APROBADA"
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-error/20 border-error text-error"
                  }`}
                  role="status"
                >
                  ✓ ACCIÓN REGISTRADA EXITOSAMENTE
                </div>
              )}

              {/* [OLA3 3.2] Error de la acción: mensaje inline, el modal
                  permanece abierto y la justificación NO se pierde. */}
              {errorAccion && (
                <div
                  className="p-3 rounded border border-error/60 bg-error/10 text-error font-label-caps text-[11px] flex items-start gap-2"
                  role="alert"
                >
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{errorAccion}</span>
                </div>
              )}

              {/* [OLA3 3.2] Mesa abierta SIN anomalía real: el visor es
                  de consulta — antes APROBAR lanzaba un POST sin
                  anomaliaId y fallaba con un 400 críptico. */}
              {sinAnomaliaReal && (
                <p
                  className="flex items-start gap-1.5 border border-outline-variant/40 bg-surface-container-lowest text-on-surface-variant p-2.5 rounded text-[10px] font-body-md"
                  role="note"
                >
                  <Info size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    MESA SIN ANOMALÍA ABIERTA — visor de consulta: no hay
                    decisión que registrar.
                  </span>
                </p>
              )}

              {/* Botones de decisión excluyentes */}
              <div>
                <h3 className="text-label-caps font-label-caps text-on-surface-variant mb-3 uppercase tracking-widest text-[11px]">
                  Acciones del Supervisor
                </h3>
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={() => handleResolve("APROBADA")}
                    disabled={!!resolving || sinAnomaliaReal}
                    title={
                      sinAnomaliaReal
                        ? "Sin anomalía abierta: no hay decisión que registrar"
                        : tipoAnomalia === "UBICACION_DISCREPANTE"
                          ? "Cerrar el caso de auditoría de ubicación (el acta ya es válida)"
                          : undefined
                    }
                    className={`${btnBase} bg-primary text-on-primary hover:brightness-110 active:scale-98 shadow-lg shadow-primary/20`}
                    aria-label={
                      tipoAnomalia === "UBICACION_DISCREPANTE"
                        ? "Cerrar el caso de auditoría de ubicación"
                        : "Aprobar el acta y marcarla como válida"
                    }
                  >
                    {resolving === "APROBADA" ? (
                      <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <BadgeCheck size={18} aria-hidden="true" />
                    )}
                    {resolving === "APROBADA"
                      ? "REGISTRANDO DECISIÓN..."
                      : tipoAnomalia === "UBICACION_DISCREPANTE"
                        ? "AUDITAR Y CERRAR CASO"
                        : "APROBAR Y MARCAR COMO VÁLIDA"}
                  </button>
                  {/* [post-4.4] CONFIRMAR RESCANEO no aplica a la
                      discrepancia de ubicación: el acta ES válida — el
                      caso es de auditoría (quién declaró mal la mesa),
                      no de calidad de imagen. */}
                  {tipoAnomalia !== "UBICACION_DISCREPANTE" && (
                    <button
                      onClick={() => handleResolve("RESCANEO_CONFIRMADO")}
                      disabled={!!resolving || sinAnomaliaReal}
                      title={
                        sinAnomaliaReal
                          ? "Sin anomalía abierta: no hay decisión que registrar"
                          : undefined
                      }
                      className={`${btnBase} border border-error bg-[#410004]/10 text-error hover:bg-error/20 active:scale-98`}
                      aria-label="Confirmar el rescaneo del acta"
                    >
                      {resolving === "RESCANEO_CONFIRMADO" ? (
                        <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <RotateCcw size={18} aria-hidden="true" />
                      )}
                      {resolving === "RESCANEO_CONFIRMADO"
                        ? "REGISTRANDO DECISIÓN..."
                        : "CONFIRMAR RESCANEO"}
                    </button>
                  )}
                </div>
              </div>

              {/* Justificación obligatoria */}
              <div className="flex flex-col">
                <label
                  htmlFor="justificacion-reinspeccion"
                  className="text-label-caps font-label-caps text-on-surface-variant mb-1.5 uppercase text-[11px]"
                >
                  Justificación (obligatoria)
                </label>
                <textarea
                  id="justificacion-reinspeccion"
                  value={justificacion}
                  onChange={(e) => setJustificacion(e.target.value)}
                  disabled={!!resolving}
                  aria-describedby="justificacion-hint"
                  aria-invalid={!!errorJust}
                  className="bg-surface-container-lowest border border-[#242E2E] p-2.5 text-body-md font-body-md text-on-surface focus:border-primary focus:ring-0 resize-none h-[88px] text-[12px] rounded disabled:opacity-60"
                  placeholder="Ingrese el motivo de la decisión..."
                ></textarea>
                <div className="flex justify-between items-center mt-1">
                  <span
                    id="justificacion-hint"
                    className={`text-[9px] font-stats-number ${
                      errorJust ? "text-error" : "text-on-surface-variant"
                    }`}
                    role={errorJust ? "alert" : undefined}
                  >
                    {errorJust ?? `Mínimo ${MIN_JUSTIFICACION} caracteres`}
                  </span>
                  <span className="text-[9px] font-stats-number text-[#869583]">
                    {charCount}/{MIN_JUSTIFICACION}
                  </span>
                </div>
              </div>

              {/* Historial y trazabilidad — [OLA3 3.3] marcado como
                  evidencia simulada: la timeline inicial es
                  ilustrativa, no un audit trail real por evento. */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-widest text-[10px]">
                    HISTORIAL Y TRAZABILIDAD
                  </h3>
                  <DemoBadge
                    texto="EVIDENCIA SIMULADA"
                    motivo="La línea de tiempo inicial es ilustrativa: no hay audit trail por evento persistido en esta build. La decisión que registre SÍ queda en la bitácora de auditoría."
                  />
                </div>
                <div className="flex flex-col gap-3 relative pl-4 border-l border-outline-variant ml-1.5">
                  {timeline.map((item, idx) => (
                    <div key={`${item.time}-${idx}`} className="relative">
                      <div
                        className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full ${item.color} border-2 border-surface-container-low`}
                      ></div>
                      <div className="flex flex-col">
                        <span
                          className={`text-[11px] font-bold ${item.textColor} leading-tight`}
                        >
                          {item.time} — {item.title}
                        </span>
                        <span className="text-[10px] text-on-surface-variant leading-normal mt-0.5">
                          {item.desc}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Nota de Audit Trail — [B-5] honesta: el backend registra
                usuario/acción/detalle/fecha; NO guarda IP ni hash. */}
            <div className="pt-3 border-t border-[#242E2E] mt-4">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <Info size={14} aria-hidden="true" className="shrink-0" />
                <span className="text-[9px] uppercase tracking-wider">
                  La decisión quedará registrada en la bitácora de auditoría
                  (usuario, acción, detalle, fecha).
                </span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
