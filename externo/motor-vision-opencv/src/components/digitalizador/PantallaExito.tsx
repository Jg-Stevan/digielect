"use client";

// ============================================================
// DIGITALIZADOR E-14 — Pantalla de ÉXITO / resultado del envío
// Estilo "brand dark" (negro + verde #00e676) del diseño de revisión.
// ============================================================

import { useEffect } from "react";
import { BarChart3, Clock, ScanLine, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fechaBogota } from "@/lib/digitalizador/reglas";
import { useDigitalizador } from "@/lib/digitalizador/store";

export default function PantallaExito() {
  const ultimoEnvio = useDigitalizador((s) => s.ultimoEnvio);
  const nuevaCaptura = useDigitalizador((s) => s.nuevaCaptura);
  const irA = useDigitalizador((s) => s.irA);

  useEffect(() => {
    if (!ultimoEnvio) nuevaCaptura();
  }, [ultimoEnvio, nuevaCaptura]);

  if (!ultimoEnvio) return null;

  const { estado, motivo, advertencia, mesa, tipoEjemplar, pagina, hora } = ultimoEnvio;
  const esValidado = estado === "VALIDADO";
  const esAnomalia = estado === "ANOMALIA";

  return (
    <section className="flex h-full flex-col bg-black p-4">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        {/* Icono según resultado */}
        <div
          className={cn(
            "grid h-20 w-20 place-items-center rounded-full border-2",
            esValidado
              ? "border-brand-500/40 bg-brand-500/10 text-brand-500"
              : esAnomalia
                ? "border-amber-400/50 bg-amber-400/10 text-amber-400"
                : "border-red-500/40 bg-red-500/10 text-red-500"
          )}
        >
          {esValidado ? (
            <ShieldCheck className="h-10 w-10 text-brand-500" />
          ) : esAnomalia ? (
            <ShieldCheck className="h-10 w-10 text-amber-400" />
          ) : (
            <XCircle className="h-10 w-10 text-red-500" />
          )}
        </div>

        <div className="space-y-1.5">
          <h2
            className={cn(
              "text-xl font-extrabold uppercase tracking-tight",
              esValidado ? "text-brand-500" : esAnomalia ? "text-amber-400" : "text-red-500"
            )}
          >
            {esValidado
              ? "ACTA VALIDADA Y ENVIADA"
              : esAnomalia
                ? advertencia
                  ? "ENVIADA CON ADVERTENCIA"
                  : "ENVIADA PARA AUDITORÍA"
                : "ENVÍO RECHAZADO"}
          </h2>
          <p className="mx-auto max-w-xs text-sm text-zinc-400">{motivo}</p>
        </div>

        {/* Detalles del envío */}
        <div className="w-full max-w-xs space-y-2 rounded-xl border border-ink-border bg-ink-800 p-4 text-left">
          <Detalle etiqueta="UBICACIÓN" valor={mesa ?? "Sin mesa asignada"} />
          <Detalle etiqueta="EJEMPLAR" valor={`${tipoEjemplar} · P${pagina}`} />
          <div className="flex items-center justify-between">
            <span className="label-caps text-zinc-500">HORA DE ENVÍO</span>
            <span className="flex items-center gap-1 data-mono text-[13px] font-semibold text-white">
              <Clock className="h-3.5 w-3.5 text-zinc-500" />
              {fechaBogota(hora)}
            </span>
          </div>
          <p className="border-t border-ink-border pt-2 text-[11px] text-zinc-500">
            Guardada localmente. Si no hay conexión, se sincronizará automáticamente desde el resumen.
          </p>
        </div>
      </div>

      {/* Acciones */}
      <div className="space-y-2 pb-2 pt-4">
        <Button
          className="h-12 w-full rounded-xl bg-brand-500 text-sm font-extrabold uppercase tracking-wider text-black shadow-glow-pill hover:bg-brand-400 active:scale-[0.98]"
          onClick={nuevaCaptura}
        >
          <ScanLine className="h-4 w-4 text-black" /> SEGUIR ESCANEANDO
        </Button>
        <Button
          variant="outline"
          className="h-11 w-full rounded-xl border border-white/15 bg-ink-700 text-xs font-bold text-white hover:bg-ink-600"
          onClick={() => irA("resumen")}
        >
          <BarChart3 className="h-4 w-4" /> VER RESUMEN
        </Button>
      </div>
    </section>
  );
}

function Detalle({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="label-caps text-zinc-500">{etiqueta}</span>
      <span className="data-mono text-[13px] font-semibold text-white">{valor}</span>
    </div>
  );
}
