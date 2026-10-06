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
  <span
    className={`px-2 py-0.5 rounded font-label-caps text-[10px] border ${
      ok === true
        ? "bg-primary/15 text-primary border-primary/40"
        : ok === false
          ? "bg-red-500/15 text-red-400 border-red-500/50"
          : "bg-surface-container-highest text-on-surface-variant border-outline-variant"
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

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest relative">
      {/* ---- Zona deslizable: top bar + tarjetas + visor ---- */}
      <div
        ref={scrollRef}
        onScroll={evaluarScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col"
      >
        {/* ---- Top bar (diseño: ← REVISIÓN DE ACTA) ---- */}
        <header className="bg-surface w-full border-b-2 border-outline-variant flex items-center px-3 h-[64px] shrink-0 z-10 sticky top-0">
          <button
            type="button"
            onClick={onVolver}
            aria-label="Volver a la cámara"
            className="h-11 w-11 -ml-1 flex items-center justify-center text-primary hover:bg-surface-variant rounded-full active:scale-95 transition-transform"
          >
            <ArrowLeft size={22} aria-hidden />
          </button>
          <h1 className="font-pwa-display text-primary tracking-tight ml-1">REVISIÓN DE ACTA</h1>
        </header>

        {/* ---- Tarjeta de estado y metadatos ---- */}
        <div className="p-4 flex flex-col gap-3 shrink-0">
          {/* Estado: analizando */}
          {(!analisis || analizando) && (
            <div className="bg-surface-container-high border border-primary/30 rounded-xl p-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="font-label-caps text-label-caps text-primary flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  ANALIZANDO CON VISIÓN ARTIFICIAL…
                </span>
                {qrTexto && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-primary/15 border border-primary/40 text-primary font-label-caps text-[10px]">
                    <QrCode size={11} aria-hidden /> QR LEÍDO
                  </span>
                )}
              </div>
              <span className="font-label-caps text-[10px] text-on-surface-variant">
                CALIDAD · FIRMAS · CÓDIGO DE BARRAS · DATOS DIVIPOL
              </span>
            </div>
          )}

          {/* Rol A · F-DEFER-CROP: el recorte automático aterriza en segundo plano */}
          {procesandoRecorte && (
            <div
              className="bg-surface-container-high border border-primary/30 rounded-xl p-3 flex items-center gap-2"
              role="status"
            >
              <Loader2 size={14} className="animate-spin text-primary shrink-0" aria-hidden />
              <span className="font-label-caps text-[11px] text-primary">
                AJUSTANDO RECORTE AUTOMÁTICO…
              </span>
              <span className="font-label-caps text-[10px] text-on-surface-variant">
                PERSPECTIVA + FILTRO B/N
              </span>
            </div>
          )}

          {/* Rol A · OCR local diferido (señales para el identificador) */}
          {ocrBusy && !procesandoRecorte && (
            <div
              className="bg-surface-container-high border border-outline-variant rounded-xl px-3 py-2 flex items-center gap-2"
              role="status"
            >
              <FileSearch size={13} className="animate-pulse text-primary shrink-0" aria-hidden />
              <span className="font-label-caps text-[10px] text-on-surface-variant">
                LEYENDO TEXTO DEL ACTA (OCR EN EL DISPOSITIVO)…
              </span>
            </div>
          )}

          {/* D-03 · banda ámbar: el recorte automático NO se aplicó y el
              acta no llena el frame — el operador NUNCA queda sin aviso */}
          {recorteFallo && !procesandoRecorte && !editorActivo && (
            <div
              className="bg-[#f59e0b]/10 border border-[#f59e0b]/50 rounded-xl p-3 flex flex-col gap-2"
              role="alert"
            >
              <span className="font-label-caps text-[11px] text-[#fbbf24] flex items-center gap-2">
                ⚠️ RECORTE AUTOMÁTICO NO APLICADO
              </span>
              <span className="text-[11px] text-on-surface-variant leading-snug">
                Ajuste las esquinas o repita la foto — la imagen puede quedar con mesa y fondo.
              </span>
              <button
                type="button"
                onClick={onAbrirEditor}
                className="min-h-[44px] w-full flex items-center justify-center gap-1 py-2 rounded-lg bg-[#f59e0b]/20 border border-[#f59e0b]/60 text-[#fbbf24] font-label-caps text-label-caps hover:bg-[#f59e0b]/30 active:scale-[0.98]"
              >
                <Crop size={14} aria-hidden /> AJUSTAR RECORTE
              </button>
            </div>
          )}

          {/* Estado: verde (AUTO ≥9 + firmas) */}
          {analisis && !analizando && banda === "verde" && (
            <div
              className="bg-surface-container-high border border-primary/30 rounded-xl p-3 flex flex-col gap-1"
              role="status"
            >
              <div className="flex items-center justify-between">
                <span className="font-label-caps text-label-caps text-primary">
                  CALIDAD DE IMAGEN: {analisis.scoreLetra}
                </span>
                {enviando ? (
                  <Loader2 size={16} className="animate-spin text-primary" aria-hidden />
                ) : (
                  <ShieldCheck size={16} className="text-primary" aria-hidden />
                )}
              </div>
              <div className="mt-1">
                <div className="font-label-caps text-primary text-[15px] font-bold tracking-tight uppercase">
                  {puestoNombre}
                </div>
                <div className="font-label-caps text-[11px] text-on-surface-variant tracking-wider mt-0.5">
                  {ubicacion}
                </div>
              </div>
              <p className={`text-[11px] leading-snug mt-1 ${envioRechazado ? "text-red-400" : "text-primary"}`}>
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

          {/* Estado: ámbar (6-8) */}
          {analisis && !analizando && banda === "amarillo" && (
            <div className="bg-amber-950/30 border-2 border-amber-500/80 rounded-xl p-3 flex flex-col gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-label-caps text-[11px] font-bold text-amber-400 tracking-wide flex items-center gap-1">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                  </svg>
                  CALIDAD DE IMAGEN: {analisis.scoreLetra} — ADVERTENCIA: {etiquetaProblema.toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={() => setDetalleAbierto((v) => !v)}
                  className="min-h-[44px] px-3 rounded bg-amber-500/20 text-amber-300 font-label-caps text-[10px] font-bold tracking-wider border border-amber-500/40 shrink-0"
                  aria-expanded={detalleAbierto}
                >
                  REVISAR
                </button>
              </div>
              <div className="mt-0.5">
                <div className="font-label-caps text-primary text-[16px] font-bold tracking-tight uppercase">
                  {puestoNombre}
                </div>
                <div className="font-label-caps text-[11px] text-on-surface-variant tracking-wider mt-0.5">
                  {ubicacion}
                </div>
              </div>
              {cruceUbicacion === false && (
                <p className="font-label-caps text-[11px] text-red-400 leading-tight mt-1">
                  ⚠️ VERIFICACIÓN CRUZADA FALLÓ: EL QR NO COINCIDE CON LOS DATOS DE LA IMAGEN
                </p>
              )}
              <p className="text-[11px] text-amber-300 leading-snug mt-1 flex items-start gap-1">
                <span>⚠️</span>
                <span>
                  Información legible. Se sugiere repetir la foto o continuar bajo su
                  responsabilidad.
                </span>
              </p>
            </div>
          )}

          {/* Estado: rojo (≤5) */}
          {analisis && !analizando && banda === "rojo" && (
            <div className="bg-[#2a0d10] border-2 border-red-500/80 rounded-xl p-3 flex flex-col gap-1.5 shadow-[0_0_16px_rgba(239,68,68,0.25)]">
              <div className="flex items-start justify-between gap-2">
                <span className="font-label-caps text-xs font-bold text-red-400 tracking-wide">
                  CALIDAD DE IMAGEN: {analisis.scoreLetra} — 🚫 ERROR CRÍTICO:{" "}
                  {etiquetaProblema.toUpperCase()}
                </span>
                <ShieldX size={16} className="text-red-400 shrink-0" aria-hidden />
              </div>
              <div className="mt-0.5">
                <div className="font-label-caps text-white text-[15px] font-bold tracking-tight uppercase">
                  {puestoNombre}
                </div>
                <div className="font-label-caps text-[11px] text-gray-400 tracking-wider mt-0.5">
                  {ubicacion}
                </div>
              </div>
              <div className="mt-1 pt-1.5 border-t border-red-500/30 flex items-center gap-1.5">
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
            <div className="bg-surface-container border border-outline-variant rounded-xl p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-label-caps text-[10px] text-on-surface-variant flex items-center gap-1.5">
                  <ScanLine size={12} className="text-primary" aria-hidden />
                  SEÑALES DE CAPTURA · IDENTIFICADOR DETERMINISTA
                </span>
                <button
                  type="button"
                  onClick={() => setSenalesAbierto((v) => !v)}
                  className="min-h-[44px] px-3 rounded bg-surface-container-high text-on-surface-variant font-label-caps text-[10px] border border-outline-variant"
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
                    <span className="font-label-caps text-[10px] text-on-surface-variant">
                      CÓDIGO X (CRUDO)
                    </span>
                    <code className="font-stats-number text-[11px] text-primary break-all bg-[#090f0f] border border-outline-variant rounded px-2 py-1">
                      {senales.codigoXCrudo ?? "— SIN LEER AÚN —"}
                    </code>
                  </div>
                  {senales.encabezadoCrudo && (
                    <div className="flex flex-col gap-0.5">
                      <span className="font-label-caps text-[10px] text-on-surface-variant">
                        ENCABEZADO DIVIPOL (CRUDO)
                      </span>
                      <code className="font-stats-number text-[11px] text-on-surface break-all bg-[#090f0f] border border-outline-variant rounded px-2 py-1">
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
                      <span className="font-label-caps text-[10px] text-on-surface-variant">
                        TEXTO OCR (TERCIO SUPERIOR)
                      </span>
                      <pre className="font-stats-number text-[10px] text-on-surface-variant bg-[#090f0f] border border-outline-variant rounded px-2 py-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-all">
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
            <div className="bg-surface-container border-2 border-outline-variant rounded-xl p-3 flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <span className="font-label-caps text-[11px] text-on-surface-variant">
                  VERIFICACIÓN QR ↔ IMAGEN (DIVIPOL)
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <ChipCruce ok={cruceUbicacion} label="UBICACIÓN" />
                  <ChipCruce ok={cruceEjemplar} label="EJEMPLAR" />
                </div>
              </div>
              {qrTexto && (
                <div className="flex flex-col gap-0.5">
                  <span className="font-label-caps text-[10px] text-on-surface-variant">QR DECODIFICADO</span>
                  <code className="font-stats-number text-[11px] text-primary break-all bg-[#090f0f] border border-outline-variant rounded px-2 py-1">
                    {qrTexto}
                  </code>
                </div>
              )}
              {asignacion?.origen && (
                <span className="font-label-caps text-[10px] text-on-surface-variant">
                  ASIGNACIÓN: {asignacion.origen} · CONFIANZA {Math.round(asignacion.confianza * 100)}%
                  {asignacion.mesaLabel ? ` · ${asignacion.mesaLabel}` : ""}
                </span>
              )}
              {verificacion.notas.length > 0 && (
                <ul className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
                  {verificacion.notas.map((n, i) => (
                    <li key={i} className="text-body-md text-[11px] text-on-surface-variant flex gap-1">
                      <span className="text-primary shrink-0">·</span>
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
              className="min-h-[44px] rounded border-2 border-[#e6a100] bg-[#161e1e] text-[#fdd400] font-label-caps text-label-caps flex items-center justify-center gap-2"
            >
              ASIGNAR UBICACIÓN MANUALMENTE (CONTINGENCIA)
            </button>
          )}
        </div>

        {/* ---- Visor de previsualización (tap-para-ampliar, §4.2.3) ---- */}
        <div className="flex-grow relative w-full flex flex-col items-center justify-center px-4 min-h-[260px] pb-2">
          <div className="w-full max-w-sm relative mx-auto h-[320px] flex items-center justify-center">
            <div
              className="scanner-frame w-full h-full flex items-center justify-center bg-surface-dim"
              style={
                banda === "amarillo"
                  ? { borderColor: "#f59e0b" }
                  : banda === "rojo"
                    ? { borderColor: "#ef4444" }
                    : undefined
              }
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
                    <div className="bg-red-600/90 text-white font-label-caps text-xs px-3 py-1.5 rounded-full uppercase tracking-wider font-bold shadow-lg flex items-center gap-1 mb-1">
                      <ShieldX size={14} aria-hidden />
                      IMAGEN RECHAZADA
                    </div>
                    <span className="text-[11px] font-label-caps text-red-200 font-semibold tracking-wide bg-black/80 px-2 py-0.5 rounded border border-red-500/50">
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
          <span className="font-label-caps text-[9px] text-on-surface-variant/70 mt-1">
            TOQUE LA IMAGEN PARA AMPLIARLA
          </span>
        </div>

        {/* §4.2.2 · indicador de contenido restante */}
        {hayMas && (
          <div className="shrink-0 flex justify-center pb-2 -mt-1">
            <span
              role="status"
              className="font-label-caps text-[9px] text-on-surface-variant bg-surface-container-high border border-outline-variant rounded-full px-3 py-1"
            >
              ▼ MÁS CONTENIDO
            </span>
          </div>
        )}
      </div>

      {/* ---- CTA fijo inferior (§4.2.1 sticky action bar) ---- */}
      <div className="shrink-0 border-t-2 border-outline-variant bg-surface-container-lowest/95 backdrop-blur px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] flex flex-col gap-3">
        {/* Herramientas de ajuste: REPETIR · ROTAR ↺ ↻ (D-13, desde el
            ORIGINAL, disponible siempre) · RECORTAR (editor D-04) · RANURAS */}
        <div className="flex items-stretch justify-center gap-2">
          <button
            type="button"
            onClick={onReintentarFoto}
            className="flex-1 flex items-center justify-center gap-1 py-2 px-1 min-h-[44px] bg-surface-container-high border border-outline-variant hover:bg-surface-variant rounded-lg text-primary font-label-caps text-[11px]"
          >
            <RotateCcw size={14} aria-hidden /> REPETIR
          </button>
          <button
            type="button"
            onClick={() => onRotar(-1)}
            disabled={reprocesando}
            title="Rotar 90° a la izquierda (desde el original)"
            aria-label="Rotar 90 grados a la izquierda"
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1 py-2 px-1 bg-surface-container-high border border-outline-variant hover:bg-surface-variant rounded-lg text-primary font-label-caps text-[11px] disabled:opacity-40"
          >
            <RotateCcw size={14} aria-hidden /> ROTAR
          </button>
          <button
            type="button"
            onClick={() => onRotar(1)}
            disabled={reprocesando}
            title="Rotar 90° a la derecha (desde el original)"
            aria-label="Rotar 90 grados a la derecha"
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1 py-2 px-1 bg-surface-container-high border border-outline-variant hover:bg-surface-variant rounded-lg text-primary font-label-caps text-[11px] disabled:opacity-40"
          >
            <RotateCw size={14} aria-hidden /> ROTAR
          </button>
          <button
            type="button"
            onClick={onAbrirEditor}
            disabled={!onAbrirEditor || !imagenOriginal || reprocesando}
            title="AJUSTAR LAS ESQUINAS DEL RECORTE MANUALMENTE"
            className="flex-1 min-h-[44px] flex items-center justify-center gap-1 py-2 px-1 bg-surface-container-high border border-outline-variant hover:bg-surface-variant rounded-lg text-primary font-label-caps text-[11px] disabled:opacity-40"
          >
            <Crop size={14} aria-hidden /> RECORTAR
          </button>
          <button
            type="button"
            onClick={() => setRanurasAbiertas(true)}
            title="VER Y DESCARTAR RANURAS OCUPADAS DEL GUARD"
            aria-label="Ver ranuras ocupadas"
            className="min-h-[44px] px-2.5 flex items-center justify-center gap-1 bg-surface-container-high border border-outline-variant hover:bg-surface-variant rounded-lg text-on-surface-variant hover:text-primary font-label-caps text-[11px]"
          >
            <DoorOpen size={14} aria-hidden />
            <span className="sr-only sm:inline">RANURAS</span>
          </button>
        </div>

        {/* Verde: seguir escaneando (post auto-envío) */}
        {analisis && banda === "verde" && (
          <button
            type="button"
            onClick={onVolver}
            disabled={enviando && !envioRechazado}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary text-on-primary font-label-caps text-label-caps hover:bg-primary-container transition-colors shadow-[0_0_12px_#4be277] disabled:opacity-50"
          >
            <Camera size={18} aria-hidden />
            {enviando && !envioRechazado ? "ENVIANDO…" : "SEGUIR ESCANEANDO"}
          </button>
        )}

        {/* Ámbar: repetir o enviar con advertencia */}
        {analisis && banda === "amarillo" && (
          <div className="flex flex-col sm:flex-row gap-2 mt-1">
            <button
              type="button"
              onClick={onReintentarFoto}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl border-2 border-primary bg-primary/10 text-primary font-label-caps text-label-caps hover:bg-primary/20 active:scale-95 transition-all"
            >
              <Camera size={16} aria-hidden />
              REPETIR FOTO (RECOMENDADO)
            </button>
            <button
              type="button"
              onClick={onEnviarAdvertencia}
              disabled={enviando}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold font-label-caps text-label-caps shadow-[0_0_14px_rgba(245,158,11,0.4)] active:scale-95 transition-all disabled:opacity-50"
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

        {/* Rojo: obligatorio repetir */}
        {analisis && banda === "rojo" && (
          <div className="w-full flex flex-col gap-2">
            <button
              type="button"
              onClick={onReintentarFoto}
              className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-label-caps text-[13px] font-bold tracking-wider transition-all shadow-[0_0_16px_rgba(239,68,68,0.4)] border border-red-400"
            >
              <RotateCcw size={18} aria-hidden />
              OBLIGATORIO REPETIR FOTO
            </button>
            <p className="text-center font-label-caps text-[10px] text-red-400 uppercase tracking-wider">
              Transmisión bloqueada por control de calidad
            </p>
          </div>
        )}

        {/* Contador RN-02 (reintentos) */}
        {reintentosPliego > 0 && banda !== "verde" && (
          <p className="text-center font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider">
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
