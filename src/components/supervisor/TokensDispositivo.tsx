"use client";

// ============================================================
// [FASE-6 · PLAN §8.3] TokensDispositivo — emisión de tokens
// Pantalla mínima del supervisor: lista de puestos → generar
// token → copiar. Un token ACTIVO por puesto/dispositivo.
// El secreto se muestra UNA sola vez al generarlo.
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Loader2, RefreshCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface TokenRow {
  token: string;
  puestoId: string;
  activo: boolean;
  emitido: string;
  ultimaVez: string | null;
}

interface PuestoLigero {
  codigo: string;
  ciudad: string;
  pais: string;
}

export function TokensDispositivo() {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [puestos, setPuestos] = useState<PuestoLigero[]>([]);
  const [tokenNuevo, setTokenNuevo] = useState<{ token: string; puestoId: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/tokens-dispositivo");
      if (res.ok) {
        const data = (await res.json()) as { tokens: TokenRow[] };
        setTokens(data.tokens ?? []);
      }
      // lista ligera de puestos (selector)
      const resLista = await fetch("/api/digitalizador/bootstrap?lista=1");
      if (resLista.ok) {
        const data = (await resLista.json()) as { puestos?: PuestoLigero[] };
        setPuestos(data.puestos ?? []);
      }
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toUpperCase();
    if (!q) return puestos.slice(0, 30);
    return puestos
      .filter((p) => p.codigo.includes(q) || p.ciudad.toUpperCase().includes(q) || p.pais.toUpperCase().includes(q))
      .slice(0, 30);
  }, [puestos, busqueda]);

  const generar = async (puestoId: string) => {
    setGenerando(puestoId);
    try {
      const res = await fetch("/api/tokens-dispositivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puestoId }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        toast({ title: "NO SE PUDO GENERAR", description: data.error ?? "Error", variant: "destructive" });
        return;
      }
      setTokenNuevo({ token: data.token, puestoId });
      setCopiado(false);
      void cargar();
    } finally {
      setGenerando(null);
    }
  };

  const copiar = async () => {
    if (!tokenNuevo) return;
    try {
      await navigator.clipboard.writeText(tokenNuevo.token);
      setCopiado(true);
    } catch {
      toast({ title: "COPIE MANUALMENTE", description: "El navegador bloqueó el portapapeles." });
    }
  };

  const activos = tokens.filter((t) => t.activo).length;

  return (
    <section aria-label="Tokens de dispositivo" className="flex h-full flex-col gap-4 overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Tokens de dispositivo</h2>
          <p className="text-sm text-muted-foreground">
            Un token activo por puesto. El digitalizador lo pega en la identificación y viaja como
            <span className="font-mono"> Authorization: Bearer</span> en cada ingesta.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">
            {activos} activo{activos === 1 ? "" : "s"} · {tokens.length} total
          </span>
          <Button variant="outline" size="sm" onClick={() => void cargar()} disabled={cargando}>
            {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            REFRESCAR
          </Button>
        </div>
      </header>

      {/* Token recién generado: visible UNA vez */}
      {tokenNuevo && (
        <div className="shrink-0 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-600">
            <ShieldCheck className="h-4 w-4" /> Token para {tokenNuevo.puestoId}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-3 py-2 font-mono text-xs">
              {tokenNuevo.token}
            </code>
            <Button size="sm" onClick={() => void copiar()} className="shrink-0">
              {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copiado ? "COPIADO" : "COPIAR"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setTokenNuevo(null)} className="shrink-0">
              CERRAR
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-emerald-700">
            Guárdelo ahora: por seguridad no se volverá a mostrar completo. Generar uno nuevo revoca
            el anterior del puesto.
          </p>
        </div>
      )}

      {/* Buscador de puestos */}
      <div className="shrink-0">
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar puesto por código, ciudad o país (ej. 335-05-02, EL CAIRO, EGIPTO)"
          aria-label="Buscar puesto"
          className="h-11"
        />
      </div>

      {/* Lista de puestos → generar */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/95 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Puesto</th>
              <th className="hidden px-4 py-2.5 md:table-cell">Ciudad / País</th>
              <th className="px-4 py-2.5 text-right">Token</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((p) => {
              const tokenPuesto = tokens.find((t) => t.puestoId === p.codigo && t.activo);
              return (
                <tr key={p.codigo} className="border-t hover:bg-muted/40">
                  <td className="px-4 py-2.5 font-mono font-semibold">{p.codigo}</td>
                  <td className="hidden px-4 py-2.5 text-muted-foreground md:table-cell">
                    {p.ciudad} · {p.pais}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {tokenPuesto ? (
                      <span className="mr-2 font-mono text-xs text-muted-foreground">{tokenPuesto.token}</span>
                    ) : null}
                    <Button
                      size="sm"
                      variant={tokenPuesto ? "outline" : "default"}
                      disabled={generando === p.codigo}
                      onClick={() => void generar(p.codigo)}
                    >
                      {generando === p.codigo ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <KeyRound className="h-4 w-4" />
                      )}
                      {tokenPuesto ? "REGENERAR" : "GENERAR"}
                    </Button>
                  </td>
                </tr>
              );
            })}
            {filtrados.length === 0 && !cargando && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  Sin puestos que coincidan con la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Histórico */}
      {tokens.length > 0 && (
        <details className="shrink-0 rounded-xl border px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold">
            Histórico de tokens ({tokens.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {tokens.map((t) => (
              <li key={t.token + t.emitido} className="flex items-center justify-between gap-2 font-mono text-xs">
                <span className={cn(t.activo ? "text-emerald-600" : "text-muted-foreground line-through")}>
                  {t.token}
                </span>
                <span className="text-muted-foreground">
                  {t.puestoId} · emitido {new Date(t.emitido).toLocaleDateString()}
                  {t.ultimaVez ? ` · última ingesta ${new Date(t.ultimaVez).toLocaleString()}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
