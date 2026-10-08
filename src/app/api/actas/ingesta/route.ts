import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";
import { VERSION_CONTRATO } from "@/lib/contrato/types";

export const dynamic = "force-dynamic";

// ============================================================
// [FASE-6 · PLAN-SEPARACIÓN] POST /api/actas/ingesta
// Canal de integración POR DATOS con la PWA del jurado
// (digielect-digitalizador). REGLA DE PRODUCTO: los votos
// manuscritos no se procesan — solo ruteo por campos impresos.
//
// Multipart: datos (JSON IngestaDatos) + original + procesada (blobs).
// Auth: Authorization: Bearer <TokenDispositivo activo>.
// CORS: sólo el origen del digitalizador (env DIGITALIZADOR_ORIGIN).
//
// Validaciones (baratas, sin re-OCR — el OCR del dispositivo es HINT):
//  · contrato versionContrato compatible (misma MAYOR)
//  · mesaId existe en el catálogo
//  · coherencia con el puesto del token / ocr.mesaIdSugerido
//  · dedupe por hashImagen (sha256 de la procesada)
// Estado: score ≥ 75 → aceptada · 50-74 o contingencia → revision ·
// conflictos de ruteo → conflicto.
// ============================================================

/** Origen permitido del digitalizador (env; vacío = sin CORS estricto en dev). */
const ORIGEN_DIGITALIZADOR = (process.env.DIGITALIZADOR_ORIGIN ?? "").replace(/\/+$/, "");

const cabecerasCors = (origen: string | null): Record<string, string> => {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  };
  if (origen && ORIGEN_DIGITALIZADOR && origen === ORIGEN_DIGITALIZADOR) {
    headers["Access-Control-Allow-Origin"] = origen;
  }
  return headers;
};

const errorJson = (status: number, cuerpo: Record<string, unknown>, origen: string | null) =>
  NextResponse.json(cuerpo, { status, headers: cabecerasCors(origen) });

/** Compatibilidad semver: misma versión MAYOR. */
function contratoCompatible(version: string | undefined): boolean {
  if (!version) return false;
  const mayor = (v: string) => Number.parseInt(v.split(".")[0] ?? "", 10);
  const a = mayor(version);
  return Number.isFinite(a) && a === mayor(VERSION_CONTRATO);
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cabecerasCors(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const origen = req.headers.get("origin");
  try {
    // ----------------------------------------------------------
    // 1) CORS: sólo el origen del digitalizador pasa preflight
    // ----------------------------------------------------------
    if (ORIGEN_DIGITALIZADOR && origen && origen !== ORIGEN_DIGITALIZADOR) {
      return errorJson(403, { error: "Origen no permitido" }, origen);
    }

    // ----------------------------------------------------------
    // 2) Auth: Bearer → TokenDispositivo activo → puesto
    // ----------------------------------------------------------
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) {
      return errorJson(401, { error: "Token de dispositivo requerido", codigo: "TOKEN_INVALIDO" }, origen);
    }
    const tokenRow = await db.tokenDispositivo.findUnique({ where: { token } });
    if (!tokenRow || !tokenRow.activo) {
      return errorJson(401, { error: "Token de dispositivo inválido o revocado", codigo: "TOKEN_INVALIDO" }, origen);
    }

    // ----------------------------------------------------------
    // 3) Multipart: datos + original + procesada
    // ----------------------------------------------------------
    const form = await req.formData().catch(() => null);
    if (!form) {
      return errorJson(400, { error: "Se espera multipart/form-data", codigo: "PAYLOAD_INVALIDO" }, origen);
    }
    const datosRaw = form.get("datos");
    const original = form.get("original");
    const procesada = form.get("procesada");
    if (typeof datosRaw !== "string" || !(original instanceof Blob) || !(procesada instanceof Blob)) {
      return errorJson(400, { error: "Partes requeridas: datos (JSON), original, procesada", codigo: "PAYLOAD_INVALIDO" }, origen);
    }
    let datos: {
      acta?: {
        id?: string;
        mesaId?: string;
        versionContrato?: string;
        calidad?: { score?: number };
        ocr?: { mesaIdSugerido?: string | null };
        origen?: string;
        manual?: boolean;
        [k: string]: unknown;
      };
      hashImagen?: string;
      dispositivo?: string;
    };
    try {
      datos = JSON.parse(datosRaw);
    } catch {
      return errorJson(400, { error: "datos no es JSON válido", codigo: "PAYLOAD_INVALIDO" }, origen);
    }
    const acta = datos.acta ?? {};
    if (!acta.id || !acta.mesaId) {
      return errorJson(400, { error: "acta.id y acta.mesaId son requeridos", codigo: "PAYLOAD_INVALIDO" }, origen);
    }

    // ----------------------------------------------------------
    // 4) Contrato compatible (misma MAYOR)
    // ----------------------------------------------------------
    if (!contratoCompatible(acta.versionContrato)) {
      return errorJson(400, {
        error: `Contrato incompatible (cliente ${acta.versionContrato ?? "?"} vs servidor ${VERSION_CONTRATO})`,
        codigo: "CONTRATO_INCOMPATIBLE",
      }, origen);
    }

    // ----------------------------------------------------------
    // 5) Mesa existe en el catálogo
    // ----------------------------------------------------------
    const mesa = await db.mesa.findUnique({
      where: { id: acta.mesaId },
      include: { consulado: { select: { codigo: true, ciudad: true } } },
    });
    if (!mesa) {
      return errorJson(404, { error: `Mesa inexistente: ${acta.mesaId}`, codigo: "MESA_INEXISTENTE" }, origen);
    }

    // ----------------------------------------------------------
    // 6) Dedupe por hash (sha256 de la imagen PROCESADA)
    // ----------------------------------------------------------
    const bufProcesada = Buffer.from(await procesada.arrayBuffer());
    const hash = createHash("sha256").update(bufProcesada).digest("hex");
    // El hash declarado se usa si viene válido (≥16 hex); si el cliente
    // no lo calculó, el servidor usa el suyo (nunca colisiona por vacío).
    const hashDeclarado =
      typeof datos.hashImagen === "string" && /^[0-9a-f]{16,}$/i.test(datos.hashImagen)
        ? datos.hashImagen.toLowerCase()
        : hash;
    const previa = await db.actaIngesta.findUnique({ where: { hashImagen: hashDeclarado } });
    if (previa) {
      return NextResponse.json(
        {
          estado: previa.estado,
          motivo: "Imagen duplicada (hash ya registrado)",
          id: previa.id,
          duplicado: true,
        },
        { headers: cabecerasCors(origen) }
      );
    }

    // ----------------------------------------------------------
    // 7) Coherencia de ruteo → conflicto
    // ----------------------------------------------------------
    let conflicto: string | null = null;
    if (mesa.consulado.codigo !== tokenRow.puestoId) {
      conflicto = `Ruteo discrepa: el token es del puesto ${tokenRow.puestoId} pero la mesa pertenece a ${mesa.consulado.codigo}`;
    } else if (acta.ocr?.mesaIdSugerido && acta.ocr.mesaIdSugerido !== acta.mesaId) {
      conflicto = `Ruteo discrepa: OCR sugiere ${acta.ocr.mesaIdSugerido} pero el acta declara ${acta.mesaId}`;
    }

    // ----------------------------------------------------------
    // 8) Estado por score / origen (plan §8.2)
    // ----------------------------------------------------------
    const score = typeof acta.calidad?.score === "number" ? acta.calidad.score : 0;
    const origenActa = acta.origen === "masiva" || acta.origen === "contingencia" ? acta.origen : "captura";
    let estado: "aceptada" | "revision" | "conflicto";
    let motivo: string | null = null;
    if (conflicto) {
      estado = "conflicto";
      motivo = conflicto;
    } else if (origenActa === "contingencia") {
      estado = "revision";
      motivo = "Guardada en contingencia por el jurado";
    } else if (score >= 75) {
      estado = "aceptada";
    } else {
      estado = "revision";
      motivo = `Score ${Math.round(score)} (< 75)`;
    }

    // ----------------------------------------------------------
    // 9) Persistir: imágenes a disco + fila ActaIngesta + ultimaVez
    // ----------------------------------------------------------
    const dirIngesta = join(process.cwd(), "uploads", "ingesta");
    await mkdir(dirIngesta, { recursive: true });
    const extProcesada = (procesada.type || "image/png").includes("jpeg") ? "jpg" : "png";
    const extOriginal = (original.type || "image/jpeg").includes("png") ? "png" : "jpg";
    const rutaProcesada = join(dirIngesta, `${acta.id}-procesada.${extProcesada}`);
    const rutaOriginal = join(dirIngesta, `${acta.id}-original.${extOriginal}`);
    await Promise.all([
      writeFile(rutaProcesada, bufProcesada),
      writeFile(rutaOriginal, Buffer.from(await original.arrayBuffer())),
    ]);

    const datosCompletos = {
      ...datos,
      acta: {
        ...acta,
        // rutas servidas por la API (ver /api/actas/ingesta/[id]/imagen)
        imagenOriginalUrl: `/api/actas/ingesta/${acta.id}/imagen?tipo=original`,
        imagenProcesadaUrl: `/api/actas/ingesta/${acta.id}/imagen?tipo=procesada`,
      },
    };

    const fila = await db.actaIngesta.create({
      data: {
        id: acta.id,
        mesaId: acta.mesaId,
        tokenPuesto: tokenRow.puestoId,
        estado,
        motivo,
        score,
        ocrMesaId: acta.ocr?.mesaIdSugerido ?? null,
        hashImagen: hashDeclarado,
        origen: origenActa,
        datos: JSON.stringify(datosCompletos),
      },
    });
    await db.tokenDispositivo.update({
      where: { token },
      data: { ultimaVez: new Date() },
    });

    return NextResponse.json(
      { estado: fila.estado, motivo: fila.motivo ?? undefined, id: fila.id },
      { headers: cabecerasCors(origen) }
    );
  } catch (e) {
    console.error("[actas/ingesta] error:", e);
    return errorJson(500, { error: "Error interno de ingesta" }, origen);
  }
}
