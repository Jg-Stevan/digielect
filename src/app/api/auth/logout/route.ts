import { NextResponse } from "next/server";
import { cookieDeLogout } from "@/lib/sesion";

// ============================================================
// DIGIELECT · POST /api/auth/logout — Cierre de sesión
// [OLA5 5.1] Expira la cookie httpOnly de sesión del supervisor.
// El cliente además limpia su localStorage (auth-store), pero la
// cookie del SERVIDOR es la que autorizaba las rutas mutantes.
// ============================================================

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.set("Set-Cookie", cookieDeLogout());
  return res;
}
