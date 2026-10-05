// ============================================================
// DIGIELECT · Identificación determinista de actas E-14 exterior
// ============================================================
// DESCUBRIMIENTO VALIDADO (contra prisma/data/exterior-actas.json):
//
//   1. El código impreso entre las X del acta ("X 7-23-10-19 X") ES el
//      `idTransmissionCode` del visor oficial de la Registraduría:
//        El Cairo     → "7-23-10-19" → "7231019" ✅ (Egipto 335 · Z 05 · P 02 · M 001)
//        Barcelona-Gr → "3-73-56-16" → "3735616" ✅ (España 355 · Z 03 · P 08 · M 001)
//      En las 3.670 actas del departamento 88 (exterior) los códigos son
//      de EXACTAMENTE 7 dígitos y son 100% ÚNICOS → llave primaria de
//      identificación. No requiere IA: OCR de texto impreso grande.
//
//   2. El QR del E-14 decodifica a 32 bytes en base64url (44 chars con "=").
//      Es un digest/firma (SHA-256/HMAC con clave privada de la Registraduría):
//      NO reversible y NO coincide con el hash del PDF (`expectedName`).
//      Uso correcto: huella digital (deduplicación) y despliegue en UI,
//      NUNCA identificación.
//
//   3. Barcode15 (ver @/lib/e14/parse) codifica tipo de ejemplar (dígito 9)
//      y página (dígitos 12-13). Cuando el barcode sale borroso, la página y
//      el tipo se clasifican por ANCLAS DE CONTENIDO (texto impreso grande)
//      y, opcionalmente, por perfil de tinta estructural.
//
// Módulo PURO y determinista (cliente y servidor): sin Prisma, sin z-ai,
// sin DOM. El índice de actas se recibe construido por el llamador
// (Prisma en modo completo · JSON estático en modo demo).
// ============================================================

import type { TipoEjemplar } from "@/lib/types";
import { parseBarcode15, soloDigitos } from "@/lib/e14/parse";

// ------------------------------------------------------------
// Índice de actas (fuente: visor E-14 → prisma/data/exterior-actas.json)
// ------------------------------------------------------------

/** Forma cruda de un registro del visor E-14 (exterior-actas.json) */
export interface ActaVisoItem {
  /** Código de transmisión · SIEMPRE 7 dígitos en el exterior */
  idTransmissionCode: string;
  /** Mesa, 3 dígitos con ceros ("001") */
  numberStand: string;
  /** Nombre del PDF publicado = hash SHA-256 en hex + ".pdf" */
  expectedName: string;
  /** Estado de publicación en el visor (11 = publicada) */
  idTransmissionCodeStatus: number;
  /** ID global del puesto */
  idStand: string;
  /** Puesto (2 dígitos) */
  standCode: string;
  /** Zona (2 dígitos) */
  idZoneCode: string;
  /** Departamento (88 = consulados exterior) */
  idDepartmentCode: string;
  /** Municipio/divipol del consulado (país) */
  municipalityCode: string;
}

/** Entrada normalizada del índice de identificación */
export interface EntradaIndice {
  idTransmision: string;
  mesaNumero: number;
  consulado: {
    departamento: string;
    municipio: string;
    zona: string;
    puesto: string;
    idStand: string;
  };
  /** Hash SHA-256 hex del PDF oficial (sin ".pdf") */
  pdfHash: string;
  /** Estado de publicación en el visor */
  estadoPublicacion: number;
  /** id de Mesa en la BD/demo-store, si el llamador lo conoce */
  mesaId?: string;
}

/**
 * Construye el índice de identificación (Map por código de transmisión).
 * Acepta la forma cruda del visor. Los códigos se normalizan por si la
 * fuente trajera separadores.
 */
export function crearIndiceActas(items: ActaVisoItem[]): Map<string, EntradaIndice> {
  const indice = new Map<string, EntradaIndice>();
  for (const it of items ?? []) {
    const codigo = soloDigitos(it?.idTransmissionCode ?? "");
    if (!codigo) continue;
    indice.set(codigo, {
      idTransmision: codigo,
      mesaNumero: Number(it.numberStand ?? "0") || 0,
      consulado: {
        departamento: it.idDepartmentCode ?? "",
        municipio: it.municipalityCode ?? "",
        zona: it.idZoneCode ?? "",
        puesto: it.standCode ?? "",
        idStand: it.idStand ?? "",
      },
      pdfHash: (it.expectedName ?? "").replace(/\.pdf$/i, ""),
      estadoPublicacion: it.idTransmissionCodeStatus ?? 0,
    });
  }
  return indice;
}

// ------------------------------------------------------------
// Normalización del código de transmisión leído por OCR
// ------------------------------------------------------------

export interface CodigoNormalizado {
  /** Código limpio de 7 dígitos, o null si es irrecuperable */
  codigo: string | null;
  /** Dígitos corregidos por confusión OCR (trazabilidad) */
  correcciones: string[];
  notas: string[];
}

/**
 * Correcciones de confusión OCR SOLO en contexto de dígitos
 * (el código de transmisión es numérico):
 *   O/o → 0   ·   I/i/l/| → 1
 * No se corrigen símbolos ambiguos (S/5, B/8, Z/2) para no
 * inventar códigos falsos: esos van a revisión humana.
 */
const CONFUSABLES: Record<string, string> = {
  O: "0",
  o: "0",
  I: "1",
  i: "1",
  l: "1",
  "|": "1",
};

/**
 * Normaliza la lectura OCR de la zona "X 7-23-10-19 X".
 * Acepta con/sin X, con guiones, puntos, espacios o pegote.
 * Devuelve null si no hay 7 dígitos recuperables.
 */
export function normalizarCodigoTransmision(crudo: string | null | undefined): CodigoNormalizado {
  const notas: string[] = [];
  const correcciones: string[] = [];
  if (!crudo) return { codigo: null, correcciones, notas: ["sin lectura"] };

  let texto = crudo.trim();
  // Quitar marcadores laterales "X" si el OCR los capturó pegados
  texto = texto.replace(/^\s*[xX]\s*/, "").replace(/\s*[xX]\s*$/, "");

  let digitos = "";
  for (const ch of texto) {
    if (ch >= "0" && ch <= "9") {
      digitos += ch;
    } else if (CONFUSABLES[ch] !== undefined) {
      digitos += CONFUSABLES[ch];
      correcciones.push(`${ch}→${CONFUSABLES[ch]}`);
    }
    // guiones, puntos, espacios y demás separadores: ignorados
  }

  if (digitos.length === 0) {
    return { codigo: null, correcciones, notas: ["sin dígitos en la lectura"] };
  }
  if (digitos.length > 7) {
    // El OCR pudo capturar dígitos vecinos (p. ej. parte del barcode).
    // Se conservan los últimos 7: el código suele ser lo último leído.
    notas.push(`lectura de ${digitos.length} dígitos; se toman los últimos 7`);
    digitos = digitos.slice(-7);
  }
  if (digitos.length !== 7) {
    notas.push(`código incompleto (${digitos.length}/7 dígitos)`);
    return { codigo: null, correcciones, notas };
  }
  if (correcciones.length > 0) notas.push(`confusables corregidos: ${correcciones.join(", ")}`);
  return { codigo: digitos, correcciones, notas };
}

// ------------------------------------------------------------
// Encabezado DIVIPOL leído por OCR (validación cruzada)
// ------------------------------------------------------------

/** Campos numéricos impresos del encabezado del acta (todos opcionales) */
export interface LecturaEncabezado {
  /** "PAÍS: 335" */
  pais?: string | null;
  /** "ZONA: 05" */
  zona?: string | null;
  /** "PUESTO: 02" */
  puesto?: string | null;
  /** "MESA: 001" */
  mesa?: string | null;
}

export type CampoCheck = "ok" | "mismatch" | "sin-dato";

export interface ValidacionEncabezado {
  campos: { pais: CampoCheck; zona: CampoCheck; puesto: CampoCheck; mesa: CampoCheck };
  /** null = no hay datos suficientes para decidir */
  consistente: boolean | null;
  mismatches: number;
}

function compararCampo(lectura: string | null | undefined, esperado: string): CampoCheck {
  const l = soloDigitos(lectura ?? "");
  if (!l) return "sin-dato";
  // comparación numérica tolerante a ceros a la izquierda
  return Number(l) === Number(esperado || "0") ? "ok" : "mismatch";
}

function validarEncabezado(
  lectura: LecturaEncabezado | null | undefined,
  e: EntradaIndice
): ValidacionEncabezado {
  const campos = {
    pais: compararCampo(lectura?.pais, e.consulado.municipio),
    zona: compararCampo(lectura?.zona, e.consulado.zona),
    puesto: compararCampo(lectura?.puesto, e.consulado.puesto),
    mesa: compararCampo(lectura?.mesa, String(e.mesaNumero).padStart(3, "0")),
  };
  const conDato = Object.values(campos).filter((c) => c !== "sin-dato");
  const mismatches = Object.values(campos).filter((c) => c === "mismatch").length;
  const consistente = conDato.length === 0 ? null : mismatches === 0;
  return { campos, consistente, mismatches };
}

// ------------------------------------------------------------
// Identificación (búsqueda exacta + respaldo tolerante)
// ------------------------------------------------------------

export type EstadoIdentificacion =
  | "IDENTIFICADA"
  | "AMBIGUA"
  | "NO_ENCONTRADA"
  | "CODIGO_ILEGIBLE";

export interface ResultadoIdentificacion {
  estado: EstadoIdentificacion;
  entrada: EntradaIndice | null;
  codigoUsado: string | null;
  /** Códigos alternativos a distancia 1 (solo en AMBIGUA) */
  candidatos: EntradaIndice[];
  validacionEncabezado: ValidacionEncabezado | null;
  /** 0–1 */
  confianza: number;
  notas: string[];
}

/** Distancia de Hamming entre dos strings de igual largo */
function hamming(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

export function identificarActa(params: {
  /** Lectura OCR de la zona "X ··· X" */
  codigoCrudo?: string | null;
  /** Lectura OCR del encabezado (para validar el match) */
  encabezado?: LecturaEncabezado | null;
  indice: Map<string, EntradaIndice>;
}): ResultadoIdentificacion {
  const { codigoCrudo, encabezado, indice } = params;
  const notas: string[] = [];
  const norm = normalizarCodigoTransmision(codigoCrudo);
  notas.push(...norm.notas);

  if (!norm.codigo) {
    return {
      estado: "CODIGO_ILEGIBLE",
      entrada: null,
      codigoUsado: null,
      candidatos: [],
      validacionEncabezado: null,
      confianza: 0,
      notas,
    };
  }

  // 1) Match exacto (el camino normal: los 3.670 códigos son únicos)
  const exacta = indice.get(norm.codigo);
  if (exacta) {
    const val = validarEncabezado(encabezado, exacta);
    let confianza = 0.95;
    if (val.consistente === true) {
      confianza = 0.99;
      notas.push("encabezado DIVIPOL consistente");
    } else if (val.consistente === false) {
      // el código manda, pero un encabezado que contradice ≥2 campos
      // es señal fuerte de acta físicamente distinta (el OCR confundió el código)
      confianza = val.mismatches >= 2 ? 0.4 : 0.7;
      notas.push(`encabezado inconsistente (${val.mismatches} campo(s))`);
    }
    if (norm.correcciones.length > 0) confianza = Math.min(confianza, 0.9);
    return {
      estado: "IDENTIFICADA",
      entrada: exacta,
      codigoUsado: norm.codigo,
      candidatos: [],
      validacionEncabezado: val,
      confianza,
      notas,
    };
  }

  // 2) Respaldo tolerante: un dígito mal leído (Hamming 1 sobre 7 dígitos)
  const cercanos: EntradaIndice[] = [];
  for (const [, e] of indice) {
    if (hamming(norm.codigo, e.idTransmision) === 1) cercanos.push(e);
  }

  if (cercanos.length === 1) {
    const candidata = cercanos[0];
    const val = validarEncabezado(encabezado, candidata);
    if (val.consistente === true) {
      notas.push(`código corregido a ${candidata.idTransmision} (1 dígito) + encabezado coincide`);
      return {
        estado: "IDENTIFICADA",
        entrada: candidata,
        codigoUsado: candidata.idTransmision,
        candidatos: [],
        validacionEncabezado: val,
        confianza: 0.8,
        notas,
      };
    }
    notas.push(`1 candidato a distancia 1 (${candidata.idTransmision}) pero el encabezado no confirma`);
    return {
      estado: "AMBIGUA",
      entrada: null,
      codigoUsado: norm.codigo,
      candidatos: cercanos,
      validacionEncabezado: val,
      confianza: 0.3,
      notas,
    };
  }

  if (cercanos.length > 1) {
    // desempatar con el encabezado si es consistente con UNO solo
    const confirmados = cercanos.filter((e) => validarEncabezado(encabezado, e).consistente === true);
    if (confirmados.length === 1) {
      notas.push(`${cercanos.length} candidatos a distancia 1; el encabezado desempata`);
      return {
        estado: "IDENTIFICADA",
        entrada: confirmados[0],
        codigoUsado: confirmados[0].idTransmision,
        candidatos: [],
        validacionEncabezado: validarEncabezado(encabezado, confirmados[0]),
        confianza: 0.75,
        notas,
      };
    }
    notas.push(`${cercanos.length} candidatos a distancia 1: requiere intervención`);
    return {
      estado: "AMBIGUA",
      entrada: null,
      codigoUsado: norm.codigo,
      candidatos: cercanos,
      validacionEncabezado: null,
      confianza: 0.2,
      notas,
    };
  }

  // 3) El código está bien leído pero no existe en el índice exterior
  notas.push("código de 7 dígitos bien formado pero inexistente en el índice exterior");
  return {
    estado: "NO_ENCONTRADA",
    entrada: null,
    codigoUsado: norm.codigo,
    candidatos: [],
    validacionEncabezado: null,
    confianza: 0,
    notas,
  };
}

// ------------------------------------------------------------
// Clasificación de página y tipo de ejemplar por contenido
// (para cuando el barcode15 sale borroso)
// ------------------------------------------------------------

/** Heurística estructural calculada sobre la imagen (opcional) */
export interface PerfilTinta {
  /** Franja negra continua ancha en el tercio superior (bandas de título) */
  bandaNegraSuperior: boolean;
  /** Densidad de tinta 0–1 en el tercio medio (pág 1: candidatos → alta) */
  densidadMedia: number;
  /** Rejilla de cajas de firmas en el cuarto inferior (pág 2) */
  rejillaFirmasInferior: boolean;
}

export interface SenalesPagina {
  /** Texto OCR (idealmente del tercio superior + bandas) */
  textoOcr?: string | null;
  /** Dígitos crudos del barcode si se leyeron (se validan con parseBarcode15) */
  barcode15?: string | null;
  /** Heurística estructural opcional */
  perfilTinta?: PerfilTinta | null;
}

export interface ClasificacionEjemplar {
  /** 1 | 2, o null si las señales se contradicen (→ pedir rescan) */
  pagina: 1 | 2 | null;
  totalPaginas: number | null;
  /** Tipo canónico del schema (el dígito 2 del barcode es DELEGADOS) */
  tipo: TipoEjemplar | null;
  /** Texto crudo del banner leído (p. ej. "CÓNSUL/EMBAJADOR") para la UI */
  bannerLeido: string | null;
  /** 0–1 */
  confianza: number;
  /** De dónde salió cada decisión */
  origenes: Array<"barcode" | "texto" | "estructura">;
  notas: string[];
}

/** Normaliza texto OCR para anclas: mayúsculas y sin acentos */
function normalizarTexto(s: string): string {
  return (s ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Anclas de contenido por página (texto impreso grande, tolera blur) */
const ANCLAS_PAG1 = [
  "NIVELACION DE LA MESA",
  "TOTAL VOTANTES FORMULARIO",
  "TOTAL VOTOS EN LA URNA",
  "CANDIDATO",
  "VOTACION",
  "VOTOS EN BLANCO",
  "VOTOS NULOS",
  "SUMA TOTAL",
];
const ANCLAS_PAG2 = [
  "CONSTANCIAS DE LOS JURADOS",
  "HUBO RECUENTO DE VOTOS",
  "FIRMA JURADO",
  "SOLICITADO POR",
  "EN REPRESENTACION DE",
];
/** Banner del tipo de ejemplar (ambas páginas lo traen) */
const ANCLAS_TIPO: Array<{ tipo: TipoEjemplar; claves: string[]; banner: string }> = [
  { tipo: "TRANSMISION", claves: ["TRANSMISION"], banner: "TRANSMISIÓN" },
  // El banner "CÓNSUL/EMBAJADOR" corresponde al dígito 2 del barcode
  // (DELEGADOS en el schema); se documenta como variante de exhibición.
  { tipo: "DELEGADOS", claves: ["CONSUL", "EMBAJADOR", "DELEGADOS"], banner: "CÓNSUL/EMBAJADOR · DELEGADOS" },
];

interface VotoSenal<T> {
  valor: T;
  peso: number;
  origen: "barcode" | "texto" | "estructura";
}

/**
 * Clasifica página (1|2), total de páginas y tipo de ejemplar
 * combinando 3 señales independientes:
 *   barcode15 (peso 0.5, determinista) · texto OCR (0.35) · estructura (0.2)
 * Si las señales se contradicen se devuelve null y el llamador
 * debe tratarlo como ILEGIBLE_RESCANEO (nunca adivinar).
 */
export function clasificarEjemplar(senales: SenalesPagina): ClasificacionEjemplar {
  const notas: string[] = [];
  const origenes: ClasificacionEjemplar["origenes"] = [];
  const votosPagina: Array<VotoSenal<1 | 2>> = [];
  const votosTipo: Array<VotoSenal<TipoEjemplar>> = [];
  let totalPaginas: number | null = null;
  let bannerLeido: string | null = null;

  // --- Señal 1: barcode15 (determinista) ---
  const bc = senales.barcode15 ? parseBarcode15(senales.barcode15) : null;
  if (bc) {
    votosPagina.push({ valor: bc.pagina as 1 | 2, peso: 0.5, origen: "barcode" });
    if (bc.tipoEjemplar === "DELEGADOS" || bc.tipoEjemplar === "TRANSMISION") {
      votosTipo.push({ valor: bc.tipoEjemplar, peso: 0.5, origen: "barcode" });
    }
    totalPaginas = bc.totalPaginas;
    origenes.push("barcode");
    notas.push(`barcode15: pág ${bc.pagina}/${bc.totalPaginas}, tipo dígito ${bc.tipoDigito} (${bc.tipoEjemplar})`);
  } else if (senales.barcode15) {
    notas.push("barcode15 leído pero estructuralmente inválido (se ignora)");
  }

  // --- Señal 2: texto OCR ---
  const texto = normalizarTexto(senales.textoOcr ?? "");
  if (texto) {
    const p1 = ANCLAS_PAG1.filter((a) => texto.includes(a)).length;
    const p2 = ANCLAS_PAG2.filter((a) => texto.includes(a)).length;
    if (p1 > 0 && p1 >= p2) votosPagina.push({ valor: 1, peso: 0.35, origen: "texto" });
    if (p2 > 0 && p2 >= p1) votosPagina.push({ valor: 2, peso: 0.35, origen: "texto" });
    if (p1 > 0 && p2 > 0) notas.push(`texto con anclas de ambas páginas (p1:${p1} p2:${p2})`);

    for (const t of ANCLAS_TIPO) {
      if (t.claves.some((c) => texto.includes(c))) {
        votosTipo.push({ valor: t.tipo, peso: 0.35, origen: "texto" });
        bannerLeido = t.banner;
        break;
      }
    }
    if (votosPagina.some((v) => v.origen === "texto") || bannerLeido) origenes.push("texto");
  }

  // --- Señal 3: perfil de tinta (opcional) ---
  const pt = senales.perfilTinta;
  if (pt) {
    if (pt.rejillaFirmasInferior) {
      // rejilla de firmas presente → fuerte indicio de pág 2
      votosPagina.push({ valor: 2, peso: 0.2, origen: "estructura" });
    } else if (pt.densidadMedia >= 0.18 && pt.bandaNegraSuperior) {
      // tercio medio denso (fotos de candidatos + casillas) → pág 1
      votosPagina.push({ valor: 1, peso: 0.2, origen: "estructura" });
    }
    if (votosPagina.some((v) => v.origen === "estructura")) origenes.push("estructura");
  }

  // --- Agregación (unanimidad ponderada: conflicto ⇒ null) ---
  // El barcode15 validado estructuralmente es DETERMINISTA: si apoya al
  // valor ganador, la confianza de ese campo tiene piso 0.95.
  const agregar = <T>(votos: Array<VotoSenal<T>>): { valor: T | null; confianza: number } => {
    if (votos.length === 0) return { valor: null, confianza: 0 };
    const porValor = new Map<T, number>();
    const barcodeApoya = new Map<T, boolean>();
    for (const v of votos) {
      porValor.set(v.valor, (porValor.get(v.valor) ?? 0) + v.peso);
      if (v.origen === "barcode") barcodeApoya.set(v.valor, true);
    }
    if (porValor.size > 1) {
      notas.push("conflicto de señales en la clasificación");
      return { valor: null, confianza: 0 };
    }
    const [ganador, peso] = [...porValor.entries()][0];
    let conf = Math.min(1, peso / 0.85);
    if (barcodeApoya.get(ganador)) conf = Math.max(conf, 0.95);
    return { valor: ganador, confianza: conf };
  };

  const paginaAgg = agregar(votosPagina);
  const tipoAgg = agregar(votosTipo);

  return {
    pagina: paginaAgg.valor,
    totalPaginas,
    tipo: tipoAgg.valor,
    bannerLeido,
    // confianza global = la de la señal más débil determinada
    confianza:
      tipoAgg.valor === null ? paginaAgg.confianza : Math.min(paginaAgg.confianza, tipoAgg.confianza),
    origenes,
    notas,
  };
}

// ------------------------------------------------------------
// Decisión de almacenamiento (guard de integridad)
// ------------------------------------------------------------

export interface PaginasRegistradas {
  delegados?: { p1?: boolean; p2?: boolean };
  transmision?: { p1?: boolean; p2?: boolean };
}

export interface RegistroExistente {
  /** Huella QR ya almacenada para esta (mesa, tipo, página) */
  qrFingerprint?: string | null;
  /** Estado previo del acta (ActaEstado del schema) */
  estado?: string;
  /** Mapa de páginas ya registradas de la mesa */
  paginas?: PaginasRegistradas | null;
}

export type AccionAlmacenamiento = "ALMACENAR" | "REEMPLAZAR" | "ANOMALIA" | "DESCARTAR";

export interface DecisionAlmacenamiento {
  accion: AccionAlmacenamiento;
  /** Códigos para la bandeja del supervisor (prefijo ID_ del identificador) */
  anomalias: string[];
  notas: string[];
  /** Estado sugerido para Acta.estado */
  estadoSugerido: "VALIDADO" | "ANOMALIA" | "RECHAZADO" | "EN_COLA";
}

/**
 * Guard final antes de persistir. Combina identificación + clasificación +
 * lo que ya existe en el sistema para evitar los errores críticos:
 * páginas cruzadas (delegados↔transmisión), páginas duplicadas con
 * contenido distinto, y actas no identificables almacenadas "a ver qué pasa".
 */
export function decidirAlmacenamiento(params: {
  identificacion: ResultadoIdentificacion;
  clasificacion: ClasificacionEjemplar;
  /** Huella del QR decodificado (32 bytes en base64url) */
  qrFingerprint?: string | null;
  existente?: RegistroExistente | null;
}): DecisionAlmacenamiento {
  const { identificacion: id, clasificacion: cl, qrFingerprint, existente } = params;
  const anomalias: string[] = [];
  const notas: string[] = [];

  // 1) La identificación manda: sin mesa no hay dónde guardar
  if (id.estado !== "IDENTIFICADA" || !id.entrada) {
    anomalias.push(id.estado === "CODIGO_ILEGIBLE" ? "ID_CODIGO_ILEGIBLE" : `ID_${id.estado}`);
    notas.push("sin identificación determinista no se almacena ubicación");
    return { accion: "ANOMALIA", anomalias, notas, estadoSugerido: "ANOMALIA" };
  }

  // 2) Encabezado que contradice fuertemente al código
  if (id.validacionEncabezado?.consistente === false && id.validacionEncabezado.mismatches >= 2) {
    anomalias.push("ID_ENCABEZADO_INCONSISTENTE");
    notas.push("el encabezado DIVIPOL contradice al código de transmisión");
    return { accion: "ANOMALIA", anomalias, notas, estadoSugerido: "ANOMALIA" };
  }

  // 3) La página y el tipo deben estar determinados (evita páginas cruzadas)
  if (cl.pagina === null || cl.tipo === null) {
    anomalias.push("ID_PAGINA_O_TIPO_INDETERMINADO");
    notas.push("clasificación de página/tipo en conflicto o sin señales → rescan");
    return { accion: "ANOMALIA", anomalias, notas, estadoSugerido: "ANOMALIA" };
  }

  const slotTipo = cl.tipo === "TRANSMISION" ? "transmision" : "delegados";
  const slotPag = cl.pagina === 1 ? "p1" : "p2";

  // 4) Duplicado exacto por huella QR (misma hoja física re-escaneada)
  if (existente?.qrFingerprint && qrFingerprint && existente.qrFingerprint === qrFingerprint) {
    notas.push("misma huella QR ya registrada: hoja duplicada");
    if (existente.estado === "VALIDADO") {
      return { accion: "DESCARTAR", anomalias, notas, estadoSugerido: "VALIDADO" };
    }
    return { accion: "REEMPLAZAR", anomalias, notas, estadoSugerido: "EN_COLA" };
  }

  // 5) Misma ranura ocupada con hoja DISTINTA (otra huella)
  const slotOcupado = existente?.paginas?.[slotTipo]?.[slotPag];
  if (slotOcupado && qrFingerprint && existente?.qrFingerprint && existente.qrFingerprint !== qrFingerprint) {
    anomalias.push("ID_RANURA_OCUPADA_DISTINTA");
    notas.push(`ya existe una hoja distinta en ${slotTipo}.${slotPag} de la mesa`);
    return { accion: "ANOMALIA", anomalias, notas, estadoSugerido: "ANOMALIA" };
  }

  // 6) Todo en orden
  notas.push(`destino: mesa ${id.entrada.mesaNumero} · ${slotTipo}.${slotPag}`);
  const estadoSugerido = id.confianza >= 0.8 && cl.confianza >= 0.6 ? "VALIDADO" : "EN_COLA";
  return { accion: "ALMACENAR", anomalias, notas, estadoSugerido };
}
