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

interface PanelIdentificacionProps {
  integracion: ResultadoIntegracion | null;
  identificando: boolean;
  enviando: boolean;
  onIdentificarManual: (codigoCrudo: string) => void;
  /** Guard dijo ALMACENAR/REEMPLAZAR · confirmar con estado VALIDADO */
  onConfirmarValidacion?: () => void;
  /** Guard dijo ALMACENAR/REEMPLAZAR · registrar sin validar (EN_COLA) */
  onRegistrarEnCola?: () => void;
}

/** Etiqueta humana completa para cada código ID_* del identificador. */
function motivoAnomalia(codigo: string): string {
  switch (codigo) {
    case "ID_CODIGO_ILEGIBLE":
      return "CÓDIGO ENTRE LAS X ILEGIBLE · DIGÍTELO MANUALMENTE O REPITA LA FOTO";
    case "ID_AMBIGUA":
      return "IDENTIFICACIÓN AMBIGUA · SE REQUIERE CONFIRMACIÓN DEL ENCABEZADO";
    case "ID_NO_ENCONTRADA":
      return "ACTA NO ENCONTRADA EN EL ÍNDICE · VA A BANDEJA DE REVISIÓN MANUAL (NUNCA RECHAZO AUTOMÁTICO)";
    case "ID_ENCABEZADO_INCONSISTENTE":
      return "ENCABEZADO DIVIPOL CONTRADICE EL CÓDIGO DE TRANSMISIÓN · POSIBLE HOJA CRUZADA";
    case "ID_PAGINA_O_TIPO_INDETERMINADO":
      return "PÁGINA O TIPO DE EJEMPLAR INDETERMINADO · RESCANEO OBLIGATORIO";
    case "ID_RANURA_OCUPADA_DISTINTA":
      return "RANURA (MESA · TIPO · PÁGINA) OCUPADA POR UNA HOJA DISTINTA · POSIBLE CRUCE";
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
  <span
    className={`px-2 py-0.5 rounded font-label-caps text-[10px] border ${
      ok
        ? "bg-primary/15 text-primary border-primary/40"
        : "bg-surface-container-highest text-on-surface-variant border-outline-variant"
    }`}
  >
    {label} {ok ? "✓" : "—"}
  </span>
);

export const PanelIdentificacion: React.FC<PanelIdentificacionProps> = ({
  integracion,
  identificando,
  enviando,
  onIdentificarManual,
  onConfirmarValidacion,
  onRegistrarEnCola,
}) => {
  const [codigoManual, setCodigoManual] = useState("");
  const [notasAbiertas, setNotasAbiertas] = useState(false);

  const puedeRegistrar =
    integracion != null &&
    (integracion.decision.accion === "ALMACENAR" ||
      integracion.decision.accion === "REEMPLAZAR") &&
    integracion.decision.ranura != null;

  const vista = integracion ? vistaDeEstado(integracion) : null;
  const tonoClases =
    vista?.tono === "verde"
      ? "bg-surface-container-high border border-primary/30"
      : vista?.tono === "ambar"
        ? "bg-amber-950/30 border-2 border-amber-500/80"
        : "bg-[#2a0d10] border-2 border-red-500/80";
  const tonoTexto =
    vista?.tono === "verde"
      ? "text-primary"
      : vista?.tono === "ambar"
        ? "text-amber-300"
        : "text-red-300";
  const tonoIcono =
    vista?.tono === "verde"
      ? "text-primary"
      : vista?.tono === "ambar"
        ? "text-amber-400"
        : "text-red-400";

  const anomalias = integracion?.decision.anomalias ?? [];
  const notas = integracion?.clasificacion.notas ?? [];
  const notasIdent = integracion?.identificacion.notas ?? [];
  const notasTodas = [...new Set([...notas, ...notasIdent])];

  return (
    <div
      className={`rounded-xl p-3 flex flex-col gap-2 ${tonoClases}`}
      data-testid="panel-identificacion"
    >
      {/* ---- Cabecera: título + estado sugerido ---- */}
      <div className="flex items-center justify-between gap-2">
        <span className={`font-label-caps text-[11px] font-bold tracking-wide flex items-center gap-1.5 ${tonoIcono}`}>
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
          <span
            className={`px-2 py-0.5 rounded font-label-caps text-[10px] font-bold border shrink-0 ${
              vista.tono === "verde"
                ? "bg-primary/15 text-primary border-primary/40"
                : vista.tono === "ambar"
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-red-500/15 text-red-300 border-red-500/50"
            }`}
            role="status"
          >
            {vista.texto}
          </span>
        )}
      </div>

      {/* ---- Estado: identificando (índice local) ---- */}
      {identificando && (
        <span className="font-label-caps text-[10px] text-on-surface-variant">
          CONTRASTANDO CONTRA EL ÍNDICE DE 3.670 ACTAS DEL EXTERIOR…
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
              <div className="font-label-caps text-[11px] text-on-surface-variant tracking-wider">
                {integracion.asignacionTexto}
              </div>
              {integracion.localizacion && (
                <div className="font-label-caps text-[10px] text-on-surface-variant tracking-wider">
                  MESA DEL MONITOR: {integracion.localizacion.mesa.mesaNumber.toUpperCase()}
                </div>
              )}
            </div>
          ) : (
            <div className={`font-label-caps text-[12px] font-bold tracking-wide ${tonoTexto}`}>
              {integracion.identificacion.estado === "CODIGO_ILEGIBLE"
                ? "SIN CÓDIGO DE TRANSMISIÓN LEGIBLE"
                : "NO SE PUDO DETERMINAR LA UBICACIÓN DE LA HOJA"}
            </div>
          )}

          {/* Confianzas + score RN-02 */}
          <div className="flex items-center gap-3 flex-wrap font-stats-number text-[11px]">
            <span className={tonoTexto}>
              SCORE RN-02: <b>{integracion.scoreRN02}/10</b>
            </span>
            <span className="text-on-surface-variant">
              IDENT {Math.round(integracion.identificacion.confianza * 100)}%
            </span>
            <span className="text-on-surface-variant">
              CLASIF {Math.round(integracion.clasificacion.confianza * 100)}%
            </span>
            <span className="text-on-surface-variant">
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
            <div className="flex items-center gap-2 flex-wrap font-label-caps text-[10px]">
              <span className="text-on-surface-variant">CÓDIGO:</span>
              <code className="font-stats-number text-[12px] text-primary bg-[#090f0f] border border-outline-variant rounded px-2 py-0.5">
                {integracion.codigoNormalizado.codigo ?? "ILEGIBLE"}
              </code>
              {integracion.codigoNormalizado.correcciones.map((c) => (
                <span
                  key={c}
                  className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40"
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* Ranura destino + acción del guard */}
          {integracion.decision.ranura && (
            <div className="font-label-caps text-[10px] text-on-surface-variant tracking-wider">
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
            <div className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1.5 flex flex-col gap-0.5">
              {anomalias.map((a) => (
                <p key={a} className="font-label-caps text-[11px] font-bold text-red-300 leading-tight">
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
                className="self-start px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-label-caps text-[10px] border border-outline-variant"
              >
                TRAZABILIDAD ({notasTodas.length}) {notasAbiertas ? "▲" : "▼"}
              </button>
              {notasAbiertas && (
                <ul className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
                  {notasTodas.map((n, i) => (
                    <li
                      key={i}
                      className="text-body-md text-[11px] text-on-surface-variant flex gap-1"
                    >
                      <span className="text-primary shrink-0">·</span>
                      <span>{n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ---- Acciones del guard ---- */}
          {puedeRegistrar && (
            <div className="flex flex-col gap-1.5 pt-1 border-t border-outline-variant/60">
              <button
                type="button"
                onClick={onConfirmarValidacion}
                disabled={enviando}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-primary text-on-primary font-label-caps text-label-caps hover:bg-primary-container shadow-[0_0_10px_rgba(75,226,119,0.25)] disabled:opacity-50 active:scale-95 transition-all"
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
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-outline-variant bg-surface-container-high text-on-surface font-label-caps text-[11px] hover:bg-surface-variant disabled:opacity-50"
              >
                <Layers size={13} aria-hidden />
                REGISTRAR EN COLA DE REVISIÓN (SIN VALIDAR)
              </button>
            </div>
          )}

          {integracion.decision.accion === "DESCARTAR" && (
            <p className="font-label-caps text-[11px] text-red-300 leading-tight">
              MISMA HUELLA DE UNA HOJA YA VALIDADA · CAPTURA DESCARTADA (GUARD DE RANURA)
            </p>
          )}
        </>
      )}

      {/* ---- Entrada manual de respaldo del código entre las X ---- */}
      <div className="flex flex-col gap-1.5 pt-1">
        <label
          htmlFor="codigo-x-manual"
          className="font-label-caps text-[10px] font-bold tracking-wider text-on-surface uppercase flex items-center gap-1.5"
        >
          <Keyboard size={12} className="text-outline" aria-hidden />
          CÓDIGO ENTRE LAS X · ENTRADA MANUAL DE RESPALDO
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 flex items-center">
            <ScanLine size={16} className="absolute left-2.5 text-outline" aria-hidden />
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
              className="w-full bg-[#090f0f] border border-outline focus:border-primary focus:ring-1 focus:ring-primary rounded pl-8 pr-3 py-2 font-stats-number text-[14px] tracking-wider text-primary font-bold outline-none"
              aria-describedby="codigo-x-ayuda"
            />
          </div>
          <button
            type="button"
            onClick={() => onIdentificarManual(codigoManual.trim())}
            disabled={!codigoManual.trim() || identificando}
            className="flex items-center gap-1.5 px-3 py-2 rounded border border-primary/50 bg-primary/10 text-primary font-label-caps text-[11px] hover:bg-primary/20 disabled:opacity-40 shrink-0"
          >
            {identificando ? (
              <Loader2 size={13} className="animate-spin" aria-hidden />
            ) : (
              <Fingerprint size={13} aria-hidden />
            )}
            IDENTIFICAR
          </button>
        </div>
        <p id="codigo-x-ayuda" className="font-label-caps text-[9px] text-on-surface-variant leading-tight">
          7 DÍGITOS IMPRESOS ENTRE LAS X DEL ACTA. SE NORMALIZA CON EL MISMO MOTOR
          DEL IDENTIFICADOR (CORRIGE O→0 · I→1; NUNCA CORRIGE S/B/Z AMBIGUOS).
          <Barcode size={10} className="inline ml-1 -mt-0.5" aria-hidden />
          OCR REAL: PENDIENTE (ROL A) · ESTE PANEL LO CONSUME AL CONECTARSE.
        </p>
      </div>
    </div>
  );
};

