import { NextRequest, NextResponse } from "next/server";
import { Acta, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { analizarActa, decidirEstadoActa } from "@/lib/analisis-acta";
import { verificarActaE14 } from "@/lib/verificar-acta";
import { getConsulateRows, invalidarCacheConsulados } from "@/lib/monitor";
import { requiereSupervisor } from "@/lib/sesion";
import { limitar } from "@/lib/rate-limit";
import { esHuellaQrValida } from "@/lib/scanner/actaParser";
import {
  ActaUploadSchema,
  parsearBody,
  validarImagenBase64,
} from "@/lib/validacion";
import { ZONA_COT, horaEnZona, zonaIanaDePuesto } from "@/lib/hora-zona";
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
 * [OLA5 5.3] La validación vive AHORA en lib/validacion.ts (compartida
 * con /api/actas/analizar, que antes aceptaba cualquier tamaño).
 */

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
    // [OLA5 5.6] La ingesta es la puerta pública del digitalizador
    // (sin credenciales por diseño): 10 actas/min por IP frena el
    // abuso sin tocar el flujo real del operador de mesa.
    const limite = limitar(req, {
      clave: "actas",
      max: 10,
      ventanaMs: 60_000,
    });
    if (!limite.ok) return limite.response;

    // [OLA5 5.3] Body tipado y validado con Zod (antes cast ciego:
    // un campo faltante explotaba en runtime con 500).
    const bodyRes = await parsearBody(req, ActaUploadSchema);
    if (!bodyRes.ok) return bodyRes.response;
    const body: ActaUploadPayload = bodyRes.data;

    const validacion = validarImagenBase64(body.imagenBase64);
    if (!validacion.ok) {
      return NextResponse.json(
        { ok: false, error: validacion.error },
        { status: validacion.status }
      );
    }

    // [OLA5 5.2] El modo manual (contingencia RF-1.5 con votos
    // transcritos a mano) crea actas VALIDADAS que alimentan el
    // escrutinio: es una acción de SUPERVISOR, no del operador de
    // mesa — sin cookie de sesión válida, 403 (la ingesta automática
    // de la PWA sigue siendo pública).
    if (body.modoManual || body.datosManuales?.resultados?.length) {
      const sesion = requiereSupervisor(req);
      if (!sesion.ok) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "El modo manual de contingencia requiere sesión de supervisor (SESIÓN REQUERIDA)",
          },
          { status: 403 }
        );
      }
    }

    const tipoEjemplar = body.tipoEjemplar === "TRANSMISION" ? "TRANSMISION" : "DELEGADOS";
    const pagina = Math.max(1, Math.min(9, body.pagina ?? 1));
    const totalPaginas = Math.max(1, Math.min(9, body.totalPaginas ?? 2));
    const envioEmergencia = Boolean(body.envioEmergencia);

    // 1. Análisis IA (o datos manuales en modo contingencia RF-1.5)
    const analisis = await analizarActa(body.imagenBase64);

    // [OLA4 4.8] Barcode determinista del cliente: en modo manual manda el
    // operador (RF-1.3, comportamiento previo); en modo automático el OCR
    // determinista del dispositivo (C-17) actúa como FALLBACK cuando el VLM
    // no pudo leer el código (analisis.barcode null) — el cliente SOLO
    // rellena el hueco, NUNCA sobreescribe la lectura del VLM. Sin esto un
    // fallo del motor dejaba el acta persistido con barcode15=null aunque
    // el dispositivo sí hubiera leído el código.
    const barcodeCliente =
      body.barcode && /^\d{15}$/.test(body.barcode) ? body.barcode : null;
    if (barcodeCliente && (body.modoManual || analisis.barcode === null)) {
      analisis.barcode = barcodeCliente;
      analisis.barcodeDigitos = {
        tipoEleccion: barcodeCliente.slice(0, 2),
        kitMesa: barcodeCliente.slice(2, 8),
        tipoEjemplar: barcodeCliente.slice(8, 9),
        version: barcodeCliente.slice(9, 11),
        pagina: barcodeCliente.slice(11, 13),
        totalPaginas: barcodeCliente.slice(13, 15),
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
    //    [OLA4-QA] La paginación viaja a la decisión: las firmas del E-14
    //    viven en la hoja FINAL — una P1 con score 9 no puede ser
    //    rechazada por "falta de firmas" (rechazo sistemático de todo P1).
    const decision = body.modoManual
      ? { estado: "VALIDADO" as const, motivo: "Transcripción manual asistida (RF-1.5)" }
      : decidirEstadoActa(analisis, envioEmergencia, { pagina, totalPaginas });

    // 3. Deduplicación por huella QR + reemplazo legítimo [B-01/B-02]
    //    El QR cifrado del E-14 identifica unívocamente el documento físico.
    //    · Sin reemplazoDe → la huella ya existente es un duplicado: se
    //      responde sin crear NADA (antes se persistía un RECHAZADO con la
    //      imagen completa → doble storage + mesa envenenada, B-17/B-13).
    //    · Con reemplazoDe (guard del digitalizador ya decidió REEMPLAZAR
    //      sobre la misma ranura) y hoja previa no VALIDADO → se archiva la
    //      captura anterior y se crea la nueva en la MISMA transacción.
    //    La huella QR (documento físico) manda sobre la ranura declarada.
    //    [OLA4-QA] Re-scan de una hoja RECHAZADA (RN-03 "repite la
    //    captura"): un RECHAZADO no es un registro válido — la MISMA hoja
    //    física debe poder re-entrar sin chocar con la huella de su propio
    //    rechazo (el flujo anterior quedaba muerto en "QR DUPLICADO" para
    //    siempre). Sólo aplica si la nueva captura declara (o computa por
    //    cruce QR↔VLM↔tabla) la MISMA ranura de la hoja rechazada; una
    //    ranura distinta sigue siendo QR DUPLICADO (anti-misfiling).
    //    [OLA5 5.4] Formato de la huella VALIDADO con esHuellaQrValida:
    //    la regex histórica rechazaba el formato real (base64 con
    //    padding `=`) y por eso el helper nunca se pudo conectar; ya
    //    corregida, una huella malformada se rechaza con 400 en vez de
    //    persistir basura como llave única de dedup.
    const qrCrudo = body.qrTexto?.trim() || null;
    if (qrCrudo && !esHuellaQrValida(qrCrudo)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "qrTexto no tiene el formato de huella del E-14 (base64 de 43-44 caracteres)",
        },
        { status: 400 }
      );
    }
    const qrFingerprint = qrCrudo;
    const previa = qrFingerprint
      ? await db.acta.findUnique({ where: { qrFingerprint } })
      : null;
    const ranuraNuevaMesa = asignacion?.mesaId ?? body.mesaIdRef ?? null;
    const rescanDeRechazada =
      previa !== null &&
      previa.estado === "RECHAZADO" &&
      ranuraNuevaMesa !== null &&
      ranuraNuevaMesa === previa.mesaId &&
      tipoEjemplar === previa.tipoEjemplar &&
      pagina === previa.pagina;
    const reemplazoLegitimo =
      (Boolean(previa && body.reemplazoDe) || rescanDeRechazada) &&
      previa !== null &&
      previa.estado !== "VALIDADO";

    if (previa && !reemplazoLegitimo) {
      // Respuesta coherente de duplicado: sin mutación de BD. El cliente
      // ya maneja decision RECHAZADO mostrando el motivo al operador.
      // [OLA4-QA] Si la huella la retiene un RECHAZADO en OTRA ranura,
      // el mensaje lo dice (no fue "digitalizada": fue rechazada).
      return NextResponse.json({
        ok: true,
        duplicado: true,
        acta: registroDeActa(previa),
        decision: {
          estado: "RECHAZADO" as const,
          motivo:
            previa.estado === "RECHAZADO"
              ? `QR DUPLICADO — esta hoja ya fue escaneada y RECHAZADA (${previa.filename ?? previa.id}); verifique la mesa y el ejemplar asignados`
              : `QR DUPLICADO — el documento ya fue digitalizado (${previa.filename ?? previa.id})`,
        },
        anomaliaId: null as string | null,
        verificacion,
        asignacion,
      });
    }

    // 4. Resolver la mesa de destino (mesaIdRef legible, ej. "mesa-roma-002")
    let mesaId: string | null = null;
    let consuladoId: string | null = null;
    let mesaNumero: number | null = null;
    if (body.mesaIdRef) {
      const m = await db.mesa.findFirst({
        where: { id: body.mesaIdRef },
        select: { id: true, consuladoId: true, numero: true },
      });
      if (m) {
        mesaId = m.id;
        consuladoId = m.consuladoId;
        mesaNumero = m.numero;
      }
    }

    // 4.1 [OLA4 4.4] AUTORIDAD DE MESA COMPUTADA: el cruce QR ↔ VLM ↔
    // tabla real (asignacion, paso 1.5) es la evidencia del SERVIDOR. Si
    // resuelve una mesa DISTINTA a la declarada por el cliente, la
    // computada MANDA (se cierra el agujero de integridad electoral
    // donde un cliente podía archivar un acta en la mesa que declarase)
    // y la discrepancia queda registrada en el audit trail. Sin
    // evidencia computada se respeta la declarada (comportamiento
    // previo); si el cliente no declaró nada y el cruce sí resolvió,
    // se archiva en la computada (antes quedaba sin mesa).
    let ubicacionDiscrepante = false;
    if (asignacion?.mesaId && asignacion.mesaId !== (body.mesaIdRef ?? null)) {
      const mesaComputada = await db.mesa.findUnique({
        where: { id: asignacion.mesaId },
        select: { id: true, consuladoId: true, numero: true },
      });
      if (mesaComputada) {
        // El cliente declaró una mesa distinta a la computada → queda
        // registrado como discrepancia de ubicación (audit trail).
        ubicacionDiscrepante = Boolean(body.mesaIdRef);
        mesaId = mesaComputada.id;
        consuladoId = mesaComputada.consuladoId;
        mesaNumero = mesaComputada.numero;
      }
    }
    const consulado = consuladoId
      ? await db.consulado.findUnique({ where: { id: consuladoId } })
      : null;

    // 4.5 [C-17] RESOLUCIÓN DE CONCURRENCIA POR RANURA (TAREA 4.2 del
    // plan PLAN_DIGIELECT_DIGITALIZADOR.md): si dos operarios suben la
    // misma (mesa, tipo, página), el servidor compara qualityScore:
    //   · existente VALIDADO → rechazo (no se sobrescribe una validada)
    //   · nueva ≥ existente + 10 pts → reemplazo legítimo (gana la de
    //     mejor legibilidad; se archiva la anterior como en B-02)
    //   · si no → REEMPLAZO_RECHAZADO_MENOR_CALIDAD (sin mutación)
    // Solo aplica sin huella QR (esa vía ya resuelve en el paso 3).
    let ranuraPrevia: Acta | null = null;
    let reemplazoPorCalidad = false;
    if (!previa && mesaId) {
      const enRanura = await db.acta.findFirst({
        where: {
          mesaId,
          tipoEjemplar,
          pagina,
          estado: { in: ["PENDIENTE", "VALIDADO", "ANOMALIA", "EN_COLA", "OFFLINE"] },
        },
        orderBy: { createdAt: "desc" },
      });
      if (enRanura) {
        // Calidades normalizadas a 0-100 (el server recibe 0-100 del
        // plan; el score VLM persistido es 0-10)
        const calidadNueva = Math.round(
          body.qualityScore ?? (body.scoreCliente ?? analisis.scoreCalidad) * 10
        );
        const calidadExistente = (enRanura.scoreCalidad ?? 0) * 10;
        if (enRanura.estado === "VALIDADO") {
          return NextResponse.json({
            ok: true,
            duplicado: false,
            acta: registroDeActa(enRanura),
            decision: {
              estado: "RECHAZADO" as const,
              motivo: `RANURA YA VALIDADA — ${tipoEjemplar} P${pagina} de esta mesa ya fue registrada y aprobada; no se sobrescribe`,
            },
            anomaliaId: null as string | null,
            verificacion,
            asignacion,
          });
        }
        if (calidadNueva >= calidadExistente + 10) {
          ranuraPrevia = enRanura;
          reemplazoPorCalidad = true;
        } else {
          return NextResponse.json({
            ok: true,
            duplicado: false,
            acta: registroDeActa(enRanura),
            decision: {
              estado: "RECHAZADO" as const,
              motivo: `REEMPLAZO_RECHAZADO_MENOR_CALIDAD — la captura existente (${calidadExistente}/100) conserva mayor o igual legibilidad que la nueva (${calidadNueva}/100)`,
            },
            anomaliaId: null as string | null,
            verificacion,
            asignacion,
          });
        }
      }
    }
    const previaAReemplazar = reemplazoLegitimo ? previa : reemplazoPorCalidad ? ranuraPrevia : null;

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
        // [B-02/C-17] Archivar la captura anterior que se reemplaza:
        // misma huella QR (reemplazo legítimo) O misma ranura con
        // calidad superior +10 (TAREA 4.2). Queda RECHAZADO·REEMPLAZADA
        // (la ranura sigue ocupada por la historia) — nunca se borra.
        if (previaAReemplazar) {
          await tx.acta.update({
            where: { id: previaAReemplazar.id },
            data: {
              estado: "RECHAZADO",
              qrFingerprint: null,
              detalle: `REEMPLAZADA por ${filename} (${decision.estado}) — ${reemplazoLegitimo ? "mismo documento" : "ranura con calidad superior"}, hoja previa ${previaAReemplazar.estado}`,
            },
          });
          reemplazadaActaId = previaAReemplazar.id;
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
            // [OLA4 4.4] El detalle del acta deja constancia de que la
            // mesa fue REASIGNADA por el servidor (no la declarada).
            detalle: ubicacionDiscrepante
              ? `UBICACIÓN DISCREPANTE — mesa declarada ${body.mesaIdRef} ≠ computada ${mesaId} (cruce ${asignacion?.origen}); archivada en la computada · ${decision.motivo}`
              : decision.motivo,
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
        // [B-23] La anomalía referencia la mesa REAL resuelta (PK) o
        // "SIN MESA" — nunca "MESA {pagina}" (el nº de página como mesa)
        // ni códigos DIVIPOL como país/ciudad.
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
              // [OLA6-TZ · 6.8] Hora local del PUESTO (zona por ciudad
              // en países multi-zona; consulado trae el standName en
              // `puesto`, p. ej. "04 - San Francisco - Denver").
              horaAlertaLocal: `${horaEnZona(
                new Date(),
                zonaIanaDePuesto(consulado?.pais, consulado?.puesto)
              )} LOCAL`,
              horaAlertaCol: `${horaEnZona(new Date(), ZONA_COT)} COL`,
              pais: consulado?.pais ?? "SIN UBICAR",
              ciudad: consulado?.ciudad ?? "SIN UBICAR",
              mesa:
                mesaNumero !== null
                  ? `MESA ${String(mesaNumero).padStart(3, "0")}`
                  : "SIN MESA",
              mesaIdRef: mesaId ?? body.mesaIdRef ?? "SIN MESA",
              slaMinutesRemaining: 40,
              consuladoId,
              actaId: acta.id,
            },
          });
          anomaliaId = anomalia.id;
        }

        // [post-4.4] UBICACIÓN DISCREPANTE → bandeja del supervisor:
        // el acta quedó VALIDADA pero archivada en la mesa COMPUTADA
        // (cruce QR↔VLM), no en la que declaró el cliente — alguien
        // declaró mal y el supervisor debe auditarlo. Solo en VALIDADO:
        // con estado ANOMALIA la bandeja ya recibió la causa primaria
        // (y el detalle del acta + AuditEvent llevan la discrepancia);
        // con RECHAZADO el operario repite la hoja y no hay caso que
        // auditar hasta que una captura progrese.
        if (ubicacionDiscrepante && decision.estado === "VALIDADO" && !anomaliaId) {
          const anomalia = await tx.anomalia.create({
            data: {
              tipo: "UBICACION_DISCREPANTE",
              formulario: `${tipoEjemplar === "DELEGADOS" ? "DELEGADOS" : "TRANSMISIÓN"} - PÁGINA ${pagina}`,
              horaAlertaLocal: `${horaEnZona(
                new Date(),
                zonaIanaDePuesto(consulado?.pais, consulado?.puesto)
              )} LOCAL`,
              horaAlertaCol: `${horaEnZona(new Date(), ZONA_COT)} COL`,
              pais: consulado?.pais ?? "SIN UBICAR",
              ciudad: consulado?.ciudad ?? "SIN UBICAR",
              mesa:
                mesaNumero !== null
                  ? `MESA ${String(mesaNumero).padStart(3, "0")}`
                  : "SIN MESA",
              // La referencia apunta a la mesa COMPUTADA (donde quedó
              // archivada); la declarada queda en el detalle del acta
              // y en el AuditEvent UBICACION_DISCREPANTE.
              mesaIdRef: mesaId ?? "SIN MESA",
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
        // [OLA4 4.4] Discrepancia de ubicación: el cliente declaró una
        // mesa distinta a la computada por el cruce QR ↔ VLM ↔ tabla
        // real y el servidor archivó en la computada. Queda en el trail
        // para que el supervisor audite quién declaró mal y qué.
        if (ubicacionDiscrepante) {
          await tx.auditEvent.create({
            data: {
              usuario: "PWA-DIG-001",
              accion: "UBICACION_DISCREPANTE",
              detalle: `${tipoEjemplar} P${pagina} · Mesa declarada ${body.mesaIdRef} difiere de la computada ${asignacion?.mesaId} (origen ${asignacion?.origen}, confianza ${asignacion?.confianza}) · Acta ${filename} archivada en ${mesaId}`,
            },
          });
        }
        if (reemplazadaActaId) {
          await tx.auditEvent.create({
            data: {
              usuario: "PWA-DIG-001",
              accion: "REEMPLAZO_ACTA",
              detalle: `${tipoEjemplar} P${pagina} · ${filename} reemplaza a ${previaAReemplazar?.filename ?? previaAReemplazar?.id} (${reemplazoLegitimo ? "misma huella QR, hoja previa no VALIDADO" : "ranura con calidad superior +10, TAREA 4.2"})`,
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
      // [OLA4 4.4] La mesa declarada por el cliente difirió de la
      // computada y el servidor archivó en la computada (ver asignacion
      // y el AuditEvent UBICACION_DISCREPANTE).
      ubicacionDiscrepante,
      mesaDeclaradaRef: ubicacionDiscrepante ? body.mesaIdRef ?? null : null,
    });
  } catch (error) {
    console.error("[actas POST] error:", error);
    return NextResponse.json(
      { ok: false, error: "Error procesando el acta" },
      { status: 500 }
    );
  }
}
