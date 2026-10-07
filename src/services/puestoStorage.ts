"use client";

import { withBasePath } from "@/lib/env";

// ============================================================
// DIGIELECT · TAREA 2 (PLAN_DIGIELECT_DIGITALIZADOR.md) · C-17
// Servicio de BASE DE DATOS LOCAL DEL PUESTO (IndexedDB).
//
// Tienda 1  puestos_maestro        → filas PuestoElectoralData
//                                    (llave idTransmissionCode)
// Tienda 2  actas_cola             → ActaQueueItem (cola de subida)
// Tienda 3  configuracion_operario → puesto activo, operador, contadores
//
// Consultas típicas: 0-2 ms (llave/index directo, sin scans).
// Funciona 100% OFFLINE (contingencia de jornada).
// Sin dependencias nuevas: IndexedDB crudo (el plan sugería
// idb-keyval/Dexie; el stack del repo evita dependencias extra).
// ============================================================

const DB_NAME = "digielect";
const DB_VERSION = 1;

const STORE_PUESTOS = "puestos_maestro";
const STORE_COLA = "actas_cola";
const STORE_CONFIG = "configuracion_operario";

// ------------------------------------------------------------
// Tipos del plan (§3.1 / §3.2)
// ------------------------------------------------------------

/** Fila de la Registraduría descargable por puesto (§3.1) */
export interface PuestoElectoralData {
  idTransmissionCode: string; // "7231019" (llave primaria)
  paisDepartamento: string;   // "335" (país en el exterior) o "88"
  municipio: string;          // "465"
  zona: string;               // "05"
  puestoCodigo: string;       // "02"
  puestoNombre: string;       // "El Cairo - Consulado"
  mesa: number;               // 16
  mesasTotalesPuesto: number; // total de mesas habilitadas del puesto
  expectedName?: string;      // hash del PDF oficial publicado
  pdfHash?: string;
}

export type TipoActaCola = "TRANSMISION" | "DELEGADOS" | "CLAVEROS";
export type EstadoCola =
  | "PENDIENTE"
  | "SUBIENDO"
  | "SINCRONIZADA"
  | "ERROR"
  | "ANOMALIA";

/** Elemento en cola de subida (§3.2). Imagen como data URL string. */
export interface ActaQueueItem {
  id: string; // UUID v4 local
  idTransmision: string; // código 7 dígitos extraído entre las X
  qrFingerprint: string | null; // huella base64url del QR (32 bytes)
  barcode15?: string; // código de barras de 15 dígitos

  // Metadatos resueltos
  paisDepartamento: string;
  zona: string;
  puestoCodigo: string;
  puestoNombre: string;
  mesa: number;
  tipoActa: TipoActaCola;
  pagina: number; // 1 o 2
  totalPaginas: number; // 2 normalmente

  // Calidad y estado
  qualityScore: number; // 0-100 (calculateQualityScore)
  sharpnessScore: number;
  contrastScore: number;

  // Archivo de imagen (data URL JPEG comprimido)
  imagenBlob: string;
  tamanoBytes: number;

  // Estado de sincronización
  estado: EstadoCola;
  intentosSubida: number;
  ultimoError?: string;
  createdAt: number;
  syncedAt?: number;

  // [C-17] Extras del contrato digielect (aditivos al §3.2 del plan)
  /** Id de mesa del monitor para el puente de envío a /api/actas */
  mesaIdRef?: string | null;
  modoManual?: boolean;
  envioAdvertencia?: boolean;
}

/** Puesto actualmente asignado al operario (Tienda 3) */
export interface PuestoAsignado {
  /** id legible del consulado, ej. "cons-495-10-02" */
  consuladoId: string;
  codigo: string; // "495-10-02"
  pais: string;
  ciudad: string;
  zona: string;
  puesto: string; // "02 - Roma - Consulado"
  numMesas: number;
  asignadoEn: number;
  /** true → asignado por escaneo de la primera acta (OPCIÓN A) */
  viaEscaneo?: boolean;
}

export interface ConfiguracionOperario {
  clave: "operario";
  puestoActivo: PuestoAsignado | null;
  operador?: string;
  /** Contador persistente de actas sincronizadas (indicador verde) */
  sincronizadasTotal: number;
  actualizadoEn: number;
}

// ------------------------------------------------------------
// Apertura de la BD (singleton)
// ------------------------------------------------------------

let dbProm: Promise<IDBDatabase> | null = null;

function abrirDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB no disponible"));
  }
  if (dbProm) return dbProm;
  dbProm = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PUESTOS)) {
        const s = db.createObjectStore(STORE_PUESTOS, {
          keyPath: "idTransmissionCode",
        });
        s.createIndex("puestoCodigo", "puestoCodigo", { unique: false });
        s.createIndex("mesa", "mesa", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_COLA)) {
        const s = db.createObjectStore(STORE_COLA, { keyPath: "id" });
        s.createIndex("estado", "estado", { unique: false });
        s.createIndex("qrFingerprint", "qrFingerprint", { unique: false });
        s.createIndex("qualityScore", "qualityScore", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CONFIG)) {
        db.createObjectStore(STORE_CONFIG, { keyPath: "clave" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbProm = null;
      reject(req.error ?? new Error("IndexedDB abrir falló"));
    };
  });
  return dbProm;
}

function tx<T>(
  stores: string[],
  modo: IDBTransactionMode,
  run: (t: IDBTransaction) => Promise<T> | T
): Promise<T> {
  return abrirDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(stores, modo);
        let resultado: T;
        t.oncomplete = () => resolve(resultado);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
        Promise.resolve(run(t)).then(
          (r) => {
            resultado = r;
          },
          (e) => {
            reject(e);
            try {
              t.abort();
            } catch {
              /* ya abortada */
            }
          }
        );
      })
  );
}

function reqAsProm<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ------------------------------------------------------------
// TIENDA 1 — puestos_maestro
// ------------------------------------------------------------

/** Inserta/actualiza filas del dataset del puesto (bulk, 1 tx) */
export async function guardarFilasPuesto(
  filas: PuestoElectoralData[]
): Promise<void> {
  if (filas.length === 0) return;
  await tx([STORE_PUESTOS], "readwrite", (t) => {
    const store = t.objectStore(STORE_PUESTOS);
    for (const fila of filas) store.put(fila);
  });
}

/**
 * Lookup O(1) por idTransmissionCode (plan TAREA 2.3).
 * 0-2 ms: get directo por llave, sin iteración.
 */
export async function buscarPorCodigoTransmision(
  code: string
): Promise<PuestoElectoralData | null> {
  if (!code) return null;
  const limpio = code.replace(/\D/g, "");
  return tx([STORE_PUESTOS], "readonly", (t) =>
    reqAsProm(
      t.objectStore(STORE_PUESTOS).get(limpio) as IDBRequest<
        PuestoElectoralData | undefined
      >
    )
  ).then((r) => r ?? null);
}

/** Todas las filas del puesto activo (para coberturas/verificación) */
export async function filasDelPuesto(
  puestoCodigo: string
): Promise<PuestoElectoralData[]> {
  return tx([STORE_PUESTOS], "readonly", (t) =>
    reqAsProm(
      t
        .objectStore(STORE_PUESTOS)
        .index("puestoCodigo")
        .getAll(puestoCodigo) as IDBRequest<PuestoElectoralData[]>
    )
  );
}

/** Total de filas en el maestro (diagnóstico/UI de dataset) */
export async function contarFilasPuesto(): Promise<number> {
  return tx([STORE_PUESTOS], "readonly", (t) =>
    reqAsProm(t.objectStore(STORE_PUESTOS).count())
  );
}

// ------------------------------------------------------------
// TIENDA 2 — actas_cola (escritura la hace uploadQueue.ts)
// ------------------------------------------------------------

export { STORE_COLA, STORE_CONFIG, STORE_PUESTOS };

export async function putActaCola(item: ActaQueueItem): Promise<void> {
  await tx([STORE_COLA], "readwrite", (t) => {
    t.objectStore(STORE_COLA).put(item);
  });
}

export async function getActaCola(id: string): Promise<ActaQueueItem | null> {
  return tx([STORE_COLA], "readonly", (t) =>
    reqAsProm(
      t.objectStore(STORE_COLA).get(id) as IDBRequest<ActaQueueItem | undefined>
    )
  ).then((r) => r ?? null);
}

export async function allActasCola(): Promise<ActaQueueItem[]> {
  return tx([STORE_COLA], "readonly", (t) =>
    reqAsProm(t.objectStore(STORE_COLA).getAll() as IDBRequest<ActaQueueItem[]>)
  );
}

export async function deleteActaCola(id: string): Promise<void> {
  await tx([STORE_COLA], "readwrite", (t) => {
    t.objectStore(STORE_COLA).delete(id);
  });
}

/** ¿Ya existe un acta con esta huella QR en la cola? (dedup local) */
export async function existeHuellaEnCola(
  qrFingerprint: string
): Promise<ActaQueueItem | null> {
  return tx([STORE_COLA], "readonly", (t) =>
    reqAsProm(
      t
        .objectStore(STORE_COLA)
        .index("qrFingerprint")
        .get(qrFingerprint) as IDBRequest<ActaQueueItem | undefined>
    )
  ).then((r) => r ?? null);
}

// ------------------------------------------------------------
// TIENDA 3 — configuracion_operario
// ------------------------------------------------------------

const CONFIG_DEFAULT: ConfiguracionOperario = {
  clave: "operario",
  puestoActivo: null,
  sincronizadasTotal: 0,
  actualizadoEn: 0,
};

export async function obtenerConfiguracion(): Promise<ConfiguracionOperario> {
  try {
    const cfg = await tx([STORE_CONFIG], "readonly", (t) =>
      reqAsProm(
        t.objectStore(STORE_CONFIG).get("operario") as IDBRequest<
          ConfiguracionOperario | undefined
        >
      )
    );
    return cfg ?? { ...CONFIG_DEFAULT };
  } catch {
    return { ...CONFIG_DEFAULT };
  }
}

export async function guardarConfiguracion(
  cfg: Omit<ConfiguracionOperario, "clave" | "actualizadoEn">
): Promise<void> {
  await tx([STORE_CONFIG], "readwrite", (t) => {
    t.objectStore(STORE_CONFIG).put({
      ...cfg,
      clave: "operario" as const,
      actualizadoEn: Date.now(),
    });
  });
}

// ------------------------------------------------------------
// DATASET — descarga del subconjunto de mesas del puesto
// (plan TAREA 2.2: al asignar puesto → dataset local instantáneo)
// ------------------------------------------------------------

export interface DatasetPuesto {
  puesto: PuestoAsignado;
  filas: PuestoElectoralData[];
  origen: "api" | "demo";
}

/** Normaliza el código de zona/puesto a 3 dígitos para cruzar fuentes */
function pad3(n: string): string {
  const d = n.replace(/\D/g, "");
  return d.padStart(3, "0");
}

/**
 * Descarga el dataset del puesto indicado:
 *  · Modo completo: GET /api/digitalizador/dataset?puesto=<codigo>
 *  · Modo demo (Pages): cruza /data/digitalizador-bootstrap.json
 *    (949 puestos con mesas) + /data/indice-actas.json (3.670 códigos)
 * Persiste en puestos_maestro y devuelve el resumen.
 */
export async function descargarDatasetPuesto(
  puesto: PuestoAsignado
): Promise<DatasetPuesto> {
  // 1) Intento API (modo servidor Windows / standalone)
  try {
    const res = await fetch(
      `/api/digitalizador/dataset?puesto=${encodeURIComponent(puesto.codigo)}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const data = (await res.json()) as { filas?: PuestoElectoralData[] };
      if (Array.isArray(data.filas) && data.filas.length > 0) {
        await guardarFilasPuesto(data.filas);
        return { puesto, filas: data.filas, origen: "api" };
      }
    }
  } catch {
    /* sin API → demo */
  }

  // 2) Demo estática: bootstrap (puestos+mesas) + índice (códigos X)
  //    [C-17] withBasePath: en Pages los assets viven en /digielect/…
  const bootRes = await fetch(withBasePath("/data/digitalizador-bootstrap.json"), {
    cache: "no-store",
  });
  if (!bootRes.ok) throw new Error("No se pudo descargar el dataset del puesto");
  const boot = (await bootRes.json()) as {
    consulados?: {
      id: string;
      codigo: string;
      pais: string;
      ciudad: string;
      zona: string;
      puesto: string;
      numMesas: number;
    }[];
  };
  const cons = boot.consulados?.find((c) => c.id === puesto.consuladoId);
  const mesasTotales = cons?.numMesas ?? puesto.numMesas;

  let filas: PuestoElectoralData[] = [];
  try {
    const idxRes = await fetch(withBasePath("/data/indice-actas.json"), {
      cache: "no-store",
    });
    if (idxRes.ok) {
      const idx = (await idxRes.json()) as {
        actas?: {
          c: string; // idTransmissionCode (7)
          m: string; // municipio/país
          z: string; // zona
          p: string; // puesto
          e: string; // mesa
          n?: string; // pdf hash si viene
        }[];
      };
      const partes = puesto.codigo.split("-");
      filas = (idx.actas ?? [])
        .filter(
          (a) =>
            a.p === partes[2] &&
            pad3(a.z) === pad3(puesto.zona) &&
            a.m === partes[0]
        )
        .map((a) => ({
          idTransmissionCode: a.c,
          paisDepartamento: a.m,
          municipio: a.m,
          zona: a.z,
          puestoCodigo: a.p,
          puestoNombre: puesto.puesto,
          mesa: Number(a.e) || 0,
          mesasTotalesPuesto: mesasTotales,
          pdfHash: a.n,
        }));
    }
  } catch {
    /* índice no disponible → filas por mesa */
  }

  // Fallback: sin códigos en el índice para este puesto → filas por mesa
  // (el dataset queda usable para cobertura aunque el puesto no tenga
  // códigos del exterior en el índice compacto).
  if (filas.length === 0) {
    filas = Array.from({ length: mesasTotales }, (_, i) => ({
      idTransmissionCode: `LOCAL-${puesto.codigo}-${String(i + 1).padStart(3, "0")}`,
      paisDepartamento: puesto.pais,
      municipio: puesto.ciudad,
      zona: puesto.zona,
      puestoCodigo: puesto.codigo.split("-")[2] ?? "",
      puestoNombre: puesto.puesto,
      mesa: i + 1,
      mesasTotalesPuesto: mesasTotales,
    }));
  }

  await guardarFilasPuesto(filas);
  return { puesto, filas, origen: "demo" };
}
