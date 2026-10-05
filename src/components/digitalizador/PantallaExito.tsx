"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — Pantalla ÉXITO
// Diseño oficial "digitalizador_revisi_n_de_acta_env_o_autom_tico":
// tarjeta verde con score + trazabilidad + banner de envío,
// previsualización recortada y botón SEGUIR ESCANEANDO.
// Variante ámbar para envíos con advertencia / emergencia
// (estado ANOMALÍA, marcados para revisión del supervisor).
// ============================================================

import React from "react";
import { Camera, ClipboardList, ShieldAlert, ShieldCheck } from "lucide-react";
import { ubicacionLinea, type CapturaContexto, type ExitoState } from "./shared";

interface PantallaExitoProps {
  exito: ExitoState;
  ctx: CapturaContexto | null;
  onSeguirEscaneando: () => void;
  onVerResumen: () => void;
}

export const PantallaExito: React.FC<PantallaExitoProps> = ({
  exito,
  ctx,
  onSeguirEscaneando,
  onVerResumen,
}) => {
  const validado = exito.estado === "VALIDADO";
  const puestoNombre = ctx?.consulado.puesto.toUpperCase() ?? "PUESTO ASIGNADO";
  const ubicacion = ctx ? ubicacionLinea(ctx) : `${exito.mesa} · PÁG ${exito.pagina} DE 2`;

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest overflow-y-auto no-scrollbar">
      {/* ---- Top bar ---- */}
      <header className="bg-surface w-full border-b-2 border-outline-variant flex items-center px-4 h-[64px] shrink-0 z-10">
        <span className="w-10" aria-hidden />
        <h1 className="font-pwa-display text-primary tracking-tight">REVISIÓN DE ACTA</h1>
      </header>

      <div className="p-4 flex flex-col gap-3 shrink-0">
        {/* ---- Tarjeta de estado ---- */}
        <div
          className={
            validado
              ? "bg-surface-container-high border border-primary/30 rounded-xl p-3 flex flex-col gap-1"
              : "bg-amber-950/30 border-2 border-amber-500/80 rounded-xl p-3 flex flex-col gap-1.5 shadow-[0_0_15px_rgba(245,158,11,0.15)]"
          }
          role="status"
        >
          <div className="flex items-center justify-between">
            <span
              className={`font-label-caps text-label-caps ${
                validado ? "text-primary" : "text-amber-400"
              }`}
            >
              CALIDAD DE IMAGEN: {exito.score ?? "—"}
            </span>
            {validado ? (
              <ShieldCheck size={16} className="text-primary" aria-hidden />
            ) : (
              <ShieldAlert size={16} className="text-amber-400" aria-hidden />
            )}
          </div>
          <div className="mt-1">
            <div
              className={`font-label-caps text-[15px] font-bold tracking-tight uppercase ${
                validado ? "text-primary" : "text-amber-300"
              }`}
            >
              {puestoNombre}
            </div>
            <div className="font-label-caps text-[11px] text-on-surface-variant tracking-wider mt-0.5">
              {ubicacion}
            </div>
          </div>
          <p
            className={`font-label-caps mt-1 ${validado ? "text-primary" : "text-amber-300"}`}
          >
            {validado
              ? exito.origen === "AUTO"
                ? "✓ VALIDADO Y ENVIADO AUTOMÁTICAMENTE"
                : exito.origen === "MANUAL"
                  ? "✓ VALIDADO · ASIGNACIÓN MANUAL (RF-1.3)"
                  : "✓ VALIDADO Y TRANSMITIDO"
              : "⚠️ ENVIADO CON ADVERTENCIA · MARCADO PARA REVISIÓN DEL SUPERVISOR"}
          </p>
          <p className="text-body-md text-[11px] text-on-surface-variant mt-0.5">{exito.motivo}</p>
        </div>
      </div>

      {/* ---- Previsualización ---- */}
      <div className="flex-grow relative w-full flex flex-col items-center justify-center px-4 min-h-[240px] py-2">
        <div className="w-full max-w-sm relative mx-auto h-[300px] flex items-center justify-center">
          <div
            className="scanner-frame w-full h-full flex items-center justify-center bg-surface-dim"
            style={validado ? undefined : { borderColor: "#f59e0b" }}
          >
            <div className="scanner-frame-inner flex items-center justify-center">
              {ctx && (
                <>
                  {/* La imagen del acta ya se mostró en la revisión; aquí la
                      trazabilidad del envío (placeholder del diseño) */}
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 opacity-80">
                    {validado ? (
                      <ShieldCheck size={40} className="text-primary" aria-hidden />
                    ) : (
                      <ShieldAlert size={40} className="text-amber-400" aria-hidden />
                    )}
                    <span className="font-label-caps text-[11px] text-on-surface-variant text-center px-6">
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

      {/* ---- Acción principal ---- */}
      <div className="p-4 flex flex-col gap-2 shrink-0">
        <button
          type="button"
          onClick={onSeguirEscaneando}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary text-on-primary font-label-caps text-label-caps hover:bg-primary-container transition-colors shadow-[0_0_12px_#4be277]"
        >
          <Camera size={18} aria-hidden />
          SEGUIR ESCANEANDO
        </button>
        <button
          type="button"
          onClick={onVerResumen}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-outline-variant bg-surface-container-high text-primary font-label-caps text-label-caps hover:bg-surface-variant transition-colors"
        >
          <ClipboardList size={16} aria-hidden />
          VER RESUMEN DEL TURNO
        </button>
      </div>
    </div>
  );
};
