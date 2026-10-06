// ============================================================
// DIGIELECT · Cola de contingencia offline (rol B, FASE 4/5)
// ------------------------------------------------------------
// Hojas del digitalizador que NO pudieron enviarse (sin red) y
// quedan esperando sincronización. Persistidas en IndexedDB
// (store "cola-contingencia") para sobrevivir al cierre de la
// pestaña — antes vivían solo en un ref de memoria.
// El botón SINCRONIZAR COLA del PWA las drena.
// ============================================================

import type { TipoEjemplar } from "@/lib/types";
import { idbAll, idbDelete, idbPut } from "@/lib/idb";

/** Hoja en cola de contingencia (mínimo para reenviar) */
export interface HojaOffline {
  id: string;
  /** Imagen comprimida (dataURL) */
  imagen: string;
  /** QR decodificado si se logró antes de perder la red */
  qrTexto: string | null;
  barcode: string | null;
  /** Destino ya resuelto por la verificación */
  mesaIdRef: string | null;
  tipo: TipoEjemplar;
  pagina: number;
  scoreCliente: number | null;
  envioEmergencia: boolean;
  intentos: number;
  createdAt: string;
}

/** Encola (o incrementa intentos de) una hoja pendiente */
export async function encolarHojaOffline(
  hoja: Omit<HojaOffline, "id" | "intentos" | "createdAt"> & {
    id?: string;
    intentos?: number;
  }
): Promise<HojaOffline> {
  const registro: HojaOffline = {
    id: hoja.id ?? `hoja-off-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    imagen: hoja.imagen,
    qrTexto: hoja.qrTexto ?? null,
    barcode: hoja.barcode ?? null,
    mesaIdRef: hoja.mesaIdRef ?? null,
    tipo: hoja.tipo,
    pagina: hoja.pagina,
    scoreCliente: hoja.scoreCliente ?? null,
    envioEmergencia: Boolean(hoja.envioEmergencia),
    intentos: (hoja.intentos ?? 0) + 1,
    createdAt: new Date().toISOString(),
  };
  await idbPut("cola-contingencia", registro);
  return registro;
}

/** Toda la cola (más antigua primero) */
export async function hojasOffline(): Promise<HojaOffline[]> {
  const items = await idbAll<HojaOffline>("cola-contingencia");
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Quita una hoja de la cola (tras envío exitoso) */
export async function quitarHojaOffline(id: string): Promise<void> {
  await idbDelete("cola-contingencia", id);
}

/** Conteo para la UI (badge SINCRONIZAR COLA) */
export async function contarHojasOffline(): Promise<number> {
  return (await hojasOffline()).length;
}
