// ============================================================
// DIGIELECT · Capa IndexedDB del MODO DEMO (FASE 4 · rol B)
// ------------------------------------------------------------
// Migra el almacenamiento pesado del demo de localStorage
// (~5 MB de cuota) a IndexedDB (cientos de MB):
//
//   · hojas             → imagen comprimida de cada acta ingerida
//   · cola-contingencia → hojas del digitalizador pendientes
//                         de sincronizar (modo offline)
//   · metricas-batch    → lotes BATCH con métricas del dispositivo
//
// Degradación silenciosa: donde no exista IndexedDB (Safari
// privado, navegadores viejos) se usan Map en memoria, de modo
// que la demo nunca se rompe (mismo principio que el resto del
// demo-store).
// ============================================================

/** Nombre de la base y versión del esquema */
const DB_NOMBRE = "digielect-demo";
const DB_VERSION = 1;

/** Object stores definidos por TAREA-B (FASE 4) */
export const STORES = ["hojas", "cola-contingencia", "metricas-batch"] as const;
export type StoreNombre = (typeof STORES)[number];

/** Registro genérico con id (keyPath de todos los stores) */
export interface RegistroIdb {
  id: string;
  [campo: string]: unknown;
}

/** Cualquier objeto persistible: debe traer su id */
export type RegistroPersistible = { id: string };

/** Respaldo en memoria cuando IndexedDB no está disponible */
const memoria = new Map<StoreNombre, Map<string, RegistroPersistible>>();
for (const s of STORES) memoria.set(s, new Map());

let dbPromise: Promise<IDBDatabase | null> | null = null;
let idbDisponible = true;

function tiendaMemoria(store: StoreNombre): Map<string, RegistroPersistible> {
  let m = memoria.get(store);
  if (!m) {
    m = new Map();
    memoria.set(store, m);
  }
  return m;
}

/** Abre la base (una sola vez por sesión); null si no hay soporte */
function abrirDb(): Promise<IDBDatabase | null> {
  if (!idbDisponible) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") {
        idbDisponible = false;
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: "id" });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        // Sin permiso o bloqueada → degradar a memoria y no reintentar
        idbDisponible = false;
        resolve(null);
      };
      req.onblocked = () => {
        resolve(null);
      };
    } catch {
      idbDisponible = false;
      resolve(null);
    }
  });
  return dbPromise;
}

/** true si la persistencia real está activa (para la UI de la demo) */
export async function idbActivo(): Promise<boolean> {
  const db = await abrirDb();
  return db !== null;
}

/**
 * Guarda (o reemplaza) un registro. Resuelve a true si se persistió.
 * En modo memoria siempre devuelve true.
 */
export async function idbPut<T extends RegistroPersistible>(
  store: StoreNombre,
  registro: T
): Promise<boolean> {
  const db = await abrirDb();
  if (!db) {
    tiendaMemoria(store).set(registro.id, registro);
    return true;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(registro);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** Lee un registro por id (null si no existe) */
export async function idbGet<T extends RegistroPersistible>(
  store: StoreNombre,
  id: string
): Promise<T | null> {
  const db = await abrirDb();
  if (!db) {
    return (tiendaMemoria(store).get(id) as T | undefined) ?? null;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).get(id);
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Todos los registros del store (vacío si falla) */
export async function idbAll<T extends RegistroPersistible>(
  store: StoreNombre
): Promise<T[]> {
  const db = await abrirDb();
  if (!db) {
    return [...tiendaMemoria(store).values()] as T[];
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, "readonly");
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve((req.result as T[]) ?? []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/** Elimina un registro por id */
export async function idbDelete(store: StoreNombre, id: string): Promise<void> {
  const db = await abrirDb();
  if (!db) {
    tiendaMemoria(store).delete(id);
    return;
  }
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Limpia un store completo */
export async function idbClear(store: StoreNombre): Promise<void> {
  const db = await abrirDb();
  if (!db) {
    tiendaMemoria(store).clear();
    return;
  }
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Limpia TODOS los stores (REINICIAR DEMO debe dejar el sistema en
 * estado semilla: localStorage + IndexedDB, ver TAREA-B §6.3).
 */
export async function idbClearAll(): Promise<void> {
  for (const store of STORES) {
    await idbClear(store);
  }
}

/** Conteo aproximado de registros (para la UI) */
export async function idbCount(store: StoreNombre): Promise<number> {
  const items = await idbAll(store);
  return items.length;
}
