"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — Pantalla ÉXITO (Stitch v2)
// C-15-2-b · port visual de la familia "brand glow" del fork
// externo del usuario (fondo ink→brand, check circular con glow
// y anillo pulsante, VALIDADO en display verde, tarjeta de ruta
// DIVIPOL en .data-mono, chips de estado/score y CTA verde
// sólido). Sólo capa visual: props, condicionales y handlers
// intactos (FASE 2 auditada).
// ============================================================

import React from "react";
import { Camera, ClipboardList, ShieldAlert, ShieldCheck } from "lucide-react";
import {
  bandaScore,
  ubicacionLinea,
  type CapturaContexto,
  type ExitoState,
} from "./shared";
import { BadgeEstado, ChipMono } from "./stitch";

interface PantallaExitoProps {
  exito: ExitoState;
  ctx: CapturaContexto | null;
  onSeguirEscaneando: () => void;
  onVerResumen: () => void;
}

/** Sólo presentación: score "9/10" → banda RN-02 para el color del chip */
function bandaDeScoreTexto(
  score: string | null
): "verde" | "amarillo" | "rojo" | null {
  if (!score) return null;
  const n = parseInt(score, 10);
  return Number.isFinite(n) ? bandaScore(n) : null;
}

/** Chip del score con la paleta brand/ind según la banda (≥9 / 6-8 / ≤5) */
const CLASE_BANDA: Record<"verde" | "amarillo" | "rojo", string> = {
  verde: "border-brand-500/60 bg-brand-500/15 text-brand-400",
  amarillo: "border-ind-secondary/60 bg-ind-secondary/10 text-ind-secondary",
  rojo: "border-destructive/60 bg-destructive/10 text-destructive",
};

export const PantallaExito: React.FC<PantallaExitoProps> = ({
  exito,
  ctx,
  onSeguirEscaneando,
  onVerResumen,
}) => {
  const validado = exito.estado === "VALIDADO";
  const puestoNombre = ctx?.consulado.puesto.toUpperCase() ?? "PUESTO ASIGNADO";
  const ubicacion = ctx ? ubicacionLinea(ctx) : `${exito.mesa} · PÁG ${exito.pagina} DE 2`;
  const banda = bandaDeScoreTexto(exito.score);

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-ink-950 via-ink-900 to-brand-900 overflow-y-auto no-scrollbar">
      {/* ---- Top bar (brand glow) ---- */}
      <header className="bg-ink-950/95 w-full border-b border-ink-border flex items-center px-4 h-[64px] shrink-0 z-10">
        <span className="w-10" aria-hidden />
        <h1 className="font-pwa-display text-brand-500 tracking-tight">REVISIÓN DE ACTA</h1>
      </header>

      {/* ---- Héroe: check con glow + anillo pulsante + display + chips ---- */}
      <div className="flex flex-col items-center justify-center gap-3 text-center px-4 pt-5 pb-3 shrink-0">
        <div className="relative grid place-items-center">
          {/* Anillo pulsante del diseño (2.2 s, sincronizado) */}
          <span
            aria-hidden
            className={`absolute h-24 w-24 rounded-full border-2 animate-pulse-sync ${
              validado ? "border-brand-500/40" : "border-ind-secondary/40"
            }`}
          />
          <div
            className={`grid h-20 w-20 place-items-center rounded-full border-2 ${
              validado
                ? "border-brand-500/40 bg-brand-500/10 shadow-glow-emerald"
                : "border-ind-secondary/50 bg-ind-secondary/10"
            }`}
          >
            {validado ? (
              <ShieldCheck className="h-10 w-10 text-brand-500" aria-hidden />
            ) : (
              <ShieldAlert className="h-10 w-10 text-ind-secondary" aria-hidden />
            )}
          </div>
        </div>

        <h2
          className={`display-industrial ${
            validado ? "text-brand-500" : "text-ind-secondary"
          }`}
        >
          {validado ? "VALIDADO" : "ANOMALÍA"}
        </h2>

        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <BadgeEstado estado={exito.estado} />
          <ChipMono>{exito.origen}</ChipMono>
        </div>
      </div>

      {/* ---- Tarjeta de datos (ruta DIVIPOL en .data-mono) ---- */}
      <div className="px-4 shrink-0">
        <div
          className="w-full max-w-sm mx-auto rounded-xl border border-ink-border bg-ink-800 p-4 text-left flex flex-col gap-1.5 shadow-hud"
          role="status"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="label-caps text-ind-on-surface-var/70">
              CALIDAD DE IMAGEN:
            </span>
            <span
              className={`data-mono inline-flex items-center border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                banda ? CLASE_BANDA[banda] : "border-ind-outline-variant bg-ind-variant text-ind-on-surface-var"
              }`}
            >
              {exito.score ?? "—"}
            </span>
          </div>
          <div className="mt-1">
            <div className="font-label-caps text-[15px] font-bold tracking-tight uppercase text-ind-on-surface">
              {puestoNombre}
            </div>
            <div className="data-mono text-[11px] leading-4 tracking-wide text-ind-on-surface-var mt-0.5 break-words">
              {ubicacion}
            </div>
          </div>
          <p
            className={`label-caps mt-1 ${
              validado ? "text-brand-400" : "text-ind-secondary"
            }`}
          >
            {validado
              ? exito.origen === "AUTO"
                ? "✓ VALIDADO Y ENVIADO AUTOMÁTICAMENTE"
                : exito.origen === "MANUAL"
                  ? "✓ VALIDADO · ASIGNACIÓN MANUAL (RF-1.3)"
                  : "✓ VALIDADO Y TRANSMITIDO"
              : "⚠️ ENVIADO CON ADVERTENCIA · MARCADO PARA REVISIÓN DEL SUPERVISOR"}
          </p>
          <p className="text-body-md text-[11px] text-ind-on-surface-var mt-0.5">{exito.motivo}</p>
        </div>
      </div>

      {/* ---- Previsualización ---- */}
      <div className="flex-grow relative w-full flex flex-col items-center justify-center px-4 min-h-[240px] py-2">
        <div className="w-full max-w-sm relative mx-auto h-[300px] flex items-center justify-center">
          <div
            className="scanner-frame w-full h-full flex items-center justify-center bg-ink-950/60"
            style={validado ? undefined : { borderColor: "#ffb95f" }}
          >
            <div className="scanner-frame-inner flex items-center justify-center">
              {ctx && (
                <>
                  {/* La imagen del acta ya se mostró en la revisión; aquí la
                      trazabilidad del envío (placeholder del diseño) */}
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 opacity-80">
                    {validado ? (
                      <ShieldCheck size={40} className="text-brand-500" aria-hidden />
                    ) : (
                      <ShieldAlert size={40} className="text-ind-secondary" aria-hidden />
                    )}
                    <span className="label-caps text-[11px] text-ind-on-surface-var text-center px-6">
                      {exito.mesa.toUpperCase()} · {exito.tipo === "TRANSMISION" ? "TRANSMISIÓN" : "DELEGADOS"} ·
                      PÁG {exito.pagina} DE 2
                      <br />
                      TRANSMITIDO AL SERVIDOR CENTRAL
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---- Acción principal (safe-area inferior la maneja el shell) ---- */}
      <div className="p-4 flex flex-col gap-2 shrink-0">
        <button
          type="button"
          onClick={onSeguirEscaneando}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-brand-500 text-black font-label-caps text-label-caps hover:bg-brand-400 transition-colors shadow-glow-pill active:scale-[0.98]"
        >
          <Camera size={18} aria-hidden />
          SEGUIR ESCANEANDO
        </button>
        <button
          type="button"
          onClick={onVerResumen}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-white/15 bg-ink-700 text-white font-label-caps text-label-caps hover:bg-ink-600 transition-colors"
        >
          <ClipboardList size={16} aria-hidden />
          VER RESUMEN DEL TURNO
        </button>
      </div>
    </div>
  );
};
