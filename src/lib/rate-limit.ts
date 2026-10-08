import { NextResponse } from "next/server";

// ============================================================
// DIGIELECT · [OLA5 5.6] Rate limiting simple en memoria
// Ventana deslizante por IP. Sin Redis/BD (demo de un nodo):
// el Map se limpia por inactividad y el límite es suficiente
// para frenar abuso de /api/actas (ingesta PWA), /api/actas/
// analizar (costo VLM por request) y fuerza bruta del login.
// ============================================================

interface ConfigLimite {
  /** Clave del contador (normalmente la ruta). */
  clave: string;
  /** Máximo de requests por ventana. */
  max: number;
  /** Ventana en ms. */
  ventanaMs: number;
}

const contadores = new Map<string, number[]>();
const LIMPIEZA_MS = 5 * 60 * 1000;
let ultimaLimpieza = Date.now();

/** IP del cliente: x-forwarded-for (gateway) → x-real-ip → local. */
export function ipDe(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "127.0.0.1";
}

function limpiarInactivos(ahora: number): void {
  if (ahora - ultimaLimpieza < LIMPIEZA_MS) return;
  ultimaLimpieza = ahora;
  for (const [k, timestamps] of contadores) {
    if (
      timestamps.length === 0 ||
      ahora - timestamps[timestamps.length - 1] > LIMPIEZA_MS
    ) {
      contadores.delete(k);
    }
  }
}

/**
 * Aplica el límite a un request.
 *   const limite = limitar(req, { clave: "actas", max: 10, ventanaMs: 60_000 });
 *   if (limite.response) return limite.response;
 */
export function limitar(
  req: Request,
  { clave, max, ventanaMs }: ConfigLimite
): { ok: true } | { ok: false; response: NextResponse } {
  const ahora = Date.now();
  limpiarInactivos(ahora);
  const id = `${clave}:${ipDe(req)}`;
  const previos = (contadores.get(id) ?? []).filter(
    (t) => ahora - t < ventanaMs
  );
  if (previos.length >= max) {
    const reintentoSeg = Math.ceil(
      (ventanaMs - (ahora - previos[0])) / 1000
    );
    contadores.set(id, previos);
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: `DEMASIADAS SOLICITUDES — límite de ${max} por minuto alcanzado; reintente en ${reintentoSeg}s`,
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.max(1, reintentoSeg)) },
        }
      ),
    };
  }
  previos.push(ahora);
  contadores.set(id, previos);
  return { ok: true };
}
