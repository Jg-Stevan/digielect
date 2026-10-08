import { NextRequest, NextResponse } from "next/server";
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
//
// [SLIM-BOOTSTRAP] Variantes de carga por demanda ( backlog del
// worklog raíz — "variante slim del digitalizador-bootstrap"):
//  · `?lista=1`   → lista LIGERA de los 949 puestos SIN mesas ni
//    actas (~40 KB por el cable). Alimenta el selector manual
//    (Opción B) y el puente identificación→puesto sin bajar el
//    dataset completo.
//  · `?puesto=495-10-02` → UN solo puesto con sus mesas y sus
//    actas + resumen acotado al puesto. Es el dataset que la PWA
//    descarga al escanear la primera acta (el puesto se deriva
//    del código de barras) — la PWA ya no carga los 949 puestos
//    al arrancar: arranca VACÍA y llena por demanda.
// Sin params → contrato histórico completo (compat export demo).
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

/** Consulta Prisma de los puestos (estructura base del DTO) */
function consuladoSelect(mesas: boolean) {
  return {
    id: true,
    codigo: true,
    pais: true,
    ciudad: true,
    zona: true,
    puesto: true,
    numMesas: true,
    ...(mesas
      ? {
          mesas: {
            orderBy: { numero: "asc" as const },
            select: { id: true, numero: true },
          },
        }
      : {}),
  };
}

/** Acta → DTO (ranura vigente, sin imagen) */
function actaADto(
  a: {
    id: string;
    barcode15: string | null;
    tipoEjemplar: string;
    pagina: number;
    totalPaginas: number;
    estado: string;
    scoreCalidad: number | null;
    detalle: string | null;
    envioEmergencia: boolean;
    mesaId: string | null;
    analisisJson: string | null;
    createdAt: Date;
  },
  mesaNumero: number,
  consuladoPuesto: string,
  consuladoCodigo: string
): ActaDTO {
  return {
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
    mesaNumero,
    consulado: consuladoPuesto,
    codigoPuesto: consuladoCodigo,
    problemas: problemasDe(a.analisisJson),
    createdAt: a.createdAt.toISOString(),
  };
}

/** Actas VIGENTES por ranura agrupadas por mesa (1 consulta liviana) */
async function actasVigentesPorMesa(mesaIds?: string[]) {
  const actas = await db.acta.findMany({
    where: {
      mesaId: { not: null },
      ...(mesaIds && mesaIds.length > 0 ? { mesaId: { in: mesaIds } } : {}),
    },
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
  return porMesa;
}

/** Resumen de trabajo; si `consuladoCodigo` llega, acotado al puesto */
async function resumenDe(consuladoCodigo?: string): Promise<ResumenTrabajo> {
  const acotado = Boolean(consuladoCodigo);
  const [porEstado, totalMesas] = await Promise.all([
    db.acta.groupBy({
      by: ["estado"],
      _count: { _all: true },
      ...(acotado
        ? { where: { mesa: { consulado: { codigo: consuladoCodigo as string } } } }
        : {}),
    }),
    db.mesa.count(
      acotado ? { where: { consulado: { codigo: consuladoCodigo as string } } } : undefined
    ),
  ]);
  const conteo = (estado: string) =>
    porEstado.find((p) => p.estado === estado)?._count._all ?? 0;
  return {
    total: porEstado.reduce((n, p) => n + p._count._all, 0),
    validados: conteo("VALIDADO"),
    anomalias: conteo("ANOMALIA"),
    rechazados: conteo("RECHAZADO"),
    esperados: totalMesas * 4,
  };
}

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const soloLista = params.get("lista") === "1";
    const puestoCodigo = params.get("puesto")?.trim() ?? "";

    // ----------------------------------------------------------
    // [SLIM-BOOTSTRAP] ?lista=1 — lista ligera sin mesas ni actas
    // ----------------------------------------------------------
    if (soloLista) {
      const puestos = await db.consulado.findMany({
        orderBy: { codigo: "asc" },
        select: consuladoSelect(false),
      });
      return respuestaJsonGzip({ puestos, serverTime: new Date().toISOString() });
    }

    // ----------------------------------------------------------
    // [SLIM-BOOTSTRAP] ?puesto=… — un puesto con mesas + actas
    // ----------------------------------------------------------
    if (puestoCodigo) {
      const consulado = await db.consulado.findUnique({
        where: { codigo: puestoCodigo },
        select: consuladoSelect(true),
      });
      if (!consulado) {
        return NextResponse.json(
          { error: `Puesto no encontrado: ${puestoCodigo}` },
          { status: 404 }
        );
      }
      const consuladosArr = [consulado];
      const porMesa = await actasVigentesPorMesa(consulado.mesas.map((m) => m.id));
      const dto: ConsuladoDTO[] = consuladosArr.map((c) => ({
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
          actas: (porMesa.get(m.id) ?? []).map((a) =>
            actaADto(a, m.numero, c.puesto, c.codigo)
          ),
        })),
      }));
      const resumen = await resumenDe(puestoCodigo);
      return respuestaJsonGzip({
        consulados: dto,
        resumen,
        serverTime: new Date().toISOString(),
      });
    }

    // ----------------------------------------------------------
    // Contrato histórico completo (export demo / compat)
    // ----------------------------------------------------------
    // 1) Estructura: 949 puestos con sus mesas (campos del DTO, livianos)
    const consulados = await db.consulado.findMany({
      orderBy: { codigo: "asc" },
      select: consuladoSelect(true),
    });

    // 2) Actas en UNA consulta liviana (select explícito, sin imagenBase64)
    const porMesa = await actasVigentesPorMesa();

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
        actas: (porMesa.get(m.id) ?? []).map((a) =>
          actaADto(a, m.numero, c.puesto, c.codigo)
        ),
      })),
    }));

    // Resumen sobre TODAS las actas (no solo las vigentes por ranura):
    // mismos campos que el ResumenTrabajo del ZIP.
    const resumen = await resumenDe();

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
