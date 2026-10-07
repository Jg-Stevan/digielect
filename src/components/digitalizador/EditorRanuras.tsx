"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — EDITOR DE RANURAS (D-15)
// Hoja "RANURAS OCUPADAS": lista las ranuras (mesa · tipo ·
// página) que el guard del identificador tiene registradas en
// el dispositivo, con acción DESCARTAR por ranura.
//
// Sale del dead-end del canon: tras recargar, una recaptura caía
// en "DUPLICADO · CAPTURA DESCARTADA" sin forma de ver ni
// resolver el bloqueo (solo REINICIAR DEMO lo limpiaba). Aquí el
// operador ve QUÉ hoja bloquea la ranura y libera explícitamente
// la que sabe que es residuo (demo/reinstalación/hoja perdida).
// ============================================================

import React, { useCallback, useEffect, useState } from "react";
import { DoorOpen, Loader2, X } from "lucide-react";
import {
  descartarRanura,
  listarRanurasLocales,
  type HojaEnRanura,
} from "@/lib/integracion-captura";

interface EditorRanurasProps {
  /** Cierra la hoja */
  onCerrar: () => void;
  /** Se dispara tras descartar (el padre re-corre la identificación) */
  onRanuraLiberada?: () => void;
}

/** Etiqueta legible de la clave de ranura "mesaId|TIPO|pN" */
function etiquetaClave(clave: string): string {
  const [mesa, tipo, pagina] = clave.split("|");
  const mesaCorta = mesa?.startsWith("divipol:")
    ? `DIVIPOL ${mesa.slice(8)}`
    : (mesa ?? "?").toUpperCase();
  const tipoLargo = tipo === "TRANSMISION" ? "TRANSMISIÓN" : (tipo ?? "?");
  const pag = pagina?.replace("p", "PÁG ") ?? "";
  return `${mesaCorta} · ${tipoLargo} · ${pag}`;
}

function etiquetaEstado(estado: HojaEnRanura["estado"]): string {
  switch (estado) {
    case "VALIDADO":
      return "VALIDADA";
    case "EN_COLA":
      return "EN COLA";
    default:
      return estado;
  }
}

export const EditorRanuras: React.FC<EditorRanurasProps> = ({
  onCerrar,
  onRanuraLiberada,
}) => {
  const [ranuras, setRanuras] = useState<[string, HojaEnRanura][]>([]);
  const [descartando, setDescartando] = useState<string | null>(null);

  const refrescar = useCallback(() => {
    try {
      const registro = listarRanurasLocales();
      setRanuras(
        Object.entries(registro).sort(([a], [b]) => a.localeCompare(b))
      );
    } catch {
      setRanuras([]);
    }
  }, []);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  // Escape cierra la hoja
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !descartando) onCerrar();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar, descartando]);

  const descartar = useCallback(
    (clave: string) => {
      // Confirmación explícita: liberar una ranura permite re-capturar
      // esa hoja — el operador debe estar seguro.
      if (!window.confirm(`DESCARTAR LA RANURA ${etiquetaClave(clave)}? LA HOJA PODRÁ VOLVERSE A CAPTURAR.`)) {
        return;
      }
      setDescartando(clave);
      try {
        descartarRanura(clave);
        refrescar();
        onRanuraLiberada?.();
      } finally {
        setDescartando(null);
      }
    },
    [refrescar, onRanuraLiberada]
  );

  return (
    <div
      className="absolute inset-0 z-40 bg-black/70 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-3"
      role="dialog"
      aria-modal="true"
      aria-label="Ranuras ocupadas del guard"
      onClick={(e) => {
        if (e.target === e.currentTarget && !descartando) onCerrar();
      }}
    >
      <div className="w-full max-w-sm max-h-[80%] flex flex-col rounded-none border border-ind-outline-variant bg-ind-lowest shadow-hud overflow-hidden">
        {/* Cabecera */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-ind-outline-variant bg-scanline">
          <span className="label-caps text-[12px] text-brand-500 flex items-center gap-2">
            <DoorOpen size={15} aria-hidden />
            RANURAS OCUPADAS ({ranuras.length})
          </span>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar ranuras"
            className="h-11 w-11 -mr-2 flex items-center justify-center rounded-none text-ind-on-surface-var hover:bg-ind-high active:scale-95 transition-all"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {/* Lista */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain fine-scroll px-4 py-3 flex flex-col gap-2">
          {ranuras.length === 0 && (
            <p className="text-body-md text-[12px] text-ind-on-surface-var py-4 text-center">
              No hay ranuras ocupadas en este dispositivo. El guard no
              bloqueará ninguna captura.
            </p>
          )}
          {ranuras.map(([clave, hoja]) => (
            <div
              key={clave}
              className="rounded-none border border-ind-outline-variant bg-ind-container p-2.5 flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="data-mono text-[11px] font-bold text-ind-on-surface">
                  {etiquetaClave(clave)}
                </span>
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded-none data-mono text-[9px] border ${
                    hoja.estado === "VALIDADO"
                      ? "bg-brand-500/15 text-brand-400 border-brand-500/40"
                      : "bg-ind-secondary/15 text-ind-secondary border-ind-secondary/40"
                  }`}
                >
                  {etiquetaEstado(hoja.estado)}
                </span>
              </div>
              <span className="data-mono text-[10px] text-ind-on-surface-var break-all">
                HUELLA: {hoja.qrFingerprint ?? "—"} · {hoja.actualizadaEn.slice(0, 16).replace("T", " ")}
              </span>
              <button
                type="button"
                onClick={() => descartar(clave)}
                disabled={descartando != null}
                className="min-h-[44px] rounded-none border border-destructive/50 bg-destructive/10 text-destructive label-caps text-[11px] hover:bg-destructive/20 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                aria-label={`Descartar ranura ${etiquetaClave(clave)}`}
              >
                {descartando === clave ? (
                  <Loader2 size={13} className="animate-spin" aria-hidden />
                ) : (
                  <X size={13} aria-hidden />
                )}
                DESCARTAR RANURA
              </button>
            </div>
          ))}
        </div>

        <p className="shrink-0 px-4 py-2.5 border-t border-ind-outline-variant text-[10px] text-ind-on-surface-var leading-tight">
          El guard usa estas ranuras para detectar hojas duplicadas. Descarte
          solo las que sepa que son residuos del dispositivo (demo,
          reinstalación o una hoja física que ya no existe).
        </p>
      </div>
    </div>
  );
};
