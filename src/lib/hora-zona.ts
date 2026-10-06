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
