"use client";

/**
 * detector-client.ts — Cliente del DetectionWorker REAL (OpenCV.js 4.5.5).
 *
 * Puerto fiel de `src/lib/scanner/detector-client.ts` de web-scanner v6.2
 * (https://github.com/Jg-Stevan/web-scanner), según la GUÍA MAESTRA DE
 * REPLICACIÓN (INSTRUCCIONES_REPLICA_MOTOR_VISION_OPENCV.md):
 *
 * Puente TypeScript ⇄ worker clásico (`public/scanner/detection-worker.js`)
 * que contiene el pipeline OpenCV.js completo: Canny 6 pasadas en cascada →
 * contornos → filtrado de quads convexos → selección por score → refinado
 * sub-píxel RANSAC (refineQuad) → shrink 3.5 px → homografía
 * warpPerspective(INTER_CUBIC, BORDER_REPLICATE) → modos de realce.
 *
 * Protocolo (sin cambios matemáticos):
 *  - In : detect | warp | enhance | config
 *  - Out: result | warped | enhanced | busy | boot | ready | error
 *  - Corners en FRACCIONES 0–1 por eje, orden TL,TR,BR,BL (mismo convenio
 *    del `Quad` de esta app — invariantes ante cualquier resize).
 *  - Backpressure por DESCARTE (nunca encolar en el worker): cola de
 *    exclusión local de 1 mensaje en vuelo.
 *  - ImageBitmap SIEMPRE transferible (zero-copy) — nunca .buffer.slice de
 *    ImageData (bloqueos de GC en móviles).
 */

// ─── Modos y perfiles ───────────────────────────────────────────────────────

export type EnhanceMode = "raw" | "color" | "gray" | "natural" | "text" | "bw";
export type DocProfile = "auto" | "documento-largo" | "pagina" | "tarjeta";

// ─── Constantes de proceso (protocol.ts — INTOCABLES) ───────────────────────

/** Lado mayor de proceso en detección (F1-opt P3: 400 → < 25 ms/frame). */
export const PROCESS_LONG_SIDE = 400;

export function computeProcessDims(
  videoW: number,
  videoH: number
): { w: number; h: number } {
  if (!(videoW > 0) || !(videoH > 0)) return { w: 640, h: 480 };
  const s = PROCESS_LONG_SIDE / Math.max(videoW, videoH);
  return {
    w: Math.max(1, Math.round(videoW * s)),
    h: Math.max(1, Math.round(videoH * s)),
  };
}

// ─── Protocolo de mensajes ──────────────────────────────────────────────────

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
  quad: Float32Array;
  ts: number;
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
  docProfile?: DocProfile;
  /** Tope del lado mayor del warp según capacidad del dispositivo
   *  (4032/3200/2560). El worker lo aplica en computeWarpDims. */
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

// ─── Resultados de alto nivel ───────────────────────────────────────────────

export interface DetectOutcome {
  /** Quad en fracciones 0–1 (TL,TR,BR,BL) o null si el frame no tiene quad. */
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

// ─── Cliente ────────────────────────────────────────────────────────────────

interface PendingEntry {
  resolve: (value: never) => void;
  reject: (err: Error) => void;
}

const WORKER_URL = "/scanner/detection-worker.js?v=7";
const READY_TIMEOUT_MS = 25000;

export class ScannerWorkerClient {
  private worker: Worker | null = null;
  private readyResolve: ((ok: boolean) => void) | null = null;
  private readyPromise: Promise<boolean> | null = null;
  private pending = new Map<number, PendingEntry>();
  private tsCounter = 0;
  private dead = false;
  private _ready = false;

  /** Cola de exclusión: 1 mensaje en vuelo a la vez. */
  private chain: Promise<unknown> = Promise.resolve();

  /** true si hay un mensaje en vuelo (backpressure por descarte del frame loop). */
  get busy(): boolean {
    return this.pending.size > 0;
  }

  /** true tras 'ready' del worker (OpenCV inicializado). */
  get isReady(): boolean {
    return this._ready && !this.dead;
  }

  get isDead(): boolean {
    return this.dead;
  }

  /** Inicializa el worker y espera a que OpenCV.js esté listo.
   *  Self-healing: si el timeout de arranque (25 s) vence, el worker se
   *  termina (queda dead) y getScannerWorker() creará uno NUEVO — el
   *  pipeline se recupera sin recargar la página. */
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
      this.worker = new Worker(WORKER_URL);
    } catch {
      this.dead = true;
      this.readyResolve?.(false);
      return;
    }
    this.worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      this.handleMessage(ev.data);
    };
    this.worker.onerror = () => {
      // Error de red del script del worker → muerto (fallback canvas).
      this.dead = true;
      this.rejectAll(new Error("worker: error de carga"));
      this.readyResolve?.(false);
    };
  }

  private handleMessage(msg: WorkerOut): void {
    switch (msg.type) {
      case "ready": {
        this._ready = true;
        this.readyResolve?.(true);
        break;
      }
      case "boot":
        break;
      case "busy": {
        // El bitmap YA fue transferido (no es reintentable desde el main):
        // con la cola de exclusión esto solo ocurre por una carrera rara —
        // rechazo controlado y el llamador usa su fallback.
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
        // antiguo (el worker libera busy en finally). Si no hay pendientes
        // y no está ready, la carga de OpenCV.js falló → worker muerto.
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
    return performance.now() * 1000 + this.tsCounter;
  }

  /** Serializa las operaciones (el bitmap se crea dentro del turno). */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    // La cadena nunca se rompe por un error de la tarea.
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
   * Detección sobre una fuente de imagen (foto completa del editor).
   * Reduce a 400 con resizeQuality "low" y transfiere el bitmap —
   * Devuelve null si el worker no está listo o falla (→ fallback).
   */
  async detect(
    source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
    w: number,
    h: number
  ): Promise<DetectOutcome | null> {
    if (!this.isReady) return null;
    const dims = computeProcessDims(w, h);
    return this.enqueue(async () => {
      const bitmap = await createImageBitmap(source, {
        resizeWidth: dims.w,
        resizeHeight: dims.h,
        resizeQuality: "low",
      });
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
   * Detección de frame EN CRUDO (frame loop): el bitmap ya fue creado por
   * el llamador (NO se encola — el llamador respeta `busy` antes de llamar
   * y el bitmap transferible no puede duplicarse).
   */
  async detectRaw(
    bitmap: ImageBitmap,
    procW: number,
    procH: number
  ): Promise<DetectOutcome> {
    void procW;
    void procH;
    if (!this.isReady) {
      try {
        bitmap.close();
      } catch {
        /* ya cerrado */
      }
      return Promise.reject(new Error("worker no ready"));
    }
    return (await this.send(
      { type: "detect", bitmap, ts: this.nextTs() },
      [bitmap]
    )) as DetectOutcome;
  }

  /**
   * Rectifica la foto COMPLETA con el quad (fracciones 0–1 de la foto).
   * `manual: true` = quad colocado por el humano → SIN refine RANSAC y
   * SIN shrink 3.5 px (F5-MANUAL: las esquinas del humano mandan al píxel).
   * Devuelve el bitmap warpeado PURO (INTER_CUBIC + BORDER_REPLICATE).
   * null → el llamador cae a su fallback canvas.
   */
  async warp(
    source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
    quad: Array<{ x: number; y: number }>,
    manual: boolean
  ): Promise<WarpOutcome | null> {
    if (!this.isReady) return null;
    return this.enqueue(async () => {
      const bitmap =
        source instanceof ImageBitmap
          ? source
          : await createImageBitmap(source);
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
        return null;
      }
    });
  }

  /**
   * Aplica un modo de realce al bitmap y devuelve el Blob ENCODE
   * (PNG para raw|text|bw — R-10: lossless para tinta).
   * null → el llamador cae a su filtro canvas (image-modes).
   */
  async enhance(
    bitmap: ImageBitmap | HTMLCanvasElement,
    mode: EnhanceMode,
    opts?: { quality?: number; maxLongSide?: number }
  ): Promise<EnhanceOutcome | null> {
    if (!this.isReady) return null;
    return this.enqueue(async () => {
      const bm =
        bitmap instanceof ImageBitmap
          ? bitmap
          : await createImageBitmap(bitmap);
      try {
        return (await this.send(
          {
            type: "enhance",
            bitmap: bm,
            mode,
            ts: this.nextTs(),
            quality: opts?.quality,
            maxLongSide: opts?.maxLongSide,
          },
          [bm]
        )) as EnhanceOutcome;
      } catch {
        return null;
      }
    });
  }

  /** Tope del lado mayor del WARP (calidad↔memoria) según el dispositivo. */
  setWarpCap(maxLongSide: number): void {
    if (!this.worker || this.dead) return;
    const msg: ConfigRequest = { type: "config", maxWarpLongSide: maxLongSide };
    this.worker.postMessage(msg);
  }

  dispose(): void {
    this.rejectAll(new Error("worker disposed"));
    this.worker?.terminate();
    this.worker = null;
    this.dead = true;
    this._ready = false;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let client: ScannerWorkerClient | null | undefined;

/** Instancia perezosa del worker (null en SSR o si ya murió).
 *  Self-healing: si el cliente anterior murió (p. ej. timeout de arranque
 *  de OpenCV.js), se sustituye por uno fresco — la app se recupera
 *  sin recargar. */
export function getScannerWorker(): ScannerWorkerClient | null {
  if (client === undefined) {
    if (typeof window === "undefined" || typeof Worker === "undefined") {
      client = null;
    } else {
      client = new ScannerWorkerClient();
    }
  }
  if (client !== null && client.isDead) {
    client = new ScannerWorkerClient();
  }
  return client;
}

/**
 * Precalienta el pipeline (carga OpenCV.js 4.5.5 self-hosted de /vendor/)
 * sin bloquear la UI. Llamar al montar la app para que la primera
 * detección ya sea instantánea.
 */
export function warmUpScannerWorker(): void {
  const c = getScannerWorker();
  if (c && !c.isReady && !c.isDead) {
    void c.waitReady().then((ok) => {
      // Criterio de éxito #2 del checklist de replicación
      if (ok) {
        console.log("[OpenCV] DetectionWorker initialized and ready with OpenCV 4.5.5!");
      } else {
        console.warn("[OpenCV] DetectionWorker NO pudo inicializar (fallback canvas activo)");
      }
    });
  }
}

// ─── Diagnóstico (QA desde consola del navegador) ───────────────────────────

declare global {
  interface Window {
    /** window.__scannerPrecision() → { ready, dead } — QA del pipeline real. */
    __scannerPrecision?: () => { ready: boolean; dead: boolean };
  }
}

if (typeof window !== "undefined") {
  window.__scannerPrecision = () => {
    const c = getScannerWorker();
    return { ready: c?.isReady ?? false, dead: c?.isDead ?? false };
  };
}
