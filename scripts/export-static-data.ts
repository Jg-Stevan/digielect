// ============================================================
// DIGIELECT — Exportador de datos estáticos para GitHub Pages
// Genera public/data/{bootstrap,informes}.json a partir del
// backend real (dev server + Prisma) para alimentar el MODO
// DEMO de la exportación estática.
//
// Uso:  bun scripts/export-static-data.ts
// Requiere: dev server corriendo en localhost:3000 y BD sembrada.
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

async function main() {
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

  // --- FASE 3 (rol B): índice de identificación de actas ---
  // El modo demo estático necesita las 3.670 actas del exterior con su
  // código de transmisión en el cliente para la identificación
  // determinista (TAREA-B §2). Fuente de verdad: exterior-actas.json
  // (misma forma cruda del visor que consume crearIndiceActas()).
  const fuente = await readFile(
    "prisma/data/exterior-actas.json",
    "utf-8"
  );
  const viso = JSON.parse(fuente) as { actas: unknown[] };
  const indiceActas = (Array.isArray(viso.actas) ? viso.actas : []).map(
    (a) => {
      const r = a as Record<string, unknown>;
      return {
        idTransmissionCode: String(r.idTransmissionCode ?? ""),
        numberStand: String(r.numberStand ?? ""),
        expectedName: String(r.expectedName ?? ""),
        idTransmissionCodeStatus: Number(r.idTransmissionCodeStatus ?? 0),
        idStand: String(r.idStand ?? ""),
        standCode: String(r.standCode ?? ""),
        idZoneCode: String(r.idZoneCode ?? ""),
        idDepartmentCode: String(r.idDepartmentCode ?? ""),
        municipalityCode: String(r.municipalityCode ?? ""),
      };
    }
  );
  // Validaciones mínimas antes de publicar el índice
  const conCodigo = indiceActas.filter((a) => /^\d{7}$/.test(a.idTransmissionCode));
  const unicos = new Set(indiceActas.map((a) => a.idTransmissionCode));
  if (indiceActas.length === 0 || unicos.size !== indiceActas.length || conCodigo.length !== indiceActas.length) {
    throw new Error(
      `Índice de actas corrupto: ${indiceActas.length} filas, ${unicos.size} códigos únicos, ${conCodigo.length} de 7 dígitos (se esperaban 3.670 únicas)`
    );
  }
  await writeFile(
    "public/data/indice-actas.json",
    JSON.stringify(indiceActas),
    "utf-8"
  );

  const nCons = consulados.length;
  console.log(
    `[export] public/data/bootstrap.json generado (${nCons} consulados) y public/data/informes.json (${actasRecientes.length} actas recientes).`
  );
  console.log(
    `[export] public/data/indice-actas.json generado (${indiceActas.length} actas · ${unicos.size} códigos de transmisión únicos · FASE 3 rol B).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[export] ERROR:", e);
    process.exit(1);
  });
