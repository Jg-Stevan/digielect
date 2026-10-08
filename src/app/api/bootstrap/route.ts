import { NextResponse } from "next/server";
import {
  getAnomalias,
  getConsulateRows,
  getQueueFiles,
  getResumen,
  getSlaRows,
  respuestaJsonGzip,
} from "@/lib/monitor";

export const dynamic = "force-dynamic";

/**
 * GET /api/bootstrap
 * Carga inicial de todo el tablero del supervisor:
 * monitor global, anomalías, cola BATCH y control SLA.
 */
export async function GET() {
  try {
    const [consulados, anomalias, queueFiles, slaRows, resumen] =
      await Promise.all([
        getConsulateRows(),
        getAnomalias(),
        getQueueFiles(),
        getSlaRows(),
        getResumen(),
      ]);

    // [OLA2 2.3] gzip: el tablero completo (949 puestos · 3.670 mesas)
    // pesa ~1,2 MB en bruto; comprimido viaja en ~65 KB. El contrato
    // no cambia (fetch + res.json() decodifican Content-Encoding).
    return respuestaJsonGzip({
      ok: true,
      consulados,
      anomalias,
      queueFiles,
      slaRows,
      resumen,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[bootstrap] error:", error);
    return NextResponse.json(
      { ok: false, error: "Error cargando datos del tablero" },
      { status: 500 }
    );
  }
}
