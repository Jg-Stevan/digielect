import { NextResponse } from "next/server";

// ============================================================
// DIGIELECT · POST /api/auth/login — Acceso del Supervisor
// Credenciales por variables de entorno (defaults de demo):
//   SUPERVISOR_USER (default "supervisor")
//   SUPERVISOR_PASSWORD (default "digielect")
// El digitalizador NO requiere credenciales (flujo sin fricción).
// ============================================================

const USER = process.env.SUPERVISOR_USER ?? "supervisor";
const PASSWORD = process.env.SUPERVISOR_PASSWORD ?? "digielect";

export async function POST(request: Request) {
  let body: { usuario?: string; password?: string };
  try {
    body = (await request.json()) as { usuario?: string; password?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Solicitud inválida" },
      { status: 400 }
    );
  }

  const usuario = (body.usuario ?? "").trim();
  const password = body.password ?? "";

  if (
    usuario.length > 0 &&
    usuario.toLowerCase() === USER.toLowerCase() &&
    password === PASSWORD
  ) {
    return NextResponse.json({
      ok: true,
      usuario: USER,
      rol: "SUPERVISOR",
    });
  }

  return NextResponse.json(
    { ok: false, error: "Credenciales inválidas" },
    { status: 401 }
  );
}
