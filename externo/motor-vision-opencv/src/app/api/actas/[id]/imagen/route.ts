import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ============================================================
// GET /api/actas/[id]/imagen — devuelve el JPEG del acta
// ============================================================

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const acta = await db.acta.findUnique({ where: { id }, select: { imagenDataUrl: true } });
    if (!acta) {
      return NextResponse.json({ error: "Acta no encontrada" }, { status: 404 });
    }
    const match = acta.imagenDataUrl.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json({ error: "Imagen corrupta" }, { status: 500 });
    }
    const buffer = Buffer.from(match[2], "base64");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": match[1],
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("imagen GET error", e);
    return NextResponse.json({ error: "No se pudo obtener la imagen" }, { status: 500 });
  }
}
