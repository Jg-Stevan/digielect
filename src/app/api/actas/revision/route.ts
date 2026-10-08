import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requiereSupervisor } from "@/lib/sesion";

export const dynamic = "force-dynamic";

// ============================================================
// [FASE-6 · PLAN §8.4] GET /api/actas/revision
// Bandeja de revisión de la ingesta (solo supervisor).
//   ?cola=score|conflicto|contingencia  (default: todas)
//   ?estado=aceptada|revision|conflicto
//   &limit=&offset=
// Devuelve filas ligeras + datos decodificados para la bandeja.
// ============================================================

export async function GET(req: NextRequest) {
  const sesion = requiereSupervisor(req);
  if (!sesion.ok) return sesion.response;
  try {
    const params = req.nextUrl.searchParams;
    const cola = params.get("cola");
    const limit = Math.min(200, Math.max(1, Number.parseInt(params.get("limit") ?? "50", 10) || 50));
    const offset = Math.max(0, Number.parseInt(params.get("offset") ?? "0", 10) || 0);

    // Filtro por cola (plan §9.1: score bajo/medio · conflicto · contingencia)
    let where = {};
    if (cola === "score") {
      where = { estado: "revision", origen: { not: "contingencia" } };
    } else if (cola === "conflicto") {
      where = { estado: "conflicto" };
    } else if (cola === "contingencia") {
      where = { origen: "contingencia" };
    } else if (params.get("estado")) {
      where = { estado: params.get("estado") as string };
    }

    const [filas, total] = await Promise.all([
      db.actaIngesta.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      db.actaIngesta.count({ where }),
    ]);

    const conteos = await db.actaIngesta.groupBy({ by: ["estado"], _count: { _all: true } });
    const porEstado = Object.fromEntries(conteos.map((c) => [c.estado, c._count._all]));

    return NextResponse.json({
      total,
      porEstado,
      actas: filas.map((f) => ({
        id: f.id,
        mesaId: f.mesaId,
        tokenPuesto: f.tokenPuesto,
        estado: f.estado,
        motivo: f.motivo,
        score: f.score,
        ocrMesaId: f.ocrMesaId,
        origen: f.origen,
        createdAt: f.createdAt.toISOString(),
        datos: JSON.parse(f.datos) as Record<string, unknown>,
      })),
    });
  } catch (e) {
    console.error("[actas/revision] error:", e);
    return NextResponse.json({ error: "No se pudo cargar la bandeja" }, { status: 500 });
  }
}
