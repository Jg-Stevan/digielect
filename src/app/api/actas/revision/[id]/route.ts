import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requiereSupervisor } from "@/lib/sesion";

export const dynamic = "force-dynamic";

// ============================================================
// [FASE-6 · PLAN §8.4] PATCH /api/actas/revision/:id
// Resuelve un acta de la bandeja de revisión (solo supervisor).
// Body: { accion: "aceptar" | "rechazar" | "reasignar", mesaId? }
//  · aceptar    → estado "aceptada" (el supervisor confirma el ruteo)
//  · rechazar   → estado "aceptada" con motivo de descarte (la imagen
//                 queda archivada; el flujo del jurado no reintenta)
//  · reasignar  → cambia mesaId (validado contra catálogo) + acepta
// ============================================================

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sesion = requiereSupervisor(req);
  if (!sesion.ok) return sesion.response;
  const { id } = await params;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      accion?: string;
      mesaId?: string;
      nota?: string;
    };
    const fila = await db.actaIngesta.findUnique({ where: { id } });
    if (!fila) {
      return NextResponse.json({ error: "Acta de ingesta no encontrada" }, { status: 404 });
    }

    if (body.accion === "reasignar") {
      if (!body.mesaId) {
        return NextResponse.json({ error: "mesaId requerido para reasignar" }, { status: 400 });
      }
      const mesa = await db.mesa.findUnique({
        where: { id: body.mesaId },
        include: { consulado: { select: { codigo: true } } },
      });
      if (!mesa) {
        return NextResponse.json({ error: `Mesa inexistente: ${body.mesaId}` }, { status: 404 });
      }
      const datos = JSON.parse(fila.datos) as { acta?: { mesaId?: string } };
      if (datos.acta) datos.acta.mesaId = mesa.id;
      const actualizada = await db.actaIngesta.update({
        where: { id },
        data: {
          mesaId: mesa.id,
          estado: "aceptada",
          motivo: `Reasignada por supervisor a ${mesa.consulado.codigo} mesa ${mesa.numero}${body.nota ? ` — ${body.nota}` : ""}`,
          datos: JSON.stringify(datos),
        },
      });
      return NextResponse.json({ ok: true, estado: actualizada.estado, mesaId: actualizada.mesaId });
    }

    if (body.accion === "aceptar" || body.accion === "rechazar") {
      const actualizada = await db.actaIngesta.update({
        where: { id },
        data: {
          estado: "aceptada",
          motivo:
            body.accion === "rechazar"
              ? `Rechazada por supervisor${body.nota ? ` — ${body.nota}` : ""}`
              : fila.motivo,
        },
      });
      return NextResponse.json({ ok: true, estado: actualizada.estado });
    }

    return NextResponse.json({ error: "accion debe ser aceptar | rechazar | reasignar" }, { status: 400 });
  } catch (e) {
    console.error("[actas/revision/:id] error:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
