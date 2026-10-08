// ============================================================
// DIGIELECT — Reloj único por zona horaria IANA (fix B-11)
//
// ANTES existían 4 implementaciones de "hora local del país":
//   · monitor.ts: Date.now() + offsetMin, tratando el offset
//     "respecto a Bogotá" como si fuera "respecto a UTC" (+5h de
//     error medido en Roma) y sin DST.
//   · SaludSistema.tsx: su propia compensación con COT_OFFSET_MIN
//     (contradecía al monitor) y un "+5" hardcodeado con el signo
//     invertido.
//   · api/actas: Date.now() + offsetMin (mismo bug del monitor).
//   · seed.ts: offset estático por país (sin DST, Roma 300/420 fijo).
// Ahora TODOS usan esta única fuente con Intl.DateTimeFormat, que
// resuelve la zona IANA vigente (DST incluido) del sistema.
//
// Módulo PURO (client + server, CONVENIOS §3): sin DOM, sin Prisma.
// ============================================================

/** Zona canónica de Bogotá (UTC-5, sin DST) */
export const ZONA_COT = "America/Bogota";

/** Bogotá = UTC-5 en minutos (se mantiene exportada para derivar
 *  etiquetas COT sin repetir la constante, fix S-38) */
export const COT_OFFSET_MIN = -300;

/**
 * Tabla país → zona IANA para los 67 países del exterior E-14
 * (nombres EXACTOS como vienen en exterior-tree.json /
 * municipalityName). Zona de la capital/sede consular principal.
 * DST automático vía Intl (p. ej. Europa en CEST/CET según fecha).
 */
export const ZONA_POR_PAIS: Record<string, string> = {
  GHANA: "Africa/Accra",
  ALEMANIA: "Europe/Berlin",
  ARGELIA: "Africa/Algiers",
  ARGENTINA: "America/Argentina/Buenos_Aires",
  ARUBA: "America/Aruba",
  AUSTRALIA: "Australia/Sydney",
  AUSTRIA: "Europe/Vienna",
  AZERBAIYAN: "Asia/Baku",
  BELGICA: "Europe/Brussels",
  BOLIVIA: "America/La_Paz",
  BRASIL: "America/Sao_Paulo",
  CANADA: "America/Toronto",
  CHILE: "America/Santiago",
  "CHINA REPUBLICA POPULAR": "Asia/Shanghai",
  "COREA DEL SUR": "Asia/Seoul",
  "COSTA RICA": "America/Costa_Rica",
  CUBA: "America/Havana",
  CURAZAO: "America/Curacao",
  DINAMARCA: "Europe/Copenhagen",
  ECUADOR: "America/Guayaquil",
  EGIPTO: "Africa/Cairo",
  "EL SALVADOR": "America/El_Salvador",
  "EMIRATOS ARABES UNIDOS": "Asia/Dubai",
  "ESPAÑA": "Europe/Madrid",
  "ESTADOS UNIDOS": "America/New_York",
  FINLANDIA: "Europe/Helsinki",
  FRANCIA: "Europe/Paris",
  GUATEMALA: "America/Guatemala",
  HAITI: "America/Port-au-Prince",
  HONDURAS: "America/Tegucigalpa",
  HUNGRIA: "Europe/Budapest",
  INDIA: "Asia/Kolkata",
  INDONESIA: "Asia/Jakarta",
  INGLATERRA: "Europe/London",
  IRLANDA: "Europe/Dublin",
  ISRAEL: "Asia/Jerusalem",
  ITALIA: "Europe/Rome",
  JAMAICA: "America/Jamaica",
  JAPON: "Asia/Tokyo",
  KENIA: "Africa/Nairobi",
  LIBANO: "Asia/Beirut",
  MALASIA: "Asia/Kuala_Lumpur",
  MARRUECOS: "Africa/Casablanca",
  MEXICO: "America/Mexico_City",
  NICARAGUA: "America/Managua",
  NORUEGA: "Europe/Oslo",
  "NUEVA ZELANDIA": "Pacific/Auckland",
  "PAISES BAJOS": "Europe/Amsterdam",
  PANAMA: "America/Panama",
  PARAGUAY: "America/Asuncion",
  PERU: "America/Lima",
  POLONIA: "Europe/Warsaw",
  PORTUGAL: "Europe/Lisbon",
  "PUERTO RICO": "America/Puerto_Rico",
  "REPUBLICA DE FILIPINAS": "Asia/Manila",
  "REPUBLICA DE SINGAPUR": "Asia/Singapore",
  "REPUBLICA DOMINICANA": "America/Santo_Domingo",
  // El árbol real trae "VIETNA" (sin M final) y el seed "VIETNAM":
  // ambas variantes mapeadas para no caer al fallback silencioso.
  "REPUBLICA SOCIALISTA DE VIETNAM": "Asia/Ho_Chi_Minh",
  "REPUBLICA SOCIALISTA DE VIETNA": "Asia/Ho_Chi_Minh",
  RUSIA: "Europe/Moscow",
  SUDAFRICA: "Africa/Johannesburg",
  SUECIA: "Europe/Stockholm",
  SUIZA: "Europe/Zurich",
  TAILANDIA: "Asia/Bangkok",
  "TRINIDAD Y TOBAGO": "America/Port_of_Spain",
  TURQUIA: "Europe/Istanbul",
  URUGUAY: "America/Montevideo",
  VENEZUELA: "America/Caracas",
};

/** Zona IANA de un país del exterior; Bogotá si no está mapeado. */
export function zonaIanaDePais(pais: string | null | undefined): string {
  if (!pais) return ZONA_COT;
  return ZONA_POR_PAIS[pais] ?? ZONA_COT;
}

// ------------------------------------------------------------
// [OLA6-TZ · plan 6.8] Zonas horarias por CIUDAD (hallazgo V-5)
//
// ZONA_POR_PAIS asigna a cada país la zona de su capital/sede
// principal; para los países MULTI-ZONA eso es incorrecto por
// puesto: 123 puestos de EE.UU. caían todos a America/New_York
// cuando el dataset los tiene en Eastern/Central/Mountain/
// Pacific/Arizona/Alaska/Hawái (análogo en Canadá/Brasil/
// Australia). La granularidad real vive en exterior-tree.json
// (standName: "SABADO MIAMI - CONSULADO", "04 - San Francisco -
// Denver", "Salt Lake City", "Hawaii"…).
//
// Estructura: país → { token de ciudad (NORMALIZADO, ver
// normalizarLugar) → zona IANA }. Solo países y ciudades que
// existen REALMENTE en exterior-tree.json (dump verificado).
// RUSIA (solo Moscú) e INDONESIA (solo Yakarta) no necesitan
// overrides: todos sus puestos ya caen en la zona del país.
//
// Semántica del standName "CONSULADO - SATÉLITE" (p. ej.
// "San Francisco - Denver"): el puesto físico está en la ciudad
// SATÉLITE y el prefijo es la jurisdicción consular → el matcher
// prefiere la ciudad que aparece MÁS A LA DERECHA del nombre.
// ------------------------------------------------------------
export const ZONA_POR_CIUDAD: Record<string, Record<string, string>> = {
  // EE.UU. — 123 puestos: ciudades consulares, puestos "sueltos"
  // (estado/ciudad sin sufijo) y satélites que cambian de zona.
  "ESTADOS UNIDOS": {
    // Eastern (America/New_York)
    MIAMI: "America/New_York",
    ATLANTA: "America/New_York",
    ORLANDO: "America/New_York",
    BOSTON: "America/New_York",
    "NUEVA YORK": "America/New_York",
    WASHINGTON: "America/New_York",
    NEWARK: "America/New_York",
    PHILADELPHIA: "America/New_York", // "Newark - Philadelphia"
    COLUMBUS: "America/New_York", // "Columbus, Ohio"
    // Central (America/Chicago)
    HOUSTON: "America/Chicago",
    CHICAGO: "America/Chicago",
    "NUEVA ORLEANS": "America/Chicago", // "Houston - Nueva Orleans"
    "KANSAS CITY": "America/Chicago",
    MINNESOTA: "America/Chicago", // puesto suelto (Minneapolis)
    MISSOURI: "America/Chicago", // puesto suelto (St. Louis/K.C.)
    // Mountain (America/Denver)
    DENVER: "America/Denver", // "San Francisco - Denver"
    "SALT LAKE CITY": "America/Denver",
    ALBUQUERQUE: "America/Denver", // "Los Angeles - Albuquerque"
    // Pacific (America/Los_Angeles)
    "LOS ANGELES": "America/Los_Angeles",
    "SAN FRANCISCO": "America/Los_Angeles",
    "SAN DIEGO": "America/Los_Angeles", // "Los Angeles - San Diego"
    SEATTLE: "America/Los_Angeles", // "San Francisco - Seattle"
    // Zonas propias
    PHOENIX: "America/Phoenix", // "Los Angeles - Phoenix" (MST sin DST)
    MICHIGAN: "America/Detroit", // puesto suelto (Míchigan → Detroit)
    ALASKA: "America/Anchorage", // "San Francisco - Alaska"
    HAWAII: "Pacific/Honolulu", // puesto suelto
  },
  // Canadá — 36 puestos (Calgary/Montreal/Ottawa/Toronto/Vancouver
  // + "London" = London, Ontario).
  CANADA: {
    TORONTO: "America/Toronto",
    OTTAWA: "America/Toronto",
    MONTREAL: "America/Toronto", // America/Montreal es alias de Toronto
    LONDON: "America/Toronto", // London, Ontario (¡no Inglaterra!)
    VANCOUVER: "America/Vancouver",
    CALGARY: "America/Edmonton", // Alberta (America/Calgary es alias)
  },
  // Brasil — 42 puestos. Sin DST desde 2019: la frontera real es
  // UTC-3 (litoral/sur) vs UTC-4 (Amazonía: Manaos/Tabatinga).
  BRASIL: {
    "SAO PAULO": "America/Sao_Paulo",
    "RIO DE JANEIRO": "America/Sao_Paulo",
    BRASILIA: "America/Sao_Paulo",
    "BELO HORIZONTE": "America/Sao_Paulo",
    CURITIBA: "America/Sao_Paulo",
    FLORIANOPOLIS: "America/Sao_Paulo",
    "FOZ DE IGUAZU": "America/Sao_Paulo",
    "PORTO ALEGRE": "America/Sao_Paulo",
    FORTALEZA: "America/Fortaleza", // UTC-3 (zona propia)
    RECIFE: "America/Recife", // UTC-3 (zona propia)
    MANAOS: "America/Manaus", // UTC-4 (Amazonía)
    TABATINGA: "America/Manaus", // UTC-4 (Amazonía)
  },
  // Australia — 17 puestos (Sydney/Canberra/Melbourne con DST;
  // Brisbane y Perth sin DST y en UTC+10/UTC+8).
  AUSTRALIA: {
    SYDNEY: "Australia/Sydney",
    CANBERRA: "Australia/Sydney", // Australia/Canberra es alias
    MELBOURNE: "Australia/Melbourne",
    BRISBANE: "Australia/Brisbane",
    PERTH: "Australia/Perth",
  },
  // México — la instrucción del plan era "país único desde 2022,
  // dejar como está", pero el chequeo del dataset lo desmiente:
  // "Cancún Consulado" (+7 variantes de día) está en Quintana Roo,
  // UTC-5 SIN DST desde 2015 (America/Cancun), NO en el UTC-6 de
  // America/Mexico_City. Override mínimo de 1 ciudad; el resto del
  // país sigue cayendo a la zona del país. Revertir = borrar la
  // entrada si se prefiere el error de 1 h.
  MEXICO: {
    CANCUN: "America/Cancun",
  },
};

/**
 * [OLA6-TZ] Normaliza un nombre de ciudad/puesto para comparación:
 * MAYÚSCULAS, sin tildes ni diacríticos, sin puntuación ("Cancún
 * Consulado" → "CANCUN CONSULADO"; "Columbus, Ohio" → "COLUMBUS
 * OHIO"). Las claves de ZONA_POR_CIUDAD están en esta forma.
 */
function normalizarLugar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Caché de resoluciones pais+lugar → zona (950 puestos, relojes cada 30 s). */
const cacheZonaPuesto = new Map<string, string>();

/**
 * [OLA6-TZ · plan 6.8] Zona IANA de un PUESTO: ciudad primero,
 * país después.
 *
 * `ciudad` admite la ciudad ("MIAMI"), el nombre del puesto real
 * ("SABADO MIAMI - CONSULADO") o el campo `puesto` del DTO
 * ("04 - San Francisco - Denver") — el matching es por CONTENCIÓN
 * de tokens completos. En nombres "CONSULADO - SATÉLITE" manda la
 * ciudad más a la derecha (la sede física del puesto). Sin ciudad,
 * país desconocido o ciudad sin override → zona del país
 * (zonaIanaDePais), que sigue siendo la fuente para países de una
 * sola zona.
 */
export function zonaIanaDePuesto(
  pais: string | null | undefined,
  ciudad: string | null | undefined
): string {
  if (!ciudad) return zonaIanaDePais(pais);
  const porCiudad = pais ? ZONA_POR_CIUDAD[pais] : undefined;
  if (!porCiudad) return zonaIanaDePais(pais);

  const clave = `${pais}§${ciudad}`;
  const enCache = cacheZonaPuesto.get(clave);
  if (enCache) return enCache;

  // Bordes de palabra ("… MIAMI …") y la coincidencia MÁS A LA
  // DERECHA gana (satélite > consulado); a igual posición, la
  // clave más larga (más específica).
  const normalizado = ` ${normalizarLugar(ciudad)} `;
  let zona: string | null = null;
  let mejorIdx = -1;
  let mejorLen = 0;
  for (const [token, iana] of Object.entries(porCiudad)) {
    const idx = normalizado.lastIndexOf(` ${token} `);
    if (
      idx >= 0 &&
      (idx > mejorIdx || (idx === mejorIdx && token.length > mejorLen))
    ) {
      zona = iana;
      mejorIdx = idx;
      mejorLen = token.length;
    }
  }

  const resultado = zona ?? zonaIanaDePais(pais);
  if (cacheZonaPuesto.size > 4096) cacheZonaPuesto.clear();
  cacheZonaPuesto.set(clave, resultado);
  return resultado;
}

// ------------------------------------------------------------
// Formateadores cacheados (Intl es costoso de construir)
// ------------------------------------------------------------
const fmtHora = new Map<string, Intl.DateTimeFormat>();
const fmtPartes = new Map<string, Intl.DateTimeFormat>();

function formateadorHora(iana: string): Intl.DateTimeFormat {
  let f = fmtHora.get(iana);
  if (!f) {
    f = new Intl.DateTimeFormat("es-CO", {
      timeZone: iana,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    fmtHora.set(iana, f);
  }
  return f;
}

function formateadorPartes(iana: string): Intl.DateTimeFormat {
  let f = fmtPartes.get(iana);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: iana,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtPartes.set(iana, f);
  }
  return f;
}

function zonaValida(iana: string): boolean {
  try {
    formateadorHora(iana);
    return true;
  } catch {
    return false;
  }
}

/** "HH:MM" de un instante en la zona IANA indicada (DST correcto). */
export function horaEnZona(ahora: Date, iana: string): string {
  const zona = zonaValida(iana) ? iana : ZONA_COT;
  return formateadorHora(zona).format(ahora);
}

/** Minutos desde medianoche LOCAL de la zona (para comparar cierres). */
export function minutosDelDiaEnZona(ahora: Date, iana: string): number {
  const zona = zonaValida(iana) ? iana : ZONA_COT;
  const partes = formateadorPartes(zona).formatToParts(ahora);
  const val = (tipo: string) =>
    Number(partes.find((p) => p.type === tipo)?.value ?? "0");
  return val("hour") * 60 + val("minute");
}

/**
 * Desfase de la zona vs UTC AHORA, en minutos (DST correcto).
 * p. ej. Europe/Rome en julio → +120; en enero → +60.
 */
export function offsetZoneMin(ahora: Date, iana: string): number {
  const zona = zonaValida(iana) ? iana : ZONA_COT;
  const partes = formateadorPartes(zona).formatToParts(ahora);
  const val = (tipo: string) =>
    Number(partes.find((p) => p.type === tipo)?.value ?? "0");
  const comoUtc = Date.UTC(
    val("year"),
    val("month") - 1,
    val("day"),
    val("hour"),
    val("minute"),
    val("second")
  );
  return Math.round((comoUtc - ahora.getTime()) / 60000);
}
