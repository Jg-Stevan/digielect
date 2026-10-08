import crypto from "node:crypto";
import { NextResponse } from "next/server";

// ============================================================
// DIGIELECT · [OLA5 5.1] Sesión real del Supervisor
// JWT HS256 firmado con HMAC-SHA256 (node:crypto, sin deps) en
// cookie httpOnly `digielect-sesion`. Antes /api/auth/login solo
// devolvía {ok:true} y TODA la "sesión" vivía en localStorage:
// cualquiera podía inyectar `digielect-auth-v1` en el navegador
// y abrir el panel (las rutas mutantes ni preguntaban).
// El digitalizador CONSULAR sigue SIN credenciales por diseño
// (flujo sin fricción en mesa) — sólo las acciones del
// supervisor exigen cookie válida.
// ============================================================

/** Nombre de la cookie de sesión (httpOnly). */
export const COOKIE_SESION = "digielect-sesion";

/** Vida de la sesión: 8 h (jornada electoral completa). */
export const SESION_SEGUNDOS = 8 * 60 * 60;

/**
 * Secreto de firma. En producción DEBE venir de
 * DIGIELECT_SESSION_SECRET; el default es sólo para la demo
 * local (mismo criterio que SUPERVISOR_USER/PASSWORD).
 */
const SECRETO =
  process.env.DIGIELECT_SESSION_SECRET ??
  "digielect-demo-sesion-secret-cambiar-en-produccion";

interface SesionPayload {
  /** usuario autenticado (sub) */
  sub: string;
  rol: "SUPERVISOR";
  iat: number;
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Firma un JWT HS256 con la sesión del supervisor. */
export function firmarSesion(usuario: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const ahora = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      sub: usuario,
      rol: "SUPERVISOR",
      iat: ahora,
      exp: ahora + SESION_SEGUNDOS,
    } satisfies SesionPayload)
  );
  const firma = crypto
    .createHmac("sha256", SECRETO)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${firma}`;
}

/**
 * Verifica firma + expiración de un token de sesión.
 * Nunca lanza: false en cualquier desviación (token corrupto,
 * firma alterada, expirado, payload malformado).
 */
export function verificarSesion(
  token: string | null | undefined
): { ok: true; usuario: string; exp: number } | { ok: false } {
  if (!token) return { ok: false };
  const partes = token.split(".");
  if (partes.length !== 3) return { ok: false };
  const [header, payload, firma] = partes;
  const esperada = crypto
    .createHmac("sha256", SECRETO)
    .update(`${header}.${payload}`)
    .digest("base64url");
  // Comparación en tiempo constante (evita timing attacks)
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false };
  }
  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as SesionPayload;
    if (
      typeof data.sub !== "string" ||
      data.rol !== "SUPERVISOR" ||
      typeof data.exp !== "number" ||
      data.exp < Math.floor(Date.now() / 1000)
    ) {
      return { ok: false };
    }
    return { ok: true, usuario: data.sub, exp: data.exp };
  } catch {
    return { ok: false };
  }
}

/** Lee el valor de una cookie del header `cookie` del request. */
export function leerCookie(
  req: Request,
  nombre: string
): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const parte of header.split(";")) {
    const [k, ...v] = parte.trim().split("=");
    if (k === nombre) return decodeURIComponent(v.join("="));
  }
  return null;
}

/**
 * [OLA5 5.2] Guard de sesión para rutas MUTANTES del supervisor.
 * Devuelve la sesión válida o una respuesta 401 lista para enviar.
 *
 *   const sesion = requiereSupervisor(req);
 *   if ("response" in sesion) return sesion.response;
 *   // … sesion.usuario disponible para el audit trail
 */
export function requiereSupervisor(
  req: Request
):
  | { ok: true; usuario: string; exp: number }
  | { ok: false; response: NextResponse } {
  const sesion = verificarSesion(leerCookie(req, COOKIE_SESION));
  if (!sesion.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error:
            "SESIÓN REQUERIDA — inicie sesión como supervisor (cookie digielect-sesion)",
        },
        { status: 401 }
      ),
    };
  }
  return sesion;
}

/** Cookie Set-Cookie de sesión (httpOnly, sameSite lax, 8 h). */
export function cookieDeSesion(token: string): string {
  return `${COOKIE_SESION}=${encodeURIComponent(
    token
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESION_SEGUNDOS}`;
}

/** Cookie que expira la sesión (logout). */
export function cookieDeLogout(): string {
  return `${COOKIE_SESION}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
