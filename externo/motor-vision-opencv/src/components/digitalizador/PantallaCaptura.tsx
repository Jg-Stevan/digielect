"use client";

// ============================================================
// DIGITALIZADOR E-14 — Pantalla de CAPTURA / ESCANEO (v3)
// Captura inmersiva a pantalla completa (diseño Stitch dark):
// visor full-bleed con viñeta, quad EN VIVO azul (#007aff) con
// handles, top bar mínima (✕ / IA+AUTO / ⋮ menú), banners de
// contexto, medidor de calidad, dock inferior (Importar |
// disparador | Flash) y selector de ACTAS REALES.
// La lógica (useCamara, autocaptura k-de-n, captureSmart,
// entrega de archivos, flashes) NO cambió.
// ============================================================

import { useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  FileText,
  Images,
  Loader2,
  MoreVertical,
  PenLine,
  X,
  Zap,
  ZapOff,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { archivoADataUrl } from "@/lib/digitalizador/escaner";
import { ACTAS_REALES, type ActaReal } from "@/lib/digitalizador/actas-reales";
import { useCamara } from "@/lib/digitalizador/use-camara";
import { useDigitalizador } from "@/lib/digitalizador/store";

const COLOR_QUAD = "#007aff"; // azul inmersivo del diseño Stitch

export default function PantallaCaptura() {
  const modoManual = useDigitalizador((s) => s.modoManual);
  const contexto = useDigitalizador((s) => s.contexto);
  const consulados = useDigitalizador((s) => s.consulados);
  const abrirEdicion = useDigitalizador((s) => s.abrirEdicion);
  const irA = useDigitalizador((s) => s.irA);
  const setContexto = useDigitalizador((s) => s.setContexto);
  const toggleModoManual = useDigitalizador((s) => s.toggleModoManual);
  const inputGaleria = useRef<HTMLInputElement | null>(null);
  const inputNativo = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [flash, setFlash] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [selectorActas, setSelectorActas] = useState(false);
  const [autocapturaOn, setAutocapturaOn] = useState(true);
  const [menuAbierto, setMenuAbierto] = useState(false);

  const mesaContexto = contexto
    ? consulados.flatMap((c) => c.mesas).find((m) => m.id === contexto.mesaId) ?? null
    : null;

  /** Cerrar el visor: si hay objetivo dirigido → escaneo libre; si no → Control */
  const cerrarVisor = () => {
    if (contexto) setContexto(null);
    else irA("control");
  };

  /** Punto de entrada único de toda captura (cámara, galería o acta real) */
  const entregar = async (fuente: string | Blob, origen: "camara" | "galeria" | "acta-real") => {
    if (!fuente) return;
    // Flash blanco + vibración (feedback de obturador)
    setFlash(true);
    setTimeout(() => setFlash(false), 140);
    try {
      navigator.vibrate?.(30);
    } catch {
      /* sin vibración */
    }
    setProcesando(true);
    try {
      // La cámara ya entrega data URL capada; galería/actas pasan por decode único (cap 4032)
      const lista =
        typeof fuente === "string" && origen === "camara"
          ? fuente
          : await archivoADataUrl(fuente);
      abrirEdicion(lista, origen);
    } catch {
      setProcesando(false);
    }
  };

  const camara = useCamara({
    activa: true,
    autocaptura: autocapturaOn,
    videoRef,
    alCapturar: (dataUrl) => void entregar(dataUrl, "camara"),
  });
  const { estado: estadoCam, mensaje, quadVivo, scoreVivo, armada, torchOn } = camara.estado;

  const desdeArchivo = (file: File) => {
    void entregar(URL.createObjectURL(file), "galeria");
  };

  const desdeActaReal = async (a: ActaReal) => {
    setSelectorActas(false);
    setProcesando(true);
    try {
      const res = await fetch(a.url);
      const blob = await res.blob();
      await entregar(blob, "acta-real");
    } catch {
      setProcesando(false);
    }
  };
  const camaraLista = estadoCam === "lista";
  const scorePct = scoreVivo != null ? Math.round(scoreVivo * 100) : null;

  return (
    <section className="relative flex h-full flex-col overflow-hidden bg-black">
      {/* ===== VISOR FULL-BLEED ===== */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={cn("h-full w-full object-cover", !camaraLista && "opacity-0")}
        />

        {/* Viñeta cinematográfica */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />

        {/* Quad detectado EN VIVO (SVG + máscara exterior + handles) */}
        {camaraLista && quadVivo && (
          <>
            <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden>
              <defs>
                <mask id="mask-quad">
                  <rect width="100%" height="100%" fill="white" />
                  <polygon
                    points={quadVivo.map((p) => `${p.x * 100}%,${p.y * 100}%`).join(" ")}
                    fill="black"
                  />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="black" opacity="0.35" mask="url(#mask-quad)" />
              <polygon
                points={quadVivo.map((p) => `${p.x * 100}%,${p.y * 100}%`).join(" ")}
                fill="rgba(0,122,255,0.08)"
                stroke={COLOR_QUAD}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            </svg>
            {/* Handles interactivos de esquina (decorativos, como el diseño) */}
            {quadVivo.map((p, i) => (
              <div
                key={i}
                className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              >
                <div className="h-3.5 w-3.5 rounded-full border-[2.5px] border-[#007aff] bg-white shadow-[0_0_8px_rgba(0,122,255,0.7)]" />
              </div>
            ))}
          </>
        )}
      </div>

      {/* ===== BANNERS DE CONTEXTO (dirigido + manual) ===== */}
      {(contexto || modoManual) && (
        <div className="absolute left-1/2 top-[calc(env(safe-area-inset-top,0px)+52px)] z-20 flex -translate-x-1/2 flex-col items-center gap-1.5">
          {contexto && (
            <span className="data-mono rounded-full border border-ind-primary/50 bg-ink-950/90 px-3 py-1 text-[10px] font-bold text-ind-primary backdrop-blur">
              OBJETIVO: MESA {mesaContexto ? String(mesaContexto.numero).padStart(2, "0") : "—"} ·{" "}
              {contexto.tipoEjemplar} · P{contexto.pagina}
            </span>
          )}
          {modoManual && (
            <span className="data-mono rounded-full border border-warning/50 bg-ink-950/90 px-3 py-1 text-[10px] font-bold text-warning backdrop-blur">
              MODO MANUAL — ASIGNARÁ Y TRANSCRIBIRÁ LUEGO
            </span>
          )}
        </div>
      )}

      {/* ===== MEDIDOR DE CALIDAD (abajo izquierda) ===== */}
      {camaraLista && scorePct != null && (
        <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+110px)] left-4 z-20">
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 backdrop-blur-xl">
            <span className="relative inline-block h-1 w-10 overflow-hidden rounded-full bg-white/25">
              <span
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full",
                  scorePct > 80 ? "bg-brand-500" : scorePct > 55 ? "bg-[#007aff]" : "bg-white/60"
                )}
                style={{ width: `${scorePct}%` }}
              />
            </span>
            <span className="data-mono text-[10px] font-bold text-white/90">{scorePct}%</span>
          </div>
        </div>
      )}

      {/* ===== ESTADO: INICIANDO ===== */}
      {estadoCam === "iniciando" && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
            <p className="label-caps text-white/70">Iniciando cámara…</p>
          </div>
        </div>
      )}

      {/* ===== ESTADO: CÁMARA NO DISPONIBLE ===== */}
      {(estadoCam === "denegada" || estadoCam === "error" || estadoCam === "nodispositivo") && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/95 p-6">
          <div className="flex w-full max-w-xs flex-col items-center gap-3 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl border border-ink-border bg-ink-800 text-ind-on-surface-var">
              <CameraOff className="h-8 w-8" />
            </div>
            <p className="label-caps text-white/85">Cámara no disponible</p>
            <p className="text-sm text-white/60">{mensaje}</p>
            <div className="mt-1 flex w-full flex-col gap-2">
              <button
                type="button"
                onClick={() => inputGaleria.current?.click()}
                className="h-11 w-full rounded-xl bg-brand-500 text-xs font-extrabold text-black transition-transform active:scale-[0.98]"
              >
                CARGAR DESDE GALERÍA
              </button>
              <button
                type="button"
                onClick={() => setSelectorActas(true)}
                className="h-11 w-full rounded-xl border border-white/15 bg-ink-700 text-xs font-bold text-white transition-transform active:scale-[0.98]"
              >
                PROBAR CON ACTA REAL
              </button>
              <button
                type="button"
                onClick={() => void camara.iniciar()}
                className="h-9 w-full text-[11px] font-semibold text-white/60 transition-opacity active:opacity-60"
              >
                REINTENTAR CÁMARA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== OVERLAY: ABRIENDO EL EDITOR ===== */}
      {procesando && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/70">
          <div className="flex flex-col items-center gap-3 text-white">
            <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
            <p className="label-caps">Abriendo el editor…</p>
          </div>
        </div>
      )}

      {/* ===== FLASH DE OBTURADOR ===== */}
      {flash && <div className="absolute inset-0 z-40 bg-white" />}

      {/* ===== TOP BAR MÍNIMA ===== */}
      <header className="absolute top-0 z-30 flex w-full items-center justify-between px-4 pb-2 pt-safe">
        {/* Izquierda: cerrar (escaneo libre o vuelve a Control) */}
        <button
          type="button"
          onClick={cerrarVisor}
          aria-label="Cerrar visor"
          className="grid h-10 w-10 place-items-center text-white/95 transition-opacity active:opacity-60"
        >
          <X className="h-[22px] w-[22px]" />
        </button>

        {/* Centro: pill integrada IA + AUTO */}
        <div className="flex h-8 items-center gap-2.5 rounded-full border border-white/10 bg-black/55 px-2.5 shadow-sm backdrop-blur-xl">
          <span className="flex items-center justify-center rounded-[4px] bg-white px-1 py-0.5 text-[10px] font-bold leading-none tracking-tight text-black">
            IA
          </span>
          <button
            type="button"
            onClick={() => setAutocapturaOn((v) => !v)}
            aria-label="Cambiar modo automático"
            aria-pressed={autocapturaOn}
            className="flex items-center gap-1.5 pl-0.5 text-[11px] transition-transform active:scale-95"
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full transition-colors",
                autocapturaOn ? (armada ? "animate-pulse-sync bg-[#007aff]" : "bg-[#007aff]") : "bg-white/30"
              )}
            />
            <span className={cn("font-bold tracking-normal", autocapturaOn ? "text-white" : "text-white/50")}>
              AUTO
            </span>
          </button>
        </div>

        {/* Derecha: menú de opciones (⋮) */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            aria-label="Más opciones"
            aria-haspopup="menu"
            aria-expanded={menuAbierto}
            className="grid h-10 w-10 place-items-center text-white/95 transition-opacity active:opacity-60"
          >
            <MoreVertical className="h-[22px] w-[22px]" />
          </button>

          {menuAbierto && (
            <>
              {/* Backdrop invisible para cerrar al hacer click fuera */}
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setMenuAbierto(false)}
                className="fixed inset-0 z-30 cursor-default"
              />
              <div
                role="menu"
                className="absolute right-4 top-[calc(100%+4px)] z-40 w-44 rounded-xl border border-white/10 bg-ink-950/95 p-1 shadow-hud backdrop-blur-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuAbierto(false);
                    setSelectorActas(true);
                  }}
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-[11px] font-semibold text-white/90 hover:bg-white/10"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  ACTAS REALES E-14
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuAbierto(false);
                    void camara.iniciar();
                  }}
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-[11px] font-semibold text-white/90 hover:bg-white/10"
                >
                  <Camera className="h-4 w-4 shrink-0" />
                  REINTENTAR CÁMARA
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => toggleModoManual()}
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-[11px] font-semibold text-white/90 hover:bg-white/10"
                >
                  <PenLine className="h-4 w-4 shrink-0" />
                  MODO MANUAL: {modoManual ? "ON" : "OFF"}
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* ===== DOCK INFERIOR (solo con cámara lista o iniciando) ===== */}
      {estadoCam !== "denegada" && estadoCam !== "error" && estadoCam !== "nodispositivo" && (
        <footer className="absolute bottom-0 z-30 w-full bg-gradient-to-t from-black/90 via-black/50 to-transparent px-8 pb-2 pt-6">
        <div className="flex items-center justify-between">
          {/* Importar (galería) */}
          <button
            type="button"
            onClick={() => inputGaleria.current?.click()}
            aria-label="Cargar desde galería"
            className="flex min-w-[56px] flex-col items-center justify-center transition-all active:scale-95"
          >
            <span className="flex h-9 w-9 items-center justify-center text-white/95">
              <Images className="h-[22px] w-[22px]" />
            </span>
            <span className="mt-0.5 text-[11px] font-medium tracking-tight text-white/80">Importar</span>
          </button>

          {/* Disparador principal */}
          <div className="flex items-center justify-center px-1">
            <button
              type="button"
              onClick={() => {
                if (camara.dispararManual()) inputNativo.current?.click();
              }}
              disabled={!camaraLista || procesando}
              aria-label="Capturar página"
              className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-2 border-white bg-black/40 p-[3.5px] shadow-[0_0_20px_rgba(255,255,255,0.15)] backdrop-blur-md transition-transform duration-150 active:scale-90 disabled:pointer-events-none disabled:opacity-40"
            >
              <span className="flex h-full w-full items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20">
                <FileText className="h-7 w-7 text-white" />
              </span>
            </button>
          </div>

          {/* Flash (linterna) */}
          <button
            type="button"
            onClick={() => void camara.alternarTorch()}
            aria-label="Alternar flash"
            aria-pressed={torchOn}
            className="flex min-w-[56px] flex-col items-center justify-center transition-all active:scale-95"
          >
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center transition-colors",
                torchOn ? "text-yellow-400" : "text-white/95"
              )}
            >
              {torchOn ? <Zap className="h-6 w-6" /> : <ZapOff className="h-6 w-6" />}
            </span>
            <span className="mt-0.5 text-[11px] font-medium tracking-tight text-white/80">Flash</span>
          </button>
        </div>

        {/* Home indicator decorativo */}
        <div className="pointer-events-none mx-auto mb-1 mt-2 h-1 w-32 rounded-full bg-white/80" />
        </footer>
      )}

      {/* Inputs ocultos: galería y cámara nativa (iOS sin ImageCapture) */}
      <input
        ref={inputGaleria}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) desdeArchivo(f);
          e.target.value = "";
        }}
      />
      <input
        ref={inputNativo}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) desdeArchivo(f);
          e.target.value = "";
        }}
      />

      {/* ===== SELECTOR DE ACTAS REALES ===== */}
      <Dialog open={selectorActas} onOpenChange={setSelectorActas}>
        <DialogContent className="max-w-[360px] rounded-2xl border-ink-border bg-ink-800 p-4 text-white">
          <DialogHeader className="pb-1 text-left">
            <DialogTitle className="text-base font-extrabold text-brand-500">ACTAS E-14 REALES</DialogTitle>
            <DialogDescription className="text-xs text-white/60">
              Formularios oficiales de ejemplo (repo digielect). El escáner también acepta
              cualquier documento desde la galería.
            </DialogDescription>
          </DialogHeader>
          <div className="fine-scroll grid max-h-[52vh] grid-cols-2 gap-2 overflow-y-auto pr-1">
            {ACTAS_REALES.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => void desdeActaReal(a)}
                className="group overflow-hidden rounded-lg border border-ink-border bg-ink-700 text-left transition-colors hover:border-brand-500/60"
              >
                {/* E-14 es muy vertical: mostrar la parte superior del formulario */}
                <img
                  src={a.miniUrl}
                  alt={a.etiqueta}
                  className="h-36 w-full object-cover object-top"
                  loading="lazy"
                />
                <span className="data-mono block px-2 py-1.5 text-[10px] font-bold text-white/70 group-hover:text-brand-400">
                  {a.etiqueta}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
