"use client";

// ============================================================
// DIGITALIZADOR E-14 — Cámara v2 (puerto fiel del mecanismo de
// web-scanner v6.2 que ya funcionó en teléfonos reales):
//   · F-LENS: sondas SECUENCIALES de cámaras (cerrar SIEMPRE el
//     MediaStream antes de abrir la siguiente — el bug v3 fue
//     sondear con streams vivos → NotReadableError en Android).
//   · Apertura con SOLO width:{ideal:3840} (E3, sin over-constrain).
//   · Linterna verificada: apply + comprobar getSettings().torch
//     + deshacer el "flash fantasma" (F-FLASH).
//   · Frame loop con requestVideoFrameCallback (fallback rAF),
//     backpressure por DESCARTE (nunca cola), quad vivo del
//     worker y score compuesto 0.4·nitidez + 0.3·exposición
//     + 0.3·estabilidad (k-de-n para autocaptura).
//   · Captura WYSIWYG: la foto ES el fotograma del <video> (la
//     MISMA lente angular que muestra la vista previa, a la
//     resolución nativa del stream). Sin takePhoto: en Android
//     el ImageCapture dispara con otra lente (gran angular) y
//     el recuadro capturado no coincide con lo que ve el
//     operador. iOS sin ImageCapture → cámara nativa.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { detectarFrameRgba } from "./escaner";
import type { Quad } from "./escaner";

// ------------------------------------------------------------
// Constantes de la especificación
// ------------------------------------------------------------
const IDEAL_CAPTURE_WIDTH = 3840; // E3: SOLO ancho ideal
const FRONT_CAMERA_RE = /front|delantera|anterior|face|facial|selfie/i;
const LENS_WORDS_RE = /ultra|gran angular|wide|angular|tele|teleobjetivo/i;
const REAL_AF_MODES = new Set(["continuous", "single-shot"]);

const FRAME_MAX = 400;        // lado mayor del frame para detección
const TELEMETRIA_MS = 100;    // ~10 Hz hacia la UI
const SHUTTER_SCORE = 0.8;    // k-de-n
const SHUTTER_K = 4;
const SHUTTER_N = 6;
const SHUTTER_SPAN_MS = 1200;
const CAPTURE_COOLDOWN_MS = 1500;

export interface EstadoCamara {
  /** null = iniciando | "lista" | "denegada" | "error" | "nodispositivo" */
  estado: "iniciando" | "lista" | "denegada" | "error" | "nodispositivo";
  mensaje: string | null;
  /** Quad detectado en vivo (normalizado) o null */
  quadVivo: Quad | null;
  /** Score compuesto 0-1 (telemetría ~10 Hz) */
  scoreVivo: number | null;
  /** Autocaptura lista para disparar (k-de-n armado y sobre umbral) */
  armada: boolean;
  torchOn: boolean;
  esCamaraReal: boolean;
  /** iOS/Safari sin ImageCapture → el shutter abre la cámara nativa */
  usarCamaraNativa: boolean;
}

export interface OpcionesCamara {
  activa: boolean;
  /** Disparo automático por calidad (k-de-n) */
  autocaptura?: boolean;
  /** Ref del <video> (creado por el componente, patrón canónico) */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Recibe la foto del sensor (o el mejor frame) ya en data URL */
  alCapturar: (dataUrl: string) => void;
}

interface HistorialMuestra {
  ts: number;
  score: number;
}

export function useCamara(opts: OpcionesCamara) {
  const { activa, autocaptura = true, alCapturar, videoRef } = opts;

  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const rafRef = useRef<number | null>(null);
  const nonceRef = useRef(0);
  const procesandoRef = useRef(false);
  const cooldownRef = useRef(0);
  const historialRef = useRef<HistorialMuestra[]>([]);
  const quadHistRef = useRef<{ ts: number; quad: Quad }[]>([]);
  const rearmRef = useRef(false);
  const ultimoQuadRef = useRef<Quad | null>(null);
  const workerBusyRef = useRef(false);

  const [estadoCamara, setEstadoCamara] = useState<EstadoCamara>({
    estado: "iniciando",
    mensaje: null,
    quadVivo: null,
    scoreVivo: null,
    armada: false,
    torchOn: false,
    esCamaraReal: false,
    usarCamaraNativa: false,
  });
  const estadoRef = useRef(estadoCamara);
  const alCapturarRef = useRef(alCapturar);
  const autocapturaRef = useRef(autocaptura);

  // Sincronizar refs fuera del render (eventos/loops leen siempre el valor vigente)
  useEffect(() => {
    estadoRef.current = estadoCamara;
    alCapturarRef.current = alCapturar;
    autocapturaRef.current = autocaptura;
  }, [estadoCamara, alCapturar, autocaptura]);

  /** Callback ref del <video>: asigna el elemento al ref externo */
  const setVideoElement = useCallback(
    (el: HTMLVideoElement | null) => {
      videoRef.current = el;
    },
    [videoRef]
  );

  const setParcial = useCallback((p: Partial<EstadoCamara>) => {
    setEstadoCamara((s) => ({ ...s, ...p }));
  }, []);

  const detener = useCallback(() => {
    nonceRef.current++;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current = null;
    workerBusyRef.current = false;
    historialRef.current = [];
    quadHistRef.current = [];
    ultimoQuadRef.current = null;
    rearmRef.current = false;
  }, []);

  // ----------------------------------------------------------
  // Apertura de cámara (mecanismo v2)
  // ----------------------------------------------------------

  /** getUserMedia con límite de tiempo (un prompt colgado no debe congelar la app) */
  const gumConLimite = useCallback(async (constraints: MediaStreamConstraints, ms: number): Promise<MediaStream> => {
    return Promise.race([
      navigator.mediaDevices.getUserMedia(constraints),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new DOMException("getUserMedia timeout", "TimeoutError")), ms)
      ),
    ]);
  }, []);

  /** F-LENS v4: desbloquear labels, sondear SECUENCIAL, elegir trasera ganadora */
  const abrirCamaraPrincipal = useCallback(async (): Promise<{ stream: MediaStream; track: MediaStreamTrack } | null> => {
    if (!navigator.mediaDevices?.enumerateDevices) return null;
    try {
      // Desbloqueo de labels: abrir y cerrar inmediatamente
      const desbloqueo = await gumConLimite({ video: true }, 6000);
      desbloqueo.getTracks().forEach((t) => t.stop());
    } catch {
      return null; // sin permiso: deja que la cascada lo gestione
    }

    let devices: MediaDeviceInfo[];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {
      return null;
    }
    const videoinputs = devices.filter((d) => d.kind === "videoinput");
    if (videoinputs.length === 0) return null;

    interface Sonda {
      deviceId: string;
      label: string;
      af: boolean;
      torch: boolean;
      ancho: number;
      alto: number;
    }
    const sondas: Sonda[] = [];

    // Sondas SECUENCIALES: cerrar SIEMPRE el stream antes de la siguiente
    for (const d of videoinputs) {
      let stream: MediaStream | null = null;
      try {
        stream = await gumConLimite(
          { video: { deviceId: { exact: d.deviceId } }, audio: false },
          6000
        );
        const track = stream.getVideoTracks()[0];
        if (!track) continue;
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
          torch?: boolean;
          focusMode?: string[];
        };
        const settings = track.getSettings?.() ?? {};
        sondas.push({
          deviceId: d.deviceId,
          label: d.label ?? "",
          af: (caps.focusMode ?? []).some((m) => REAL_AF_MODES.has(m)),
          torch: Boolean(caps.torch),
          ancho: caps.width?.max ?? settings.width ?? 1280,
          alto: caps.height?.max ?? settings.height ?? 720,
        });
      } catch {
        // dispositivo no abrible: se ignora
      } finally {
        stream?.getTracks().forEach((t) => t.stop());
        stream = null;
      }
    }

    // chooseMainProbe: traseras que no matcheen frontal
    const traseras = sondas.filter((s) => !FRONT_CAMERA_RE.test(s.label));
    const candidatas = traseras.length > 0 ? traseras : sondas;
    if (candidatas.length === 0) return null;

    let ganadora: Sonda;
    if (candidatas.some((s) => s.af)) {
      // con AF real: la de mayor resolución de sensor (torch desempata)
      ganadora = candidatas
        .filter((s) => s.af)
        .sort((a, b) => b.ancho * b.alto - a.ancho * a.alto || Number(b.torch) - Number(a.torch))[0];
    } else {
      // típico iOS: filtrar lentes por label, menos palabras = principal
      const simples = candidatas.filter((s) => !LENS_WORDS_RE.test(s.label));
      const pool = simples.length > 0 ? simples : candidatas;
      ganadora = pool.sort(
        (a, b) =>
          (a.label.match(/\s/g)?.length ?? 0) - (b.label.match(/\s/g)?.length ?? 0) ||
          b.ancho * b.alto - a.ancho * a.alto
      )[0];
    }

    // Abrir SOLO la ganadora con cascada
    const intentos: MediaStreamConstraints[] = [
      { video: { deviceId: { exact: ganadora.deviceId }, width: { ideal: IDEAL_CAPTURE_WIDTH } }, audio: false },
      { video: { deviceId: { exact: ganadora.deviceId } }, audio: false },
    ];
    for (const c of intentos) {
      try {
        const stream = await gumConLimite(c, 5000);
        const track = stream.getVideoTracks()[0];
        if (!track) throw new Error("sin track");
        return { stream, track };
      } catch {
        // siguiente intento
      }
    }
    return null;
  }, [gumConLimite]);

  /** Cascada de emergencia (E3/E4): facingMode environment → video genérico */
  const abrirConCascada = useCallback(async (): Promise<{ stream: MediaStream; track: MediaStreamTrack }> => {
    const cascadas: MediaStreamConstraints[] = [
      { video: { facingMode: { exact: "environment" }, width: { ideal: IDEAL_CAPTURE_WIDTH } }, audio: false },
      { video: { facingMode: "environment", width: { ideal: IDEAL_CAPTURE_WIDTH } }, audio: false },
      { video: { facingMode: "environment" }, audio: false },
      { video: true, audio: false },
    ];
    const inicio = Date.now();
    let ultimoError: unknown = null;
    for (const c of cascadas) {
      if (Date.now() - inicio > 14000) break; // no eternizarse
      try {
        const stream = await gumConLimite(c, 5000);
        const track = stream.getVideoTracks()[0];
        if (!track) throw new Error("sin track de video");
        return { stream, track };
      } catch (e) {
        ultimoError = e;
      }
    }
    throw ultimoError ?? new Error("getUserMedia falló");
  }, [gumConLimite]);

  // ----------------------------------------------------------
  // Linterna (F-FLASH v3): aplicar + verificar + deshacer fantasma
  // ----------------------------------------------------------
  const encenderTorch = useCallback(async (on: boolean): Promise<boolean> => {
    const track = trackRef.current;
    if (!track) return false;
    try {
      // advanced = best-effort (no rechaza aunque no soporte)
      await track.applyConstraints({
        advanced: [{ torch: on }],
      } as unknown as MediaTrackConstraints);
      // verificar con getSettings (el "flash fantasma" se descubre aquí)
      const settings = track.getSettings?.() as MediaTrackSettings & { torch?: boolean };
      if (on && settings.torch !== true) {
        // deshacer para no dejar LED fantasma
        await track.applyConstraints({
          advanced: [{ torch: false }],
        } as unknown as MediaTrackConstraints);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const alternarTorch = useCallback(async () => {
    if (!trackRef.current || !estadoRef.current.esCamaraReal) return;
    const on = !estadoRef.current.torchOn;
    const ok = await encenderTorch(on);
    if (ok) {
      setParcial({ torchOn: on });
    } else {
      setParcial({ torchOn: false });
      toast({
        title: "No se pudo controlar la linterna aquí",
        description:
          "Causas típicas: navegador sin soporte (en iPhone usa Safari 17.4 o posterior), cámara sin LED (gran angular o macro) o la app corre dentro de otra app. Cierra y vuelve a abrir el escáner.",
        duration: 8000,
      });
    }
  }, [encenderTorch, setParcial]);

  /** Reintentos de torch tras abrir: 0/250/700/1500 ms */
  const reaplicarTorch = useCallback(async () => {
    if (!estadoRef.current.torchOn) return;
    for (const ms of [0, 250, 700, 1500]) {
      await new Promise((r) => setTimeout(r, ms));
      if (await encenderTorch(true)) {
        setParcial({ torchOn: true });
        return;
      }
    }
  }, [encenderTorch, setParcial]);

  // ----------------------------------------------------------
  // Score k-de-n
  // ----------------------------------------------------------
  const registrarMuestra = useCallback((score: number): boolean => {
    const ahora = Date.now();
    const h = historialRef.current;
    h.push({ ts: ahora, score });
    while (h.length > 0 && ahora - h[0].ts > SHUTTER_SPAN_MS) h.shift();
    if (h.length > SHUTTER_N * 2) h.splice(0, h.length - SHUTTER_N * 2);

    if (rearmRef.current) {
      // re-arm: exige score ≤0.8 (no vaciar quadHistory)
      if (score <= SHUTTER_SCORE) rearmRef.current = false;
      else return false;
    }
    const recientes = h.filter((m) => ahora - m.ts <= SHUTTER_SPAN_MS);
    const sobreUmbral = recientes.filter((m) => m.score > SHUTTER_SCORE).length;
    const ultima = recientes[recientes.length - 1];
    return (
      sobreUmbral >= SHUTTER_K &&
      recientes.length >= SHUTTER_K &&
      ultima != null &&
      ultima.score > SHUTTER_SCORE
    );
  }, []);

  const notificarCapturado = useCallback(() => {
    historialRef.current = [];
    rearmRef.current = true;
    cooldownRef.current = Date.now() + CAPTURE_COOLDOWN_MS;
  }, []);

  // ----------------------------------------------------------
  // Captura WYSIWYG (F-LENS-CAPTURE): el fotograma del <video>
  // ES la foto. Misma lente (angular) y MISMO encuadre que la
  // vista previa en vivo — lo que el operador ve es lo que se
  // digitaliza — a la resolución nativa del stream (ideal 3840).
  // ----------------------------------------------------------
  const capturar = useCallback(async (): Promise<void> => {
    const video = videoRef.current;
    if (!video || !trackRef.current) return;
    if (procesandoRef.current) return;
    if (Date.now() < cooldownRef.current) return;
    procesandoRef.current = true;
    notificarCapturado();
    setParcial({ scoreVivo: null, armada: false });

    try {
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      const canvasA = document.createElement("canvas");
      canvasA.width = vw;
      canvasA.height = vh;
      const ctxA = canvasA.getContext("2d", { willReadFrequently: true });
      if (!ctxA) throw new Error("canvas");
      ctxA.drawImage(video, 0, 0, vw, vh);
      const dataUrl = await lienzoADataUrl(canvasA);
      // R-14: soltar el backing store YA
      canvasA.width = 0;
      canvasA.height = 0;
      if (!dataUrl) throw new Error("No se pudo capturar");
      alCapturarRef.current(dataUrl);
    } catch {
      toast({
        title: "No se pudo capturar",
        description: "Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      procesandoRef.current = false;
    }
  }, [notificarCapturado, setParcial]);

  /** Disparo manual (shutter). Devuelve true si debe abrir cámara nativa. */
  const dispararManual = useCallback((): boolean => {
    if (estadoRef.current.usarCamaraNativa) return true;
    void capturar();
    return false;
  }, [capturar]);

  // ----------------------------------------------------------
  // Frame loop (requestVideoFrameCallback, fallback rAF)
  // ----------------------------------------------------------
  const iniciarFrameLoop = useCallback(
    (nonce: number) => {
      const liberarCanvas = (canvas: HTMLCanvasElement) => {
        canvas.width = 0;
        canvas.height = 0;
      };
      let ultTelemetria = 0;

      const procesarFrame = async (video: HTMLVideoElement) => {
        if (nonce !== nonceRef.current) return;
        if (video.readyState < 2 || workerBusyRef.current || procesandoRef.current) {
          // backpressure por DESCARTE: conservar el último quad (sin parpadeo)
          programarSiguiente(video);
          return;
        }
        workerBusyRef.current = true;
        try {
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          if (!vw || !vh) return;
          const escala = Math.min(1, FRAME_MAX / Math.max(vw, vh));
          const w = Math.max(16, Math.round(vw * escala));
          const h = Math.max(16, Math.round(vh * escala));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, w, h);
          const img = ctx.getImageData(0, 0, w, h);

          // métricas locales del MISMO frame (baratas)
          const metricas = metricasDeFrame(img.data, w, h);

          // detección en el worker (si no hay quad nuevo, se conserva el último)
          const buf = img.data.buffer.slice(0) as ArrayBuffer;
          const detectado = await detectarFrameRgba(buf, w, h);
          if (detectado) {
            ultimoQuadRef.current = detectado;
            quadHistRef.current.push({ ts: Date.now(), quad: detectado });
            if (quadHistRef.current.length > 24) quadHistRef.current.shift();
          }
          const quad = ultimoQuadRef.current;
          liberarCanvas(canvas);

          // estabilidad: varianza media de quads de la ventana 600 ms POR TIMESTAMP
          const ahora = Date.now();
          const recientes = quadHistRef.current.filter((q) => ahora - q.ts <= 600);
          let estabilidad = 0.5;
          if (recientes.length >= 2 && quad) {
            let sumaVar = 0;
            for (let i = 1; i < recientes.length; i++) {
              sumaVar += varianzaQuad(recientes[i - 1].quad, recientes[i].quad);
            }
            estabilidad = 1 - Math.min(1, sumaVar / (recientes.length - 1) / 20);
          }

          // excentricidad: penaliza documento pegado al borde
          const excentricidad = quad ? excentricidadDe(quad) : 0.6;
          const score = Math.max(
            0,
            Math.min(
              1,
              (0.4 * metricas.nitidez + 0.3 * metricas.exposicion + 0.3 * estabilidad) * excentricidad
            )
          );

          // telemetría ~10 Hz
          if (ahora - ultTelemetria >= TELEMETRIA_MS) {
            ultTelemetria = ahora;
            const puedeDisparar =
              autocapturaRef.current && Date.now() >= cooldownRef.current && !rearmRef.current;
            setParcial({
              quadVivo: quad,
              scoreVivo: score,
              armada: puedeDisparar && score > SHUTTER_SCORE,
            });
          }

          // disparo k-de-n
          if (autocapturaRef.current && Date.now() >= cooldownRef.current) {
            if (registrarMuestra(score) && !procesandoRef.current) {
              void capturar();
            }
          }
        } catch {
          // el frame falla en silencio
        } finally {
          workerBusyRef.current = false;
          programarSiguiente(video);
        }
      };

      const programarSiguiente = (video: HTMLVideoElement) => {
        if (nonce !== nonceRef.current) return;
        const srv = (video as HTMLVideoElement & {
          requestVideoFrameCallback?: (cb: () => void) => number;
        }).requestVideoFrameCallback;
        if (srv) {
          srv.call(video, () => {
            void procesarFrame(video);
          });
        } else if (rafRef.current == null) {
          const tick = () => {
            if (nonce !== nonceRef.current) return;
            void procesarFrame(video);
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
        }
      };

      const video = videoRef.current;
      if (video) programarSiguiente(video);
    },
    [capturar, registrarMuestra, setParcial]
  );

  // ----------------------------------------------------------
  // Apertura completa
  // ----------------------------------------------------------
  const iniciar = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setParcial({
        estado: "nodispositivo",
        mensaje:
          "Este navegador no soporta acceso a cámara. Cargue la imagen desde la galería o use un acta real de ejemplo.",
      });
      return;
    }
    // Detener PRIMERO (nonce++ + limpieza) y capturar DESPUÉS el nonce vigente
    detener();
    const nonce = ++nonceRef.current;
    setParcial({ estado: "iniciando", mensaje: null, quadVivo: null, scoreVivo: null, armada: false });

    // iOS/Safari sin ImageCapture → cámara nativa en el shutter
    const hayImageCapture = typeof ImageCapture !== "undefined";

    let stream: MediaStream | null = null;
    let track: MediaStreamTrack | null = null;
    try {
      const principal = await abrirCamaraPrincipal();
      if (nonce !== nonceRef.current) return;
      if (principal) {
        stream = principal.stream;
        track = principal.track;
      } else {
        const alternativa = await abrirConCascada();
        if (nonce !== nonceRef.current) {
          alternativa.stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = alternativa.stream;
        track = alternativa.track;
      }
    } catch (e) {
      const err = e as DOMException;
      const denegada = err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
      setParcial({
        estado: denegada ? "denegada" : "error",
        mensaje: denegada
          ? "Permiso de cámara denegado. Cargue la imagen desde la galería o use un acta real de ejemplo."
          : "No se pudo iniciar la cámara. Use la galería o un acta real de ejemplo.",
      });
      return;
    }

    streamRef.current = stream;
    trackRef.current = track;

    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      await video.play().catch(() => undefined);
    }

    // Zoom a 1× (equivale al 0.5× del mismo track; errores ignorados)
    try {
      const caps = track?.getCapabilities?.() as
        | (MediaTrackCapabilities & { zoom?: { min?: number } })
        | undefined;
      if (caps?.zoom && (caps.zoom.min ?? 1) < 1) {
        await track?.applyConstraints({
          advanced: [{ zoom: 1 }],
        } as unknown as MediaTrackConstraints);
      }
    } catch {
      // zoom no soportado
    }

    // track.onended → reconexión completa (B3)
    track?.addEventListener("ended", () => {
      if (nonce !== nonceRef.current) return;
      toast({
        title: "SE PERDIÓ LA CÁMARA",
        description: "Reconectando…",
        variant: "destructive",
      });
      void iniciar();
    });

    setParcial({ estado: "lista", esCamaraReal: true, usarCamaraNativa: !hayImageCapture, mensaje: null });

    if (!hayImageCapture) {
      toast({
        title: "iPhone detectado",
        description: "Para máxima calidad dispara manualmente: el botón abrirá la cámara nativa.",
        duration: 6000,
      });
    }

    void reaplicarTorch();
    iniciarFrameLoop(nonce);
  }, [abrirCamaraPrincipal, abrirConCascada, detener, iniciarFrameLoop, reaplicarTorch, setParcial]);

  // ----------------------------------------------------------
  // Ciclo de vida
  // ----------------------------------------------------------
  useEffect(() => {
    if (activa) void iniciar();
    else detener();
    return () => detener();
  }, [activa, detener, iniciar]);

  return {
    /** Estado puro (sin refs) para renderizar la UI */
    estado: estadoCamara,
    iniciar,
    detener,
    alternarTorch,
    dispararManual,
  };
}

// ------------------------------------------------------------
// Helpers de métricas del frame (baratas, main thread)
// ------------------------------------------------------------

function metricasDeFrame(
  rgba: Uint8ClampedArray,
  w: number,
  h: number
): { nitidez: number; exposicion: number } {
  const n = w * h;
  const gris = new Uint8ClampedArray(n);
  let suma = 0;
  for (let i = 0; i < n; i++) {
    const g = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) | 0;
    gris[i] = g;
    suma += g;
  }

  // Laplaciano (nitidez) — SHARPNESS_NORM = 300 · exposición under/over
  let sl = 0;
  let sl2 = 0;
  let nL = 0;
  let under = 0;
  let over = 0;
  for (let y = 1; y < h - 1; y++) {
    const fila = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = fila + x;
      const lap = 4 * gris[i] - gris[i - 1] - gris[i + 1] - gris[i - w] - gris[i + w];
      sl += lap;
      sl2 += lap * lap;
      nL++;
      if (gris[i] < 30) under++;
      if (gris[i] > 225) over++;
    }
  }
  const varLap = nL > 0 ? sl2 / nL - (sl / nL) * (sl / nL) : 0;
  const nitidez = Math.max(0, Math.min(1, varLap / 300));
  const exposicion = 1 - Math.min(1, (under + over) / n);
  return { nitidez, exposicion };
}

function varianzaQuad(a: Quad, b: Quad): number {
  let suma = 0;
  for (let i = 0; i < 4; i++) {
    const dx = a[i].x - b[i].x;
    const dy = a[i].y - b[i].y;
    suma += dx * dx + dy * dy;
  }
  return suma / 4;
}

/** MIN de las 4 esquinas de dMin/(0.05·ladoCorto) — distancia al borde */
function excentricidadDe(quad: Quad): number {
  const lados = [
    Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y),
    Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y),
    Math.hypot(quad[3].x - quad[2].x, quad[3].y - quad[2].y),
    Math.hypot(quad[0].x - quad[3].x, quad[0].y - quad[3].y),
  ];
  const ladoCorto = Math.min(...lados);
  let minD = 1;
  for (const p of quad) {
    const d = Math.min(p.x, 1 - p.x, p.y, 1 - p.y);
    if (d < minD) minD = d;
  }
  const base = Math.max(0.0001, 0.05 * ladoCorto);
  return Math.max(0.25, Math.min(1, minD / base));
}

async function lienzoADataUrl(canvas: HTMLCanvasElement): Promise<string | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return resolve(null);
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(blob);
      },
      "image/jpeg",
      0.92
    );
  });
}
