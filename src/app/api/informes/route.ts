import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getConsulateRows, getResumen } from "@/lib/monitor";

export const dynamic = "force-dynamic";

/**
 * GET /api/informes
 * Datos consolidados para el módulo Generar Informes:
 * avance global, detalle por consulado, resultados de votación
 * extraídos de las actas validadas, avance nacional real de la
 * Registraduría (visor E-14) y audit trail.
 */
export async function GET() {
  try {
    const [consulados, resumen] = await Promise.all([
      getConsulateRows(),
      getResumen(),
    ]);

    // Avance nacional REAL (Registraduría · e14segundavueltapresidente)
    const [avanceCorp, avanceDeptos] = await Promise.all([
      db.avanceCorporacion.findFirst(),
      db.avanceDepartamento.findMany({ orderBy: { nombre: "asc" } }),
    ]);

    // Actas validadas con resultados y análisis
    const actas = await db.acta.findMany({
      where: { estado: { in: ["VALIDADO", "ANOMALIA"] } },
      include: {
        resultados: true,
        mesa: { include: { consulado: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const anomaliasResueltas = await db.anomalia.count({
      where: { estado: { in: ["APROBADA", "RESCANEO_CONFIRMADO"] } },
    });

    const audit = await db.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
    });

    // Consolidar votos por candidato (escrutinio acumulado del exterior)
    const votosPorCandidato = new Map<string, number>();
    for (const acta of actas) {
      for (const r of acta.resultados) {
        votosPorCandidato.set(
          r.candidato,
          (votosPorCandidato.get(r.candidato) ?? 0) + r.votos
        );
      }
    }

    const totalVotos = [...votosPorCandidato.values()].reduce((a, b) => a + b, 0);

    return NextResponse.json({
      ok: true,
      resumen,
      avanceNacional: avanceCorp
        ? {
            corporacion: avanceCorp.nombre,
            mesasEsperadas: avanceCorp.mesasEsperadas,
            actasPublicadas: avanceCorp.actasPublicadas,
            percent:
              avanceCorp.mesasEsperadas > 0
                ? (
                    Math.floor(
                      (avanceCorp.actasPublicadas / avanceCorp.mesasEsperadas) *
                        10000
                    ) / 100
                  ).toFixed(2)
                : "0",
            departamentos: avanceDeptos.map((d) => ({
              codigo: d.codigo,
              nombre: d.nombre,
              esperadas: d.mesasEsperadas,
              publicadas: d.actasPublicadas,
            })),
          }
        : null,
      escrutinio: {
        totalVotos,
        candidatos: [...votosPorCandidato.entries()]
          .map(([candidato, votos]) => ({
            candidato,
            votos,
            percent: totalVotos ? Math.round((votos / totalVotos) * 1000) / 10 : 0,
          }))
          .sort((a, b) => b.votos - a.votos),
      },
      actasRecientes: actas.slice(0, 12).map((a) => ({
        id: a.id,
        barcode15: a.barcode15,
        tipoEjemplar: a.tipoEjemplar,
        pagina: a.pagina,
        estado: a.estado,
        scoreCalidad: a.scoreCalidad,
        consulado: a.mesa?.consulado
          ? `${a.mesa.consulado.pais} · ${a.mesa.consulado.ciudad}`
          : "Sin vincular",
        mesa: a.mesa ? `MESA ${String(a.mesa.numero).padStart(3, "0")}` : "-",
        createdAt: a.createdAt.toISOString(),
        imagenUrl: a.imagenUrl ?? (a.imagenBase64 ? `/api/actas/${a.id}/imagen` : null),
        resultados: a.resultados.map((r) => ({
          candidato: r.candidato,
          votos: r.votos,
        })),
      })),
      anomaliasResueltas,
      auditTrail: audit.map((e) => ({
        time: e.createdAt.toISOString(),
        title: e.accion,
        desc: e.detalle,
        usuario: e.usuario,
      })),
      generadoEn: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[informes] error:", error);
    return NextResponse.json(
      { ok: false, error: "Error generando informe" },
      { status: 500 }
    );
  }
}
