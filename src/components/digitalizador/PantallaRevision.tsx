"use client";

// ============================================================
// DIGITALIZADOR E-14 — EDITOR DE IMAGEN (Revisión v4 — dark glow)
// Réplica EXACTA del diseño Stitch "REVISIÓN DE ACTA": header
// brand propio, NOTIFICACIÓN flotante ~5 s (tarjeta con la info
// del acta) que desaparece y deja la PILL PEQUEÑA persistente,
// visor zinc-950 con marco de esquinas, toolbar rápida y CTA
// con glow. Sin selector de filtros (SIEMPRE B/N adaptativo) y
// sin panel GLM (el análisis corre en segundo plano). Motor
// intacto (spec v6.2 §13):
//   · Preview con caché LRU (12) por clave quad+filtro+rotación
//   · Pill "Ajustando recorte…" mientras llega la detección
//   · Recorte: 4 esquinas + 4 puntos medios + LUPA 3× con
//     crosshair, persiste AL SOLTAR (quadManual manda al píxel),
//     Cancelar restaura el snapshot de entrada
//   · Rotación instantánea (rota la procesada en caché, 0,2 s)
//   · Bandas RN-02 (roja ≤5 · ámbar 6-8 · verde ≥9 con envío
//     automático) expresadas con notificación + CTA
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Cloud,
  Crop,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCcw,
  RotateCw,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  BANDA_ESTILO,
  bandaDeScore,
  horaBogota,
  parseBarcode15,
} from "@/lib/digitalizador/reglas";
import {
  calidadAScoreRN02,
  clavePagina,
  detectarBordes,
  evaluarCalidad,
  procesarPagina,
  type CalidadWarp,
  type FiltroPagina,
  type Quad,
} from "@/lib/digitalizador/escaner";
import type { EstadoEdicion, Rotacion } from "@/lib/digitalizador/types";
import { useDigitalizador } from "@/lib/digitalizador/store";

type Modo = "revision" | "recortar";

interface EntradaCache {
  dataUrl: string;
  w: number;
  h: number;
  calidad: CalidadWarp;
}

const CSS_FILTROS: Record<FiltroPagina, string> = {
  original: "none",
  texto: "brightness(1.12) contrast(1.35)",
  bw: "grayscale(1) contrast(2.6) brightness(1.05)",
};

/** Duración de la notificación flotante antes de dejar la pill pequeña */
const NOTIFICACION_MS = 5000;

export default function PantallaRevision() {
  const edicion = useDigitalizador((s) => s.edicion);
  const analisis = useDigitalizador((s) => s.analisis);
  const analizando = useDigitalizador((s) => s.analizando);
  const enviando = useDigitalizador((s) => s.enviando);
  const contexto = useDigitalizador((s) => s.contexto);
  const consulados = useDigitalizador((s) => s.consulados);
  const setRotacion = useDigitalizador((s) => s.setRotacion);
  const setQuad = useDigitalizador((s) => s.setQuad);
  const setCalidadFoto = useDigitalizador((s) => s.setCalidadFoto);
  const finalizarCaptura = useDigitalizador((s) => s.finalizarCaptura);
  const repetirFoto = useDigitalizador((s) => s.repetirFoto);
  const enviarActa = useDigitalizador((s) => s.enviarActa);
  const irA = useDigitalizador((s) => s.irA);
  const nuevaCaptura = useDigitalizador((s) => s.nuevaCaptura);

  const [modo, setModo] = useState<Modo>("revision");
  const [preview, setPreview] = useState<string | null>(null);
  const [procesandoPreview, setProcesandoPreview] = useState(false);
  const [procesada, setProcesada] = useState<EntradaCache | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [bordesBadge, setBordesBadge] = useState(false);
  const [comparar, setComparar] = useState(false);

  const cacheRef = useRef<Map<string, EntradaCache>>(new Map);
  const gestionadoAuto = useRef(false);
  const compararTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Helper para handlers: siempre la edición vigente fuera del render */
  const edicionActual = useCallback((): EstadoEdicion | null => useDigitalizador.getState().edicion, []);

  // ----------------------------------------------------------
  // Badge de calidad de la foto ORIGINAL (una vez por página)
  // ----------------------------------------------------------
  useEffect(() => {
    if (!edicion || edicion.calidad) return;
    void (async () => {
      const q = await evaluarCalidad(edicion.original);
      setCalidadFoto({ nivel: q.nivel, label: q.label, score: q.score });
    })();
  }, [edicion, setCalidadFoto]);

  // ----------------------------------------------------------
  // Preview: caché LRU por clave (quad+filtro+rotación)
  // ----------------------------------------------------------
  const clave = edicion
    ? clavePagina({
        id: edicion.id,
        quad: edicion.quad,
        filtro: edicion.filtro,
        rotacion: edicion.rotacion,
      })
    : null;

  useEffect(() => {
    const ed = edicion;
    if (!ed || !clave) return;
    const cache = cacheRef.current;
    const hit = cache.get(clave);
    if (hit) {
      setProcesada(hit);
      setPreview(hit.dataUrl);
      setProcesandoPreview(false);
      return;
    }
    // cache-miss: limpiar ANTES de procesar (evita previews stale)
    setProcesada(null);
    setPreview(null);
    setProcesandoPreview(true);
    let cancelado = false;
    void (async () => {
      try {
        const r = await procesarPagina({
          originalUrl: ed.original,
          quad: ed.quad,
          filtro: ed.filtro,
          rotacion: ed.rotacion,
          manual: ed.quadManual,
          preview: true,
        });
        if (cancelado) return;
        const entrada: EntradaCache = {
          dataUrl: r.dataUrl,
          w: r.w,
          h: r.h,
          calidad: r.calidad,
        };
        cache.set(clave, entrada);
        if (cache.size > 12) {
          const masVieja = cache.keys().next().value;
          if (masVieja !== undefined) cache.delete(masVieja);
        }
        setProcesada(entrada);
        setPreview(entrada.dataUrl);
      } catch {
        if (!cancelado) setPreview(ed.original); // degradar: mostrar original
      } finally {
        if (!cancelado) setProcesandoPreview(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [clave, edicion]);

  // ----------------------------------------------------------
  // Rotación instantánea: rota la procesada en caché (~0,2 s)
  // ----------------------------------------------------------
  const rotar = useCallback(async () => {
    const ed = edicionActual();
    if (!ed || !procesada) return;
    const nuevaRot = (((ed.rotacion + 90) % 360) as Rotacion);
    const nuevaClave = clavePagina({
      id: ed.id,
      quad: ed.quad,
      filtro: ed.filtro,
      rotacion: nuevaRot,
    });
    // rotar ya (píxel-idéntico al reproceso: los filtros conmutan con 90°)
    const rotada = await rotarImagen(procesada.dataUrl, ed.filtro);
    if (rotada) {
      const entrada = { ...procesada, dataUrl: rotada };
      cacheRef.current.set(nuevaClave, entrada);
      setProcesada(entrada);
      setPreview(rotada);
    }
    setRotacion(nuevaRot);
  }, [procesada, setRotacion]);

  // ----------------------------------------------------------
  // RN-02
  // ----------------------------------------------------------
  const calidadFoto = edicion?.calidad ?? null;
  const score = calidadFoto ? calidadAScoreRN02(calidadFoto.score) : 0;
  const banda = bandaDeScore(score);
  const estilo = BANDA_ESTILO[banda];

  // Estados UI locales (solo presentación)
  const [autoEnCurso, setAutoEnCurso] = useState(false);
  const [completo, setCompleto] = useState(false);

  // ----------------------------------------------------------
  // NOTIFICACIÓN (~5 s) → PILL PEQUEÑA (diseño)
  // La tarjeta con la info del acta aparece al entrar, se va a
  // los 5 s y queda la pill pequeña persistente (tap = reabrir).
  // ----------------------------------------------------------
  const [faseNotif, setFaseNotif] = useState<"tarjeta" | "pill">("tarjeta");
  const notifTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programarPill = useCallback(() => {
    if (notifTimer.current) clearTimeout(notifTimer.current);
    notifTimer.current = setTimeout(() => setFaseNotif("pill"), NOTIFICACION_MS);
  }, []);
  useEffect(() => {
    setFaseNotif("tarjeta");
    programarPill();
    return () => {
      if (notifTimer.current) clearTimeout(notifTimer.current);
    };
  }, [edicion?.id, programarPill]);
  const mostrarTarjeta = () => {
    setFaseNotif("tarjeta");
    programarPill();
  };

  const barcodeBruto = analisis?.barcode ?? null;
  const parseado = parseBarcode15(barcodeBruto);
  const identificado = parseado.ok || Boolean(contexto?.mesaId);

  // Mesa objetivo (captura dirigida desde Control) + su puesto
  const mesaObjetivo = contexto
    ? consulados.flatMap((c) => c.mesas).find((m) => m.id === contexto.mesaId) ?? null
    : null;
  const puestoObjetivo = contexto
    ? consulados.find((c) => c.mesas.some((m) => m.id === contexto.mesaId)) ?? null
    : null;

  /** Procesa a resolución FINAL y deja la captura lista para enviar */
  const prepararYFinalizar = useCallback(async (): Promise<boolean> => {
    const ed = edicionActual();
    if (!ed) return false;
    try {
      // si la procesada vigente corresponde a este estado, reutilizar
      const claveActual = clavePagina({
        id: ed.id,
        quad: ed.quad,
        filtro: ed.filtro,
        rotacion: ed.rotacion,
      });
      let imagen: string;
      let metricas: CalidadWarp;
      const enCache = claveActual === clave && procesada;
      if (enCache) {
        imagen = procesada.dataUrl;
        metricas = procesada.calidad;
      } else {
        const r = await procesarPagina({
          originalUrl: ed.original,
          quad: ed.quad,
          filtro: ed.filtro,
          rotacion: ed.rotacion,
          manual: ed.quadManual,
          preview: false,
        });
        imagen = r.dataUrl;
        metricas = r.calidad;
      }
      finalizarCaptura({
        imagenDataUrl: imagen,
        metricas,
        score: calidadAScoreRN02(ed.calidad?.score ?? 60),
        qrTexto: null,
        origen: ed.origen,
        createdAt: ed.createdAt,
      });
      return true;
    } catch {
      toast({
        title: "NO SE PUDO PREPARAR LA IMAGEN",
        description: "Inténtelo de nuevo.",
        variant: "destructive",
      });
      return false;
    }
  }, [clave, procesada, finalizarCaptura]);

  const enviarProcesada = useCallback(
    async (opts: Parameters<typeof enviarActa>[0]) => {
      const ok = await prepararYFinalizar();
      if (!ok) return;
      await enviarActa(opts);
    },
    [prepararYFinalizar, enviarActa]
  );

  // Flujo automático de la banda verde (exige procesada lista).
  // Con mesa objetivo (captura dirigida) → envío automático.
  // Escaneo libre → la mesa se asigna en contingencia (prellenada).
  useEffect(() => {
    if (gestionadoAuto.current) return;
    if (!edicion || modo !== "revision") return;
    if (banda !== "OPTIMA" || analizando || !analisis) return;
    if (edicion.autoQuadPendiente || procesandoPreview || !procesada) return;
    if (enviando) return;
    gestionadoAuto.current = true;
    setAutoEnCurso(true);
    void (async () => {
      try {
        await prepararYFinalizar();
        if (identificado && contexto?.mesaId) {
          await enviarActa({
            barcode15: parseado.ok ? barcodeBruto : null,
            tipoEjemplar: parseado.ok ? parseado.tipoEjemplar : contexto?.tipoEjemplar,
            pagina: parseado.ok ? parseado.info.pagina : contexto?.pagina,
            totalPaginas: parseado.ok
              ? parseado.info.totalPaginas
              : analisis?.totalPaginasLeidas ?? 2,
          });
          return;
        }
        if (!identificado) {
          toast({
            title: "CÓDIGO NO IDENTIFICADO",
            description: "Buenas condiciones, pero falta ubicación. Asigne manualmente.",
          });
        } else {
          toast({
            title: "CÓDIGO LEÍDO — ASIGNE LA MESA",
            description: "Escaneo libre: confirme el puesto y la mesa para transmitir.",
          });
        }
        irA("contingencia");
      } finally {
        setAutoEnCurso(false);
      }
    })();
  }, [
    edicion, modo, banda, analizando, analisis, identificado,
    edicion?.autoQuadPendiente, procesandoPreview, procesada, enviando,
    barcodeBruto, parseado, contexto, enviarActa, irA, prepararYFinalizar,
  ]);

  const enviarConAdvertencia = () => {
    if (!identificado || !contexto?.mesaId) {
      void (async () => {
        await prepararYFinalizar();
        if (!identificado) {
          toast({
            title: "FALTA ASIGNACIÓN",
            description: "No hay código ni mesa objetivo. Se abrirá la asignación manual.",
          });
        } else {
          toast({
            title: "ASIGNE LA MESA",
            description: "Escaneo libre: confirme el puesto y la mesa para transmitir.",
          });
        }
        irA("contingencia");
      })();
      return;
    }
    void enviarProcesada({
      advertencia: true,
      barcode15: parseado.ok ? barcodeBruto : null,
      tipoEjemplar: parseado.ok ? parseado.tipoEjemplar : contexto?.tipoEjemplar,
      pagina: parseado.ok ? parseado.info.pagina : contexto?.pagina,
      totalPaginas: parseado.ok
        ? parseado.info.totalPaginas
        : analisis?.totalPaginasLeidas ?? 2,
    });
  };

  // ----------------------------------------------------------
  // Comparar con la original (mantener pulsado 350 ms)
  // ----------------------------------------------------------
  const iniciarComparar = () => {
    if (compararTimer.current) clearTimeout(compararTimer.current);
    compararTimer.current = setTimeout(() => {
      navigator.vibrate?.(18);
      setComparar(true);
    }, 350);
  };
  const detenerComparar = () => {
    if (compararTimer.current) {
      clearTimeout(compararTimer.current);
      compararTimer.current = null;
    }
    setComparar(false);
  };

  // ----------------------------------------------------------
  // Descargar imagen procesada
  // ----------------------------------------------------------
  const descargar = async () => {
    const ed = edicionActual();
    if (!ed) return;
    setDescargando(true);
    try {
      const r = await procesarPagina({
        originalUrl: ed.original,
        quad: ed.quad,
        filtro: ed.filtro,
        rotacion: ed.rotacion,
        manual: ed.quadManual,
        preview: false,
      });
      const a = document.createElement("a");
      a.href = r.dataUrl;
      a.download = `acta-e14-${ed.filtro}.png`;
      a.click();
    } catch {
      toast({ title: "No se pudo exportar la imagen", variant: "destructive" });
    } finally {
      setDescargando(false);
    }
  };

  // ----------------------------------------------------------
  // Detección automática desde el recorte
  // ----------------------------------------------------------
  const detectarAuto = async () => {
    const ed = edicionActual();
    if (!ed) return;
    const { quad } = await detectarBordes(ed.original);
    if (quad) {
      setQuad(quad, false);
      setBordesBadge(true);
      setTimeout(() => setBordesBadge(false), 4000);
    } else {
      toast({
        title: "SIN DETECCIÓN",
        description: "Ajuste las esquinas manualmente.",
      });
    }
  };

  if (!edicion) return null;

  // ----------------------------------------------------------
  // Datos derivados SOLO para presentación (bandas ámbar/roja)
  // ----------------------------------------------------------
  const pagConocida = parseado.ok ? parseado.info.pagina : contexto?.pagina ?? null;
  const totalConocido = parseado.ok
    ? parseado.info.totalPaginas
    : analisis?.totalPaginasLeidas ?? null;
  const tipoActual = parseado.ok
    ? parseado.tipoEjemplar
    : contexto?.tipoEjemplar ?? null;

  const tituloTarjeta = mesaObjetivo
    ? `MESA ${String(mesaObjetivo.numero).padStart(2, "0")} · ${contexto?.tipoEjemplar ?? ""} P${contexto?.pagina ?? 1}`
    : analisis?.divipol?.puesto && !/^\d+$/.test(String(analisis.divipol.puesto).trim())
      ? String(analisis.divipol.puesto).toUpperCase()
      : "ACTA NO RECONOCIDA";

  const rutaTarjeta = (() => {
    const pag = pagConocida ?? 1;
    const total = totalConocido ?? 2;
    if (puestoObjetivo && mesaObjetivo) {
      return [
        puestoObjetivo.pais || puestoObjetivo.ciudad,
        `ZONA ${puestoObjetivo.zona}`,
        `PUESTO ${puestoObjetivo.puesto}`,
        `MESA ${String(mesaObjetivo.numero).padStart(3, "0")}`,
        tipoActual,
        `PÁG ${pag} DE ${total}`,
      ]
        .filter(Boolean)
        .join(" > ")
        .toUpperCase();
    }
    const d = analisis?.divipol;
    if (d && (d.puesto || d.ciudad || d.mesa)) {
      return [
        d.pais || d.ciudad || null,
        d.zona ? `ZONA ${d.zona}` : null,
        d.puesto ? `PUESTO ${d.puesto}` : null,
        d.mesa ? `MESA ${d.mesa}` : null,
        tipoActual,
        `PÁG ${pag} DE ${total}`,
      ]
        .filter(Boolean)
        .join(" > ")
        .toUpperCase();
    }
    return null;
  })();

  const chipTipo = tipoActual
    ? tipoActual === "TRANSMISION"
      ? "TRANSMISIÓN"
      : tipoActual
    : "MESA DESCONOCIDA";
  const chipPagina =
    pagConocida != null ? `PÁG ${pagConocida} DE ${totalConocido ?? "?"}` : "PÁG ? DE ?";

  const motivoTarjeta =
    banda === "ADVERTENCIA"
      ? analisis?.problemas && analisis.problemas.length > 0
        ? analisis.problemas[0].toUpperCase()
        : "REVISIÓN REQUERIDA (CONTRASTE)"
      : "ERROR: CÓDIGO E-14 ILEGIBLE (REINTENTAR)";

  const estadoPill =
    enviando || (autoEnCurso && Boolean(contexto?.mesaId))
      ? "ENVIADO CORRECTAMENTE"
      : analizando
        ? "VALIDACIÓN AUTOMÁTICA"
        : "LISTA PARA ENVIAR";
  const horaEnvio = horaBogota();

  const ctaConfirmar = !contexto && identificado;
  const ctaDeshabilitada = enviando || autoEnCurso || analizando;

  return (
    <section className="flex h-full flex-col bg-black">
      {/* ===== HEADER propio (diseño brand) ===== */}
      <header className="relative z-40 flex h-14 shrink-0 items-center justify-between border-b border-white/5 bg-black/95 px-4 backdrop-blur-md">
        <button
          type="button"
          aria-label={modo === "recortar" ? "Volver a la revisión" : "Volver al menú de escaneo"}
          onClick={() => {
            if (modo === "recortar") setModo("revision");
            else repetirFoto();
          }}
          className="grid h-11 w-11 -ml-2 place-items-center rounded-full text-brand-500 transition-transform duration-150 active:scale-95 active:bg-white/10"
        >
          <ArrowLeft className="h-6 w-6" strokeWidth={2} />
        </button>

        <div className="flex flex-col items-center">
          <h1 className="text-base font-extrabold uppercase tracking-wider text-brand-500">
            {modo === "recortar" ? "RECORTE DEL ACTA" : "REVISIÓN DE ACTA"}
          </h1>
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">E-14</span>
        </div>

        <div
          className="-mr-2 flex h-11 w-11 items-center justify-center"
          title="Sincronizado en tiempo real con servidor central"
        >
          <div
            aria-label="Sincronizado con servidor central"
            className="flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-900/60 px-2 py-1"
          >
            <span className="h-2 w-2 animate-pulse-sync rounded-full bg-brand-500" />
            <Cloud className="h-3.5 w-3.5 fill-current text-brand-400" />
          </div>
        </div>
      </header>

      {modo === "recortar" ? (
        <div className="fine-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <EditorRecorte
            edicion={edicion}
            onAplicar={(q) => setQuad(q, true)}
            onCancelar={() => setModo("revision")}
            onDeteccionAuto={() => void detectarAuto()}
            badgeBordes={bordesBadge}
          />
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col px-4 py-2">
          {/* ===== NOTIFICACIÓN ~5 s → PILL PEQUEÑA (superpuesta al visor) ===== */}
          <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-4">
            {/* Tarjeta con la info del acta — notificación que se va a los 5 s */}
            <div
              className={cn(
                "absolute inset-x-4 top-0 transition-all duration-300",
                faseNotif === "tarjeta"
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none -translate-y-2 opacity-0"
              )}
              aria-hidden={faseNotif !== "tarjeta"}
            >
              <div
                className={cn(
                  "flex flex-col gap-2.5 rounded-xl border bg-ink-950/95 p-3 shadow-2xl shadow-black/80 ring-1 backdrop-blur-xl",
                  banda === "OPTIMA"
                    ? "border-brand-500/30 ring-brand-500/20"
                    : banda === "ADVERTENCIA"
                      ? "border-warning/40 ring-warning/25"
                      : "border-red-500/40 ring-red-500/25"
                )}
              >
                {/* Fila 1: punto + título + chip score */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 animate-pulse-sync rounded-full",
                        banda === "OPTIMA"
                          ? "bg-brand-500 ring-4 ring-brand-500/20"
                          : banda === "ADVERTENCIA"
                            ? "bg-warning ring-4 ring-warning/20"
                            : "bg-red-500 ring-4 ring-red-500/20"
                      )}
                    />
                    <h2 className="truncate text-xs font-bold uppercase tracking-wide text-white">
                      {tituloTarjeta}
                    </h2>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded border px-2 py-0.5 text-[9px] font-bold",
                      banda === "OPTIMA"
                        ? "border-brand-500/25 bg-brand-500/15 text-brand-400"
                        : banda === "ADVERTENCIA"
                          ? "border-warning/30 bg-warning/15 text-warning"
                          : "border-red-500/30 bg-red-500/15 text-red-400"
                    )}
                  >
                    {banda === "OPTIMA" ? (
                      <>
                        <span className="mr-1">✓</span>
                        {score}/10 ÓPTIMA
                      </>
                    ) : banda === "ADVERTENCIA" ? (
                      <>{score}/10 MODERADA</>
                    ) : (
                      <>
                        <span className="mr-1">✕</span>
                        {score}/10 RECHAZADA
                      </>
                    )}
                  </span>
                </div>
                {/* Fila 2: ruta mono del acta */}
                {rutaTarjeta ? (
                  <p
                    className={cn(
                      "truncate font-mono text-[9px] font-semibold tracking-wide",
                      banda === "OPTIMA"
                        ? "text-zinc-300"
                        : banda === "ADVERTENCIA"
                          ? "text-warning"
                          : "text-zinc-400"
                    )}
                  >
                    {rutaTarjeta}
                  </p>
                ) : (
                  <p
                    className={cn(
                      "font-mono text-[9px] font-semibold tracking-wide",
                      banda === "ADVERTENCIA" ? "text-warning" : "text-red-400"
                    )}
                  >
                    ⚠️ CÓDIGO DE BARRAS Y CABECERA NO DETECTADOS
                  </p>
                )}
                {/* Fila 3: chips de datos + estado/motivo */}
                <div
                  className={cn(
                    "flex items-center justify-between gap-2 border-t pt-2",
                    banda === "OPTIMA"
                      ? "border-brand-500/20"
                      : banda === "ADVERTENCIA"
                        ? "border-warning/20"
                        : "border-red-500/20"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="data-mono rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[9px] font-bold text-neutral-300">
                      {chipTipo}
                    </span>
                    <span
                      className={cn(
                        "data-mono rounded border bg-black/60 px-2 py-0.5 text-[9px] font-semibold text-zinc-300",
                        banda === "OPTIMA"
                          ? "border-brand-500/20"
                          : banda === "ADVERTENCIA"
                            ? "border-warning/25"
                            : "border-red-500/25"
                      )}
                    >
                      {chipPagina}
                    </span>
                  </div>
                  {banda === "OPTIMA" ? (
                    <span className="flex shrink-0 items-center gap-1.5 truncate font-mono text-[9px]">
                      <span className="font-bold text-brand-400">✓ {estadoPill}</span>
                      {(enviando || autoEnCurso) && (
                        <span className="text-zinc-300">{horaEnvio}</span>
                      )}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "shrink-0 truncate text-[9px] font-bold tracking-tight",
                        banda === "ADVERTENCIA" ? "text-warning" : "text-red-400"
                      )}
                    >
                      {motivoTarjeta}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Pill pequeña persistente (tap = volver a ver la info) */}
            <button
              type="button"
              onClick={mostrarTarjeta}
              aria-label="Mostrar la información del acta"
              className={cn(
                "pointer-events-auto flex items-center gap-2 rounded-full border bg-ink-950/95 px-3.5 py-1.5 shadow-lg shadow-black/80 backdrop-blur-xl transition-all duration-300",
                banda === "OPTIMA"
                  ? "border-brand-500/40"
                  : banda === "ADVERTENCIA"
                    ? "border-warning/40"
                    : "border-red-500/40",
                faseNotif === "pill"
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-1 opacity-0"
              )}
            >
              <span
                className={cn(
                  "font-mono text-[10px] font-bold tracking-wide",
                  banda === "OPTIMA"
                    ? "text-brand-400"
                    : banda === "ADVERTENCIA"
                      ? "text-warning"
                      : "text-red-400"
                )}
              >
                {banda === "OPTIMA" ? (
                  <>
                    ✓ {score}/10 ÓPTIMA
                  </>
                ) : banda === "ADVERTENCIA" ? (
                  <>
                    ⚠ {score}/10 MODERADA
                  </>
                ) : (
                  <>
                    ✕ {score}/10 RECHAZADA
                  </>
                )}
              </span>
              <span className="text-[10px] text-zinc-500">•</span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-white">
                {banda === "OPTIMA"
                  ? estadoPill
                  : banda === "ADVERTENCIA"
                    ? "ADVERTENCIA"
                    : "OBLIGATORIO REPETIR"}
              </span>
            </button>
          </div>

          {/* ===== CONTENIDO (scroll interno) ===== */}
          <div className="fine-scroll flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto">
            {/* VISOR DEL DOCUMENTO + toolbar rápida */}
            <section className="relative flex min-h-[300px] flex-1 flex-col rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
              <div
                className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden px-1 py-2"
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  iniciarComparar();
                }}
                onPointerUp={detenerComparar}
                onPointerLeave={detenerComparar}
                onPointerCancel={detenerComparar}
              >
                {/* Marco de esquinas (color por banda) */}
                <div className="pointer-events-none absolute inset-1 z-10">
                  <div className={cn("scanner-frame", estilo.frame)}>
                    <span className="corner-bl" />
                    <span className="corner-br" />
                  </div>
                </div>

                {preview ? (
                  <img
                    src={comparar ? edicion.original : preview}
                    alt="Vista previa procesada del acta"
                    className="h-full w-full select-none object-contain"
                    draggable={false}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 py-16 text-white/70">
                    <Loader2 className="h-7 w-7 animate-spin text-brand-500" />
                    <p className="label-caps">Procesando página…</p>
                  </div>
                )}

                {/* Pill "Ajustando recorte…" (detección en background) */}
                {edicion.autoQuadPendiente && (
                  <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/25 bg-black/65 px-3 py-1.5 backdrop-blur">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />
                    <span className="data-mono text-[10px] font-bold text-white">
                      AJUSTANDO RECORTE…
                    </span>
                  </div>
                )}

                {/* Badge de calidad (solo poor/fair) */}
                {calidadFoto && (calidadFoto.nivel === "poor" || calidadFoto.nivel === "fair") && (
                  <div className="absolute left-3 top-3 rounded-md border border-warning/70 bg-warning/25 px-2 py-1 text-[10px] font-bold text-white backdrop-blur data-mono">
                    CALIDAD {calidadFoto.label.toUpperCase()}
                  </div>
                )}

                {/* Recorte manual aplicado */}
                {edicion.quadManual && (
                  <div className="absolute right-3 top-3 rounded-md border border-brand-500/60 bg-brand-500/25 px-2 py-1 text-[10px] font-bold text-white backdrop-blur data-mono">
                    RECORTE MANUAL
                  </div>
                )}

                {/* Hint de comparación */}
                {preview && !comparar && !procesandoPreview && (
                  <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-black/55 px-2 py-1 text-[9px] font-semibold tracking-wide text-white/70 backdrop-blur">
                    MANTÉN PULSADO PARA VER LA ORIGINAL
                  </div>
                )}
              </div>

              {/* Toolbar rápida (dentro del panel del visor) + descargar */}
              <div className="flex w-full shrink-0 items-center justify-center gap-2.5 pt-2">
                <BotonHud
                  label="RECORTAR"
                  ariaLabel="Recortar acta"
                  icono={<Crop className="h-4 w-4 stroke-2 text-ind-primary" />}
                  onClick={() => setModo("recortar")}
                />
                <BotonHud
                  label="ROTAR 90°"
                  ariaLabel="Rotar acta 90 grados"
                  icono={<RotateCw className="h-4 w-4 stroke-2 text-ind-primary" />}
                  onClick={() => void rotar()}
                />
                <BotonHud
                  label="PANTALLA COMPLETA"
                  ariaLabel="Ver acta en pantalla completa"
                  icono={<Maximize2 className="h-4 w-4 stroke-2 text-ind-primary" />}
                  onClick={() => setCompleto(true)}
                />
                <button
                  type="button"
                  aria-label="Descargar imagen procesada"
                  onClick={() => void descargar()}
                  disabled={descargando}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-ind-outline-variant/40 bg-ind-high/90 text-ind-on-surface shadow-md transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-60"
                >
                  {descargando ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </button>
              </div>
            </section>

            {/* ===== Acciones según banda ===== */}
            <div className="flex shrink-0 flex-col gap-2.5">
              {banda === "OPTIMA" && (
                <>
                  <button
                    type="button"
                    disabled={ctaDeshabilitada}
                    onClick={() => {
                      if (ctaDeshabilitada) return;
                      if (ctaConfirmar) {
                        void (async () => {
                          await prepararYFinalizar();
                          irA("contingencia");
                        })();
                        return;
                      }
                      nuevaCaptura();
                    }}
                    className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-brand-500 text-sm font-extrabold uppercase tracking-wider text-black shadow-glow-pill transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-80"
                  >
                    {ctaDeshabilitada && <Loader2 className="h-4 w-4 animate-spin" />}
                    {enviando || autoEnCurso
                      ? "ENVIANDO AUTOMÁTICAMENTE…"
                      : analizando
                        ? "VALIDANDO ACTA…"
                        : ctaConfirmar
                          ? "CONFIRMAR ASIGNACIÓN"
                          : "SEGUIR ESCANEANDO"}
                  </button>
                  {contexto?.mesaId && (
                    <p className="text-center text-[10px] text-zinc-500">
                      El acta se envió automáticamente al servidor.
                    </p>
                  )}
                </>
              )}

              {banda === "ADVERTENCIA" && (
                <>
                  <button
                    type="button"
                    disabled={enviando}
                    onClick={enviarConAdvertencia}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 text-[13px] font-extrabold uppercase tracking-wide text-black transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-70"
                  >
                    {enviando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <AlertTriangle className="h-4 w-4" />
                    )}
                    ENVIAR BAJO OBSERVACIÓN
                  </button>
                  <button
                    type="button"
                    onClick={repetirFoto}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-ink-700 text-[13px] font-bold uppercase tracking-wide text-amber-400 transition-all active:scale-[0.98]"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    REPETIR PARA SUBIR SCORE
                  </button>
                  <p className="text-center text-[10px] text-zinc-500">
                    El envío bajo observación queda marcado para auditoría.
                  </p>
                </>
              )}

              {banda === "RECHAZADA" && (
                <>
                  <div className="flex w-full items-center gap-2">
                    <button
                      type="button"
                      onClick={repetirFoto}
                      className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-2 text-[11px] font-extrabold uppercase leading-tight tracking-wide text-white shadow-lg shadow-red-600/30 transition-all active:scale-[0.98]"
                    >
                      <RefreshCcw className="h-4 w-4 shrink-0" />
                      OBLIGATORIO REPETIR FOTO
                    </button>
                    <button
                      type="button"
                      onClick={enviarConAdvertencia}
                      className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-white/5 px-2 text-[11px] font-semibold uppercase leading-tight text-zinc-300 transition-all active:scale-[0.98]"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                      ENVIAR A REVISIÓN HUMANA
                    </button>
                  </div>
                  <p className="text-center text-[10px] text-zinc-500">
                    La transmisión está bloqueada hasta repetir la foto.
                  </p>
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ===== PANTALLA COMPLETA ===== */}
      {completo && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black">
          <button
            type="button"
            aria-label="Salir de pantalla completa"
            onClick={() => setCompleto(false)}
            className="absolute right-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full border border-white/20 bg-black/60 text-white transition-transform active:scale-95"
          >
            <Minimize2 className="h-5 w-5" />
          </button>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
            {preview ? (
              <img
                src={comparar ? edicion.original : preview}
                alt="Acta en pantalla completa"
                className="h-full w-full select-none object-contain"
                draggable={false}
              />
            ) : (
              <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ============================================================
// SUB-EDITOR DE RECORTE (quad + lupa)
// ============================================================

function EditorRecorte({
  edicion,
  onAplicar,
  onCancelar,
  onDeteccionAuto,
  badgeBordes,
}: {
  edicion: EstadoEdicion;
  onAplicar: (quad: Quad) => void;
  onCancelar: () => void;
  onDeteccionAuto: () => void;
  badgeBordes: boolean;
}) {
  const snapshotRef = useRef<Quad>(edicion.quad);
  const [quad, setQuadLocal] = useState<Quad>(edicion.quad);
  const [prevQuadProp, setPrevQuadProp] = useState<Quad>(edicion.quad);
  const [arrastrando, setArrastrando] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const zonaRef = useRef<HTMLDivElement | null>(null);
  const lupaRef = useRef<HTMLCanvasElement | null>(null);
  const [lupa, setLupa] = useState<{ x: number; y: number; abajo: boolean } | null>(null);
  const arrastreRef = useRef<{
    tipo: "esquina" | "arista";
    indice: number;
    px: number;
    py: number;
    quad: Quad;
  } | null>(null);

  const LADO_LUPA = 168;
  const AUMENTO = 3;

  const puntosALista = (q: Quad): string => q.map((p) => `${p.x * 100}%,${p.y * 100}%`).join(" ");

  const clampPunto = (x: number, y: number): { x: number; y: number } => ({
    x: Math.max(0, Math.min(1, x)),
    y: Math.max(0, Math.min(1, y)),
  });

  /** pointer (cliente) → normalizado dentro de la imagen */
  const aNormalizado = (clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (clientY - r.top) / r.height)),
      rect: r,
    };
  };

  const enPointerDown = (
    e: React.PointerEvent,
    tipo: "esquina" | "arista",
    indice: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* el puntero ya se soltó */
    }
    arrastreRef.current = { tipo, indice, px: e.clientX, py: e.clientY, quad };
    setArrastrando(true);
    dibujarLupa(e.clientX, e.clientY);
  };

  const enPointerMove = (e: React.PointerEvent) => {
    if (arrastrando) dibujarLupa(e.clientX, e.clientY);
    const d = arrastreRef.current;
    if (!d) return;
    const p = aNormalizado(e.clientX, e.clientY);
    if (!p) return;
    if (d.tipo === "esquina") {
      const nuevo = [...d.quad] as Quad;
      nuevo[d.indice] = clampPunto(p.x, p.y);
      setQuadLocal(nuevo);
    } else {
      // trasladar la arista completa (2 vértices) con el delta del puntero
      const img = imgRef.current;
      if (!img) return;
      const r = img.getBoundingClientRect();
      const dnx = (e.clientX - d.px) / r.width;
      const dny = (e.clientY - d.py) / r.height;
      const nuevo = [...d.quad] as Quad;
      const i0 = d.indice;
      const i1 = (d.indice + 1) % 4;
      nuevo[i0] = clampPunto(d.quad[i0].x + dnx, d.quad[i0].y + dny);
      nuevo[i1] = clampPunto(d.quad[i1].x + dnx, d.quad[i1].y + dny);
      setQuadLocal(nuevo);
    }
  };

  const enPointerUp = () => {
    const d = arrastreRef.current;
    arrastreRef.current = null;
    setArrastrando(false);
    setLupa(null);
    if (d) onAplicar(quad); // persiste AL SOLTAR (quadManual = true)
  };

  const dibujarLupa = (clientX: number, clientY: number) => {
    const canvas = lupaRef.current;
    const img = imgRef.current;
    const zona = zonaRef.current;
    if (!canvas || !img || !zona) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imgRect = img.getBoundingClientRect();
    const zonaRect = zona.getBoundingClientRect();
    // ventana visible en la lupa: LADO/AUMENTO px de pantalla
    const ventanaPx = LADO_LUPA / AUMENTO;
    const sw = (ventanaPx / imgRect.width) * img.naturalWidth;
    const sh = (ventanaPx / imgRect.height) * img.naturalHeight;
    const nx = (clientX - imgRect.left) / imgRect.width;
    const ny = (clientY - imgRect.top) / imgRect.height;
    const sx = nx * img.naturalWidth - sw / 2;
    const sy = ny * img.naturalHeight - sh / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, LADO_LUPA, LADO_LUPA);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, LADO_LUPA, LADO_LUPA);
    const abajo = clientY - zonaRect.top < zonaRect.height / 2;
    setLupa({
      x: Math.max(4, Math.min(zonaRect.width - LADO_LUPA - 4, clientX - zonaRect.left - LADO_LUPA / 2)),
      y: abajo
        ? Math.min(zonaRect.height - LADO_LUPA - 4, clientY - zonaRect.top + 28)
        : Math.max(4, clientY - zonaRect.top - LADO_LUPA - 28),
      abajo,
    });
  };

  // sincronizar si llega un quad automático mientras no se arrastra
  // (patrón "ajustar estado durante el render", sin effects)
  if (edicion.quad !== prevQuadProp) {
    setPrevQuadProp(edicion.quad);
    if (!arrastrando) setQuadLocal(edicion.quad);
  }

  const puntosMedios = (q: Quad) =>
    [0, 1, 2, 3].map((i) => ({
      i,
      x: (q[i].x + q[(i + 1) % 4].x) / 2,
      y: (q[i].y + q[(i + 1) % 4].y) / 2,
    }));

  return (
    <div className="flex flex-col gap-3">
      {/* Zona de recorte */}
      <div
        ref={zonaRef}
        className="relative touch-none overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
      >
        <div className="grid min-h-[320px] place-items-center p-2">
          <div className="relative">
            <img
              ref={imgRef}
              src={edicion.original}
              alt="Original para recortar"
              className="max-h-[420px] w-auto select-none object-contain"
              style={{ filter: CSS_FILTROS[edicion.filtro] }}
              draggable={false}
              onPointerMove={enPointerMove}
              onPointerUp={enPointerUp}
              onPointerCancel={enPointerUp}
            />
            {/* Overlay del quad */}
            <div className="pointer-events-none absolute inset-0">
              <svg className="h-full w-full" aria-hidden>
                <polygon
                  points={puntosALista(quad)}
                  fill="rgba(74,222,128,0.12)"
                  stroke="#4ade80"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                  strokeLinejoin="round"
                />
              </svg>
              {/* Handles (fuera del SVG para touch target grande) */}
              {quad.map((p, i) => (
                <button
                  key={`c${i}`}
                  type="button"
                  aria-label={`Esquina ${i + 1}`}
                  className="absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none place-items-center active:cursor-grabbing"
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                  onPointerDown={(e) => enPointerDown(e, "esquina", i)}
                  onPointerMove={enPointerMove}
                  onPointerUp={enPointerUp}
                >
                  <span
                    className={cn(
                      "h-4 w-4 rounded-full border-[3px] border-white bg-[#4ade80] shadow",
                      arrastrando && "scale-125"
                    )}
                  />
                </button>
              ))}
              {puntosMedios(quad).map((m) => (
                <button
                  key={`m${m.i}`}
                  type="button"
                  aria-label={`Arista ${m.i + 1}`}
                  className="absolute grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none place-items-center active:cursor-grabbing"
                  style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
                  onPointerDown={(e) => enPointerDown(e, "arista", m.i)}
                  onPointerMove={enPointerMove}
                  onPointerUp={enPointerUp}
                >
                  <span className="h-3 w-3 rounded-full border-2 border-white bg-[#4ade80]/80" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Badge "Bordes detectados" (4 s, esquina TL) */}
        {badgeBordes && (
          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md border border-brand-500/60 bg-brand-500/30 px-2 py-1 text-[10px] font-bold text-white backdrop-blur data-mono">
            <Check className="h-3 w-3" /> BORDES DETECTADOS
          </div>
        )}

        {/* Lupa 3× con crosshair */}
        {lupa && (
          <div
            className="pointer-events-none absolute overflow-hidden rounded-full border-2 border-white shadow-xl"
            style={{ left: lupa.x, top: lupa.y, width: LADO_LUPA, height: LADO_LUPA }}
          >
            <canvas ref={lupaRef} width={LADO_LUPA} height={LADO_LUPA} className="h-full w-full" />
            {/* crosshair amarillo */}
            <div className="absolute left-1/2 top-0 h-full w-px bg-[#ffd60a]" />
            <div className="absolute left-0 top-1/2 h-px w-full bg-[#ffd60a]" />
            <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#ffd60a]" />
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-zinc-500">
        Arrastre las esquinas · el punto medio mueve la arista completa · el cambio se aplica al soltar
      </p>

      {/* Acciones del recorte */}
      <div className="grid grid-cols-3 gap-2 pb-1">
        <button
          type="button"
          onClick={onDeteccionAuto}
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-ink-700 text-xs font-bold text-white transition-all active:scale-95"
        >
          <Sparkles className="h-4 w-4" /> AUTO
        </button>
        <button
          type="button"
          onClick={() => {
            setQuadLocal(snapshotRef.current);
            onAplicar(snapshotRef.current);
            onCancelar();
          }}
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-ink-700 text-xs font-bold text-white transition-all active:scale-95"
        >
          <X className="h-4 w-4" /> CANCELAR
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-500 text-xs font-extrabold text-black transition-all active:scale-[0.98]"
        >
          <Check className="h-4 w-4" /> HECHO
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Auxiliares
// ============================================================

/** Botón de la toolbar rápida del visor (estilo industrial del diseño) */
function BotonHud({
  icono,
  label,
  ariaLabel,
  onClick,
}: {
  icono: React.ReactNode;
  label: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-ind-outline-variant/40 bg-ind-high/90 px-2.5 text-xs font-semibold text-ind-on-surface shadow-md transition-all active:scale-95"
    >
      {icono}
      <span>{label}</span>
    </button>
  );
}

/** Rota un data URL 90° en canvas y lo re-codifica (rápido, sin worker) */
async function rotarImagen(dataUrl: string, filtro: FiltroPagina): Promise<string | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("no decodifica"));
      im.src = dataUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalHeight;
    canvas.height = img.naturalWidth;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    const mime = filtro === "original" ? "image/jpeg" : "image/png";
    return await new Promise<string | null>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(null);
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result));
          fr.onerror = () => resolve(null);
          fr.readAsDataURL(blob);
        },
        mime,
        0.92
      );
    });
  } catch {
    return null;
  }
}

