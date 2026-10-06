// ============================================================
// DIGIELECT · Motor BATCH "procesa-en-tu-dispositivo" (FASE 4 · rol B)
// ------------------------------------------------------------
// Flujo (TAREA-B §3.2):
//   operador selecciona N imágenes
//     → pool de Web Workers (navigator.hardwareConcurrency)
//         · calidad real (Laplaciano + histograma) y compresión JPEG
//     → en el CLIENTE: identificación determinista contra el índice
//       real (identificarActa) + clasificación (clasificarEjemplar)
//       + guard de integridad (decidirAlmacenamiento)
//     → se sube SOLO la imagen comprimida + metadatos + resultado
//       (demoIngestarActa en demo / apiIngestarActa en fullstack)
//
// · Backpressure: máximo `hardwareConcurrency` tareas en vuelo.
// · Cancelable: cancelarLote() detiene el pool tras el item actual.
// · Reanudable: la cola de imágenes pendientes persiste en
//   IndexedDB (metricas-batch, un registro por item).
// · Métricas por lote: actas/min, % identificadas a la primera,
//   % por Hamming-1, % anomalías por código ID_*, tiempo medio
//   por hoja y dispositivo.
//
// NOTA sobre el modo demo: la lectura del código X, del encabezado
// y del barcode15 es SIMULADA de forma determinística (el OCR real
// es FASE 1-2 de los roles A/C, ver TAREA-B §3.2); la calidad, la
// compresión, el índice (3.670 actas reales) y el guard son REALES.
// ============================================================

import type { TipoEjemplar } from "@/lib/types";
import { IS_STATIC_EXPORT, withBasePath } from "@/lib/env";
import { evaluarCalidad } from "@/lib/e14/quality";
import { idbAll, idbDelete, idbPut } from "@/lib/idb";
import { publicarSync } from "@/lib/sync";
import { bootstrapEstatico, demoIngestarActa } from "@/lib/demo-store";
import { cargarIndiceActas, resolverMesaPorIndice } from "@/lib/indice-demo";
import {
  clasificarEjemplar,
  decidirAlmacenamiento,
  identificarActa,
  type EstadoIdentificacion,
} from "@/lib/identificacion-acta";
import { apiAnalizarActa, apiIngestarActa } from "@/lib/api-client";

// ------------------------------------------------------------
// Tipos públicos
// ------------------------------------------------------------

export interface EntradaImagenBatch {
  filename: string;
  dataUrl: string;
}

export interface ResultadoHojaBatch {
  idx: number;
  filename: string;
  /** PROCESADA = identificada e ingresada · ANOMALIA = guard la frenó · ERROR = fallo técnico */
  fase: "PROCESADA" | "ANOMALIA" | "ERROR";
  estadoIdentificacion: EstadoIdentificacion | null;
  hamming1: boolean;
  codigo: string | null;
  mesaLabel: string | null;
  mesaIdRef: string | null;
  tipo: TipoEjemplar | null;
  pagina: 1 | 2 | null;
  scoreCalidad: number | null;
  /** Códigos ID_* del guard (bandeja del supervisor) */
  anomalias: string[];
  ingestado: boolean;
  durMs: number;
  notas: string[];
}

export interface LoteBatch {
  id: string;
  createdAt: string;
  updatedAt: string;
  estado: "CORRIENDO" | "COMPLETADO" | "CANCELADO";
  total: number;
  resultados: ResultadoHojaBatch[];
  workers: number;
  modo: "DEMO" | "FULLSTACK";
  dispositivo: string;
}

export interface MetricasLote {
  total: number;
  procesadas: number;
  duracionTotalMs: number;
  actasPorMinuto: number;
  tiempoMedioMs: number;
  pctIdentificadasPrimera: number;
  pctHamming1: number;
  pctAnomalias: number;
  pctIngresadas: number;
  anomaliasPorCodigo: { codigo: string; n: number }[];
  dispositivo: string;
}

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

function hashSimple(texto: string): number {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) {
    h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** userAgent resumido (TAREA-B: métricas de dispositivo) */
function dispositivoResumido(): string {
  try {
    const ua = navigator.userAgent;
    const nucleos = `hardwareConcurrency=${navigator.hardwareConcurrency || "?"}`;
    const esMovil = /Android|iPhone|iPad|Mobile/i.test(ua);
    const navegador =
      /Edg\//.test(ua) ? "Edge" :
      /OPR\//.test(ua) ? "Opera" :
      /Firefox\//.test(ua) ? "Firefox" :
      /Chrome\//.test(ua) ? "Chrome" :
      /Safari\//.test(ua) ? "Safari" : "Navegador";
    const so =
      /Windows/.test(ua) ? "Windows" :
      /Android/.test(ua) ? "Android" :
      /iPhone|iPad/.test(ua) ? "iOS" :
      /Mac OS X/.test(ua) ? "macOS" :
      /Linux/.test(ua) ? "Linux" : "SO";
    return `${navegador} · ${so} · ${esMovil ? "móvil" : "escritorio"} · ${nucleos}`;
  } catch {
    return "dispositivo desconocido";
  }
}

/** Mapeo ID_* → TipoAnomalia existente (TAREA-B §5, sin extender la unión) */
const MAPA_ANOMALIA_ID: Record<string, string> = {
  ID_CODIGO_ILEGIBLE: "CODIGO_NO_DETECTADO",
  ID_AMBIGUA: "CODIGO_NO_DETECTADO",
  ID_NO_ENCONTRADA: "CODIGO_NO_DETECTADO",
  ID_ENCABEZADO_INCONSISTENTE: "ILEGIBLE_RESCANEO",
  ID_PAGINA_O_TIPO_INDETERMINADO: "ILEGIBLE_RESCANEO",
  ID_RANURA_OCUPADA_DISTINTA: "ILEGIBLE_RESCANEO",
};

/** Tamaño del pool: backpressure limitado por hardwareConcurrency */
function tamanoPool(): number {
  const hc = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(4, hc));
}

// ------------------------------------------------------------
// Lectura OCR simulada (modo demo) — determinística por contenido
// ------------------------------------------------------------

/**
 * Señales "OCR" para una imagen del lote en modo demo:
 * código X, encabezado DIVIPOL y barcode15 coherentes entre sí,
 * derivados del hash de la imagen. Distribución realista:
 * ~80% lectura exacta · ~10% 1 dígito erróneo (Hamming-1) ·
 * ~6% ilegible · ~4% código ajeno al exterior.
 */
interface SenalesSimuladas {
  codigoCrudo: string | null;
  encabezado: { pais: string; zona: string; puesto: string; mesa: string } | null;
  barcode15: string | null;
  textoOcr: string;
  conflictoClasificacion: boolean;
}

function senalesSimuladas(
  dataUrl: string,
  codigosIndice: string[]
): SenalesSimuladas {
  const h = hashSimple(dataUrl);
  const roll = h % 100;
  const codigoBase = codigosIndice[h % codigosIndice.length];

  // Clasificación: tipo/página coherentes (dígito 9 del barcode15)
  const pagina: 1 | 2 = (h >> 3) % 2 === 0 ? 1 : 2;
  const tipo: TipoEjemplar = (h >> 5) % 2 === 0 ? "DELEGADOS" : "TRANSMISION";
  const tipoDigito = tipo === "DELEGADOS" ? "2" : "3";
  const barcode = `71${String(100000 + (h % 899999))}${tipoDigito}01${pagina === 1 ? "01" : "02"}02`;

  // 4%: señales contradictorias → el guard manda a rescan
  const conflictoClasificacion = roll >= 96;

  if (roll < 80) {
    // Lectura exacta (con separadores como en el acta física)
    return {
      codigoCrudo: `X ${codigoBase.slice(0, 1)}-${codigoBase.slice(1, 4)}-${codigoBase.slice(4)} X`,
      encabezado: null, // se rellena con la entrada del índice
      barcode15: barcode,
      textoOcr: textoAnclas(pagina, tipo),
      conflictoClasificacion,
    };
  }
  if (roll < 90) {
    // Un dígito mal leído → respaldo Hamming-1 del identificador
    const pos = h % 7;
    const digito = String((Number(codigoBase[pos]) + 1 + (h % 8)) % 10);
    const perturbado =
      codigoBase.slice(0, pos) + digito + codigoBase.slice(pos + 1);
    return {
      codigoCrudo: `X ${perturbado} X`,
      encabezado: null,
      barcode15: barcode,
      textoOcr: textoAnclas(pagina, tipo),
      conflictoClasificacion,
    };
  }
  if (roll < 96) {
    // Zona X ilegible (mancha / corte de foto)
    return {
      codigoCrudo: "X ??·?—?? X",
      encabezado: null,
      barcode15: barcode,
      textoOcr: textoAnclas(pagina, tipo),
      conflictoClasificacion,
    };
  }
  // Código bien formado pero ajeno al índice exterior
  let ajeno = String(9000000 + (h % 999999));
  while (codigosIndice.includes(ajeno)) ajeno = String(Number(ajeno) + 1);
  return {
    codigoCrudo: `X ${ajeno} X`,
    encabezado: null,
    barcode15: barcode,
    textoOcr: textoAnclas(pagina, tipo),
    conflictoClasificacion,
  };
}

/** Anclas de texto grandes de cada página (las que pesan en clasificarEjemplar) */
function textoAnclas(pagina: 1 | 2, tipo: TipoEjemplar): string {
  const comunes = "ELECCION PRESIDENCIAL 2025 SEGUNDA VUELTA FORMULARIO E-14";
  const banner =
    tipo === "TRANSMISION"
      ? "EJEMPLAR TRANSMISION"
      : "EJEMPLAR DELEGADOS / CONSUL EMBAJADOR";
  const paginaTexto =
    pagina === 1
      ? "NIVELACION DE LA MESA TOTAL VOTANTES FORMULARIO TOTAL VOTOS EN LA URNA CANDIDATO VOTACION VOTOS EN BLANCO VOTOS NULOS SUMA TOTAL"
      : "CONSTANCIAS DE LOS JURADOS HUBO RECUENTO DE VOTOS FIRMA JURADO SOLICITADO POR EN REPRESENTACION DE";
  return `${comunes} ${banner} ${paginaTexto} PAG ${pagina} DE 2`;
}

// ------------------------------------------------------------
// Estado del motor
// ------------------------------------------------------------

interface RunActivo {
  lote: LoteBatch;
  cancelado: boolean;
  workers: Worker[];
  finalizado: Promise<LoteBatch>;
}

let runActivo: RunActivo | null = null;

/** Registro por item de la cola persistida en IndexedDB */
interface ItemColaIdb {
  id: string; // `${loteId}#item${idx}`
  loteId: string;
  idx: number;
  filename: string;
  dataUrl: string;
}

async function guardarLote(lote: LoteBatch): Promise<void> {
  await idbPut("metricas-batch", lote);
}

/** Cancela el lote activo (detiene el pool tras el item en vuelo) */
export function cancelarLote(): boolean {
  if (!runActivo) return false;
  runActivo.cancelado = true;
  return true;
}

export function loteActivo(): LoteBatch | null {
  return runActivo?.lote ?? null;
}

// ------------------------------------------------------------
// Procesamiento de UNA imagen (worker + identificación + ingesta)
// ------------------------------------------------------------

interface ResultadoWorker {
  ok: boolean;
  id: string;
  razon?: string;
  detalle?: string;
  calidad?: {
    score: number;
    nitidezVar: number;
    nitidez: number;
    exposicion: number;
    especular: number;
    problemas: string[];
  };
  imagenDataUrl?: string;
  anchoOriginal?: number;
  ancho?: number;
  alto?: number;
  bytesOriginales?: number;
  durMs?: number;
}

/** Procesa la imagen en el worker (calidad + compresión REALES) */
function procesarEnWorker(
  worker: Worker,
  entrada: EntradaImagenBatch
): Promise<ResultadoWorker> {
  return new Promise((resolve) => {
    const id = String(hashSimple(entrada.filename + entrada.dataUrl.slice(-64)));
    const onMessage = (ev: MessageEvent) => {
      const r = ev.data as ResultadoWorker;
      if (r && r.id === id) {
        worker.removeEventListener("message", onMessage);
        resolve(r);
      }
    };
    worker.addEventListener("message", onMessage);
    worker.postMessage({ id, filename: entrada.filename, imagen: entrada.dataUrl });
  });
}

/** Fallback en el hilo principal (navegadores sin OffscreenCanvas) */
async function procesarEnHiloPrincipal(
  entrada: EntradaImagenBatch
): Promise<ResultadoWorker> {
  const t0 = Date.now();
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("imagen ilegible"));
    el.src = entrada.dataUrl;
  });
  const calidad = evaluarCalidad(img);
  // Compresión con canvas clásico
  const escala = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
  const ctx = canvas.getContext("2d");
  ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return {
    ok: true,
    id: "fallback",
    calidad,
    imagenDataUrl: canvas.toDataURL("image/jpeg", 0.85),
    ancho: canvas.width,
    alto: canvas.height,
    durMs: Date.now() - t0,
  };
}

/**
 * Identificación + guard + ingesta de una hoja YA procesada
 * (imagen comprimida + calidad real del worker).
 */
async function identificarEIngerir(
  entrada: EntradaImagenBatch,
  calidad: { score: number; problemas: string[] },
  imagenComprimida: string
): Promise<ResultadoHojaBatch> {
  const notas: string[] = [];
  const t0 = Date.now();

  if (IS_STATIC_EXPORT) {
    // ---- MODO DEMO: identificación determinista REAL contra el
    // índice real (FASE 3) con señales OCR simuladas ----
    const [indice, estatico] = await Promise.all([
      cargarIndiceActas(),
      bootstrapEstatico(),
    ]);
    const codigos = [...indice.keys()];
    const senales = senalesSimuladas(entrada.dataUrl, codigos);

    // Encabezado DIVIPOL derivado de la entrada candidata (coherente)
    const idxCrudo = senales.codigoCrudo?.replace(/\D/g, "");
    const entradaCandidata = idxCrudo ? indice.get(idxCrudo) ?? null : null;
    const encabezado = entradaCandidata
      ? {
          pais: entradaCandidata.consulado.municipio,
          zona: entradaCandidata.consulado.zona,
          puesto: entradaCandidata.consulado.puesto,
          mesa: String(entradaCandidata.mesaNumero).padStart(3, "0"),
        }
      : null;

    const identificacion = identificarActa({
      codigoCrudo: senales.codigoCrudo,
      encabezado,
      indice,
    });
    const hamming1 =
      identificacion.notas.some((n) => n.includes("distancia 1")) ||
      identificacion.notas.some((n) => n.includes("corregido a"));

    // Clasificación con conflicto opcional (señales contradictorias)
    const texto = senales.conflictoClasificacion
      ? `${senales.textoOcr} ${textoAnclas(senales.textoOcr.includes("CONSTANCIAS") ? 1 : 2, "TRANSMISION")}`
      : senales.textoOcr;
    const clasificacion = clasificarEjemplar({
      textoOcr: texto,
      barcode15: senales.barcode15,
    });

    // Mesa del monitor para la entrada identificada
    const mesaResuelta =
      identificacion.entrada && entradaCandidata
        ? resolverMesaPorIndice(identificacion.entrada, estatico.consulados)
        : null;

    // Registro existente de la mesa (ranuras ocupadas)
    const existente = mesaResuelta
      ? construirRegistroExistente(mesaResuelta.mesaId, estatico.consulados)
      : null;

    const decision = decidirAlmacenamiento({
      identificacion,
      clasificacion,
      qrFingerprint: null,
      existente,
    });
    notas.push(...identificacion.notas, ...decision.notas);
    if (IS_STATIC_EXPORT) {
      notas.unshift("MODO DEMO · lectura OCR de la zona X simulada");
    }

    const resultado: ResultadoHojaBatch = {
      idx: 0,
      filename: entrada.filename,
      fase: "PROCESADA",
      estadoIdentificacion: identificacion.estado,
      hamming1,
      codigo: identificacion.codigoUsado,
      mesaLabel: mesaResuelta?.mesaLabel ?? null,
      mesaIdRef: mesaResuelta?.mesaId ?? null,
      tipo: clasificacion.tipo,
      pagina: clasificacion.pagina,
      scoreCalidad: calidad.score,
      anomalias: decision.anomalias,
      ingestado: false,
      durMs: Date.now() - t0,
      notas,
    };

    if (
      decision.accion === "ALMACENAR" &&
      mesaResuelta &&
      clasificacion.tipo &&
      clasificacion.pagina
    ) {
      // Se sube SOLO imagen comprimida + metadatos + resultado
      const ingesta = await demoIngestarActa({
        imagenBase64: imagenComprimida,
        tipoEjemplar: clasificacion.tipo,
        pagina: clasificacion.pagina,
        totalPaginas: clasificacion.totalPaginas ?? 2,
        barcode: senales.barcode15 ?? undefined,
        mesaIdRef: mesaResuelta.mesaId,
        scoreCliente: calidad.score,
        envioEmergencia: false,
      });
      resultado.ingestado = Boolean(ingesta.ok && ingesta.decision?.estado !== "RECHAZADO");
      if (ingesta.decision?.estado === "RECHAZADO") {
        resultado.fase = "ANOMALIA";
        resultado.anomalias = ["ID_RECHAZO_RN"];
        notas.push(ingesta.decision.motivo);
      }
    } else {
      // El guard frenó la hoja → bandeja del supervisor con el
      // mapeo ID_* → TipoAnomalia existente (TAREA-B §5)
      resultado.fase = "ANOMALIA";
      await registrarAnomaliaIdentificacionDemo({
        filename: entrada.filename,
        anomalias: decision.anomalias,
        mesaIdRef: mesaResuelta?.mesaId ?? null,
        mesaLabel: mesaResuelta?.mesaLabel ?? null,
        notas: decision.notas,
      });
    }
    return resultado;
  }

  // ---- MODO FULLSTACK: análisis VLM real + RN-02/03 ----
  const analisis = await apiAnalizarActa(imagenComprimida);
  if (!analisis.ok || !analisis.analisis) {
    return {
      idx: 0,
      filename: entrada.filename,
      fase: "ERROR",
      estadoIdentificacion: null,
      hamming1: false,
      codigo: null,
      mesaLabel: null,
      mesaIdRef: null,
      tipo: null,
      pagina: null,
      scoreCalidad: calidad.score,
      anomalias: ["ID_ANALISIS_FALLIDO"],
      ingestado: false,
      durMs: Date.now() - t0,
      notas: [analisis.error ?? "el motor de visión no respondió"],
    };
  }
  const mesaIdRef = analisis.asignacion?.mesaId ?? null;
  const tipo: TipoEjemplar =
    analisis.asignacion?.tipoEjemplar === "TRANSMISION" ? "TRANSMISION" : "DELEGADOS";
  const pagina = analisis.asignacion?.pagina === 2 ? 2 : 1;

  const ingesta = await apiIngestarActa({
    imagenBase64: imagenComprimida,
    tipoEjemplar: tipo,
    pagina,
    totalPaginas: 2,
    barcode: analisis.analisis.barcode ?? undefined,
    mesaIdRef: mesaIdRef ?? undefined,
    scoreCliente: calidad.score,
    envioEmergencia: false,
  });
  const estado = ingesta.decision?.estado;
  return {
    idx: 0,
    filename: entrada.filename,
    fase:
      !ingesta.ok || estado === "RECHAZADO" || estado === "ANOMALIA"
        ? "ANOMALIA"
        : "PROCESADA",
    estadoIdentificacion: null,
    hamming1: false,
    codigo: analisis.analisis.barcode ?? null,
    mesaLabel: analisis.asignacion?.mesaLabel ?? null,
    mesaIdRef,
    tipo,
    pagina,
    scoreCalidad: analisis.analisis.scoreCalidad ?? calidad.score,
    anomalias:
      estado === "ANOMALIA" || estado === "RECHAZADO"
        ? ["ID_RN03_EMERGENCIA"]
        : [],
    ingestado: Boolean(ingesta.ok && estado === "VALIDADO"),
    durMs: Date.now() - t0,
    notas: ingesta.decision?.motivo ? [ingesta.decision.motivo] : [],
  };
}

/** Ranuras ya ocupadas de una mesa (fuente: MesaDetail del monitor) */
function construirRegistroExistente(
  mesaId: string,
  consulados: Awaited<ReturnType<typeof bootstrapEstatico>>["consulados"]
): { qrFingerprint: null; estado: string; paginas: Record<string, Record<string, boolean>> } {
  const paginas: Record<string, Record<string, boolean>> = {
    delegados: {},
    transmision: {},
  };
  for (const c of consulados) {
    const mesa = c.mesas.find((m) => m.id === mesaId);
    if (!mesa) continue;
    for (const tipo of ["delegados", "transmision"] as const) {
      paginas[tipo] = {
        p1: mesa[tipo].p1 === true || mesa[tipo].p1 === "rescaneo",
        p2: mesa[tipo].p2 === true || mesa[tipo].p2 === "rescaneo",
      };
    }
    break;
  }
  return { qrFingerprint: null, estado: "VALIDADO", paginas };
}

/**
 * Registra en la bandeja del supervisor una anomalía ID_* del BATCH
 * (mapeo a TipoAnomalia existente — sin extender la unión).
 */
async function registrarAnomaliaIdentificacionDemo(params: {
  filename: string;
  anomalias: string[];
  mesaIdRef: string | null;
  mesaLabel: string | null;
  notas: string[];
}): Promise<void> {
  if (!IS_STATIC_EXPORT) return;
  const { demoAnomaliaIdentificacion } = await import("@/lib/demo-store");
  await demoAnomaliaIdentificacion({
    filename: params.filename,
    anomalias: params.anomalias,
    mesaIdRef: params.mesaIdRef,
    mesaLabel: params.mesaLabel,
    notas: params.notas,
    tipoMapeado:
      MAPA_ANOMALIA_ID[params.anomalias[0] ?? ""] ?? "ILEGIBLE_RESCANEO",
  });
}

// ------------------------------------------------------------
// Arranque del lote
// ------------------------------------------------------------

export interface HooksLote {
  onProgreso?: (lote: LoteBatch) => void;
  onFin?: (lote: LoteBatch) => void;
}

/**
 * Inicia el procesamiento de un lote de imágenes. Devuelve el lote
 * (que se actualiza a medida que avanza) y no bloquea la UI.
 */
export function iniciarLote(
  imagenes: EntradaImagenBatch[],
  hooks: HooksLote = {}
): LoteBatch {
  if (runActivo) {
    throw new Error("Ya hay un lote en curso (cancélelo primero)");
  }
  const lote: LoteBatch = {
    id: `lote-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    estado: "CORRIENDO",
    total: imagenes.length,
    resultados: [],
    workers: tamanoPool(),
    modo: IS_STATIC_EXPORT ? "DEMO" : "FULLSTACK",
    dispositivo: dispositivoResumido(),
  };

  // Cola persistida (reanudable): un registro por item pendiente
  const items: ItemColaIdb[] = imagenes.map((img, idx) => ({
    id: `${lote.id}#item${idx}`,
    loteId: lote.id,
    idx,
    filename: img.filename,
    dataUrl: img.dataUrl,
  }));
  void (async () => {
    await guardarLote(lote);
    for (const it of items) await idbPut("metricas-batch", it);
  })();

  const workers: Worker[] = [];
  let workersVivos = false;
  try {
    for (let i = 0; i < lote.workers; i++) {
      workers.push(new Worker(withBasePath("/workers/batch-proceso.js")));
    }
    workersVivos = true;
  } catch {
    workersVivos = false;
  }

  const run: RunActivo = {
    lote,
    cancelado: false,
    workers: workersVivos ? workers : [],
    finalizado: Promise.resolve(lote),
  };
  runActivo = run;

  const procesar = async (): Promise<LoteBatch> => {
    let siguiente = 0;
    const enVuelo = new Set<Promise<void>>();

    const correrItem = async (worker: Worker | null, idx: number): Promise<void> => {
      const item = items[idx];
      try {
        // 1) Calidad + compresión (worker REAL o fallback del hilo)
        let r: ResultadoWorker;
        if (worker) {
          r = await procesarEnWorker(worker, item);
          if (!r.ok && r.razon === "sin-soporte") {
            r = await procesarEnHiloPrincipal(item);
          }
        } else {
          r = await procesarEnHiloPrincipal(item);
        }
        if (!r.ok || !r.calidad || !r.imagenDataUrl) {
          lote.resultados.push({
            idx,
            filename: item.filename,
            fase: "ERROR",
            estadoIdentificacion: null,
            hamming1: false,
            codigo: null,
            mesaLabel: null,
            mesaIdRef: null,
            tipo: null,
            pagina: null,
            scoreCalidad: null,
            anomalias: ["ID_ERROR_PROCESAMIENTO"],
            ingestado: false,
            durMs: r.durMs ?? 0,
            notas: [r.detalle ?? r.razon ?? "fallo el procesamiento en el dispositivo"],
          });
        } else {
          // 2) Identificación + guard + ingesta (hilo principal)
          const resultado = await identificarEIngerir(
            { filename: item.filename, dataUrl: item.dataUrl },
            r.calidad,
            r.imagenDataUrl
          );
          resultado.idx = idx;
          lote.resultados.push(resultado);
        }
      } catch (e) {
        lote.resultados.push({
          idx,
          filename: item.filename,
          fase: "ERROR",
          estadoIdentificacion: null,
          hamming1: false,
          codigo: null,
          mesaLabel: null,
          mesaIdRef: null,
          tipo: null,
          pagina: null,
          scoreCalidad: null,
          anomalias: ["ID_ERROR_PROCESAMIENTO"],
          ingestado: false,
          durMs: 0,
          notas: [String(e instanceof Error ? e.message : e)],
        });
      }
      // 3) Persistencia + notificación
      lote.updatedAt = new Date().toISOString();
      lote.resultados.sort((a, b) => a.idx - b.idx);
      await idbDelete("metricas-batch", `${lote.id}#item${idx}`);
      await guardarLote(lote);
      publicarSync(
        "batch:progreso",
        {
          loteId: lote.id,
          procesadas: lote.resultados.length,
          total: lote.total,
        },
        "batch"
      );
      hooks.onProgreso?.({ ...lote, resultados: [...lote.resultados] });
    };

    // Pool con backpressure: N tareas en vuelo máximo
    const pool = workersVivos ? run.workers : [null];
    while (siguiente < items.length && !run.cancelado) {
      if (enVuelo.size >= pool.length) {
        await Promise.race(enVuelo);
        continue;
      }
      const idx = siguiente++;
      const worker = workersVivos ? run.workers[idx % run.workers.length] : null;
      const p = correrItem(worker, idx).finally(() => {
        enVuelo.delete(p);
      });
      enVuelo.add(p);
    }
    await Promise.all(enVuelo);

    lote.estado = run.cancelado ? "CANCELADO" : "COMPLETADO";
    lote.updatedAt = new Date().toISOString();
    await guardarLote(lote);
    for (const w of run.workers) {
      try {
        w.terminate();
      } catch {
        /* noop */
      }
    }
    if (runActivo === run) runActivo = null;
    hooks.onFin?.({ ...lote, resultados: [...lote.resultados] });
    return lote;
  };

  run.finalizado = procesar();
  return lote;
}

// ------------------------------------------------------------
// Métricas (TAREA-B §3.2) y consulta de lotes persistidos
// ------------------------------------------------------------

export function calcularMetricas(lote: LoteBatch): MetricasLote {
  const r = lote.resultados;
  const n = r.length || 0;
  const inicio = new Date(lote.createdAt).getTime();
  const fin = new Date(lote.updatedAt).getTime();
  const duracionTotalMs = Math.max(1, fin - inicio);
  const tiempoMedioMs = n > 0 ? Math.round(duracionTotalMs / n) : 0;

  const identificadasPrimera = r.filter(
    (x) => x.estadoIdentificacion === "IDENTIFICADA" && !x.hamming1
  ).length;
  const hamming = r.filter((x) => x.hamming1).length;
  const anomalias = r.filter((x) => x.fase === "ANOMALIA").length;
  const ingresadas = r.filter((x) => x.ingestado).length;

  const conteo = new Map<string, number>();
  for (const x of r) {
    for (const a of x.anomalias) {
      conteo.set(a, (conteo.get(a) ?? 0) + 1);
    }
  }
  const anomaliasPorCodigo = [...conteo.entries()]
    .map(([codigo, nA]) => ({ codigo, n: nA }))
    .sort((a, b) => b.n - a.n);

  return {
    total: lote.total,
    procesadas: n,
    duracionTotalMs,
    actasPorMinuto: Math.round((n / duracionTotalMs) * 60000),
    tiempoMedioMs,
    pctIdentificadasPrimera: n ? Math.round((identificadasPrimera / n) * 100) : 0,
    pctHamming1: n ? Math.round((hamming / n) * 100) : 0,
    pctAnomalias: n ? Math.round((anomalias / n) * 100) : 0,
    pctIngresadas: n ? Math.round((ingresadas / n) * 100) : 0,
    anomaliasPorCodigo,
    dispositivo: lote.dispositivo,
  };
}

/** LotEs persistidos (metricas-batch), el más reciente primero */
export async function lotesGuardados(): Promise<LoteBatch[]> {
  const todo = await idbAll<LoteBatch & { id: string }>("metricas-batch");
  return todo
    .filter((x) => typeof x.id === "string" && x.id.startsWith("lote-"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Items pendientes de un lote interrumpido (para REANUDAR) */
export async function itemsPendientes(loteId: string): Promise<ItemColaIdb[]> {
  const todo = await idbAll<ItemColaIdb>("metricas-batch");
  return todo
    .filter((x) => typeof x.id === "string" && x.id.startsWith(`${loteId}#item`))
    .sort((a, b) => a.idx - b.idx);
}

/** Limpia los lotes guardados y sus items de la cola (métricas incluidas) */
export async function borrarLotes(): Promise<void> {
  const todo = await idbAll<{ id: string }>("metricas-batch");
  for (const x of todo) {
    if (x.id.startsWith("lote-") || x.id.includes("#item")) {
      await idbDelete("metricas-batch", x.id);
    }
  }
}

// ------------------------------------------------------------
// Cargador de imágenes de ejemplo (demo: 8 actas reales del repo)
// ------------------------------------------------------------

const EJEMPLOS = [
  "/actas-ejemplo/E14_XXX_X_88_495_010_02_000_X_XXX-1.jpg",
  "/actas-ejemplo/E14_XXX_X_88_495_010_02_000_X_XXX-2.jpg",
  "/actas-ejemplo/E14_XXX_X_88_335_005_02_000_X_XXX-1.jpg",
  "/actas-ejemplo/E14_XXX_X_88_335_005_02_000_X_XXX-2.jpg",
  "/actas-ejemplo/E14_XXX_X_88_355_003_08_000_X_XXX-1.jpg",
  "/actas-ejemplo/E14_XXX_X_88_355_003_08_000_X_XXX-2.jpg",
  "/actas-ejemplo/E14_XXX_X_88_335_005_81_000_X_XXX-1.jpg",
  "/actas-ejemplo/E14_XXX_X_88_335_005_81_000_X_XXX-2.jpg",
];

async function urlADataUrl(ruta: string): Promise<string> {
  const res = await fetch(withBasePath(ruta), { cache: "force-cache" });
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error(`no se pudo leer ${ruta}`));
    fr.readAsDataURL(blob);
  });
}

/**
 * Carga N imágenes de ejemplo (las 8 actas reales del repo, repetidas
 * y re-etiquetadas como hojas distintas del lote) para probar el
 * BATCH sin tocar la galería del operador.
 */
export async function cargarEjemplosBatch(
  n: number
): Promise<EntradaImagenBatch[]> {
  const dataUrls = await Promise.all(EJEMPLOS.map((e) => urlADataUrl(e)));
  const salida: EntradaImagenBatch[] = [];
  for (let i = 0; i < n; i++) {
    const base = i % EJEMPLOS.length;
    const nombre = EJEMPLOS[base].split("/").pop() ?? `acta-${i}.jpg`;
    salida.push({
      filename: n > EJEMPLOS.length
        ? `${i + 1}-${nombre}`
        : nombre,
      dataUrl: dataUrls[base],
    });
  }
  return salida;
}
