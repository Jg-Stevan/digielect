"use client";

// ============================================================
// DIGITALIZADOR E-14 — CONTROL DE ACTAS (estilo industrial)
// Acordeón de mesas con ranuras DELEGADOS/TRANSMISIÓN P1-P2.
// ============================================================

import { useMemo, useState } from "react";
import { ChevronDown, Loader2, ScanLine, Search, X } from "lucide-react";
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
// [OLA7 · AN-3] `cat` = categoría para el mini-KPI del puesto.
// ------------------------------------------------------------
function estadoMesa(
  actas: ActaDTO[]
): { label: string; clase: string; n: number; cat: "completa" | "proceso" | "pendiente" } {
  const validadas = actas.filter((a) => a.estado === "VALIDADO").length;
  const n = validadas > 0 ? validadas : actas.length;
  if (n >= 4)
    return { label: "COMPLETADA 100%", clase: "text-ind-primary-container", n, cat: "completa" };
  if (n > 0) return { label: "EN PROCESO", clase: "text-ind-secondary", n, cat: "proceso" };
  return { label: "PENDIENTE", clase: "text-ind-on-surface-var", n, cat: "pendiente" };
}

/** Mini-KPI industrial (Control): valor mono + etiqueta caps compacta */
function MiniKPI({
  etiqueta,
  valor,
  texto,
  borde,
}: {
  etiqueta: string;
  valor: number;
  texto: string;
  borde: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-1 border-2 bg-ind-lowest px-2 py-1.5",
        borde
      )}
    >
      <span className={cn("data-mono text-[16px] font-bold leading-none", texto)}>
        {String(valor).padStart(2, "0")}
      </span>
      <span className="label-caps text-[9px] text-ind-on-surface-var">{etiqueta}</span>
    </div>
  );
}

export default function PantallaControl() {
  const consulados = useDigitalizador((s) => s.consulados);
  const enLinea = useDigitalizador((s) => s.enLinea);
  const cargandoDatos = useDigitalizador((s) => s.cargandoDatos);
  const irACapturaDesdeControl = useDigitalizador((s) => s.irACapturaDesdeControl);
  const setContexto = useDigitalizador((s) => s.setContexto);
  const irA = useDigitalizador((s) => s.irA);
  // [OLA7 · M-1 AN-3] El puesto ASIGNADO manda: sin selección explícita
  // del operario, Control abre en el puesto del digitalizador (antes
  // consulados[0] → "Accra" aunque el puesto activo fuera Roma).
  const puestoActivo = useDigitalizador((s) => s.puestoActivo);
  // [SLIM-BOOTSTRAP] Cambio de puesto = liberar y volver a inicio
  // (el puesto se deriva del ESCANEO, no de un selector de 949).
  const liberarPuesto = useDigitalizador((s) => s.liberarPuesto);

  const [actaDetalle, setActaDetalle] = useState<ActaDTO | null>(null);
  // [OLA7 · AN-3] BÚSQUEDA DE MESA: filtro rápido por número (o nombre
  // del puesto/ciudad → muestra todas sus mesas) + acordeón controlado.
  const [filtro, setFiltro] = useState("");
  const [mesaAbierta, setMesaAbierta] = useState<string>("");

  const puesto = useMemo(
    () =>
      consulados.find((c) => c.id === puestoActivo?.consuladoId) ??
      consulados.find((c) => c.codigo === puestoActivo?.codigo) ??
      null,
    [consulados, puestoActivo]
  );

  const consulta = filtro.trim().toLowerCase();
  const mesasVisibles = useMemo(() => {
    const mesas = puesto?.mesas ?? [];
    if (!consulta) return mesas;
    // Coincidencia por nombre de puesto/ciudad → TODAS sus mesas
    if (
      puesto &&
      (puesto.puesto.toLowerCase().includes(consulta) ||
        puesto.ciudad.toLowerCase().includes(consulta))
    ) {
      return mesas;
    }
    // Por número de mesa: "3" → mesas 3, 13, 23, 30-39…
    return mesas.filter((m) => String(m.numero).includes(filtro.trim()));
  }, [puesto, consulta, filtro]);

  // [OLA7 · AN-3] Mini-KPI del puesto: COMPLETAS / EN PROCESO /
  // PENDIENTES derivado de estadoMesa() (misma lógica del acordeón).
  const conteoMesas = useMemo(() => {
    const conteo = { completa: 0, proceso: 0, pendiente: 0 };
    for (const m of puesto?.mesas ?? []) conteo[estadoMesa(m.actas).cat]++;
    return conteo;
  }, [puesto]);

  // Reset de expansión DURANTE EL RENDER (patrón oficial de React
  // "adjusting state when a prop changes" — sin efecto, sin cascadas
  // de renders): cuando cambia el conjunto visible (filtro, selector de
  // puesto o recarga de datos) y la mesa abierta ya no está en él, se
  // abre la primera del resultado. El acordeón sigue single-open: solo
  // una mesa abierta a la vez, y el usuario puede cerrar todas.
  const [mesasVisiblesPrevias, setMesasVisiblesPrevias] = useState(mesasVisibles);
  if (mesasVisiblesPrevias !== mesasVisibles) {
    setMesasVisiblesPrevias(mesasVisibles);
    setMesaAbierta((actual) =>
      actual && mesasVisibles.some((m) => m.id === actual)
        ? actual
        : (mesasVisibles[0]?.id ?? "")
    );
  }

  const abrirRanura = (acta: ActaDTO | null, mesaId: string, tipo: TipoEjemplar, pagina: number) => {
    if (acta) {
      setActaDetalle(acta);
    } else {
      irACapturaDesdeControl({ mesaId, tipoEjemplar: tipo, pagina });
    }
  };

  return (
    <section className="flex flex-col gap-4 bg-ind-bg bg-scanline p-4">
      {/* ===== [SLIM-BOOTSTRAP] ESTADO VACÍO — sin actas escaneadas ===== */}
      {!puestoActivo ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-2 py-14 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl border border-ind-outline-variant bg-ind-lowest">
            <ScanLine className="h-8 w-8 text-ind-primary" />
          </span>
          <div className="space-y-1.5">
            <h2 className="display-industrial text-lg text-ind-on-surface">
              AÚN NO HAY ACTAS
            </h2>
            <p className="mx-auto max-w-[280px] text-sm leading-relaxed text-ind-on-surface-var">
              Escanea la primera acta del puesto: el sistema la identifica
              por su código de barras, carga la información del puesto y
              descarga solo su dataset local.
            </p>
          </div>
          <Button
            className="h-12 w-full max-w-[280px] rounded-none bg-ind-primary text-xs font-bold tracking-wide text-ind-on-primary shadow-none hover:bg-ind-primary/90 dark:bg-ind-primary dark:text-ind-on-primary"
            onClick={() => irA("captura")}
            data-testid="btn-ir-a-escanear"
          >
            <ScanLine className="h-4 w-4" /> IR A ESCANEAR
          </Button>
        </div>
      ) : (
        <>
      {/* ===== PUESTO ACTUAL (derivado del escaneo — sin selector) ===== */}
      <div>
        <div className="flex items-end justify-between border-b-2 border-ind-outline-variant pb-2">
          <div className="flex w-full min-w-0 flex-col gap-1">
            <span className="label-caps text-ind-on-surface-var">PUESTO ACTUAL</span>
            <h2 className="display-industrial text-ind-primary">
              {puesto?.puesto ?? "CARGANDO PUESTO…"}
            </h2>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="data-mono min-w-0 text-[12px] text-ind-on-surface-var">
                {puesto
                  ? `ID: ${puesto.codigo} | ${puesto.pais} > ${puesto.zona} > ${puesto.puesto}`
                  : "DESCARGANDO DATASET DEL PUESTO…"}
              </span>
              <span className="shrink-0">
                <IndicadorEnLinea enLinea={enLinea} />
              </span>
            </div>
          </div>
        </div>

        {/* Info del puesto + cambio de sede (libera → vuelve a Inicio) */}
        {puesto ? (
          <>
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
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-8 w-fit rounded-none border-ind-outline-variant bg-transparent px-3 text-[10px] font-bold tracking-wide text-ind-on-surface-var shadow-none hover:bg-ind-high hover:text-ind-on-surface dark:border-ind-outline-variant dark:bg-transparent"
              onClick={() => void liberarPuesto()}
            >
              CAMBIAR PUESTO
            </Button>
          </>
        ) : (
          <div className="mt-2 grid h-10 place-items-center border-2 border-ind-outline-variant bg-ind-container">
            <Loader2 className="h-4 w-4 animate-spin text-ind-on-surface-var" />
          </div>
        )}
      </div>

      {/* ===== MESAS: MINI-KPI + BÚSQUEDA + ACORDEÓN ===== */}
      {puesto && (
        <>
          {/* [OLA7 · AN-3] Mini-KPI del puesto (compacto, industrial) */}
          <div className="grid grid-cols-3 gap-1">
            <MiniKPI
              etiqueta="COMPLETAS"
              valor={conteoMesas.completa}
              texto="text-ind-primary-container"
              borde="border-ind-primary-container/50"
            />
            <MiniKPI
              etiqueta="EN PROCESO"
              valor={conteoMesas.proceso}
              texto="text-ind-secondary"
              borde="border-ind-secondary/50"
            />
            <MiniKPI
              etiqueta="PENDIENTES"
              valor={conteoMesas.pendiente}
              texto="text-ind-on-surface-var"
              borde="border-ind-outline-variant"
            />
          </div>

          {/* [OLA7 · AN-3] BUSCAR MESA: filtro rápido por número */}
          <div className="flex flex-col gap-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ind-on-surface-var" />
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="N° MESA…"
                aria-label="Buscar mesa por número"
                className="data-mono h-10 w-full border-2 border-ind-outline-variant bg-ind-lowest pl-8 pr-10 text-[13px] font-semibold uppercase text-ind-on-surface placeholder:font-normal placeholder:normal-case placeholder:text-ind-on-surface-var/60 focus-visible:border-ind-primary focus-visible:outline-none"
              />
              {filtro !== "" && (
                <button
                  type="button"
                  onClick={() => setFiltro("")}
                  aria-label="Limpiar búsqueda de mesa"
                  className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center text-ind-on-surface-var transition-colors hover:text-ind-on-surface after:absolute after:-inset-2 after:content-['']"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {filtro.trim() !== "" && (
              <span role="status" className="data-mono text-[10px] text-ind-on-surface-var">
                {mesasVisibles.length} MESAS — «{filtro.trim()}»
              </span>
            )}
          </div>

          {mesasVisibles.length === 0 ? (
            <p className="border-2 border-dashed border-ind-outline-variant bg-ind-lowest p-4 text-center text-sm text-ind-on-surface-var">
              SIN MESAS QUE COINCIDAN CON «{filtro.trim()}»
            </p>
          ) : (
          <Accordion
            type="single"
            collapsible
            value={mesaAbierta}
            onValueChange={setMesaAbierta}
            className="flex flex-col gap-2"
          >
            {mesasVisibles.map((mesa) => {
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
                                  // [OLA7 · B-1 AN-3] Touch target ≥44px:
                                  // el hit crece con ::after (28px visual
                                  // + 2×10px = 48px) sin engordar el chip.
                                  "data-mono relative min-h-7 w-fit px-2 py-0.5 text-[11px] font-semibold transition-colors active:opacity-80 after:absolute after:-inset-2.5 after:content-['']",
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
        </>
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
        </>
      )}
    </section>
  );
}
