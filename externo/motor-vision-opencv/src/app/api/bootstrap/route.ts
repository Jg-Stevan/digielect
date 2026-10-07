import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { ConsuladoDTO, ResumenTrabajo } from "@/lib/digitalizador/types";

// ============================================================
// GET /api/bootstrap
// Datos iniciales: puestos de votación con mesas y ranuras,
// resumen del trabajo. Siembra datos de demo la primera vez.
// ============================================================

const PUESTOS_DEMO = [
  { codigo: "495-10-02", pais: "Estados Unidos", ciudad: "Miami", zona: "Zona 10", puesto: "Cónsul Miami — Sede Principal", numMesas: 3 },
  { codigo: "495-10-03", pais: "Estados Unidos", ciudad: "Miami", zona: "Zona 10", puesto: "Cónsul Miami — Sede Norte", numMesas: 2 },
  { codigo: "024-01-07", pais: "España", ciudad: "Madrid", zona: "Zona 1", puesto: "Embajada Madrid", numMesas: 2 },
];

async function asegurarSeed() {
  const total = await db.consulado.count();
  if (total > 0) return;
  for (const p of PUESTOS_DEMO) {
    await db.consulado.create({
      data: {
        codigo: p.codigo,
        pais: p.pais,
        ciudad: p.ciudad,
        zona: p.zona,
        puesto: p.puesto,
        numMesas: p.numMesas,
        mesas: {
          create: Array.from({ length: p.numMesas }, (_, i) => ({ numero: i + 1 })),
        },
      },
    });
  }
}

export async function GET() {
  try {
    await asegurarSeed();

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
        actas: m.actas.map((a) => ({
          id: a.id,
          barcode15: a.barcode15,
          tipoEjemplar: a.tipoEjemplar,
          pagina: a.pagina,
          totalPaginas: a.totalPaginas,
          estado: a.estado,
          scoreCalidad: a.scoreCalidad,
          modoManual: a.modoManual,
          envioAdvertencia: a.envioAdvertencia,
          mesaId: a.mesaId,
          mesaNumero: m.numero,
          consulado: c.puesto,
          codigoPuesto: c.codigo,
          problemas: safeArray(a.problemasJson),
          createdAt: a.createdAt.toISOString(),
        })),
      })),
    }));

    const todas = dto.flatMap((c) => c.mesas.flatMap((m) => m.actas));
    const esperados = dto.reduce((acc, c) => acc + c.mesas.length * 4, 0);
    const resumen: ResumenTrabajo = {
      total: todas.length,
      validados: todas.filter((a) => a.estado === "VALIDADO").length,
      anomalias: todas.filter((a) => a.estado === "ANOMALIA").length,
      rechazados: todas.filter((a) => a.estado === "RECHAZADO").length,
      esperados,
    };

    return NextResponse.json({ consulados: dto, resumen, serverTime: new Date().toISOString() });
  } catch (e) {
    console.error("bootstrap error", e);
    return NextResponse.json({ error: "No se pudieron cargar los datos" }, { status: 500 });
  }
}

function safeArray(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
