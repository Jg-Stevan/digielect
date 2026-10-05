import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/batch
 * Acciones sobre la cola de Carga Masiva BATCH (RF-2.4):
 *  - integrar: procesa el archivo identificado por OCR
 *    · RESUELVE_ALERTA → resuelve la anomalía de la mesa referenciada
 *    · NUEVO_REGISTRO → crea el consulado/mesa/acta en el Monitor Global
 *  - remove: elimina el archivo de la cola (descartado)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fileId, action } = body as {
      fileId?: string;
      action?: "integrar" | "remove";
    };

    if (!fileId || !action) {
      return NextResponse.json(
        { ok: false, error: "fileId y action son obligatorios" },
        { status: 400 }
      );
    }

    const archivo = await db.colaArchivo.findUnique({ where: { id: fileId } });
    if (!archivo) {
      return NextResponse.json(
        { ok: false, error: "Archivo no encontrado en la cola" },
        { status: 404 }
      );
    }

    if (action === "remove") {
      await db.colaArchivo.delete({ where: { id: fileId } });
      await db.auditEvent.create({
        data: {
          usuario: "ADM-9482",
          accion: "DESCARTAR_ARCHIVO_BATCH",
          detalle: `${archivo.filename} · ${archivo.location}`,
        },
      });
      return NextResponse.json({ ok: true, accion: "DESCARTADO" });
    }

    // action === "integrar"
    if (archivo.ocrStatus === "DUPLICADO") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No se puede integrar: la página ya fue procesada y aprobada previamente (DUPLICADO).",
        },
        { status: 409 }
      );
    }

    if (archivo.ocrStatus === "RESUELVE_ALERTA" && archivo.resuelveMesaRef) {
      // Resolver la alerta de la mesa referenciada
      const anomalia = await db.anomalia.findFirst({
        where: { mesaIdRef: archivo.resuelveMesaRef, estado: "ABIERTA" },
      });

      if (anomalia) {
        await db.anomalia.update({
          where: { id: anomalia.id },
          data: {
            estado: "APROBADA",
            justificacion: `Resuelta vía carga masiva BATCH: ${archivo.filename}`,
          },
        });
        if (anomalia.actaId) {
          await db.acta.update({
            where: { id: anomalia.actaId },
            data: {
              estado: "VALIDADO",
              detalle: `Recuperado vía BATCH · ${archivo.barcode}`,
            },
          });
        }
      }

      await db.colaArchivo.delete({ where: { id: fileId } });
      await db.auditEvent.create({
        data: {
          usuario: "BATCH-SIG-04",
          accion: "INTEGRAR_BATCH",
          detalle: `${archivo.filename} integrado · Resuelve alerta ${anomalia?.mesa ?? archivo.resuelveMesaRef} · Barcode ${archivo.barcode}`,
        },
      });

      return NextResponse.json({
        ok: true,
        accion: "ALERTA_RESUELTA",
        mensaje: `Archivo integrado. Alerta de ${anomalia?.ciudad ?? "mesa"} ${anomalia?.mesa ?? ""} resuelta.`,
      });
    }

    if (archivo.ocrStatus === "NUEVO_REGISTRO") {
      // Crear o actualizar registro en el Monitor Global (USA > MIAMI > MESA 005)
      const partes = archivo.location.split(">");
      const pais = (partes[0] ?? "NUEVO").trim();
      const ciudad = (partes[1] ?? "MESA").trim();
      const matchMesa = archivo.location.match(/MESA\s+(\d+)/i);
      const numMesa = matchMesa ? parseInt(matchMesa[1], 10) : 1;

      let consulado = await db.consulado.findFirst({
        where: { pais: { equals: pais }, ciudad: { equals: ciudad } },
      });

      if (!consulado) {
        const total = await db.consulado.count();
        consulado = await db.consulado.create({
          data: {
            codigo: `9${String(100 + total).slice(-3)}`,
            pais,
            ciudad,
            puesto: `${pad2(numMesa)} - ${ciudad}`,
            zona: "99",
            region: "america",
            numMesas: 1,
            horaCierreLocal: "16:00",
            horaCierreColombia: "3:00 PM",
            horaActualPais: "1:00 PM",
            tiempoDesdeCierre: "< 1 Hr",
            utcOffsetMin: 60,
            orden: total,
          },
        });
      }

      let mesa = await db.mesa.findFirst({
        where: { consuladoId: consulado.id, numero: numMesa },
      });
      if (!mesa) {
        mesa = await db.mesa.create({
          data: { numero: numMesa, consuladoId: consulado.id, orden: 0 },
        });
      }

      const yaExiste = await db.acta.findFirst({
        where: { barcode15: archivo.barcode },
      });
      if (!yaExiste) {
        await db.acta.create({
          data: {
            barcode15: archivo.barcode,
            tipoEjemplar: "DELEGADOS",
            pagina: 1,
            totalPaginas: 2,
            estado: "VALIDADO",
            scoreCalidad: Math.round((archivo.ocrConfidence ?? 94) / 10),
            filename: archivo.filename,
            sizeBytes: parseSize(archivo.size),
            detalle: `Ingresado vía BATCH · Confianza OCR ${archivo.ocrConfidence ?? 94}%`,
            mesaId: mesa.id,
          },
        });
      }

      await db.colaArchivo.delete({ where: { id: fileId } });
      await db.auditEvent.create({
        data: {
          usuario: "BATCH-SIG-04",
          accion: "INTEGRAR_BATCH",
          detalle: `${archivo.filename} integrado · Nuevo registro ${pais} > ${ciudad} > MESA ${pad3(numMesa)} · Barcode ${archivo.barcode}`,
        },
      });

      return NextResponse.json({
        ok: true,
        accion: "NUEVO_REGISTRO",
        mensaje: `Archivo integrado. ${ciudad} > Mesa ${pad3(numMesa)} agregado al Monitor Global.`,
      });
    }

    return NextResponse.json(
      { ok: false, error: "Estado OCR no soportado para integración" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[batch] error:", error);
    return NextResponse.json(
      { ok: false, error: "Error procesando la acción BATCH" },
      { status: 500 }
    );
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function pad3(n: number): string {
  return String(n).padStart(3, "0");
}
function parseSize(size: string): number {
  const mb = parseFloat(size.replace("MB", "").trim());
  return isNaN(mb) ? 0 : Math.round(mb * 1024 * 1024);
}
