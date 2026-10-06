// ============================================================
// DIGIELECT — Exportador de datos estáticos para GitHub Pages
// Genera public/data/{bootstrap,informes}.json a partir del
// backend real (dev server + Prisma) para alimentar el MODO
// DEMO de la exportación estática, y public/data/indice-actas.json
// (FASE 3, rol C) a partir de prisma/data/exterior-actas.json
// para que el digitalizador del modo demo construya el índice de
// identificación con crearIndiceActas() (CONVENIOS.md §2).
//
// Uso:  bun scripts/export-static-data.ts
// Requiere: dev server corriendo en localhost:3000 y BD sembrada
// (solo para bootstrap/informes; el índice de actas es offline).
// ============================================================

import { db } from "../src/lib/db";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEV_URL = process.env.DEV_URL ?? "http://localhost:3000";

/** 8 actas E-14 de ejemplo servidas en /actas-ejemplo (modo demo) */
const IMAGENES_EJEMPLO = [
  "/actas-ejemplo/E14_XXX_X_88_495_010_02_000_X_XXX-1.jpg",
  "/actas-ejemplo/E14_XXX_X_88_495_010_02_000_X_XXX-2.jpg",
  "/actas-ejemplo/E14_XXX_X_88_335_005_02_000_X_XXX-1.jpg",
  "/actas-ejemplo/E14_XXX_X_88_335_005_02_000_X_XXX-2.jpg",
  "/actas-ejemplo/E14_XXX_X_88_355_003_08_000_X_XXX-1.jpg",
  "/actas-ejemplo/E14_XXX_X_88_355_003_08_000_X_XXX-2.jpg",
  "/actas-ejemplo/E14_XXX_X_88_335_005_81_000_X_XXX-1.jpg",
  "/actas-ejemplo/E14_XXX_X_88_335_005_81_000_X_XXX-2.jpg",
];

/** Hash simple determinista para mapear ids → imagen de ejemplo */
function hashSimple(texto: string): number {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) {
    h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function imagenEjemploPara(id: string | null | undefined): string {
  if (!id) return IMAGENES_EJEMPLO[1];
  return IMAGENES_EJEMPLO[hashSimple(id) % IMAGENES_EJEMPLO.length];
}

// ------------------------------------------------------------
// FASE 3 — Índice compacto de actas (offline, sin dev server)
// ------------------------------------------------------------

/** exterior-actas.json: ítems crudos del visor (forma ActaVisoItem) */
interface ExteriorActasJSON {
  total?: number;
  actas?: Array<Record<string, unknown>>;
}

/** Fila compacta de indice-actas.json: claves cortas para < 300 KB */
interface FilaCompacta {
  /** idTransmissionCode (7 dígitos, llave del índice) */
  c: string;
  /** municipalityCode (país en el exterior) */
  m: string;
  /** idZoneCode */
  z: string;
  /** standCode (puesto/consulado) */
  p: string;
  /** numberStand (mesa) */
  e: string;
}

/**
 * Genera public/data/indice-actas.json desde prisma/data/exterior-actas.json.
 *
 * Formato compacto: { generado, total, actas: [{c,m,z,p,e}] }. El cliente lo
 * mapea a ActaVisoItem con src/lib/indice-actas-remota.ts. Se omiten
 * expectedName (pdfHash de 64 hex) e idDepartmentCode (crearIndiceActas
 * asume "88" = EXTERIOR al faltar): sin esos campos el archivo pesa ~190 KB
 * en lugar de ~1 MB.
 */
async function exportarIndiceActas(): Promise<void> {
  const crudo = await readFile("prisma/data/exterior-actas.json", "utf-8");
  const datos = JSON.parse(crudo) as ExteriorActasJSON;
  const actas = datos.actas ?? [];
  if (typeof datos.total === "number" && datos.total !== actas.length) {
    console.warn(
      `[export] AVISO: exterior-actas.json declara total=${datos.total} pero contiene ${actas.length} actas.`
    );
  }

  const compactas: FilaCompacta[] = actas.map((a) => ({
    c: String(a.idTransmissionCode ?? ""),
    m: String(a.municipalityCode ?? ""),
    z: String(a.idZoneCode ?? ""),
    p: String(a.standCode ?? ""),
    e: String(a.numberStand ?? ""),
  }));

  const salida = {
    generado: new Date().toISOString(),
    total: compactas.length,
    actas: compactas,
  };
  const json = JSON.stringify(salida);
  await mkdir("public/data", { recursive: true });
  await writeFile("public/data/indice-actas.json", json, "utf-8");
  console.log(
    `[export] public/data/indice-actas.json generado (${salida.total} actas, ${(json.length / 1024).toFixed(1)} KB).`
  );
}

async function main() {
  // --- FASE 3: índice de identificación (offline, no depende del server) ---
  await exportarIndiceActas();

  console.log(`[export] Consultando ${DEV_URL}/api/bootstrap ...`);
  const [resBoot, resInfo] = await Promise.all([
    fetch(`${DEV_URL}/api/bootstrap`, { cache: "no-store" }),
    fetch(`${DEV_URL}/api/informes`, { cache: "no-store" }),
  ]);
  if (!resBoot.ok || !resInfo.ok) {
    throw new Error(
      `El dev server no respondió correctamente (bootstrap: ${resBoot.status}, informes: ${resInfo.status}). Asegúrate de que corre en ${DEV_URL} con la BD sembrada.`
    );
  }

  const boot = (await resBoot.json()) as Record<string, unknown>;
  const informes = (await resInfo.json()) as Record<string, unknown>;

  if (boot.ok !== true) throw new Error("La respuesta de bootstrap no es ok");
  if (informes.ok !== true) throw new Error("La respuesta de informes no es ok");

  // --- Decoradores de relojes vivos para el modo demo ---
  // El monitor calcula horaActualPais/tiempoDesdeCierre en vivo usando el
  // offset UTC y la hora local de cierre; la exportación estática incluye
  // esos metadatos para replicar el comportamiento en el cliente.
  const consuladosDb = await db.consulado.findMany({
    select: { codigo: true, utcOffsetMin: true, horaCierreLocal: true },
  });
  const decorados = new Map(
    consuladosDb.map((c) => [
      `cons-${c.codigo}`,
      { utcOffsetMin: c.utcOffsetMin, horaCierreLocalRaw: c.horaCierreLocal },
    ])
  );

  const consulados = (boot.consulados as Array<Record<string, unknown>>).map(
    (row) => {
      const extra = decorados.get(String(row.id)) ?? {
        utcOffsetMin: 0,
        horaCierreLocalRaw: "16:00",
      };
      return { ...row, ...extra };
    }
  );

  // --- Informes: imagenUrl /api/actas/{id}/imagen → acta de ejemplo ---
  const actasRecientes = (
    informes.actasRecientes as Array<Record<string, unknown>>
  ).map((a) => ({
    ...a,
    imagenUrl: imagenEjemploPara(String(a.id ?? "")),
  }));

  await mkdir("public/data", { recursive: true });

  const bootstrapOut = {
    ok: true,
    consulados,
    anomalias: boot.anomalias,
    queueFiles: boot.queueFiles,
    slaRows: boot.slaRows,
    resumen: boot.resumen,
    generadoEn: new Date().toISOString(),
    modoDemo: true,
  };

  const informesOut = {
    ...informes,
    actasRecientes,
    generadoEn: new Date().toISOString(),
    modoDemo: true,
  };

  await writeFile(
    "public/data/bootstrap.json",
    JSON.stringify(bootstrapOut),
    "utf-8"
  );
  await writeFile(
    "public/data/informes.json",
    JSON.stringify(informesOut),
    "utf-8"
  );

  const nCons = consulados.length;
  console.log(
    `[export] public/data/bootstrap.json generado (${nCons} consulados) y public/data/informes.json (${actasRecientes.length} actas recientes).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[export] ERROR:", e);
    process.exit(1);
  });
