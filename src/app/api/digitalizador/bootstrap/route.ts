import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { respuestaJsonGzip } from "@/lib/monitor";
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
//
// [OLA2 2.3] Rendimiento:
//  · Select explícito de las actas SIN `imagenBase64` (el include
//    anterior materializaba la imagen de cada captura subida —
//    ~0,5 MB hoy, +0,5 MB por cada upload — en CADA arranque de la
//    PWA). `analisisJson` sí viaja: de ahí salen los `problemas[]`
//    del DTO (son acotados, ~1 KB por acta).
//  · Solo el acta VIGENTE por ranura (mesa|tipo|página): la PWA
//    renderiza por ranura (find sobre lista createdAt desc), así
//    que el histórico de reintentos nunca se muestra — antes
//    `take: 8` por mesa podía traer 8 reintentos de la MISMA
//    ranura y dejar las otras 3 como "vacías". El payload queda
//    acotado a ≤4 actas/mesa (mesas × 4) pase lo que pase.
//  · Respuesta con Content-Encoding: gzip (ver respuestaJsonGzip):
//    el JSON del seed completo (949 puestos · 3.670 mesas · 14.6k
//    ranuras) baja de ~6 MB a ~260 KB por el cable. El contrato no
//    cambia: fetch + res.json() decodifican transparente.
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
    // 1) Estructura: 949 puestos con sus mesas (campos del DTO, livianos)
    const consulados = await db.consulado.findMany({
      orderBy: { codigo: "asc" },
      select: {
        id: true,
        codigo: true,
        pais: true,
        ciudad: true,
        zona: true,
        puesto: true,
        numMesas: true,
        mesas: {
          orderBy: { numero: "asc" },
          select: { id: true, numero: true },
        },
      },
    });

    // 2) Actas en UNA consulta liviana (select explícito, sin imagenBase64)
    const actas = await db.acta.findMany({
      where: { mesaId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        barcode15: true,
        tipoEjemplar: true,
        pagina: true,
        totalPaginas: true,
        estado: true,
        scoreCalidad: true,
        detalle: true, // el DTO deriva modoManual del detalle
        envioEmergencia: true,
        mesaId: true,
        analisisJson: true, // fuente de problemas[]
        createdAt: true,
      },
    });

    // 3) Solo el acta VIGENTE por ranura (mesa|tipo|página): recorriendo
    //    en orden createdAt desc, la PRIMERA aparición de cada ranura es
    //    la vigente — igual que el find() que hace la PWA por ranura.
    const porMesa = new Map<string, typeof actas>();
    const ranuraVista = new Set<string>();
    for (const a of actas) {
      if (!a.mesaId) continue;
      const clave = `${a.mesaId}|${a.tipoEjemplar}|${a.pagina}`;
      if (ranuraVista.has(clave)) continue;
      ranuraVista.add(clave);
      const lista = porMesa.get(a.mesaId);
      if (lista) lista.push(a);
      else porMesa.set(a.mesaId, [a]);
    }

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
        actas: (porMesa.get(m.id) ?? []).map(
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

    // Resumen sobre TODAS las actas (no solo las vigentes por ranura):
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

    return respuestaJsonGzip({
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
