import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

// ============================================================
// DIGIELECT · Descarga del proyecto empaquetado
// Sirve el entregable .zip que vive en /download (carpeta del
// sandbox, NO versionada y NO accesible como estático): la
// única vía de descarga es esta ruta, que lo transmite como
// attachment con su suma SHA-256 para verificación.
//
//   GET /api/descargar-proyecto          → binario .zip (stream)
//   GET /api/descargar-proyecto?info=1   → metadatos JSON
//
// La carpeta download/ no viaja en el zip ni en el repo: en el
// build estático de GitHub Pages esta ruta no se exporta y la
// UI oculta el apartado (IS_STATIC_EXPORT).
// ============================================================

export const dynamic = "force-dynamic";

const DIR_DESCARGA = path.join(process.cwd(), "download");
const PATRON_ZIP = /^digielect-[0-9a-f]{7,40}-\d{8}\.zip$/;

interface ZipMeta {
  nombre: string;
  commit: string | null;
  tamanoBytes: number;
  tamanoLegible: string;
  sha256: string;
  generado: string;
}

/** Caché de metadatos: el SHA-256 de 30 MB se calcula una sola
 *  vez por versión del archivo (clave = ruta + mtime + tamaño). */
let cacheMeta: { clave: string; meta: ZipMeta } | null = null;

function bytesLegibles(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  // Formato es-CO: coma decimal
  return `${mb.toFixed(1).replace(".", ",")} MB`;
}

/** Localiza el zip más reciente del entregable en /download. */
async function encontrarZip(): Promise<{ ruta: string; nombre: string } | null> {
  try {
    const entradas = await readdir(DIR_DESCARGA);
    const candidatos = entradas.filter((n) => PATRON_ZIP.test(n));
    if (candidatos.length === 0) return null;

    // El más reciente por mtime (por si conviven varias versiones)
    let mejor: { ruta: string; nombre: string; mtimeMs: number } | null = null;
    for (const nombre of candidatos) {
      const ruta = path.join(DIR_DESCARGA, nombre);
      const info = await stat(ruta);
      if (!info.isFile()) continue;
      if (!mejor || info.mtimeMs > mejor.mtimeMs) {
        mejor = { ruta, nombre, mtimeMs: info.mtimeMs };
      }
    }
    return mejor ? { ruta: mejor.ruta, nombre: mejor.nombre } : null;
  } catch {
    return null;
  }
}

async function obtenerMeta(ruta: string, nombre: string): Promise<ZipMeta> {
  const info = await stat(ruta);
  const clave = `${ruta}:${info.mtimeMs}:${info.size}`;
  if (cacheMeta?.clave === clave) return cacheMeta.meta;

  const contenido = await readFile(ruta);
  const sha256 = createHash("sha256").update(contenido).digest("hex");
  const commit = nombre.match(/^digielect-([0-9a-f]{7,40})-/)?.[1] ?? null;

  const meta: ZipMeta = {
    nombre,
    commit,
    tamanoBytes: info.size,
    tamanoLegible: bytesLegibles(info.size),
    sha256,
    generado: info.mtime.toISOString(),
  };
  cacheMeta = { clave, meta };
  return meta;
}

export async function GET(request: Request) {
  const zip = await encontrarZip();
  if (!zip) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No hay un empaquetado del proyecto disponible en el servidor",
      },
      { status: 404 }
    );
  }

  let meta: ZipMeta;
  try {
    meta = await obtenerMeta(zip.ruta, zip.nombre);
  } catch (error) {
    console.error("[descargar-proyecto] error leyendo el zip:", error);
    return NextResponse.json(
      { ok: false, error: "Error leyendo el empaquetado" },
      { status: 500 }
    );
  }

  // ---- Metadatos para la UI (nombre, tamaño, SHA-256, fecha) ----
  const url = new URL(request.url);
  if (url.searchParams.get("info") === "1") {
    return NextResponse.json({ ok: true, ...meta });
  }

  // ---- Transmisión del binario (stream, sin cargarlo en RAM) ----
  const nodoStream = createReadStream(zip.ruta);
  const webStream = Readable.toWeb(
    nodoStream
  ) as unknown as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${meta.nombre}"`,
      "Content-Length": String(meta.tamanoBytes),
      "X-Checksum-Sha256": meta.sha256,
      "Cache-Control": "no-store",
    },
  });
}
