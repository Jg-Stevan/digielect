// ============================================================
// DIGIELECT · Cliente del worker de escáner (rol A)
// Puerto del patrón de web-scanner: el motor vive en
// public/e14/deteccion-worker.js (plano, autocontenido) y este
// cliente gestiona su ciclo de vida con:
//   · init perezosa singleton (con withBasePath para Pages)
//   · una promesa por mensaje (id secuencial)
//   · timeout por operación + re-creación del worker si se cuelga
//   · degradación honesta: si el worker no está disponible se
//     devuelve null y el llamador cae a su respaldo (nunca
//     bloquear la UI — convenio docs/agentes/CONVENIOS.md §3).
// ============================================================

import { withBasePath } from "@/lib/env";

/** Punto normalizado 0-1 dentro del frame */
export interface PuntoNorm {
  x: number;
  y: number;
}

/** Cuadrilátero normalizado en orden [TL, TR, BR, BL] */
export type QuadNormalizado = [PuntoNorm, PuntoNorm, PuntoNorm, PuntoNorm];

/** Métricas 0-1 que produce el worker sobre el gris pre-binarización */
export interface CalidadImagen {
  nitidez: number;
  contraste: number;
  brillo: number;
}

interface Pendiente {
  resolve: (v: unknown) => void;
  timer: number;
}

let workerProm: Promise<Worker | null> | null = null;
let seq = 0;
const pendientes = new Map<number, Pendiente>();

/**
 * Versión del motor: invalida la caché HTTP del Worker cuando el
 * archivo en /public cambia (patrón web-scanner).
 */
const VERSION_WORKER = "4";

function crearWorker(): Promise<Worker | null> {
  if (workerProm) return workerProm;
  workerProm = new Promise<Worker | null>((resolve) => {
    try {
      if (typeof Worker === "undefined") {
        resolve(null);
        return;
      }
      const w = new Worker(
        `${withBasePath("/e14/deteccion-worker.js")}?v=${VERSION_WORKER}`
      );
      w.onmessage = (e: MessageEvent) => {
        const msg = e.data as { id?: number } | null;
        const id = msg?.id;
        if (typeof id !== "number") return;
        const p = pendientes.get(id);
        if (!p) return;
        pendientes.delete(id);
        window.clearTimeout(p.timer);
        p.resolve(msg);
      };
      w.onerror = () => {
        // Fallo fatal del script: liberar todos los pendientes con null
        for (const [, p] of pendientes) {
          window.clearTimeout(p.timer);
          p.resolve(null);
        }
        pendientes.clear();
        w.terminate();
        workerProm = null;
      };
      resolve(w);
    } catch {
      resolve(null);
    }
  });
  return workerProm;
}

function matarWorker() {
  void crearWorker().then((w) => {
    if (w) w.terminate();
  });
  workerProm = null;
  for (const [, p] of pendientes) {
    window.clearTimeout(p.timer);
    p.resolve(null);
  }
  pendientes.clear();
}

/**
 * Envía un mensaje al worker y espera su respuesta por id.
 * Devuelve null en timeout o si el worker no está disponible.
 */
async function llamarWorker<T>(
  msg: Record<string, unknown>,
  transfer: Transferable[],
  timeoutMs: number
): Promise<T | null> {
  const w = await crearWorker();
  if (!w) return null;
  const id = ++seq;
  return new Promise<T | null>((resolve) => {
    const timer = window.setTimeout(() => {
      pendientes.delete(id);
      matarWorker(); // el worker quedó colgado: re-crear en la próxima
      resolve(null);
    }, timeoutMs);
    pendientes.set(id, {
      resolve: resolve as (v: unknown) => void,
      timer,
    });
    try {
      w.postMessage({ ...msg, id }, transfer);
    } catch {
      window.clearTimeout(timer);
      pendientes.delete(id);
      resolve(null);
    }
  });
}

/**
 * Detecta el cuadrilátero del acta en un frame REDUCIDO (~320px).
 * `buf` se transfiere (queda inutilizado en el llamador).
 */
export function detectarQuadEnWorker(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  timeoutMs = 2500
): Promise<QuadNormalizado | null> {
  const buf = rgba.buffer.slice(0) as ArrayBuffer;
  return llamarWorker<{ ok: boolean; quad: QuadNormalizado | null }>(
    { op: "detectar", buf, w, h },
    [buf],
    timeoutMs
  ).then((r) => (r && r.ok ? r.quad : null));
}

export interface ResultadoProcesado {
  data: Uint8ClampedArray<ArrayBuffer>;
  w: number;
  h: number;
  calidad: CalidadImagen;
}

/**
 * Pipeline pesado en el worker: warp de perspectiva + métricas +
 * B/N adaptativo. `rgba` se transfiere (queda inutilizado).
 */
export function procesarEnWorker(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  quad: QuadNormalizado | null,
  targetLongSide: number,
  timeoutMs = 20000
): Promise<ResultadoProcesado | null> {
  const buf = rgba.buffer.slice(0) as ArrayBuffer;
  return llamarWorker<{
    ok: boolean;
    buf: ArrayBuffer;
    w: number;
    h: number;
    calidad: CalidadImagen;
  }>(
    { op: "procesar", buf, w, h, quad, targetLongSide },
    [buf],
    timeoutMs
  ).then((r) => {
    if (!r || !r.ok || !r.buf) return null;
    return {
      data: new Uint8ClampedArray(r.buf),
      w: r.w,
      h: r.h,
      calidad: r.calidad,
    };
  });
}
