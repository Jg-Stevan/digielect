// ============================================================
// DIGIELECT · Identificador determinista de actas E-14 (rol C)
// ------------------------------------------------------------
// Identifica CADA HOJA escaneada y decide dónde se almacena,
// sin IA, sin red y sin adivinanzas:
//
//   1. El código impreso entre las X ("X 7-23-10-19 X") ES el
//      `idTransmissionCode` del visor oficial (evidencia en
//      docs/agentes/TAREA-C-IDENTIFICADOR.md): 7 dígitos,
//      único entre las 3.670 actas del exterior.
//   2. La hoja física se direcciona con la terna
//      (mesa, tipoEjemplar, página) — ver CONVENIOS.md §1.
//   3. Página y tipo se resuelven por votación ponderada de
//      señales (barcode15 / anclas de texto / perfil de tinta)
//      con UNANIMIDAD: si las señales se contradicen → null →
//      rescan. Nunca se adivina.
//   4. `decidirAlmacenamiento` es el guard de integridad: sin
//      terna determinada no se persiste nada; huellas QR
//      repetidas y ranuras ocupadas con hojas distintas se
//      convierten en anomalías visibles para el supervisor.
//
// Módulo PURO: sin DOM, sin Prisma, sin z-ai, sin red.
// Corre en cliente (Web Worker / componente) y en servidor.
// ============================================================

import { parseBarcode15 } from "@/lib/e14/parse";
import type { TipoEjemplar, ActaEstado } from "@/lib/types";

// ------------------------------------------------------------
// Tipos de dominio
// ------------------------------------------------------------

/** Ítem crudo del visor de la Registraduría (exterior-actas.json). */
export interface ActaVisoItem {
  /** En el exterior este código es el PAÍS (335=Egipto, 355=España…) */
  municipalityCode: string;
  idZoneCode: string;
  /** Código del puesto (consulado) */
  standCode: string;
  /** Número de mesa, ej. "001" */
  numberStand: string;
  /** 7 dígitos impresos entre las X */
  idTransmissionCode: string;
  /** "<sha256>.pdf" del PDF oficial publicado */
  expectedName?: string;
  idStand?: string;
  idDepartmentCode?: string;
  idTransmissionCodeStatus?: string;
}

/** Entrada del índice en memoria (derivada de ActaVisoItem). */
export interface EntradaIndice {
  mesaNumero: string;
  consulado: {
    /** DIVIPOL departamento (88 = EXTERIOR si el visor no lo trae) */
    departamento: string;
    /** Código de país en el exterior (municipalityCode) */
    municipio: string;
    zona: string;
    puesto: string;
  };
  /** expectedName sin ".pdf" — verificación contra el visor */
  pdfHash: string;
  crudo: ActaVisoItem;
}

/** Encabezado DIVIPOL leído por OCR/VLM (crudo, tolerante). */
export interface EncabezadoLeido {
  pais?: string | null;
  departamento?: string | null;
  zona?: string | null;
  puesto?: string | null;
  mesa?: string | null;
}

/** Resultado de normalizar la lectura OCR de la zona "X ··· X". */
export interface CodigoNormalizado {
  /** 7 dígitos, o null si es ilegible/ambigua la lectura */
  codigo: string | null;
  /** Sustituciones seguras aplicadas, ej. ["O→0", "I→1"] */
  correcciones: string[];
  /** Trazabilidad para el operador */
  notas: string[];
}

export type EstadoIdentificacion =
  | "IDENTIFICADA"
  | "AMBIGUA"
  | "NO_ENCONTRADA"
  | "CODIGO_ILEGIBLE";

export type RutaIdentificacion = "EXACTA" | "HAMMING1" | null;

export interface ResultadoIdentificacion {
  estado: EstadoIdentificacion;
  /** Código normalizado usado (aunque el estado no sea IDENTIFICADA) */
  codigo: string | null;
  entrada: EntradaIndice | null;
  /** 0–1. Pisos: exacta+encabezado 0.99 · exacta 0.95 · Hamming1 0.6–0.75 */
  confianza: number;
  ruta: RutaIdentificacion;
  /** Campos del encabezado que contradicen al acta identificada */
  mismatches: string[];
  notas: string[];
}

/** Perfil de tinta calculado sobre la imagen B/N (rol A). */
export interface PerfilTinta {
  /** Rejilla de firmas/líneas largas en el tercio inferior (típico p2) */
  rejillaFirmasAbajo: boolean;
  /** Bloque denso en el tercio medio (tabla de candidatos, típico p1) */
  tercioMedioDenso: boolean;
}

/** Señales ya estructuradas que aporta cada canal. */
export interface SenalesEjemplar {
  barcode: { pagina: 1 | 2 | null; tipo: TipoEjemplar | null } | null;
  texto: { pagina: 1 | 2 | null; tipo: TipoEjemplar | null } | null;
  perfil: { pagina: 1 | 2 | null } | null;
}

export interface ClasificacionEjemplar {
  /** 1 | 2 | null (null = conflicto o sin señales ⇒ rescan) */
  pagina: 1 | 2 | null;
  tipo: TipoEjemplar | null;
  /** Confianza combinada (mínimo entre página y tipo) 0–1 */
  confianza: number;
  confianzaPagina: number;
  confianzaTipo: number;
  senales: SenalesEjemplar;
  /** Descripciones de señal en conflicto (para la bandeja) */
  conflictos: string[];
  notas: string[];
}

/** Estado conocido de la mesa al momento de decidir (rol B / demo-store). */
export interface RanuraExistente {
  qrFingerprint?: string | null;
  estado?: ActaEstado;
}

export interface RegistroExistente {
  /** Estado global del acta, si se conoce */
  estado?: ActaEstado;
  /** Fuente de verdad: MesaDetail.{delegados,transmision}.{p1,p2} */
  paginas?: Partial<
    Record<TipoEjemplar, Partial<Record<"p1" | "p2", RanuraExistente>>>
  >;
}

export type CodigoAnomaliaId =
  | "ID_CODIGO_ILEGIBLE"
  | "ID_AMBIGUA"
  | "ID_NO_ENCONTRADA"
  | "ID_ENCABEZADO_INCONSISTENTE"
  | "ID_PAGINA_O_TIPO_INDETERMINADO"
  | "ID_RANURA_OCUPADA_DISTINTA";

export type AccionAlmacenamiento = "ALMACENAR" | "REEMPLAZAR" | "ANOMALIA" | "DESCARTAR";

export interface RanuraHoja {
  mesa: string;
  tipo: TipoEjemplar;
  pagina: 1 | 2;
}

export interface DecisionAlmacenamiento {
  accion: AccionAlmacenamiento;
  /** Anomalías ID_* para la bandeja del supervisor (rol B) */
  anomalias: CodigoAnomaliaId[];
  /** Sugerencia sobre la captura actual (la UI aplica RN-02/RN-03 encima) */
  estadoSugerido: ActaEstado;
  /** Terna destino, null si no pudo determinarse */
  ranura: RanuraHoja | null;
  notas: string[];
}

// ------------------------------------------------------------
// 1) Índice de actas por código de transmisión
// ------------------------------------------------------------

/**
 * Construye el índice de identificación: UNA vez por sesión y
 * reutilizarlo (Map en memoria). Ítems sin código de 7 dígitos
 * se omiten (el visor exterior siempre trae 7, verificado).
 */
export function crearIndiceActas(
  items: ActaVisoItem[],
): Map<string, EntradaIndice> {
  const indice = new Map<string, EntradaIndice>();
  for (const item of items ?? []) {
    const codigo = (item.idTransmissionCode ?? "").replace(/\D/g, "");
    if (codigo.length !== 7) continue;
    indice.set(codigo, {
      mesaNumero: item.numberStand ?? "",
      consulado: {
        departamento: item.idDepartmentCode ?? "88",
        municipio: item.municipalityCode ?? "",
        zona: item.idZoneCode ?? "",
        puesto: item.standCode ?? "",
      },
      pdfHash: (item.expectedName ?? "").replace(/\.pdf$/i, ""),
      crudo: item,
    });
  }
  return indice;
}

// ------------------------------------------------------------
// 2) Normalización del código entre las X
// ------------------------------------------------------------

/** Confusables que se corrigen SIEMPRE (cero riesgo en este formulario). */
const CONFUSABLES_SEGUROS: Record<string, string> = { O: "0", I: "1", L: "1" };
/** Confusables que NO se corrigen solos: requieren humano (S~5, B~8, Z~2). */
const CONFUSABLES_AMBIGUOS = /[SBZ]/; // sólo letras: separadores (-, espacio) no cuentan

/**
 * Limpia la lectura OCR de la zona del código de transmisión.
 * Acepta formas crudas como "X 7-23-10-19 X", "X7-23-10-19X",
 * "7 23 10 19" (con o sin delimitadores). Corrige confusables
 * seguros y NUNCA corrige ambiguos (S/B/Z): esos van a humano.
 */
export function normalizarCodigoTransmision(
  crudo: string | null | undefined,
): CodigoNormalizado {
  const resultado: CodigoNormalizado = { codigo: null, correcciones: [], notas: [] };
  const bruto = (crudo ?? "").toUpperCase().trim();
  if (!bruto) {
    resultado.notas.push("sin lectura de la zona del código");
    return resultado;
  }

  // Delimitadores: X (también "×" y "✕" que algunos OCR producen).
  const conX = bruto.replace(/[×✕]/g, "X");
  const posicionesX: number[] = [];
  for (let i = 0; i < conX.length; i++) {
    if (conX[i] === "X") posicionesX.push(i);
  }

  let segmento = conX;
  if (posicionesX.length >= 2) {
    segmento = conX.slice(posicionesX[0] + 1, posicionesX[posicionesX.length - 1]);
  } else if (posicionesX.length === 1) {
    // Una sola X: tomar el lado más largo (típico cuando una X se pierde).
    const i = posicionesX[0];
    segmento = conX.slice(0, i).length >= conX.slice(i + 1).length
      ? conX.slice(0, i)
      : conX.slice(i + 1);
    resultado.notas.push("solo se detectó una X delimitadora");
  } else {
    resultado.notas.push("sin delimitadores X: se usa la lectura completa");
  }

  // Confusables seguros + registro de los ambiguos.
  let conSeguras = segmento;
  for (const [de, a] of Object.entries(CONFUSABLES_SEGUROS)) {
    if (conSeguras.includes(de)) {
      conSeguras = conSeguras.split(de).join(a);
      resultado.correcciones.push(`${de}→${a}`);
    }
  }
  const ambiguo = conSeguras.match(CONFUSABLES_AMBIGUOS);
  if (ambiguo) {
    resultado.notas.push(
      `caracteres ambiguos sin corregir (posible S~5, B~8, Z~2): "${ambiguo[0]}"`,
    );
  }

  const digitos = conSeguras.replace(/[^0-9]/g, "");
  if (digitos.length === 7) {
    resultado.codigo = digitos;
  } else {
    resultado.notas.push(
      `longitud ${digitos.length} ≠ 7 dígitos esperados`,
    );
  }
  return resultado;
}

// ------------------------------------------------------------
// 3) Identificación del acta (match exacto + Hamming-1 + encabezado)
// ------------------------------------------------------------

function soloDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/** Comparación tolerante de códigos: "1" ≈ "001" (relleno con ceros). */
function campoCoincide(leido: string | null | undefined, esperado: string): boolean {
  const a = soloDigitos(leido);
  const b = soloDigitos(esperado);
  if (!a || !b) return false;
  return a === b || a.endsWith(b) || b.endsWith(a);
}

function hamming1(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i] && ++dif > 1) return false;
  }
  return dif === 1;
}

/** Campos del encabezado contra la entrada, con nombre para el reporte. */
function evaluarEncabezado(
  encabezado: EncabezadoLeido | null | undefined,
  entrada: EntradaIndice,
): string[] {
  const mismatches: string[] = [];
  if (!encabezado) return mismatches;
  const pares: Array<[string, string | null | undefined, string]> = [
    ["pais", encabezado.pais, entrada.consulado.municipio],
    ["departamento", encabezado.departamento, entrada.consulado.departamento],
    ["zona", encabezado.zona, entrada.consulado.zona],
    ["puesto", encabezado.puesto, entrada.consulado.puesto],
    ["mesa", encabezado.mesa, entrada.mesaNumero],
  ];
  for (const [campo, leido, esperado] of pares) {
    // Sólo cuentan los campos que realmente se leyeron (no null/undefined).
    if (leido != null && String(leido).trim() !== "") {
      if (!campoCoincide(leido, esperado)) mismatches.push(campo);
    }
  }
  return mismatches;
}

function buscarHamming1(
  codigo: string,
  indice: Map<string, EntradaIndice>,
): EntradaIndice[] {
  const candidatos: EntradaIndice[] = [];
  for (const [clave, entrada] of indice) {
    if (hamming1(codigo, clave)) candidatos.push(entrada);
  }
  return candidatos;
}

/**
 * Identifica el acta contra el índice:
 *  · Match exacto + encabezado consistente        → IDENTIFICADA 0.99
 *  · Match exacto sin encabezado                  → IDENTIFICADA 0.95
 *  · Match exacto con 1 mismatch (OCR del header) → IDENTIFICADA 0.85
 *  · Match exacto con ≥2 mismatches               → AMBIGUA 0.40
 *  · Sin exacto: Hamming-1 (1 dígito errado), desempatado por encabezado
 *  · Sin candidatos                              → NO_ENCONTRADA
 */
export function identificarActa(args: {
  codigoCrudo: string | null | undefined;
  encabezado?: EncabezadoLeido | null;
  indice: Map<string, EntradaIndice>;
}): ResultadoIdentificacion {
  const { codigoCrudo, encabezado, indice } = args;
  const notas: string[] = [];

  const norm = normalizarCodigoTransmision(codigoCrudo);
  notas.push(...norm.notas);
  if (!norm.codigo) {
    return {
      estado: "CODIGO_ILEGIBLE",
      codigo: null,
      entrada: null,
      confianza: 0,
      ruta: null,
      mismatches: [],
      notas,
    };
  }

  const codigo = norm.codigo;
  const exacta = indice.get(codigo) ?? null;

  if (exacta) {
    const mismatches = evaluarEncabezado(encabezado, exacta);
    if (mismatches.length >= 2) {
      notas.push(`encabezado contradice ${mismatches.length} campos: ${mismatches.join(", ")}`);
      return {
        estado: "AMBIGUA",
        codigo,
        entrada: exacta,
        confianza: 0.4,
        ruta: "EXACTA",
        mismatches,
        notas,
      };
    }
    if (mismatches.length === 1) {
      notas.push(`encabezado discrepa en "${mismatches[0]}" (posible OCR del encabezado)`);
      return {
        estado: "IDENTIFICADA",
        codigo,
        entrada: exacta,
        confianza: 0.85,
        ruta: "EXACTA",
        mismatches,
        notas,
      };
    }
    if (encabezado && norm.correcciones.length > 0) {
      notas.push("match exacto con encabezado consistente y correcciones seguras");
      return {
        estado: "IDENTIFICADA",
        codigo,
        entrada: exacta,
        confianza: 0.97,
        ruta: "EXACTA",
        mismatches,
        notas,
      };
    }
    return {
      estado: "IDENTIFICADA",
      codigo,
      entrada: exacta,
      confianza: encabezado ? 0.99 : 0.95,
      ruta: "EXACTA",
      mismatches,
      notas,
    };
  }

  // Respaldo Hamming-1: un dígito mal leído (el OCR es local y imperfecto).
  const candidatos = buscarHamming1(codigo, indice);
  if (candidatos.length === 0) {
    notas.push(`código ${codigo} no existe en el índice (ni a 1 dígito)`);
    return {
      estado: "NO_ENCONTRADA",
      codigo,
      entrada: null,
      confianza: 0.1,
      ruta: null,
      mismatches: [],
      notas,
    };
  }

  if (candidatos.length === 1) {
    const entrada = candidatos[0];
    const mismatches = evaluarEncabezado(encabezado, entrada);
    notas.push(`rescate Hamming-1 hacia ${entrada.crudo.idTransmissionCode}`);
    if (mismatches.length >= 2) {
      return {
        estado: "AMBIGUA",
        codigo,
        entrada,
        confianza: 0.45,
        ruta: "HAMMING1",
        mismatches,
        notas,
      };
    }
    return {
      estado: "IDENTIFICADA",
      codigo: entrada.crudo.idTransmissionCode.replace(/\D/g, ""),
      entrada,
      confianza: mismatches.length === 1 ? 0.65 : encabezado ? 0.75 : 0.6,
      ruta: "HAMMING1",
      mismatches,
      notas,
    };
  }

  // Varios candidatos: el encabezado desempata si deja uno solo consistente.
  if (encabezado) {
    const consistentes = candidatos.filter(
      (c) => evaluarEncabezado(encabezado, c).length === 0,
    );
    if (consistentes.length === 1) {
      notas.push("Hamming-1 ambiguo desempatado por encabezado DIVIPOL");
      return {
        estado: "IDENTIFICADA",
        codigo: consistentes[0].crudo.idTransmissionCode.replace(/\D/g, ""),
        entrada: consistentes[0],
        confianza: 0.75,
        ruta: "HAMMING1",
        mismatches: [],
        notas,
      };
    }
  }
  notas.push(`Hamming-1 con ${candidatos.length} candidatos sin desempate`);
  return {
    estado: "AMBIGUA",
    codigo,
    entrada: null,
    confianza: 0.4,
    ruta: "HAMMING1",
    mismatches: [],
    notas,
  };
}

// ------------------------------------------------------------
// 4) Clasificación de la hoja: página y tipoEjemplar
// ------------------------------------------------------------

/** Anclas de texto impreso (ya sin acentos, mayúsculas). */
const ANCLAS_P1 = [
  "NIVELACION DE LA MESA",
  "CANDIDATO",
  "VOTACION",
  "SUMA TOTAL",
  "VOTOS EN BLANCO",
  "VOTOS NULOS",
];
const ANCLAS_P2 = [
  "CONSTANCIAS DE LOS JURADOS",
  "FIRMA JURADO",
  "HUBO RECUENTO",
  "SOLICITADO POR",
];

/** Normaliza OCR: mayúsculas, sin acentos, espacios colapsados. */
function normalizarTextoOcr(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function votoDeTexto(
  textoOcr: string | null | undefined,
): { pagina: 1 | 2 | null; tipo: TipoEjemplar | null; notas: string[] } {
  const notas: string[] = [];
  const texto = normalizarTextoOcr(textoOcr);
  if (!texto) return { pagina: null, tipo: null, notas };

  const hitsP1 = ANCLAS_P1.filter((a) => texto.includes(a)).length;
  const hitsP2 = ANCLAS_P2.filter((a) => texto.includes(a)).length;

  let pagina: 1 | 2 | null = null;
  if (hitsP1 > 0 && hitsP2 === 0) pagina = 1;
  else if (hitsP2 > 0 && hitsP1 === 0) pagina = 2;
  else if (hitsP1 > 0 && hitsP2 > 0) {
    notas.push(`anclas de p1 (${hitsP1}) y p2 (${hitsP2}) simultáneas: texto en conflicto`);
  } else {
    notas.push("sin anclas de texto reconocibles");
  }

  // Banner del ejemplar. "CÓNSUL/EMBAJADOR" ES la variante DELEGADOS.
  //
  // B-06 (fix): el ancla es el BANNER COMPLETO, nunca el substring suelto
  // "CONSUL": ese substring también vive dentro de "CONSULADO" del
  // encabezado DIVIPOL (presente en TODAS las hojas, p. ej. "CONSULADO:
  // 88") y marcaba DELEGADOS hojas TRANSMISIÓN con OCR real → conflicto
  // falso de señales → anomalía sistemática en BATCH. El módulo ya
  // normaliza acentos ("CÓNSUL"→"CONSUL") y espacios, así que el patrón
  // acepta la barra, el guion o el espacio que deja el OCR
  // ("CONSUL/EMBAJADOR", "CONSUL EMBAJADOR", "CONSUL - EMBAJADOR").
  // "DELEGADOS" y "TRANSMISION" siguen siendo anclas por palabra completa.
  let tipo: TipoEjemplar | null = null;
  const esDelegados =
    /\bDELEGADOS\b/.test(texto) ||
    /CONSUL(?!ADO)[^A-Z]{0,4}EMBAJADOR/.test(texto) ||
    /\bEMBAJADOR\b/.test(texto);
  const esTransmision = /\bTRANSMISION\b/.test(texto);
  if (esDelegados && esTransmision) {
    notas.push("banners de DELEGADOS y TRANSMISION simultáneos: tipo en conflicto");
  } else if (esDelegados) tipo = "DELEGADOS";
  else if (esTransmision) tipo = "TRANSMISION";

  return { pagina, tipo, notas };
}

/**
 * Clasifica la hoja por votación ponderada con UNANIMIDAD:
 *   barcode15 (0.5, determinista, piso 0.95) · anclas de texto (0.35)
 *   · perfil de tinta (0.2). Cualquier contradicción ⇒ null ⇒ rescan.
 *
 * `textoOcr` debe ser OCR de página COMPLETA (o al menos tercio
 * superior + banda inferior) para que las anclas de p2 aparezcan.
 */
export function clasificarEjemplar(args: {
  textoOcr?: string | null;
  barcode15?: string | null;
  perfilTinta?: PerfilTinta | null;
}): ClasificacionEjemplar {
  const { textoOcr, barcode15, perfilTinta } = args;
  const notas: string[] = [];
  const conflictos: string[] = [];

  // --- Señal barcode (determinista) ---
  let senalBarcode: SenalesEjemplar["barcode"] = null;
  const bc = barcode15 ? parseBarcode15(barcode15) : null;
  if (bc) {
    const tipoBc = bc.tipoEjemplar === "CLAVEROS" ? null : bc.tipoEjemplar;
    senalBarcode = { pagina: bc.pagina <= 2 ? (bc.pagina as 1 | 2) : null, tipo: tipoBc };
    if (tipoBc === null) notas.push("barcode indica CLAVEROS (E-14 interior): tipo no usable en exterior");
  } else if (barcode15) {
    notas.push("barcode15 leído pero inválido según estructura");
  }

  // --- Señal texto ---
  const votoTexto = votoDeTexto(textoOcr);
  notas.push(...votoTexto.notas);
  const senalTexto: SenalesEjemplar["texto"] =
    votoTexto.pagina == null && votoTexto.tipo == null
      ? null
      : { pagina: votoTexto.pagina, tipo: votoTexto.tipo };

  // --- Señal perfil de tinta ---
  let senalPerfil: SenalesEjemplar["perfil"] = null;
  if (perfilTinta) {
    const { rejillaFirmasAbajo, tercioMedioDenso } = perfilTinta;
    if (rejillaFirmasAbajo && !tercioMedioDenso) senalPerfil = { pagina: 2 };
    else if (!rejillaFirmasAbajo && tercioMedioDenso) senalPerfil = { pagina: 1 };
    else notas.push("perfil de tinta sin rasgos distintivos (o contradictorio)");
  }

  const senales: SenalesEjemplar = {
    barcode: senalBarcode,
    texto: senalTexto,
    perfil: senalPerfil,
  };

  // --- Unanimidad: página ---
  const votosPagina: Array<{ valor: 1 | 2; peso: number; fuente: string }> = [];
  if (senalBarcode?.pagina != null) votosPagina.push({ valor: senalBarcode.pagina, peso: 0.5, fuente: "barcode" });
  if (senalTexto?.pagina != null) votosPagina.push({ valor: senalTexto.pagina, peso: 0.35, fuente: "texto" });
  if (senalPerfil?.pagina != null) votosPagina.push({ valor: senalPerfil.pagina, peso: 0.2, fuente: "perfil" });

  let pagina: 1 | 2 | null = null;
  let confianzaPagina = 0;
  if (votosPagina.length > 0) {
    const todos = votosPagina.every((v) => v.valor === votosPagina[0].valor);
    if (todos) {
      pagina = votosPagina[0].valor;
      const peso = votosPagina.reduce((s, v) => s + v.peso, 0);
      // Piso por fuente principal + bonus por acuerdo de otras señales.
      confianzaPagina = senalBarcode?.pagina != null
        ? Math.min(0.99, 0.95 + (peso > 0.5 ? 0.03 : 0))
        : senalTexto?.pagina != null
          ? Math.min(0.9, 0.7 + (peso > 0.35 ? 0.15 : 0))
          : 0.55;
    } else {
      conflictos.push(
        `página contradictoria entre señales: ${votosPagina.map((v) => `${v.fuente}=p${v.valor}`).join(" · ")}`,
      );
    }
  }

  // --- Unanimidad: tipo ---
  const votosTipo: Array<{ valor: TipoEjemplar; peso: number; fuente: string }> = [];
  if (senalBarcode?.tipo != null) votosTipo.push({ valor: senalBarcode.tipo, peso: 0.5, fuente: "barcode" });
  if (senalTexto?.tipo != null) votosTipo.push({ valor: senalTexto.tipo, peso: 0.35, fuente: "texto" });

  let tipo: TipoEjemplar | null = null;
  let confianzaTipo = 0;
  if (votosTipo.length > 0) {
    const todos = votosTipo.every((v) => v.valor === votosTipo[0].valor);
    if (todos) {
      tipo = votosTipo[0].valor;
      const peso = votosTipo.reduce((s, v) => s + v.peso, 0);
      confianzaTipo = senalBarcode?.tipo != null
        ? Math.min(0.99, 0.95 + (peso > 0.5 ? 0.03 : 0))
        : 0.7;
    } else {
      conflictos.push(
        `tipo contradictorio entre señales: ${votosTipo.map((v) => `${v.fuente}=${v.valor}`).join(" · ")}`,
      );
    }
  }

  if (pagina == null && conflictos.length === 0 && votosPagina.length === 0) {
    notas.push("sin señales suficientes para determinar la página");
  }

  return {
    pagina,
    tipo,
    confianza: Math.min(confianzaPagina, confianzaTipo),
    confianzaPagina,
    confianzaTipo,
    senales,
    conflictos,
    notas,
  };
}

// ------------------------------------------------------------
// 5) Guard de integridad: dónde (y si) se almacena la hoja
// ------------------------------------------------------------

const CONFIANZA_MINIMA_VALIDADO = 0.9;

/**
 * ÚNICO punto que decide el destino de una captura. Reglas de oro:
 *  · Sin (mesa, tipo, página) determinados NO se almacena nada.
 *  · Nunca se adivina: conflicto de señales ⇒ anomalía + rescan.
 *  · Misma huella QR re-escaneada: DESCARTAR si la ranura ya está
 *    VALIDADO; si no, REEMPLAZAR.
 *  · Ranura ocupada con huella distinta ⇒ ANOMALÍA (posible cruce).
 */
export function decidirAlmacenamiento(args: {
  identificacion: ResultadoIdentificacion;
  clasificacion: ClasificacionEjemplar;
  qrFingerprint?: string | null;
  existente?: RegistroExistente | null;
}): DecisionAlmacenamiento {
  const { identificacion, clasificacion, qrFingerprint, existente } = args;
  const notas: string[] = [];

  // 1) La identificación debe estar limpia.
  if (identificacion.estado !== "IDENTIFICADA" || !identificacion.entrada) {
    const anomalia: CodigoAnomaliaId =
      identificacion.estado === "CODIGO_ILEGIBLE"
        ? "ID_CODIGO_ILEGIBLE"
        : identificacion.estado === "NO_ENCONTRADA"
          ? "ID_NO_ENCONTRADA"
          : identificacion.mismatches.length >= 2
            ? "ID_ENCABEZADO_INCONSISTENTE"
            : "ID_AMBIGUA";
    notas.push(`identificación ${identificacion.estado}: la hoja va a la bandeja del supervisor`);
    return {
      accion: "ANOMALIA",
      anomalias: [anomalia],
      estadoSugerido: "ANOMALIA",
      ranura: null,
      notas,
    };
  }

  // 2) La clasificación debe estar determinada (sin adivinar).
  if (clasificacion.pagina == null || clasificacion.tipo == null) {
    notas.push("página o tipo indeterminados: rescan obligatorio, nada se persiste");
    return {
      accion: "ANOMALIA",
      anomalias: ["ID_PAGINA_O_TIPO_INDETERMINADO"],
      estadoSugerido: "ANOMALIA",
      ranura: null,
      notas,
    };
  }

  const ranura: RanuraHoja = {
    mesa: identificacion.entrada.mesaNumero,
    tipo: clasificacion.tipo,
    pagina: clasificacion.pagina,
  };
  const clave = `p${ranura.pagina}` as "p1" | "p2";
  const ranuraOcupada =
    existente?.paginas?.[ranura.tipo]?.[clave] ?? null;

  // 3) Ranura ocupada: duplicado exacto o cruce real.
  if (ranuraOcupada) {
    const mismaHuella =
      qrFingerprint != null &&
      ranuraOcupada.qrFingerprint != null &&
      qrFingerprint === ranuraOcupada.qrFingerprint;

    if (mismaHuella) {
      if (ranuraOcupada.estado === "VALIDADO") {
        notas.push("misma huella QR de una hoja ya VALIDADO: captura duplicada, se descarta");
        return {
          accion: "DESCARTAR",
          anomalias: [],
          estadoSugerido: "RECHAZADO",
          ranura,
          notas,
        };
      }
      notas.push("misma huella QR con ranura no validada: REEMPLAZAR");
      return {
        accion: "REEMPLAZAR",
        anomalias: [],
        estadoSugerido:
          identificacion.confianza >= CONFIANZA_MINIMA_VALIDADO &&
          clasificacion.confianza >= CONFIANZA_MINIMA_VALIDADO
            ? "VALIDADO"
            : "EN_COLA",
        ranura,
        notas,
      };
    }

    notas.push(
      "ranura ocupada por una hoja con huella distinta: posible página cruzada",
    );
    return {
      accion: "ANOMALIA",
      anomalias: ["ID_RANURA_OCUPADA_DISTINTA"],
      estadoSugerido: "ANOMALIA",
      ranura,
      notas,
    };
  }

  // 4) Ranura libre: almacenar (VALIDADO directo si la confianza alcanza).
  const directo =
    identificacion.confianza >= CONFIANZA_MINIMA_VALIDADO &&
    clasificacion.confianza >= CONFIANZA_MINIMA_VALIDADO;
  if (!directo) {
    notas.push("confianza por debajo del umbral: la hoja queda EN_COLA para revisión");
  }
  return {
    accion: "ALMACENAR",
    anomalias: [],
    estadoSugerido: directo ? "VALIDADO" : "EN_COLA",
    ranura,
    notas,
  };
}

// ------------------------------------------------------------
// 6) Ayudante de UI: asignación legible para la pantalla Revisión
// ------------------------------------------------------------

/** "DIVIPOL 88·335·05·02 · MESA 001 · TRANSMISION · PAG 1 DE 2" */
export function formatearAsignacion(
  entrada: EntradaIndice,
  clasificacion: Pick<ClasificacionEjemplar, "tipo" | "pagina">,
): string {
  const c = entrada.consulado;
  const partes = [
    `DIVIPOL ${c.departamento}·${c.municipio}·${c.zona}·${c.puesto}`,
    `MESA ${entrada.mesaNumero}`,
  ];
  if (clasificacion.tipo) partes.push(clasificacion.tipo);
  if (clasificacion.pagina) partes.push(`PAG ${clasificacion.pagina} DE 2`);
  return partes.join(" · ");
}
