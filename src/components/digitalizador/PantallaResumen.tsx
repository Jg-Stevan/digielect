"use client";

// ============================================================
// DIGITALIZADOR E-14 — RESUMEN DE TRABAJO (estilo industrial)
// Progreso del puesto, KPIs, cola del dispositivo (IndexedDB) e
// historial de envíos.
// [OLA7 · M-1 AN-3] RESUMEN HONESTO:
//   · PUESTO ACTUAL = puestoActivo del store (asignación real del
//     operario); consulados[0] queda SOLO como fallback informativo.
//   · KPIs de cola = contadoresCola (IndexedDB, refrescados al
//     entrar) — antes leía la cola legada localStorage (siempre 0).
//   · NUEVO "COLA DEL DISPOSITIVO": ítems reales vía
//     obtenerColaOrdenada() (solo metadatos, sin imágenes base64).
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fechaBogota, horaBogota } from "@/lib/digitalizador/reglas";
import type { ActaDTO } from "@/lib/digitalizador/types";
import { useDigitalizador } from "@/lib/digitalizador/store";
import { BadgeEstado, ChipMono, IndicadorEnLinea } from "./shared";
// [OLA7 · M-1 AN-3] Solo lectura de los servicios (el tipo vive en
// puestoStorage; uploadQueue lo importa de allí — ver obtenerColaOrdenada)
import type { ActaQueueItem } from "@/services/puestoStorage";

/** Vista LIGERA de un ítem de la cola: sin imagen base64 en estado React */
interface ItemColaLigero {
  id: string;
  mesa: number;
  tipoActa: ActaQueueItem["tipoActa"];
  pagina: number;
  estado: ActaQueueItem["estado"];
  qualityScore: number;
  intentosSubida: number;
  ultimoError?: string;
  createdAt: number;
  syncedAt?: number;
}

/** Máximo de ítems de cola pintados (la lista completa vive en el panel flotante) */
const MAX_ITEMS_COLA = 6;

// ------------------------------------------------------------
// [OLA7 · M-1 AN-3] Píldoras de estado de la cola IndexedDB
// (los estados del dispositivo no existen en ESTADO_BADGE, que es
// para actas del servidor).
// ------------------------------------------------------------
const PILLS_COLA: Record<string, { label: string; clase: string }> = {
  PENDIENTE: {
    label: "PENDIENTE",
    clase: "bg-warning/15 text-warning border-warning/40",
  },
  SUBIENDO: {
    label: "SUBIENDO…",
    clase: "bg-ind-primary/15 text-ind-primary border-ind-primary/40",
  },
  ERROR: {
    label: "ERROR",
    clase: "bg-ind-error/15 text-ind-error border-ind-error/40",
  },
  ANOMALIA: {
    label: "ANOMALÍA",
    clase: "bg-ind-error/15 text-ind-error border-ind-error/40",
  },
  SINCRONIZADA: {
    label: "SINCRONIZADA ✓",
    clase: "bg-primary/20 text-primary border-primary/40",
  },
};

function PillCola({ estado }: { estado: string }) {
  const p = PILLS_COLA[estado] ?? PILLS_COLA.PENDIENTE;
  return (
    <span
      className={cn(
        "data-mono border px-1.5 py-0.5 text-[9px] font-semibold leading-none",
        p.clase
      )}
    >
      {p.label}
    </span>
  );
}

export default function PantallaResumen() {
  const resumen = useDigitalizador((s) => s.resumen);
  const consulados = useDigitalizador((s) => s.consulados);
  // [OLA7 · M-1 AN-3] Puesto REAL del operario + contadores REALES
  const puestoActivo = useDigitalizador((s) => s.puestoActivo);
  const contadoresCola = useDigitalizador((s) => s.contadoresCola);
  const enLinea = useDigitalizador((s) => s.enLinea);
  const cargandoDatos = useDigitalizador((s) => s.cargandoDatos);
  const sincronizarCola = useDigitalizador((s) => s.sincronizarCola);
  const refrescarContadoresCola = useDigitalizador((s) => s.refrescarContadoresCola);
  const [sincronizando, setSincronizando] = useState(false);
  const [itemsCola, setItemsCola] = useState<ItemColaLigero[] | null>(null);

  // [OLA7 · M-1 AN-3] Cola REAL del dispositivo (IndexedDB), por orden
  // de envío (nitidez DESC). Import dinámico como el resto del store.
  const cargarCola = useCallback(async () => {
    try {
      const { obtenerColaOrdenada } = await import("@/services/uploadQueue");
      const items = await obtenerColaOrdenada();
      // Solo metadatos: la imagen base64 NO debe quedar viva en estado
      // (una cola de jornada puede pesar decenas de MB).
      setItemsCola(
        items.map((i) => ({
          id: i.id,
          mesa: i.mesa,
          tipoActa: i.tipoActa,
          pagina: i.pagina,
          estado: i.estado,
          qualityScore: i.qualityScore,
          intentosSubida: i.intentosSubida,
          ultimoError: i.ultimoError,
          createdAt: i.createdAt,
          syncedAt: i.syncedAt,
        }))
      );
    } catch {
      // Sin IndexedDB (modo privado): sin cola visible en el resumen
      setItemsCola([]);
    }
  }, []);

  // Al montar: contadores + lista frescos (irA() también los refresca
  // al ENTRAR a la vista; esto cubre remontajes p. ej. tras fondo).
  useEffect(() => {
    void refrescarContadoresCola();
    void cargarCola();
  }, [refrescarContadoresCola, cargarCola]);

  const historial: ActaDTO[] = useMemo(
    () =>
      consulados
        .flatMap((c) => c.mesas.flatMap((m) => m.actas))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 8),
    [consulados]
  );

  const validados = resumen?.validados ?? 0;
  const esperados = resumen?.esperados ?? 0;
  const progreso = esperados > 0 ? Math.min(100, Math.round((validados / esperados) * 100)) : 0;

  const sincronizar = async () => {
    setSincronizando(true);
    try {
      await sincronizarCola();
    } finally {
      setSincronizando(false);
      // [OLA7 · M-1 AN-3] Refrescar la lista real tras sincronizar
      void cargarCola();
    }
  };

  const visiblesCola = (itemsCola ?? []).slice(0, MAX_ITEMS_COLA);
  const ocultasCola = (itemsCola?.length ?? 0) - visiblesCola.length;

  return (
    <section className="flex flex-col gap-4 bg-ind-bg bg-scanline p-4">
      {/* ===== PUESTO ACTUAL (fila de contexto) ===== */}
      <div className="flex items-end justify-between gap-2 border-b-2 border-ind-outline-variant pb-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="label-caps text-ind-on-surface-var">PUESTO ACTUAL</span>
          {/* [OLA7 · M-1 AN-3] Asignación REAL (puestoActivo), con zona
              al estilo del visor ("… · Z10"). consulados[0] es solo un
              fallback informativo del dataset, nunca "el" puesto. */}
          <h2 className="min-w-0 truncate text-[20px] font-bold uppercase leading-tight text-ind-on-surface">
            {puestoActivo ? (
              <>
                {puestoActivo.puesto}{" "}
                <span className="text-ind-on-surface-var">· Z{puestoActivo.zona}</span>
              </>
            ) : (
              (consulados[0]?.puesto ?? "SIN PUESTO")
            )}
          </h2>
          {!puestoActivo && consulados.length > 0 && (
            <span className="label-caps text-[10px] text-warning">
              SIN ASIGNAR — MOSTRANDO PRIMER PUESTO DEL DATASET
            </span>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <IndicadorEnLinea enLinea={enLinea} />
          <span className="data-mono text-[15px] font-semibold text-ind-primary-container">
            ID: {puestoActivo?.codigo ?? consulados[0]?.codigo ?? "—"}
          </span>
          {puestoActivo && (
            <span className="data-mono text-[10px] text-ind-on-surface-var">
              {puestoActivo.numMesas} MESAS
            </span>
          )}
        </div>
      </div>

      {/* ===== PROGRESO DEL PUESTO ===== */}
      <div className="flex flex-col gap-2 border-2 border-ind-primary bg-ind-container p-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[20px] font-bold leading-tight text-ind-on-surface">
            PROGRESO DEL PUESTO
          </span>
          <span className="data-mono text-[15px] font-semibold text-ind-primary">
            {validados}/{esperados}
          </span>
        </div>
        {/* [OLA7 · M-1 AN-3] Jerarquía visual: barra más alta con el
            porcentaje DENTRO (legible sobre fondo claro u oscuro) y
            transición suave al refrescar datos. */}
        <div
          role="progressbar"
          aria-label="Progreso del puesto"
          aria-valuenow={progreso}
          aria-valuemin={0}
          aria-valuemax={100}
          className="relative h-6 w-full overflow-hidden border-2 border-ind-outline-variant bg-ind-variant"
        >
          <div
            className="h-full bg-ind-primary transition-[width] duration-500 ease-out"
            style={{ width: `${progreso}%` }}
          />
          <span className="data-mono absolute inset-0 flex items-center justify-center text-[11px] font-bold text-ind-on-surface [text-shadow:0_0_4px_rgba(0,0,0,0.9)]">
            {progreso}%
          </span>
        </div>
        <span className="text-[14px] leading-snug text-ind-on-surface-var">
          {validados} VALIDADAS DE {esperados} RANURAS ESPERADAS HOY.
        </span>
      </div>

      {/* ===== KPIs ([OLA7 · M-1 AN-3] contadores reales) ===== */}
      <div className="grid grid-cols-2 gap-1">
        <KPI
          etiqueta="PENDIENTES EN COLA (OFFLINE)"
          valor={contadoresCola.pendientes}
          borde="border-ind-secondary"
          texto="text-ind-secondary"
        />
        <KPI
          etiqueta="ERRORES DE ENVÍO"
          valor={contadoresCola.errores}
          borde="border-ind-error"
          texto="text-ind-error"
        />
        <KPI
          etiqueta="ENVIADAS (ESTE DISPOSITIVO)"
          valor={contadoresCola.sincronizadasTotal}
          borde="border-ind-primary"
          texto="text-ind-primary"
        />
        <KPI
          etiqueta="VALIDADAS (SERVIDOR)"
          valor={validados}
          borde="border-ind-outline-variant"
          texto="text-ind-on-surface"
        />
        <KPI
          etiqueta="SOLICITUDES DE RESCANEO"
          valor={resumen?.anomalias ?? 0}
          borde="border-ind-error"
          texto="text-ind-error"
        />
        <KPI
          etiqueta="RECHAZADAS"
          valor={resumen?.rechazados ?? 0}
          borde="border-ind-outline-variant"
          texto="text-ind-on-surface"
        />
      </div>

      {/* ===== COLA DEL DISPOSITIVO (NUEVO · M-1 AN-3) ===== */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="label-caps text-ind-on-surface-var">COLA DEL DISPOSITIVO</span>
          <span className="data-mono text-[10px] text-ind-on-surface-var">
            ORDEN: NITIDEZ DESC
          </span>
        </div>
        {itemsCola === null ? null : itemsCola.length === 0 ? (
          <p className="border-2 border-dashed border-ind-outline-variant bg-ind-lowest p-4 text-center text-sm text-ind-on-surface-var">
            SIN ACTAS EN COLA — TODO SINCRONIZADO
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {visiblesCola.map((i) => (
              <li
                key={i.id}
                className="flex flex-col gap-0.5 border-2 border-ind-outline-variant bg-ind-container p-2 transition-colors hover:bg-ind-high"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="data-mono min-w-0 truncate text-[12px] font-bold text-ind-on-surface">
                    MESA {String(i.mesa).padStart(2, "0")} ·{" "}
                    {i.tipoActa === "TRANSMISION"
                      ? "TRANSMISIÓN"
                      : i.tipoActa === "CLAVEROS"
                        ? "CLAVEROS"
                        : "DELEGADOS"}{" "}
                    · P{i.pagina}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="data-mono text-[10px] text-ind-on-surface-var">
                      Q{i.qualityScore}
                    </span>
                    <PillCola estado={i.estado} />
                  </span>
                </div>
                {(i.estado === "ERROR" || i.estado === "ANOMALIA") &&
                i.ultimoError ? (
                  <span
                    className="truncate text-[10px] leading-snug text-ind-error"
                    title={i.ultimoError}
                  >
                    ⚠ {i.ultimoError}
                    {i.intentosSubida > 0 ? ` (REINTENTOS: ${i.intentosSubida})` : ""}
                  </span>
                ) : (
                  <span className="data-mono text-[10px] text-ind-on-surface-var">
                    {i.estado === "SINCRONIZADA" && i.syncedAt
                      ? `ENVIADA ${horaBogota(i.syncedAt)}`
                      : `ENCOLADA ${horaBogota(i.createdAt)}`}
                  </span>
                )}
              </li>
            ))}
            {ocultasCola > 0 && (
              <li className="data-mono py-0.5 text-center text-[10px] text-ind-on-surface-var">
                + {ocultasCola} MÁS EN COLA
              </li>
            )}
          </ul>
        )}
      </div>

      {/* ===== ÚLTIMOS ENVÍOS (HISTORIAL) ===== */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="label-caps text-ind-on-surface-var">ÚLTIMOS ENVÍOS (HISTORIAL)</span>
          <span className="flex items-center gap-2">
            {cargandoDatos && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-ind-on-surface-var" />
            )}
            <span className="data-mono text-[15px] text-ind-on-surface-var">
              ULT. ACT: {historial[0] ? horaBogota(historial[0].createdAt) : "--:--"}
            </span>
          </span>
        </div>
        {historial.length === 0 ? (
          <p className="border-2 border-dashed border-ind-outline-variant bg-ind-lowest p-4 text-center text-sm text-ind-on-surface-var">
            AÚN NO HAY ACTAS REGISTRADAS. COMIENCE ESCANEANDO.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {historial.map((a, i) => (
              <li
                key={a.id}
                className={cn(
                  // [OLA7 · M-1 AN-3] Cebra sutil para escaneo visual rápido
                  "flex items-center justify-between gap-2 border-2 border-ind-outline-variant p-2 transition-colors hover:bg-ind-high",
                  i % 2 === 0 ? "bg-ind-container" : "bg-ind-lowest"
                )}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[14px] font-bold text-ind-on-surface">
                    MESA {String(a.mesaNumero ?? 0).padStart(2, "0")} —{" "}
                    {a.tipoEjemplar === "DELEGADOS" ? "DELEGADOS" : "TRANSMISIÓN"} P{a.pagina}
                  </span>
                  <span className="data-mono text-[10px] text-ind-on-surface-var">
                    {fechaBogota(a.createdAt)}
                  </span>
                </div>
                <BadgeEstado estado={a.estado} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ===== SINCRONIZAR COLA ===== */}
      {/* [OLA7 · M-1 AN-3] Número REAL de pendientes (contadoresCola) */}
      {contadoresCola.pendientes > 0 && (
        <Button
          className="h-auto w-full rounded-none bg-ind-primary py-3 text-[15px] font-bold text-ind-on-primary shadow-none hover:bg-ind-primary/90 active:bg-ind-primary/90"
          disabled={sincronizando}
          onClick={() => void sincronizar()}
        >
          {sincronizando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CloudUpload className="h-4 w-4" />
          )}
          SINCRONIZAR COLA PENDIENTE ({contadoresCola.pendientes})
        </Button>
      )}

      {/* ===== PIE ===== */}
      <div className="flex items-center justify-center gap-1.5 pb-1">
        <ChipMono>RN-02</ChipMono>
        <span className="text-[10px] text-ind-on-surface-var">
          Reglas de calidad unificadas cliente/servidor
        </span>
      </div>
    </section>
  );
}

/** Tarjeta KPI industrial: número mono 28px arriba + etiqueta caps.
 *  [OLA7 · M-1 AN-3] hover/active para jerarquía táctil (industrial). */
function KPI({
  etiqueta,
  valor,
  borde,
  texto,
}: {
  etiqueta: string;
  valor: number;
  borde: string;
  texto: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 border-2 bg-ind-container p-2 transition-colors hover:bg-ind-high active:bg-ind-variant",
        borde
      )}
    >
      <span className={cn("data-mono text-[28px] font-semibold leading-none", texto)}>
        {String(valor).padStart(2, "0")}
      </span>
      <span className="label-caps text-ind-on-surface-var">{etiqueta}</span>
    </div>
  );
}
