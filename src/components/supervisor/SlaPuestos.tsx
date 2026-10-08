"use client";

// ============================================================
// [FASE-7 · PLAN §9.3-9.4] SlaPuestos — panel SLA de digitalización
// GET /api/informes/sla-puestos → tabla ordenada rojo → ambar → verde
// (orden que entrega el API) con buscador, umbrales por env
// (SLA_AMBAR_DIAS=2, SLA_ROJO_DIAS=5) y export CSV del informe.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, RefreshCcw, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FilaSla {
  puestoId: string;
  ciudad: string;
  pais: string;
  zona: string;
  numMesas: number;
  ultimaActa: string | null;
  diasSinDigitalizar: number | null;
  semaforo: "rojo" | "ambar" | "verde";
}

interface RespuestaSla {
  umbrales: { ambarDias: number; rojoDias: number };
  total: number;
  porSemaforo: { rojo: number; ambar: number; verde: number };
  puestos: FilaSla[];
}

/** Máximo de filas renderizadas a la vez (949 puestos en catálogo real). */
const MAX_FILAS = 100;

const ESTILO_SEMAFORO: Record<
  FilaSla["semaforo"],
  { punto: string; chip: string; label: string }
> = {
  rojo: { punto: "bg-red-500", chip: "bg-red-500/15 text-red-600", label: "Rojo" },
  ambar: { punto: "bg-amber-500", chip: "bg-amber-500/15 text-amber-600", label: "Ámbar" },
  verde: { punto: "bg-emerald-500", chip: "bg-emerald-500/15 text-emerald-600", label: "Verde" },
};

export function SlaPuestos() {
  const [data, setData] = useState<RespuestaSla | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/informes/sla-puestos");
      if (!res.ok) {
        setError("No se pudo calcular el SLA.");
        return;
      }
      setData((await res.json()) as RespuestaSla);
    } catch {
      setError("No se pudo calcular el SLA.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtrados = useMemo(() => {
    if (!data) return [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return data.puestos;
    return data.puestos.filter(
      (p) =>
        p.puestoId.toLowerCase().includes(q) ||
        p.ciudad.toLowerCase().includes(q) ||
        p.pais.toLowerCase().includes(q) ||
        p.zona.toLowerCase().includes(q)
    );
  }, [data, busqueda]);

  const visibles = filtrados.slice(0, MAX_FILAS);

  // [PLAN §9.4] CSV del SLA (export básico, mismo patrón que la bandeja)
  const exportarCsv = () => {
    const filas = [
      ["puesto", "ciudad", "pais", "zona", "mesas", "ultima_acta", "dias_sin_digitalizar", "semaforo"],
      ...filtrados.map((p) => [
        p.puestoId,
        p.ciudad,
        p.pais,
        p.zona,
        String(p.numMesas),
        p.ultimaActa ?? "",
        p.diasSinDigitalizar?.toString() ?? "",
        p.semaforo,
      ]),
    ];
    const csv = filas.map((f) => f.map((c) => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sla-puestos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-label="SLA de puestos" className="flex h-full flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">SLA de puestos</h2>
          <p className="text-sm text-muted-foreground">
            Días sin digitalizar por puesto consular, fusionando el canal de ingesta y el flujo
            histórico. Ordenado rojo → verde.
            {data && (
              <>
                {" "}Umbrales: ámbar ≥ {data.umbrales.ambarDias} d · rojo ≥ {data.umbrales.rojoDias} d.
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <span className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-600">
              {data.porSemaforo.rojo} rojo
            </span>
          )}
          {data && (
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-600">
              {data.porSemaforo.ambar} ámbar
            </span>
          )}
          {data && (
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600">
              {data.porSemaforo.verde} verde
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => void cargar()} disabled={cargando}>
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            REFRESCAR
          </Button>
          <Button size="sm" onClick={exportarCsv} disabled={!data || filtrados.length === 0}>
            <Download className="h-4 w-4" />
            EXPORT CSV
          </Button>
        </div>
      </header>

      {/* Buscador */}
      <div className="shrink-0">
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar puesto por código, ciudad, país o zona (ej. 335-05-02, EL CAIRO, EGIPTO)"
          aria-label="Buscar puesto en el SLA"
          className="h-11"
        />
      </div>

      {error && (
        <div className="shrink-0 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Tabla SLA */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
        <table className="w-full text-sm">
          <caption className="sr-only">Puestos ordenados por semáforo de SLA, de rojo a verde</caption>
          <thead className="sticky top-0 bg-muted/95 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Semáforo</th>
              <th className="px-4 py-2.5">Puesto</th>
              <th className="hidden px-4 py-2.5 md:table-cell">Ciudad / País</th>
              <th className="hidden px-4 py-2.5 lg:table-cell">Zona</th>
              <th className="hidden px-4 py-2.5 text-right sm:table-cell">Mesas</th>
              <th className="px-4 py-2.5 text-right">Días sin digitalizar</th>
              <th className="hidden px-4 py-2.5 text-right md:table-cell">Última acta</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => {
              const est = ESTILO_SEMAFORO[p.semaforo];
              return (
                <tr key={p.puestoId} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", est.punto)} aria-hidden="true" />
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", est.chip)}>
                        {est.label}
                      </span>
                      <span className="sr-only">
                        {p.diasSinDigitalizar === null
                          ? "sin actas recibidas"
                          : `${p.diasSinDigitalizar} días sin digitalizar`}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono font-semibold">{p.puestoId}</td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                    {p.ciudad} · {p.pais}
                  </td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground lg:table-cell">{p.zona}</td>
                  <td className="hidden px-4 py-2.5 text-right text-muted-foreground sm:table-cell">{p.numMesas}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">
                    {p.diasSinDigitalizar === null ? "—" : p.diasSinDigitalizar}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right text-muted-foreground md:table-cell">
                    {p.ultimaActa ? new Date(p.ultimaActa).toLocaleDateString() : "Nunca"}
                  </td>
                </tr>
              );
            })}
            {visibles.length === 0 && !cargando && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {error ? "Sin datos." : "Sin puestos que coincidan con la búsqueda."}
                </td>
              </tr>
            )}
            {cargando && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-label="Cargando SLA" />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="shrink-0 text-xs text-muted-foreground">
        {filtrados.length > MAX_FILAS
          ? `Mostrando ${MAX_FILAS} de ${filtrados.length} puestos (el CSV exporta todos los filtrados; usa el buscador para acotar).`
          : `${filtrados.length} puesto${filtrados.length === 1 ? "" : "s"} · el orden rojo → verde lo define el API.`}
      </p>
    </section>
  );
}
