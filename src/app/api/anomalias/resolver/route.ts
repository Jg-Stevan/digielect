import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invalidarCacheConsulados } from "@/lib/monitor";
import { requiereSupervisor } from "@/lib/sesion";
import { ResolverSchema, parsearBody } from "@/lib/validacion";

export const dynamic = "force-dynamic";

/**
 * POST /api/anomalias/resolver
 * Resuelve una anomalía desde el Modal de Auditoría (RF-2.3):
 *  - APROBADA: aprueba y marca el acta como válida
 *  - RESCANEO_CONFIRMADO: notifica a la PWA repetir la toma
 * Ambas acciones exigen justificación escrita (Audit Trail RNF-03).
 *
 * [OLA4 4.2] Con RESCANEO_CONFIRMADO el acta vinculada queda RECHAZADA
 * (la fila NO se borra: historial de auditoría intacto) y se LIBERA su
 * qrFingerprint: la huella identifica el documento FÍSICO y debe poder
 * reclamarse con la recaptura del mismo acta — antes quedaba secuestrada
 * por la hoja superseded y la recaptura chocaba SIEMPRE con
 * "QR DUPLICADO" (dedup B-01/B-02 del server). El valor de la huella
 * liberada queda en el AuditEvent para trazabilidad.
 *
 * [OLA4 4.10] Anomalía + acta + auditoría en UNA transacción: antes un
 * fallo intermedio dejaba la anomalía resuelta con el acta sin actualizar
 * (estado inconsistente). Tras el commit se invalida la caché del monitor
 * (la ranura iluminada por la anomalía cambió de estado).
 *
 * [OLA5 5.2] Ruta MUTANTE del supervisor: exige cookie de sesión válida
 * (401 si no) y el audit trail registra el usuario REAL de la sesión (antes
 * el fijo "ADM-9482").
 * [OLA5 5.3] Body validado con Zod (antes cast ciego).
 */
export async function POST(req: NextRequest) {
  try {
    // [OLA5 5.2] Sin sesión válida no hay resolución de anomalías
    const sesion = requiereSupervisor(req);
    if (!sesion.ok) return sesion.response;

    const body = await parsearBody(req, ResolverSchema);
    if (!body.ok) return body.response;
    const { anomaliaId, action, justificacion } = body.data;

    const anomalia = await db.anomalia.findUnique({
      where: { id: anomaliaId },
      // [OLA4 4.2] Solo los campos del acta que esta resolución toca
      // (el include completo materializaba imagenBase64 para nada).
      include: {
        acta: { select: { id: true, qrFingerprint: true } },
      },
    });

    if (!anomalia) {
      return NextResponse.json(
        { ok: false, error: "Anomalía no encontrada" },
        { status: 404 }
      );
    }

    // [OLA4 4.2] ¿La hoja vinculada reclama una huella QR que debe
    // liberarse para permitir la recaptura del mismo documento físico?
    const liberarHuella =
      action === "RESCANEO_CONFIRMADO" && anomalia.acta?.qrFingerprint != null;

    // [OLA4 4.10] Todo o nada: anomalía + acta + auditoría
    await db.$transaction(async (tx) => {
      // Actualizar anomalía
      await tx.anomalia.update({
        where: { id: anomaliaId },
        data: { estado: action, justificacion },
      });

      // Actualizar acta vinculada si existe
      if (anomalia.actaId) {
        await tx.acta.update({
          where: { id: anomalia.actaId },
          data: {
            estado: action === "APROBADA" ? "VALIDADO" : "RECHAZADO",
            // [OLA4 4.2] La huella QR "viaja" con el documento físico:
            // al confirmar rescaneo se libera (qrFingerprint = null)
            // para que la recaptura la reclame (@unique). El acta queda
            // RECHAZADO·REEMPLAZADA en el historial, nunca se borra
            // (misma convención del archivado B-02 en api/actas).
            ...(liberarHuella ? { qrFingerprint: null } : {}),
            detalle:
              action === "APROBADA"
                ? `Aprobada por supervisor: ${justificacion}`
                : `Rescaneo confirmado por supervisor: ${justificacion}${liberarHuella ? " · Huella QR liberada para la recaptura (acta archivada para auditoría)" : ""}`,
          },
        });
      }

      // Registro de auditoría inalterable (RNF-03). Con la liberación se
      // preserva también el VALOR de la huella (el acta ya no lo tendrá).
      // [OLA5 5.2] Usuario REAL de la sesión (antes "ADM-9482" fijo).
      await tx.auditEvent.create({
        data: {
          usuario: sesion.usuario,
          accion: action === "APROBADA" ? "APROBAR_ACTA" : "CONFIRMAR_RESCANEO",
          detalle: `${anomalia.mesa} · ${anomalia.ciudad} · ${anomalia.formulario} · Justificación: ${justificacion}${liberarHuella ? ` · Huella QR liberada: ${anomalia.acta?.qrFingerprint}` : ""}`,
        },
      });
    });

    // La vista del monitor cambió (ranura con anomalía resuelta) →
    // invalida la caché de consulados.
    invalidarCacheConsulados();

    return NextResponse.json({
      ok: true,
      action,
      huellaLiberada: liberarHuella,
    });
  } catch (error) {
    console.error("[anomalias/resolver] error:", error);
    return NextResponse.json(
      { ok: false, error: "Error resolviendo la anomalía" },
      { status: 500 }
    );
  }
}
