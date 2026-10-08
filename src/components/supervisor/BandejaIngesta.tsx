"use client";

// ============================================================
// [FASE-7 · PLAN §9.1] BandejaIngesta — bandejas de revisión
// 3 colas: score (bajo/medio) · conflicto (ruteo discrepa /
// mesa inexistente) · contingencia. Acciones: ver imagen,
// re-asignar mesa (buscar en catálogo), aceptar, rechazar.
// Export CSV de la bandeja. Solo supervisor (guard de sesión en
// la API).
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, Download, Loader2, RefreshCcw, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ActaFila {
  id: string;
  mesaId: string;
  tokenPuesto: string;
  estado: string;
  motivo: string | null;
  score: number;
  ocrMesaId: string | null;
  origen: string;
  createdAt: string;
  datos: { archivo?: string; fuente?: string } & Record<string, unknown>;
}

type Cola = "score" | "conflicto" | "contingencia";

const COLAS: { id: Cola; label: string; descripcion: string }[] = [
  { id: "score", label: "SCORE", descripcion: "Calidad baja o intermedia (revisar y aceptar)" },
  { id: "conflicto", label: "CONFLICTO", descripcion: "Ruteo discrepa o mesa inexistente" },
  { id: "contingencia", label: "CONTINGENCIA", descripcion: "Guardadas por contingencia del jurado" },
];

export function BandejaIngesta() {
  const { toast } = useToast();
  const [cola, setCola] = useState<Cola>("score");
  const [actas, setActas] = useState<ActaFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [porEstado, setPorEstado] = useState<Record<string, number>>({});
  const [subiendo, setSubiendo] = useState(false);

  /** [FASE-7 · PLAN §9.2] Sube un lote (ZIP/PDF/TIFF/PNG/HEIC/JPEG) a la cola. */
  const subirLote = async (archivo: File) => {
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.set("archivo", archivo);
      fd.set("nombre", archivo.name);
      const res = await fetch("/api/actas/masiva", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as {
        procesadas?: number;
        duplicadas?: number;
        errores?: number;
        error?: string;
      };
      if (!res.ok) {
        toast({ title: "LOTE RECHAZADO", description: data.error ?? "Error", variant: "destructive" });
        return;
      }
      toast({
        title: "LOTE PROCESADO",
        description: `${data.procesadas ?? 0} en revisión · ${data.duplicadas ?? 0} duplicadas · ${data.errores ?? 0} con error`,
      });
      void cargar();
    } finally {
      setSubiendo(false);
    }
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch(`/api/actas/revision?cola=${cola}&limit=100`);
      if (res.ok) {
        const data = (await res.json()) as { actas: ActaFila[]; porEstado: Record<string, number> };
        setActas(data.actas ?? []);
        setPorEstado(data.porEstado ?? {});
      }
    } finally {
      setCargando(false);
    }
  }, [cola]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const accion = async (id: string, cuerpo: Record<string, unknown>) => {
    setProcesando(id);
    try {
      const res = await fetch(`/api/actas/revision/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        toast({ title: "ACCIÓN FALLÓ", description: e.error ?? "Error", variant: "destructive" });
        return;
      }
      toast({ title: "RESUELTA", description: `Acta ${id.slice(0, 8)}…` });
      void cargar();
    } finally {
      setProcesando(null);
    }
  };

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return actas;
    return actas.filter(
      (a) =>
        a.id.toLowerCase().includes(q) ||
        a.mesaId.toLowerCase().includes(q) ||
        a.tokenPuesto.toLowerCase().includes(q) ||
        (a.motivo ?? "").toLowerCase().includes(q)
    );
  }, [actas, busqueda]);

  const exportarCsv = () => {
    const filas = [
      ["id", "cola", "mesaId", "puesto", "estado", "score", "origen", "motivo", "createdAt"],
      ...filtradas.map((a) => [
        a.id,
        cola,
        a.mesaId,
        a.tokenPuesto,
        a.estado,
        String(Math.round(a.score)),
        a.origen,
        (a.motivo ?? "").replace(/"/g, "'"),
        a.createdAt,
      ]),
    ];
    const csv = filas.map((f) => f.map((c) => `"${c}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `bandeja-${cola}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-label="Bandeja de revisión de ingesta" className="flex h-full flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Bandeja de revisión</h2>
          <p className="text-sm text-muted-foreground">
            Actas del canal de ingesta que requieren revisión humana (la regla de producto aplica: lo
            manuscrito lo decide un humano, no el sistema).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
            {porEstado.revision ?? 0} en revisión · {porEstado.conflicto ?? 0} conflicto
          </span>
          <label>
            <input
              type="file"
              className="sr-only"
              accept=".zip,.pdf,.tif,.tiff,.png,.heic,.heif,.jpg,.jpeg,.webp,.avif"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void subirLote(f);
                e.target.value = "";
              }}
            />
            <Button variant="default" size="sm" disabled={subiendo} asChild>
              <span className="cursor-pointer">
                {subiendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                SUBIR LOTE
              </span>
            </Button>
          </label>
          <Button variant="outline" size="sm" onClick={() => void cargar()} disabled={cargando}>
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            REFRESCAR
          </Button>
        </div>
      </header>

      {/* Colas */}
      <div className="grid shrink-0 grid-cols-3 gap-2" role="tablist" aria-label="Colas de revisión">
        {COLAS.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={cola === c.id}
            onClick={() => setCola(c.id)}
            className={cn(
              "rounded-xl border p-3 text-left transition-all",
              cola === c.id
                ? "border-primary/60 bg-primary/10 shadow-sm"
                : "border-border bg-card hover:bg-muted/50"
            )}
          >
            <span className="block text-xs font-extrabold uppercase tracking-widest">
              {c.label}
            </span>
            <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">
              {c.descripcion}
            </span>
          </button>
        ))}
      </div>

      {/* Buscador + CSV */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Filtrar por id, mesa, puesto o motivo…"
            aria-label="Filtrar bandeja"
            className="h-10 pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={exportarCsv} disabled={filtradas.length === 0}>
          <Download className="h-4 w-4" /> CSV
        </Button>
      </div>

      {/* Lista de actas (scroll propio) */}
      <div className="min-h-0 flex-1 max-h-full overflow-y-auto rounded-xl border">
        {cargando && (
          <div className="flex items-center justify-center gap-2 p-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando bandeja…
          </div>
        )}
        {!cargando && filtradas.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-8 text-muted-foreground">
            <ClipboardList className="h-8 w-8" />
            <p className="text-sm">Sin actas en esta cola. ¡Buen trabajo!</p>
          </div>
        )}
        <ul className="divide-y">
          {filtradas.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted/40 sm:flex-nowrap">
              {/* Miniatura (imagen procesada servida por la API) */}
              <img
                src={`/api/actas/ingesta/${a.id}/imagen?tipo=procesada`}
                alt={`Acta ${a.id.slice(0, 8)}`}
                className="h-16 w-12 shrink-0 rounded-md border object-cover"
                loading="lazy"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold">{a.id.slice(0, 8)}…</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                      a.estado === "conflicto"
                        ? "bg-red-500/15 text-red-600"
                        : a.estado === "revision"
                          ? "bg-amber-500/15 text-amber-600"
                          : "bg-emerald-500/15 text-emerald-600"
                    )}
                  >
                    {a.estado}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase">
                    {a.origen}
                  </span>
                  <span className="text-xs text-muted-foreground">score {Math.round(a.score)}</span>
                  <span className="text-xs text-muted-foreground">puesto {a.tokenPuesto}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {a.motivo ?? `mesa ${a.mesaId}`}
                  {a.ocrMesaId && a.ocrMesaId !== a.mesaId ? ` · OCR: ${a.ocrMesaId}` : ""}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(a.createdAt).toLocaleString()}
                  {a.datos?.archivo ? ` · ${String(a.datos.archivo)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  title="Ver imagen procesada en pestaña nueva"
                  onClick={() => window.open(`/api/actas/ingesta/${a.id}/imagen?tipo=procesada`, "_blank")}
                >
                  VER
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  title="Reasignar a otra mesa"
                  disabled={procesando === a.id}
                  onClick={() => {
                    const mesa = window.prompt(
                      "ID de la mesa destino (buscar en el catálogo, ej. mesa-el-cairo-001):",
                      a.mesaId
                    );
                    if (mesa && mesa !== a.mesaId) void accion(a.id, { accion: "reasignar", mesaId: mesa });
                  }}
                >
                  REASIGNAR
                </Button>
                <Button
                  size="sm"
                  disabled={procesando === a.id}
                  onClick={() => void accion(a.id, { accion: "aceptar" })}
                >
                  {procesando === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  ACEPTAR
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={procesando === a.id}
                  onClick={() => void accion(a.id, { accion: "rechazar" })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
