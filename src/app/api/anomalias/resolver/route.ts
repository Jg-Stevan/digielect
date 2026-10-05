import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/anomalias/resolver
 * Resuelve una anomalía desde el Modal de Auditoría (RF-2.3):
 *  - APROBADA: aprueba y marca el acta como válida
 *  - RESCANEO_CONFIRMADO: notifica a la PWA repetir la toma
 * Ambas acciones exigen justificación escrita (Audit Trail RNF-03).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { anomaliaId, action, justificacion } = body as {
      anomaliaId?: string;
      action?: "APROBADA" | "RESCANEO_CONFIRMADO";
      justificacion?: string;
    };

    if (!anomaliaId || !action) {
      return NextResponse.json(
        { ok: false, error: "anomaliaId y action son obligatorios" },
        { status: 400 }
      );
    }

    if (action !== "APROBADA" && action !== "RESCANEO_CONFIRMADO") {
      return NextResponse.json(
        { ok: false, error: "Acción inválida" },
        { status: 400 }
      );
    }

    const justTrim = (justificacion ?? "").trim();
    if (justTrim.length < 10) {
      return NextResponse.json(
        { ok: false, error: "La justificación escrita es obligatoria (mín. 10 caracteres)" },
        { status: 400 }
      );
    }

    const anomalia = await db.anomalia.findUnique({
      where: { id: anomaliaId },
      include: { acta: true, consulado: true },
    });

    if (!anomalia) {
      return NextResponse.json(
        { ok: false, error: "Anomalía no encontrada" },
        { status: 404 }
      );
    }

    // Actualizar anomalía
    await db.anomalia.update({
      where: { id: anomaliaId },
      data: { estado: action, justificacion: justTrim },
    });

    // Actualizar acta vinculada si existe
    if (anomalia.actaId) {
      await db.acta.update({
        where: { id: anomalia.actaId },
        data: {
          estado: action === "APROBADA" ? "VALIDADO" : "RECHAZADO",
          detalle:
            action === "APROBADA"
              ? `Aprobada por supervisor: ${justTrim}`
              : `Rescaneo confirmado por supervisor: ${justTrim}`,
        },
      });
    }

    // Registro de auditoría inalterable (RNF-03)
    await db.auditEvent.create({
      data: {
        usuario: "ADM-9482",
        accion: action === "APROBADA" ? "APROBAR_ACTA" : "CONFIRMAR_RESCANEO",
        detalle: `${anomalia.mesa} · ${anomalia.ciudad} · ${anomalia.formulario} · Justificación: ${justTrim}`,
      },
    });

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    console.error("[anomalias/resolver] error:", error);
    return NextResponse.json(
      { ok: false, error: "Error resolviendo la anomalía" },
      { status: 500 }
    );
  }
}
