// ============================================================
// DIGIELECT — Seed con DATOS REALES de la Registraduría
// Fuente: visor E-14 de la 2ª vuelta presidencial
// https://e14segundavueltapresidente.registraduria.gov.co/home
// (JSONs de /assets/temis/divipol_json/ descargados en prisma/data)
//
// Ingesta REAL:
//   · 67 países (municipios DIVIPOL del depto 88 CONSULADOS)
//   · 949 puestos/consulados reales con idStand
//   · 3.670 mesas reales (countTable)
//   · 3.670 actas E-14 publicadas (código de transmisión real,
//     hash del PDF público y mesa)
//   · Avance nacional real por departamento (34) y corporación
//
// Capa operativa simulada (encima de los datos reales):
//   · 8 anomalías de demostración sobre mesas reales
//   · 5 notificaciones SLA sobre consulados reales
//   · 3 archivos en cola BATCH
//   · Resultados de votación solo en la muestra VLM (Roma)
// ============================================================

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBarcode15 } from "../src/lib/e14/parse";
import {
  ZONA_COT,
  horaEnZona,
  offsetZoneMin,
  zonaIanaDePuesto,
} from "../src/lib/hora-zona";

const db = new PrismaClient();

const DATA_DIR = join(__dirname, "data");

// ---------- Tipos de los JSON reales ----------
interface StandJSON {
  idStand: string;
  standCode: string;
  standName: string;
  countTable: number;
}
interface ZoneJSON {
  idZoneCode: string;
  zoneName: string;
  stands: StandJSON[];
}
interface MunJSON {
  municipalityCode: string;
  municipalityName: string;
  zones: ZoneJSON[];
}
interface TreeJSON {
  departamentos: {
    municipalities: MunJSON[];
  }[];
}
interface ActaJSON {
  idTransmissionCode: string;
  numberStand: string;
  expectedName: string;
  idStand: string;
}
interface ActasJSON {
  total: number;
  actas: ActaJSON[];
}

// ---------- Mapeo país → región + offset UTC vs Bogotá (min) ----------
// Offsets con horario de verano (octubre 2026).
const PAIS_INFO: Record<string, { region: string; offset: number }> = {
  GHANA: { region: "africa", offset: 300 },
  ALEMANIA: { region: "europa", offset: 420 },
  ARGELIA: { region: "africa", offset: 360 },
  AZERBAIYAN: { region: "asia", offset: 540 },
  CURAZAO: { region: "america", offset: 60 },
  ARGENTINA: { region: "america", offset: 120 },
  ARUBA: { region: "america", offset: 60 },
  AUSTRALIA: { region: "oceania", offset: 900 },
  AUSTRIA: { region: "europa", offset: 420 },
  BELGICA: { region: "europa", offset: 420 },
  BOLIVIA: { region: "america", offset: 60 },
  BRASIL: { region: "america", offset: 120 },
  CANADA: { region: "america", offset: 60 },
  "COREA DEL SUR": { region: "asia", offset: 840 },
  "COSTA RICA": { region: "america", offset: -60 },
  CUBA: { region: "america", offset: 60 },
  CHILE: { region: "america", offset: 120 },
  "CHINA REPUBLICA POPULAR": { region: "asia", offset: 780 },
  DINAMARCA: { region: "europa", offset: 420 },
  ECUADOR: { region: "america", offset: 0 },
  EGIPTO: { region: "africa", offset: 480 },
  "EL SALVADOR": { region: "america", offset: -60 },
  "EMIRATOS ARABES UNIDOS": { region: "asia", offset: 540 },
  "ESPAÑA": { region: "europa", offset: 420 },
  "ESTADOS UNIDOS": { region: "america", offset: 60 },
  "REPUBLICA DE FILIPINAS": { region: "asia", offset: 780 },
  FINLANDIA: { region: "europa", offset: 480 },
  FRANCIA: { region: "europa", offset: 420 },
  GUATEMALA: { region: "america", offset: -60 },
  HAITI: { region: "america", offset: 60 },
  "PAISES BAJOS": { region: "europa", offset: 420 },
  HONDURAS: { region: "america", offset: -60 },
  HUNGRIA: { region: "europa", offset: 420 },
  INDIA: { region: "asia", offset: 630 },
  INDONESIA: { region: "asia", offset: 720 },
  INGLATERRA: { region: "europa", offset: 360 },
  IRLANDA: { region: "europa", offset: 360 },
  ISRAEL: { region: "asia", offset: 480 },
  ITALIA: { region: "europa", offset: 420 },
  JAMAICA: { region: "america", offset: 0 },
  JAPON: { region: "asia", offset: 840 },
  KENIA: { region: "africa", offset: 480 },
  LIBANO: { region: "asia", offset: 480 },
  MALASIA: { region: "asia", offset: 780 },
  MARRUECOS: { region: "africa", offset: 360 },
  MEXICO: { region: "america", offset: -60 },
  NICARAGUA: { region: "america", offset: -60 },
  "NUEVA ZELANDIA": { region: "oceania", offset: 1080 },
  NORUEGA: { region: "europa", offset: 420 },
  PANAMA: { region: "america", offset: 0 },
  PARAGUAY: { region: "america", offset: 120 },
  PERU: { region: "america", offset: 0 },
  POLONIA: { region: "europa", offset: 420 },
  PORTUGAL: { region: "europa", offset: 360 },
  "PUERTO RICO": { region: "america", offset: 60 },
  "REPUBLICA DOMINICANA": { region: "america", offset: 60 },
  "REPUBLICA DE SINGAPUR": { region: "asia", offset: 780 },
  "REPUBLICA SOCIALISTA DE VIETNAM": { region: "asia", offset: 720 },
  RUSIA: { region: "europa", offset: 480 },
  SUDAFRICA: { region: "africa", offset: 420 },
  SUECIA: { region: "europa", offset: 420 },
  SUIZA: { region: "europa", offset: 420 },
  TAILANDIA: { region: "asia", offset: 720 },
  TURQUIA: { region: "asia", offset: 480 },
  "TRINIDAD Y TOBAGO": { region: "america", offset: 60 },
  URUGUAY: { region: "america", offset: 120 },
  VENEZUELA: { region: "america", offset: 60 },
};

// ---------- Utilidades ----------
function slug(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

/** Determinista: hash simple de string → entero */
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const DIAS_SEMANA =
  /^(LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO)\s+/;

/** Ciudad legible a partir del nombre real del puesto */
function ciudadDe(standName: string): { ciudad: string; esDia: boolean } {
  const sinDia = standName.replace(DIAS_SEMANA, "");
  const esDia = sinDia !== standName;
  const base = sinDia.includes(" - ")
    ? sinDia.split(" - ")[0].trim()
    : sinDia.split(/\s+/)[0];
  const clean = base.replace(/consulado/gi, "").trim() || sinDia;
  return { ciudad: clean.toUpperCase(), esDia };
}

/**
 * [B-11] Hora local actual del país (instante del seed) — zona IANA
 * con DST. La fórmula anterior (Date.now() + offset-desde-Bogotá leído
 * como UTC) daba +5h de error medido en Roma y congelaba el DST.
 * [OLA6-TZ · 6.8] `lugar` = standName del puesto: en países
 * multi-zona la hora congelada del seed queda por CIUDAD.
 */
function horaActualPais(pais: string, lugar?: string): string {
  return horaEnZona(new Date(), zonaIanaDePuesto(pais, lugar));
}

/**
 * [B-11] Hora Colombia equivalente al cierre local del país.
 * Instante del cierre HOY en la zona IANA del país (DST vigente)
 * convertido a America/Bogota. Formato 12h como la UI original.
 * [OLA6-TZ · 6.8] `lugar` = standName: cierre por CIUDAD en países
 * multi-zona (columna informativa; los relojes vivos usan hora-zona).
 */
function horaCierreCol(pais: string, horaCierreLocal: string, lugar?: string): string {
  const ahora = new Date();
  const zona = zonaIanaDePuesto(pais, lugar);
  const off = offsetZoneMin(ahora, zona);
  const offCol = offsetZoneMin(ahora, ZONA_COT);
  const partes = horaCierreLocal.split(":").map((p) => parseInt(p, 10));
  const hh = isNaN(partes[0]) ? 16 : partes[0];
  const mm = isNaN(partes[1]) ? 0 : partes[1];
  // fecha local "hoy" en la zona del país:
  const local = new Date(ahora.getTime() + off * 60000);
  const cierreUtcMs =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hh, mm) -
    off * 60000;
  const col = new Date(cierreUtcMs + offCol * 60000);
  const hh24 = col.getUTCHours();
  const ampm = hh24 >= 12 ? "PM" : "AM";
  const hh12 = hh24 % 12 === 0 ? 12 : hh24 % 12;
  return `${hh12}:${String(col.getUTCMinutes()).padStart(2, "0")} ${ampm}`;
}

// ---------- Carga de JSONs reales ----------
const tree = JSON.parse(
  readFileSync(join(DATA_DIR, "exterior-tree.json"), "utf-8")
) as TreeJSON;
const actasJSON = JSON.parse(
  readFileSync(join(DATA_DIR, "exterior-actas.json"), "utf-8")
) as ActasJSON;
const avanceDeptos = JSON.parse(
  readFileSync(join(DATA_DIR, "avance-departamentos.json"), "utf-8")
) as { departamentos: { codigo: string; nombre: string; esperadas: number; publicadas: number }[] };

const exterior = tree.departamentos[0].municipalities;

// Índice de actas reales por idStand
const actasPorStand = new Map<string, ActaJSON[]>();
for (const a of actasJSON.actas) {
  const lista = actasPorStand.get(a.idStand) ?? [];
  lista.push(a);
  actasPorStand.set(a.idStand, lista);
}

// ---------- Actas de ejemplo para el visor ----------
const ACTA_ROMA_P1 = "/actas/E14_XXX_X_88_495_010_02_000_X_XXX-1.jpg";
const ACTA_ROMA_P2 = "/actas/E14_XXX_X_88_495_010_02_000_X_XXX-2.jpg";
const ACTA_GENERICA_P1 = "/actas/E14_XXX_X_88_335_005_02_000_X_XXX-1.jpg";
const ACTA_GENERICA_P2 = "/actas/E14_XXX_X_88_335_005_02_000_X_XXX-2.jpg";
const ACTA_TARRAGONA_P1 = "/actas/E14_XXX_X_88_355_003_08_000_X_XXX-1.jpg";
const ACTA_TARRAGONA_P2 = "/actas/E14_XXX_X_88_355_003_08_000_X_XXX-2.jpg";

// Resultados leídos por VLM del acta real de Roma (muestra procesada)
const RESULTADOS_ROMA = [
  { candidato: "IVÁN CEPEDA CASTRO", partido: "PACTO HISTÓRICO", votos: 22 },
  { candidato: "ABELARDO DE LA ESPRIELLA", partido: "INDEPENDIENTE", votos: 33 },
];

// ---------- Anomalías de demostración (sobre mesas reales) ----------
// Busca puestos reales por patrón para anclar las anomalías.
interface AnomaliaSeed {
  findStand: RegExp;
  mesa: number;
  tipo: "SIN_FIRMAS" | "ILEGIBLE_RESCANEO" | "CODIGO_NO_DETECTADO";
  sla: number;
}

const ANOMALIAS_SEED: AnomaliaSeed[] = [
  { findStand: /ROMA - CONSULADO$/i, mesa: 1, tipo: "SIN_FIRMAS", sla: 22 },
  { findStand: /MADRID/i, mesa: 2, tipo: "ILEGIBLE_RESCANEO", sla: 14 },
  { findStand: /NUEVA YORK/i, mesa: 1, tipo: "CODIGO_NO_DETECTADO", sla: 35 },
  { findStand: /MILÁN CONSULADO$/i, mesa: 3, tipo: "SIN_FIRMAS", sla: 8 },
  { findStand: /EL CAIRO/i, mesa: 1, tipo: "ILEGIBLE_RESCANEO", sla: 46 },
  { findStand: /TARRAGONA/i, mesa: 1, tipo: "SIN_FIRMAS", sla: 52 },
  { findStand: /GUATEMALA/i, mesa: 1, tipo: "CODIGO_NO_DETECTADO", sla: 18 },
  { findStand: /CARACAS/i, mesa: 1, tipo: "SIN_FIRMAS", sla: 5 },
];

// ---------- SLA de demostración (sobre consulados reales) ----------
interface SlaSeed {
  findStand: RegExp;
  fase: 1 | 2 | 3;
  canal: "WA" | "SMS" | "EMAIL";
  canalExtra?: "WA" | "SMS" | "EMAIL";
  minutos: number;
  estado: string;
  estadoDetalle: string;
  subFaseDesc: string;
  mesasInactivasCount: number;
}

const SLA_SEED: SlaSeed[] = [
  {
    findStand: /EL CAIRO/i, fase: 1, canal: "WA", minutos: 24,
    estado: "ENTREGADO", estadoDetalle: "Entregado (16:52) · En espera de lectura",
    subFaseDesc: "Mora 24m dentro de tolerancia F1", mesasInactivasCount: 2,
  },
  {
    findStand: /PANAMA.*CONSULADO|CONSULADO.*PANAMA/i, fase: 2, canal: "WA", canalExtra: "SMS",
    minutos: 47, estado: "LEIDO", estadoDetalle: "Leído (17:11) · Acuse verificado",
    subFaseDesc: "Mora >40m sin lote inicial", mesasInactivasCount: 3,
  },
  {
    findStand: /GUATEMALA/i, fase: 2, canal: "WA", minutos: 55, estado: "SIN_ACUSE",
    estadoDetalle: "Sin acuse de recibo · Reintento programado",
    subFaseDesc: "Mora >40m · Escalamiento Nivel 1 activo", mesasInactivasCount: 4,
  },
  {
    findStand: /HANOI|VIETNAM/i, fase: 3, canal: "WA", canalExtra: "SMS", minutos: 132,
    estado: "LEIDO", estadoDetalle: "Leído (18:26) · Cónsul notificado",
    subFaseDesc: "Mora >2h · Escalamiento Cónsul (Nivel 2)", mesasInactivasCount: 6,
  },
  {
    findStand: /MOSCUN|MOSCÚ|MOSCU/i, fase: 3, canal: "WA", canalExtra: "EMAIL", minutos: 168,
    estado: "SIN_ACUSE", estadoDetalle: "Sin acuse · Escalamiento Dirección Migratorios",
    subFaseDesc: "Mora >2h · Fase crítica Nivel 2", mesasInactivasCount: 5,
  },
];

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log("🇨🇴 Digielect — Seed con datos REALES de la Registraduría");
  console.log(`   Fuente: e14segundavueltapresidente.registraduria.gov.co`);

  // Limpiar la base
  await db.auditEvent.deleteMany();
  await db.resultadoVoto.deleteMany();
  await db.anomalia.deleteMany();
  await db.notificacionSla.deleteMany();
  await db.colaArchivo.deleteMany();
  await db.acta.deleteMany();
  await db.mesa.deleteMany();
  await db.consulado.deleteMany();
  await db.avanceDepartamento.deleteMany();
  await db.avanceCorporacion.deleteMany();

  // ---------------------------------------------------------
  // 1. CONSULADOS reales (949 puestos del depto 88)
  // ---------------------------------------------------------
  interface ConsRow {
    id: string;
    codigo: string;
    idStand: string;
    paisCodigo: string;
    pais: string;
    ciudad: string;
    puesto: string;
    zona: string;
    region: string;
    numMesas: number;
    horaCierreLocal: string;
    horaCierreColombia: string;
    horaActualPais: string;
    tiempoDesdeCierre: string;
    enMora: boolean;
    utcOffsetMin: number;
    orden: number;
  }
  interface MesaRow {
    id: string;
    numero: number;
    consuladoId: string;
    horaCierreLocal: string;
    orden: number;
  }

  const consulados: ConsRow[] = [];
  const mesas: MesaRow[] = [];
  const idsMesaUsados = new Set<string>();
  const standIndex = new Map<string, ConsRow>(); // idStand → consulado

  let orden = 1;
  const todosLosStands: { mun: MunJSON; zone: ZoneJSON; stand: StandJSON }[] = [];
  for (const mun of exterior) {
    for (const zone of mun.zones) {
      for (const stand of zone.stands) {
        todosLosStands.push({ mun, zone, stand });
      }
    }
  }

  // Roma primero (continuidad del flujo PWA), luego por tamaño
  const esRomaPrincipal = (s: { stand: StandJSON }) =>
    /^ROMA - CONSULADO$/i.test(s.stand.standName);
  const ordenados = [...todosLosStands].sort((a, b) => {
    const ra = esRomaPrincipal(a) ? 1 : 0;
    const rb = esRomaPrincipal(b) ? 1 : 0;
    if (ra !== rb) return rb - ra;
    if (b.stand.countTable !== a.stand.countTable)
      return b.stand.countTable - a.stand.countTable;
    return a.stand.standName.localeCompare(b.stand.standName);
  });

  for (const { mun, zone, stand } of ordenados) {
    const info = PAIS_INFO[mun.municipalityName] ?? {
      region: "asia",
      offset: 300,
    };
    const { ciudad, esDia } = ciudadDe(stand.standName);
    const codigo = `${mun.municipalityCode}-${zone.idZoneCode}-${stand.standCode}`;
    const id = `cons-${codigo}`;
    const horaCierre = esDia ? "15:00" : "16:00";
    const cons: ConsRow = {
      id,
      codigo,
      idStand: stand.idStand,
      paisCodigo: mun.municipalityCode,
      pais: mun.municipalityName,
      ciudad,
      puesto: `${stand.standCode} - ${stand.standName}`,
      zona: zone.idZoneCode,
      region: info.region,
      numMesas: stand.countTable,
      horaCierreLocal: horaCierre,
      horaCierreColombia: horaCierreCol(mun.municipalityName, horaCierre, stand.standName),
      horaActualPais: horaActualPais(mun.municipalityName, stand.standName),
      tiempoDesdeCierre: "> 1 Hr",
      enMora: false,
      utcOffsetMin: info.offset,
      orden: orden++,
    };
    consulados.push(cons);
    standIndex.set(stand.idStand, cons);

    // Mesas reales del puesto
    const actasStand = actasPorStand.get(stand.idStand) ?? [];
    const numeros = actasStand
      .map((a) => parseInt(a.numberStand, 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
    const listaMesas =
      numeros.length > 0
        ? numeros
        : Array.from({ length: stand.countTable }, (_, i) => i + 1);

    listaMesas.forEach((numero, idx) => {
      // Referencia legible única: mesa-roma-001 (sufijo si colisión)
      let ref = `mesa-${slug(ciudad)}${esDia ? "-diario" : ""}-${pad3(numero)}`;
      while (idsMesaUsados.has(ref)) ref = `${ref}-z${zone.idZoneCode}`;
      idsMesaUsados.add(ref);
      mesas.push({
        id: ref,
        numero,
        consuladoId: id,
        horaCierreLocal: horaCierre,
        orden: idx,
      });
    });
  }

  console.log(`   ${consulados.length} consulados (puestos reales)`);
  console.log(`   ${mesas.length} mesas reales`);

  await db.consulado.createMany({
    data: consulados.map((c) => ({
      id: c.id,
      codigo: c.codigo,
      idStand: c.idStand,
      idTransmisionPuesto: c.paisCodigo,
      pais: c.pais,
      ciudad: c.ciudad,
      puesto: c.puesto,
      zona: c.zona,
      region: c.region,
      numMesas: c.numMesas,
      horaCierreLocal: c.horaCierreLocal,
      horaCierreColombia: c.horaCierreColombia,
      horaActualPais: c.horaActualPais,
      tiempoDesdeCierre: c.tiempoDesdeCierre,
      enMora: c.enMora,
      utcOffsetMin: c.utcOffsetMin,
      orden: c.orden,
    })),
  });

  await db.mesa.createMany({
    data: mesas.map((m) => ({
      id: m.id,
      numero: m.numero,
      consuladoId: m.consuladoId,
      horaCierreLocal: m.horaCierreLocal,
      orden: m.orden,
    })),
  });

  // ---------------------------------------------------------
  // 2. ACTAS reales (4 páginas por mesa: D-P1/P2 + T-P1/P2)
  //    Basadas en los códigos de transmisión publicados
  // ---------------------------------------------------------
  interface ActaRow {
    id: string;
    barcode15: string | null;
    pdfHash: string | null;
    idTransmision: string | null;
    tipoEjemplar: string;
    pagina: number;
    totalPaginas: number;
    estado: string;
    scoreCalidad: number;
    imagenUrl: string | null;
    filename: string | null;
    detalle: string | null;
    mesaId: string;
    createdAt: Date;
  }

  const mesasPorCons = new Map<string, MesaRow[]>();
  for (const m of mesas) {
    const lista = mesasPorCons.get(m.consuladoId) ?? [];
    lista.push(m);
    mesasPorCons.set(m.consuladoId, lista);
  }

  const actas: ActaRow[] = [];
  const NOW = Date.now();
  const HORA_MS = 3600_000;

  for (const cons of consulados) {
    const actasStand = actasPorStand.get(cons.idStand) ?? [];
    const mesasCons = (mesasPorCons.get(cons.id) ?? []).sort((a, b) => a.orden - b.orden);
    // Puesto principal de Roma (para las actas de ejemplo del visor)
    const esRoma = /ROMA - CONSULADO$/i.test(cons.puesto);

    mesasCons.forEach((mesa, mIdx) => {
      const actaReal = actasStand.find(
        (a) => parseInt(a.numberStand, 10) === mesa.numero
      );
      // Timestamp escalonado: últimas ~11 horas (jornada transmitiendo)
      const base = NOW - (1.2 + (hashStr(mesa.id) % 620) / 60) * HORA_MS;

      const tipos: { tipo: "DELEGADOS" | "TRANSMISION"; digito: "2" | "3" }[] = [
        { tipo: "DELEGADOS", digito: "2" },
        { tipo: "TRANSMISION", digito: "3" },
      ];
      for (const { tipo, digito } of tipos) {
        for (const pagina of [1, 2]) {
          // [B-07] barcode15 ESTRUCTURALMENTE VÁLIDO para parseBarcode15:
          // 71 · kit(6) · tipo(1) · versión(2) · página(2) · total(2) = 15.
          // El kit son los ÚLTIMOS 6 dígitos del código de transmisión (7):
          // D y T de la misma mesa comparten código → comparten kit (como el
          // kit real de escrutinio de la mesa). El código anterior hacía
          // `padStart(6)` sobre 7 dígitos + `slice(0,15)` → 16 chars →
          // campos desplazados → parseBarcode15 = null en las 14.680 filas.
          const barcode = actaReal
            ? `71${String(actaReal.idTransmissionCode).padStart(6, "0").slice(-6)}${digito}01${String(pagina).padStart(2, "0")}02`
            : null;
          const id = `acta-${mesa.id}-${tipo === "DELEGADOS" ? "D" : "T"}-p${pagina}`;
          const score = 9 + (hashStr(id) % 2);
          let imagenUrl: string | null = null;
          if (esRoma && mesa.numero === 1) {
            imagenUrl = pagina === 1 ? ACTA_ROMA_P1 : ACTA_ROMA_P2;
          } else if (esRoma) {
            imagenUrl = pagina === 1 ? ACTA_GENERICA_P1 : ACTA_GENERICA_P2;
          } else if (/TARRAGONA/i.test(cons.puesto) && mesa.numero === 1) {
            imagenUrl = pagina === 1 ? ACTA_TARRAGONA_P1 : ACTA_TARRAGONA_P2;
          }
          actas.push({
            id,
            barcode15: barcode,
            pdfHash: actaReal?.expectedName ?? null,
            idTransmision: actaReal?.idTransmissionCode ?? null,
            tipoEjemplar: tipo,
            pagina,
            totalPaginas: 2,
            estado: "VALIDADO",
            scoreCalidad: score,
            imagenUrl,
            filename: `E14_${cons.paisCodigo}_${cons.zona}_${cons.idStand.slice(0, 2)}_${pad3(mesa.numero)}_${tipo === "DELEGADOS" ? "D" : "T"}_P${pagina}.pdf`,
            detalle:
              tipo === "DELEGADOS"
                ? "E-14 Delegados publicado por la Registraduría (código de transmisión real)"
                : "Preconteo transmitido · Ejemplar Transmisión",
            mesaId: mesa.id,
            createdAt: new Date(base + pagina * 90_000 + mIdx * 1000),
          });
        }
      }
    });
  }

  console.log(`   ${actas.length} actas (E-14 publicados reales + preconteo)`);

  // ---------------------------------------------------------
  // 2.5 [B-07] Validación de los barcode15 del seed: TODOS deben
  //      parsear con parseBarcode15 (el mismo parser que usa la PWA).
  //      El criterio de aceptación exige 14.680 barcodes sin null.
  // ---------------------------------------------------------
  {
    const conBarcode = actas.filter((a) => a.barcode15 !== null);
    const invalidos = conBarcode.filter((a) => parseBarcode15(a.barcode15 as string) === null);
    const semanticos = conBarcode.filter((a) => {
      const bc = parseBarcode15(a.barcode15 as string);
      if (!bc) return false;
      const digitoTipo = bc.tipoEjemplar;
      const tipoOk = digitoTipo === a.tipoEjemplar;
      const pagOk = bc.pagina === a.pagina && bc.totalPaginas === a.totalPaginas;
      return !(tipoOk && pagOk);
    });
    if (invalidos.length > 0 || semanticos.length > 0 || conBarcode.length !== actas.length) {
      console.error(
        `   ✗ barcodes inválidos: ${invalidos.length} · semántica rota: ${semanticos.length} · con barcode: ${conBarcode.length}/${actas.length}`
      );
      throw new Error("seed: barcode15 inválidos detectados (B-07)");
    }
    console.log(
      `   ✓ ${conBarcode.length} barcode15 válidos para parseBarcode15 (tipo+pagina coherentes)`
    );
  }

  // ---------------------------------------------------------
  // 3. CAPA OPERATIVA: anomalías de demostración
  // ---------------------------------------------------------
  const anomalias: {
    tipo: string;
    formulario: string;
    horaAlertaLocal: string;
    horaAlertaCol: string;
    pais: string;
    ciudad: string;
    mesa: string;
    mesaIdRef: string;
    slaMinutesRemaining: number;
    consuladoId: string;
    actaId: string;
  }[] = [];

  const TIPO_LABEL: Record<string, string> = {
    SIN_FIRMAS: "SIN FIRMAS DETECTADAS",
    ILEGIBLE_RESCANEO: "SOLICITUD RESCANEO",
    CODIGO_NO_DETECTADO: "CÓDIGO NO DETECTADO",
  };

  for (const aSeed of ANOMALIAS_SEED) {
    const cons = consulados.find((c) => aSeed.findStand.test(c.puesto));
    if (!cons) continue;
    const mesasCons = (mesasPorCons.get(cons.id) ?? []).sort((x, y) => x.orden - y.orden);
    const mesa = mesasCons.find((m) => m.numero === aSeed.mesa) ?? mesasCons[0];
    if (!mesa) continue;

    const idActaAnomala = `acta-${mesa.id}-T-p2`;
    const idx = actas.findIndex((x) => x.id === idActaAnomala);
    if (idx >= 0) {
      actas[idx] = {
        ...actas[idx],
        estado: "ANOMALIA",
        scoreCalidad: 6,
        detalle: `${TIPO_LABEL[aSeed.tipo]} · Bandeja del supervisor (RF-2.2)`,
        imagenUrl: ACTA_GENERICA_P2,
      };
    }

    const localTime = horaActualPais(cons.pais, cons.puesto);
    const colTime = horaEnZona(new Date(), ZONA_COT);

    anomalias.push({
      tipo: aSeed.tipo,
      formulario: `TRANSMISIÓN - PÁGINA 2`,
      horaAlertaLocal: `${localTime} LOCAL`,
      horaAlertaCol: `${colTime} COL`,
      pais: cons.pais,
      ciudad: cons.ciudad,
      mesa: `MESA ${pad3(mesa.numero)}`,
      mesaIdRef: mesa.id,
      slaMinutesRemaining: aSeed.sla,
      consuladoId: cons.id,
      actaId: idActaAnomala,
    });
  }

  console.log(`   ${anomalias.length} anomalías operativas (demo)`);

  // Persistir actas (en lotes)
  const BATCH = 1000;
  for (let i = 0; i < actas.length; i += BATCH) {
    await db.acta.createMany({ data: actas.slice(i, i + BATCH) });
  }

  // Resultados de votación de la muestra VLM (Roma mesa 001)
  await db.resultadoVoto.createMany({
    data: RESULTADOS_ROMA.map((r) => ({
      actaId: "acta-mesa-roma-001-D-p1",
      candidato: r.candidato,
      partido: r.partido,
      votos: r.votos,
    })),
  });

  // Persistir anomalías operativas (RF-2.2)
  await db.anomalia.createMany({ data: anomalias });

  // ---------------------------------------------------------
  // 4. SLA de demostración sobre consulados reales
  // ---------------------------------------------------------
  for (const slaSeed of SLA_SEED) {
    const cons = consulados.find((c) => slaSeed.findStand.test(c.puesto));
    if (!cons) continue;
    const mesasCons = (mesasPorCons.get(cons.id) ?? []).sort((x, y) => x.orden - y.orden);
    const inactivas = mesasCons
      .slice(0, slaSeed.mesasInactivasCount)
      .map((m) => `Mesa ${pad3(m.numero)}`)
      .join(", ");
    const despacho = horaActualPais(cons.pais, cons.puesto);

    await db.notificacionSla.create({
      data: {
        consuladoId: cons.id,
        mesasInactivas: inactivas,
        fase: slaSeed.fase,
        canal: slaSeed.canal,
        canalExtra: slaSeed.canalExtra,
        despachadoAt: `Despachado ${despacho}`,
        estado: slaSeed.estado,
        estadoDetalle: slaSeed.estadoDetalle,
        subFaseDesc: slaSeed.subFaseDesc,
        tiempoTranscurridoMin: slaSeed.minutos,
        tiempoTranscurridoLabel:
          slaSeed.minutos >= 60
            ? `${Math.floor(slaSeed.minutos / 60)}h ${slaSeed.minutos % 60}m`
            : `${slaSeed.minutos}m`,
      },
    });
  }
  console.log(`   ${SLA_SEED.length} notificaciones SLA operativas (demo)`);

  // ---------------------------------------------------------
  // 5. Cola BATCH (demo, sobre ubicaciones reales)
  // ---------------------------------------------------------
  await db.colaArchivo.createMany({
    data: [
      {
        filename: "LOTE_E14_ROMA_02_26062026.zip",
        size: "84.2 MB",
        ext: "ZIP",
        barcode: "710009822010102",
        location: "ITALIA > ROMA > Z. 10 > P. 02 > MESA 001",
        ocrStatus: "RESUELVE_ALERTA",
        ocrConfidence: 98,
        details: "Resuelve alerta SIN_FIRMAS de Mesa 001",
        resuelveMesaRef: "mesa-roma-001",
      },
      {
        filename: "E14_MADRID_M002_26062026.jpg",
        size: "2.8 MB",
        ext: "JPG",
        barcode: "710003513010102",
        location: "ESPAÑA > MADRID > Z. 01 > P. 01 > MESA 002",
        ocrStatus: "DUPLICADO",
        ocrConfidence: 91,
        details: "Acta ya registrada en el sistema · OMITIDO",
      },
      {
        filename: "E14_NUEVAYORK_M001_26062026.pdf",
        size: "1.9 MB",
        ext: "PDF",
        barcode: "710003614010102",
        location: "ESTADOS UNIDOS > NUEVA YORK > Z. 01 > P. 02 > MESA 001",
        ocrStatus: "NUEVO_REGISTRO",
        ocrConfidence: 96,
        details: "Alta confianza · Listo para integrar",
      },
    ],
  });

  // ---------------------------------------------------------
  // 6. Avance nacional REAL (Registraduría)
  // ---------------------------------------------------------
  await db.avanceCorporacion.create({
    data: {
      codigo: "001",
      nombre: "PRESIDENTE Y VICEPRESIDENTE 2026 · 2ª VUELTA (E14 DELEGADOS)",
      mesasEsperadas: 122020,
      actasPublicadas: 122019,
    },
  });
  await db.avanceDepartamento.createMany({
    data: avanceDeptos.departamentos.map((d) => ({
      codigo: d.codigo,
      nombre: d.nombre,
      mesasEsperadas: d.esperadas,
      actasPublicadas: d.publicadas,
      corporacion: "001",
    })),
  });
  console.log(
    `   Avance nacional real: ${avanceDeptos.departamentos.length} departamentos · 122.019/122.020 actas`
  );

  // ---------------------------------------------------------
  // 7. Audit trail
  // ---------------------------------------------------------
  await db.auditEvent.createMany({
    data: [
      {
        usuario: "SISTEMA",
        accion: "SINCRONIZACION_REGISTRADURIA",
        detalle:
          "Ingesta de datos reales del visor E-14 (depto 88 CONSULADOS: 949 puestos, 3.670 mesas, 3.670 actas publicadas)",
      },
      {
        usuario: "PWA-ITA-001",
        accion: "INGESTA_ACTA",
        detalle: "Roma M001 · E-14 Delegados P1 · Score 9/10 · RN-02 aprobado",
      },
      {
        usuario: "PWA-ITA-001",
        accion: "ALERTA_ANOMALIA",
        detalle: "Roma M001 · TRANSMISIÓN P2 · Sin firmas detectadas (RF-2.2)",
      },
      {
        usuario: "SUP-JG-001",
        accion: "INTEGRAR_BATCH",
        detalle: "LOTE_E14_ROMA_02 integrado · Resuelve alerta mesa-roma-001",
      },
      {
        usuario: "SUP-JG-001",
        accion: "APROBAR_ACTA",
        detalle: "Roma M001 · APROBADA · 'Firmas verificadas tras inspección manual'",
      },
    ],
  });

  // Resumen final
  const totalActas = await db.acta.count();
  const totalMesas = await db.mesa.count();
  const totalCons = await db.consulado.count();
  console.log("\n✅ Seed completo:");
  console.log(`   ${totalCons} consulados reales (depto 88 CONSULADOS)`);
  console.log(`   ${totalMesas} mesas reales`);
  console.log(`   ${totalActas} actas en BD (4 páginas por mesa)`);
  console.log(`   ${anomalias.length} anomalías · ${SLA_SEED.length} SLA · 3 BATCH`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
