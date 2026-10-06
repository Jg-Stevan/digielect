import { NextResponse } from "next/server";
import { IS_STATIC_EXPORT } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * GET /api — índice mínimo de la API (antes devolvía "Hello, world!",
 * residuo del andamiaje: dato que no aporta nada a un operador de red).
 * En el build estático de Pages esta ruta no existe (no se exporta).
 */
export function GET() {
  return NextResponse.json({
    ok: true,
    servicio: "digielect-api",
    modo: IS_STATIC_EXPORT ? "demo-estatica" : "completo",
    rutas: {
      "GET /api/bootstrap": "Tablero completo del supervisor",
      "POST /api/actas": "Ingesta de actas E-14 desde la PWA (RN-02/RN-03)",
      "POST /api/actas/analizar": "Análisis de visión + verificación QR↔VLM",
      "GET /api/actas/[id]/imagen": "Imagen almacenada del acta",
      "POST /api/batch": "Carga masiva BATCH (integrar/descartar)",
      "POST /api/anomalias/resolver": "Resolver anomalía (aprobar/rechazar)",
      "GET /api/informes": "Informes y escrutinio",
      "POST /api/auth/login": "Login del supervisor",
    },
  });
}
