"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — PANEL DE IDENTIFICACIÓN
// DETERMINISTA (FASE 1, rol C)
// Muestra en REVISIÓN el resultado de la cadena
// normalizar → identificar → clasificar → guard de ranuras
// (src/lib/integracion-captura.ts sobre
// src/lib/identificacion-acta.ts):
//   · estado sugerido (VALIDADO / EN COLA / ANOMALÍA)
//   · asignación con formatearAsignacion (PAÍS/ZONA/PUESTO/MESA)
//   · señales usadas (barcode / texto / tinta / QR / operador)
//   · motivo ID_* completo si hay anomalía
//   · entrada manual de respaldo del código entre las X
//     (mismo normalizarCodigoTransmision) para demo sin cámara
// Paleta: verde primario / ámbar / rojo (sin azul/índigo).
// ============================================================

import React, { useState } from "react";
import {
  Barcode,
  CheckCircle2,
  DoorOpen,
  Fingerprint,
  Keyboard,
  Layers,
  Loader2,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { ResultadoIntegracion } from "@/lib/integracion-captura";
// [COORD C-15] Componentes de diseño Stitch v2 (sólo capa visual)
import { BadgeEstado, ChipMono } from "./stitch";

interface PanelIdentificacionProps {
  integracion: ResultadoIntegracion | null;
  identificando: boolean;
  enviando: boolean;
  /** D-21: imagen en banda roja → el envío está deshabilitado y las
   *  acciones del guard se ocultan (sólo veredicto + trazabilidad). */
  accionesBloqueadas?: boolean;
  onIdentificarManual: (codigoCrudo: string) => void;
  /** Guard dijo ALMACENAR/REEMPLAZAR · confirmar con estado VALIDADO */
  onConfirmarValidacion?: () => void;
  /** Guard dijo ALMACENAR/REEMPLAZAR · registrar sin validar (EN_COLA) */
  onRegistrarEnCola?: () => void;
  /** D-15: abre la hoja "RANURAS OCUPADAS" (ver/descartar bloqueos) */
  onAbrirRanuras?: () => void;
}

/** Etiqueta humana completa para cada código ID_* del identificador.
 *  §4.2.8: mensajes largos en sentence-case; las siglas ID_* quedan
 *  como etiqueta corta arriba. */
function motivoAnomalia(codigo: string): string {
  switch (codigo) {
    case "ID_CODIGO_ILEGIBLE":
      return "Código entre las X ilegible: digítelo manualmente o repita la foto.";
    case "ID_AMBIGUA":
      return "Identificación ambigua: se requiere confirmación del encabezado.";
    case "ID_NO_ENCONTRADA":
      return "Acta no encontrada en el índice: va a bandeja de revisión manual (nunca rechazo automático).";
    case "ID_ENCABEZADO_INCONSISTENTE":
      return "El encabezado DIVIPOL contradice el código de transmisión: posible hoja cruzada.";
    case "ID_PAGINA_O_TIPO_INDETERMINADO":
      return "Página o tipo de ejemplar indeterminado: rescaneo obligatorio.";
    case "ID_RANURA_OCUPADA_DISTINTA":
      return "La ranura (mesa · tipo · página) está ocupada por una hoja distinta: posible cruce. Abra RANURAS para revisarla.";
    default:
      return codigo;
  }
}

function vistaDeEstado(
  integracion: ResultadoIntegracion,
): { texto: string; tono: "verde" | "ambar" | "rojo" } {
  const { decision, scoreRN02 } = integracion;
  if (decision.accion === "DESCARTAR") {
    return { texto: "DUPLICADO · CAPTURA DESCARTADA", tono: "rojo" };
  }
  if (decision.accion === "ANOMALIA") {
    return { texto: "ANOMALÍA · BANDEJA DEL SUPERVISOR", tono: "rojo" };
  }
  if (decision.estadoSugerido === "VALIDADO" && scoreRN02 >= 9) {
    return { texto: "VALIDADO · AUTO-ENVÍO RN-02", tono: "verde" };
  }
  if (decision.estadoSugerido === "VALIDADO") {
    return { texto: "VALIDADO · SCORE INSUFICIENTE PARA AUTO-ENVÍO", tono: "ambar" };
  }
  return { texto: "REVISIÓN · EN COLA DE VALIDACIÓN", tono: "ambar" };
}

const ChipSenal: React.FC<{ ok: boolean; label: string }> = ({ ok, label }) => (
  // [COORD C-15] chip mono industrial del diseño (recto, 1px)
  <ChipMono
    className={
      ok
        ? "border-brand-500/50 bg-brand-500/10 text-brand-400"
        : "border-white/15 bg-ink-700 text-white/60"
    }
  >
    {label} {ok ? "✓" : "—"}
  </ChipMono>
);

export const PanelIdentificacion: React.FC<PanelIdentificacionProps> = ({
  integracion,
  identificando,
  enviando,
  accionesBloqueadas = false,
  onIdentificarManual,
  onConfirmarValidacion,
  onRegistrarEnCola,
  onAbrirRanuras,
}) => {
  const [codigoManual, setCodigoManual] = useState("");
  const [notasAbiertas, setNotasAbiertas] = useState(false);

  const puedeRegistrar =
    integracion != null &&
    (integracion.decision.accion === "ALMACENAR" ||
      integracion.decision.accion === "REEMPLAZAR") &&
    integracion.decision.ranura != null;

  const vista = integracion ? vistaDeEstado(integracion) : null;
  // [COORD C-15] Paleta del diseño: brand (verde glow) / ind-secondary (ámbar) / destructive
  const tonoClases =
    vista?.tono === "verde"
      ? "bg-brand-500/10 border border-brand-500/40"
      : vista?.tono === "ambar"
        ? "bg-ind-secondary/10 border border-ind-secondary/50"
        : "bg-destructive/10 border border-destructive/60";
  const tonoTexto =
    vista?.tono === "verde"
      ? "text-brand-400"
      : vista?.tono === "ambar"
        ? "text-ind-secondary"
        : "text-red-300";
  const tonoIcono =
    vista?.tono === "verde"
      ? "text-brand-400"
      : vista?.tono === "ambar"
        ? "text-ind-secondary"
        : "text-red-400";
  /** Estado resumido para el BadgeEstado del diseño (sólo presentación,
   *  derivado del veredicto ya calculado — no re-decide nada) */
  const estadoBadge = integracion
    ? integracion.decision.accion === "ANOMALIA"
      ? "ANOMALIA"
      : integracion.decision.accion === "DESCARTAR"
        ? "RECHAZADO"
        : vista?.tono === "verde"
          ? "VALIDADO"
          : "ADVERTENCIA"
    : "PENDIENTE";

  const anomalias = integracion?.decision.anomalias ?? [];
  const notas = integracion?.clasificacion.notas ?? [];
  const notasIdent = integracion?.identificacion.notas ?? [];
  const notasTodas = [...new Set([...notas, ...notasIdent])];

  return (
    <div
      className={`rounded-none border p-3 flex flex-col gap-2 ${tonoClases}`}
      data-testid="panel-identificacion"
    >
      {/* ---- Cabecera: título + estado sugerido ---- */}
      <div className="flex items-center justify-between gap-2">
        <span className={`font-label-caps text-[11px] font-bold tracking-wide flex items-center gap-1.5 data-mono ${tonoIcono}`}>
          {identificando ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : vista?.tono === "verde" ? (
            <ShieldCheck size={14} aria-hidden />
          ) : vista?.tono === "ambar" ? (
            <TriangleAlert size={14} aria-hidden />
          ) : (
            <ShieldAlert size={14} aria-hidden />
          )}
          IDENTIFICADOR DETERMINISTA E-14
        </span>
        {vista && !identificando && (
          // [COORD C-15] estado con BadgeEstado + veredicto mono
          <span className="flex shrink-0 items-center gap-1.5" role="status">
            <BadgeEstado estado={estadoBadge} />
            <span className={`data-mono text-[10px] font-bold ${tonoTexto}`}>
              {vista.texto}
            </span>
          </span>
        )}
      </div>

      {/* ---- Estado: identificando (índice local) ---- */}
      {identificando && (
        <span className="data-mono text-[10px] text-white/50">
          Contrastando contra el índice de 3.670 actas del exterior…
        </span>
      )}

      {/* ---- Resultado ---- */}
      {integracion && !identificando && (
        <>
          {/* Asignación (formatearAsignacion) + localización del monitor */}
          {integracion.asignacionTexto ? (
            <div className="flex flex-col gap-0.5">
              <div className={`font-label-caps text-[14px] font-bold tracking-tight uppercase ${tonoTexto}`}>
                {integracion.localizacion
                  ? `${integracion.localizacion.consulado.pais} · ${integracion.localizacion.consulado.ciudad}`
                  : "ACTA IDENTIFICADA"}
              </div>
              {/* [COORD C-15] ruta DIVIPOL mono mayúsculas (PAÍS > ZONA > …) */}
              <div className="data-mono text-[10px] font-semibold uppercase tracking-wider text-ind-on-surface-var">
                {integracion.asignacionTexto}
              </div>
              {integracion.localizacion && (
                <div className="data-mono text-[10px] text-white/40 tracking-wider">
                  MESA DEL MONITOR: {integracion.localizacion.mesa.mesaNumber.toUpperCase()}
                </div>
              )}
            </div>
          ) : (
            <div className={`font-label-caps text-[12px] font-bold tracking-wide data-mono ${tonoTexto}`}>
              {integracion.identificacion.estado === "CODIGO_ILEGIBLE"
                ? "SIN CÓDIGO DE TRANSMISIÓN LEGIBLE"
                : "NO SE PUDO DETERMINAR LA UBICACIÓN DE LA HOJA"}
            </div>
          )}

          {/* Confianzas + score RN-02 */}
          <div className="flex items-center gap-3 flex-wrap data-mono text-[11px]">
            <span className={tonoTexto}>
              SCORE RN-02: <b>{integracion.scoreRN02}/10</b>
            </span>
            <span className="text-white/50">
              IDENT {Math.round(integracion.identificacion.confianza * 100)}%
            </span>
            <span className="text-white/50">
              CLASIF {Math.round(integracion.clasificacion.confianza * 100)}%
            </span>
            <span className="text-white/50">
              RUTA {integracion.identificacion.ruta ?? "—"}
            </span>
          </div>

          {/* Señales usadas */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <ChipSenal ok={integracion.senales.barcode} label="BARCODE" />
            <ChipSenal ok={integracion.senales.texto} label="TEXTO" />
            <ChipSenal ok={integracion.senales.tinta} label="TINTA" />
            <ChipSenal ok={integracion.senales.qr} label="QR" />
            <ChipSenal ok={integracion.senales.vlm} label="VLM" />
            <ChipSenal ok={integracion.senales.operador} label="OPERADOR" />
          </div>

          {/* Código normalizado + correcciones seguras */}
          {(integracion.codigoNormalizado.codigo || integracion.codigoNormalizado.correcciones.length > 0) && (
            <div className="flex items-center gap-2 flex-wrap data-mono text-[10px]">
              <span className="text-white/50">CÓDIGO:</span>
              <code className="data-mono text-[12px] font-bold text-brand-400 bg-black/60 border border-white/10 rounded-sm px-2 py-0.5">
                {integracion.codigoNormalizado.codigo ?? "ILEGIBLE"}
              </code>
              {/* [COORD C-15] barcode simulado del diseño — sólo cuando la señal
                  BARCODE fue la que leyó el código (decorativo, aria-hidden) */}
              {integracion.senales.barcode && (
                <span className="barcode-lines h-3.5 w-20 opacity-80" aria-hidden />
              )}
              {integracion.codigoNormalizado.correcciones.map((c) => (
                <span
                  key={c}
                  className="px-1.5 py-0.5 rounded-sm bg-ind-secondary/15 text-ind-secondary border border-ind-secondary/40 data-mono"
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* Ranura destino + acción del guard */}
          {integracion.decision.ranura && (
            <div className="data-mono text-[10px] font-semibold uppercase tracking-wider text-ind-on-surface-var">
              RANURA: {integracion.decision.ranura.mesa} ·{" "}
              {integracion.decision.ranura.tipo === "TRANSMISION" ? "TRANSMISIÓN" : "DELEGADOS"} · P
              {integracion.decision.ranura.pagina} → {integracion.decision.accion}
              {integracion.decision.accion === "REEMPLAZAR"
                ? " (HOJA PREVIA NO VALIDADA)"
                : ""}
            </div>
          )}

          {/* Motivo ID_* completo (bandeja del supervisor) */}
          {anomalias.length > 0 && (
            <div className="rounded-none border border-destructive/50 bg-destructive/10 px-2 py-1.5 flex flex-col gap-0.5">
              {anomalias.map((a) => (
                <p key={a} className="font-label-caps text-[11px] font-bold text-red-300 data-mono leading-tight">
                  🚫 {a} · {motivoAnomalia(a)}
                </p>
              ))}
            </div>
          )}

          {/* Notas de trazabilidad (desplegable) */}
          {notasTodas.length > 0 && (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setNotasAbiertas((v) => !v)}
                aria-expanded={notasAbiertas}
                className="self-start px-1.5 py-0.5 rounded-none bg-ink-700 text-white/60 data-mono font-label-caps text-[10px] border border-white/15 hover:text-white transition-colors"
              >
                TRAZABILIDAD ({notasTodas.length}) {notasAbiertas ? "▲" : "▼"}
              </button>
              {notasAbiertas && (
                <ul className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
                  {notasTodas.map((n, i) => (
                    <li
                      key={i}
                      className="text-body-md text-[11px] text-white/60 flex gap-1"
                    >
                      <span className="text-brand-400 shrink-0">·</span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ---- Acciones del guard (ocultas en banda roja — D-21) ---- */}
          {puedeRegistrar && !accionesBloqueadas && (
            <div className="flex flex-col gap-1.5 pt-1 border-t border-white/10">
              {/* [COORD C-15] CTA brand-500 con glow (filas rectas industriales) */}
              <button
                type="button"
                onClick={onConfirmarValidacion}
                disabled={enviando}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-none bg-brand-500 text-black font-label-caps text-label-caps data-mono hover:bg-brand-400 shadow-glow-emerald disabled:opacity-50 active:scale-[0.98] transition-all"
              >
                {enviando ? (
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 size={15} aria-hidden />
                )}
                {enviando
                  ? "REGISTRANDO…"
                  : integracion.decision.accion === "REEMPLAZAR"
                    ? "CONFIRMAR REEMPLAZO Y VALIDAR"
                    : "CONFIRMAR Y VALIDAR HOJA"}
              </button>
              <button
                type="button"
                onClick={onRegistrarEnCola}
                disabled={enviando}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-none border border-white/15 bg-ink-700 text-white font-label-caps text-[11px] data-mono hover:bg-ink-600 disabled:opacity-50 transition-colors"
              >
                <Layers size={13} aria-hidden />
                REGISTRAR EN COLA DE REVISIÓN (SIN VALIDAR)
              </button>
            </div>
          )}

          {integracion.decision.accion === "DESCARTAR" && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] text-red-300 leading-snug">
                La misma huella de una hoja ya validada ocupa esta ranura: la
                captura se descartó para evitar duplicados (guard de ranura).
              </p>
              <button
                type="button"
                onClick={() => onAbrirRanuras?.()}
                className="min-h-[44px] w-full flex items-center justify-center gap-2 py-2 px-3 rounded-none border border-destructive/50 bg-destructive/10 text-red-300 font-label-caps text-[11px] data-mono hover:bg-destructive/20 active:scale-[0.98] transition-all"
              >
                <DoorOpen size={14} aria-hidden />
                VER RANURAS OCUPADAS
              </button>
            </div>
          )}

          {/* D-21: aviso explícito cuando el veredicto se muestra pero la
              imagen fue rechazada por calidad (no hay acciones operativas) */}
          {accionesBloqueadas && (
            <p className="text-[10px] text-red-300 leading-snug border-t border-destructive/30 pt-1.5">
              Imagen rechazada por calidad: repita la foto. Las acciones de esta
              tarjeta están deshabilitadas.
            </p>
          )}
        </>
      )}

      {/* ---- Entrada manual de respaldo del código entre las X ---- */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-white/10">
        <label
          htmlFor="codigo-x-manual"
          className="data-mono text-[10px] font-bold tracking-wider text-white uppercase flex items-center gap-1.5"
        >
          <Keyboard size={12} className="text-white/40" aria-hidden />
          CÓDIGO ENTRE LAS X · ENTRADA MANUAL DE RESPALDO
        </label>
        {/* [COORD C-15] input mono sobre negro con foco brand (16px §4.2.5) */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 flex items-center">
            <ScanLine size={16} className="absolute left-2.5 text-white/40" aria-hidden />
            <input
              id="codigo-x-manual"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={20}
              value={codigoManual}
              onChange={(e) => setCodigoManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && codigoManual.trim()) {
                  onIdentificarManual(codigoManual.trim());
                }
              }}
              placeholder="X 7-23-10-19 X  ·  ó  7231019"
              className="w-full bg-black/70 border border-white/15 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40 rounded-none pl-8 pr-3 py-2 data-mono text-[16px] tracking-wider text-brand-400 font-bold outline-none"
              aria-describedby="codigo-x-ayuda"
            />
          </div>
          <button
            type="button"
            onClick={() => onIdentificarManual(codigoManual.trim())}
            disabled={!codigoManual.trim() || identificando}
            className="min-h-[44px] flex items-center gap-1.5 px-3 py-2 rounded-none border border-brand-500/50 bg-brand-500/10 text-brand-400 font-label-caps text-[11px] data-mono hover:bg-brand-500/20 disabled:opacity-40 shrink-0 transition-colors"
          >
            {identificando ? (
              <Loader2 size={13} className="animate-spin" aria-hidden />
            ) : (
              <Fingerprint size={13} aria-hidden />
            )}
            IDENTIFICAR
          </button>
        </div>
        <p id="codigo-x-ayuda" className="text-[10px] text-white/50 leading-snug">
          7 dígitos impresos entre las X del acta. Se normaliza con el mismo
          motor del identificador (corrige O→0 · I→1; nunca corrige S/B/Z
          ambiguos). El OCR local del dispositivo lee este código y alimenta
          el identificador automáticamente.
          <Barcode size={10} className="inline ml-1 -mt-0.5" aria-hidden />
        </p>
      </div>
    </div>
  );
};

