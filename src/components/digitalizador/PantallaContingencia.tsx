"use client";

// ============================================================
// DIGITALIZADOR E-14 — CONTINGENCIA: asignación manual
// Se activa cuando no se pudo leer el código / no hay mesa.
// Vía A: digitación del barcode15 · Vía B: selector de ubicación.
// Estilo "brand dark" (negro + verde #00e676) del diseño de revisión.
// ============================================================

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Cloud,
  Loader2,
  RefreshCcw,
  ScanLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  formatearBarcode,
  normalizarDigitos,
  parseBarcode15,
} from "@/lib/digitalizador/reglas";
import type { TipoEjemplar } from "@/lib/digitalizador/types";
import { useDigitalizador } from "@/lib/digitalizador/store";

export default function PantallaContingencia() {
  const captura = useDigitalizador((s) => s.captura);
  const analisis = useDigitalizador((s) => s.analisis);
  const modoManual = useDigitalizador((s) => s.modoManual);
  const enviando = useDigitalizador((s) => s.enviando);
  const consulados = useDigitalizador((s) => s.consulados);
  const contexto = useDigitalizador((s) => s.contexto);
  const repetirFoto = useDigitalizador((s) => s.repetirFoto);
  const enviarActa = useDigitalizador((s) => s.enviarActa);
  const irA = useDigitalizador((s) => s.irA);

  const [barcode, setBarcode] = useState("");
  const [consuladoId, setConsuladoId] = useState<string>(contexto ? consulados.find((c) => c.mesas.some((m) => m.id === contexto.mesaId))?.id ?? "" : "");
  const [mesaId, setMesaId] = useState<string>(contexto?.mesaId ?? "");
  const [tipo, setTipo] = useState<TipoEjemplar>(contexto?.tipoEjemplar ?? "DELEGADOS");
  const [pagina, setPagina] = useState<number>(contexto?.pagina ?? 1);

  const codigoLeido = Boolean(analisis?.barcode);

  // Prellenar el código si el análisis VLM lo leyó (una sola vez)
  const barcodeVlm = analisis?.barcode ?? null;
  const [prevVlm, setPrevVlm] = useState<string | null>(null);
  if (barcodeVlm && barcodeVlm !== prevVlm && !barcode) {
    setPrevVlm(barcodeVlm);
    setBarcode(normalizarDigitos(barcodeVlm));
  } else if (barcodeVlm !== prevVlm) {
    setPrevVlm(barcodeVlm);
  }

  const consulado = consulados.find((c) => c.id === consuladoId) ?? null;
  const mesas = consulado?.mesas ?? [];

  const parse = useMemo(() => parseBarcode15(barcode), [barcode]);
  const digits = normalizarDigitos(barcode);

  // Si el barcode es válido, sugiere tipo/página
  const tipoEfectivo: TipoEjemplar = parse.ok ? parse.tipoEjemplar : tipo;
  const paginaEfectiva = parse.ok ? parse.info.pagina : pagina;
  const totalEfectivo = parse.ok ? parse.info.totalPaginas : 2;

  const puedeEnviar = Boolean(mesaId) && (parse.ok || digits.length === 0);

  const confirmar = () => {
    if (!mesaId) return;
    void enviarActa({
      barcode15: parse.ok ? normalizarDigitos(barcode) : null,
      mesaId,
      tipoEjemplar: tipoEfectivo,
      pagina: paginaEfectiva,
      totalPaginas: totalEfectivo,
      modoManual,
    });
  };

  return (
    <section className="flex h-full flex-col bg-black">
      {/* ===== HEADER brand (igual al diseño de revisión) ===== */}
      <header className="relative z-40 flex h-14 shrink-0 items-center justify-between border-b border-white/5 bg-black/95 px-4 backdrop-blur-md">
        <button
          type="button"
          aria-label="Volver al menú de escaneo"
          onClick={() => irA("captura")}
          className="grid h-11 w-11 -ml-2 place-items-center rounded-full text-brand-500 transition-transform duration-150 active:scale-95"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>

        <div className="flex flex-col items-center">
          <h1 className="text-base font-extrabold uppercase tracking-wider text-brand-500">
            ASIGNACIÓN MANUAL
          </h1>
          <span className="font-mono text-[10px] tracking-widest text-zinc-400">E-14</span>
        </div>

        <div
          className="-mr-2 flex h-11 w-11 items-center justify-center"
          title="Sincronizado en tiempo real con servidor central"
        >
          <div className="flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-900/60 px-2 py-1">
            <span className="h-2 w-2 animate-pulse-sync rounded-full bg-brand-500" />
            <Cloud className="h-3.5 w-3.5 text-brand-400" />
          </div>
        </div>
      </header>

      {/* ===== CONTENIDO ===== */}
      <div className="fine-scroll flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {/* Banner CÓDIGO LEÍDO */}
        {codigoLeido && (
          <div className="flex items-center gap-2 rounded-xl border border-brand-500/40 bg-ink-950/95 px-3 py-2">
            <span className="h-2 w-2 shrink-0 animate-pulse-sync rounded-full bg-brand-500" />
            <span className="data-mono text-[10px] font-bold text-brand-400">
              CÓDIGO LEÍDO — ASIGNA LA MESA Y TRANSMITE
            </span>
          </div>
        )}

        {/* Preview de la imagen procesada con estado del código */}
        {captura && (
          <div className="flex flex-col gap-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-2">
              <div className="relative">
                <img
                  src={captura.imagenDataUrl}
                  alt="Acta capturada"
                  className="mx-auto max-h-56 w-full rounded-md object-contain"
                />
                <div className="scanner-frame">
                  <span className="corner-bl" />
                  <span className="corner-br" />
                </div>
                <div
                  className={cn(
                    "absolute inset-x-2 top-2 z-10 flex items-center justify-center gap-1.5 rounded-full border px-2.5 py-1 backdrop-blur-sm",
                    codigoLeido
                      ? "border-brand-500/40 bg-ink-950/90 text-brand-400"
                      : "border-warning/50 bg-ink-950/90 text-warning"
                  )}
                >
                  {codigoLeido ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  )}
                  <span className="label-caps">
                    {codigoLeido ? "Código leído · confirme la mesa" : "Código no detectado"}
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              className="h-11 w-full rounded-xl border border-white/15 bg-ink-700 text-xs font-bold text-white hover:bg-ink-600"
              onClick={repetirFoto}
            >
              <RefreshCcw className="h-3.5 w-3.5" /> REPETIR FOTO
            </Button>
          </div>
        )}

        {/* Tarjeta de asignación manual */}
        <div className="overflow-hidden rounded-xl border border-ink-border bg-ink-800">
          <div className="flex flex-col gap-3 p-4">
            {/* Encabezado de la tarjeta */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-warning">
                  CONTINGENCIA: ASIGNACIÓN MANUAL
                </h3>
                {modoManual && (
                  <span className="rounded-md border border-warning/50 bg-warning/10 px-2 py-0.5 font-mono text-[10px] font-bold text-warning">
                    MODO MANUAL ON
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400">
                {codigoLeido
                  ? "El sistema leyó el código de barras. Confirme el puesto y la mesa para vincular la foto."
                  : "El sistema no pudo identificar el acta automáticamente. Ingrese el código de barras o seleccione la ubicación para vincular la foto con su mesa."}
              </p>
            </div>

            {/* Vía A: barcode */}
            <div className="space-y-2">
              <Label htmlFor="barcode" className="label-caps text-zinc-400">
                Digitar código de barras (15 dígitos)
              </Label>
              <Input
                id="barcode"
                inputMode="numeric"
                autoComplete="off"
                placeholder="710003 9930102 02"
                value={formatearBarcode(barcode)}
                onChange={(e) => setBarcode(normalizarDigitos(e.target.value))}
                className="h-11 w-full rounded-lg border border-white/15 bg-ink-600 px-3 text-center font-mono text-sm font-bold tracking-[0.2em] text-white placeholder:text-zinc-600 focus:border-brand-500/60 focus:outline-none"
              />
              {digits.length > 0 && (
                <p
                  className={cn(
                    "flex items-center gap-1.5 text-[10px] data-mono",
                    parse.ok ? "text-brand-400" : "text-red-400"
                  )}
                >
                  {parse.ok ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {parse.tipoEjemplar} · página {parse.info.pagina} de{" "}
                      {parse.info.totalPaginas}
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {parse.motivo}
                    </>
                  )}
                </p>
              )}
              <p className="text-[11px] text-zinc-500">
                Verifique el número impreso bajo el código de barras en el encabezado.
              </p>
            </div>

            {/* Separador */}
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-white/10" />
              <span className="label-caps text-zinc-500">o bien</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            {/* Vía B: ubicación */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="label-caps text-zinc-400">Puesto de votación</Label>
                <Select
                  value={consuladoId}
                  onValueChange={(v) => {
                    setConsuladoId(v);
                    setMesaId("");
                  }}
                >
                  <SelectTrigger className="data-[size=default]:h-11 w-full">
                    <SelectValue placeholder="Seleccionar puesto…" />
                  </SelectTrigger>
                  <SelectContent>
                    {consulados.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.puesto} — {c.ciudad} ({c.codigo})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1 space-y-1.5">
                  <Label className="label-caps text-zinc-400">Mesa</Label>
                  <Select value={mesaId} onValueChange={setMesaId} disabled={!consuladoId}>
                    <SelectTrigger className="data-[size=default]:h-11 w-full data-mono">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {mesas.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {String(m.numero).padStart(2, "0")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="label-caps text-zinc-400">Tipo</Label>
                  <Select
                    value={tipoEfectivo}
                    onValueChange={(v) => setTipo(v as TipoEjemplar)}
                    disabled={parse.ok}
                  >
                    <SelectTrigger className="data-[size=default]:h-11 w-full data-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DELEGADOS">DELEGADOS</SelectItem>
                      <SelectItem value="TRANSMISION">TRANSMISIÓN</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="label-caps text-zinc-400">Página</Label>
                  <Select
                    value={String(paginaEfectiva)}
                    onValueChange={(v) => setPagina(Number(v))}
                    disabled={parse.ok}
                  >
                    <SelectTrigger className="data-[size=default]:h-11 w-full data-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">P1</SelectItem>
                      <SelectItem value="2">P2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="border-t border-ink-border p-3">
            <Button
              className="h-12 w-full rounded-xl bg-brand-500 text-sm font-extrabold uppercase tracking-wider text-black shadow-glow-pill hover:bg-brand-400 active:scale-[0.98]"
              disabled={!puedeEnviar || enviando || !captura}
              onClick={confirmar}
            >
              {enviando ? (
                <Loader2 className="h-4 w-4 animate-spin text-black" />
              ) : (
                <ScanLine className="h-4 w-4 text-black" />
              )}
              CONFIRMAR Y PROCESAR ACTA
            </Button>
            {!mesaId && (
              <p className="mt-1.5 text-center text-[11px] text-zinc-500">
                Seleccione el puesto y la mesa para poder registrar el acta.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
