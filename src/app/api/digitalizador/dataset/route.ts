import { NextRequest, NextResponse } from "next/server";

// ============================================================
// [C-17] GET /api/digitalizador/dataset?puesto=<codigo>
// TAREA 2.2 del PLAN_DIGIELECT_DIGITALIZADOR.md: descarga del
// subconjunto de mesas del puesto para la BASE LOCAL (IndexedDB).
// Fuente determinista: catálogo índice de actas del visor exterior
// (public/data/indice-actas.json — 3.670 códigos únicos). Sin IA,
// sin DB extra: catálogo local servido del propio despliegue.
// ============================================================

export const dynamic = "force-dynamic";

interface FilaIndice {
  /** idTransmissionCode (7 dígitos, único) */
  c: string;
  /** municipio/país (municipioCode del exterior) */
  m: string;
  /** zona */
  z: string;
  /** puesto */
  p: string;
  /** mesa (numberStand) */
  e: string;
  /** hash del PDF oficial, si viene */
  n?: string;
}

function pad3(v: string): string {
  return (v ?? "").replace(/\D/g, "").padStart(3, "0");
}

export async function GET(req: NextRequest) {
  const puesto = req.nextUrl.searchParams.get("puesto")?.trim() ?? "";
  // Formato esperado: "<municipio>-<zona>-<puesto>" (ej. "495-10-02")
  const partes = puesto.split("-").map((x) => x.trim());
  if (partes.length !== 3 || !partes.every((x) => /^\d+$/.test(x))) {
    return NextResponse.json(
      { ok: false, error: "Parámetro puesto requerido con formato m-z-p (ej. 495-10-02)" },
      { status: 400 }
    );
  }
  const [muni, zona, puest] = partes;

  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const ruta = join(process.cwd(), "public", "data", "indice-actas.json");
    const bruto = await readFile(ruta, "utf8");
    const idx = JSON.parse(bruto) as { actas?: FilaIndice[] };

    const filas = (idx.actas ?? [])
      .filter(
        (a) =>
          a.p === puest &&
          pad3(a.z) === pad3(zona) &&
          a.m === muni
      )
      .map((a) => ({
        idTransmissionCode: a.c,
        paisDepartamento: a.m,
        municipio: a.m,
        zona: a.z,
        puestoCodigo: a.p,
        puestoNombre: puesto,
        mesa: Number(a.e) || 0,
        mesasTotalesPuesto: 0, // lo completa el cliente con el bootstrap
        pdfHash: a.n,
        expectedName: a.n,
      }));

    const mesas = Array.from(new Set(filas.map((f) => f.mesa))).sort((a, b) => a - b);
    return NextResponse.json({
      ok: true,
      puesto,
      total: filas.length,
      mesasTotalesPuesto: Math.max(mesas.length, 0),
      filas,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "dataset no disponible",
      },
      { status: 500 }
    );
  }
}
