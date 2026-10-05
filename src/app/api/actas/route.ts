import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { analizarActa, decidirEstadoActa } from "@/lib/analisis-acta";
import { verificarActaE14 } from "@/lib/verificar-acta";
import { getConsulateRows, invalidarCacheConsulados } from "@/lib/monitor";
import type {
  ActaRegistro,
  ActaUploadPayload,
  AsignacionActa,
  ConsulateRow,
  VerificacionActa,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/actas
 * Ingesta de un acta E-14 desde la PWA Digitalizador:
 *  1. Analiza la imagen con visión artificial (score, barcode, firmas)
 *  1.5 Cruza el QR (qrTexto) con la lectura VLM → verificación/asignación
 *  2. Aplica las reglas RN-02 / RN-03 (aprobada / advertencia / rechazada)
 *  3. Persiste el acta y, si aplica, crea la anomalía para el supervisor
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ActaUploadPayload;

    if (!body?.imagenBase64) {
      return NextResponse.json(
        { ok: false, error: "imagenBase64 es obligatorio" },
        { status: 400 }
      );
    }

    const tipoEjemplar = body.tipoEjemplar === "TRANSMISION" ? "TRANSMISION" : "DELEGADOS";
    const pagina = Math.max(1, Math.min(9, body.pagina ?? 1));
    const totalPaginas = Math.max(1, Math.min(9, body.totalPaginas ?? 2));
    const envioEmergencia = Boolean(body.envioEmergencia);

    // 1. Análisis IA (o datos manuales en modo contingencia RF-1.5)
    const analisis = await analizarActa(body.imagenBase64);

    // En modo manual, el barcode puede venir digitado por el operador (RF-1.3)
    if (body.modoManual && body.barcode && /^\d{15}$/.test(body.barcode)) {
      analisis.barcode = body.barcode;
      analisis.barcodeDigitos = {
        tipoEleccion: body.barcode.slice(0, 2),
        kitMesa: body.barcode.slice(2, 8),
        tipoEjemplar: body.barcode.slice(8, 9),
        version: body.barcode.slice(9, 11),
        pagina: body.barcode.slice(11, 13),
        totalPaginas: body.barcode.slice(13, 15),
      };
    }
    if (body.datosManuales?.resultados?.length) {
      analisis.resultados = body.datosManuales.resultados;
    }

    // 1.5 Verificación cruzada QR ↔ VLM ↔ bootstrap (misma lógica que
    // /api/actas/analizar): si hay QR o barcode, se calcula la
    // asignación final y se persiste dentro del análisis para auditoría
    let verificacion: VerificacionActa | null = null;
    let asignacion: AsignacionActa | null = null;
    if (body.qrTexto || analisis.barcode) {
      let consulados: ConsulateRow[] = [];
      try {
        consulados = await getConsulateRows();
      } catch (e) {
        console.error("[actas POST] bootstrap error:", e);
      }
      const cruce = verificarActaE14({
        analisis,
        qrTexto: body.qrTexto,
        consulados,
      });
      verificacion = cruce.verificacion;
      asignacion = cruce.asignacion;
    }

    // 2. Decisión según reglas de negocio (+ deduplicación por huella QR:
    //    el QR cifrado del E-14 identifica unívocamente el documento físico)
    let decision = body.modoManual
      ? { estado: "VALIDADO" as const, motivo: "Transcripción manual asistida (RF-1.5)" }
      : decidirEstadoActa(analisis, envioEmergencia);

    const qrFingerprint = body.qrTexto?.trim() || null;
    if (qrFingerprint) {
      const duplicado = await db.acta.findFirst({
        where: { qrFingerprint },
        orderBy: { createdAt: "desc" },
      });
      if (duplicado) {
        decision = {
          estado: "RECHAZADO" as const,
          motivo: `QR DUPLICADO — el documento ya fue digitalizado (${duplicado.filename ?? duplicado.id})`,
        };
      }
    }

    // 3. Resolver la mesa de destino (mesaIdRef legible, ej. "mesa-roma-002")
    let mesaId: string | null = null;
    let consuladoId: string | null = null;
    if (body.mesaIdRef) {
      const m = await db.mesa.findFirst({
        where: { id: body.mesaIdRef },
        include: { consulado: true },
      });
      if (m) {
        mesaId = m.id;
        consuladoId = m.consuladoId;
      }
    }

    // 4. Persistir
    const sizeBytes = Math.round((body.imagenBase64.length * 3) / 4);
    const acta = await db.acta.create({
      data: {
        barcode15: analisis.barcode,
        tipoEjemplar,
        pagina,
        totalPaginas,
        estado: decision.estado,
        scoreCalidad: Math.round(analisis.scoreCalidad),
        reintentos: body.scoreCliente ? 0 : 0,
        qrFingerprint,
        envioEmergencia,
        imagenBase64: body.imagenBase64,
        filename: `E14_PWA_${Date.now()}_P${pagina}.jpg`,
        sizeBytes,
        detalle: decision.motivo,
        analisisJson: JSON.stringify(
          verificacion ? { ...analisis, verificacion, asignacion } : analisis
        ),
        mesaId,
      },
    });
    // La vista del monitor cambió → invalida la caché de consulados
    invalidarCacheConsulados();

    // Resultados de votación extraídos
    if (analisis.resultados.length > 0) {
      await db.resultadoVoto.createMany({
        data: analisis.resultados.map((r) => ({
          actaId: acta.id,
          candidato: r.candidato,
          votos: r.votos,
        })),
      });
    }

    // 5. Anomalía → Bandeja del supervisor (RF-2.2)
    let anomaliaId: string | null = null;
    if (decision.estado === "ANOMALIA") {
      const tipo =
        !analisis.firmasDetectadas
          ? "SIN_FIRMAS"
          : analisis.barcode === null
            ? "CODIGO_NO_DETECTADO"
            : "ILEGIBLE_RESCANEO";

      let consulado = consuladoId
        ? await db.consulado.findUnique({ where: { id: consuladoId } })
        : null;

      const anomalia = await db.anomalia.create({
        data: {
          tipo,
          formulario: `${tipoEjemplar === "DELEGADOS" ? "DELEGADOS" : "TRANSMISIÓN"} - PÁGINA ${pagina}`,
          horaAlertaLocal: horaLocal(consulado?.utcOffsetMin ?? 0),
          horaAlertaCol: horaLocal(0),
          pais: consulado?.pais ?? (analisis.divipol.municipio ?? "SIN UBICAR").toUpperCase(),
          ciudad: consulado?.ciudad ?? (analisis.divipol.consulado ?? "SIN UBICAR").toUpperCase(),
          mesa: analisis.divipol.mesa
            ? `MESA ${String(analisis.divipol.mesa).padStart(3, "0")}`
            : `MESA ${pagina}`,
          mesaIdRef: body.mesaIdRef ?? "mesa-sin-asignar",
          slaMinutesRemaining: 40,
          consuladoId,
          actaId: acta.id,
        },
      });
      anomaliaId = anomalia.id;
    }

    // 6. Audit trail (RNF-03)
    await db.auditEvent.create({
      data: {
        usuario: "PWA-DIG-001",
        accion: decision.estado === "VALIDADO" ? "INGESTA_ACTA" : "ALERTA_ANOMALIA",
        detalle: `${tipoEjemplar} P${pagina} · ${decision.motivo} · Score ${analisis.scoreLetra}`,
      },
    });

    const registro: ActaRegistro = {
      id: acta.id,
      barcode15: acta.barcode15,
      tipoEjemplar,
      pagina,
      totalPaginas,
      estado: decision.estado,
      scoreCalidad: Math.round(analisis.scoreCalidad),
      imagenUrl: acta.imagenUrl ?? `/api/actas/${acta.id}/imagen`,
      filename: acta.filename,
      createdAt: acta.createdAt.toISOString(),
      analisis,
      verificacion,
      asignacion,
    };

    return NextResponse.json({
      ok: true,
      acta: registro,
      analisis,
      decision,
      anomaliaId,
      verificacion,
      asignacion,
    });
  } catch (error) {
    console.error("[actas POST] error:", error);
    return NextResponse.json(
      { ok: false, error: "Error procesando el acta" },
      { status: 500 }
    );
  }
}

function horaLocal(offsetMin: number): string {
  const ahora = new Date(Date.now() + offsetMin * 60000);
  const hh = String(ahora.getUTCHours()).padStart(2, "0");
  const mm = String(ahora.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}${offsetMin === 0 ? " COL" : " LOCAL"}`;
}
