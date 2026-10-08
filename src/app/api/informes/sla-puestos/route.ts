import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ============================================================
// [FASE-7 · PLAN §9.3] GET /api/informes/sla-puestos
// SLA de digitalización por puesto (solo supervisor):
//   · ultimaActa      — timestamp de la última acta recibida
//   · diasSinDigitalizar
//   · semáforo         — verde | ambar | rojo (env: SLA_AMBAR_DIAS=2,
//                         SLA_ROJO_DIAS=5)
// Fuentes: canal de ingesta (ActaIngesta por tokenPuesto) y flujo
// histórico (Acta por consulado). Ordenado rojo → ambar → verde.
// ============================================================

const AMBAR_DIAS = Number.parseInt(process.env.SLA_AMBAR_DIAS ?? "2", 10) || 2;
const ROJO_DIAS = Number.parseInt(process.env.SLA_ROJO_DIAS ?? "5", 10) || 5;

const DIA_MS = 86_400_000;

export async function GET() {
  try {
    const ahora = Date.now();

    // Última acta por puesto en cada canal
    const [ingestas, actasHistoricas, consulados, mesas] = await Promise.all([
      db.actaIngesta.groupBy({
        by: ["tokenPuesto"],
        _max: { createdAt: true },
      }),
      db.acta.groupBy({
        by: ["mesaId"],
        _max: { createdAt: true },
      }),
      db.consulado.findMany({
        select: { id: true, codigo: true, ciudad: true, pais: true, zona: true, numMesas: true },
      }),
      db.mesa.findMany({ select: { id: true, consuladoId: true } }),
    ]);

    const consuladoPorId = new Map(consulados.map((c) => [c.id, c]));
    const codigoPorMesa = new Map(
      mesas.map((m) => [m.id, consuladoPorId.get(m.consuladoId)?.codigo ?? ""])
    );

    const ultimaPorPuesto = new Map<string, number>();
    for (const g of ingestas) {
      const t = g._max?.createdAt?.getTime() ?? 0;
      if (t) ultimaPorPuesto.set(g.tokenPuesto, Math.max(ultimaPorPuesto.get(g.tokenPuesto) ?? 0, t));
    }
    for (const g of actasHistoricas) {
      const codigo = codigoPorMesa.get(g.mesaId ?? "") ?? "";
      if (!codigo) continue;
      const t = g._max?.createdAt?.getTime() ?? 0;
      if (t) ultimaPorPuesto.set(codigo, Math.max(ultimaPorPuesto.get(codigo) ?? 0, t));
    }

    const filas = consulados.map((c) => {
      const ultima = ultimaPorPuesto.get(c.codigo) ?? null;
      const dias = ultima ? Math.floor((ahora - ultima) / DIA_MS) : null;
      const semaforo =
        !ultima || dias === null ? "rojo" : dias >= ROJO_DIAS ? "rojo" : dias >= AMBAR_DIAS ? "ambar" : "verde";
      return {
        puestoId: c.codigo,
        ciudad: c.ciudad,
        pais: c.pais,
        zona: c.zona,
        numMesas: c.numMesas,
        ultimaActa: ultima ? new Date(ultima).toISOString() : null,
        diasSinDigitalizar: dias,
        semaforo,
      };
    });

    // rojo → ambar → verde, luego por días desc
    const orden = { rojo: 0, ambar: 1, verde: 2 } as const;
    filas.sort(
      (a, b) => orden[a.semaforo] - orden[b.semaforo] || (b.diasSinDigitalizar ?? 999) - (a.diasSinDigitalizar ?? 999)
    );

    return NextResponse.json({
      umbrales: { ambarDias: AMBAR_DIAS, rojoDias: ROJO_DIAS },
      total: filas.length,
      porSemaforo: {
        rojo: filas.filter((f) => f.semaforo === "rojo").length,
        ambar: filas.filter((f) => f.semaforo === "ambar").length,
        verde: filas.filter((f) => f.semaforo === "verde").length,
      },
      puestos: filas,
    });
  } catch (e) {
    console.error("[informes/sla-puestos] error:", e);
    return NextResponse.json({ error: "No se pudo calcular el SLA" }, { status: 500 });
  }
}
