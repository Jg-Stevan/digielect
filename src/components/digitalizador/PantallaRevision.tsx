"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — Pantalla REVISIÓN DE ACTA
// Diseño oficial: revisión envío automático (verde 9-10),
// advertencia (ámbar 6-8) y rechazada (rojo ≤5).
// Incluye el panel de verificación cruzada QR ↔ imagen (VLM)
// desplegable con el chip REVISAR del diseño.
// ============================================================

import React, { useState } from "react";
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  Crop,
  Loader2,
  QrCode,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import type { ActaAnalysis, AsignacionActa, VerificacionActa } from "@/lib/types";
import type { ResultadoIntegracion } from "@/lib/integracion-captura";
import { bandaScore, ubicacionLinea, type CapturaContexto } from "./shared";
import { PanelIdentificacion } from "./PanelIdentificacion";

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
  onVolver: () => void;
  onReintentarFoto: () => void;
  onRotar: () => void;
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

export const PantallaRevision: React.FC<PantallaRevisionProps> = ({
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
}) => {
  const [detalleAbierto, setDetalleAbierto] = useState(false);

  const score = analisis?.scoreCalidad ?? null;
  const banda = score != null ? bandaScore(score) : null;
  const problemas = analisis?.problemas ?? [];
  const etiquetaProblema =
    problemas.find((p) => p !== "falta de firmas") ?? problemas[0] ?? "REVISAR CALIDAD";

  const puestoNombre = ctx?.consulado.puesto.toUpperCase() ?? "UBICACIÓN PENDIENTE";
  const ubicacion = ctx ? ubicacionLinea(ctx) : "SIN ASIGNAR · REQUIERE CONTINGENCIA";
  const cruceUbicacion = verificacion?.coincidenUbicacion ?? null;
  const cruceEjemplar = verificacion?.coincidenEjemplar ?? null;
  const emergencia = reintentosPliego >= 2; // RN-03

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest overflow-y-auto no-scrollbar">
      {/* ---- Top bar (diseño: ← REVISIÓN DE ACTA) ---- */}
      <header className="bg-surface w-full border-b-2 border-outline-variant flex items-center px-4 h-[64px] shrink-0 z-10">
        <button
          type="button"
          onClick={onVolver}
          aria-label="Volver a la cámara"
          className="p-2 -ml-2 text-primary hover:bg-surface-variant rounded-full active:scale-95 transition-transform"
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
            <p className={`font-label-caps mt-1 ${envioRechazado ? "text-red-400" : "text-primary"}`}>
              {envioRechazado
                ? "🚫 ENVÍO RECHAZADO · REVISE EL AVISO SUPERIOR"
                : enviando
                  ? "TRANSMITIENDO AUTOMÁTICAMENTE AL SERVIDOR…"
                  : "✓ VALIDADO Y ENVIADO AUTOMÁTICAMENTE"}
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
                className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-label-caps text-[10px] font-bold tracking-wider border border-amber-500/40 shrink-0"
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
            <p className="font-label-caps text-amber-300 text-[11px] leading-tight mt-1 flex items-start gap-1">
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
              <p className="font-label-caps text-[12px] font-semibold text-red-300 leading-tight">
                🚫 No se detectan datos legibles ni código E-14. El envío de esta foto está
                deshabilitado.
              </p>
            </div>
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

        {/* FASE 1 (rol C): identificador determinista + código X manual */}
        {(integracion || identificando || onIdentificarManual) && (
          <PanelIdentificacion
            integracion={integracion}
            identificando={identificando}
            enviando={enviando}
            onIdentificarManual={(c) => onIdentificarManual?.(c)}
            onConfirmarValidacion={onConfirmarValidacion}
            onRegistrarEnCola={onRegistrarEnCola}
          />
        )}

        {/* Sin ubicación asignada → contingencia */}
        {!ctx && analisis && !analizando && banda !== "rojo" && (
          <button
            type="button"
            onClick={onContingencia}
            className="h-11 rounded border-2 border-[#e6a100] bg-[#161e1e] text-[#fdd400] font-label-caps text-label-caps flex items-center justify-center gap-2"
          >
            ASIGNAR UBICACIÓN MANUALMENTE (CONTINGENCIA)
          </button>
        )}
      </div>

      {/* ---- Visor de previsualización ---- */}
      <div className="flex-grow relative w-full flex flex-col items-center justify-center px-4 min-h-[260px]">
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
            <div className="scanner-frame-inner flex items-center justify-center overflow-hidden">
              <img
                alt="Acta E-14 digitalizada"
                src={imagen}
                className={`w-full h-full object-contain opacity-90 ${
                  banda === "rojo" ? "filter brightness-[0.28] contrast-75 blur-[0.6px]" : ""
                }`}
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
            </div>
          </div>
        </div>
      </div>

      {/* ---- Acciones ---- */}
      <div className="p-4 flex flex-col gap-3 shrink-0 pb-5">
        {/* Herramientas de ajuste (solo advertencia) */}
        {analisis && banda === "amarillo" && (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={onReintentarFoto}
              className="flex-1 flex items-center justify-center gap-1 py-2 px-3 bg-surface-container-high border border-outline-variant hover:bg-surface-variant rounded-lg text-primary font-label-caps text-label-caps"
            >
              <RotateCcw size={14} aria-hidden /> REPETIR
            </button>
            <button
              type="button"
              onClick={onRotar}
              className="flex-1 flex items-center justify-center gap-1 py-2 px-3 bg-surface-container-high border border-outline-variant hover:bg-surface-variant rounded-lg text-primary font-label-caps text-label-caps"
            >
              <RotateCw size={14} aria-hidden /> ROTAR
            </button>
            <button
              type="button"
              onClick={onReintentarFoto}
              aria-label="Recorte automático del acta"
              className="flex-1 flex items-center justify-center gap-1 py-2 px-3 bg-surface-container-high border border-outline-variant hover:bg-surface-variant rounded-lg text-primary font-label-caps text-label-caps"
            >
              <Crop size={14} aria-hidden /> RECORTAR
            </button>
          </div>
        )}

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
          <div className="w-full flex flex-col gap-2 pb-2">
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
    </div>
  );
};
