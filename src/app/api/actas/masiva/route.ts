import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";
import { requiereSupervisor } from "@/lib/sesion";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============================================================
// [FASE-7 · PLAN §9.2] POST /api/actas/masiva (solo supervisor)
// Carga masiva server-side: ZIP | PDF | TIFF | PNG | HEIC | JPEG
//   · ZIP → descomprimir (adm-zip, en memoria con límite)
//   · PDF → rasterizar por página (pdfjs-dist)
//   · TIFF/PNG/JPEG → sharp (normaliza a JPEG)
//   · HEIC → heic-convert
// Todo → JPEG/PNG normalizado → mismo pipeline de calidad → cola
// REVISION con origen:"masiva" (sin OCR server-side: la revisión es
// humana — la Regla de Producto también aplica al batch).
// Límite: MAX_ARCHIVOS por request; procesamiento por lotes.
// ============================================================

const MAX_ARCHIVOS = 60;
const MAX_BYTES = 200 * 1024 * 1024; // 200 MB por request

interface Salida {
  id: string;
  hash: string;
  buf: Buffer;
  mime: string;
  score: number;
}

async function normalizarConSharp(buf: Buffer): Promise<{ buf: Buffer; mime: string } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buf).metadata();
    if (!meta.width || !meta.height || meta.width < 16 || meta.height < 16) return null;
    // Normaliza (rota por EXIF, recorta alpha) y recomprime
    const out = await sharp(buf).rotate().flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer();
    return { buf: out, mime: "image/jpeg" };
  } catch {
    return null;
  }
}

async function rasterizarPdf(buf: Buffer): Promise<{ buf: Buffer; mime: string }[]> {
  // pdfjs-dist necesita un canvas real en Node: @napi-rs/canvas (prebuilt)
  const [{ createCanvas }, pdfjsMod] = await Promise.all([
    import("@napi-rs/canvas"),
    import("pdfjs-dist/legacy/build/pdf.mjs"),
  ]);
  const pdfjs = pdfjsMod as unknown as {
    getDocument: (o: { data: Uint8Array }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<unknown> }> };
  };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const paginas: { buf: Buffer; mime: string }[] = [];
  const total = Math.min(doc.numPages, MAX_ARCHIVOS);
  for (let i = 1; i <= total; i++) {
    const page = (await doc.getPage(i)) as unknown as {
      getViewport: (o: { scale: number }) => { width: number; height: number };
      render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<unknown> };
    };
    const viewport = page.getViewport({ scale: 1.6 });
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
    const png = await canvas.encode("jpeg", 88);
    paginas.push({ buf: Buffer.from(png), mime: "image/jpeg" });
  }
  return paginas;
}

async function convertirHeic(buf: Buffer): Promise<{ buf: Buffer; mime: string } | null> {
  try {
    const heicConvert = (await import("heic-convert")).default as unknown as (
      opts: { buffer: Buffer; format: "JPEG"; quality: number }
    ) => Promise<{ buffer: ArrayBufferLike }>;
    const out = await heicConvert({ buffer: buf, format: "JPEG", quality: 0.88 });
    return { buf: Buffer.from(out.buffer), mime: "image/jpeg" };
  } catch {
    return null;
  }
}

/** Score de calidad barato sobre el JPEG normalizado (sin métricas inventadas:
 *  sharp entrega entropía/estadísticas — usamos la desviación estándar de
 *  luminancia como aproximación de contraste y la existencia de metadatos
 *  de tamaño; el humano revisa TODO lo masivo de todas formas). */
async function scoreDe(buf: Buffer): Promise<number> {
  try {
    const sharp = (await import("sharp")).default;
    const stats = await sharp(buf).stats();
    const canal = stats.channels[0] ?? { stdev: 0 };
    // contraste normalizado a 0-100 con margen conservador
    return Math.max(0, Math.min(100, Math.round(canal.stdev * 2)));
  } catch {
    return 50;
  }
}

export async function POST(req: NextRequest) {
  const sesion = requiereSupervisor(req);
  if (!sesion.ok) return sesion.response;
  try {
    const form = await req.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "Se espera multipart/form-data" }, { status: 400 });
    }
    const archivo = form.get("archivo");
    if (!(archivo instanceof Blob)) {
      return NextResponse.json({ error: "Parte requerida: archivo" }, { status: 400 });
    }
    if (archivo.size > MAX_BYTES) {
      return NextResponse.json({ error: `Archivo demasiado grande (máx ${MAX_BYTES / 1024 / 1024} MB)` }, { status: 413 });
    }
    const nombre = (form.get("nombre") as string | null) ?? "masiva";
    const mesaId = (form.get("mesaId") as string | null) || null;

    let mesaDestino: { id: string } | null = null;
    if (mesaId) {
      mesaDestino = await db.mesa.findUnique({ where: { id: mesaId } });
      if (!mesaDestino) {
        return NextResponse.json({ error: `Mesa inexistente: ${mesaId}` }, { status: 404 });
      }
    }

    const buf = Buffer.from(await archivo.arrayBuffer());
    const tipo = archivo.type || "";
    const esZip = tipo.includes("zip") || /\.zip$/i.test(nombre);
    const esPdf = tipo.includes("pdf") || /\.pdf$/i.test(nombre);
    const esHeic = /hei[cf]$/i.test(nombre) || tipo.includes("heic") || tipo.includes("heif");

    // ----------------------------------------------------------
    // Recolectar imágenes candidatas
    // ----------------------------------------------------------
    const candidatas: { buf: Buffer; nombre: string }[] = [];
    if (esZip) {
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(buf);
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        if (candidatas.length >= MAX_ARCHIVOS) break;
        const n = entry.entryName.toLowerCase();
        if (/\.(jpe?g|png|tiff?|webp|avif|gif|bmp)$/.test(n) || /hei[cf]$/.test(n)) {
          candidatas.push({ buf: entry.getData(), nombre: entry.entryName });
        }
      }
    } else if (esPdf) {
      const paginas = await rasterizarPdf(buf);
      paginas.forEach((p, i) => candidatas.push({ buf: p.buf, nombre: `${nombre}.p${i + 1}` }));
    } else {
      candidatas.push({ buf, nombre });
    }

    if (candidatas.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron imágenes soportadas en el archivo (JPEG/PNG/TIFF/HEIC/WebP/AVIF)" },
        { status: 422 }
      );
    }
    if (candidatas.length > MAX_ARCHIVOS) {
      return NextResponse.json(
        { error: `Demasiadas imágenes (${candidatas.length}); máx ${MAX_ARCHIVOS} por request` },
        { status: 413 }
      );
    }

    // ----------------------------------------------------------
    // Normalizar → hash → descartes → insertar en cola REVISION
    // ----------------------------------------------------------
    const dirIngesta = join(process.cwd(), "uploads", "ingesta");
    await mkdir(dirIngesta, { recursive: true });

    const resultados: Array<{ id: string; estado: string; motivo?: string }> = [];
    for (const c of candidatas) {
      let norm: { buf: Buffer; mime: string } | null = null;
      if (/hei[cf]$/i.test(c.nombre)) {
        norm = (await convertirHeic(c.buf)) ?? (await normalizarConSharp(c.buf));
      } else {
        norm = await normalizarConSharp(c.buf);
      }
      if (!norm) {
        resultados.push({ id: c.nombre, estado: "error", motivo: "No se pudo decodificar/normalizar" });
        continue;
      }
      const hash = createHash("sha256").update(norm.buf).digest("hex");
      const previa = await db.actaIngesta.findUnique({ where: { hashImagen: hash } });
      if (previa) {
        resultados.push({ id: previa.id, estado: "duplicado" });
        continue;
      }
      const id = randomUUID();
      const score = await scoreDe(norm.buf);
      await writeFile(join(dirIngesta, `${id}-procesada.${norm.mime.includes("png") ? "png" : "jpg"}`), norm.buf);
      await writeFile(join(dirIngesta, `${id}-original.${norm.mime.includes("png") ? "png" : "jpg"}`), norm.buf);
      const fila = await db.actaIngesta.create({
        data: {
          id,
          mesaId: mesaDestino?.id ?? mesaId ?? "SIN-ASIGNAR",
          tokenPuesto: "masiva",
          estado: "revision",
          motivo: "Carga masiva — asignación pendiente",
          score,
          origen: "masiva",
          hashImagen: hash,
          datos: JSON.stringify({
            archivo: c.nombre,
            fuente: nombre,
            calidad: { score },
          }),
        },
      });
      resultados.push({ id: fila.id, estado: fila.estado });
    }

    return NextResponse.json({
      recibidas: candidatas.length,
      procesadas: resultados.filter((r) => r.estado === "revision").length,
      duplicadas: resultados.filter((r) => r.estado === "duplicado").length,
      errores: resultados.filter((r) => r.estado === "error").length,
      resultados,
    });
  } catch (e) {
    console.error("[actas/masiva] error:", e);
    return NextResponse.json({ error: "Error interno en la carga masiva" }, { status: 500 });
  }
}
