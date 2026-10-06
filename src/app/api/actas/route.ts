import { NextRequest, NextResponse } from "next/server";
import { Acta, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { analizarActa, decidirEstadoActa } from "@/lib/analisis-acta";
import { verificarActaE14 } from "@/lib/verificar-acta";
import { getConsulateRows, invalidarCacheConsulados } from "@/lib/monitor";
import type {
  ActaEstado,
  ActaRegistro,
  ActaUploadPayload,
  AsignacionActa,
  ConsulateRow,
  TipoEjemplar,
  VerificacionActa,
} from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * [B-08] Límite de tamaño de la imagen de ingesta (~8 MB decodificados).
 * La PWA comprime a ~300 KB, pero el servidor no debe aceptar payloads
 * arbitrarios (RAM en cada rebuild + costo VLM sin cota).
 */
const LIMITE_IMAGEN_BYTES = 8 * 1024 * 1024;

type ValidacionImagen =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * [B-08] Valida imagenBase64: data URL image/* (o base64 crudo), charset
 * base64 y límite de tamaño. Sin esto cualquier payload entraba íntegro a
 * SQLite y al VLM.
 */
function validarImagenBase64(crudo: string): ValidacionImagen {
  let b64 = crudo;
  if (crudo.startsWith("data:")) {
    const coma = crudo.indexOf(",");
    if (coma < 0) {
      return { ok: false, error: "imagenBase64: data URL sin coma", status: 400 };
    }
    const meta = crudo.slice(0, coma);
    const mime = meta.match(/^data:([^;,]+)[^,]*$/)?.[1] ?? "";
    if (!mime.startsWith("image/")) {
      return {
        ok: false,
        error: "imagenBase64 debe ser una imagen (data:image/…;base64,…)",
        status: 400,
      };
    }
    b64 = crudo.slice(coma + 1);
  }
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    return { ok: false, error: "imagenBase64 no es base64 válido", status: 400 };
  }
  const bytes = Math.floor((b64.length * 3) / 4);
  if (bytes > LIMITE_IMAGEN_BYTES) {
    return {
      ok: false,
      error: `imagenBase64 excede el límite de ~8 MB (${(bytes / 1048576).toFixed(1)} MB)`,
      status: 413,
    };
  }
  return { ok: true };
}

function registroDeActa(acta: Acta): ActaRegistro {
  return {
    id: acta.id,
    barcode15: acta.barcode15,
    tipoEjemplar: acta.tipoEjemplar as TipoEjemplar,
    pagina: acta.pagina,
    totalPaginas: acta.totalPaginas,
    estado: acta.estado as ActaEstado,
    scoreCalidad: acta.scoreCalidad,
    imagenUrl: acta.imagenUrl ?? `/api/actas/${acta.id}/imagen`,
    filename: acta.filename,
    createdAt: acta.createdAt.toISOString(),
  };
}

/**
 * POST /api/actas
 * Ingesta de un acta E-14 desde la PWA Digitalizador:
 *  1. Valida el payload (imagen ≤ ~8 MB) [B-08]
 *  1.5 Analiza la imagen con visión artificial + cruce QR ↔ VLM
 *  2. Aplica las reglas RN-02 / RN-03 (aprobada / advertencia / rechazada)
 *  3. Deduplicación por huella QR + reemplazos legítimos [B-01/B-02]
 *  4. Persiste TODO (acta + resultados + anomalía + auditoría) en UNA
 *     transacción; la unicidad de qrFingerprint cierra la carrera [B-01]
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
    const validacion = validarImagenBase64(body.imagenBase64);
    if (!validacion.ok) {
      return NextResponse.json(
        { ok: false, error: validacion.error },
        { status: validacion.status }
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

    // 2. Decisión según reglas de negocio
    const decision = body.modoManual
      ? { estado: "VALIDADO" as const, motivo: "Transcripción manual asistida (RF-1.5)" }
      : decidirEstadoActa(analisis, envioEmergencia);

    // 3. Deduplicación por huella QR + reemplazo legítimo [B-01/B-02]
    //    El QR cifrado del E-14 identifica unívocamente el documento físico.
    //    · Sin reemplazoDe → la huella ya existente es un duplicado: se
    //      responde sin crear NADA (antes se persistía un RECHAZADO con la
    //      imagen completa → doble storage + mesa envenenada, B-17/B-13).
    //    · Con reemplazoDe (guard del digitalizador ya decidió REEMPLAZAR
    //      sobre la misma ranura) y hoja previa no VALIDADO → se archiva la
    //      captura anterior y se crea la nueva en la MISMA transacción.
    //    La huella QR (documento físico) manda sobre la ranura declarada.
    const qrFingerprint = body.qrTexto?.trim() || null;
    const previa = qrFingerprint
      ? await db.acta.findUnique({ where: { qrFingerprint } })
      : null;
    const reemplazoLegitimo =
      Boolean(previa && body.reemplazoDe) && previa !== null && previa.estado !== "VALIDADO";

    if (previa && !reemplazoLegitimo) {
      // Respuesta coherente de duplicado: sin mutación de BD. El cliente
      // ya maneja decision RECHAZADO mostrando el motivo al operador.
      return NextResponse.json({
        ok: true,
        duplicado: true,
        acta: registroDeActa(previa),
        decision: {
          estado: "RECHAZADO" as const,
          motivo: `QR DUPLICADO — el documento ya fue digitalizado (${previa.filename ?? previa.id})`,
        },
        anomaliaId: null as string | null,
        verificacion,
        asignacion,
      });
    }

    // 4. Resolver la mesa de destino (mesaIdRef legible, ej. "mesa-roma-002")
    let mesaId: string | null = null;
    let consuladoId: string | null = null;
    if (body.mesaIdRef) {
      const m = await db.mesa.findFirst({
        where: { id: body.mesaIdRef },
        select: { id: true, consuladoId: true },
      });
      if (m) {
        mesaId = m.id;
        consuladoId = m.consuladoId;
      }
    }
    const consulado = consuladoId
      ? await db.consulado.findUnique({ where: { id: consuladoId } })
      : null;

    // 5. Persistir [B-01]: acta + resultados + anomalía + auditoría (y el
    //    archivado de la captura reemplazada) en UNA transacción. La
    //    restricción @unique(qrFingerprint) del schema convierte cualquier
    //    carrera residual (dos POST simultáneos con el mismo QR) en un
    //    P2002 que se responde como duplicado, nunca como 500 ni como fila
    //    duplicada.
    const sizeBytes = Math.round((body.imagenBase64.length * 3) / 4);
    const filename = `E14_PWA_${Date.now()}_P${pagina}.jpg`;
    const esAnomalia = decision.estado === "ANOMALIA";

    let actaCreada: Acta;
    let anomaliaId: string | null = null;
    let reemplazadaActaId: string | null = null;

    try {
      const resultadoTx = await db.$transaction(async (tx) => {
        // [B-02] Archivar la captura anterior del MISMO documento físico:
        // queda RECHAZADO·REEMPLAZADA (la ranura sigue ocupada por la
        // historia, la huella QR viaja al acta vigente) — nunca se borra.
        if (reemplazoLegitimo && previa) {
          await tx.acta.update({
            where: { id: previa.id },
            data: {
              estado: "RECHAZADO",
              qrFingerprint: null,
              detalle: `REEMPLAZADA por ${filename} (${decision.estado}) — mismo documento, hoja previa ${previa.estado}`,
            },
          });
          reemplazadaActaId = previa.id;
        }

        const acta = await tx.acta.create({
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
            filename,
            sizeBytes,
            detalle: decision.motivo,
            analisisJson: JSON.stringify(
              verificacion ? { ...analisis, verificacion, asignacion } : analisis
            ),
            mesaId,
          },
        });

        // Resultados de votación extraídos
        if (analisis.resultados.length > 0) {
          await tx.resultadoVoto.createMany({
            data: analisis.resultados.map((r) => ({
              actaId: acta.id,
              candidato: r.candidato,
              votos: r.votos,
            })),
          });
        }

        // Anomalía → Bandeja del supervisor (RF-2.2)
        if (esAnomalia) {
          const tipo =
            !analisis.firmasDetectadas
              ? "SIN_FIRMAS"
              : analisis.barcode === null
                ? "CODIGO_NO_DETECTADO"
                : "ILEGIBLE_RESCANEO";
          const anomalia = await tx.anomalia.create({
            data: {
              tipo,
              formulario: `${tipoEjemplar === "DELEGADOS" ? "DELEGADOS" : "TRANSMISIÓN"} - PÁGINA ${pagina}`,
              horaAlertaLocal: horaLocal(consulado?.utcOffsetMin ?? 0),
              horaAlertaCol: horaLocal(0),
              pais: consulado?.pais ?? (analisis.divipol.municipio ?? "SIN UBICAR").toUpperCase(),
              ciudad:
                consulado?.ciudad ?? (analisis.divipol.consulado ?? "SIN UBICAR").toUpperCase(),
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

        // Audit trail (RNF-03)
        await tx.auditEvent.create({
          data: {
            usuario: "PWA-DIG-001",
            accion:
              decision.estado === "VALIDADO"
                ? "INGESTA_ACTA"
                : esAnomalia
                  ? "ALERTA_ANOMALIA"
                  : "INGESTA_RECHAZADA",
            detalle: `${tipoEjemplar} P${pagina} · ${decision.motivo} · Score ${analisis.scoreLetra}`,
          },
        });
        if (reemplazadaActaId) {
          await tx.auditEvent.create({
            data: {
              usuario: "PWA-DIG-001",
              accion: "REEMPLAZO_ACTA",
              detalle: `${tipoEjemplar} P${pagina} · ${filename} reemplaza a ${previa?.filename ?? previa?.id} (misma huella QR, hoja previa no VALIDADO)`,
            },
          });
        }

        return { acta, anomaliaId };
      });

      actaCreada = resultadoTx.acta;
      anomaliaId = resultadoTx.anomaliaId;
    } catch (error) {
      // [B-01] Carrera perdida: otro POST creó el acta con la misma huella
      // entre nuestro findUnique y el create. La unicidad de la BD decide:
      // exactamente 1 acta gana, el perdedor responde duplicado.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const ganadora = qrFingerprint
          ? await db.acta.findUnique({ where: { qrFingerprint } })
          : null;
        invalidarCacheConsulados();
        return NextResponse.json({
          ok: true,
          duplicado: true,
          acta: ganadora ? registroDeActa(ganadora) : undefined,
          decision: {
            estado: "RECHAZADO" as const,
            motivo: `QR DUPLICADO — el documento acaba de ser digitalizado por otra captura (${ganadora?.filename ?? "concurrente"})`,
          },
          anomaliaId: null as string | null,
          verificacion,
          asignacion,
        });
      }
      throw error;
    }

    // La vista del monitor cambió → invalida la caché de consulados
    // (SIEMPRE después del commit: nunca cacheamos estado parcial).
    invalidarCacheConsulados();

    const registro: ActaRegistro = {
      id: actaCreada.id,
      barcode15: actaCreada.barcode15,
      tipoEjemplar,
      pagina,
      totalPaginas,
      estado: decision.estado,
      scoreCalidad: Math.round(analisis.scoreCalidad),
      imagenUrl: actaCreada.imagenUrl ?? `/api/actas/${actaCreada.id}/imagen`,
      filename: actaCreada.filename,
      createdAt: actaCreada.createdAt.toISOString(),
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
      reemplazadaActaId,
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
