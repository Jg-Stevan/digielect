import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  calcularScoreRN02,
  decidirEstado,
  generarHuella,
  parseBarcode15,
} from "@/lib/digitalizador/reglas";
import type { AnalisisVLM, DecisionEnvio } from "@/lib/digitalizador/types";

// ============================================================
// /api/actas
//   GET  — últimas actas (DTO sin imagen)
//   POST — envío de un acta: validación, guard de ranuras,
//          decisión RN-02 server-side y persistencia
// ============================================================

const payloadSchema = z.object({
  imagenDataUrl: z.string().min(50).startsWith("data:image"),
  barcode15: z.string().nullable().optional(),
  qrTexto: z.string().nullable().optional(),
  tipoEjemplar: z.enum(["DELEGADOS", "TRANSMISION"]).default("DELEGADOS"),
  pagina: z.number().int().min(1).max(4).default(1),
  totalPaginas: z.number().int().min(1).max(4).default(2),
  scoreCalidad: z.number().min(0).max(10),
  modoManual: z.boolean().optional().default(false),
  envioAdvertencia: z.boolean().optional().default(false),
  mesaId: z.string().nullable().optional(),
  analisis: z.any().nullable().optional(),
  problemas: z.array(z.string()).optional(),
});

export async function GET() {
  try {
    const actas = await db.acta.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { mesa: { include: { consulado: true } } },
    });
    return NextResponse.json({
      actas: actas.map((a) => ({
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
        mesaNumero: a.mesa?.numero ?? null,
        consulado: a.mesa?.consulado?.puesto ?? null,
        codigoPuesto: a.mesa?.consulado?.codigo ?? null,
        problemas: safeArray(a.problemasJson),
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("actas GET error", e);
    return NextResponse.json({ error: "No se pudieron listar las actas" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = payloadSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Payload inválido", detalle: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const p = parsed.data;

    if (p.imagenDataUrl.length > 9_000_000) {
      return NextResponse.json({ error: "Imagen demasiado grande (máx. ~8 MB)" }, { status: 413 });
    }

    // 1) Mesa requerida para ubicar la ranura
    if (!p.mesaId) {
      return NextResponse.json(
        { error: "El acta no tiene mesa asignada. Use el flujo de contingencia." },
        { status: 400 }
      );
    }
    const mesa = await db.mesa.findUnique({ where: { id: p.mesaId }, include: { consulado: true } });
    if (!mesa) {
      return NextResponse.json({ error: "La mesa indicada no existe" }, { status: 400 });
    }

    // 2) Validación del barcode (si viaja)
    let barcodeNormalizado: string | null = null;
    if (p.barcode15) {
      const parse = parseBarcode15(p.barcode15);
      if (!parse.ok) {
        return NextResponse.json({ error: parse.motivo }, { status: 400 });
      }
      barcodeNormalizado = p.barcode15.replace(/[^0-9]/g, "");
      if (parse.tipoEjemplar !== p.tipoEjemplar) {
        return NextResponse.json(
          {
            error: `El código corresponde a ${parse.tipoEjemplar}, pero se intentó registrar como ${p.tipoEjemplar}.`,
          },
          { status: 400 }
        );
      }
    }

    // 3) Score final RN-02 (calidad + confianza de identificación).
    //    Un barcode digitado/leído correctamente ES identificación certa:
    //    no se penaliza con la confianza incierta del VLM.
    const analisis = (p.analisis ?? null) as AnalisisVLM | null;
    const barcodeConfiable = Boolean(barcodeNormalizado);
    const confIdent = barcodeConfiable
      ? 0.98
      : Math.min(1, Math.max(0.4, analisis?.confianza ?? 0.75));
    const scoreFinal = p.modoManual
      ? Math.max(p.scoreCalidad, 9)
      : calcularScoreRN02({
          scoreCalidad: p.scoreCalidad,
          confIdentificacion: confIdent,
          confClasificacion: barcodeConfiable ? 1 : 0.85,
        });

    // 4) Decisión server-side (fuente única de verdad)
    const decision = decidirEstado({
      score: scoreFinal,
      firmasDetectadas: analisis?.firmasDetectadas ?? null,
      envioAdvertencia: p.envioAdvertencia,
      modoManual: p.modoManual,
    });

    // 5) Guard de ranura (mesa + tipo + página)
    const huella = generarHuella({ barcode15: barcodeNormalizado, qrTexto: p.qrTexto });
    const existente = await db.acta.findFirst({
      where: { mesaId: mesa.id, tipoEjemplar: p.tipoEjemplar, pagina: p.pagina },
    });

    if (existente) {
      const mismoPliego =
        huella && existente.huella && existente.huella === huella;
      if (!mismoPliego && existente.estado === "VALIDADO" && !p.modoManual) {
        const conflicto: DecisionEnvio = {
          estado: "ANOMALIA",
          motivo: `RANURA OCUPADA: ${p.tipoEjemplar} P${p.pagina} de MESA ${mesa.numero} ya tiene un acta VALIDADA de otro pliego`,
          duplicado: true,
        };
        return NextResponse.json(
          { ok: false, error: conflicto.motivo, decision: conflicto },
          { status: 409 }
        );
      }
      // Reemplazo (re-scan del mismo pliego o ranura aún no validada)
      const actualizada = await db.acta.update({
        where: { id: existente.id },
        data: {
          barcode15: barcodeNormalizado,
          qrTexto: p.qrTexto ?? null,
          huella,
          estado: decision.estado,
          scoreCalidad: scoreFinal,
          modoManual: p.modoManual,
          envioAdvertencia: p.envioAdvertencia,
          imagenDataUrl: p.imagenDataUrl,
          analisisJson: analisis ? JSON.stringify(analisis) : null,
          problemasJson: JSON.stringify(p.problemas ?? []),
        },
      });
      return NextResponse.json({
        ok: true,
        acta: { id: actualizada.id, estado: actualizada.estado },
        decision,
        reemplazadaActaId: existente.id,
      });
    }

    // 6) Alta nueva (huella única global → anti-duplicado)
    try {
      const acta = await db.acta.create({
        data: {
          barcode15: barcodeNormalizado,
          qrTexto: p.qrTexto ?? null,
          huella,
          tipoEjemplar: p.tipoEjemplar,
          pagina: p.pagina,
          totalPaginas: p.totalPaginas,
          estado: decision.estado,
          scoreCalidad: scoreFinal,
          modoManual: p.modoManual,
          envioAdvertencia: p.envioAdvertencia,
          imagenDataUrl: p.imagenDataUrl,
          analisisJson: analisis ? JSON.stringify(analisis) : null,
          problemasJson: JSON.stringify(p.problemas ?? []),
          mesaId: mesa.id,
        },
      });
      return NextResponse.json({
        ok: true,
        acta: { id: acta.id, estado: acta.estado },
        decision,
      });
    } catch (e) {
      const err = e as { code?: string };
      if (err.code === "P2002") {
        const dup: DecisionEnvio = {
          estado: "RECHAZADO",
          motivo: "PLIEGO DUPLICADO: este acta ya fue registrada en el sistema",
          duplicado: true,
        };
        return NextResponse.json({ ok: false, error: dup.motivo, decision: dup }, { status: 409 });
      }
      throw e;
    }
  } catch (e) {
    console.error("actas POST error", e);
    return NextResponse.json({ error: "No se pudo registrar el acta" }, { status: 500 });
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
