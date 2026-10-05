"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — Pantalla CAPTURA (diseño
// oficial "digitalizador_captura_autom_tica_e_14" y
// "digitalizador_modo_manual_on_estado_inicial").
// Cámara en vivo (getUserMedia) con:
//  · resolución del sensor (ideal 2560×1920) + torch (LED)
//  · autocaptura k-de-n por calidad (web-scanner)
//  · QR E-14 decodificado en vivo (jsQR) y a resolución plena
//  · escape a captura manual a los 8s (NO_DETECT_TIMEOUT)
//  · modo manual: disparador 72px + Galería/PDF (diseño)
// La imagen se comprime a 1600px/JPEG 0.92 (buena calidad).
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  FileText,
  FolderOpen,
  Loader2,
  QrCode,
  RefreshCw,
  Zap,
} from "lucide-react";
import { comprimirImagen, type CapturaContexto } from "./shared";
import { decodeQrDeDataUrl, decodeQrDeVideo } from "@/lib/e14/qr";
import { evaluarCalidad, SHUTTER, type CalidadCaptura } from "@/lib/e14/quality";

// ------------------------------------------------------------
// Plantilla estructurada E-14 (overlay del visor, diseño)
// ------------------------------------------------------------

const PlantillaE14: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 300 420"
    preserveAspectRatio="none"
    className={className}
    aria-hidden
  >
    {/* Puntos fiduciales */}
    <rect x="6" y="6" width="14" height="14" fill="currentColor" />
    <rect x="280" y="6" width="14" height="14" fill="currentColor" />
    <rect x="6" y="400" width="14" height="14" fill="currentColor" />
    <rect x="280" y="400" width="14" height="14" fill="currentColor" />
    {/* Encabezado: QR + barcode + datos de mesa */}
    <rect x="30" y="10" width="34" height="34" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <rect x="38" y="18" width="18" height="18" fill="currentColor" opacity="0.35" />
    <rect x="72" y="14" width="90" height="12" fill="currentColor" opacity="0.25" />
    <rect x="72" y="32" width="60" height="6" fill="currentColor" opacity="0.2" />
    {[...Array(9)].map((_, i) => (
      <rect key={i} x={175 + i * 4} y="14" width="2" height="16" fill="currentColor" opacity="0.55" />
    ))}
    <rect x="170" y="34" width="60" height="5" fill="currentColor" opacity="0.2" />
    {[...Array(4)].map((_, i) => (
      <rect key={`h${i}`} x="30" y={54 + i * 8} width={150 - i * 18} height="4" fill="currentColor" opacity="0.22" />
    ))}
    <rect x="200" y="54" width="70" height="4" fill="currentColor" opacity="0.22" />
    <rect x="200" y="64" width="70" height="4" fill="currentColor" opacity="0.22" />
    {/* Nivelación de mesa */}
    <rect x="30" y="96" width="240" height="44" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
    <rect x="36" y="102" width="90" height="6" fill="currentColor" opacity="0.3" />
    {[...Array(3)].map((_, i) => (
      <rect key={`n${i}`} x="36" y={114 + i * 8} width="46" height="5" fill="currentColor" opacity="0.25" />
    ))}
    <rect x="150" y="108" width="30" height="24" fill="currentColor" opacity="0.18" />
    <rect x="150" y="108" width="30" height="24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4" />
    {/* Cuerpo de votación */}
    {[...Array(7)].map((_, i) => (
      <g key={`f${i}`}>
        <rect x="30" y={152 + i * 26} width="240" height="20" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.55" />
        <rect x="36" y={158 + i * 26} width={96 - (i % 3) * 18} height="7" fill="currentColor" opacity="0.28" />
        <rect x="240" y={157 + i * 26} width="24" height="11" fill="currentColor" opacity="0.18" />
      </g>
    ))}
    {/* Firmas */}
    {[...Array(3)].map((_, i) => (
      <rect key={`s${i}`} x={34 + i * 80} y="356" width="64" height="22" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    ))}
    <rect x="30" y="384" width="240" height="8" fill="currentColor" opacity="0.2" />
  </svg>
);

// ------------------------------------------------------------
// Hook de cámara E-14 (getUserMedia + torch + calidad + QR)
// ------------------------------------------------------------

interface CamaraE14 {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  estado: "iniciando" | "activa" | "no-disponible";
  torch: boolean;
  toggleTorch: () => void;
  calidad: CalidadCaptura | null;
  qrVivo: string | null;
  reintentar: () => void;
}

function useCamaraE14(
  activo: boolean,
  onAutoCaptura: () => void
): CamaraE14 {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasQrRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [estado, setEstado] = useState<"iniciando" | "activa" | "no-disponible">("iniciando");
  const [torch, setTorch] = useState(false);
  const [calidad, setCalidad] = useState<CalidadCaptura | null>(null);
  const [qrVivo, setQrVivo] = useState<string | null>(null);
  const muestrasRef = useRef<{ t: number; score: number }[]>([]);
  const ultimaCapturaRef = useRef(0);
  const autoCapturaRef = useRef(onAutoCaptura);
  autoCapturaRef.current = onAutoCaptura;

  const detener = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current = null;
  }, []);

  const iniciar = useCallback(async () => {
    setEstado("iniciando");
    setQrVivo(null);
    setCalidad(null);
    muestrasRef.current = [];
    if (!navigator.mediaDevices?.getUserMedia) {
      setEstado("no-disponible");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 2560 },
          height: { ideal: 1920 },
        },
        audio: false,
      });
      streamRef.current = stream;
      trackRef.current = stream.getVideoTracks()[0] ?? null;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setEstado("activa");
    } catch {
      setEstado("no-disponible");
    }
  }, []);

  useEffect(() => {
    if (activo) void iniciar();
    else detener();
    return detener;
  }, [activo, iniciar, detener]);

  // Bucle de calidad + autocaptura k-de-n + QR en vivo
  useEffect(() => {
    if (!activo || estado !== "activa") return;
    let ticks = 0;
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;
      ticks++;

      // Calidad cada tick (≈350 ms)
      const c = evaluarCalidad(video);
      setCalidad(c);
      const ahora = Date.now();
      const muestras = muestrasRef.current;
      muestras.push({ t: ahora, score: c.score });
      // ventana y k-de-n
      while (muestras.length && ahora - muestras[0].t > SHUTTER.ventanaMs + 400) {
        muestras.shift();
      }
      const ventana = muestras.filter((m) => ahora - m.t <= SHUTTER.ventanaMs);
      if (
        c.score >= SHUTTER.score &&
        ventana.filter((m) => m.score >= SHUTTER.score).length >= SHUTTER.k &&
        ventana.length >= SHUTTER.k &&
        ahora - ultimaCapturaRef.current > SHUTTER.cooldownMs
      ) {
        ultimaCapturaRef.current = ahora;
        muestrasRef.current = [];
        autoCapturaRef.current();
        return;
      }

      // QR en vivo cada 2 ticks (≈700 ms)
      if (ticks % 2 === 0) {
        if (!canvasQrRef.current) {
          canvasQrRef.current = document.createElement("canvas");
        }
        const texto = decodeQrDeVideo(video, canvasQrRef.current);
        setQrVivo((prev) => (texto ? texto : prev));
      }
    }, 350);
    return () => window.clearInterval(timer);
  }, [activo, estado]);

  const toggleTorch = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const nuevo = !torch;
    track
      .applyConstraints({
        advanced: [{ torch: nuevo }],
      } as unknown as MediaTrackConstraints)
      .then(() => setTorch(nuevo))
      .catch(() => undefined);
  }, [torch]);

  return { videoRef, estado, torch, toggleTorch, calidad, qrVivo, reintentar: iniciar };
}

// ------------------------------------------------------------
// Pantalla de captura
// ------------------------------------------------------------

interface PantallaCapturaProps {
  ctx: CapturaContexto | null;
  modoManual: boolean;
  onToggleModoManual: () => void;
  cargandoEjemplo: boolean;
  onUsarEjemplo: () => void;
  onCaptura: (dataUrl: string, qrTexto: string | null) => void;
  onVolver: () => void;
}

export const PantallaCaptura: React.FC<PantallaCapturaProps> = ({
  ctx,
  modoManual,
  onToggleModoManual,
  cargandoEjemplo,
  onUsarEjemplo,
  onCaptura,
  onVolver,
}) => {
  const inputGaleriaRef = useRef<HTMLInputElement>(null);
  const [capturando, setCapturando] = useState(false);
  const [galeriaAbierta, setGaleriaAbierta] = useState(false);
  const [escapeManual, setEscapeManual] = useState(false);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [inicioVista] = useState(() => Date.now());
  const capturandoRef = useRef(false);

  // Refs anti-closure-obsoleto (la autocaptura k-de-n se dispara
  // desde un intervalo con el callback de la primera renderización)
  const onCapturaRef = useRef(onCaptura);
  onCapturaRef.current = onCaptura;
  const capturarRef = useRef<(origen: "auto" | "manual") => Promise<void>>(async () => {});
  const qrVivoRef = useRef<string | null>(null);

  // Escape a captura manual (NO_DETECT_TIMEOUT del web-scanner)
  useEffect(() => {
    if (modoManual) return;
    const t = window.setTimeout(() => setEscapeManual(true), SHUTTER.timeoutManualMs);
    return () => window.clearTimeout(t);
  }, [modoManual, inicioVista]);

  const cam = useCamaraE14(
    !capturando,
    useCallback(() => {
      if (capturandoRef.current) return;
      void capturarRef.current("auto");
    }, [])
  );
  useEffect(() => {
    qrVivoRef.current = cam.qrVivo;
  }, [cam.qrVivo]);

  // ---------------- Captura de la foto ----------------
  const capturar = useCallback(
    async (origen: "auto" | "manual") => {
      const video = cam.videoRef.current;
      if (!video || !video.videoWidth || capturandoRef.current) return;
      capturandoRef.current = true;
      setCapturando(true);
      setErrorLocal(null);
      try {
        // 1. Frame a resolución del track (canvas pleno)
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const c2d = canvas.getContext("2d");
        if (!c2d) throw new Error("canvas");
        c2d.drawImage(video, 0, 0);

        // 2. QR a resolución plena ANTES de comprimir (jsQR +
        //    BarcodeDetector con reintentos de escala)
        let qrTexto: string | null = qrVivoRef.current;
        try {
          const full = canvas.toDataURL("image/jpeg", 0.95);
          const dec = await decodeQrDeDataUrl(full);
          if (dec.texto) qrTexto = dec.texto;
        } catch {
          /* se conserva el QR vivo si la decodificación plena falla */
        }

        // 3. Buena calidad: 1600px · JPEG 0.92
        const dataUrl = await new Promise<string>((resolve) => {
          const img = new Image();
          img.onload = () => {
            const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * escala));
            const h = Math.max(1, Math.round(img.height * escala));
            const c2 = document.createElement("canvas");
            c2.width = w;
            c2.height = h;
            const cx = c2.getContext("2d");
            if (!cx) {
              resolve(canvas.toDataURL("image/jpeg", 0.92));
              return;
            }
            cx.drawImage(img, 0, 0, w, h);
            resolve(c2.toDataURL("image/jpeg", 0.92));
          };
          img.onerror = () => resolve(canvas.toDataURL("image/jpeg", 0.92));
          img.src = canvas.toDataURL("image/jpeg", 0.95);
        });

        void origen;
        onCapturaRef.current(dataUrl, qrTexto);
      } catch {
        setErrorLocal("NO SE PUDO CAPTURAR · REINTENTE");
        capturandoRef.current = false;
        setCapturando(false);
      }
    },
    [cam.videoRef]
  );
  capturarRef.current = capturar;

  // ---------------- Galería / archivo ----------------
  const manejarArchivo = async (file: File | undefined) => {
    if (!file) return;
    setErrorLocal(null);
    setGaleriaAbierta(false);
    setCapturando(true);
    capturandoRef.current = true;
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("read"));
        reader.readAsDataURL(file);
      });
      const comprimida = await comprimirImagen(dataUrl, 1600, 0.92);
      // QR desde la galería también (actas escaneadas previamente)
      let qrTexto: string | null = null;
      try {
        const dec = await decodeQrDeDataUrl(comprimida);
        if (dec.texto) qrTexto = dec.texto;
      } catch {
        /* sin QR: flujo VLM/contingencia */
      }
      onCapturaRef.current(comprimida, qrTexto);
    } catch {
      setErrorLocal("NO SE PUDO PROCESAR LA IMAGEN · REINTENTE");
      capturandoRef.current = false;
      setCapturando(false);
    }
  };

  const mostrarDisparo =
    (modoManual || escapeManual) && cam.estado !== "no-disponible";
  const mostrarFallback = cam.estado === "no-disponible";

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest overflow-hidden">
      {/* ---- Top bar (diseño: DIGITALIZADOR E-14 + modo manual + flash) ---- */}
      <header className="bg-surface w-full border-b-2 border-outline-variant flex items-center justify-between px-4 h-[64px] shrink-0 z-10">
        <div className="flex items-center min-w-0">
          <button
            type="button"
            onClick={onVolver}
            aria-label="Volver al control de actas"
            className="md:hidden p-2 -ml-2 mr-1 text-primary hover:bg-surface-variant rounded-full shrink-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </button>
          <h1 className="font-pwa-display text-primary tracking-tight truncate">DIGITALIZADOR E-14</h1>
          <button
            type="button"
            onClick={onToggleModoManual}
            aria-label="Alternar modo manual"
            aria-pressed={modoManual}
            className="flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-surface-container-high hover:bg-surface-variant transition-colors active:scale-95 ml-3 shrink-0"
          >
            <span
              className={`w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_#4be277] ${modoManual ? "animate-pulse" : ""}`}
              aria-hidden
            />
            <span className="font-label-caps text-label-caps text-primary">
              MODO MANUAL: {modoManual ? "ON" : "OFF"}
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={cam.toggleTorch}
          aria-label={cam.torch ? "Desactivar flash" : "Activar flash"}
          aria-pressed={cam.torch}
          className={`p-2 rounded-full transition-colors active:scale-95 ${
            cam.torch ? "text-primary bg-primary/15" : "text-primary hover:bg-surface-variant"
          }`}
        >
          <Zap size={22} fill={cam.torch ? "currentColor" : "none"} aria-hidden />
        </button>
      </header>

      {/* ---- Visor de cámara ---- */}
      <main className="relative flex-grow w-full flex flex-col bg-surface-container-lowest min-h-0">
        {/* Feed de cámara (o fondo simulado del diseño) */}
        <div className="absolute inset-0 bg-surface-dim overflow-hidden">
          <div className="absolute inset-0 opacity-20 bg-gradient-to-br from-surface-container-high to-surface-container-lowest" />
        </div>
        {cam.estado === "activa" && (
          <video
            ref={cam.videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
            autoPlay
            aria-label="Cámara en vivo para capturar el acta E-14"
          />
        )}

        {/* Encuadre con marco + plantilla + línea de escaneo */}
        <div className="relative z-10 flex flex-col items-center justify-center flex-grow h-full p-4 min-h-0">
          <div className="w-full max-w-sm relative flex-grow min-h-[240px]">
            <div className="scanner-frame h-full">
              <div className="scanner-frame-inner">
                <div className="absolute inset-0 opacity-30 pointer-events-none mix-blend-screen text-[#dce5d9]">
                  <PlantillaE14 className="w-full h-full" />
                </div>
              </div>
            </div>
            <div
              className="scan-line absolute left-0 w-full h-[2px] bg-primary opacity-80 shadow-[0_0_8px_#4be277]"
              aria-hidden
            />

            {/* Estado del escaneo automático */}
            {!mostrarDisparo && (
              <div className="absolute -bottom-9 left-0 right-0 flex flex-col items-center gap-1">
                {cam.qrVivo ? (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 border border-primary/50 text-primary font-label-caps text-[11px]">
                    <QrCode size={13} aria-hidden />
                    QR DETECTADO · {cam.qrVivo.slice(0, 18)}…
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-black/60 border border-outline-variant text-on-surface-variant font-label-caps text-[10px] tracking-wide">
                    BUSCANDO CÓDIGO QR DEL ACTA…
                  </span>
                )}
                {cam.calidad && (
                  <span className="flex items-center gap-1.5" aria-live="polite">
                    {[...Array(6)].map((_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 rounded-full transition-all ${
                          i < Math.round(cam.calidad!.score / 1.7)
                            ? "w-4 bg-primary shadow-[0_0_6px_#4be277]"
                            : "w-2 bg-on-surface-variant/40"
                        }`}
                      />
                    ))}
                    <span className="font-label-caps text-[10px] text-on-surface-variant ml-1">
                      CALIDAD {cam.calidad.score}/10
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Cámara no disponible → fallback con galería (ocupa el visor
            completo: los controles de disparo se ocultan para no solaparse) */}
        {mostrarFallback && (
          <div className="absolute inset-0 z-20 bg-surface-container-lowest/95 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Camera size={36} className="text-on-surface-variant" aria-hidden />
            <span className="font-headline-md text-headline-md text-on-surface">
              CÁMARA NO DISPONIBLE
            </span>
            <span className="text-body-md text-on-surface-variant max-w-[260px]">
              Permiso denegado o dispositivo sin cámara. Cargue la foto del acta
              desde la galería o el archivo.
            </span>
            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={() => setGaleriaAbierta(true)}
                className="h-11 px-4 rounded bg-primary text-on-primary font-label-caps text-label-caps flex items-center gap-2"
              >
                <FolderOpen size={16} aria-hidden /> GALERÍA
              </button>
              <button
                type="button"
                onClick={cam.reintentar}
                className="h-11 px-4 rounded border border-outline-variant bg-surface-container-high text-primary font-label-caps text-label-caps flex items-center gap-2"
              >
                <RefreshCw size={16} aria-hidden /> REINTENTAR
              </button>
            </div>
          </div>
        )}

        {/* Overlay de captura en curso */}
        {capturando && (
          <div className="absolute inset-0 z-30 bg-surface-dim/90 flex flex-col items-center justify-center gap-3">
            <Loader2 size={32} className="animate-spin text-primary" aria-hidden />
            <span className="font-label-caps text-label-caps text-primary" role="status">
              CAPTURANDO A RESOLUCIÓN PLENA…
            </span>
            <span className="font-label-caps text-[10px] text-on-surface-variant">
              DECODIFICANDO QR · COMPRIMIENDO EN CANVAS
            </span>
          </div>
        )}

        {/* ---- Zona de disparo (modo manual / escape / diseño) ---- */}
        <div className="relative z-20 shrink-0 pb-3 pt-2 px-6">
          {mostrarDisparo ? (
            <div className="flex items-center justify-between">
              <div className="flex flex-col items-center gap-1 w-16">
                <button
                  type="button"
                  onClick={() => setGaleriaAbierta(true)}
                  aria-label="Cargar desde galería o archivo"
                  className="w-12 h-12 rounded-full bg-surface-container-high/90 border border-primary/40 text-primary flex items-center justify-center hover:bg-surface-variant active:scale-95 shadow-lg transition-all"
                >
                  <FolderOpen size={22} aria-hidden />
                </button>
                <span className="font-label-caps text-[10px] text-on-surface-variant text-center leading-none tracking-tight">
                  Galería / PDF
                </span>
              </div>
              <button
                type="button"
                onClick={() => void capturar("manual")}
                disabled={cam.estado !== "activa"}
                aria-label="Capturar foto E-14"
                className="w-[72px] h-[72px] rounded-full bg-primary text-on-primary flex items-center justify-center shadow-[0_0_20px_#4be277] border-4 border-surface active:scale-95 hover:bg-primary-container transition-all disabled:opacity-40"
              >
                <Camera size={34} aria-hidden />
              </button>
              <div className="w-16" aria-hidden />
            </div>
          ) : !mostrarFallback ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setEscapeManual(true)}
                className="px-3 py-1.5 rounded-full bg-black/55 border border-outline-variant text-on-surface-variant font-label-caps text-[10px] hover:text-on-surface transition-colors"
              >
                PASAR A CAPTURA MANUAL
              </button>
            </div>
          ) : null}
        </div>

        {/* Sheet de galería (diseño: botón Galería / PDF) */}
        {galeriaAbierta && (
          <div className="absolute inset-0 z-40 bg-black/70 flex items-end" role="dialog" aria-label="Opciones de carga">
            <div className="w-full bg-surface-container-low border-t-2 border-outline-variant rounded-t-2xl p-4 flex flex-col gap-2 pb-6">
              <div className="w-10 h-1 rounded-full bg-on-surface-variant/40 self-center mb-1" aria-hidden />
              <span className="font-headline-md text-[14px] text-on-surface">CARGAR ACTA E-14</span>
              <button
                type="button"
                onClick={() => inputGaleriaRef.current?.click()}
                className="w-full flex items-center gap-3 px-3 py-3 rounded bg-surface-container-high border border-outline-variant hover:border-primary/50 text-left"
              >
                <FolderOpen size={20} className="text-primary shrink-0" aria-hidden />
                <span className="flex flex-col">
                  <span className="text-body-lg text-on-surface">Galería del dispositivo</span>
                  <span className="text-body-md text-on-surface-variant">
                    Foto del acta escaneada o descargada
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setGaleriaAbierta(false);
                  onUsarEjemplo();
                }}
                disabled={cargandoEjemplo}
                className="w-full flex items-center gap-3 px-3 py-3 rounded bg-surface-container-high border border-outline-variant hover:border-primary/50 text-left disabled:opacity-50"
              >
                {cargandoEjemplo ? (
                  <Loader2 size={20} className="animate-spin text-primary shrink-0" aria-hidden />
                ) : (
                  <FileText size={20} className="text-primary shrink-0" aria-hidden />
                )}
                <span className="flex flex-col">
                  <span className="text-body-lg text-on-surface">Acta de ejemplo (demo)</span>
                  <span className="text-body-md text-on-surface-variant">
                    E-14 real del servidor para probar el flujo
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setGaleriaAbierta(false)}
                className="mt-1 h-11 rounded border border-outline-variant text-on-surface-variant font-label-caps text-label-caps"
              >
                CANCELAR
              </button>
            </div>
          </div>
        )}

        {errorLocal && (
          <div
            role="alert"
            className="absolute top-2 left-4 right-4 z-40 bg-red-950/80 border border-red-500/60 rounded px-3 py-2 font-label-caps text-[11px] text-red-300"
          >
            {errorLocal}
          </div>
        )}
      </main>

      <input
        ref={inputGaleriaRef}
        type="file"
        accept="image/*"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void manejarArchivo(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
};
