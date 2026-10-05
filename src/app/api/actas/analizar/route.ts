import { NextRequest, NextResponse } from "next/server";
import { analizarActa } from "@/lib/analisis-acta";
import { verificarActaE14 } from "@/lib/verificar-acta";
import { getConsulateRows } from "@/lib/monitor";
import type { ConsulateRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/actas/analizar
 * Análisis de calidad + extracción de datos SIN persistir.
 * Lo usa la PWA en la pantalla de revisión previa al envío (RF-1.1).
 * Body: { imagenBase64, qrTexto? } — el QR decodificado en cliente
 * se cruza con la lectura VLM y la tabla real de consulados para
 * devolver verificación + asignación final de la ubicación.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imagenBase64, qrTexto } = body as {
      imagenBase64?: string;
      qrTexto?: string | null;
    };

    if (!imagenBase64) {
      return NextResponse.json(
        { ok: false, error: "imagenBase64 es obligatorio" },
        { status: 400 }
      );
    }

    const analisis = await analizarActa(imagenBase64);

    // Tabla real de consulados para el cruce (degradación elegante
    // ante fallo de BD: el barcode15 del QR sigue analizándose)
    let consulados: ConsulateRow[] = [];
    try {
      consulados = await getConsulateRows();
    } catch (e) {
      console.error("[actas/analizar] bootstrap error:", e);
    }

    const { verificacion, asignacion } = verificarActaE14({
      analisis,
      qrTexto,
      consulados,
    });

    return NextResponse.json({ ok: true, analisis, verificacion, asignacion });
  } catch (error) {
    console.error("[actas/analizar] error:", error);
    return NextResponse.json(
      { ok: false, error: "Error analizando la imagen del acta" },
      { status: 500 }
    );
  }
}
