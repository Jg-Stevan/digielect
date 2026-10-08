import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { requiereSupervisor } from "@/lib/sesion";

export const dynamic = "force-dynamic";

// ============================================================
// [FASE-6 · PLAN §8.3] /api/tokens-dispositivo (solo supervisor)
//   GET              → lista de tokens con su puesto + estado
//   POST { puestoId } → genera token nuevo para el puesto (código
//                       del consulado, ej. "335-05-02") y lo devuelve
//                       UNA vez (no se vuelve a mostrar completo)
//   PATCH { token, activo } → revoca/reactiva
// Un token por puesto/dispositivo (plan: emisión 1:1).
// ============================================================

export async function GET(req: NextRequest) {
  const sesion = requiereSupervisor(req);
  if (!sesion.ok) return sesion.response;
  try {
    const tokens = await db.tokenDispositivo.findMany({ orderBy: { emitido: "desc" } });
    return NextResponse.json({
      tokens: tokens.map((t) => ({
        // el secreto nunca viaja completo en el listado
        token: `${t.token.slice(0, 4)}…${t.token.slice(-4)}`,
        tokenCompleto: undefined,
        puestoId: t.puestoId,
        activo: t.activo,
        emitido: t.emitido.toISOString(),
        ultimaVez: t.ultimaVez?.toISOString() ?? null,
      })),
    });
  } catch (e) {
    console.error("[tokens-dispositivo] GET error:", e);
    return NextResponse.json({ error: "No se pudieron cargar los tokens" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const sesion = requiereSupervisor(req);
  if (!sesion.ok) return sesion.response;
  try {
    const body = (await req.json().catch(() => ({}))) as { puestoId?: string };
    const puestoId = (body.puestoId ?? "").trim();
    if (!/^\d{2,4}-\d{2}-\d{2}$/.test(puestoId)) {
      return NextResponse.json(
        { error: "puestoId debe ser el código del consulado (ej. 335-05-02)" },
        { status: 400 }
      );
    }
    const consulado = await db.consulado.findUnique({ where: { codigo: puestoId } });
    if (!consulado) {
      return NextResponse.json({ error: `Puesto inexistente: ${puestoId}` }, { status: 404 });
    }
    // Un token ACTIVO por puesto: se revoca el anterior al emitir
    await db.tokenDispositivo.updateMany({
      where: { puestoId, activo: true },
      data: { activo: false },
    });
    const token = randomBytes(24).toString("base64url");
    await db.tokenDispositivo.create({ data: { token, puestoId } });
    // El token completo se devuelve UNA sola vez (al generarlo)
    return NextResponse.json({ token, puestoId, ciudad: consulado.ciudad, pais: consulado.pais });
  } catch (e) {
    console.error("[tokens-dispositivo] POST error:", e);
    return NextResponse.json({ error: "No se pudo generar el token" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const sesion = requiereSupervisor(req);
  if (!sesion.ok) return sesion.response;
  try {
    const body = (await req.json().catch(() => ({}))) as { token?: string; activo?: boolean };
    if (!body.token || typeof body.activo !== "boolean") {
      return NextResponse.json({ error: "token y activo son requeridos" }, { status: 400 });
    }
    // revocar por prefijo-completo: el listado no expone el secreto,
    // así que el supervisor pasa el token completo que acaba de generar
    // o el prefijo no es usable — se revoca por token exacto
    const fila = await db.tokenDispositivo.updateMany({
      where: { token: body.token },
      data: { activo: body.activo },
    });
    if (fila.count === 0) {
      return NextResponse.json({ error: "Token no encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[tokens-dispositivo] PATCH error:", e);
    return NextResponse.json({ error: "No se pudo actualizar el token" }, { status: 500 });
  }
}
