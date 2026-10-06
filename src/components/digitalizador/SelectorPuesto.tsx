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
    <div className="min-h-full flex flex-col p-4 gap-3">
      {/* ---- Encabezado ---- */}
      <section className="border-b-2 border-outline-variant pb-2 flex flex-col gap-1">
        <span className="font-label-caps text-label-caps text-on-surface-variant">
          CONFIGURACIÓN INICIAL
        </span>
        <h2 className="font-pwa-display text-primary tracking-tighter uppercase">
          Seleccione su puesto
        </h2>
        <p className="text-body-md text-on-surface-variant">
          Elija el puesto consular desde el que digitaliza. Queda guardado en
          este dispositivo; el QR de cada acta asigna la mesa exacta de cada
          envío.
        </p>
      </section>

      {/* ---- Buscador (país · ciudad · puesto) ---- */}
      <div className="flex items-center gap-2 border-2 border-outline-variant bg-surface-container px-3 h-11 rounded-sm focus-within:border-primary/70">
        <Search size={16} className="text-on-surface-variant shrink-0" aria-hidden />
        <input
          type="text"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Buscar por país, ciudad o puesto…"
          aria-label="Buscar puesto por país, ciudad o puesto"
          autoFocus
          className="flex-1 bg-transparent outline-none text-on-surface text-[14px] min-w-0 placeholder:text-on-surface-variant/60"
        />
        {consulta.length > 0 && (
          <button
            type="button"
            onClick={() => setConsulta("")}
            aria-label="Limpiar búsqueda"
            className="font-label-caps text-[10px] text-on-surface-variant hover:text-primary uppercase shrink-0"
          >
            LIMPIAR
          </button>
        )}
      </div>

      <span
        className="font-stats-number text-[11px] text-on-surface-variant"
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
              className="w-full text-left bg-surface-container border border-outline-variant hover:border-primary/70 p-2.5 flex flex-col gap-0.5 min-h-[52px] transition-colors"
            >
              <span className="font-headline-md text-[14px] text-on-surface uppercase flex items-center gap-1.5">
                <MapPin size={13} className="text-primary shrink-0" aria-hidden />
                {c.pais} · {c.ciudad}
              </span>
              <span className="flex items-center justify-between gap-2">
                <span className="font-label-caps text-[11px] text-on-surface-variant truncate">
                  {c.puesto}
                </span>
                <span className="font-stats-number text-[11px] text-primary shrink-0">
                  {c.numMesas} {c.numMesas === 1 ? "MESA" : "MESAS"}
                </span>
              </span>
            </button>
          </div>
        ))}
        {resultados.lista.length === 0 && (
          <div className="border border-outline-variant p-4 text-center">
            <span className="text-body-md text-on-surface-variant">
              Sin resultados para «{consulta}». Revise la grafía (país, ciudad o
              puesto).
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
