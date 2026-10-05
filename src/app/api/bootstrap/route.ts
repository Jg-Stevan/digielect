import { NextResponse } from "next/server";
import {
  getAnomalias,
  getConsulateRows,
  getQueueFiles,
  getResumen,
  getSlaRows,
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

    return NextResponse.json({
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
