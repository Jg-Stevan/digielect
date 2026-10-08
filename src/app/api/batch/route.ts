import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { invalidarCacheConsulados } from "@/lib/monitor";
import { requiereSupervisor } from "@/lib/sesion";
import { BatchSchema, parsearBody } from "@/lib/validacion";
import {
  COT_OFFSET_MIN,
  ZONA_COT,
  horaEnZona,
  minutosDelDiaEnZona,
  offsetZoneMin,
  zonaIanaDePuesto,
} from "@/lib/hora-zona";

export const dynamic = "force-dynamic";

/**
 * POST /api/batch
 * Acciones sobre la cola de Carga Masiva BATCH (RF-2.4):
 *  - integrar: procesa el archivo identificado por OCR
 *    · RESUELVE_ALERTA → resuelve la anomalía de la mesa referenciada
 *    · NUEVO_REGISTRO → crea el consulado/mesa/acta en el Monitor Global
 *  - remove: elimina el archivo de la cola (descartado)
 *
 * [OLA4 4.10] Cada acción persiste TODAS sus escrituras en UNA
 * transacción (anomalía + acta + cola + auditoría; consulado + mesa +
 * acta + cola + auditoría): antes un fallo intermedio dejaba el archivo
 * integrado a medias (alerta resuelta sin acta, consulado creado sin
 * mesa…) y el findFirst→create fuera de transacción era TOCTOU (dos
 * integraciones concurrentes duplicaban consulados).
 *
 * [OLA4 4.10 · A-10] Los consulados nuevos nacen con datos REALES del
 * país: región/zona/horario derivados de los consulados ya cargados
 * (949 puestos reales del visor E-14) con respaldo por zona IANA
 * (Europe/→europa…). Antes TODO consulado nuevo nacía en "america"
 * con offset +60 y cierre "16:00/3:00 PM" aunque el país fuese Italia.
 * Tras mutar el monitor se invalida la caché de consulados.
 *
 * [OLA5 5.2] Ruta MUTANTE del supervisor: exige cookie de sesión válida
 * (401 si no) y el audit trail lleva el usuario REAL de la sesión.
 * [OLA5 5.3] Body validado con Zod (antes cast ciego).
 */

/**
 * [OLA4 4.10 · A-10] Región real de un país, derivada de su zona IANA
 * (hora-zona.ts mapea los 67 países del exterior E-14). Un país sin
 * zona mapeada cae al mismo respaldo que usa el seed ("asia").
 * [OLA6-TZ · 6.8] `lugar` (ciudad/puesto) opcional: la zona por
 * ciudad no cambia la región, pero mantiene una sola vía de
 * resolución de zona en la ruta.
 */
function regionDePais(pais: string, lugar?: string | null): string {
  const iana = zonaIanaDePuesto(pais, lugar);
  if (iana === ZONA_COT) return "asia";
  if (iana.startsWith("Europe/")) return "europa";
  if (iana.startsWith("America/")) return "america";
  if (iana.startsWith("Asia/")) return "asia";
  if (iana.startsWith("Africa/")) return "africa";
  if (iana.startsWith("Pacific/")) return "oceania";
  return "asia";
}

/**
 * [OLA4 4.10 · A-10] Hora Colombia equivalente al cierre local del país
 * (DST vigente) — misma lógica que horaCierreCol de prisma/seed.ts.
 * [OLA6-TZ · 6.8] `lugar` (ciudad del location BATCH) para países
 * multi-zona (EE.UU./Canadá/Brasil…).
 */
function horaCierreColombiaDe(
  pais: string,
  horaCierreLocal: string,
  lugar?: string | null
): string {
  const ahora = new Date();
  const off = offsetZoneMin(ahora, zonaIanaDePuesto(pais, lugar));
  const offCol = offsetZoneMin(ahora, ZONA_COT);
  const partes = horaCierreLocal.split(":").map((p) => parseInt(p, 10));
  const hh = isNaN(partes[0]) ? 16 : partes[0];
  const mm = isNaN(partes[1]) ? 0 : partes[1];
  const local = new Date(ahora.getTime() + off * 60000);
  const cierreUtcMs =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hh, mm) -
    off * 60000;
  const col = new Date(cierreUtcMs + offCol * 60000);
  const hh24 = col.getUTCHours();
  const ampm = hh24 >= 12 ? "PM" : "AM";
  const hh12 = hh24 % 12 === 0 ? 12 : hh24 % 12;
  return `${hh12}:${String(col.getUTCMinutes()).padStart(2, "0")} ${ampm}`;
}

/**
 * [OLA4 4.10 · A-10] Etiqueta de tiempo respecto al cierre local —
 * mismo criterio vivo del monitor (tiempoDesdeCierreLabel).
 * [OLA6-TZ · 6.8] `lugar` (ciudad del location BATCH) para países
 * multi-zona.
 */
function tiempoDesdeCierreDe(
  horaCierreLocal: string,
  pais: string,
  lugar?: string | null
): string {
  const partes = horaCierreLocal.split(":").map((p) => parseInt(p, 10));
  const cierreMin =
    (isNaN(partes[0]) ? 16 : partes[0]) * 60 + (isNaN(partes[1]) ? 0 : partes[1]);
  const delta =
    minutosDelDiaEnZona(new Date(), zonaIanaDePuesto(pais, lugar)) - cierreMin;
  if (delta < 0) {
    const hh = String(Math.floor(cierreMin / 60)).padStart(2, "0");
    const mm = String(cierreMin % 60).padStart(2, "0");
    return `CIERRA ${hh}:${mm}`;
  }
  const hrs = Math.floor(delta / 60);
  const mins = delta % 60;
  if (hrs > 0) return `HACE ${hrs}h ${mins}m`;
  return `HACE ${mins}m`;
}

export async function POST(req: NextRequest) {
  try {
    // [OLA5 5.2] Integrar/descargar archivos de la cola es acción de
    // supervisor: sin cookie de sesión válida, 401.
    const sesion = requiereSupervisor(req);
    if (!sesion.ok) return sesion.response;

    const body = await parsearBody(req, BatchSchema);
    if (!body.ok) return body.response;
    const { fileId, action } = body.data;

    const archivo = await db.colaArchivo.findUnique({ where: { id: fileId } });
    if (!archivo) {
      return NextResponse.json(
        { ok: false, error: "Archivo no encontrado en la cola" },
        { status: 404 }
      );
    }

    if (action === "remove") {
      // [OLA4 4.10] Descarte + auditoría en una sola transacción
      await db.$transaction(async (tx) => {
        await tx.colaArchivo.delete({ where: { id: fileId } });
        await tx.auditEvent.create({
          data: {
            usuario: sesion.usuario,
            accion: "DESCARTAR_ARCHIVO_BATCH",
            detalle: `${archivo.filename} · ${archivo.location}`,
          },
        });
      });
      invalidarCacheConsulados();
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

      // [OLA4 4.10] Anomalía + acta + cola + auditoría en UNA
      // transacción: si no hay anomalía abierta, el archivo igual se
      // descarta con su auditoría (comportamiento previo).
      await db.$transaction(async (tx) => {
        if (anomalia) {
          await tx.anomalia.update({
            where: { id: anomalia.id },
            data: {
              estado: "APROBADA",
              justificacion: `Resuelta vía carga masiva BATCH: ${archivo.filename}`,
            },
          });
          if (anomalia.actaId) {
            await tx.acta.update({
              where: { id: anomalia.actaId },
              data: {
                estado: "VALIDADO",
                detalle: `Recuperado vía BATCH · ${archivo.barcode}`,
              },
            });
          }
        }

        await tx.colaArchivo.delete({ where: { id: fileId } });
        await tx.auditEvent.create({
          data: {
            usuario: sesion.usuario,
            accion: "INTEGRAR_BATCH",
            detalle: `${archivo.filename} integrado · Resuelve alerta ${anomalia?.mesa ?? archivo.resuelveMesaRef} · Barcode ${archivo.barcode}`,
          },
        });
      });

      // La bandeja de anomalías / ranura referenciada cambió → invalida
      invalidarCacheConsulados();

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
      // [OLA4 4.10] Zona DIVIPOL real del location
      // ("ITALIA > ROMA > Z. 01 > P. 01 > MESA 001") — antes zona fija "99"
      const zonaLoc = archivo.location.match(/Z\.\s*(\d+)/i)?.[1] ?? null;

      // [OLA4 4.10 · A-10] Datos REALES del país: los consulados ya
      // cargados del mismo país (los 949 puestos del visor E-14
      // cubren los 67 países del exterior) dictan región y horario de
      // cierre; respaldo por zona IANA (offset DST-correcto respecto a
      // Bogotá). Antes TODO nacía "america" con offset +60 fijo.
      const mismoPais = await db.consulado.findFirst({
        where: { pais },
        select: { region: true, utcOffsetMin: true, horaCierreLocal: true },
      });
      const region = mismoPais?.region ?? regionDePais(pais, ciudad);
      const horaCierreLocal = mismoPais?.horaCierreLocal ?? "16:00";
      const utcOffsetMin =
        mismoPais?.utcOffsetMin ??
        offsetZoneMin(new Date(), zonaIanaDePuesto(pais, ciudad)) - COT_OFFSET_MIN;

      // [OLA4 4.10] Consulado + mesa + acta + cola + auditoría en UNA
      // transacción (el findFirst→create anterior era TOCTOU: dos
      // integraciones concurrentes duplicaban consulados).
      await db.$transaction(async (tx) => {
        let consulado = await tx.consulado.findFirst({
          where: { pais: { equals: pais }, ciudad: { equals: ciudad } },
        });

        if (!consulado) {
          const total = await tx.consulado.count();
          consulado = await tx.consulado.create({
            data: {
              codigo: `9${String(100 + total).slice(-3)}`,
              pais,
              ciudad,
              puesto: `${pad2(numMesa)} - ${ciudad}`,
              zona: zonaLoc ?? "99",
              region,
              numMesas: Math.max(1, numMesa),
              horaCierreLocal,
              horaCierreColombia: horaCierreColombiaDe(pais, horaCierreLocal, ciudad),
              horaActualPais: horaEnZona(new Date(), zonaIanaDePuesto(pais, ciudad)),
              tiempoDesdeCierre: tiempoDesdeCierreDe(horaCierreLocal, pais, ciudad),
              utcOffsetMin,
              orden: total,
            },
          });
        }

        let mesa = await tx.mesa.findFirst({
          where: { consuladoId: consulado.id, numero: numMesa },
        });
        if (!mesa) {
          mesa = await tx.mesa.create({
            data: { numero: numMesa, consuladoId: consulado.id, orden: 0 },
          });
        }

        const yaExiste = await tx.acta.findFirst({
          where: { barcode15: archivo.barcode },
        });
        if (!yaExiste) {
          await tx.acta.create({
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

        await tx.colaArchivo.delete({ where: { id: fileId } });
        await tx.auditEvent.create({
          data: {
            usuario: sesion.usuario,
            accion: "INTEGRAR_BATCH",
            detalle: `${archivo.filename} integrado · Nuevo registro ${pais} > ${ciudad} > MESA ${pad3(numMesa)} · Barcode ${archivo.barcode}`,
          },
        });
      });

      // El monitor cambió (posible consulado/mesa/acta nuevos) → invalida
      invalidarCacheConsulados();

      return NextResponse.json({
        ok: true,
        accion: "NUEVO_REGISTRO",
        mensaje: `Archivo integrado. ${ciudad} > Mesa ${pad3(numMesa)} agregado al Monitor Global.`,
        region,
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
