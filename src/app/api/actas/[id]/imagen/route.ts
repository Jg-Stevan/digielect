import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/actas/[id]/imagen
 * Sirve la imagen almacenada de un acta (captura PWA en base64
 * o ruta pública de las actas de ejemplo).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const acta = await db.acta.findUnique({
      where: { id },
      select: { imagenBase64: true, imagenUrl: true },
    });

    if (!acta) {
      return NextResponse.json({ error: "Acta no encontrada" }, { status: 404 });
    }

    if (acta.imagenBase64) {
      const dataUrl = acta.imagenBase64.startsWith("data:")
        ? acta.imagenBase64
        : `data:image/jpeg;base64,${acta.imagenBase64}`;
      const [meta, b64] = dataUrl.split(",");
      const mime = meta.match(/data:(.*?);/)?.[1] ?? "image/jpeg";
      const buffer = Buffer.from(b64, "base64");
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": mime,
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    if (acta.imagenUrl) {
      return NextResponse.redirect(
        new URL(acta.imagenUrl, "http://localhost:3000"),
        302
      );
    }

    return NextResponse.json({ error: "El acta no tiene imagen" }, { status: 404 });
  } catch (error) {
    console.error("[actas/imagen] error:", error);
    return NextResponse.json({ error: "Error sirviendo imagen" }, { status: 500 });
  }
}
