// ============================================================
// DIGIELECT · FASE 1 — Integración captura → identificador
// ------------------------------------------------------------
// Módulo PUENTE entre la captura del digitalizador (rol A) y el
// identificador determinista de actas (rol C):
//
//     CapturaProcesada (señas CRUDAS, TAREA-A §4)
//       → normalizarCodigoTransmision → identificarActa
//       → clasificarEjemplar → decidirAlmacenamiento
//       → ResultadoIntegracion (tipado, listo para la UI)
//
// Reglas de la integración:
//  · La captura entrega señas CRUDAS; TODA la normalización y
//    decisión vive en src/lib/identificacion-acta.ts (contrato
//    CONVENIOS §2). Este módulo NO reimplementa ninguna regla.
//  · El índice de las 3.670 actas del exterior se construye UNA
//    vez por sesión: en la demo estática entra por el loader de
//    FASE 3 (fetch del JSON compacto de public/data, sin /api) y
//    en modo completo por dynamic import del JSON fuente (chunk
//    diferido) — ver env.ts / CONVENIOS §3.
//  · Sin OCR real (FASE 1: el flujo actual no produce texto),
//    el código entre las X puede entrar MANUALMENTE por la UI;
//    pasa por el MISMO normalizarCodigoTransmision.
//  · El guard de ranuras (mesa, tipoEjemplar, página) usa un
//    registro local persistente (localStorage) como fuente de
//    verdad del lado cliente para poder demostrar de punta a
//    punta DESCARTAR / REEMPLAZAR / ANOMALÍA.
//  · Señales SIMULADAS del modo demo (demoAnalizarActa) NUNCA
//    alimentan al identificador: sólo señales reales (QR leído,
//    barcode15, calidad de imagen medida en cliente) o señales
//    declaradas (contexto del operador / VLM en modo completo).
//
// Módulo puro: sin DOM directo (localStorage con guard), sin
// Prisma, sin z-ai. Corre en cliente; el índice es un JSON
// empaquetado, idéntico para ambos modos de build.
// ============================================================

import {
  clasificarEjemplar,
  crearIndiceActas,
  decidirAlmacenamiento,
  formatearAsignacion,
  identificarActa,
  normalizarCodigoTransmision,
  type ClasificacionEjemplar,
  type CodigoNormalizado,
  type DecisionAlmacenamiento,
  type EncabezadoLeido,
  type EntradaIndice,
  type PerfilTinta,
  type RegistroExistente,
  type ResultadoIdentificacion,
  type RanuraHoja,
} from "@/lib/identificacion-acta";
import { parseBarcode15 } from "@/lib/e14/parse";
import { IS_STATIC_EXPORT } from "@/lib/env";
import { cargarIndiceActas } from "@/lib/indice-actas-remota";
import type {
  ActaAnalysis,
  ActaEstado,
  ActaUploadPayload,
  ConsulateRow,
  MesaDetail,
  TipoEjemplar,
} from "@/lib/types";

// ------------------------------------------------------------
// Índice de actas (lazy singleton, chunk diferido)
// ------------------------------------------------------------

let indiceCache: Map<string, EntradaIndice> | null = null;
let indicePromesa: Promise<Map<string, EntradaIndice>> | null = null;

/** Forma mínima que el módulo necesita del JSON del visor. */
interface ActaVisoJson {
  idTransmissionCode?: string;
  numberStand?: string;
  expectedName?: string;
  standCode?: string;
  idZoneCode?: string;
  idDepartmentCode?: string;
  municipalityCode?: string;
}

/**
 * Carga (una vez por sesión) el índice de identificación.
 * Un solo código, dos builds (CONVENIOS §3: ramificar por entorno
 * de BUILD, no por `if` dispersos):
 * · Modo demo (export estática): loader de FASE 3 → fetch del JSON
 *   compacto de public/data/indice-actas.json (~196 KB servidos del
 *   mismo origen; CERO llamadas a /api).
 * · Modo completo: JSON fuente de prisma/data (con pdfHash) como
 *   chunk diferido del bundler, para no penalizar la carga inicial
 *   de la PWA.
 */
export async function obtenerIndiceActas(): Promise<Map<string, EntradaIndice>> {
  if (indiceCache) return indiceCache;
  if (!indicePromesa) {
    indicePromesa = cargarIndiceUnaVez().catch((err: unknown) => {
      indicePromesa = null;
      throw err;
    });
  }
  return indicePromesa;
}

function cargarIndiceUnaVez(): Promise<Map<string, EntradaIndice>> {
  if (IS_STATIC_EXPORT) {
    return cargarIndiceActas().then((indice) => {
      indiceCache = indice;
      return indice;
    });
  }
  return import("../../prisma/data/exterior-actas.json").then((mod: unknown) => {
    const datos = mod as { actas?: ActaVisoJson[]; default?: { actas?: ActaVisoJson[] } };
    const items = (Array.isArray(datos.actas) ? datos.actas : null) ??
      (Array.isArray(datos.default?.actas) ? datos.default.actas : []);
    indiceCache = crearIndiceActas(items as Parameters<typeof crearIndiceActas>[0]);
    return indiceCache;
  });
}

/** Nº de entradas del índice cargado (diagnóstico/UI). */
export function tamanoIndice(): number {
  return indiceCache?.size ?? 0;
}

// ------------------------------------------------------------
// Score compuesto RN-02 (fórmula FIRMADA [COORD] A+C)
// ------------------------------------------------------------

/**
 * Fórmula propuesta en TAREA-A-DIGITALIZADOR.md §4 y firmada
 * [COORD] por los roles A y C (worklog C-5):
 *
 *   score = round( 10 · ( 0.45·min(calidad) + 0.40·confIdent
 *                                  + 0.15·confClasif ) )
 *
 * · calidad: componentes 0-1 {nitidez, contraste, brillo};
 *   entra el MÍNIMO (la peor dimensión manda, como en el
 *   web-scanner). Con el motor actual del cliente
 *   (e14/quality.ts) contraste/brillo se aproximan con la
 *   exposición medida; rol A aportará métricas separadas con
 *   CapturaProcesada.
 * · ≥9 → auto-envío (RN-02); ≤8 queda en revisión.
 */
export const PESOS_SCORE_RN02 = {
  calidad: 0.45,
  identificacion: 0.4,
  clasificacion: 0.15,
} as const;

export interface CalidadImagen {
  /** 0-1 (varianza del Laplaciano normalizada) */
  nitidez?: number | null;
  /** 0-1 */
  contraste?: number | null;
  /** 0-1 */
  brillo?: number | null;
}

function clamp01(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function puntuarRN02(args: {
  calidad: CalidadImagen | null | undefined;
  confIdentificacion: number;
  confClasificacion: number;
}): number {
  const c = args.calidad ?? {};
  const componentes = [c.nitidez, c.contraste, c.brillo]
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
    .map((v) => clamp01(v));
  const minCalidad = componentes.length > 0 ? Math.min(...componentes) : 0;
  const crudo =
    PESOS_SCORE_RN02.calidad * minCalidad +
    PESOS_SCORE_RN02.identificacion * clamp01(args.confIdentificacion) +
    PESOS_SCORE_RN02.clasificacion * clamp01(args.confClasificacion);
  return Math.max(0, Math.min(10, Math.round(10 * crudo)));
}

// ------------------------------------------------------------
// Huella de captura (deduplicación de la hoja física)
// ------------------------------------------------------------

/** Hash determinista (mismo criterio djb2 del demo-store). */
function hashDjb2(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) {
    h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Huella usada por el guard: el texto del QR real si se decodificó
 * (paridad con demo-store), o una huella de imagen determinista si
 * no hay QR (actas de ejemplo sin decodificación). Nunca null si
 * hay imagen: así el re-escaneo de la MISMA imagen cae en
 * DESCARTAR/REEMPLAZAR y no en una falsa anomalía de cruce.
 */
export function huellaDeCaptura(
  qrTexto: string | null | undefined,
  imagenDataUrl: string | null | undefined,
): string | null {
  const qr = (qrTexto ?? "").trim();
  if (qr) return qr;
  if (imagenDataUrl) return `IMG-${hashDjb2(imagenDataUrl.slice(-4096))}`;
  return null;
}

/**
 * Busca un barcode15 REAL embebido en el texto del QR (ventanas de
 * 15 dígitos, mismo criterio de e14/parse.ts). Para los QR cifrados
 * del E-14 exterior devuelve null (no hay corridas de 15 dígitos).
 */
export function extraerBarcode15DeQr(qrTexto: string | null | undefined): string | null {
  const bruto = (qrTexto ?? "").trim();
  if (!bruto) return null;
  const corridas = bruto.match(/\d{4,}/g) ?? [];
  for (const corrida of corridas) {
    for (let i = 0; i + 15 <= corrida.length; i++) {
      if (parseBarcode15(corrida.slice(i, i + 15))) return corrida.slice(i, i + 15);
    }
  }
  return parseBarcode15(bruto) ? bruto : null;
}

// ------------------------------------------------------------
// Señales de entrada (señas CRUDAS — contrato CapturaProcesada)
// ------------------------------------------------------------

export interface SenalesCaptura {
  /** Lectura CRUD de la zona "X 7-23-10-19 X" (OCR o entrada manual) */
  codigoXCrudo?: string | null;
  /** OCR real de página completa (rol A; hoy el flujo no lo produce) */
  textoOcr?: string | null;
  /** barcode15 REAL leído (no simulado) */
  barcode15?: string | null;
  /** Texto crudo del QR decodificado (huella + barcode embebido) */
  qrTexto?: string | null;
  /** Imagen procesada (para la huella de respaldo) */
  imagenDataUrl?: string | null;
  /** Encabezado DIVIPOL crudo leído (solo modo completo: VLM real) */
  encabezado?: EncabezadoLeido | null;
  /** Perfil de tinta B/N (rol A, opcional) */
  perfilTinta?: PerfilTinta | null;
  /** Calidad de imagen medida en cliente (0-1 por componente) */
  calidad?: CalidadImagen | null;
  /** Lectura real del VLM en modo completo ("Página X de Y" + banner) */
  respaldoVlm?: { pagina?: 1 | 2 | null; tipo?: TipoEjemplar | null } | null;
  /** Contexto DECLARADO por el operador (mesa/tipo/página elegidos) */
  contextoOperador?: { tipoEjemplar?: TipoEjemplar | null; pagina?: 1 | 2 | null } | null;
}

/** Señales que efectivamente aportaron información. */
export interface SenalesUsadas {
  barcode: boolean;
  texto: boolean;
  tinta: boolean;
  qr: boolean;
  vlm: boolean;
  operador: boolean;
}

export interface ResultadoIntegracion {
  /** Qué señales entraron en la decisión (para chips de la UI) */
  senales: SenalesUsadas;
  /** Código entre las X normalizado (con correcciones y notas) */
  codigoNormalizado: CodigoNormalizado;
  identificacion: ResultadoIdentificacion;
  /** Clasificación efectiva (con respaldo declarado si aplicó) */
  clasificacion: ClasificacionEjemplar;
  /** Página/tipo completados con señal declarada (no adivinada) */
  respaldo: { pagina: "vlm" | "operador" | null; tipo: "vlm" | "operador" | null };
  /** Guard de integridad (ALMACENAR/REEMPLAZAR/ANOMALIA/DESCARTAR) */
  decision: DecisionAlmacenamiento;
  /** Score compuesto RN-02 0-10 (fórmula firmada) */
  scoreRN02: number;
  /** Asignación legible "DIVIPOL ··· MESA ··· TIPO · PAG N DE 2" */
  asignacionTexto: string | null;
  /** Mesa/consulado reales del monitor (si el índice localizó) */
  localizacion: { consulado: ConsulateRow; mesa: MesaDetail } | null;
  /** Huella usada para dedupe (QR real o IMG-hash) */
  huella: string | null;
  /** ISO de la decisión (trazabilidad) */
  fecha: string;
}

// ------------------------------------------------------------
// Registro local de ranuras (guard del lado cliente)
// ------------------------------------------------------------

const LS_RANURAS = "digielect-ranuras-c5-v1";

export interface HojaEnRanura {
  /** Huella de la hoja almacenada (QR real o IMG-hash) */
  qrFingerprint: string | null;
  estado: ActaEstado;
  actaId: string | null;
  mesaIdRef: string | null;
  actualizadaEn: string;
}

type RegistroRanuras = Record<string, HojaEnRanura>;

let ranurasMemoria: RegistroRanuras | null = null;

function cargarRanuras(): RegistroRanuras {
  if (ranurasMemoria) return ranurasMemoria;
  ranurasMemoria = {};
  try {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(LS_RANURAS);
      if (raw) ranurasMemoria = JSON.parse(raw) as RegistroRanuras;
    }
  } catch {
    ranurasMemoria = {};
  }
  return ranurasMemoria;
}

function guardarRanuras(registro: RegistroRanuras): void {
  ranurasMemoria = registro;
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_RANURAS, JSON.stringify(registro));
    }
  } catch {
    /* modo privado: sólo memoria */
  }
}

/** Clave estable de la ranura física (mesa, tipoEjemplar, página). */
export function claveDeRanura(ranura: RanuraHoja, mesaIdRef?: string | null): string {
  const mesa = mesaIdRef ?? `divipol:${ranura.mesa}`;
  return `${mesa}|${ranura.tipo}|p${ranura.pagina}`;
}

export function consultarRanura(clave: string): HojaEnRanura | null {
  return cargarRanuras()[clave] ?? null;
}

export function listarRanurasLocales(): RegistroRanuras {
  return { ...cargarRanuras() };
}

/** Registra (o actualiza) el estado de una ranura tras aceptar una hoja. */
export function registrarHojaAceptada(args: {
  ranura: RanuraHoja;
  huella: string | null;
  estado: ActaEstado;
  actaId?: string | null;
  mesaIdRef?: string | null;
}): void {
  const registro = cargarRanuras();
  registro[claveDeRanura(args.ranura, args.mesaIdRef)] = {
    qrFingerprint: args.huella,
    estado: args.estado,
    actaId: args.actaId ?? null,
    mesaIdRef: args.mesaIdRef ?? null,
    actualizadaEn: new Date().toISOString(),
  };
  guardarRanuras(registro);
}

/** Reinicia el registro local de ranuras (reinicio de demo). */
export function reiniciarRanurasLocales(): void {
  guardarRanuras({});
}

/**
 * Puente RegistroRanuras → RegistroExistente del identificador:
 * le dice al guard qué hay hoy en la ranura (mesa, tipo, página).
 */
function existenteDeRanura(
  ranura: RanuraHoja,
  mesaIdRef: string | null,
): RegistroExistente | null {
  const hoja = consultarRanura(claveDeRanura(ranura, mesaIdRef));
  if (!hoja) return null;
  const clavePagina = `p${ranura.pagina}` as "p1" | "p2";
  return {
    estado: hoja.estado,
    paginas: {
      [ranura.tipo]: {
        [clavePagina]: { qrFingerprint: hoja.qrFingerprint, estado: hoja.estado },
      },
    },
  };
}

// ------------------------------------------------------------
// Localización del monitor: índice → consulado/mesa real
// ------------------------------------------------------------

function soloDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * Localiza el consulado/mesa del monitor (bootstrap) que
 * corresponde a la entrada identificada, cruzando los códigos
 * DIVIPOL (municipio-zona-puesto) y el número de mesa.
 */
export function localizarMesaIdentificada(
  consulados: ConsulateRow[],
  entrada: EntradaIndice,
): { consulado: ConsulateRow; mesa: MesaDetail } | null {
  const mun = soloDigitos(entrada.consulado.municipio);
  const zona = soloDigitos(entrada.consulado.zona);
  const puesto = soloDigitos(entrada.consulado.puesto);
  const mesaNum = soloDigitos(entrada.mesaNumero);
  if (!mun || !zona || !puesto) return null;
  for (const c of consulados) {
    const partes = (c.code ?? "").split("-").map(soloDigitos);
    if (partes[0] !== mun || partes[1] !== zona || partes[2] !== puesto) continue;
    const mesa =
      c.mesas.find((m) => soloDigitos(m.mesaNumber) === mesaNum) ??
      (c.mesas.length === 1 ? c.mesas[0] : undefined);
    if (mesa) return { consulado: c, mesa };
  }
  return null;
}

// ------------------------------------------------------------
// Lecturas del análisis VLM (SOLO modo completo; en demo las
// señales del análisis son simuladas y NO se usan)
// ------------------------------------------------------------

/** Encabezado DIVIPOL crudo leído por el VLM (modo completo). */
export function encabezadoDeAnalisis(analisis: ActaAnalysis | null): EncabezadoLeido | null {
  const d = analisis?.divipolCodigos;
  if (!d) return null;
  const vacio = !d.depto && !d.municipio && !d.zona && !d.puesto && !d.mesa;
  if (vacio) return null;
  return {
    pais: d.municipio,
    departamento: d.depto,
    zona: d.zona,
    puesto: d.puesto,
    mesa: d.mesa,
  };
}

/** "Página X de Y" + banner de ejemplar leídos por el VLM (modo completo). */
export function respaldoVlmDeAnalisis(analisis: ActaAnalysis | null): {
  pagina: 1 | 2 | null;
  tipo: TipoEjemplar | null;
} | null {
  if (!analisis) return null;
  const pagina =
    analisis.paginaLeida === 1 || analisis.paginaLeida === 2
      ? (analisis.paginaLeida as 1 | 2)
      : null;
  const tipo = analisis.tipoEjemplarLeido ?? null;
  if (pagina == null && tipo == null) return null;
  return { pagina, tipo };
}

// ------------------------------------------------------------
// Cadena principal de integración
// ------------------------------------------------------------

/**
 * Ejecuta la cadena completa del identificador sobre las señas
 * disponibles de la captura y devuelve un resultado tipado para
 * la UI. NUNCA persiste: la persistencia la ejecuta la UI sólo
 * si el guard lo permite (y la registra en el registro local).
 */
export async function integrarCaptura(
  senales: SenalesCaptura,
  consulados: ConsulateRow[],
): Promise<ResultadoIntegracion> {
  const indice = await obtenerIndiceActas();

  // --- 1) Código de transmisión: crudo → normalizado → identificación
  const codigoNormalizado = normalizarCodigoTransmision(senales.codigoXCrudo ?? null);
  const identificacion = identificarActa({
    codigoCrudo: senales.codigoXCrudo ?? null,
    encabezado: senales.encabezado ?? null,
    indice,
  });

  // --- 2) Clasificación por señales reales (barcode/OCR/tinta)
  const barcode15 = senales.barcode15 ?? extraerBarcode15DeQr(senales.qrTexto);
  const clasificacionSenales = clasificarEjemplar({
    textoOcr: senales.textoOcr ?? null,
    barcode15,
    perfilTinta: senales.perfilTinta ?? null,
  });

  // --- 3) Respaldo DECLARADO (nunca adivinado por el sistema):
  //     sólo si no hubo CONFLICTO de señales (eso exige rescan).
  const notas: string[] = [...clasificacionSenales.notas];
  const respaldo: ResultadoIntegracion["respaldo"] = { pagina: null, tipo: null };
  let pagina = clasificacionSenales.pagina;
  let tipo = clasificacionSenales.tipo;
  let confPagina = clasificacionSenales.confianzaPagina;
  let confTipo = clasificacionSenales.confianzaTipo;
  const sinConflicto = clasificacionSenales.conflictos.length === 0;

  if (pagina == null && sinConflicto) {
    const vlm = senales.respaldoVlm?.pagina;
    const operador = senales.contextoOperador?.pagina;
    if (vlm === 1 || vlm === 2) {
      pagina = vlm;
      confPagina = Math.max(confPagina, 0.85);
      respaldo.pagina = "vlm";
      notas.push("página tomada de la lectura VLM del encabezado (respaldo declarado)");
    } else if (operador === 1 || operador === 2) {
      pagina = operador;
      confPagina = Math.max(confPagina, 0.92);
      respaldo.pagina = "operador";
      notas.push(
        "página declarada por el operador en el contexto de captura (respaldo sin OCR)",
      );
    }
  } else if (pagina == null && !sinConflicto) {
    notas.push(
      "señales de página en conflicto: NO se acepta respaldo declarado (rescan obligatorio)",
    );
  }

  if (tipo == null && sinConflicto) {
    const vlm = senales.respaldoVlm?.tipo;
    const operador = senales.contextoOperador?.tipoEjemplar;
    if (vlm) {
      tipo = vlm;
      confTipo = Math.max(confTipo, 0.85);
      respaldo.tipo = "vlm";
      notas.push("tipo de ejemplar tomado de la lectura VLM (respaldo declarado)");
    } else if (operador) {
      tipo = operador;
      confTipo = Math.max(confTipo, 0.92);
      respaldo.tipo = "operador";
      notas.push("tipo de ejemplar declarado por el operador (respaldo sin OCR)");
    }
  } else if (tipo == null && !sinConflicto) {
    notas.push("señales de tipo en conflicto: NO se acepta respaldo declarado");
  }

  const clasificacion: ClasificacionEjemplar = {
    ...clasificacionSenales,
    pagina,
    tipo,
    confianzaPagina: confPagina,
    confianzaTipo: confTipo,
    confianza: Math.min(confPagina, confTipo),
    notas,
  };

  // --- 4) Guard de integridad con el estado REAL de la ranura
  const huella = huellaDeCaptura(senales.qrTexto, senales.imagenDataUrl);
  let decision: DecisionAlmacenamiento;
  let localizacion: ResultadoIntegracion["localizacion"] = null;

  const ranuraPrevia: RanuraHoja | null =
    identificacion.entrada && pagina != null && tipo != null
      ? { mesa: identificacion.entrada.mesaNumero, tipo, pagina }
      : null;

  if (ranuraPrevia && identificacion.entrada) {
    localizacion = localizarMesaIdentificada(consulados, identificacion.entrada);
    const mesaIdRef = localizacion?.mesa.id ?? null;
    decision = decidirAlmacenamiento({
      identificacion,
      clasificacion,
      qrFingerprint: huella,
      existente: existenteDeRanura(ranuraPrevia, mesaIdRef),
    });
  } else {
    decision = decidirAlmacenamiento({ identificacion, clasificacion, qrFingerprint: huella });
  }

  // --- 5) Score compuesto RN-02 (fórmula firmada) + asignación
  const scoreRN02 = puntuarRN02({
    calidad: senales.calidad ?? null,
    confIdentificacion: identificacion.confianza,
    confClasificacion: clasificacion.confianza,
  });

  const asignacionTexto =
    identificacion.entrada && clasificacion.tipo
      ? formatearAsignacion(identificacion.entrada, {
          tipo: clasificacion.tipo,
          pagina: clasificacion.pagina,
        })
      : null;

  const senalesUsadas: SenalesUsadas = {
    barcode: clasificacionSenales.senales.barcode != null,
    texto: clasificacionSenales.senales.texto != null,
    tinta: clasificacionSenales.senales.perfil != null,
    qr: Boolean((senales.qrTexto ?? "").trim()),
    vlm: respaldo.pagina === "vlm" || respaldo.tipo === "vlm",
    operador: respaldo.pagina === "operador" || respaldo.tipo === "operador",
  };

  return {
    senales: senalesUsadas,
    codigoNormalizado,
    identificacion,
    clasificacion,
    respaldo,
    decision,
    scoreRN02,
    asignacionTexto,
    localizacion,
    huella,
    fecha: new Date().toISOString(),
  };
}

// ------------------------------------------------------------
// Payload de ingesta extendido (reemplazo de ranura)
// ------------------------------------------------------------

/**
 * Extensión aditiva del payload de ingesta para que un REEMPLAZO
 * legítimo (misma huella, ranura no validada) no choque con la
 * dedupe plana por QR del backend/demo-store. En modo completo la
 * ruta /api ignora campos desconocidos hasta que el rol B adopte
 * el flag (propuesto [COORD] en el worklog C-5).
 */
export type PayloadIngesta = ActaUploadPayload & { reemplazoDe?: string };
