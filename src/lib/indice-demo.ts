// ============================================================
// DIGIELECT · Índice de actas en el cliente (FASE 3 · rol B)
// ------------------------------------------------------------
// Carga perezosa de public/data/indice-actas.json y construcción
// del Map de identificación con crearIndiceActas() del rol C
// (src/lib/identificacion-acta.ts — módulo puro compartido).
//
// El índice (~1 MB) se descarga UNA vez por sesión, solo cuando
// el digitalizador o el BATCH lo necesitan (lazy fetch on demand,
// como exige TAREA-B §2), y queda cacheado en memoria.
// ============================================================

import type { ConsulateRow } from "@/lib/types";
import { withBasePath } from "@/lib/env";
import {
  crearIndiceActas,
  type ActaVisoItem,
  type EntradaIndice,
} from "@/lib/identificacion-acta";

let cacheIndice: Map<string, EntradaIndice> | null = null;
let promesaIndice: Promise<Map<string, EntradaIndice>> | null = null;

/**
 * Índice de identificación (3.670 actas) listo para usar.
 * Carga perezosa con caché de sesión: el primer consumidor
 * (digitalizador / BATCH) dispara la descarga.
 */
export async function cargarIndiceActas(): Promise<
  Map<string, EntradaIndice>
> {
  if (cacheIndice) return cacheIndice;
  if (promesaIndice) return promesaIndice;
  promesaIndice = (async () => {
    const res = await fetch(withBasePath("/data/indice-actas.json"), {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(
        `No se pudo cargar el índice de actas (${res.status})`
      );
    }
    const items = (await res.json()) as ActaVisoItem[];
    cacheIndice = crearIndiceActas(items);
    return cacheIndice;
  })();
  try {
    return await promesaIndice;
  } finally {
    // Un fallo de red no debe dejar la promesa clavada:
    // el siguiente consumidor reintenta.
    promesaIndice = null;
  }
}

/** ¿Está el índice ya en memoria? (para la UI, sin descargar) */
export function indiceEnMemoria(): boolean {
  return cacheIndice !== null;
}

// ------------------------------------------------------------
// Resolución de la entrada del índice → mesa del monitor
// ------------------------------------------------------------

export interface MesaResuelta {
  consulado: ConsulateRow;
  mesaId: string;
  mesaLabel: string;
}

/**
 * Resuelve la mesa del Monitor Global para una entrada del índice
 * (código de transmisión → consulado por códigos DIVIPOL y mesa por
 * número). El matching por partes de cons.code ("495-10-02") replica
 * el criterio del cruce QR↔VLM de verificar-acta.ts (método fuerte).
 */
export function resolverMesaPorIndice(
  entrada: EntradaIndice,
  consulados: ConsulateRow[]
): MesaResuelta | null {
  const muni = entrada.consulado.municipio;
  const zona = entrada.consulado.zona;
  const puesto = entrada.consulado.puesto;
  if (!muni || !zona || !puesto) return null;

  let cons: ConsulateRow | null = null;
  for (const c of consulados) {
    const partes = (c.code ?? "").split("-").map((p) => p.replace(/\D/g, ""));
    if (partes.length < 3) continue;
    const [m, z, p] = partes;
    if (m === muni && z === zona && p === puesto) {
      cons = c;
      break;
    }
  }
  if (!cons) return null;

  const num = String(entrada.mesaNumero).padStart(3, "0");
  const mesa = cons.mesas.find((m) => {
    const numMesa = (m.mesaNumber ?? "").replace(/\D/g, "");
    return numMesa === num;
  });
  if (!mesa) return null;

  return {
    consulado: cons,
    mesaId: mesa.id,
    mesaLabel: mesa.mesaNumber,
  };
}
