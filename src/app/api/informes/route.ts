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

    // Actas recientes para el informe (12 más recientes).
    // [OLA2 2.2] Antes: findMany con `include: { resultados, mesa: { include: { consulado: true } } }`
    // cargando TODAS las actas VALIDADO/ANOMALIA con TODAS sus columnas
    // (incluida imagenBase64 ~0,5 MB y creciendo) para luego hacer
    // `slice(0, 12)` y sumar votos en JS. Ahora: `take: 12` en la query
    // + select liviano, y el escrutinio se agrega en SQL (groupBy sobre
    // ResultadoVoto, ver abajo).
    const [actas, votosRows, anomaliasResueltas, audit] = await Promise.all([
      db.acta.findMany({
        where: { estado: { in: ["VALIDADO", "ANOMALIA"] } },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: {
          id: true,
          barcode15: true,
          tipoEjemplar: true,
          pagina: true,
          estado: true,
          scoreCalidad: true,
          createdAt: true,
          imagenUrl: true,
          mesa: {
            select: {
              numero: true,
              consulado: { select: { pais: true, ciudad: true } },
            },
          },
          resultados: { select: { candidato: true, votos: true } },
        },
      }),
      // [OLA2 2.2] Escrutinio agregado por SQL (GROUP BY candidato + SUM
      // sobre ResultadoVoto con join a actas VALIDADO). Antes se sumaba
      // en JS recorriendo TODAS las actas cargadas en memoria.
      db.resultadoVoto.groupBy({
        by: ["candidato"],
        _sum: { votos: true },
        where: { acta: { estado: "VALIDADO" } },
      }),
      db.anomalia.count({
        where: { estado: { in: ["APROBADA", "RESCANEO_CONFIRMADO"] } },
      }),
      db.auditEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);

    // [OLA2 2.2] Existencia de imagen para la URL del visor: NO se
    // materializa el base64 (hasta ~8 MB por acta); solo se pregunta
    // qué ids de los 12 recientes tienen imagen persistida.
    const idsRecientes = actas.map((a) => a.id);
    const conImagen = idsRecientes.length
      ? await db.acta.findMany({
          where: { id: { in: idsRecientes }, imagenBase64: { not: null } },
          select: { id: true },
        })
      : [];
    const conImagenIds = new Set(conImagen.map((a) => a.id));

    // Consolidar votos por candidato (escrutinio acumulado del exterior)
    const candidatos = votosRows
      .map((r) => ({ candidato: r.candidato, votos: r._sum.votos ?? 0 }))
      .sort((a, b) => b.votos - a.votos);

    const totalVotos = candidatos.reduce((acc, c) => acc + c.votos, 0);

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
        candidatos: candidatos.map(({ candidato, votos }) => ({
          candidato,
          votos,
          percent: totalVotos ? Math.round((votos / totalVotos) * 1000) / 10 : 0,
        })),
      },
      actasRecientes: actas.map((a) => ({
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
        imagenUrl:
          a.imagenUrl ?? (conImagenIds.has(a.id) ? `/api/actas/${a.id}/imagen` : null),
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
