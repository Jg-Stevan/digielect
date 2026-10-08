import { NextRequest, NextResponse } from "next/server";
import { analizarActa } from "@/lib/analisis-acta";
import { verificarActaE14 } from "@/lib/verificar-acta";
import { getConsulateRows } from "@/lib/monitor";
import { limitar } from "@/lib/rate-limit";
import { AnalizarSchema, parsearBody, validarImagenBase64 } from "@/lib/validacion";
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
 *
 * [OLA5 5.3] Body validado con Zod + la MISMA validación de imagen
 * de /api/actas (data URL image/*, base64, ~8 MB): cada análisis
 * cuesta una llamada al motor de visión — no puede entrar sin cota.
 * [OLA5 5.6] Rate limit 10/min por IP (costo VLM por request).
 */
export async function POST(req: NextRequest) {
  try {
    // [OLA5 5.6] El análisis dispara el motor de visión (costo real
    // por request): mismo freno que la ingesta.
    const limite = limitar(req, {
      clave: "analizar",
      max: 10,
      ventanaMs: 60_000,
    });
    if (!limite.ok) return limite.response;

    const body = await parsearBody(req, AnalizarSchema);
    if (!body.ok) return body.response;
    const { imagenBase64, qrTexto } = body.data;

    // [OLA5 5.3] Mismo límite/validación que la ingesta (antes esta
    // ruta aceptaba cualquier imagen de cualquier tamaño).
    const validacion = validarImagenBase64(imagenBase64);
    if (!validacion.ok) {
      return NextResponse.json(
        { ok: false, error: validacion.error },
        { status: validacion.status }
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
