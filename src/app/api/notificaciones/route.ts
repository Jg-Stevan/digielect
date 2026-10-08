import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invalidarCacheConsulados } from "@/lib/monitor";
import { requiereSupervisor } from "@/lib/sesion";
import { NotificacionesSchema, parsearBody } from "@/lib/validacion";
import { ZONA_COT, horaEnZona, zonaIanaDePuesto } from "@/lib/hora-zona";

export const dynamic = "force-dynamic";

/**
 * POST /api/notificaciones [S-12]
 * Registra la notificación SLA despachada por el supervisor desde el
 * Monitor Global (botón NOTIFICAR). Antes el botón mostraba un toast de
 * éxito SIN ninguna acción detrás: en jornada real el supervisor creería
 * que se notificó al delegado cuando no ocurría nada.
 * Persistencia REAL en NotificacionSla + audit trail + invalidación del
 * monitor (la fila aparece en el Centro de Control SLA).
 *
 * [OLA4 4.10] Notificación + auditoría en UNA transacción: antes un
 * fallo entre las dos escrituras dejaba la notificación registrada sin
 * audit trail (o viceversa) — estado inconsistente.
 *
 * [OLA5 5.2] Ruta MUTANTE del supervisor: exige cookie de sesión válida
 * (401 si no); el audit trail lleva el usuario REAL de la sesión.
 * [OLA5 5.3] Body validado con Zod (antes cast ciego).
 */
export async function POST(req: NextRequest) {
  try {
    // [OLA5 5.2] Despachar notificaciones SLA es acción de supervisor
    const sesion = requiereSupervisor(req);
    if (!sesion.ok) return sesion.response;

    const body = await parsearBody(req, NotificacionesSchema);
    if (!body.ok) return body.response;

    // El narrowing del guard no atraviesa el callback de la transacción:
    // se fija el valor validado en una constante local.
    const mesaLabel: string = body.data.mesaLabel;

    const consulado = await db.consulado.findUnique({
      where: { id: body.data.consuladoId },
      // [OLA6-TZ · 6.8] `puesto` (standName completo, p. ej. "04 -
      // San Francisco - Denver") para resolver la zona por CIUDAD en
      // países multi-zona (EE.UU./Canadá/Brasil…): el puesto físico
      // está en la ciudad satélite, no en la sede consular.
      select: { id: true, pais: true, puesto: true },
    });
    if (!consulado) {
      return NextResponse.json(
        { ok: false, error: "Consulado no encontrado" },
        { status: 404 }
      );
    }

    // Fase SLA por mora transcurrida desde la última carga de la mesa
    // (regla del ERS: fase 1 tolerancia 0-40m, fase 2 40m-2h, fase 3 >2h).
    let fase = 1;
    let minutosMora = 40;
    if (body.data.mesaId) {
      const mesa = await db.mesa.findUnique({
        where: { id: body.data.mesaId },
        select: {
          actas: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
        },
      });
      const ultima = mesa?.actas[0]?.createdAt;
      if (ultima) {
        minutosMora = Math.max(
          0,
          Math.round((Date.now() - ultima.getTime()) / 60000)
        );
        fase = minutosMora > 120 ? 3 : minutosMora > 40 ? 2 : 1;
      }
    }

    // [OLA6-TZ · 6.8] Hora local del PUESTO (zona por ciudad, no por
    // país: "04 - San Francisco - Denver" cierra en hora de Denver).
    const despachoLocal = horaEnZona(
      new Date(),
      zonaIanaDePuesto(consulado.pais, consulado.puesto)
    );
    const despachoCol = horaEnZona(new Date(), ZONA_COT);

    const { notificacionId } = await db.$transaction(async (tx) => {
      const noti = await tx.notificacionSla.create({
        data: {
          consuladoId: consulado.id,
          mesasInactivas: mesaLabel,
          fase,
          canal: "WA",
          despachadoAt: `Despachado ${despachoLocal}`,
          estado: "SIN_ACUSE",
          estadoDetalle: `Despachado ${despachoCol} COL · Sin acuse de recibo`,
          subFaseDesc: `Notificación manual del supervisor · ${mesaLabel}`,
          tiempoTranscurridoMin: minutosMora,
          tiempoTranscurridoLabel:
            minutosMora >= 60
              ? `${Math.floor(minutosMora / 60)}h ${minutosMora % 60}m`
              : `${minutosMora}m`,
        },
      });

      await tx.auditEvent.create({
        data: {
          usuario: sesion.usuario,
          accion: "NOTIFICACION_SLA",
          detalle: `${mesaLabel} · canal WA · fase ${fase} · despachada ${despachoCol} COL`,
        },
      });

      return { notificacionId: noti.id };
    });

    // La vista del monitor/SLA cambió → invalida la caché
    invalidarCacheConsulados();

    return NextResponse.json({
      ok: true,
      notificacionId,
      fase,
      canal: "WA",
      despachoCol,
    });
  } catch (error) {
    console.error("[notificaciones POST] error:", error);
    return NextResponse.json(
      { ok: false, error: "Error registrando la notificación" },
      { status: 500 }
    );
  }
}
