"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — Pantalla CAPTURA (diseño
// oficial "digitalizador_captura_autom_tica_e_14" y
// "digitalizador_modo_manual_on_estado_inicial").
// Cámara en vivo (getUserMedia) con:
//  · resolución del sensor (ideal 2560×1920) + torch (LED)
//  · autocaptura k-de-n por calidad (web-scanner)
//  · detección de bordes EN VIVO en worker (marco del acta)
//  · QR E-14 decodificado en vivo (jsQR) y a resolución plena
//  · escape a captura manual a los 8s (NO_DETECT_TIMEOUT)
//  · modo manual: disparador 72px + Galería/PDF (diseño)
// Rol A (TAREA-A): la captura entrega el FRAME COMPLETO
// (F-RES-PRIORITY, JPEG 0.95); el recorte/perspectiva/B/N lo
// hace el pipeline del escáner en el DigitalizadorApp.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  FileText,
  FolderOpen,
  Loader2,
  QrCode,
  RefreshCw,
  ScanLine,
  SwitchCamera,
  Zap,
} from "lucide-react";
import { type CapturaContexto } from "./shared";
import { decodeQrDeDataUrl, decodeQrDeVideo } from "@/lib/e14/qr";
import { evaluarCalidad, SHUTTER, type CalidadCaptura } from "@/lib/e14/quality";
import { detectarQuadEnWorker, type QuadNormalizado } from "@/lib/scanner/worker-client";
import { archivoACapturaDataUrl } from "@/lib/scanner/heic";

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

/** Motivo concreto por el que la cámara no arrancó (para guiar al operador) */
export type MotivoErrorCamara =
  | "no-soportado"
  | "permiso"
  | "sin-camara"
  | "ocupada"
  | "error";

interface CamaraE14 {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  estado: "iniciando" | "activa" | "no-disponible";
  motivoError: MotivoErrorCamara | null;
  torch: boolean;
  /** D-02: el track actual soporta torch (getCapabilities) */
  torchSoportado: boolean;
  /** D-02: aviso breve ("EL FLASH NO ESTÁ DISPONIBLE", expira a 2 s) */
  avisoFlash: string | null;
  toggleTorch: () => void;
  calidad: CalidadCaptura | null;
  qrVivo: string | null;
  /** D-01: lentes traseras detectadas por las sondas secuenciales */
  lentes: LenteDisponible[];
  /** D-01: índice de la lente activa en `lentes` (-1 si es la exploratoria) */
  lenteIdx: number;
  /** D-01: cicla a la siguiente lente trasera detectada */
  cambiarLente: () => void;
  /** D-01: sondas/cambio de lente en curso (deshabilita el switch) */
  sondeando: boolean;
  /** D-01: resolución real del track (chip DEBUG RES temporal) */
  resDebug: { w: number; h: number } | null;
  reintentar: () => void;
}

/** Lente trasera detectada por las sondas (D-01) */
interface LenteDisponible {
  deviceId: string;
  label: string;
  maxAncho: number;
  maxAlto: number;
  torch: boolean;
  /** Coincide con /ultra|0,5|macro|tele|portrait/ → nunca auto-elegida */
  descartadaAuto: boolean;
}

/** Timeout de cada sonda de lente (ms) */
const SONDA_TIMEOUT_MS = 2500;

function useCamaraE14(
  activo: boolean,
  onAutoCaptura: () => void
): CamaraE14 {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasQrRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const iniciarTokenRef = useRef(0);
  const [estado, setEstado] = useState<"iniciando" | "activa" | "no-disponible">("iniciando");
  const [motivoError, setMotivoError] = useState<MotivoErrorCamara | null>(null);
  const [torch, setTorch] = useState(false);
  const [torchSoportado, setTorchSoportado] = useState(false);
  const [avisoFlash, setAvisoFlash] = useState<string | null>(null);
  const [calidad, setCalidad] = useState<CalidadCaptura | null>(null);
  const [qrVivo, setQrVivo] = useState<string | null>(null);
  const [lentes, setLentes] = useState<LenteDisponible[]>([]);
  const [lenteIdx, setLenteIdx] = useState(-1);
  const [sondeando, setSondeando] = useState(false);
  const [resDebug, setResDebug] = useState<{ w: number; h: number } | null>(null);
  const muestrasRef = useRef<{ t: number; score: number }[]>([]);
  const ultimaCapturaRef = useRef(0);
  const autoCapturaRef = useRef(onAutoCaptura);
  autoCapturaRef.current = onAutoCaptura;
  /** Timer del aviso de flash (anti-solape de avisos) */
  const avisoFlashTimerRef = useRef<number | null>(null);

  const detener = useCallback(() => {
    iniciarTokenRef.current++; // invalida los inicios pendientes
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current = null;
  }, []);

  // Clasifica el error de getUserMedia para dar mensajes accionables
  // (permiso del navegador/iframe vs. sin cámara vs. cámara ocupada…)
  const clasificarError = useCallback((err: unknown): MotivoErrorCamara => {
    const name = err instanceof DOMException ? err.name : String((err as { name?: string })?.name ?? "");
    if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
      return "permiso";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
      return "sin-camara";
    }
    if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
      return "ocupada";
    }
    return "error";
  }, []);

  /** D-02: aviso breve de flash con expiración automática a 2 s */
  const avisarFlash = useCallback((texto: string) => {
    if (avisoFlashTimerRef.current) window.clearTimeout(avisoFlashTimerRef.current);
    setAvisoFlash(texto);
    avisoFlashTimerRef.current = window.setTimeout(() => {
      setAvisoFlash(null);
      avisoFlashTimerRef.current = null;
    }, 2000);
  }, []);

  /** caps del track con guarda (navegadores sin getCapabilities) */
  const capsDe = useCallback((track: MediaStreamTrack | null): MediaTrackCapabilities & { torch?: boolean } => {
    try {
      return (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
    } catch {
      return {};
    }
  }, []);

  /** D-01: abre un stream corto para sondear una lente concreta */
  const sondearLente = useCallback(async (deviceId: string): Promise<LenteDisponible | null> => {
    let sonda: MediaStream | null = null;
    try {
      const abierto = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
          audio: false,
        }),
        new Promise<null>((resolve) =>
          window.setTimeout(() => resolve(null), SONDA_TIMEOUT_MS)
        ),
      ]);
      if (!abierto) return null;
      sonda = abierto;
      const track = sonda.getVideoTracks()[0] ?? null;
      const caps = capsDe(track);
      const maxAncho = (caps.width as { max?: number } | undefined)?.max ?? 0;
      const maxAlto = (caps.height as { max?: number } | undefined)?.max ?? 0;
      return {
        deviceId,
        label: track?.label ?? "",
        maxAncho,
        maxAlto,
        torch: Boolean(caps.torch),
        descartadaAuto: /ultra|ultra\s*wide|0[.,]5|macro|tele|portrait/i.test(track?.label ?? ""),
      };
    } catch {
      return null;
    } finally {
      sonda?.getTracks().forEach((t) => t.stop());
    }
  }, [capsDe]);

  /** D-01: abre el stream definitivo de una lente (deviceId exact + caps) */
  const abrirLente = useCallback(
    async (deviceId: string, maxAncho: number, maxAlto: number): Promise<MediaStream | null> => {
      const pedir = async (conResolucion: boolean): Promise<MediaStream> => {
        try {
          return await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: deviceId },
              ...(conResolucion
                ? { width: { ideal: maxAncho || 2560 }, height: { ideal: maxAlto || 1920 } }
                : {}),
            },
            audio: false,
          });
        } catch (err) {
          // D-01: OverconstrainedError → reintentar SOLO con deviceId
          // (conserva la lente elegida, cede la resolución ideal).
          const motivo = clasificarError(err);
          if (!conResolucion || motivo === "permiso" || motivo === "sin-camara") throw err;
          return pedir(false);
        }
      };
      try {
        return await pedir(true);
      } catch {
        return null;
      }
    },
    [clasificarError]
  );

  const iniciar = useCallback(async () => {
    const token = ++iniciarTokenRef.current;
    setEstado("iniciando");
    setMotivoError(null);
    setQrVivo(null);
    setCalidad(null);
    // D-02: el estado del flash NUNCA queda pegado tras reiniciar
    setTorch(false);
    setTorchSoportado(false);
    setAvisoFlash(null);
    setResDebug(null);
    setLenteIdx(-1);
    muestrasRef.current = [];
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      setMotivoError("no-soportado");
      setEstado("no-disponible");
      return;
    }
    let stream: MediaStream | null = null;
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 2560 },
            height: { ideal: 1920 },
          },
          audio: false,
        });
      } catch (err) {
        // Algunos drivers/videocámaras virtuales rechazan las restricciones
        // de resolución aunque sean «ideal»: reintento sin restricciones,
        // salvo que el fallo sea de permiso o de ausencia de dispositivo.
        const motivo = clasificarError(err);
        if (motivo === "permiso" || motivo === "sin-camara") throw err;
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      // Llamada obsoleta (el componente se desmontó o se reinició la
      // cámara mientras el navegador esperaba el permiso): liberar y salir.
      if (token !== iniciarTokenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      // Aplicar YA el stream exploratorio: el visor se enciende sin
      // esperar las sondas de lente (D-01) — nunca bloquear la cámara.
      streamRef.current = stream;
      trackRef.current = stream.getVideoTracks()[0] ?? null;
      const track = trackRef.current;
      const caps = capsDe(track);
      setTorchSoportado(Boolean(caps.torch));
      setEstado("activa");
      setResDebug({
        w: track?.getSettings?.().width ?? 0,
        h: track?.getSettings?.().height ?? 0,
      });

      // ---- D-01 · SONDAS SECUENCIALES (patrón web-scanner) ----
      // Con el visor ya vivo, enumerar las lentes traseras y sondear
      // cada una (stream corto → caps → cerrar). Si la ganadora por
      // resolución NO es la actual, reabrir con deviceId exact.
      setSondeando(true);
      try {
        const dispositivos = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "videoinput" && d.deviceId
        );
        const esFrontal = (label: string) => /front|facetime|user|webcam/i.test(label);
        const traseras = dispositivos.filter((d) => d.deviceId && !esFrontal(d.label));
        if (token !== iniciarTokenRef.current) return;
        const deviceIdActual = track?.getSettings?.().deviceId ?? "";
        // Sondear solo si hay >1 candidata (iOS suele exponer una sola)
        if (traseras.length > 1) {
          const sondas: LenteDisponible[] = [];
          for (const d of traseras.slice(0, 4)) {
            if (token !== iniciarTokenRef.current) return;
            const s = await sondearLente(d.deviceId);
            if (s) sondas.push(s);
          }
          if (token !== iniciarTokenRef.current) return;
          if (sondas.length > 0) {
            setLentes(sondas);
            // Auto-elección: descarta ultra/macro/tele y puntúa por
            // resolución máxima del sensor. La lista COMPLETA queda
            // disponible para el switch manual del operador.
            const elegibles = sondas.filter((s) => !s.descartadaAuto);
            const candidatas = elegibles.length > 0 ? elegibles : sondas;
            const ganadora = candidatas.reduce((a, b) =>
              b.maxAncho * b.maxAlto > a.maxAncho * a.maxAlto ? b : a
            );
            const idxGanadora = sondas.findIndex((s) => s.deviceId === ganadora.deviceId);
            if (ganadora.deviceId && ganadora.deviceId !== deviceIdActual) {
              const definitivo = await abrirLente(
                ganadora.deviceId,
                ganadora.maxAncho,
                ganadora.maxAlto
              );
              if (token !== iniciarTokenRef.current) {
                definitivo?.getTracks().forEach((t) => t.stop());
                return;
              }
              if (definitivo) {
                stream.getTracks().forEach((t) => t.stop());
                streamRef.current = definitivo;
                const nuevoTrack = definitivo.getVideoTracks()[0] ?? null;
                trackRef.current = nuevoTrack;
                setTorchSoportado(Boolean(capsDe(nuevoTrack).torch));
                setResDebug({
                  w: nuevoTrack?.getSettings?.().width ?? ganadora.maxAncho,
                  h: nuevoTrack?.getSettings?.().height ?? ganadora.maxAlto,
                });
              }
            }
            if (idxGanadora >= 0) setLenteIdx(idxGanadora);
          }
        }
      } catch {
        /* sondas fallidas: queda el stream exploratorio (degradación honesta) */
      } finally {
        if (token === iniciarTokenRef.current) setSondeando(false);
      }
    } catch (err) {
      if (token !== iniciarTokenRef.current) return;
      setMotivoError(clasificarError(err));
      setEstado("no-disponible");
    }
  }, [clasificarError, capsDe, sondearLente, abrirLente]);

  /** D-01: cicla a la siguiente lente trasera detectada */
  const cambiarLente = useCallback(() => {
    if (lentes.length < 2 || sondeando) return;
    const token = ++iniciarTokenRef.current;
    setSondeando(true);
    const siguiente = (lenteIdx + 1) % lentes.length;
    const lente = lentes[siguiente];
    void (async () => {
      try {
        const nuevo = await abrirLente(lente.deviceId, lente.maxAncho, lente.maxAlto);
        if (!nuevo || token !== iniciarTokenRef.current) {
          nuevo?.getTracks().forEach((t) => t.stop());
          if (token === iniciarTokenRef.current) {
            avisarFlash("NO SE PUDO CAMBIAR DE CÁMARA");
            setSondeando(false);
          }
          return;
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = nuevo;
        const nuevoTrack = nuevo.getVideoTracks()[0] ?? null;
        trackRef.current = nuevoTrack;
        setLenteIdx(siguiente);
        // D-02: el nuevo track no hereda el flash encendido
        setTorch(false);
        setTorchSoportado(Boolean(capsDe(nuevoTrack).torch));
        setResDebug({
          w: nuevoTrack?.getSettings?.().width ?? lente.maxAncho,
          h: nuevoTrack?.getSettings?.().height ?? lente.maxAlto,
        });
        setEstado("activa");
      } finally {
        if (token === iniciarTokenRef.current) setSondeando(false);
      }
    })();
  }, [lentes, lenteIdx, sondeando, abrirLente, capsDe, avisarFlash]);

  useEffect(() => {
    if (activo) void iniciar();
    else detener();
    return detener;
  }, [activo, iniciar, detener]);

  // FIX VISOR EN NEGRO: el <video> se monta en el DOM cuando estado pasa
  // a «activa», de modo que el stream debe engancharse DESPUÉS del montaje.
  // Antes la asignación ocurría con el nodo aún inexistente (videoRef null)
  // y la cámara quedaba encendida pero sin imagen en el visor.
  useEffect(() => {
    if (estado !== "activa") return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    void video.play().catch(() => undefined);
  }, [estado, activo]);

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

  // D-02: toggleTorch con capabilities, feedback y estado honesto
  const toggleTorch = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    if (!torchSoportado) {
      setTorch(false);
      avisarFlash("EL FLASH NO ESTÁ DISPONIBLE");
      return;
    }
    const nuevo = !torch;
    track
      .applyConstraints({
        advanced: [{ torch: nuevo }],
      } as unknown as MediaTrackConstraints)
      .then(() => setTorch(nuevo))
      .catch(() => {
        setTorch(false);
        avisarFlash("EL FLASH NO ESTÁ DISPONIBLE");
      });
  }, [torch, torchSoportado, avisarFlash]);

  return {
    videoRef,
    estado,
    motivoError,
    torch,
    torchSoportado,
    avisoFlash,
    toggleTorch,
    calidad,
    qrVivo,
    lentes,
    lenteIdx,
    cambiarLente,
    sondeando,
    resDebug,
    reintentar: iniciar,
  };
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
  const [enIframe] = useState(
    () => typeof window !== "undefined" && window.self !== window.top
  );
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

  // ---------------- Detección de bordes EN VIVO (rol A) ----------------
  // Puerto del marco del web-scanner: el worker analiza frames
  // reducidos (~320px, barato) y pinta el cuadrilátero del acta
  // sobre el visor. NO toca el hook de cámara (fix Task 10) ni el
  // k-de-n: es una capa de guía visual para el operador.
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const analizandoFrameRef = useRef(false);
  const capturandoOverlayRef = useRef(false);
  const [quadVivo, setQuadVivo] = useState<QuadNormalizado | null>(null);
  capturandoOverlayRef.current = capturando;

  useEffect(() => {
    if (cam.estado !== "activa") {
      setQuadVivo(null);
      return;
    }
    const dibujar = (quad: QuadNormalizado | null) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const video = cam.videoRef.current;
      const cw = overlay.clientWidth;
      const ch = overlay.clientHeight;
      if (cw < 2 || ch < 2) return;
      if (overlay.width !== cw || overlay.height !== ch) {
        overlay.width = cw;
        overlay.height = ch;
      }
      const c2 = overlay.getContext("2d");
      if (!c2) return;
      c2.clearRect(0, 0, cw, ch);
      if (!quad || !video?.videoWidth) return;
      // Mapeo object-cover: el video cubre el contenedor recortando
      const escala = Math.max(cw / video.videoWidth, ch / video.videoHeight);
      const dw = video.videoWidth * escala;
      const dh = video.videoHeight * escala;
      const ox = (cw - dw) / 2;
      const oy = (ch - dh) / 2;
      const px = (p: { x: number; y: number }) => ({
        x: ox + p.x * dw,
        y: oy + p.y * dh,
      });
      const a = px(quad[0]);
      const b = px(quad[1]);
      const c = px(quad[2]);
      const d = px(quad[3]);
      // Oscurecer el exterior del acta (guía tipo web-scanner)
      c2.save();
      c2.fillStyle = "rgba(0,0,0,0.35)";
      c2.beginPath();
      c2.rect(0, 0, cw, ch);
      c2.moveTo(a.x, a.y);
      c2.lineTo(b.x, b.y);
      c2.lineTo(c.x, c.y);
      c2.lineTo(d.x, d.y);
      c2.closePath();
      c2.fill("evenodd");
      c2.restore();
      // Borde del acta detectada
      c2.beginPath();
      c2.moveTo(a.x, a.y);
      c2.lineTo(b.x, b.y);
      c2.lineTo(c.x, c.y);
      c2.lineTo(d.x, d.y);
      c2.closePath();
      c2.strokeStyle = "#4be277";
      c2.lineWidth = 2.5;
      c2.shadowColor = "#4be277";
      c2.shadowBlur = 8;
      c2.stroke();
      c2.shadowBlur = 0;
    };
    const tick = async () => {
      if (analizandoFrameRef.current || capturandoOverlayRef.current) return;
      const video = cam.videoRef.current;
      if (!video || !video.videoWidth) return;
      analizandoFrameRef.current = true;
      try {
        const LADO = 320;
        const escala = Math.min(1, LADO / Math.max(video.videoWidth, video.videoHeight));
        const w = Math.max(1, Math.round(video.videoWidth * escala));
        const h = Math.max(1, Math.round(video.videoHeight * escala));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const c2 = canvas.getContext("2d", { willReadFrequently: true });
        if (!c2) return;
        c2.drawImage(video, 0, 0, w, h);
        const frame = c2.getImageData(0, 0, w, h);
        const quad = await detectarQuadEnWorker(frame.data, w, h);
        if (capturandoOverlayRef.current) return;
        dibujar(quad);
        setQuadVivo(quad);
      } catch {
        /* sin overlay esta ronda: no bloquea nada */
      } finally {
        analizandoFrameRef.current = false;
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 600);
    return () => {
      window.clearInterval(timer);
      setQuadVivo(null);
    };
  }, [cam.estado, cam.videoRef]);

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

        // 3. F-RES-PRIORITY (rol A): el FRAME COMPLETO manda — se
        //    pasa a resolución del track (JPEG 0.95). El pipeline del
        //    escáner (cap por benchmark + warp + B/N) hace el resto;
        //    comprimir aquí a 1600px destruiría el OCR del código X.
        const dataUrl = canvas.toDataURL("image/jpeg", 0.95);

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
      // Importación robusta (rol A): EXIF nativo + HEIC vía libheif
      const dataUrl = await archivoACapturaDataUrl(file);
      // QR desde la galería también (actas escaneadas previamente)
      let qrTexto: string | null = null;
      try {
        const dec = await decodeQrDeDataUrl(dataUrl);
        if (dec.texto) qrTexto = dec.texto;
      } catch {
        /* sin QR: flujo VLM/contingencia */
      }
      onCapturaRef.current(dataUrl, qrTexto);
    } catch {
      const heic = /\.hei[cf]$/i.test(file?.name ?? "") || (file?.type ?? "").includes("hei");
      setErrorLocal(
        heic
          ? "NO SE PUDO CONVERTIR EL HEIC · REINTENTE CON CONEXIÓN"
          : "NO SE PUDO PROCESAR LA IMAGEN · REINTENTE"
      );
      capturandoRef.current = false;
      setCapturando(false);
    }
  };

  const mostrarDisparo =
    (modoManual || escapeManual) && cam.estado !== "no-disponible";
  const mostrarFallback = cam.estado === "no-disponible";

  // D-01: chip DEBUG RES temporal (4 s tras abrir/cambiar de lente)
  const [chipResVisible, setChipResVisible] = useState(false);
  useEffect(() => {
    if (!cam.resDebug || !cam.resDebug.w) {
      setChipResVisible(false);
      return;
    }
    setChipResVisible(true);
    const t = window.setTimeout(() => setChipResVisible(false), 4000);
    return () => window.clearTimeout(t);
  }, [cam.resDebug]);

  // Mensaje accionable según el motivo del fallo de cámara
  const infoErrorCamara = useMemo(() => {
    switch (cam.motivoError) {
      case "no-soportado":
        return {
          titulo: "CÁMARA NO SOPORTADA",
          detalle:
            "Este contexto de navegación no permite usar la cámara (requiere HTTPS). Abra la app en una pestaña nueva del navegador.",
        };
      case "permiso":
        return {
          titulo: "PERMISO DE CÁMARA BLOQUEADO",
          detalle: enIframe
            ? "La app corre dentro de un marco embebido. Use el botón «Abrir en pestaña nueva» (sobre el panel de vista previa) y cuando el navegador pida el acceso seleccione PERMITIR."
            : "De permiso a la cámara: icono de candado junto a la dirección → Cámara → Permitir, y presione REINTENTAR.",
        };
      case "sin-camara":
        return {
          titulo: "SIN CÁMARA DETECTADA",
          detalle:
            "No se encontró ninguna cámara conectada a este dispositivo.",
        };
      case "ocupada":
        return {
          titulo: "CÁMARA OCUPADA",
          detalle:
            "Otra aplicación está usando la cámara. Ciérrela y presione REINTENTAR.",
        };
      default:
        return {
          titulo: "CÁMARA NO DISPONIBLE",
          detalle:
            "No se pudo iniciar la cámara. Reintente o cargue la foto del acta desde la galería o el archivo.",
        };
    }
  }, [cam.motivoError, enIframe]);

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
        <div className="flex items-center gap-1 shrink-0">
          {/* D-01: cambio de cámara entre las lentes traseras detectadas */}
          {cam.lentes.length > 1 && (
            <button
              type="button"
              onClick={cam.cambiarLente}
              disabled={cam.sondeando}
              aria-label="Cambiar cámara"
              title={`CÁMARA ${cam.lenteIdx + 1} DE ${cam.lentes.length}${cam.lenteIdx >= 0 ? ` · ${cam.lentes[cam.lenteIdx]?.label || "TRASERA"}` : ""}`}
              className="p-2 rounded-full text-primary hover:bg-surface-variant transition-colors active:scale-95 disabled:opacity-40"
            >
              {cam.sondeando ? (
                <Loader2 size={22} className="animate-spin" aria-hidden />
              ) : (
                <SwitchCamera size={22} aria-hidden />
              )}
            </button>
          )}
          {/* D-02: flash deshabilitado (no oculto) si el track no lo soporta */}
          <button
            type="button"
            onClick={cam.toggleTorch}
            disabled={cam.estado !== "activa" || !cam.torchSoportado}
            aria-label={cam.torch ? "Desactivar flash" : "Activar flash"}
            aria-pressed={cam.torch}
            title={
              cam.estado === "activa" && !cam.torchSoportado
                ? "FLASH NO SOPORTADO EN ESTE DISPOSITIVO"
                : undefined
            }
            className={`p-2 rounded-full transition-colors active:scale-95 ${
              cam.torch
                ? "text-primary bg-primary/15"
                : "text-primary hover:bg-surface-variant"
            } disabled:opacity-40`}
          >
            <Zap size={22} fill={cam.torch ? "currentColor" : "none"} aria-hidden />
          </button>
        </div>
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

        {/* Overlay de detección de bordes EN VIVO (rol A) */}
        {cam.estado === "activa" && (
          <canvas
            ref={overlayRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-[5]"
            aria-hidden
          />
        )}

        {/* D-01: chip DEBUG RES temporal (resolución real del track) */}
        {chipResVisible && cam.resDebug && cam.resDebug.w > 0 && (
          <div className="absolute top-2 left-2 z-20 bg-black/70 text-primary/90 font-label-caps text-[10px] px-2 py-0.5 rounded border border-primary/30 pointer-events-none">
            DEBUG RES {cam.resDebug.w}×{cam.resDebug.h}
          </div>
        )}

        {/* D-02: aviso breve de flash no disponible (expira a 2 s) */}
        {cam.avisoFlash && (
          <div
            role="status"
            className="absolute top-12 left-1/2 -translate-x-1/2 z-20 bg-black/80 text-[#ffb84d] font-label-caps text-[11px] px-3 py-1.5 rounded-full border border-[#ffb84d]/40 pointer-events-none whitespace-nowrap"
          >
            {cam.avisoFlash}
          </div>
        )}

        {/* Iniciando cámara: mientras el navegador pide el permiso */}
        {cam.estado === "iniciando" && (
          <div className="absolute inset-0 z-30 bg-surface-container-lowest/90 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Loader2 size={32} className="animate-spin text-primary" aria-hidden />
            <span className="font-label-caps text-label-caps text-primary" role="status">
              INICIANDO CÁMARA…
            </span>
            <span className="text-body-md text-on-surface-variant max-w-[300px]">
              Si el navegador solicita permiso, seleccione PERMITIR para
              habilitar la digitalización por cámara.
            </span>
          </div>
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
                ) : quadVivo ? (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/15 border border-primary/50 text-primary font-label-caps text-[11px]">
                    <ScanLine size={13} aria-hidden />
                    ACTA ENCUADRADA · ENFOQUE Y MANTÉN
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-black/60 border border-outline-variant text-on-surface-variant font-label-caps text-[10px] tracking-wide">
                    BUSCANDO ACTA · ENCUADRA EL FORMULARIO COMPLETO
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
              {infoErrorCamara.titulo}
            </span>
            <span className="text-body-md text-on-surface-variant max-w-[280px]">
              {infoErrorCamara.detalle}
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
