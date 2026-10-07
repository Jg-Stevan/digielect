"use client";

// ============================================================
// DIGITALIZADOR E-14 — PANTALLA DE INICIO (sin puesto asignado)
// TAREA 5.1 (PLAN_DIGIELECT_DIGITALIZADOR.md) · C-17
//
// "El operario no tiene puesto asignado inicialmente":
//   · OPCIÓN A — Escanear la primera acta → el motor de visión
//     extrae el código entre las X, identifica el puesto O(1) y
//     descarga su dataset a IndexedDB automáticamente.
//   · OPCIÓN B — Selección manual en la lista (descarga <50 KB).
// Estilo Stitch v2 del módulo (brand dark + industrial).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Database,
  Loader2,
  MapPin,
  ScanLine,
  Search,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useDigitalizador } from "@/lib/digitalizador/store";
import { contarFilasPuesto } from "@/services/puestoStorage";
import type { PuestoAsignado } from "@/services/puestoStorage";

export default function PantallaInicio() {
  const irA = useDigitalizador((s) => s.irA);
  const iniciarIdentificacionPuesto = useDigitalizador(
    (s) => s.iniciarIdentificacionPuesto
  );
  const cargandoDatos = useDigitalizador((s) => s.cargandoDatos);
  const consulados = useDigitalizador((s) => s.consulados);
  const asignarPuesto = useDigitalizador((s) => s.asignarPuesto);

  const [filasLocales, setFilasLocales] = useState<number | null>(null);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  // Estado del dataset local persistido (si la jornada ya arrancó hoy)
  useEffect(() => {
    let vivo = true;
    void contarFilasPuesto()
      .then((n) => {
        if (vivo) setFilasLocales(n);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  // Lista filtrada del selector manual (OPCIÓN B)
  const listaFiltrada = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const base = consulados;
    if (!q) return base.slice(0, 120);
    return base
      .filter(
        (c) =>
          c.pais.toLowerCase().includes(q) ||
          c.ciudad.toLowerCase().includes(q) ||
          c.puesto.toLowerCase().includes(q) ||
          c.codigo.includes(q)
      )
      .slice(0, 120);
  }, [consulados, busqueda]);

  const asignarManual = async (c: (typeof consulados)[number]) => {
    const puesto: PuestoAsignado = {
      consuladoId: c.id,
      codigo: c.codigo,
      pais: c.pais,
      ciudad: c.ciudad,
      zona: c.zona,
      puesto: c.puesto,
      numMesas: c.numMesas,
      asignadoEn: Date.now(),
      viaEscaneo: false,
    };
    setSelectorAbierto(false);
    await asignarPuesto(puesto, false);
    irA("captura");
  };

  return (
    <section
      aria-label="Inicio de jornada"
      className="fine-scroll flex h-full flex-col overflow-y-auto bg-[#050705] px-5 pb-10 pt-12"
    >
      {/* Marca superior */}
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-brand-500/30 bg-brand-500/10 shadow-[0_0_40px_-8px_rgba(0,230,118,0.45)]">
          <ScanLine className="h-8 w-8 text-brand-500" />
        </div>
        <h1 className="display-industrial text-2xl text-white">
          DIGITALIZADOR <span className="text-brand-500">E-14</span>
        </h1>
        <p className="data-mono mt-2 text-[11px] tracking-wide text-zinc-400">
          INICIO DE JORNADA · PUESTO SIN ASIGNAR
        </p>
      </div>

      {/* Tarjeta prominente (OPCIÓN A — recomendada) */}
      <button
        type="button"
        onClick={() => iniciarIdentificacionPuesto()}
        data-testid="btn-escanear-primera-acta"
        className="group relative mb-4 w-full overflow-hidden rounded-2xl border border-brand-500/40 bg-gradient-to-b from-brand-500/15 to-brand-500/5 p-5 text-left shadow-[0_0_50px_-16px_rgba(0,230,118,0.5)] transition-all active:scale-[0.99]"
      >
        <div className="bg-scanline pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative flex items-start gap-4">
          <span className="shutter-glow flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-brand-500/50 bg-brand-500/20">
            <ScanLine className="h-6 w-6 text-brand-400" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="label-caps mb-1 block text-[10px] text-brand-400">
              OPCIÓN A · RECOMENDADA
            </span>
            <span className="mb-1 block text-[15px] font-semibold leading-snug text-white">
              Escanear primera acta para identificar el puesto
            </span>
            <span className="block text-xs leading-relaxed text-zinc-400">
              El motor de visión lee el código entre las X y asigna el
              puesto automáticamente, con descarga local del dataset
              (funciona sin red).
            </span>
          </span>
        </div>
      </button>

      {/* Botón secundario (OPCIÓN B) */}
      <button
        type="button"
        onClick={() => setSelectorAbierto(true)}
        data-testid="btn-seleccionar-puesto-manual"
        className="mb-6 flex w-full items-center gap-4 rounded-2xl border border-ind-outline-variant bg-ind-lowest p-5 text-left transition-colors hover:bg-ind-high"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-ind-outline-variant bg-ind-bg">
          <Search className="h-6 w-6 text-ind-primary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="label-caps mb-1 block text-[10px] text-ind-on-surface-var">
            OPCIÓN B · MANUAL
          </span>
          <span className="block text-[14px] font-semibold text-white">
            Seleccionar puesto manualmente de la lista
          </span>
          <span className="mt-0.5 block text-xs text-zinc-400">
            Descarga instantánea del dataset (&lt;50 KB).
          </span>
        </span>
      </button>

      {/* Estado del dataset local (industrial) */}
      <div className="mt-auto rounded-xl border border-ind-outline-variant bg-ind-bg p-4">
        <div className="flex items-center gap-3">
          <Database className="h-4 w-4 shrink-0 text-ind-primary" />
          <div className="min-w-0 flex-1">
            <p className="label-caps text-[10px] text-ind-on-surface-var">
              BASE LOCAL DEL DISPOSITIVO
            </p>
            <p className="data-mono mt-0.5 text-[11px] text-ind-on-surface">
              {cargandoDatos ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3 w-3 animate-spin" /> verificando…
                </span>
              ) : filasLocales != null && filasLocales > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-brand-500" />
                  {filasLocales} filas de puestos en IndexedDB
                </span>
              ) : (
                "sin dataset previo — se descarga al asignar puesto"
              )}
            </p>
          </div>
          <MapPin
            className={cn(
              "h-4 w-4 shrink-0",
              filasLocales ? "text-brand-500" : "text-ind-outline-variant"
            )}
          />
        </div>
      </div>

      {/* ===== SELECTOR MANUAL DE PUESTO (OPCIÓN B) ===== */}
      <Dialog open={selectorAbierto} onOpenChange={setSelectorAbierto}>
        <DialogContent className="max-h-[80dvh] border-ind-outline-variant bg-ind-lowest sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="display-industrial text-base text-ind-primary">
              SELECCIONAR PUESTO
            </DialogTitle>
            <DialogDescription className="text-xs text-ind-on-surface-var">
              Busque por país, ciudad, código o nombre del puesto. Al
              confirmar se descarga el dataset del puesto (&lt;50 KB).
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ind-on-surface-var" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Ej.: Egipto, Roma, 495-10-02…"
              aria-label="Buscar puesto"
              className="border-ind-outline-variant bg-ind-bg pl-8 text-sm"
            />
          </div>
          <div
            data-testid="lista-puestos"
            className="fine-scroll max-h-72 overflow-y-auto rounded-lg border border-ind-outline-variant bg-ind-bg"
            role="listbox"
            aria-label="Lista de puestos disponibles"
          >
            {listaFiltrada.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-ind-on-surface-var">
                {consulados.length === 0
                  ? "Cargando puestos…"
                  : "Sin resultados para esa búsqueda."}
              </p>
            ) : (
              listaFiltrada.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => void asignarManual(c)}
                  data-testid={`puesto-${c.codigo}`}
                  className="flex w-full items-center gap-3 border-b border-ind-outline-variant/60 px-3 py-2.5 text-left last:border-0 transition-colors hover:bg-ind-high"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-ind-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-ind-on-surface">
                      {c.puesto}
                    </span>
                    <span className="data-mono block truncate text-[10px] text-ind-on-surface-var">
                      {c.pais} · {c.ciudad} · ZONA {c.zona}
                    </span>
                  </span>
                  <span className="data-mono shrink-0 rounded border border-ind-outline-variant px-1.5 py-0.5 text-[9px] text-ind-on-surface-var">
                    {c.numMesas} MESAS
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
