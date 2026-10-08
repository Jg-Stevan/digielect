// ============================================================
// DIGIELECT — Exportador de datos estáticos para GitHub Pages
// Genera public/data/{bootstrap,informes,digitalizador-bootstrap,
// indice-actas}.json a partir del backend real (dev server +
// Prisma) para alimentar el MODO DEMO de la exportación estática;
// indice-actas.json (FASE 3, rol C) sale de prisma/data/
// exterior-actas.json para que el digitalizador del modo demo
// construya el índice de identificación con crearIndiceActas()
// (CONVENIOS.md §2).
//
// B-03: public/data/indice-actas.json se escribe EXACTAMENTE UNA
// VEZ (en exportarIndiceActas) y SIEMPRE en formato compacto
// { generado, total, actas: [{c,m,z,p,e}] } — el único formato que
// parsearIndiceRemoto (src/lib/indice-actas-remota.ts) acepta.
//
// [OLA6 6.5] Orden y atomicidad (decisión documentada):
//   1) indice-actas.json se escribe PRIMERO: es offline y
//      determinista (no depende del dev server) — es el único
//      archivo con permiso de refrescarse aunque el backend esté
//      caído (un export fallido nunca lo deja a medias: tmp+rename).
//   2) ANTES de escribir cualquier archivo dependiente del server
//      se validan los 3 endpoints (bootstrap, informes,
//      digitalizador/bootstrap): si uno falla, el script aborta con
//      exit != 0 y NO toca los 3 JSON de servidor (sin salidas
//      parciales ni demo en estado mixto).
//   3) Cada archivo se escribe en *.tmp y se renombra (rename
//      atómico del SO): un crash a mitad de escritura nunca deja
//      un JSON truncado en public/data.
//
// Uso:  bun run demo:export   (DEV_URL=http://localhost:3000 por defecto)
// Requiere: dev server corriendo y BD sembrada (sólo para los 3 JSON
// de servidor; el índice de actas es offline).
// ============================================================

import { db } from "../src/lib/db";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";

const DEV_URL = process.env.DEV_URL ?? "http://localhost:3000";

/** 8 actas E-14 de ejemplo servidas en /actas (modo demo) */
const IMAGENES_EJEMPLO = [
  "/actas/E14_XXX_X_88_495_010_02_000_X_XXX-1.jpg",
  "/actas/E14_XXX_X_88_495_010_02_000_X_XXX-2.jpg",
  "/actas/E14_XXX_X_88_335_005_02_000_X_XXX-1.jpg",
  "/actas/E14_XXX_X_88_335_005_02_000_X_XXX-2.jpg",
  "/actas/E14_XXX_X_88_355_003_08_000_X_XXX-1.jpg",
  "/actas/E14_XXX_X_88_355_003_08_000_X_XXX-2.jpg",
  "/actas/E14_XXX_X_88_335_005_81_000_X_XXX-1.jpg",
  "/actas/E14_XXX_X_88_335_005_81_000_X_XXX-2.jpg",
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

/** [OLA6 6.5] Escritura atómica: tmp + rename del SO. Un crash a
 *  mitad de writeFile deja como mucho un *.tmp (que aquí se limpia),
 *  nunca un JSON truncado en la ruta final que sirve la demo. */
async function escribirAtomico(ruta: string, contenido: string): Promise<void> {
  const tmp = `${ruta}.tmp`;
  try {
    await writeFile(tmp, contenido, "utf-8");
    await rename(tmp, ruta);
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

/** [OLA6 6.5] GET con fail-fast claro: envuelve fetch para que un
 *  backend caído aborte el export con un mensaje accionable ANTES de
 *  escribir cualquier archivo dependiente del server. */
async function pedirEndpoint(ruta: string): Promise<Response> {
  try {
    const res = await fetch(`${DEV_URL}${ruta}`, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res;
  } catch (e) {
    throw new Error(
      `No se pudo consultar ${ruta} en ${DEV_URL} (${e instanceof Error ? e.message : String(e)}). Asegúrate de que el dev server corre ahí con la BD sembrada.`
    );
  }
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
 *
 * ÚNICO punto de escritura de indice-actas.json (fix B-03): antes, main()
 * lo sobrescribía al final con un array plano de objetos completos, formato
 * que parsearIndiceRemoto rechaza ("no trae el arreglo 'actas'") y que
 * rompería el modo demo tras cada regeneración. La validación de integridad
 * (3.670 códigos únicos de 7 dígitos) vive aquí, junto a la escritura —
 * que desde [OLA6 6.5] es atómica (tmp + rename).
 *
 * @returns bytes del JSON escrito (para el resumen final).
 */
export async function exportarIndiceActas(): Promise<number> {
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

  // Validaciones mínimas antes de publicar el índice (antes vivían en main(),
  // que escribía encima del archivo; ahora acompañan a la única escritura).
  const conCodigo = compactas.filter((a) => /^\d{7}$/.test(a.c));
  const unicos = new Set(compactas.map((a) => a.c));
  if (
    compactas.length === 0 ||
    unicos.size !== compactas.length ||
    conCodigo.length !== compactas.length
  ) {
    throw new Error(
      `Índice de actas corrupto: ${compactas.length} filas, ${unicos.size} códigos únicos, ${conCodigo.length} de 7 dígitos (se esperaban 3.670 únicas)`
    );
  }

  const salida = {
    generado: new Date().toISOString(),
    total: compactas.length,
    actas: compactas,
  };
  const json = JSON.stringify(salida);
  await mkdir("public/data", { recursive: true });
  await escribirAtomico("public/data/indice-actas.json", json);
  console.log(
    `[export] public/data/indice-actas.json generado (${salida.total} actas, ${(json.length / 1024).toFixed(1)} KB).`
  );
  return json.length;
}

async function main() {
  // --- 1) Índice de identificación (offline, primero: ver cabecera) ---
  await exportarIndiceActas();

  // --- 2) Validar TODOS los backends ANTES de escribir (OLA6 6.5) ---
  console.log(
    `[export] Consultando ${DEV_URL} (bootstrap, informes, digitalizador/bootstrap) ...`
  );
  const [resBoot, resInfo, resDig] = await Promise.all([
    pedirEndpoint("/api/bootstrap"),
    pedirEndpoint("/api/informes"),
    pedirEndpoint("/api/digitalizador/bootstrap"),
  ]);

  const boot = (await resBoot.json()) as Record<string, unknown>;
  const informes = (await resInfo.json()) as Record<string, unknown>;

  if (boot.ok !== true) throw new Error("La respuesta de bootstrap no es ok");
  if (informes.ok !== true) throw new Error("La respuesta de informes no es ok");

  // El bootstrap del digitalizador NO trae campo "ok" (contrato real
  // {consulados, resumen, serverTime} — ver src/app/api/digitalizador/
  // bootstrap/route.ts y el consumo directo en src/lib/digitalizador/
  // store.ts cargarDatos): en vez de exigir un ok que no existe, se
  // valida la estructura que la PWA realmente lee.
  const digCrudo: unknown = await resDig.json();
  if (typeof digCrudo !== "object" || digCrudo === null) {
    throw new Error(
      "La respuesta de digitalizador/bootstrap no es un objeto JSON"
    );
  }
  const dig = digCrudo as { consulados?: unknown; resumen?: unknown };
  if (!Array.isArray(dig.consulados) || dig.consulados.length === 0) {
    throw new Error(
      "La respuesta de digitalizador/bootstrap no trae consulados[] (contrato roto)"
    );
  }
  if (typeof dig.resumen !== "object" || dig.resumen === null) {
    throw new Error(
      "La respuesta de digitalizador/bootstrap no trae resumen (contrato roto)"
    );
  }
  const digConsulados: Array<Record<string, unknown>> = dig.consulados;
  const digResumen = dig.resumen as Record<string, unknown>;

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

  // digitalizador-bootstrap.json: pase directo del contrato del endpoint
  // + marcadores de demo. MISMA forma que el fixture manual que reemplaza
  // (consulados, resumen, modoDemo, generadoEn — el store de la PWA sólo
  // lee consulados/resumen, ver store.ts cargarDatos). El fixture huérfano
  // de 554 KB desaparece: ahora el archivo sale del backend real con cada
  // demo:export.
  const digitalizadorOut = {
    consulados: digConsulados,
    resumen: digResumen,
    modoDemo: true,
    generadoEn: new Date().toISOString(),
  };

  // --- 3) Escrituras atómicas (tmp + rename, una por archivo) ---
  await escribirAtomico(
    "public/data/bootstrap.json",
    JSON.stringify(bootstrapOut)
  );
  await escribirAtomico(
    "public/data/informes.json",
    JSON.stringify(informesOut)
  );
  await escribirAtomico(
    "public/data/digitalizador-bootstrap.json",
    JSON.stringify(digitalizadorOut)
  );

  // B-03: el índice de actas YA fue escrito por exportarIndiceActas() al
  // inicio (formato compacto único). No se vuelve a escribir aquí: la
  // segunda escritura que existía sobrescribía el archivo con un array
  // plano incompatible con parsearIndiceRemoto y rompería el modo demo
  // en cada regeneración.

  const nCons = consulados.length;
  console.log(
    `[export] public/data/bootstrap.json generado (${nCons} consulados) y public/data/informes.json (${actasRecientes.length} actas recientes).`
  );
  console.log(
    `[export] public/data/digitalizador-bootstrap.json generado (${digConsulados.length} puestos) desde el backend real.`
  );

  // [OLA6 6.5] Resumen final con los 4 archivos y sus tamaños reales en disco.
  const [sIndice, sBoot, sInfo, sDig] = await Promise.all([
    stat("public/data/indice-actas.json"),
    stat("public/data/bootstrap.json"),
    stat("public/data/informes.json"),
    stat("public/data/digitalizador-bootstrap.json"),
  ]);
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  console.log(
    `[export] RESUMEN (4 archivos): indice-actas.json ${kb(sIndice.size)} · bootstrap.json ${kb(sBoot.size)} · informes.json ${kb(sInfo.size)} · digitalizador-bootstrap.json ${kb(sDig.size)}`
  );
}

// Solo como script de entrada (bun run demo:export). Al IMPORTAR el módulo
// (validación ad-hoc fuera del repo, CONVENIOS §6) no hay efectos secundarios.
if (import.meta.main) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("[export] ERROR:", e);
      process.exit(1);
    });
}
