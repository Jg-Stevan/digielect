"use client";

// ============================================================
// DIGITALIZADOR E-14 — RESUMEN DE TRABAJO (estilo industrial)
// Progreso del puesto, KPIs, últimos envíos y cola offline.
// ============================================================

import { useMemo, useState } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fechaBogota, horaBogota } from "@/lib/digitalizador/reglas";
import type { ActaDTO } from "@/lib/digitalizador/types";
import { useDigitalizador } from "@/lib/digitalizador/store";
import { BadgeEstado, ChipMono, IndicadorEnLinea } from "./shared";

export default function PantallaResumen() {
  const resumen = useDigitalizador((s) => s.resumen);
  const consulados = useDigitalizador((s) => s.consulados);
  const cola = useDigitalizador((s) => s.cola);
  const enLinea = useDigitalizador((s) => s.enLinea);
  const cargandoDatos = useDigitalizador((s) => s.cargandoDatos);
  const sincronizarCola = useDigitalizador((s) => s.sincronizarCola);
  const [sincronizando, setSincronizando] = useState(false);

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
    }
  };

  return (
    <section className="flex flex-col gap-4 bg-ind-bg bg-scanline p-4">
      {/* ===== PUESTO ACTUAL (fila de contexto) ===== */}
      <div className="flex items-end justify-between gap-2 border-b-2 border-ind-outline-variant pb-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="label-caps text-ind-on-surface-var">PUESTO ACTUAL</span>
          <h2 className="text-[20px] font-bold uppercase leading-tight text-ind-on-surface">
            {consulados[0]?.puesto ?? "SIN PUESTO"}
          </h2>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <IndicadorEnLinea enLinea={enLinea} />
          <span className="data-mono text-[15px] font-semibold text-ind-primary-container">
            ID: {consulados[0]?.codigo ?? "—"}
          </span>
        </div>
      </div>

      {/* ===== PROGRESO DEL PUESTO ===== */}
      <div className="flex flex-col gap-2 border-2 border-ind-primary bg-ind-container p-2">
        <span className="text-[20px] font-bold leading-tight text-ind-on-surface">
          PROGRESO DEL PUESTO: {progreso}%
        </span>
        <div
          role="progressbar"
          aria-valuenow={progreso}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full bg-ind-variant"
        >
          <div className="h-full bg-ind-primary" style={{ width: `${progreso}%` }} />
        </div>
        <span className="text-[14px] leading-snug text-ind-on-surface-var">
          {validados} validadas de {esperados} ranuras esperadas hoy.
        </span>
      </div>

      {/* ===== KPIs ===== */}
      <div className="grid grid-cols-2 gap-1">
        <KPI
          etiqueta="PENDIENTES EN COLA (OFFLINE)"
          valor={cola.length}
          borde="border-ind-secondary"
          texto="text-ind-secondary"
        />
        <KPI
          etiqueta="SOLICITUDES DE RESCANEO"
          valor={resumen?.anomalias ?? 0}
          borde="border-ind-error"
          texto="text-ind-error"
        />
        <KPI
          etiqueta="ENVIADAS"
          valor={validados}
          borde="border-ind-outline-variant"
          texto="text-ind-on-surface"
        />
        <KPI
          etiqueta="RECHAZADAS"
          valor={resumen?.rechazados ?? 0}
          borde="border-ind-outline-variant"
          texto="text-ind-on-surface"
        />
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
            Aún no hay actas registradas. Comience escaneando.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {historial.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 border-2 border-ind-outline-variant bg-ind-container p-2"
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
      {cola.length > 0 && (
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
          SINCRONIZAR COLA PENDIENTE ({cola.length})
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

/** Tarjeta KPI industrial: número mono 28px arriba + etiqueta caps */
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
    <div className={cn("flex flex-col gap-1 border-2 bg-ind-container p-2", borde)}>
      <span className={cn("data-mono text-[28px] font-semibold leading-none", texto)}>
        {String(valor).padStart(2, "0")}
      </span>
      <span className="label-caps text-ind-on-surface-var">{etiqueta}</span>
    </div>
  );
}
