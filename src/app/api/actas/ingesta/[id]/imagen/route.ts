import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ============================================================
// [FASE-6] GET /api/actas/ingesta/[id]/imagen?tipo=original|procesada
// Sirve las imágenes del acta de ingesta guardadas en disco
// (uploads/ingesta/{id}-{original|procesada}.{jpg,png}).
// ============================================================

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png" };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = new URL(_req.url);
  const tipo = url.searchParams.get("tipo") === "original" ? "original" : "procesada";
  try {
    const fila = await db.actaIngesta.findUnique({ where: { id } });
    if (!fila) return NextResponse.json({ error: "Acta no encontrada" }, { status: 404 });
    for (const ext of ["jpg", "png"]) {
      const ruta = join(process.cwd(), "uploads", "ingesta", `${id}-${tipo}.${ext}`);
      try {
        const buf = await readFile(ruta);
        return new NextResponse(new Uint8Array(buf), {
          headers: { "Content-Type": MIME[ext], "Cache-Control": "private, max-age=3600" },
        });
      } catch {
        /* probar siguiente extensión */
      }
    }
    return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
  } catch (e) {
    console.error("[actas/ingesta/imagen] error:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
