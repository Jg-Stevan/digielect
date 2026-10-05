// ============================================================
// DIGIELECT — Entorno de compilación (client-safe)
// Distingue el modo fullstack (dev/servidor con backend) del
// modo demo estático (GitHub Pages, sin backend) y resuelve
// rutas públicas con el basePath del despliegue.
// ============================================================

/** true cuando el build es la exportación estática para GitHub Pages */
export const IS_STATIC_EXPORT =
  process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

/** Prefijo de ruta del despliegue (p.ej. "/digielect" en GitHub Pages) */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Antepone el basePath a una ruta pública absoluta.
 * En dev/servidor BASE_PATH es "" y devuelve la ruta intacta.
 */
export function withBasePath(path: string): string {
  if (!path.startsWith("/")) return path;
  return `${BASE_PATH}${path}`;
}
