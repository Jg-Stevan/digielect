"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — SELECTOR DE PUESTO (D-07)
// Estado inicial honesto: el digitalizador arranca SIN puesto
// (nada autoseleccionado). El operador busca entre los 949
// consulados (país · ciudad · puesto) y elige el suyo UNA vez:
// queda persistido en localStorage "digielect-puesto-v1"
// (JSON {id}) y se restaura por id en cada arranque. Si el id
// guardado ya no existe en el bootstrap → selector en blanco.
// La captura con QR sigue asignando la mesa del ACTA por envío;
// el puesto solo aporta contexto y checklist.
// C-15-2-b · port visual Stitch v2, estilo industrial: header
// .bg-scanline con display verde, buscador redondeado con focus
// ring brand, filas rectas ind-container con pin verde y
// metadatos .data-mono, lista con scroll .fine-scroll.
// ============================================================

import React, { useMemo, useState } from "react";
import { MapPin, Search } from "lucide-react";
import type { ConsulateRow } from "@/lib/types";

/** Clave de la preferencia de puesto del dispositivo (JSON {id}) */
export const CLAVE_PUESTO_STORAGE = "digielect-puesto-v1";

/** Tope de resultados renderizados (lista simple, sin virtualización) */
const TOPE_RESULTADOS = 50;

/** Lee el id del puesto persistido (null si no hay dato válido) */
export function leerIdPuestoGuardado(): string | null {
  try {
    const raw = window.localStorage.getItem(CLAVE_PUESTO_STORAGE);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { id?: unknown }).id === "string"
    ) {
      return (parsed as { id: string }).id;
    }
    return null;
  } catch {
    return null;
  }
}

/** Persiste el puesto elegido del dispositivo (JSON {id, actualizado}) */
export function guardarIdPuesto(id: string): void {
  try {
    window.localStorage.setItem(
      CLAVE_PUESTO_STORAGE,
      JSON.stringify({ id, actualizado: new Date().toISOString() })
    );
  } catch {
    // Sin storage (navegador en modo privado): la selección vale solo
    // para la sesión actual; no bloquea la operación.
  }
}

/** minúsculas + sin acentos: "mexico" encuentra "MÉXICO" */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

interface SelectorPuestoProps {
  consulados: ConsulateRow[];
  /** Selección confirmada: la app carga el puesto (el id ya quedó persistido) */
  onSeleccionar: (consulado: ConsulateRow) => void;
}

export const SelectorPuesto: React.FC<SelectorPuestoProps> = ({
  consulados,
  onSeleccionar,
}) => {
  const [consulta, setConsulta] = useState("");

  const resultados = useMemo(() => {
    const q = normalizar(consulta.trim());
    const base = q
      ? consulados.filter((c) =>
          normalizar(`${c.pais} ${c.ciudad} ${c.puesto}`).includes(q)
        )
      : consulados;
    const ordenada = [...base].sort((a, b) =>
      `${a.pais} ${a.ciudad} ${a.puesto}`.localeCompare(
        `${b.pais} ${b.ciudad} ${b.puesto}`,
        "es"
      )
    );
    return { lista: ordenada.slice(0, TOPE_RESULTADOS), total: ordenada.length };
  }, [consulta, consulados]);

  const seleccionar = (c: ConsulateRow) => {
    guardarIdPuesto(c.id);
    onSeleccionar(c);
  };

  return (
    <div className="h-full flex flex-col bg-ind-bg">
      {/* ---- Encabezado industrial (scanline + display verde) ---- */}
      <section className="bg-scanline border-b-2 border-ind-outline-variant px-4 pb-3 flex flex-col gap-1 shrink-0">
        <span className="label-caps text-ind-on-surface-var">
          CONFIGURACIÓN INICIAL
        </span>
        <h2 className="display-industrial text-brand-500">
          Seleccione su puesto
        </h2>
        <p className="text-body-md text-ind-on-surface-var">
          Elija el puesto consular desde el que digitaliza. Queda guardado en
          este dispositivo; el QR de cada acta asigna la mesa exacta de cada
          envío.
        </p>
      </section>

      {/* ---- Buscador + lista (scroll fino) ---- */}
      <div className="fine-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-4 pt-3 pb-4 flex flex-col gap-3">
        {/* Buscador (país · ciudad · puesto) */}
        <div className="flex items-center gap-2 min-h-[44px] shrink-0 rounded-full border-2 border-ind-outline-variant bg-ind-container px-4 focus-within:border-brand-500/70 focus-within:ring-1 focus-within:ring-brand-500/40 transition-colors">
          <Search size={16} className="text-ind-on-surface-var shrink-0" aria-hidden />
          <input
            type="text"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Buscar por país, ciudad o puesto…"
            aria-label="Buscar puesto por país, ciudad o puesto"
            autoFocus
            className="flex-1 bg-transparent outline-none text-ind-on-surface text-[16px] min-w-0 placeholder:text-ind-on-surface-var/60"
          />
          {consulta.length > 0 && (
            <button
              type="button"
              onClick={() => setConsulta("")}
              aria-label="Limpiar búsqueda"
              className="label-caps text-[10px] text-ind-on-surface-var hover:text-brand-500 uppercase shrink-0"
            >
              LIMPIAR
            </button>
          )}
        </div>

        <span
          className="data-mono text-[11px] text-ind-on-surface-var shrink-0"
          role="status"
        >
          {consulta.trim().length > 0
            ? `${resultados.total} COINCIDENCIA${resultados.total === 1 ? "" : "S"} · MOSTRANDO ${resultados.lista.length}`
            : `${consulados.length} PUESTOS CONSULARES · ESCRIBA PARA FILTRAR`}
        </span>

        {/* ---- Lista de resultados (tope 50) ---- */}
        <div className="flex flex-col gap-1.5" role="list" aria-label="Puestos consulares">
          {resultados.lista.map((c) => (
            <div key={c.id} role="listitem">
              <button
                type="button"
                onClick={() => seleccionar(c)}
                aria-label={`Seleccionar puesto ${c.puesto}, ${c.pais}, ${c.numMesas} mesas`}
                className="w-full text-left rounded-none border border-ind-outline-variant bg-ind-container hover:bg-ind-high hover:border-brand-500/60 p-2.5 flex flex-col gap-0.5 min-h-[52px] transition-colors"
              >
                <span className="font-headline-md text-[14px] text-ind-on-surface uppercase flex items-center gap-1.5">
                  <MapPin size={13} className="text-brand-500 shrink-0" aria-hidden />
                  {c.pais} · {c.ciudad}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="label-caps text-[11px] text-ind-on-surface-var truncate">
                    {c.puesto}
                  </span>
                  <span className="data-mono text-[11px] text-brand-500 shrink-0">
                    {c.code} · {c.numMesas} {c.numMesas === 1 ? "MESA" : "MESAS"}
                  </span>
                </span>
              </button>
            </div>
          ))}
          {resultados.lista.length === 0 && (
            <div className="rounded-none border border-ind-outline-variant bg-ind-container p-4 text-center">
              <span className="text-body-md text-ind-on-surface-var">
                Sin resultados para «{consulta}». Revise la grafía (país, ciudad o
                puesto).
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
