"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — Pantalla REVISIÓN DE ACTA
// Diseño oficial: revisión envío automático (verde 9-10),
// advertencia (ámbar 6-8) y rechazada (rojo ≤5).
// Incluye el panel de verificación cruzada QR ↔ imagen (VLM)
// desplegable con el chip REVISAR del diseño.
//
// Pack micro-UX FASE 2 (rol A, canon §4.2):
//   · CTA fijo inferior (sticky action bar) — los botones ya no
//     quedan bajo el fold en pantallas ≤700px.
//   · Indicador de scroll "▼ MÁS CONTENIDO" cuando hay más texto.
//   · Tap-para-ampliar / pinch-zoom en el visor (VistaAmpliable).
//   · Imagen rechazada SIN blur: el operador puede ver qué se le
//     rechaza (overlay explicativo sí, ocultar el documento no).
//   · Rotación ±90° desde el ORIGINAL (D-13): dos botones.
//   · Back-arrow y chips con targets ≥ 44px (§4.2.6).
//   · D-21: con la imagen en banda roja el identificador muestra
//     su veredicto pero SIN acciones operativas (el envío está
//     deshabilitado: repita la foto).
//   · D-15: acceso a "RANURAS OCUPADAS" desde la barra de
//     herramientas y desde el veredicto DESCARTAR del guard.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  Cloud,
  Crop,
  DoorOpen,
  FileSearch,
  Loader2,
  QrCode,
  RotateCcw,
  RotateCw,
  ScanLine,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import type { ActaAnalysis, AsignacionActa, CapturaProcesada, VerificacionActa } from "@/lib/types";
import type { ResultadoIntegracion } from "@/lib/integracion-captura";
import { bandaScore, ubicacionLinea, type CapturaContexto } from "./shared";
import { PanelIdentificacion } from "./PanelIdentificacion";
import { EditorRecorte } from "./EditorRecorte";
import { EditorRanuras } from "./EditorRanuras";
import { VistaAmpliable } from "./VistaAmpliable";
// [COORD C-15] Componentes de diseño Stitch v2 (sólo capa visual)
import { BadgeEstado, ChipHud } from "./stitch";
import type { QuadNormalizado } from "@/lib/types";

interface PantallaRevisionProps {
  ctx: CapturaContexto | null;
  imagen: string;
  qrTexto: string | null;
  analisis: ActaAnalysis | null;
  verificacion: VerificacionActa | null;
  asignacion: AsignacionActa | null;
  analizando: boolean;
  enviando: boolean;
  /** El servidor rechazó el envío (p. ej. QR duplicado) */
  envioRechazado?: boolean;
  reintentosPliego: number;
  /** Rol A · F-DEFER-CROP: el recorte automático sigue aterrizando */
  procesandoRecorte?: boolean;
  /** Rol A · OCR local diferido en curso (señales de texto) */
  ocrBusy?: boolean;
  /** Señales crudas de la captura (contrato rol A → rol C) */
  senales?: CapturaProcesada | null;
  // ---- D-03/D-04 (rol A): recorte honesto + editor de esquinas ----
  /** El recorte automático falló y el acta no llena el frame */
  recorteFallo?: boolean;
  /** Editor de esquinas abierto */
  editorActivo?: boolean;
  /** Imagen ORIGINAL (sin recortar) para el editor */
  imagenOriginal?: string | null;
  /** Quad actual (base del editor) */
  quadActual?: QuadNormalizado | null;
  /** Re-procesado (recorte o rotación) en curso */
  reprocesando?: boolean;
  onAbrirEditor?: () => void;
  onConfirmarRecorte?: (quad: QuadNormalizado) => void;
  onCancelarEditor?: () => void;
  onVolver: () => void;
  onReintentarFoto: () => void;
  /** D-13: rotación desde el ORIGINAL · 1 = horario, -1 = antihorario */
  onRotar: (senso: 1 | -1) => void;
  onContingencia: () => void;
  onEnviarAdvertencia: () => void;
  // ---- FASE 1 (rol C): identificador determinista integrado ----
  /** Resultado de la cadena normalizar → identificar → clasificar → guard */
  integracion?: ResultadoIntegracion | null;
  /** Índice de actas cargando / identificación en curso */
  identificando?: boolean;
  /** Entrada manual de respaldo del código entre las X (mismo normalizador) */
  onIdentificarManual?: (codigoCrudo: string) => void;
  /** Guard permitió ALMACENAR/REEMPLAZAR · confirmar con VALIDADO */
  onConfirmarValidacion?: () => void;
  /** Guard permitió ALMACENAR/REEMPLAZAR · registrar sin validar (EN_COLA) */
  onRegistrarEnCola?: () => void;
  /** FASE 1 (rol C): el envío RN-02 está diferido a la espera del veredicto
   *  del identificador (o de la entrada manual del código X) */
  autoPendiente?: boolean;
  /** D-15: re-corre la identificación tras liberar una ranura del guard */
  onRanuraLiberada?: () => void;
}

const ChipCruce: React.FC<{ ok: boolean | null; label: string }> = ({ ok, label }) => (
  // [COORD C-15] Chip de cruce estilo industrial mono (recto, 1px)
  <span
    className={`data-mono px-2 py-0.5 rounded-sm font-semibold text-[10px] border ${
      ok === true
        ? "bg-brand-500/15 text-brand-400 border-brand-500/40"
        : ok === false
          ? "bg-destructive/10 text-destructive border-destructive/50"
          : "bg-ink-700 text-white/70 border-white/15"
    }`}
  >
    {label} {ok === true ? "✓" : ok === false ? "✗" : "—"}
  </span>
);

function PantallaRevisionBase({
  ctx,
  imagen,
  qrTexto,
  analisis,
  verificacion,
  asignacion,
  analizando,
  enviando,
  envioRechazado,
  reintentosPliego,
  procesandoRecorte,
  ocrBusy,
  senales,
  recorteFallo = false,
  editorActivo = false,
  imagenOriginal = null,
  quadActual = null,
  reprocesando = false,
  onAbrirEditor,
  onConfirmarRecorte,
  onCancelarEditor,
  onVolver,
  onReintentarFoto,
  onRotar,
  onContingencia,
  onEnviarAdvertencia,
  integracion = null,
  identificando = false,
  onIdentificarManual,
  onConfirmarValidacion,
  onRegistrarEnCola,
  autoPendiente = false,
  onRanuraLiberada,
}: PantallaRevisionProps) {
  const [detalleAbierto, setDetalleAbierto] = useState(false);
  const [senalesAbierto, setSenalesAbierto] = useState(false);
  const [ranurasAbiertas, setRanurasAbiertas] = useState(false);

  // D-22/§4.2.2: indicador de scroll — "▼ MÁS CONTENIDO" solo cuando
  // el contenedor central tiene texto fuera de la vista.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const evaluarScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setHayMas(el.scrollTop + el.clientHeight < el.scrollHeight - 24);
  }, []);
  // Auto-evaluación tras cada render (el contenido crece cuando aterrizan
  // tarjetas: análisis, señales, integración) sin listeners costosos.
  useEffect(() => {
    const id = requestAnimationFrame(evaluarScroll);
    return () => cancelAnimationFrame(id);
  }, [evaluarScroll]);

  const score = analisis?.scoreCalidad ?? null;
  const banda = score != null ? bandaScore(score) : null;
  // RN-02 completo (score ≥9 + firmas): el envío automático está ARMADO;
  // si falta alguno (p. ej. firmas sin confirmar por el VLM) NO lo está.
  const autoArmado =
    (analisis?.scoreCalidad ?? 0) >= 9 && (analisis?.firmasDetectadas ?? false);
  const problemas = analisis?.problemas ?? [];
  const etiquetaProblema =
    problemas.find((p) => p !== "falta de firmas") ?? problemas[0] ?? "REVISAR CALIDAD";

  const puestoNombre = ctx?.consulado.puesto.toUpperCase() ?? "UBICACIÓN PENDIENTE";
  const ubicacion = ctx ? ubicacionLinea(ctx) : "SIN ASIGNAR · REQUIERE CONTINGENCIA";
  const cruceUbicacion = verificacion?.coincidenUbicacion ?? null;
  const cruceEjemplar = verificacion?.coincidenEjemplar ?? null;
  const emergencia = reintentosPliego >= 2; // RN-03
  // [COORD C-15] color del marco del visor por banda (ámbar/rojo; verde = brand)
  const bordeVisorBanda =
    banda === "amarillo" ? "#ffb95f" : banda === "rojo" ? "#ef4444" : undefined;

  return (
    // [COORD C-15] Family brand glow sobre ink (fondo negro del diseño v2)
    <div className="h-full flex flex-col bg-ink-950 relative">
      {/* ---- Zona deslizable: top bar + tarjetas + visor ---- */}
      <div
        ref={scrollRef}
        onScroll={evaluarScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col"
      >
        {/* ---- Top bar (diseño Stitch v2: ← REVISIÓN DE ACTA · E-14 · sync) ---- */}
        <header className="bg-ink-950/95 backdrop-blur w-full border-b border-white/5 flex items-center justify-between px-3 h-[64px] shrink-0 z-10 sticky top-0">
          <button
            type="button"
            onClick={onVolver}
            aria-label="Volver a la cámara"
            className="h-11 w-11 -ml-1 flex items-center justify-center text-brand-500 hover:bg-white/10 rounded-full active:scale-95 transition-transform"
          >
            <ArrowLeft size={22} aria-hidden />
          </button>
          <div className="flex min-w-0 flex-col items-center">
            <h1 className="text-base font-extrabold uppercase tracking-wider text-brand-500 truncate">
              REVISIÓN DE ACTA
            </h1>
            <span className="data-mono text-[9px] uppercase tracking-[0.25em] text-white/40" aria-hidden>
              E-14
            </span>
          </div>
          {/* [COORD C-15] Indicador de sincronización RN-02 — sólo durante el envío real
              (honestidad de datos: sin envío en curso no hay pulso que mostrar) */}
          <div className="flex min-w-[44px] items-center justify-end -mr-1">
            {enviando && (
              <span
                role="status"
                aria-label="Enviando al servidor central"
                className="flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-900/60 px-2 py-1"
              >
                <span className="h-2 w-2 animate-pulse-sync rounded-full bg-brand-500" />
                <Cloud className="h-3.5 w-3.5 fill-current text-brand-400" aria-hidden />
              </span>
            )}
          </div>
        </header>

        {/* ---- Tarjeta de estado y metadatos ---- */}
        <div className="p-4 flex flex-col gap-3 shrink-0">
          {/* Estado: analizando */}
          {(!analisis || analizando) && (
            <div className="bg-brand-500/10 border border-brand-500/40 rounded-xl p-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-label-caps text-label-caps text-brand-400 data-mono flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  ANALIZANDO CON VISIÓN ARTIFICIAL…
                </span>
                {qrTexto && (
                  // [COORD C-15] chip HUD mono del diseño
                  <ChipHud className="border-brand-500/50 bg-brand-500/15 text-brand-400">
                    <QrCode size={11} aria-hidden /> QR LEÍDO
                  </ChipHud>
                )}
              </div>
              <span className="data-mono text-[10px] text-white/50">
                CALIDAD · FIRMAS · CÓDIGO DE BARRAS · DATOS DIVIPOL
              </span>
            </div>
          )}

          {/* Rol A · F-DEFER-CROP: el recorte automático aterriza en segundo plano */}
          {procesandoRecorte && (
            <div
              className="bg-brand-500/10 border border-brand-500/40 rounded-xl p-3 flex items-center gap-2"
              role="status"
            >
              <Loader2 size={14} className="animate-spin text-brand-400 shrink-0" aria-hidden />
              <span className="font-label-caps text-[11px] text-brand-400 data-mono">
                AJUSTANDO RECORTE AUTOMÁTICO…
              </span>
              <span className="font-label-caps text-[10px] text-white/50 data-mono">
                PERSPECTIVA + FILTRO B/N
              </span>
            </div>
          )}

          {/* Rol A · OCR local diferido (señales para el identificador) */}
          {ocrBusy && !procesandoRecorte && (
            <div
              className="bg-ink-800 border border-white/10 rounded-xl px-3 py-2 flex items-center gap-2"
              role="status"
            >
              <FileSearch size={13} className="animate-pulse text-brand-400 shrink-0" aria-hidden />
              <span className="font-label-caps text-[10px] text-white/60 data-mono">
                LEYENDO TEXTO DEL ACTA (OCR EN EL DISPOSITIVO)…
              </span>
            </div>
          )}

          {/* D-03 · banda ámbar: el recorte automático NO se aplicó y el
              acta no llena el frame — el operador NUNCA queda sin aviso */}
          {recorteFallo && !procesandoRecorte && !editorActivo && (
            <div
              className="bg-ind-secondary/10 border border-ind-secondary/50 rounded-xl p-3 flex flex-col gap-2"
              role="alert"
            >
              <span className="font-label-caps text-[11px] text-ind-secondary data-mono flex items-center gap-2">
                ⚠️ RECORTE AUTOMÁTICO NO APLICADO
              </span>
              <span className="text-[11px] text-white/60 leading-snug">
                Ajuste las esquinas o repita la foto — la imagen puede quedar con mesa y fondo.
              </span>
              <button
                type="button"
                onClick={onAbrirEditor}
                className="min-h-[44px] w-full flex items-center justify-center gap-1 py-2 rounded-none bg-ind-secondary/15 border border-ind-secondary/60 text-ind-secondary font-label-caps text-label-caps data-mono hover:bg-ind-secondary/25 active:scale-[0.98] transition-transform"
              >
                <Crop size={14} aria-hidden /> AJUSTAR RECORTE
              </button>
            </div>
          )}

          {/* Estado: verde (AUTO ≥9 + firmas) — banner brand con glow suave */}
          {analisis && !analizando && banda === "verde" && (
            <div
              className="bg-brand-500/10 border border-brand-500/40 rounded-xl p-3 shadow-glow-emerald flex flex-col gap-1"
              role="status"
            >
              {/* [COORD C-15] Score RN-02 como chip grande con banda verde */}
              <div className="flex items-center justify-between gap-2">
                <span className="font-label-caps text-label-caps text-brand-400 data-mono flex items-center gap-2 min-w-0">
                  {enviando ? (
                    <Loader2 size={16} className="animate-spin shrink-0" aria-hidden />
                  ) : (
                    <ShieldCheck size={16} className="shrink-0" aria-hidden />
                  )}
                  CALIDAD DE IMAGEN
                </span>
                <span className="data-mono shrink-0 rounded-sm border border-brand-500/50 bg-brand-500/15 px-2 py-0.5 text-lg font-bold leading-none text-brand-400">
                  {analisis.scoreCalidad}/10
                </span>
              </div>
              <div className="mt-1">
                <div className="font-label-caps text-brand-400 text-[15px] font-bold tracking-tight uppercase">
                  {puestoNombre}
                </div>
                {/* [COORD C-15] Ruta DIVIPOL mono en mayúsculas con separadores ">" */}
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="data-mono text-[10px] font-semibold uppercase tracking-wider text-ind-on-surface-var truncate">
                    {ubicacion}
                  </span>
                  <BadgeEstado
                    estado={
                      envioRechazado ? "RECHAZADO" : autoArmado ? "AUTO" : "ADVERTENCIA"
                    }
                  />
                </div>
              </div>
              <p className={`text-[11px] leading-snug mt-1 ${envioRechazado ? "text-destructive" : "text-brand-400"}`}>
                {envioRechazado
                  ? "🚫 Envío rechazado — revise el aviso superior."
                  : enviando
                    ? "Transmitiendo automáticamente al servidor…"
                    : autoPendiente
                      ? "⏳ Verificación determinista pendiente: digite el código entre las X o repita la foto."
                      : autoArmado
                        ? "⏳ Envío automático en verificación…"
                        : "⚠️ Calidad OK, firmas sin confirmar: la hoja aún no se envió. Repita la foto."}
              </p>
            </div>
          )}

          {/* Estado: ámbar (6-8) — banner ind-secondary con triángulo (diseño 8/10) */}
          {analisis && !analizando && banda === "amarillo" && (
            <div className="bg-ind-secondary/10 border border-ind-secondary/60 rounded-xl p-3 flex flex-col gap-1.5 shadow-[0_0_15px_rgba(255,185,95,0.15)]">
              <div className="flex items-start justify-between gap-2">
                <span className="font-label-caps text-[11px] font-bold text-ind-secondary tracking-wide flex items-center gap-1 min-w-0">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                  </svg>
                  CALIDAD DE IMAGEN — ADVERTENCIA: {etiquetaProblema.toUpperCase()}
                </span>
                {/* [COORD C-15] Score chip + REVISAR (diseño 8/10 advertencia) */}
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="data-mono rounded-sm border border-ind-secondary/50 bg-ind-secondary/15 px-2 py-0.5 text-lg font-bold leading-none text-ind-secondary">
                    {analisis.scoreCalidad}/10
                  </span>
                  <button
                    type="button"
                    onClick={() => setDetalleAbierto((v) => !v)}
                    className="min-h-[44px] px-3 rounded-none bg-ind-secondary/15 text-ind-secondary data-mono text-[10px] font-bold tracking-wider border border-ind-secondary/40 shrink-0"
                    aria-expanded={detalleAbierto}
                  >
                    REVISAR
                  </button>
                </span>
              </div>
              <div className="mt-0.5">
                <div className="font-label-caps text-brand-400 text-[16px] font-bold tracking-tight uppercase">
                  {puestoNombre}
                </div>
                <div className="data-mono text-[10px] font-semibold uppercase tracking-wider text-ind-on-surface-var mt-0.5">
                  {ubicacion}
                </div>
              </div>
              {cruceUbicacion === false && (
                <p className="font-label-caps text-[11px] text-destructive leading-tight mt-1">
                  ⚠️ VERIFICACIÓN CRUZADA FALLÓ: EL QR NO COINCIDE CON LOS DATOS DE LA IMAGEN
                </p>
              )}
              <p className="text-[11px] text-ind-secondary leading-snug mt-1 flex items-start gap-1">
                <span>⚠️</span>
                <span>
                  Información legible. Se sugiere repetir la foto o continuar bajo su
                  responsabilidad.
                </span>
              </p>
            </div>
          )}

          {/* Estado: rojo (≤5) — banner destructive */}
          {analisis && !analizando && banda === "rojo" && (
            <div className="bg-destructive/10 border border-destructive/70 rounded-xl p-3 flex flex-col gap-1.5 shadow-[0_0_16px_rgba(239,68,68,0.25)]">
              <div className="flex items-start justify-between gap-2">
                <span className="font-label-caps text-xs font-bold text-destructive tracking-wide min-w-0">
                  CALIDAD DE IMAGEN — 🚫 ERROR CRÍTICO: {etiquetaProblema.toUpperCase()}
                </span>
                {/* [COORD C-15] Score chip grande con banda roja */}
                <span className="data-mono shrink-0 rounded-sm border border-destructive/60 bg-destructive/15 px-2 py-0.5 text-lg font-bold leading-none text-destructive">
                  {analisis.scoreCalidad}/10
                </span>
              </div>
              <div className="mt-0.5">
                <div className="font-label-caps text-white text-[15px] font-bold tracking-tight uppercase">
                  {puestoNombre}
                </div>
                <div className="data-mono text-[10px] font-semibold uppercase tracking-wider text-white/50 mt-0.5">
                  {ubicacion}
                </div>
              </div>
              <div className="mt-1 pt-1.5 border-t border-destructive/30 flex items-center gap-1.5">
                <p className="text-[12px] font-semibold text-red-300 leading-snug">
                  🚫 No se detectan datos legibles ni código E-14. El envío de esta foto está
                  deshabilitado.
                </p>
              </div>
            </div>
          )}

          {/* Rol A · Señales crudas de la captura (contrato rol A → rol C).
              Alimentan al identificador determinista en la FASE 1. */}
          {senales && !procesandoRecorte && (
            <div className="bg-ink-900 border border-ink-border rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="data-mono text-[10px] text-white/60 flex items-center gap-1.5">
                  <ScanLine size={12} className="text-brand-400" aria-hidden />
                  SEÑALES DE CAPTURA · IDENTIFICADOR DETERMINISTA
                </span>
                <button
                  type="button"
                  onClick={() => setSenalesAbierto((v) => !v)}
                  className="min-h-[44px] px-3 rounded-none bg-ink-700 text-white/70 data-mono text-[10px] font-semibold border border-white/15 hover:text-white"
                  aria-expanded={senalesAbierto}
                >
                  {senalesAbierto ? "OCULTAR" : "VER"}
                </button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <ChipCruce ok={senales.calidad.nitidez >= 0.4} label={`NITIDEZ ${Math.round(senales.calidad.nitidez * 100)}%`} />
                <ChipCruce ok={senales.calidad.contraste >= 0.4} label={`CONTRASTE ${Math.round(senales.calidad.contraste * 100)}%`} />
                <ChipCruce ok={senales.calidad.brillo >= 0.4} label={`BRILLO ${Math.round(senales.calidad.brillo * 100)}%`} />
                <ChipCruce ok={Boolean(senales.barcode15)} label="BARCODE15" />
                <ChipCruce ok={Boolean(senales.qrTexto)} label="QR" />
              </div>
              {senalesAbierto && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="data-mono text-[10px] text-white/50">
                      CÓDIGO X (CRUDO)
                    </span>
                    <code className="data-mono text-[11px] text-brand-400 break-all bg-black/60 border border-white/10 rounded-sm px-2 py-1">
                      {senales.codigoXCrudo ?? "— SIN LEER AÚN —"}
                    </code>
                  </div>
                  {senales.encabezadoCrudo && (
                    <div className="flex flex-col gap-0.5">
                      <span className="data-mono text-[10px] text-white/50">
                        ENCABEZADO DIVIPOL (CRUDO)
                      </span>
                      <code className="data-mono text-[11px] text-white break-all bg-black/60 border border-white/10 rounded-sm px-2 py-1">
                        {[
                          senales.encabezadoCrudo.pais,
                          senales.encabezadoCrudo.zona,
                          senales.encabezadoCrudo.puesto,
                          senales.encabezadoCrudo.mesa,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </code>
                    </div>
                  )}
                  {senales.textoSuperior && (
                    <div className="flex flex-col gap-0.5">
                      <span className="data-mono text-[10px] text-white/50">
                        TEXTO OCR (TERCIO SUPERIOR)
                      </span>
                      <pre className="data-mono text-[10px] text-white/60 bg-black/60 border border-white/10 rounded-sm px-2 py-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-all">
                        {senales.textoSuperior.slice(0, 600)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Detalle de verificación (chip REVISAR) */}
          {detalleAbierto && verificacion && (
            <div className="bg-ink-900 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <span className="data-mono text-[11px] text-white/60">
                  VERIFICACIÓN QR ↔ IMAGEN (DIVIPOL)
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <ChipCruce ok={cruceUbicacion} label="UBICACIÓN" />
                  <ChipCruce ok={cruceEjemplar} label="EJEMPLAR" />
                </div>
              </div>
              {qrTexto && (
                <div className="flex flex-col gap-0.5">
                  <span className="data-mono text-[10px] text-white/50">QR DECODIFICADO</span>
                  <code className="data-mono text-[11px] text-brand-400 break-all bg-black/60 border border-white/10 rounded-sm px-2 py-1">
                    {qrTexto}
                  </code>
                </div>
              )}
              {asignacion?.origen && (
                <span className="data-mono text-[10px] text-white/50">
                  ASIGNACIÓN: {asignacion.origen} · CONFIANZA {Math.round(asignacion.confianza * 100)}%
                  {asignacion.mesaLabel ? ` · ${asignacion.mesaLabel}` : ""}
                </span>
              )}
              {verificacion.notas.length > 0 && (
                <ul className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
                  {verificacion.notas.map((n, i) => (
                    <li key={i} className="text-body-md text-[11px] text-white/60 flex gap-1">
                      <span className="text-brand-400 shrink-0">·</span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* FASE 1 (rol C): identificador determinista + código X manual.
              D-21: en banda roja el panel muestra el veredicto SIN acciones
              (la tarjeta roja ya dice que el envío está deshabilitado). */}
          {(integracion || identificando || onIdentificarManual) && (
            <PanelIdentificacion
              integracion={integracion}
              identificando={identificando}
              enviando={enviando}
              accionesBloqueadas={banda === "rojo"}
              onIdentificarManual={(c) => onIdentificarManual?.(c)}
              onConfirmarValidacion={onConfirmarValidacion}
              onRegistrarEnCola={onRegistrarEnCola}
              onAbrirRanuras={() => setRanurasAbiertas(true)}
            />
          )}

          {/* Sin ubicación asignada → contingencia */}
          {!ctx && analisis && !analizando && banda !== "rojo" && (
            <button
              type="button"
              onClick={onContingencia}
              className="min-h-[44px] rounded-none border border-ind-secondary/60 bg-ink-800 text-ind-secondary data-mono font-label-caps text-label-caps flex items-center justify-center gap-2 hover:bg-ind-secondary/10 transition-colors"
            >
              ASIGNAR UBICACIÓN MANUALMENTE (CONTINGENCIA)
            </button>
          )}
        </div>

        {/* ---- Visor de previsualización (tap-para-ampliar, §4.2.3) ---- */}
        <div className="flex-grow relative w-full flex flex-col items-center justify-center px-4 min-h-[260px] pb-2">
          {/* [COORD C-15] Panel del visor sobre ink-900 con esquinas de guía */}
          <div className="w-full max-w-sm relative mx-auto h-[320px] flex items-center justify-center rounded-2xl border border-ink-border bg-ink-900 p-2">
            <div
              className="scanner-frame w-full h-full flex items-center justify-center bg-black"
              style={{ "--primary": "#00e676", borderColor: bordeVisorBanda } as React.CSSProperties}
            >
              <div className="scanner-frame-inner flex items-center justify-center overflow-hidden relative">
                {/* §4.2.7 — imagen rechazada SIN blur: el operador ve qué se
                    le rechaza; el overlay solo acompaña, no oculta. */}
                <VistaAmpliable
                  src={imagen}
                  alt="Acta E-14 digitalizada"
                  className="w-full h-full object-contain opacity-90 cursor-zoom-in"
                />
                {banda === "rojo" && (
                  <div className="absolute inset-0 bg-red-950/40 flex flex-col items-center justify-center p-4 text-center pointer-events-none">
                    <div className="bg-destructive/90 text-white data-mono text-[10px] font-bold px-3 py-1.5 rounded-sm uppercase tracking-wider shadow-lg flex items-center gap-1 mb-1">
                      <ShieldX size={14} aria-hidden />
                      IMAGEN RECHAZADA
                    </div>
                    <span className="text-[11px] data-mono text-red-200 font-semibold tracking-wide bg-black/80 px-2 py-0.5 rounded-sm border border-destructive/50">
                      {etiquetaProblema.toUpperCase()} / NO APTO PARA TRANSMISIÓN
                    </span>
                  </div>
                )}
                {/* D-03/D-04 · editor de esquinas sobre la imagen ORIGINAL */}
                {editorActivo && imagenOriginal && (
                  <EditorRecorte
                    imagen={imagenOriginal}
                    quadInicial={quadActual}
                    onConfirmar={(q) => onConfirmarRecorte?.(q)}
                    onCancelar={() => onCancelarEditor?.()}
                    ocupado={reprocesando}
                  />
                )}
              </div>
            </div>
          </div>
          <span className="data-mono text-[9px] text-white/40 mt-2">
            TOQUE LA IMAGEN PARA AMPLIARLA
          </span>
        </div>

        {/* §4.2.2 · indicador de contenido restante */}
        {hayMas && (
          <div className="shrink-0 flex justify-center pb-2 -mt-1">
            <span
              role="status"
              className="data-mono text-[9px] text-white/60 bg-ink-800 border border-white/10 rounded-full px-3 py-1"
            >
              ▼ MÁS CONTENIDO
            </span>
          </div>
        )}
      </div>

      {/* ---- CTA fijo inferior (§4.2.1 sticky action bar, diseño ink) ---- */}
      <div className="shrink-0 border-t border-white/10 bg-ink-950/95 backdrop-blur px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col gap-3">
        {/* Herramientas de ajuste: REPETIR · ROTAR ↺ ↻ (D-13, desde el
            ORIGINAL, disponible siempre) · RECORTAR (editor D-04) · RANURAS
            [COORD C-15] botones rectos oscuros con texto verde */}
        <div className="flex items-stretch justify-center gap-2">
          <button
            type="button"
            onClick={onReintentarFoto}
            className="flex-1 flex items-center justify-center gap-1 py-2 px-1 min-h-[44px] rounded-none bg-ink-700 border border-ind-outline-variant/40 text-brand-400 data-mono text-[11px] font-semibold hover:bg-ink-600 transition-colors"
          >
            <RotateCcw size={14} aria-hidden /> REPETIR
          </button>
          <button
            type="button"
            onClick={() => onRotar(-1)}
            disabled={reprocesando}
            title="Rotar 90° a la izquierda (desde el original)"
            aria-label="Rotar 90 grados a la izquierda"
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1 py-2 px-1 rounded-none bg-ink-700 border border-ind-outline-variant/40 text-brand-400 data-mono text-[11px] font-semibold hover:bg-ink-600 transition-colors disabled:opacity-40"
          >
            <RotateCcw size={14} aria-hidden /> ROTAR
          </button>
          <button
            type="button"
            onClick={() => onRotar(1)}
            disabled={reprocesando}
            title="Rotar 90° a la derecha (desde el original)"
            aria-label="Rotar 90 grados a la derecha"
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1 py-2 px-1 rounded-none bg-ink-700 border border-ind-outline-variant/40 text-brand-400 data-mono text-[11px] font-semibold hover:bg-ink-600 transition-colors disabled:opacity-40"
          >
            <RotateCw size={14} aria-hidden /> ROTAR
          </button>
          <button
            type="button"
            onClick={onAbrirEditor}
            disabled={!onAbrirEditor || !imagenOriginal || reprocesando}
            title="AJUSTAR LAS ESQUINAS DEL RECORTE MANUALMENTE"
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1 py-2 px-1 rounded-none bg-ink-700 border border-ind-outline-variant/40 text-brand-400 data-mono text-[11px] font-semibold hover:bg-ink-600 transition-colors disabled:opacity-40"
          >
            <Crop size={14} aria-hidden /> RECORTAR
          </button>
          <button
            type="button"
            onClick={() => setRanurasAbiertas(true)}
            title="VER Y DESCARTAR RANURAS OCUPADAS DEL GUARD"
            aria-label="Ver ranuras ocupadas"
            className="min-h-[44px] px-2.5 flex items-center justify-center gap-1 rounded-none bg-ink-700 border border-ind-outline-variant/40 text-white/70 data-mono text-[11px] font-semibold hover:bg-ink-600 hover:text-brand-400 transition-colors"
          >
            <DoorOpen size={14} aria-hidden />
            <span className="sr-only sm:inline">RANURAS</span>
          </button>
        </div>

        {/* Verde: seguir escaneando (post auto-envío) — CTA brand con glow */}
        {analisis && banda === "verde" && (
          <button
            type="button"
            onClick={onVolver}
            disabled={enviando && !envioRechazado}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand-500 text-black font-label-caps text-label-caps data-mono hover:bg-brand-400 transition-colors shadow-glow-emerald disabled:opacity-50"
          >
            <Camera size={18} aria-hidden />
            {enviando && !envioRechazado ? "ENVIANDO…" : "SEGUIR ESCANEANDO"}
          </button>
        )}

        {/* Ámbar: repetir o enviar con advertencia (diseño fork: oscura + ámbar) */}
        {analisis && banda === "amarillo" && (
          <div className="flex flex-col sm:flex-row gap-2 mt-1">
            <button
              type="button"
              onClick={onReintentarFoto}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl border border-ind-secondary/50 bg-ink-700 text-ind-secondary font-label-caps text-label-caps data-mono hover:bg-ink-600 active:scale-95 transition-all"
            >
              <Camera size={16} aria-hidden />
              REPETIR FOTO (RECOMENDADO)
            </button>
            <button
              type="button"
              onClick={onEnviarAdvertencia}
              disabled={enviando}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl bg-ind-secondary hover:bg-ind-secondary/90 text-ink-950 font-bold font-label-caps text-label-caps data-mono shadow-[0_0_14px_rgba(255,185,95,0.4)] active:scale-95 transition-all disabled:opacity-50"
            >
              {emergencia ? (
                <ChevronDown size={16} className="rotate-180" aria-hidden />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              )}
              {emergencia ? "ENVÍO DE EMERGENCIA (RN-03)" : "ENVIAR CON ADVERTENCIA"}
            </button>
          </div>
        )}

        {/* Rojo: obligatorio repetir (destructive) */}
        {analisis && banda === "rojo" && (
          <div className="w-full flex flex-col gap-2">
            <button
              type="button"
              onClick={onReintentarFoto}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-destructive hover:bg-red-500 active:scale-95 text-white data-mono font-label-caps text-[13px] font-bold tracking-wider transition-all shadow-lg shadow-red-600/30 border border-destructive/60"
            >
              <RotateCcw size={18} aria-hidden />
              OBLIGATORIO REPETIR FOTO
            </button>
            <p className="text-center data-mono text-[10px] text-destructive uppercase tracking-wider">
              Transmisión bloqueada por control de calidad
            </p>
          </div>
        )}

        {/* Contador RN-02 (reintentos) */}
        {reintentosPliego > 0 && banda !== "verde" && (
          <p className="text-center data-mono text-[10px] text-white/50 uppercase tracking-wider">
            Reintentos RN-02: {reintentosPliego}/2
            {emergencia ? " · envío de emergencia habilitado (RN-03)" : ""}
          </p>
        )}
      </div>

      {/* D-15 · hoja de ranuras ocupadas (nivel pantalla) */}
      {ranurasAbiertas && (
        <EditorRanuras
          onCerrar={() => setRanurasAbiertas(false)}
          onRanuraLiberada={() => {
            // La ranura liberada puede desbloquear el veredicto del guard:
            // el padre re-corre la identificación con las señales vigentes.
            onRanuraLiberada?.();
          }}
        />
      )}
    </div>
  );
}

/** D-22: memo — sin el reloj global de 1 Hz ni re-renders del padre que
 *  no la afectan, Revisión (con la imagen grande) no se re-pinta en vano. */
export const PantallaRevision = React.memo(PantallaRevisionBase);
