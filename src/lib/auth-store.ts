// ============================================================
// DIGIELECT — Sesión del Supervisor (almacenada en localStorage)
// El digitalizador opera SIN credenciales (flujo sin fricción);
// el supervisor inicia sesión y la sesión sobrevive recargas.
// Suscrito vía useSyncExternalStore (sin mismatch de hidratación).
// ============================================================

const KEY = "digielect-auth-v1";

const listeners = new Set<() => void>();

/** Snapshot del usuario autenticado (cliente). null si no hay sesión. */
export function getAuthUsuario(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Snapshot en servidor (sin localStorage) — siempre sin sesión. */
export function getAuthUsuarioServer(): string | null {
  return null;
}

/** Guarda (u borra) la sesión y notifica a los suscriptores. */
export function setAuthUsuario(usuario: string | null): void {
  try {
    if (usuario) {
      localStorage.setItem(KEY, usuario);
    } else {
      localStorage.removeItem(KEY);
    }
  } catch {
    /* sin localStorage (navegación privada): sesión solo en memoria */
  }
  for (const l of listeners) l();
}

/** Suscripción del store externo para useSyncExternalStore. */
export function subscribeAuth(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}
