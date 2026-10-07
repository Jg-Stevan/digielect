"use client";

// ============================================================
// DIGITALIZADOR E-14 — CONTROL DE ACTAS (estilo industrial)
// Acordeón de mesas con ranuras DELEGADOS/TRANSMISIÓN P1-P2.
// ============================================================

import { useMemo, useState } from "react";
import { ChevronDown, Loader2, ScanLine } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fechaBogota } from "@/lib/digitalizador/reglas";
import type { ActaDTO, TipoEjemplar } from "@/lib/digitalizador/types";
import { useDigitalizador } from "@/lib/digitalizador/store";
import { BadgeEstado, ChipMono, IndicadorEnLinea, RelojBogota } from "./shared";

// ------------------------------------------------------------
// Chip de ranura (P1/P2): estilo + texto según estado del acta
// ------------------------------------------------------------
function estiloRanura(
  acta: ActaDTO | null,
  pagina: number
): { clase: string; texto: string } {
  if (!acta) {
    return { clase: "bg-ind-high text-ind-on-surface-var", texto: `P${pagina} ⏳` };
  }
  if (acta.estado === "VALIDADO") {
    return { clase: "bg-primary/20 text-ind-primary", texto: `P${pagina} ✓` };
  }
  if (acta.estado === "ANOMALIA" || acta.estado === "RECHAZADO") {
    return { clase: "bg-ind-error/20 text-ind-error", texto: `P${pagina} ⚠` };
  }
  // PENDIENTE / EN_COLA / OFFLINE → transmisión en proceso
  return { clase: "bg-warning/20 text-warning", texto: `P${pagina} ⟳` };
}

// ------------------------------------------------------------
// Estado de la mesa: COMPLETADA (4/4) / EN PROCESO / PENDIENTE
// Válidas = actas VALIDADO (o registradas si ninguna validada).
// ------------------------------------------------------------
function estadoMesa(actas: ActaDTO[]): { label: string; clase: string; n: number } {
  const validadas = actas.filter((a) => a.estado === "VALIDADO").length;
  const n = validadas > 0 ? validadas : actas.length;
  if (n >= 4) return { label: "COMPLETADA 100%", clase: "text-ind-primary-container", n };
  if (n > 0) return { label: "EN PROCESO", clase: "text-ind-secondary", n };
  return { label: "PENDIENTE", clase: "text-ind-on-surface-var", n };
}

export default function PantallaControl() {
  const consulados = useDigitalizador((s) => s.consulados);
  const enLinea = useDigitalizador((s) => s.enLinea);
  const cargandoDatos = useDigitalizador((s) => s.cargandoDatos);
  const irACapturaDesdeControl = useDigitalizador((s) => s.irACapturaDesdeControl);
  const setContexto = useDigitalizador((s) => s.setContexto);
  const irA = useDigitalizador((s) => s.irA);

  const [puestoId, setPuestoId] = useState<string>("");
  const [actaDetalle, setActaDetalle] = useState<ActaDTO | null>(null);

  const puesto = useMemo(
    () => consulados.find((c) => c.id === puestoId) ?? consulados[0] ?? null,
    [consulados, puestoId]
  );

  const abrirRanura = (acta: ActaDTO | null, mesaId: string, tipo: TipoEjemplar, pagina: number) => {
    if (acta) {
      setActaDetalle(acta);
    } else {
      irACapturaDesdeControl({ mesaId, tipoEjemplar: tipo, pagina });
    }
  };

  return (
    <section className="flex flex-col gap-4 bg-ind-bg bg-scanline p-4">
      {/* ===== PUESTO ACTUAL ===== */}
      <div>
        <div className="flex items-end justify-between border-b-2 border-ind-outline-variant pb-2">
          <div className="flex w-full min-w-0 flex-col gap-1">
            <span className="label-caps text-ind-on-surface-var">PUESTO ACTUAL</span>
            <h2 className="display-industrial text-ind-primary">
              {puesto?.puesto ?? "SIN PUESTO"}
            </h2>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="data-mono min-w-0 text-[12px] text-ind-on-surface-var">
                {puesto
                  ? `ID: ${puesto.codigo} | ${puesto.pais} > ${puesto.zona} > ${puesto.puesto}`
                  : "CARGANDO PUESTO…"}
              </span>
              <span className="shrink-0">
                <IndicadorEnLinea enLinea={enLinea} />
              </span>
            </div>
          </div>
        </div>

        {/* Selector de puesto (reestilizado) */}
        {puesto ? (
          <>
            <Select value={puesto.id} onValueChange={setPuestoId}>
              <SelectTrigger className="mt-2 h-10 w-full rounded-none border-2 border-ind-outline-variant bg-ind-container px-3 shadow-none data-mono text-xs text-ind-on-surface data-[size=default]:h-10 dark:border-ind-outline-variant dark:bg-ind-container dark:hover:bg-ind-high">
                <SelectValue placeholder="Seleccionar puesto…" />
              </SelectTrigger>
              <SelectContent>
                {consulados.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.puesto} — {c.ciudad}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <ChipMono>{puesto.codigo}</ChipMono>
              <ChipMono>{puesto.pais}</ChipMono>
              <ChipMono>{puesto.zona}</ChipMono>
              <ChipMono>{puesto.numMesas} MESAS</ChipMono>
              <RelojBogota className="ml-auto" />
              {cargandoDatos && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-ind-on-surface-var" />
              )}
            </div>
          </>
        ) : (
          <div className="mt-2 grid h-10 place-items-center border-2 border-ind-outline-variant bg-ind-container">
            <Loader2 className="h-4 w-4 animate-spin text-ind-on-surface-var" />
          </div>
        )}
      </div>

      {/* ===== MESAS (acordeón) ===== */}
      {puesto && (
        <Accordion
          type="multiple"
          defaultValue={puesto.mesas.slice(0, 1).map((m) => m.id)}
          className="flex flex-col gap-2"
        >
          {puesto.mesas.map((mesa) => {
            const status = estadoMesa(mesa.actas);
            return (
              <AccordionItem
                key={mesa.id}
                value={mesa.id}
                className="overflow-hidden rounded-none border-2 border-ind-outline-variant bg-ind-container px-2 last:border-b-2"
              >
                <AccordionTrigger className="group rounded-none py-2.5 text-base font-bold hover:no-underline focus-visible:ring-0 [&>svg]:hidden">
                  <div className="flex flex-1 items-center justify-between gap-2 pr-1">
                    <span className="flex items-center gap-2 text-[20px] font-bold leading-tight text-ind-on-surface">
                      MESA {String(mesa.numero).padStart(2, "0")}
                      <ChevronDown className="h-4 w-4 text-ind-on-surface-var transition-transform duration-100 ease-linear group-data-[state=open]:rotate-180" />
                    </span>
                    <span className="flex items-center gap-1.5">
                      {status.n > 0 && (
                        <span className="data-mono text-[11px] text-ind-on-surface-var">
                          {status.n}/4
                        </span>
                      )}
                      <span className={cn("label-caps", status.clase)}>{status.label}</span>
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-2">
                  <div className="grid grid-cols-2 gap-1">
                    {(["DELEGADOS", "TRANSMISION"] as const).map((tipo) => (
                      <div
                        key={tipo}
                        className="flex flex-col gap-1 border border-ind-outline-variant bg-ind-variant p-2"
                      >
                        <span className="label-caps text-ind-on-surface-var">
                          {tipo === "DELEGADOS" ? "DELEGADOS" : "TRANSMISIÓN"}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {[1, 2].map((pagina) => {
                            const acta =
                              mesa.actas.find(
                                (a) => a.tipoEjemplar === tipo && a.pagina === pagina
                              ) ?? null;
                            const chip = estiloRanura(acta, pagina);
                            return (
                              <button
                                key={pagina}
                                type="button"
                                onClick={() => abrirRanura(acta, mesa.id, tipo, pagina)}
                                aria-label={`${tipo} P${pagina} — ${
                                  acta ? acta.estado : "vacía"
                                }`}
                                className={cn(
                                  "data-mono min-h-7 w-fit px-2 py-0.5 text-[11px] font-semibold transition-colors active:opacity-80",
                                  chip.clase
                                )}
                              >
                                {chip.texto}
                                {acta && (
                                  <span className="ml-1 text-[9px] opacity-70">
                                    {acta.scoreCalidad}/10
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {/* ===== ESCANEO LIBRE ===== */}
      <Button
        variant="outline"
        className="h-12 w-full rounded-none border-2 border-ind-outline-variant bg-transparent text-xs font-bold tracking-wide text-ind-primary shadow-none hover:bg-ind-primary/10 hover:text-ind-primary dark:border-ind-outline-variant dark:bg-transparent dark:hover:bg-ind-primary/10 dark:hover:text-ind-primary"
        onClick={() => {
          setContexto(null);
          irA("captura");
        }}
      >
        <ScanLine className="h-4 w-4" /> ESCANEAR LIBRE (ASIGNAR DESPUÉS)
      </Button>

      {/* ===== DETALLE DE ACTA ===== */}
      <Dialog open={Boolean(actaDetalle)} onOpenChange={(open) => !open && setActaDetalle(null)}>
        <DialogContent className="max-w-sm rounded-none border-2 border-ind-outline-variant bg-ind-container text-ind-on-surface">
          <DialogHeader>
            <DialogTitle className="data-mono text-sm font-bold text-ind-on-surface">
              {actaDetalle?.tipoEjemplar} · P{actaDetalle?.pagina} ·{" "}
              {actaDetalle?.consulado ?? "—"}
            </DialogTitle>
            <DialogDescription className="text-xs text-ind-on-surface-var">
              Registrada: {actaDetalle ? fechaBogota(actaDetalle.createdAt) : ""}
            </DialogDescription>
          </DialogHeader>
          {actaDetalle && (
            <div className="flex flex-col gap-3">
              <div className="border border-ind-outline-variant bg-ind-lowest">
                <img
                  src={`/api/actas/${actaDetalle.id}/imagen`}
                  alt="Acta registrada"
                  className="max-h-72 w-full object-contain"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <BadgeEstado estado={actaDetalle.estado} />
                <ChipMono>SCORE {actaDetalle.scoreCalidad}/10</ChipMono>
                {actaDetalle.modoManual && <ChipMono>MANUAL</ChipMono>}
                {actaDetalle.envioAdvertencia && (
                  <ChipMono className="border-warning/40 bg-warning/10 text-warning">
                    ADVERTIDA
                  </ChipMono>
                )}
              </div>
              {actaDetalle.barcode15 && (
                <p className="data-mono text-center text-xs text-ind-on-surface-var">
                  {actaDetalle.barcode15}
                </p>
              )}
              {actaDetalle.problemas.length > 0 && (
                <ul className="list-inside list-disc space-y-0.5 text-xs text-ind-error">
                  {actaDetalle.problemas.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
