import { NextResponse } from "next/server";
import { LoginSchema, parsearBody } from "@/lib/validacion";
import { limitar } from "@/lib/rate-limit";
import { cookieDeSesion, firmarSesion, SESION_SEGUNDOS } from "@/lib/sesion";

// ============================================================
// DIGIELECT · POST /api/auth/login — Acceso del Supervisor
// Credenciales por variables de entorno (defaults de demo):
//   SUPERVISOR_USER (default "supervisor")
//   SUPERVISOR_PASSWORD (default "digielect")
// El digitalizador NO requiere credenciales (flujo sin fricción).
//
// [OLA5 5.1] Sesión REAL: además del {ok:true} se firma un JWT
// HS256 y viaja en cookie httpOnly `digielect-sesion` (8 h de
// jornada). Antes la única "sesión" era un valor de localStorage
// que cualquiera podía inyectar a mano.
// [OLA5 5.3] Body validado con Zod (antes cast ciego).
// [OLA5 5.6] Rate limit 5 intentos/min por IP (fuerza bruta).
// ============================================================

const USER = process.env.SUPERVISOR_USER ?? "supervisor";
const PASSWORD = process.env.SUPERVISOR_PASSWORD ?? "digielect";

export async function POST(request: Request) {
  // [OLA5 5.6] Freno de fuerza bruta ANTES de tocar credenciales
  const limite = limitar(request, {
    clave: "login",
    max: 5,
    ventanaMs: 60_000,
  });
  if (!limite.ok) return limite.response;

  const body = await parsearBody(request, LoginSchema);
  if (!body.ok) return body.response;
  const { usuario, password } = body.data;

  if (
    usuario.length > 0 &&
    usuario.toLowerCase() === USER.toLowerCase() &&
    password === PASSWORD
  ) {
    const token = firmarSesion(USER);
    const res = NextResponse.json({
      ok: true,
      usuario: USER,
      rol: "SUPERVISOR",
      expiraEnSeg: SESION_SEGUNDOS,
    });
    res.headers.set("Set-Cookie", cookieDeSesion(token));
    return res;
  }

  return NextResponse.json(
    { ok: false, error: "Credenciales inválidas" },
    { status: 401 }
  );
}
