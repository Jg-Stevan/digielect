import { NextRequest, NextResponse } from "next/server";
import { COOKIE_SESION, leerCookie, verificarSesion } from "@/lib/sesion";

// ============================================================
// DIGIELECT · GET /api/auth/sesion — Estado de la sesión
// [OLA5 5.1] El cliente hidrata localStorage para UX (no hay
// flash de login), pero la VERDAD vive en el servidor: esta
// ruta dice si la cookie httpOnly sigue válida y cuándo expira.
// La UI la consulta al arrancar y al recibir un 401 para
// sincronizarse (sesión expirada → volver al login, sin teatro).
// ============================================================

export async function GET(req: NextRequest) {
  const sesion = verificarSesion(leerCookie(req, COOKIE_SESION));
  if (!sesion.ok) {
    return NextResponse.json(
      { ok: false, error: "Sesión no válida o expirada" },
      { status: 401 }
    );
  }
  return NextResponse.json({
    ok: true,
    usuario: sesion.usuario,
    rol: "SUPERVISOR",
    expiraAt: new Date(sesion.exp * 1000).toISOString(),
  });
}
