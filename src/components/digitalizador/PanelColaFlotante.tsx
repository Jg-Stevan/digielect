"use client";

// ============================================================
// DIGITALIZADOR E-14 — PANEL FLOTANTE DE COLA DE SUBIDA
// TAREA 5.3 (PLAN_DIGIELECT_DIGITALIZADOR.md) · C-17
//
// Panel minimizable con el estado de la cola:
//   · Indicador verde:  "Sincronizadas: N"
//   · Indicador ámbar:  "En cola (ordenadas por nitidez): N"
//   · Botón de forzar sincronización manual.
// Flota sobre el contenido (z-30), no interfiere con la captura
// inmersiva (allí queda como píldora compacta abajo-izquierda).
// ============================================================

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CloudOff,
  Loader2,
  RefreshCcw,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDigitalizador } from "@/lib/digitalizador/store";

export default function PanelColaFlotante() {
  const enLinea = useDigitalizador((s) => s.enLinea);
  const sincronizarCola = useDigitalizador((s) => s.sincronizarCola);
  const contadoresCola = useDigitalizador((s) => s.contadoresCola);

  const [expandido, setExpandido] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  // Auto-expandir cuando hay pendientes (el operario debe verlo)
  useEffect(() => {
    if (contadoresCola.pendientes > 0) setExpandido(true);
  }, [contadoresCola.pendientes]);

  const forzar = async () => {
    setSincronizando(true);
    try {
      await sincronizarCola();
    } finally {
      setSincronizando(false);
    }
  };

  const pendientes = contadoresCola.pendientes;
  const hayActividad = pendientes > 0 || sincronizando;

  // ----- Píldora compacta (colapsada) -----
  if (!expandido) {
    return (
      <button
        type="button"
        onClick={() => setExpandido(true)}
        data-testid="panel-cola-pill"
        aria-label={`Cola de subida: ${pendientes} en cola, ${contadoresCola.sincronizadasTotal} sincronizadas. Abrir panel`}
        className={cn(
          "z-30 fixed bottom-24 left-3 flex items-center gap-2 rounded-full border px-3 py-2 shadow-lg backdrop-blur-md transition-colors sm:bottom-6",
          hayActividad
            ? "border-warning/50 bg-black/85"
            : "border-brand-500/40 bg-black/85"
        )}
      >
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            hayActividad ? "animate-pulse-sync bg-warning" : "bg-brand-500"
          )}
        />
        <span className="data-mono text-[10px] text-white">
          {contadoresCola.sincronizadasTotal}
          {pendientes > 0 ? ` · ${pendientes}` : ""}
        </span>
        <ChevronUp className="h-3 w-3 text-zinc-400" />
      </button>
    );
  }

  // ----- Panel expandido -----
  return (
    <div
      data-testid="panel-cola"
      className="z-30 fixed bottom-24 left-3 right-3 overflow-hidden rounded-xl border border-ind-outline-variant bg-black/92 shadow-2xl backdrop-blur-md sm:bottom-6 sm:left-auto sm:w-72"
    >
      {/* Cabecera */}
      <div className="flex items-center justify-between border-b border-ind-outline-variant bg-ind-bg px-3 py-2">
        <span className="label-caps text-[10px] text-ind-on-surface-var">
          COLA DE SUBIDA
        </span>
        {/* [OLA7 · B-1 AN-3] Touch target ≥44px: el área de hit se expande
            con ::after (inset -2) SIN engordar la cabecera del panel —
            visual igual, dedo cómodo. */}
        <button
          type="button"
          onClick={() => setExpandido(false)}
          aria-label="Minimizar panel de cola"
          className="relative rounded p-0.5 text-zinc-400 transition-colors hover:bg-ind-high hover:text-white after:absolute after:-inset-3 after:content-['']"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {/* Contenido */}
      <div className="space-y-2 px-3 py-2.5">
        {/* Verde: sincronizadas */}
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" />
          <span className="flex-1 text-[11px] text-zinc-300">
            Sincronizadas:{" "}
            <span className="data-mono text-brand-400">
              {contadoresCola.sincronizadasTotal}
            </span>
          </span>
        </div>
        {/* Ámbar: en cola por nitidez */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              pendientes > 0 ? "animate-pulse-sync bg-warning" : "bg-zinc-600"
            )}
          />
          <span className="flex-1 text-[11px] text-zinc-300">
            En cola (por nitidez):{" "}
            <span className="data-mono text-warning">{pendientes}</span>
          </span>
        </div>
        {/* Conectividad */}
        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          {enLinea ? (
            <>
              <Wifi className="h-3 w-3 text-brand-500" />
              conectado al servidor central
            </>
          ) : (
            <>
              <CloudOff className="h-3 w-3 text-warning" />
              sin conexión — envío con backoff automático
            </>
          )}
        </div>
      </div>

      {/* Forzar sincronización */}
      <div className="border-t border-ind-outline-variant p-2">
        <button
          type="button"
          onClick={() => void forzar()}
          disabled={sincronizando || pendientes === 0}
          data-testid="btn-forzar-sync"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-[11px] font-semibold text-brand-400 transition-colors hover:bg-brand-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sincronizando ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              SINCRONIZANDO…
            </>
          ) : (
            <>
              <RefreshCcw className="h-3.5 w-3.5" />
              FORZAR SINCRONIZACIÓN
            </>
          )}
        </button>
      </div>
    </div>
  );
}
