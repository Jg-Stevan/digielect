// ============================================================
// DIGIELECT · Cargador del índice de actas (FASE 3, rol C)
// ------------------------------------------------------------
// Puente entre el JSON de actas y el identificador canónico:
//
//   · Cliente (modo demo / GitHub Pages): fetch de
//     `${basePath}/data/indice-actas.json` — formato compacto
//     { generado, total, actas: [{c,m,z,p,e}] } generado por
//     scripts/export-static-data.ts (< 300 KB).
//   · Servidor (modo completo / prerender): JSON fuente de
//     prisma/data/exterior-actas.json vía import dinámico del
//     módulo JSON (patrón de docs/agentes/TAREA-C-IDENTIFICADOR.md);
//     perezoso para no empujar ~1 MB al bundle del cliente.
//
// En ambos casos el índice se construye con la MISMA función
// crearIndiceActas() de src/lib/identificacion-acta.ts
// (CONVENIOS §2: construirlo UNA vez por sesión y reutilizarlo).
// ============================================================

import { withBasePath } from "@/lib/env";
import { crearIndiceActas } from "@/lib/identificacion-acta";
import type { ActaVisoItem } from "@/lib/identificacion-acta";

/** Mapa código de transmisión (7 dígitos) → entrada del índice. */
export type IndiceActas = ReturnType<typeof crearIndiceActas>;

/** Ruta pública del índice compacto (se antepone el basePath). */
const RUTA_INDICE = "/data/indice-actas.json";

// ------------------------------------------------------------
// Formato compacto del JSON remoto
// ------------------------------------------------------------

/** Fila compacta de public/data/indice-actas.json (claves cortas). */
interface FilaCompacta {
  /** idTransmissionCode (7 dígitos, llave del índice) */
  c: string;
  /** municipalityCode (país en el exterior) */
  m: string;
  /** idZoneCode */
  z: string;
  /** standCode (puesto/consulado) */
  p: string;
  /** numberStand (mesa) */
  e: string;
}

/** Mapea una fila compacta a la forma exacta que espera crearIndiceActas. */
function compactaAItemViso(f: FilaCompacta): ActaVisoItem {
  return {
    idTransmissionCode: f.c,
    municipalityCode: f.m,
    idZoneCode: f.z,
    standCode: f.p,
    numberStand: f.e,
    // expectedName (pdfHash) e idDepartmentCode NO viajan en el índice
    // compacto: recortarlos es lo que baja el archivo de ~1 MB a ~190 KB.
    // crearIndiceActas asume departamento "88" (EXTERIOR) al faltar, y el
    // visor exterior siempre trae códigos de 7 dígitos (verificado).
  };
}

/** Valida y extrae las filas compactas del JSON remoto. */
function parsearIndiceRemoto(json: unknown, origen: string): FilaCompacta[] {
  if (typeof json !== "object" || json === null) {
    throw new Error(
      `El índice de actas (${origen}) no contiene un objeto JSON válido.`
    );
  }
  const datos = json as Record<string, unknown>;
  if (!Array.isArray(datos.actas)) {
    throw new Error(
      `El índice de actas (${origen}) no trae el arreglo 'actas'. Regenera los datos estáticos con 'bun run demo:export'.`
    );
  }
  const filas: unknown[] = datos.actas;
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const valida =
      typeof fila === "object" &&
      fila !== null &&
      typeof (fila as Record<string, unknown>).c === "string" &&
      typeof (fila as Record<string, unknown>).m === "string" &&
      typeof (fila as Record<string, unknown>).z === "string" &&
      typeof (fila as Record<string, unknown>).p === "string" &&
      typeof (fila as Record<string, unknown>).e === "string";
    if (!valida) {
      throw new Error(
        `El índice de actas (${origen}) trae una fila inválida en la posición ${i}. Regenera los datos estáticos con 'bun run demo:export'.`
      );
    }
  }
  const actas = filas as FilaCompacta[];
  if (typeof datos.total === "number" && datos.total !== actas.length) {
    throw new Error(
      `El índice de actas (${origen}) declara total=${datos.total} pero contiene ${actas.length} filas. Regenera los datos estáticos con 'bun run demo:export'.`
    );
  }
  return actas;
}

// ------------------------------------------------------------
// Servidor: JSON fuente de prisma/data (import dinámico perezoso)
// ------------------------------------------------------------

/** Coerción tolerante de un ítem crudo del visor a ActaVisoItem. */
function itemVisoDesdeBruto(bruto: unknown): ActaVisoItem {
  const fila =
    typeof bruto === "object" && bruto !== null
      ? (bruto as Record<string, unknown>)
      : {};
  const texto = (clave: string): string => {
    const valor = fila[clave];
    return typeof valor === "string" ? valor : valor == null ? "" : String(valor);
  };
  const item: ActaVisoItem = {
    idTransmissionCode: texto("idTransmissionCode"),
    municipalityCode: texto("municipalityCode"),
    idZoneCode: texto("idZoneCode"),
    standCode: texto("standCode"),
    numberStand: texto("numberStand"),
  };
  if (typeof fila.expectedName === "string" && fila.expectedName.length > 0) {
    item.expectedName = fila.expectedName;
  }
  if (
    typeof fila.idDepartmentCode === "string" &&
    fila.idDepartmentCode.length > 0
  ) {
    item.idDepartmentCode = fila.idDepartmentCode;
  }
  return item;
}

/** Ítems del visor desde el JSON fuente (solo rama servidor). */
async function actasLocales(): Promise<ActaVisoItem[]> {
  // Import DINÁMICO del módulo JSON (no fs): en el bundle del cliente
  // queda como chunk aparte que el modo demo nunca descarga, porque el
  // índice del demo sale del fetch del JSON compacto de public/data.
  const modulo = await import("../../prisma/data/exterior-actas.json");
  const datos = (modulo.default ?? {}) as { actas?: unknown[] };
  const actas = Array.isArray(datos.actas) ? datos.actas : [];
  return actas.map(itemVisoDesdeBruto);
}

// ------------------------------------------------------------
// API pública
// ------------------------------------------------------------

/**
 * Construye el índice de identificación de actas (una vez por sesión).
 *
 * · Cliente (modo demo estático): descarga `${basePath}/data/indice-actas.json`
 *   y mapea las claves compactas a la forma `ActaVisoItem` del identificador.
 * · Servidor (modo completo / prerender): usa el JSON fuente de
 *   prisma/data/exterior-actas.json.
 *
 * Lanza `Error` con mensaje claro en español si la descarga falla, el JSON
 * es inválido o `total` no coincide con la longitud del arreglo `actas`.
 */
export async function cargarIndiceActas(): Promise<IndiceActas> {
  if (typeof window === "undefined") {
    return crearIndiceActas(await actasLocales());
  }

  const url = withBasePath(RUTA_INDICE);
  let respuesta: Response;
  try {
    respuesta = await fetch(url);
  } catch (error) {
    throw new Error(
      `No se pudo descargar el índice de actas desde ${url}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  if (!respuesta.ok) {
    throw new Error(
      `No se pudo descargar el índice de actas desde ${url} (HTTP ${respuesta.status}). Verifica que public/data/indice-actas.json exista en el despliegue estático.`
    );
  }
  let json: unknown;
  try {
    json = await respuesta.json();
  } catch {
    throw new Error(
      `El índice de actas (${url}) no es un JSON válido. Regenera los datos estáticos con 'bun run demo:export'.`
    );
  }
  const actas = parsearIndiceRemoto(json, url);
  return crearIndiceActas(actas.map(compactaAItemViso));
}
