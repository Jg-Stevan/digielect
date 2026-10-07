"use client";

// ============================================================
// DIGIELECT · Cliente del DetectionWorker REAL (OpenCV.js 4.5.5)
// [COORD · C-14] Puerto de `detector-client.ts` del fork externo
// (que a su vez es puerto fiel de web-scanner v6.2), adaptado al
// proyecto: worker en `public/scanner/detection-worker.js` con
// withBasePath (GitHub Pages /digielect), mismo protocolo.
//
// El worker contiene el pipeline OpenCV.js completo: Canny 6
// pasadas en cascada → contornos → filtrado de quads convexos →
// selección por score → refinado sub-píxel RANSAC (refineQuad,
// cota 5% diagonal) → shrink 3.5 px → warpPerspective(INTER_CUBIC,
// BORDER_REPLICATE) → modos de realce (B/N Bradley-Roth).
//
// Protocolo (SIN cambios matemáticos):
//   In : detect | warp | enhance | config
//   Out: result | warped | enhanced | busy | boot | ready | error
//   · Corners en FRACCIONES 0–1 por eje, orden TL,TR,BR,BL — el
//     mismo convenio del QuadNormalizado de esta app (invariante
//     ante cualquier resize; el worker los convierte a px).
//   · Backpressure por DESCARTE (nunca encolar en el worker):
//     cola de exclusión local de 1 mensaje en vuelo.
//   · ImageBitmap SIEMPRE transferible (zero-copy).
//   · Self-healing: timeout de arranque 25 s → worker muerto y
//     re-creable; el llamador tiene respaldo (worker casero).
// ============================================================

import { withBasePath } from "@/lib/env";

// ─── Modos y perfiles ───────────────────────────────────────

export type EnhanceMode = "raw" | "color" | "gray" | "natural" | "text" | "bw";

/** Tope sagrado del lado mayor del warp (guía maestra web-scanner) */
export const PROCESSED_MAX_LONG_SIDE = 4032;

// ─── Protocolo de mensajes ──────────────────────────────────

export interface RawQualityInput {
  laplacianVar: number | null;
  cropMean: number | null;
  cropStdDev: number | null;
  frameW: number;
  frameH: number;
  diag?: { contourCount: number };
}

interface DetectRequest {
  type: "detect";
  bitmap: ImageBitmap;
  ts: number;
}

interface WarpRequest {
  type: "warp";
  bitmap: ImageBitmap;
  /** 8 fracciones 0–1, orden TL,TR,BR,BL */
  quad: Float32Array;
  ts: number;
  /** quad del EDITOR MANUAL → sin refine RANSAC ni shrink (F5-MANUAL) */
  manual?: boolean;
}

interface EnhanceRequest {
  type: "enhance";
  bitmap: ImageBitmap;
  mode: EnhanceMode;
  ts: number;
  quality?: number;
  maxLongSide?: number;
}

interface ConfigRequest {
  type: "config";
  maxWarpLongSide?: number;
}

type WorkerIn = DetectRequest | WarpRequest | EnhanceRequest | ConfigRequest;

interface ResultReply {
  type: "result";
  corners: Float32Array | null;
  qualityInput: RawQualityInput;
  ts: number;
}

interface WarpResult {
  type: "warped";
  bitmap: ImageBitmap;
  w: number;
  h: number;
  ts: number;
  refinedQuad: Float32Array | null;
  refined: boolean;
  fellBack: [boolean, boolean, boolean, boolean] | null;
}

interface EnhanceResult {
  type: "enhanced";
  blob: Blob;
  mime: "image/jpeg" | "image/png";
  w: number;
  h: number;
  mode: EnhanceMode;
  elapsedMs: number;
  ts: number;
}

type WorkerOut =
  | ResultReply
  | WarpResult
  | EnhanceResult
  | { type: "busy"; ts: number }
  | { type: "boot"; pct: number }
  | { type: "ready"; probe?: unknown; opencvUrl?: string }
  | { type: "error"; message: string };

// ─── Resultados de alto nivel ───────────────────────────────

export interface DetectOutcome {
  /** Quad en fracciones 0–1 (TL,TR,BR,BL) o null sin quad */
  corners: Float32Array | null;
  quality: RawQualityInput;
}

export interface WarpOutcome {
  bitmap: ImageBitmap;
  w: number;
  h: number;
  refined: boolean;
  fellBack: [boolean, boolean, boolean, boolean] | null;
}

export interface EnhanceOutcome {
  blob: Blob;
  mime: "image/jpeg" | "image/png";
  w: number;
  h: number;
  elapsedMs: number;
}

// ─── Cliente ────────────────────────────────────────────────

interface PendingEntry {
  resolve: (value: never) => void;
  reject: (err: Error) => void;
}

const READY_TIMEOUT_MS = 25000;

/** Versión del motor: invalida la caché HTTP del Worker (patrón web-scanner) */
const VERSION_WORKER = "1";

function workerUrl(): string {
  return `${withBasePath("/scanner/detection-worker.js")}?v=${VERSION_WORKER}`;
}

export class ScannerWorkerClient {
  private worker: Worker | null = null;
  private readyResolve: ((ok: boolean) => void) | null = null;
  private readyPromise: Promise<boolean> | null = null;
  private pending = new Map<number, PendingEntry>();
  private tsCounter = 0;
  private dead = false;
  private _ready = false;
  private configEnviado = false;

  /** Cola de exclusión: 1 mensaje en vuelo a la vez */
  private chain: Promise<unknown> = Promise.resolve();

  /** true si hay un mensaje en vuelo (backpressure por descarte) */
  get busy(): boolean {
    return this.pending.size > 0;
  }

  /** true tras 'ready' del worker (OpenCV inicializado) */
  get isReady(): boolean {
    return this._ready && !this.dead;
  }

  get isDead(): boolean {
    return this.dead;
  }

  /** Inicializa el worker y espera a que OpenCV.js esté listo.
   *  Self-healing: si el timeout de arranque vence, el worker queda
   *  dead y un getScannerWorker() posterior crea uno NUEVO. */
  waitReady(): Promise<boolean> {
    if (this.dead) return Promise.resolve(false);
    if (this._ready) return Promise.resolve(true);
    if (!this.readyPromise) {
      this.readyPromise = new Promise<boolean>((resolve) => {
        this.readyResolve = resolve;
        const timer = window.setTimeout(() => {
          if (!this._ready) {
            try {
              this.worker?.terminate();
            } catch {
              /* ya muerto */
            }
            this.worker = null;
            this.dead = true;
            this.rejectAll(new Error("worker: timeout de arranque"));
            resolve(false);
          }
        }, READY_TIMEOUT_MS);
        const origResolve = this.readyResolve;
        this.readyResolve = (ok: boolean) => {
          window.clearTimeout(timer);
          origResolve(ok);
        };
      });
      this.spawn();
    }
    return this.readyPromise;
  }

  private spawn(): void {
    try {
      this.worker = new Worker(workerUrl());
    } catch {
      this.dead = true;
      this.readyResolve?.(false);
      return;
    }
    this.worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      this.handleMessage(ev.data);
    };
    this.worker.onerror = () => {
      // Error de red del script del worker → muerto (hay respaldo casero)
      this.dead = true;
      this.rejectAll(new Error("worker: error de carga"));
      this.readyResolve?.(false);
    };
  }

  private handleMessage(msg: WorkerOut): void {
    switch (msg.type) {
      case "ready": {
        this._ready = true;
        if (!this.configEnviado) {
          this.configEnviado = true;
          // Tope sagrado 4032 (computeWarpDims nunca escala hacia arriba).
          // [C-14 · FIX] El worker NO responde 'config' (protocolo
          // web-scanner: la aplica y `return` sin ack) — postMessage
          // DIRECTO fire-and-forget. Pasarlo por la cola de exclusión
          // dejaba la cadena bloqueada para siempre (el primer bug del
          // E2E: el pipeline colgaba y caía al respaldo a los 30 s).
          // El orden de llegada garantiza que el config se aplica antes
          // que cualquier detect/warp/enhance posterior.
          try {
            this.worker?.postMessage({
              type: "config",
              maxWarpLongSide: PROCESSED_MAX_LONG_SIDE,
            } as ConfigRequest);
          } catch {
            /* config es best-effort */
          }
        }
        this.readyResolve?.(true);
        break;
      }
      case "boot":
        break;
      case "busy": {
        // El bitmap YA fue transferido (no reintentable): rechazo
        // controlado y el llamador usa su fallback.
        const entry = this.pending.get(msg.ts);
        if (entry) {
          this.pending.delete(msg.ts);
          entry.reject(new Error("worker ocupado"));
        }
        break;
      }
      case "result": {
        const entry = this.pending.get(msg.ts);
        if (entry) {
          this.pending.delete(msg.ts);
          (entry.resolve as (v: DetectOutcome) => void)({
            corners: msg.corners,
            quality: msg.qualityInput,
          });
        }
        break;
      }
      case "warped": {
        const entry = this.pending.get(msg.ts);
        if (entry) {
          this.pending.delete(msg.ts);
          (entry.resolve as (v: WarpOutcome) => void)({
            bitmap: msg.bitmap,
            w: msg.w,
            h: msg.h,
            refined: msg.refined,
            fellBack: msg.fellBack,
          });
        }
        break;
      }
      case "enhanced": {
        const entry = this.pending.get(msg.ts);
        if (entry) {
          this.pending.delete(msg.ts);
          (entry.resolve as (v: EnhanceOutcome) => void)({
            blob: msg.blob,
            mime: msg.mime,
            w: msg.w,
            h: msg.h,
            elapsedMs: msg.elapsedMs,
          });
        }
        break;
      }
      case "error": {
        // Sin correlación por ts: si hay pendientes, el error es del más
        // antiguo. Si no hay pendientes y no está ready, la carga de
        // OpenCV.js falló → worker muerto.
        const oldest = this.pending.keys().next().value;
        if (oldest !== undefined) {
          const entry = this.pending.get(oldest);
          this.pending.delete(oldest);
          entry?.reject(new Error(`worker: ${msg.message}`));
        } else if (!this._ready) {
          this.dead = true;
          this.readyResolve?.(false);
        }
        break;
      }
    }
  }

  private rejectAll(err: Error): void {
    for (const [, entry] of this.pending) entry.reject(err);
    this.pending.clear();
  }

  private nextTs(): number {
    this.tsCounter += 1;
    return this.tsCounter;
  }

  /** Serializa las operaciones (el bitmap se crea dentro del turno) */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    // La cadena nunca se rompe por un error de la tarea
    this.chain = run.catch(() => undefined);
    return run;
  }

  private send(
    msg: WorkerIn,
    transfer: Transferable[]
  ): Promise<DetectOutcome | WarpOutcome | EnhanceOutcome> {
    if (!this.worker || this.dead) {
      return Promise.reject(new Error("worker no disponible"));
    }
    const ts = (msg as { ts: number }).ts;
    return new Promise<DetectOutcome | WarpOutcome | EnhanceOutcome>(
      (resolve, reject) => {
        this.pending.set(ts, { resolve, reject });
        try {
          this.worker!.postMessage(msg, transfer);
        } catch (e) {
          this.pending.delete(ts);
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      }
    );
  }

  /**
   * Detección sobre una fuente de imagen. El bitmap se crea aquí
   * (dentro del turno) y se transfiere — zero-copy.
   * Devuelve null si el worker no está listo o falla (→ respaldo).
   */
  async detect(
    source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
    w: number,
    h: number
  ): Promise<DetectOutcome | null> {
    if (!this.isReady) return null;
    return this.enqueue(async () => {
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(source);
      } catch {
        return null;
      }
      try {
        return (await this.send(
          { type: "detect", bitmap, ts: this.nextTs() },
          [bitmap]
        )) as DetectOutcome;
      } catch {
        return null;
      }
    });
  }

  /**
   * Rectifica la foto COMPLETA con el quad (FRACCIONES 0–1 de la
   * foto — el worker valida isFractions8 y las multiplica por las
   * dims del bitmap). `manual: true` = quad del humano → SIN refine
   * RANSAC y SIN shrink 3.5 px (F5-MANUAL). Devuelve el bitmap
   * warpeado PURO (INTER_CUBIC + BORDER_REPLICATE, sin upscale).
   * null → el llamador cae a su respaldo.
   */
  async warp(
    source: ImageBitmap | HTMLCanvasElement,
    quad: Array<{ x: number; y: number }>,
    manual: boolean
  ): Promise<WarpOutcome | null> {
    if (!this.isReady) return null;
    return this.enqueue(async () => {
      let bitmap: ImageBitmap;
      try {
        bitmap =
          source instanceof ImageBitmap
            ? source
            : await createImageBitmap(source);
      } catch {
        return null;
      }
      const f = new Float32Array(8);
      for (let i = 0; i < 4; i++) {
        f[2 * i] = quad[i].x;
        f[2 * i + 1] = quad[i].y;
      }
      try {
        return (await this.send(
          { type: "warp", bitmap, quad: f, ts: this.nextTs(), manual },
          [bitmap]
        )) as WarpOutcome;
      } catch {
        try {
          bitmap.close();
        } catch {
          /* ya cerrado */
        }
        return null;
      }
    });
  }

  /**
   * Aplica un modo de realce al bitmap y devuelve el Blob ENCODE
   * (PNG para bw — R-10 de web-scanner: lossless para la tinta).
   * null → el llamador cae a su filtro de respaldo.
   */
  async enhance(
    bitmap: ImageBitmap | HTMLCanvasElement,
    mode: EnhanceMode,
    opts?: { quality?: number; maxLongSide?: number }
  ): Promise<EnhanceOutcome | null> {
    if (!this.isReady) return null;
    return this.enqueue(async () => {
      let bm: ImageBitmap;
      try {
        bm =
          bitmap instanceof ImageBitmap
            ? bitmap
            : await createImageBitmap(bitmap);
      } catch {
        return null;
      }
      try {
        return (await this.send(
          {
            type: "enhance",
            bitmap: bm,
            mode,
            ts: this.nextTs(),
            ...(opts ?? {}),
          },
          [bm]
        )) as EnhanceOutcome;
      } catch {
        try {
          bm.close();
        } catch {
          /* ya cerrado */
        }
        return null;
      }
    });
  }
}

// ─── Singleton ──────────────────────────────────────────────

let clienteProm: Promise<ScannerWorkerClient> | null = null;
let clienteActual: ScannerWorkerClient | null = null;

/**
 * Singleton del cliente (self-healing): si un cliente quedó dead,
 * la siguiente llamada crea uno NUEVO (el pipeline se recupera sin
 * recargar la página).
 */
export function getScannerWorker(): Promise<ScannerWorkerClient> {
  if (!clienteProm) {
    const cliente = new ScannerWorkerClient();
    clienteActual = cliente;
    clienteProm = Promise.resolve(cliente);
  }
  void clienteProm.then((c) => {
    if (c.isDead) {
      // re-crear en la próxima llamada
      clienteProm = null;
    }
  });
  return clienteProm;
}

/** Calentamiento en segundo plano (montaje de PantallaCaptura) */
export function calentarMotorOpenCv(): void {
  void getScannerWorker().then((c) => c.waitReady());
  // QA documentada del fork (README-ANALISIS-IA.md §4): consola del
  // navegador → window.__scannerPrecision() → { ready, dead }
  if (typeof window !== "undefined") {
    const w = window as unknown as {
      __scannerPrecision?: () => { ready: boolean; dead: boolean };
    };
    if (!w.__scannerPrecision) {
      w.__scannerPrecision = () => ({
        ready: clienteActual?.isReady ?? false,
        dead: clienteActual?.isDead ?? false,
      });
    }
  }
}
