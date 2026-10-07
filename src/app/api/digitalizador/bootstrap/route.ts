import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type {
  ActaDTO,
  ConsuladoDTO,
  ResumenTrabajo,
} from "@/lib/digitalizador/types";

export const dynamic = "force-dynamic";

// ============================================================
// [COORD C-16] GET /api/digitalizador/bootstrap
// Puente para el digitalizador v2 (reemplazo ZIP): mismo contrato
// que el bootstrap del ZIP (ConsuladoDTO[] + ResumenTrabajo) pero
// servido desde el schema REAL de digielect (qrFingerprint,
// envioEmergencia, analisisJson). /api/bootstrap sigue siendo —
// intacto — el bootstrap del tablero del supervisor.
// Sin seed propio: los puestos los siembra el seed de digielect.
// ============================================================

/** Extrae problemas[] del analisisJson persistido (tolerante) */
function problemasDe(analisisJson: string | null): string[] {
  if (!analisisJson) return [];
  try {
    const v = JSON.parse(analisisJson) as { problemas?: unknown };
    if (!Array.isArray(v.problemas)) return [];
    return v.problemas.map(String).filter(Boolean);
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const consulados = await db.consulado.findMany({
      orderBy: { codigo: "asc" },
      include: {
        mesas: {
          orderBy: { numero: "asc" },
          include: {
            actas: {
              orderBy: { createdAt: "desc" },
              take: 8,
            },
          },
        },
      },
    });

    const dto: ConsuladoDTO[] = consulados.map((c) => ({
      id: c.id,
      codigo: c.codigo,
      pais: c.pais,
      ciudad: c.ciudad,
      zona: c.zona,
      puesto: c.puesto,
      numMesas: c.numMesas,
      mesas: c.mesas.map((m) => ({
        id: m.id,
        numero: m.numero,
        actas: m.actas.map(
          (a): ActaDTO => ({
            id: a.id,
            barcode15: a.barcode15,
            tipoEjemplar: a.tipoEjemplar,
            pagina: a.pagina,
            totalPaginas: a.totalPaginas,
            estado: a.estado,
            scoreCalidad: a.scoreCalidad ?? 0,
            // digielect no persiste modoManual: se deriva del detalle
            modoManual: (a.detalle ?? "").includes("manual"),
            // envioAdvertencia del ZIP ≡ envioEmergencia (RN-03) aquí
            envioAdvertencia: a.envioEmergencia,
            mesaId: a.mesaId,
            mesaNumero: m.numero,
            consulado: c.puesto,
            codigoPuesto: c.codigo,
            problemas: problemasDe(a.analisisJson),
            createdAt: a.createdAt.toISOString(),
          })
        ),
      })),
    }));

    // Resumen sobre TODAS las actas (no solo las 8 recientes por mesa):
    // mismos campos que el ResumenTrabajo del ZIP.
    const [porEstado, totalMesas] = await Promise.all([
      db.acta.groupBy({ by: ["estado"], _count: { _all: true } }),
      db.mesa.count(),
    ]);
    const conteo = (estado: string) =>
      porEstado.find((p) => p.estado === estado)?._count._all ?? 0;

    const resumen: ResumenTrabajo = {
      total: porEstado.reduce((n, p) => n + p._count._all, 0),
      validados: conteo("VALIDADO"),
      anomalias: conteo("ANOMALIA"),
      rechazados: conteo("RECHAZADO"),
      esperados: totalMesas * 4,
    };

    return NextResponse.json({
      consulados: dto,
      resumen,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[digitalizador/bootstrap] error:", e);
    return NextResponse.json(
      { error: "No se pudieron cargar los datos" },
      { status: 500 }
    );
  }
}
