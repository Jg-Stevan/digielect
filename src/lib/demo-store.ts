// ============================================================
// DIGIELECT — Motor del MODO DEMO estático (GitHub Pages)
// Reproduce en el navegador la lógica del backend (monitor.ts,
// analisis-acta.ts y las rutas /api/*) sobre los datos reales
// exportados en /public/data/*.json, con persistencia de las
// mutaciones del usuario en localStorage.
//
// · Relojes vivos (horaActualPais / tiempoDesdeCierre)
// · RN-02 / RN-03 (decisión de ingesta) con análisis simulado
// · Verificación cruzada QR ↔ VLM ↔ consulados (verificar-acta)
// · Anomalías (creación + resolución con justificación)
// · Cola BATCH (integrar / descartar)
// · Informes consolidados (escrutinio + audit trail)
// ============================================================

import type {
  ActaAnalysis,
  ActaRegistro,
  ActaUploadPayload,
  AnomaliaItem,
  AsignacionActa,
  ConsulateRow,
  MesaDetail,
  PageStatus,
  QueueFileItem,
  ResumenGlobal,
  SlaRow,
  StatusType,
  TipoAnomalia,
  TipoEjemplar,
  VerificacionActa,
} from "@/lib/types";
import { reiniciarRanurasLocales } from "@/lib/integracion-captura";
import { withBasePath } from "@/lib/env";
import { verificarActaE14 } from "@/lib/verificar-acta";

// ------------------------------------------------------------
// Estado persistido (deltas sobre la exportación estática)
// ------------------------------------------------------------

const LS_KEY = "digielect-demo-v1";

export interface DemoActa {
  id: string;
  barcode15: string | null;
  tipoEjemplar: TipoEjemplar;
  pagina: number;
  totalPaginas: number;
  estado: "VALIDADO" | "ANOMALIA" | "RECHAZADO";
  scoreCalidad: number | null;
  filename: string;
  sizeBytes: number;
  detalle: string;
  /** mesaIdRef legible, ej. "mesa-roma-002" */
  mesaId: string | null;
  consuladoId: string | null;
  pais: string;
  ciudad: string;
  consuladoLabel: string;
  mesaLabel: string;
  createdAt: string;
  resultados: { candidato: string; votos: number }[];
  origen: "AUTO" | "EMERGENCIA" | "MANUAL" | "BATCH";
  imagenIdx: number;
  /** Huella del QR cifrado del E-14 (deduplicación) */
  qrFingerprint?: string | null;
}

export interface DemoAnomalia {
  id: string;
  tipo: TipoAnomalia;
  formulario: string;
  horaAlertaLocal: string;
  horaAlertaCol: string;
  pais: string;
  ciudad: string;
  mesa: string;
  mesaIdRef: string;
  slaMinutesRemaining: number;
  consuladoId: string | null;
  actaId: string;
  estado: "ABIERTA" | "APROBADA" | "RESCANEO_CONFIRMADO";
  justificacion?: string;
}

export interface DemoAuditEvent {
  time: string;
  title: string;
  desc: string;
  usuario: string;
}

/** Resolución de una anomalía de la exportación estática */
export interface AnomaliaOverride {
  estado: "APROBADA" | "RESCANEO_CONFIRMADO";
  justificacion: string;
  mesaIdRef: string;
  tipo: TipoEjemplar;
  pagina: 1 | 2;
}

export interface DemoConsuladoNuevo {
  consulado: ConsulateRow;
  acta: DemoActa;
}

export interface DemoState {
  actas: DemoActa[];
  anomalias: DemoAnomalia[];
  overrides: Record<string, AnomaliaOverride>;
  queueRemoved: string[];
  nuevosConsulados: DemoConsuladoNuevo[];
  audit: DemoAuditEvent[];
  seq: number;
}

function estadoVacio(): DemoState {
  return {
    actas: [],
    anomalias: [],
    overrides: {},
    queueRemoved: [],
    nuevosConsulados: [],
    audit: [],
    seq: 0,
  };
}

/** Copia en memoria cuando localStorage no está disponible */
let memoria: DemoState | null = null;

function cargarEstado(): DemoState {
  if (memoria) return memoria;
  try {
    const raw = localStorage.getItem(LS_KEY);
    memoria = raw ? (JSON.parse(raw) as DemoState) : estadoVacio();
  } catch {
    memoria = estadoVacio();
  }
  return memoria;
}

function guardarEstado(estado: DemoState): void {
  memoria = estado;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(estado));
  } catch {
    /* modo privado: queda solo en memoria */
  }
}

export function resetDemoState(): void {
  memoria = estadoVacio();
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* noop */
  }
  // [FASE 1 · rol C] El guard de ranuras (mesa, tipoEjemplar, página) del
  // identificador determinista vive en su PROPIO registro local (ver
  // integracion-captura.ts). Al reiniciar la demo se limpia también, o
  // las capturas posteriores caerían en DESCARTAR por ranuras ya
  // validadas de la sesión anterior (falsa anomalía para el demo).
  reiniciarRanurasLocales();
}

// ------------------------------------------------------------
// Datos estáticos (public/data/*.json)
// ------------------------------------------------------------

export interface BootstrapEstatico {
  ok: boolean;
  consulados: ConsulateRow[];
  anomalias: AnomaliaItem[];
  queueFiles: QueueFileItem[];
  slaRows: SlaRow[];
  resumen: ResumenGlobal;
  generadoEn?: string;
}

export interface InformesEstaticos {
  ok: boolean;
  resumen: ResumenGlobal;
  avanceNacional: unknown;
  escrutinio: {
    totalVotos: number;
    candidatos: { candidato: string; votos: number; percent: number }[];
  };
  actasRecientes: {
    id: string;
    barcode15: string | null;
    tipoEjemplar: string;
    pagina: number;
    estado: string;
    scoreCalidad: number | null;
    consulado: string;
    mesa: string;
    createdAt: string;
    imagenUrl: string | null;
    resultados: { candidato: string; votos: number }[];
  }[];
  anomaliasResueltas: number;
  auditTrail: { time: string; title: string; desc: string; usuario: string }[];
  generadoEn?: string;
}

let cacheBootstrap: BootstrapEstatico | null = null;
let cacheInformes: InformesEstaticos | null = null;

async function leerJsonEstatico<T>(ruta: string): Promise<T> {
  const res = await fetch(withBasePath(ruta), { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar ${ruta}`);
  return (await res.json()) as T;
}

export async function bootstrapEstatico(): Promise<BootstrapEstatico> {
  if (!cacheBootstrap) {
    cacheBootstrap = await leerJsonEstatico<BootstrapEstatico>(
      "/data/bootstrap.json"
    );
  }
  return cacheBootstrap;
}

export async function informesEstaticos(): Promise<InformesEstaticos> {
  if (!cacheInformes) {
    cacheInformes = await leerJsonEstatico<InformesEstaticos>(
      "/data/informes.json"
    );
  }
  return cacheInformes;
}

// ------------------------------------------------------------
// Imágenes de actas de ejemplo (visor de auditoría)
// ------------------------------------------------------------

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

/** URL pública de una imagen de acta de ejemplo (con basePath) */
export function imagenEjemplo(idx: number): string {
  const i = ((idx % IMAGENES_EJEMPLO.length) + IMAGENES_EJEMPLO.length) %
    IMAGENES_EJEMPLO.length;
  return withBasePath(IMAGENES_EJEMPLO[i]);
}

function hashSimple(texto: string): number {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) {
    h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Imagen de auditoría para un acta (demo) determinística por id */
export function imagenDemoParaActa(id: string | null | undefined): string {
  return imagenEjemplo(hashSimple(String(id ?? "acta")));
}

// ------------------------------------------------------------
// Utilidades compartidas (puertos de monitor.ts)
// ------------------------------------------------------------

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

function haceMinutosLabel(fechaIso: string): string {
  const min = Math.max(
    1,
    Math.round((Date.now() - new Date(fechaIso).getTime()) / 60000)
  );
  if (min < 60) return `Hace ${min} min`;
  const hrs = Math.floor(min / 60);
  return `Hace ${hrs} hr${hrs > 1 ? "s" : ""}`;
}

function horaLocalAhora(offsetMin: number): string {
  const d = new Date(Date.now() + offsetMin * 60000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes()
  ).padStart(2, "0")}`;
}

function tiempoDesdeCierreLabel(
  horaCierreLocal: string,
  offsetMin: number
): string {
  const partes = horaCierreLocal.split(":").map((p) => parseInt(p, 10));
  const cierreMin =
    (isNaN(partes[0]) ? 16 : partes[0]) * 60 + (isNaN(partes[1]) ? 0 : partes[1]);
  const d = new Date(Date.now() + offsetMin * 60000);
  const ahoraMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  const delta = ahoraMin - cierreMin;
  if (delta < 0) {
    const hh = Math.floor(cierreMin / 60);
    const mm = cierreMin % 60;
    return `CIERRA ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  const hrs = Math.floor(delta / 60);
  const mins = delta % 60;
  if (hrs > 0) return `HACE ${hrs}h ${mins}m`;
  return `HACE ${mins}m`;
}

function horaLocalLabel(offsetMin: number): string {
  const ahora = new Date(Date.now() + offsetMin * 60000);
  const hh = String(ahora.getUTCHours()).padStart(2, "0");
  const mm = String(ahora.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}${offsetMin === 0 ? " COL" : " LOCAL"}`;
}

const TIPO_LABEL: Record<string, string> = {
  SIN_FIRMAS: "SIN FIRMAS DETECTADAS",
  ILEGIBLE_RESCANEO: "SOLICITUD RESCANEO",
  CODIGO_NO_DETECTADO: "CÓDIGO NO DETECTADO",
};

function slaDisplay(min: number): string {
  return min >= 60 ? `${Math.floor(min / 60)}h` : `${min}m`;
}

// ------------------------------------------------------------
// Cálculo de la vista bootstrap (estático + deltas)
// ------------------------------------------------------------

/** Slot de ejemplar al que apunta una anomalía según su formulario */
function parseFormulario(
  formulario: string
): { tipo: TipoEjemplar; pagina: 1 | 2 } {
  const esTransmision = /TRANSMIS/i.test(formulario);
  const m = formulario.match(/P[ÁA]GINA\s*(\d)/i);
  const pagina = m && m[1] === "2" ? 2 : 1;
  return { tipo: esTransmision ? "TRANSMISION" : "DELEGADOS", pagina };
}

interface AnomaliaAbiertaView {
  id: string;
  mesa: string;
  tipoLabel: string;
}

function esIngerido(s: PageStatus): boolean {
  return s === true || s === "rescaneo";
}

function cuentaPaginas(
  mesas: MesaDetail[],
  tipo: "delegados" | "transmision"
): number {
  return mesas.reduce(
    (acc, m) =>
      acc +
      (esIngerido(m[tipo].p1 as PageStatus) ? 1 : 0) +
      (esIngerido(m[tipo].p2 as PageStatus) ? 1 : 0),
    0
  );
}

/** Consulados + mesas + resumen + anomalías recalculados con los deltas */
export interface VistaBootstrap {
  consulados: ConsulateRow[];
  anomalias: AnomaliaItem[];
  queueFiles: QueueFileItem[];
  slaRows: SlaRow[];
  resumen: ResumenGlobal;
}

export async function vistaBootstrap(): Promise<VistaBootstrap> {
  const estatico = await bootstrapEstatico();
  const state = cargarEstado();

  // Anomalías abiertas: estáticas no resueltas + demo ABIERTA
  const anomalias: AnomaliaItem[] = [];
  const abiertasPorMesa = new Map<string, AnomaliaAbiertaView>();
  for (const a of estatico.anomalias) {
    if (state.overrides[a.id]) continue;
    anomalias.push(a);
    abiertasPorMesa.set(a.mesaIdRef, {
      id: a.id,
      mesa: a.mesa,
      tipoLabel: a.tipoLabel,
    });
  }
  for (const da of state.anomalias) {
    if (da.estado !== "ABIERTA") continue;
    anomalias.push({
      id: da.id,
      horaAlertaLocal: da.horaAlertaLocal,
      horaAlertaCol: da.horaAlertaCol,
      pais: da.pais,
      ciudad: da.ciudad,
      mesa: da.mesa,
      formulario: da.formulario,
      tipoAnomalia: da.tipo,
      tipoLabel: TIPO_LABEL[da.tipo] ?? da.tipo,
      slaMinutesRemaining: da.slaMinutesRemaining,
      slaDisplay: slaDisplay(da.slaMinutesRemaining),
      mesaIdRef: da.mesaIdRef,
      actaId: da.actaId,
    });
    abiertasPorMesa.set(da.mesaIdRef, {
      id: da.id,
      mesa: da.mesa,
      tipoLabel: TIPO_LABEL[da.tipo] ?? da.tipo,
    });
  }

  // Actas demo agrupadas por mesa (la más reciente por slot manda)
  const actasPorMesa = new Map<string, DemoActa[]>();
  for (const a of state.actas) {
    if (!a.mesaId) continue;
    const lista = actasPorMesa.get(a.mesaId) ?? [];
    lista.push(a);
    actasPorMesa.set(a.mesaId, lista);
  }

  // Overrides de anomalías estáticas → afectan el slot de página implicado
  const overrideSlots = new Map<string, { valor: PageStatus }>();
  for (const ov of Object.values(state.overrides)) {
    overrideSlots.set(
      `${ov.mesaIdRef}|${ov.tipo}|${ov.pagina}`,
      { valor: ov.estado === "APROBADA" ? true : false }
    );
  }

  // Mesas referenciadas por anomalías (abiertas o resueltas) → recálculo
  const mesasConAnomalia = new Set<string>(abiertasPorMesa.keys());
  for (const ov of Object.values(state.overrides)) {
    mesasConAnomalia.add(ov.mesaIdRef);
  }
  for (const da of state.anomalias) {
    mesasConAnomalia.add(da.mesaIdRef);
  }

  const consulados: ConsulateRow[] = estatico.consulados.map((c) => {
    // Relojes vivos (siempre)
    const row: ConsulateRow = {
      ...c,
      horaActualPais: horaLocalAhora(c.utcOffsetMin ?? 0),
      tiempoDesdeCierre: tiempoDesdeCierreLabel(
        c.horaCierreLocalRaw ?? "16:00",
        c.utcOffsetMin ?? 0
      ),
    };

    const tocado =
      c.mesas.some(
        (m) =>
          actasPorMesa.has(m.id) ||
          mesasConAnomalia.has(m.id) ||
          overrideSlots.has(`${m.id}|DELEGADOS|1`) ||
          overrideSlots.has(`${m.id}|DELEGADOS|2`) ||
          overrideSlots.has(`${m.id}|TRANSMISION|1`) ||
          overrideSlots.has(`${m.id}|TRANSMISION|2`)
      ) || anomalias.some((a) => a.mesaIdRef && c.mesas.some((m) => m.id === a.mesaIdRef));

    if (!tocado) return row;

    const mesas: MesaDetail[] = c.mesas.map((m) => {
      const demoActas = (actasPorMesa.get(m.id) ?? []).slice().sort(
        (x, y) => x.createdAt.localeCompare(y.createdAt)
      );
      const slot = (tipo: TipoEjemplar, pagina: number): DemoActa | null => {
        const encontradas = demoActas.filter(
          (a) => a.tipoEjemplar === tipo && a.pagina === pagina
        );
        return encontradas[encontradas.length - 1] ?? null;
      };
      const ov = (tipo: TipoEjemplar, pagina: number): PageStatus | null => {
        return overrideSlots.get(`${m.id}|${tipo}|${pagina}`)?.valor ?? null;
      };
      const combinar = (
        tipo: TipoEjemplar,
        pagina: number,
        estaticoStatus: PageStatus
      ): PageStatus => {
        const acta = slot(tipo, pagina);
        if (acta) {
          // ANOMALIA: transmisión → rescaneo; delegados → cuenta como válida
          if (acta.estado === "ANOMALIA")
            return tipo === "TRANSMISION" ? "rescaneo" : true;
          if (acta.estado === "VALIDADO") return true;
          return false; // RECHAZADO
        }
        const o = ov(tipo, pagina);
        return o ?? estaticoStatus;
      };

      const delegados = {
        p1: combinar("DELEGADOS", 1, m.delegados.p1),
        p2: combinar("DELEGADOS", 2, m.delegados.p2),
      };
      const transmision = {
        p1: combinar("TRANSMISION", 1, m.transmision.p1),
        p2: combinar("TRANSMISION", 2, m.transmision.p2),
      };

      const paginas = [delegados.p1, delegados.p2, transmision.p1, transmision.p2];
      const todasValidadas = paginas.every((p) => p === true);
      const conProblemas = paginas.some(
        (p) => p === "rescaneo" || p === false
      );
      const algunaIngerida = paginas.some(esIngerido);

      let estado: StatusType;
      if (todasValidadas) estado = "COMPLETO";
      else if (conProblemas) estado = "INCOMPLETO";
      else if (algunaIngerida) estado = "PENDIENTE";
      else estado = m.estado;

      const ultima = demoActas[demoActas.length - 1];
      const anom = abiertasPorMesa.get(m.id);

      return {
        ...m,
        delegados,
        transmision,
        estado,
        anomalia: anom ? `${anom.mesa} · ${anom.tipoLabel}` : undefined,
        ultimaCarga: ultima ? haceMinutosLabel(ultima.createdAt) : m.ultimaCarga,
      };
    });

    const totalPaginas = c.numMesas * 2;
    const delegadosOk = cuentaPaginas(mesas, "delegados");
    const transmisionOk = cuentaPaginas(mesas, "transmision");

    const anomaliasAbiertasConsulado = anomalias.filter((a) =>
      c.mesas.some((m) => m.id === a.mesaIdRef)
    ).length;

    const estados = mesas.map((m) => m.estado);
    let estadoGlobal: StatusType;
    if (estados.length > 0 && estados.every((e) => e === "COMPLETO")) {
      estadoGlobal = "COMPLETO";
    } else if (
      estados.includes("CRÍTICO") ||
      anomaliasAbiertasConsulado > 0
    ) {
      estadoGlobal = "CRÍTICO";
    } else if (estados.every((e) => e === "NO INICIADO")) {
      estadoGlobal = "NO INICIADO";
    } else {
      estadoGlobal = "PENDIENTE";
    }

    return {
      ...row,
      mesas,
      delegadosProgress: `${delegadosOk}/${totalPaginas}`,
      delegadosPercent: totalPaginas
        ? Math.round((delegadosOk / totalPaginas) * 100)
        : 0,
      transmisionProgress: `${transmisionOk}/${totalPaginas}`,
      transmisionPercent: totalPaginas
        ? Math.round((transmisionOk / totalPaginas) * 100)
        : 0,
      estadoGlobal,
    };
  });

  // Consulados creados vía BATCH (NUEVO_REGISTRO)
  for (const nuevo of state.nuevosConsulados) {
    const row: ConsulateRow = {
      ...nuevo.consulado,
      horaActualPais: horaLocalAhora(nuevo.consulado.utcOffsetMin ?? 60),
      tiempoDesdeCierre: tiempoDesdeCierreLabel(
        nuevo.consulado.horaCierreLocalRaw ?? "16:00",
        nuevo.consulado.utcOffsetMin ?? 60
      ),
    };
    consulados.push(row);
  }

  const resumen: ResumenGlobal = {
    totalPuestos: consulados.length,
    completo: consulados.filter((c) => c.estadoGlobal === "COMPLETO").length,
    critico: consulados.filter((c) => c.estadoGlobal === "CRÍTICO").length,
    pendiente: consulados.filter((c) => c.estadoGlobal === "PENDIENTE").length,
    noIniciado: consulados.filter((c) => c.estadoGlobal === "NO INICIADO")
      .length,
    actasIngestadas: estatico.resumen.actasIngestadas + state.actas.length,
    anomaliasAbiertas: anomalias.length,
  };

  const queueFiles = estatico.queueFiles.filter(
    (f) => !state.queueRemoved.includes(f.id)
  );

  return { consulados, anomalias, queueFiles, slaRows: estatico.slaRows, resumen };
}

// ------------------------------------------------------------
// Análisis simulado (sustituye al VLM GLM-4.6v en el modo demo)
// ------------------------------------------------------------

function decodificarBarcode(barcode: string): ActaAnalysis["barcodeDigitos"] {
  return {
    tipoEleccion: barcode.slice(0, 2),
    kitMesa: barcode.slice(2, 8),
    tipoEjemplar: barcode.slice(8, 9),
    version: barcode.slice(9, 11),
    pagina: barcode.slice(11, 13),
    totalPaginas: barcode.slice(13, 15),
  };
}

/**
 * Análisis simulado determinístico por imagen. Etiqueta claramente
 * en `observaciones` que es una simulación del motor de visión.
 */
export function demoAnalizarActa(imagenBase64: string): ActaAnalysis {
  const h = hashSimple(imagenBase64);
  const roll = h % 20;

  let score: number;
  let firmas: boolean;
  let problemas: string[] = [];

  if (roll < 10) {
    score = 9;
    firmas = true;
  } else if (roll < 16) {
    score = 8;
    firmas = true;
    problemas = ["sombra"];
  } else if (roll < 18) {
    score = 9;
    firmas = false;
    problemas = ["falta de firmas"];
  } else {
    score = 6;
    firmas = true;
    problemas = ["poca luz", "desenfoque"];
  }

  const kit = 100000 + (h % 899999);
  // Barcode15 completo y válido: [elección 2][kit 6][tipo 1][versión 2][pág 2][total 2]
  // dígito 9 = "2" (DELEGADOS) · PÁG 01/02 — coherente con lo que "lee" el VLM
  const barcode = `71${kit}2010102`;
  // Mesa determinística por hash dentro del rango de Roma (8 mesas)
  const mesa = pad3(1 + (h % 8));

  const votosA = 120 + (h % 80);
  const votosB = 80 + ((h >> 4) % 60);
  const blanco = 2 + (h % 4);
  const nulos = 1 + ((h >> 6) % 3);

  return {
    barcode,
    barcodeDigitos: decodificarBarcode(barcode),
    scoreCalidad: score,
    scoreLetra: `${score}/10`,
    aprobado: score >= 9 && firmas,
    advertencia: score >= 6 && score <= 8,
    problemas,
    firmasDetectadas: firmas,
    cantidadFirmas: firmas ? 4 : 0,
    divipol: {
      consulado: "88",
      municipio: "ITALIA",
      zona: "10",
      puesto: "02 - ROMA - CONSULADO",
      mesa,
    },
    divipolCodigos: {
      depto: "88",
      municipio: "495",
      zona: "10",
      puesto: "02",
      mesa,
    },
    tipoEjemplarLeido: "DELEGADOS",
    paginaLeida: 1,
    totalPaginasLeidas: 2,
    nivelacion: {
      votantesE11: 210 + (h % 40),
      votosUrna: votosA + votosB + blanco + nulos,
      votosIncinerados: 2,
    },
    resultados: [
      { candidato: "ABELARDO DE LA ESPRIELLA", votos: votosA },
      { candidato: "IVÁN CEPEDA CASTRO", votos: votosB },
    ],
    votosInformativos: {
      enBlanco: blanco,
      nulos,
      noMarcados: 0,
      total: votosA + votosB + blanco + nulos,
    },
    observaciones:
      "MODO DEMO · GitHub Pages: análisis simulado localmente. El motor de visión real (GLM-4.6V) requiere el backend Next.js.",
  };
}

/**
 * Puerto de POST /api/actas/analizar en modo demo: análisis simulado
 * + cruce QR ↔ VLM ↔ consulados reales del bootstrap estático.
 * Usa verificarActaE14 (módulo puro, cliente-seguro) con la misma
 * lógica del backend, de modo que la demo reproduce el flujo E2E.
 */
export async function demoAnalizarActaCompleta(
  imagenBase64: string,
  qrTexto: string | null
): Promise<{
  ok: boolean;
  analisis: ActaAnalysis;
  verificacion: VerificacionActa;
  asignacion: AsignacionActa;
}> {
  const analisis = demoAnalizarActa(imagenBase64);
  const estatico = await bootstrapEstatico();
  const { verificacion, asignacion } = verificarActaE14({
    analisis,
    qrTexto,
    consulados: estatico.consulados,
  });
  verificacion.notas.unshift("MODO DEMO · análisis simulado determinístico");
  return { ok: true, analisis, verificacion, asignacion };
}

/** RN-02 / RN-03 — puerto de decidirEstadoActa (analisis-acta.ts) */
function decidirEstadoActaDemo(
  analisis: ActaAnalysis,
  envioEmergencia: boolean
): { estado: "VALIDADO" | "ANOMALIA" | "RECHAZADO"; motivo: string } {
  if (analisis.scoreCalidad >= 9 && analisis.firmasDetectadas) {
    return {
      estado: "VALIDADO",
      motivo: `Score ${analisis.scoreLetra} · Ingesta aprobada automáticamente (RN-02)`,
    };
  }
  if (!analisis.firmasDetectadas) {
    if (envioEmergencia) {
      return {
        estado: "ANOMALIA",
        motivo: "Falta de firmas · Bandeja de anomalías del supervisor (SIN_FIRMAS)",
      };
    }
    return {
      estado: "RECHAZADO",
      motivo: "Falta de firmas · Repite la captura o activa el envío de emergencia",
    };
  }
  if (analisis.scoreCalidad <= 5) {
    return {
      estado: "RECHAZADO",
      motivo: `Score ${analisis.scoreLetra} · Imagen ilegible, transmisión bloqueada`,
    };
  }
  if (envioEmergencia) {
    return {
      estado: "ANOMALIA",
      motivo: `Score ${analisis.scoreLetra} · Envío con advertencia tras reintentos agotados (RN-03)`,
    };
  }
  return {
    estado: "RECHAZADO",
    motivo: `Score ${analisis.scoreLetra} · Calidad insuficiente (<= 8/10), repite la foto (RN-02)`,
  };
}

// ------------------------------------------------------------
// Ingesta de acta (puerto de POST /api/actas)
// ------------------------------------------------------------

export interface IngestaDemoResult {
  ok: boolean;
  acta?: ActaRegistro;
  analisis?: ActaAnalysis;
  decision?: { estado: "VALIDADO" | "ANOMALIA" | "RECHAZADO"; motivo: string };
  anomaliaId?: string | null;
  /** Cruce QR ↔ VLM ↔ consulados (paridad con POST /api/actas) */
  verificacion?: VerificacionActa | null;
  asignacion?: AsignacionActa | null;
  error?: string;
}

export async function demoIngestarActa(
  payload: ActaUploadPayload & { reemplazoDe?: string }
): Promise<IngestaDemoResult> {
  if (!payload?.imagenBase64) {
    return { ok: false, error: "imagenBase64 es obligatorio" };
  }

  const estatico = await bootstrapEstatico();
  const state = cargarEstado();

  const tipoEjemplar: TipoEjemplar =
    payload.tipoEjemplar === "TRANSMISION" ? "TRANSMISION" : "DELEGADOS";
  const pagina = Math.max(1, Math.min(9, payload.pagina ?? 1));
  const totalPaginas = Math.max(1, Math.min(9, payload.totalPaginas ?? 2));
  const envioEmergencia = Boolean(payload.envioEmergencia);

  // 1. Análisis (simulado; en modo manual se usan los datos del operador)
  let analisis: ActaAnalysis;
  if (payload.modoManual) {
    analisis = demoAnalizarActa(payload.imagenBase64);
    analisis.scoreCalidad = 9;
    analisis.scoreLetra = "9/10";
    analisis.aprobado = true;
    analisis.advertencia = false;
    analisis.problemas = [];
    analisis.firmasDetectadas = true;
    if (payload.barcode && /^\d{15}$/.test(payload.barcode)) {
      analisis.barcode = payload.barcode;
      analisis.barcodeDigitos = decodificarBarcode(payload.barcode);
    }
    if (payload.datosManuales?.resultados?.length) {
      analisis.resultados = payload.datosManuales.resultados;
    }
    if (payload.datosManuales?.divipol) {
      analisis.divipol = { ...analisis.divipol, ...payload.datosManuales.divipol };
    }
  } else {
    analisis = demoAnalizarActa(payload.imagenBase64);
  }

  // 1.5 Verificación cruzada QR ↔ VLM ↔ consulados (paridad con el
  // backend: misma lógica que POST /api/actas, módulo puro compartido)
  let verificacion: VerificacionActa | null = null;
  let asignacion: AsignacionActa | null = null;
  if (payload.qrTexto || analisis.barcode) {
    const cruce = verificarActaE14({
      analisis,
      qrTexto: payload.qrTexto ?? null,
      consulados: estatico.consulados,
    });
    verificacion = cruce.verificacion;
    asignacion = cruce.asignacion;
  }

  // 2. Decisión RN-02 / RN-03 (+ deduplicación por huella QR cifrada:
  //    el QR del E-14 identifica unívocamente el documento físico)
  const qrFingerprint = payload.qrTexto?.trim() || null;
  let decision = payload.modoManual
    ? { estado: "VALIDADO" as const, motivo: "Transcripción manual asistida (RF-1.5)" }
    : decidirEstadoActaDemo(analisis, envioEmergencia);
  // [FASE 1 · rol C] reemplazoDe: la PWA ya decidió REEMPLAZAR sobre la
  // misma ranura (misma huella QR, hoja previa no validada) — la dedupe
  // plana por QR no debe rechazar ese re-ingreso legítimo.
  if (qrFingerprint && !payload.reemplazoDe) {
    const dup = state.actas.find((a) => a.qrFingerprint === qrFingerprint);
    if (dup) {
      decision = {
        estado: "RECHAZADO" as const,
        motivo: `QR DUPLICADO — el documento ya fue digitalizado (${dup.filename})`,
      };
    }
  }

  // 3. Resolver mesa de destino
  let mesaId: string | null = null;
  let consuladoId: string | null = null;
  let pais = "SIN UBICAR";
  let ciudad = "SIN UBICAR";
  if (payload.mesaIdRef) {
    for (const c of estatico.consulados) {
      const mesa = c.mesas.find((m) => m.id === payload.mesaIdRef);
      if (mesa) {
        mesaId = mesa.id;
        consuladoId = c.id;
        pais = c.pais;
        ciudad = c.ciudad;
        break;
      }
    }
  }

  // 4. Persistir el acta en el estado demo
  state.seq += 1;
  const n = state.seq;
  const sizeBytes = Math.round((payload.imagenBase64.length * 3) / 4);
  const acta: DemoActa = {
    id: `demo-acta-${n}`,
    barcode15: analisis.barcode,
    tipoEjemplar,
    pagina,
    totalPaginas,
    estado: decision.estado,
    scoreCalidad: Math.round(analisis.scoreCalidad),
    filename: `E14_PWA_DEMO${n}_P${pagina}.jpg`,
    sizeBytes,
    detalle: decision.motivo,
    mesaId,
    consuladoId,
    pais,
    ciudad,
    consuladoLabel: `${pais} · ${ciudad}`,
    mesaLabel: mesaId ? `MESA ${mesaId.slice(-3)}` : "MESA SIN ASIGNAR",
    createdAt: new Date().toISOString(),
    resultados:
      decision.estado === "RECHAZADO" ? [] : analisis.resultados.slice(),
    origen: payload.modoManual
      ? "MANUAL"
      : envioEmergencia
        ? "EMERGENCIA"
        : "AUTO",
    imagenIdx: hashSimple(payload.imagenBase64) % 8,
    qrFingerprint,
  };
  state.actas.push(acta);

  // 5. Anomalía → bandeja del supervisor (RF-2.2)
  let anomaliaId: string | null = null;
  if (decision.estado === "ANOMALIA") {
    const tipo: TipoAnomalia = !analisis.firmasDetectadas
      ? "SIN_FIRMAS"
      : analisis.barcode === null
        ? "CODIGO_NO_DETECTADO"
        : "ILEGIBLE_RESCANEO";
    const demoAnomalia: DemoAnomalia = {
      id: `demo-anomalia-${n}`,
      tipo,
      formulario: `${tipoEjemplar === "DELEGADOS" ? "DELEGADOS" : "TRANSMISIÓN"} - PÁGINA ${pagina}`,
      horaAlertaLocal: horaLocalLabel(-60),
      horaAlertaCol: horaLocalLabel(0),
      pais,
      ciudad,
      mesa: acta.mesaLabel,
      mesaIdRef: payload.mesaIdRef ?? "mesa-sin-asignar",
      slaMinutesRemaining: 40,
      consuladoId,
      actaId: acta.id,
      estado: "ABIERTA",
    };
    state.anomalias.push(demoAnomalia);
    anomaliaId = demoAnomalia.id;
  }

  // 6. Audit trail (RNF-03)
  state.audit.unshift({
    time: acta.createdAt,
    title: decision.estado === "VALIDADO" ? "INGESTA_ACTA" : "ALERTA_ANOMALIA",
    desc: `${tipoEjemplar} P${pagina} · ${decision.motivo} · Score ${analisis.scoreLetra} · (demo local)`,
    usuario: "PWA-DIG-001",
  });

  guardarEstado(state);

  const registro: ActaRegistro = {
    id: acta.id,
    barcode15: acta.barcode15,
    tipoEjemplar,
    pagina,
    totalPaginas,
    estado: decision.estado,
    scoreCalidad: acta.scoreCalidad,
    imagenUrl: imagenEjemplo(acta.imagenIdx),
    filename: acta.filename,
    createdAt: acta.createdAt,
    analisis,
    verificacion,
    asignacion,
  };

  return {
    ok: true,
    acta: registro,
    analisis,
    decision,
    anomaliaId,
    verificacion,
    asignacion,
  };
}

// ------------------------------------------------------------
// Resolución de anomalías (puerto de POST /api/anomalias/resolver)
// ------------------------------------------------------------

export interface ResolverDemoResult {
  ok: boolean;
  action?: "APROBADA" | "RESCANEO_CONFIRMADO";
  error?: string;
}

export async function demoResolverAnomalia(
  anomaliaId: string,
  action: "APROBADA" | "RESCANEO_CONFIRMADO",
  justificacion: string
): Promise<ResolverDemoResult> {
  if (!anomaliaId || !action) {
    return { ok: false, error: "anomaliaId y action son obligatorios" };
  }
  if (action !== "APROBADA" && action !== "RESCANEO_CONFIRMADO") {
    return { ok: false, error: "Acción inválida" };
  }
  const justTrim = (justificacion ?? "").trim();
  if (justTrim.length < 10) {
    return {
      ok: false,
      error: "La justificación escrita es obligatoria (mín. 10 caracteres)",
    };
  }

  const estatico = await bootstrapEstatico();
  const state = cargarEstado();

  const estatica = estatico.anomalias.find((a) => a.id === anomaliaId);
  const demo = state.anomalias.find((a) => a.id === anomaliaId);
  if (!estatica && !demo) {
    return { ok: false, error: "Anomalía no encontrada" };
  }

  if (estatica) {
    const { tipo, pagina } = parseFormulario(estatica.formulario);
    state.overrides[anomaliaId] = {
      estado: action,
      justificacion: justTrim,
      mesaIdRef: estatica.mesaIdRef,
      tipo,
      pagina,
    };
  } else if (demo) {
    demo.estado = action;
    demo.justificacion = justTrim;
    // Acta vinculada
    const acta = state.actas.find((a) => a.id === demo.actaId);
    if (acta) {
      acta.estado = action === "APROBADA" ? "VALIDADO" : "RECHAZADO";
      acta.detalle =
        action === "APROBADA"
          ? `Aprobada por supervisor: ${justTrim}`
          : `Rescaneo confirmado por supervisor: ${justTrim}`;
    }
  }

  const etiqueta = estatica
    ? `${estatica.mesa} · ${estatica.ciudad}`
    : `${demo?.mesa} · ${demo?.ciudad}`;

  state.audit.unshift({
    time: new Date().toISOString(),
    title: action === "APROBADA" ? "APROBAR_ACTA" : "CONFIRMAR_RESCANEO",
    desc: `${etiqueta} · Justificación: ${justTrim} · (demo local)`,
    usuario: "ADM-9482",
  });

  guardarEstado(state);
  return { ok: true, action };
}

// ------------------------------------------------------------
// Cola BATCH (puerto de POST /api/batch)
// ------------------------------------------------------------

export interface BatchDemoResult {
  ok: boolean;
  accion?: string;
  mensaje?: string;
  error?: string;
}

function mesaRefDeLocation(location: string): {
  mesaIdRef: string;
  ciudad: string;
  numMesa: number;
} | null {
  const partes = location.split(">").map((s) => s.trim());
  const ciudad = partes[1] ?? null;
  const match = location.match(/MESA\s+(\d+)/i);
  if (!ciudad || !match) return null;
  const numMesa = parseInt(match[1], 10);
  return { mesaIdRef: `mesa-${slug(ciudad)}-${pad3(numMesa)}`, ciudad, numMesa };
}

export async function demoBatch(
  fileId: string,
  action: "integrar" | "remove"
): Promise<BatchDemoResult> {
  if (!fileId || !action) {
    return { ok: false, error: "fileId y action son obligatorios" };
  }

  const estatico = await bootstrapEstatico();
  const state = cargarEstado();

  const archivo = estatico.queueFiles.find(
    (f) => f.id === fileId && !state.queueRemoved.includes(f.id)
  );
  if (!archivo) {
    return { ok: false, error: "Archivo no encontrado en la cola" };
  }

  if (action === "remove") {
    state.queueRemoved.push(fileId);
    state.audit.unshift({
      time: new Date().toISOString(),
      title: "DESCARTAR_ARCHIVO_BATCH",
      desc: `${archivo.filename} · ${archivo.location} · (demo local)`,
      usuario: "ADM-9482",
    });
    guardarEstado(state);
    return { ok: true, accion: "DESCARTADO" };
  }

  // action === "integrar"
  if (archivo.ocrStatus === "DUPLICADO") {
    return {
      ok: false,
      error:
        "No se puede integrar: la página ya fue procesada y aprobada previamente (DUPLICADO).",
    };
  }

  if (archivo.ocrStatus === "RESUELVE_ALERTA") {
    const ref = mesaRefDeLocation(archivo.location);
    const anomaliaEstatica = ref
      ? estatico.anomalias.find(
          (a) => a.mesaIdRef === ref.mesaIdRef && !state.overrides[a.id]
        )
      : undefined;
    const anomaliaDemo = ref
      ? state.anomalias.find(
          (a) =>
            a.mesaIdRef === ref.mesaIdRef && a.estado === "ABIERTA"
        )
      : undefined;

    if (anomaliaEstatica) {
      const { tipo, pagina } = parseFormulario(anomaliaEstatica.formulario);
      state.overrides[anomaliaEstatica.id] = {
        estado: "APROBADA",
        justificacion: `Resuelta vía carga masiva BATCH: ${archivo.filename}`,
        mesaIdRef: anomaliaEstatica.mesaIdRef,
        tipo,
        pagina,
      };
    } else if (anomaliaDemo) {
      anomaliaDemo.estado = "APROBADA";
      anomaliaDemo.justificacion = `Resuelta vía carga masiva BATCH: ${archivo.filename}`;
      const acta = state.actas.find((a) => a.id === anomaliaDemo.actaId);
      if (acta) {
        acta.estado = "VALIDADO";
        acta.detalle = `Recuperado vía BATCH · ${archivo.barcode}`;
      }
    }

    state.queueRemoved.push(fileId);
    state.audit.unshift({
      time: new Date().toISOString(),
      title: "INTEGRAR_BATCH",
      desc: `${archivo.filename} integrado · Resuelve alerta ${
        anomaliaEstatica?.mesa ?? anomaliaDemo?.mesa ?? archivo.location
      } · Barcode ${archivo.barcode} · (demo local)`,
      usuario: "BATCH-SIG-04",
    });
    guardarEstado(state);

    return {
      ok: true,
      accion: "ALERTA_RESUELTA",
      mensaje: `Archivo integrado. Alerta de ${
        anomaliaEstatica?.ciudad ?? anomaliaDemo?.ciudad ?? "mesa"
      } ${anomaliaEstatica?.mesa ?? anomaliaDemo?.mesa ?? ""} resuelta.`,
    };
  }

  if (archivo.ocrStatus === "NUEVO_REGISTRO") {
    const partes = archivo.location.split(">").map((s) => s.trim());
    const pais = (partes[0] ?? "NUEVO").trim();
    const info = mesaRefDeLocation(archivo.location);
    const ciudad = info?.ciudad ?? (partes[1] ?? "MESA").trim();
    const numMesa = info?.numMesa ?? 1;

    // Buscar consulado existente (país + ciudad)
    const existente = estatico.consulados.find(
      (c) => c.pais === pais && c.ciudad === ciudad
    );
    const total =
      estatico.consulados.length + state.nuevosConsulados.length;
    const nuevoCodigo = `9${String(100 + total).slice(-3)}`;
    const consulado: ConsulateRow = existente ?? {
      id: `cons-${nuevoCodigo}`,
      code: nuevoCodigo,
      pais,
      ciudad,
      zona: "99",
      puesto: `${String(numMesa).padStart(2, "0")} - ${ciudad}`,
      numMesas: 1,
      horaCierreColombia: "3:00 PM",
      horaActualPais: horaLocalAhora(60),
      tiempoDesdeCierre: tiempoDesdeCierreLabel("16:00", 60),
      delegadosProgress: "2/2",
      delegadosPercent: 100,
      transmisionProgress: "0/2",
      transmisionPercent: 0,
      estadoGlobal: "PENDIENTE",
      mesas: [
        {
          id: `mesa-${slug(ciudad)}-${pad3(numMesa)}`,
          mesaNumber: `Mesa ${pad3(numMesa)}`,
          delegados: { p1: true, p2: true },
          transmision: { p1: "pending", p2: "pending" },
          estado: "PENDIENTE",
          ultimaCarga: "Hace 1 min",
        },
      ],
      utcOffsetMin: 60,
      horaCierreLocalRaw: "16:00",
    };
    const creado = !existente;

    const yaExiste = state.actas.some((a) => a.barcode15 === archivo.barcode);
    state.seq += 1;
    const n = state.seq;
    if (!yaExiste) {
      const actaNueva: DemoActa = {
        id: `demo-acta-${n}`,
        barcode15: archivo.barcode,
        tipoEjemplar: "DELEGADOS",
        pagina: 1,
        totalPaginas: 2,
        estado: "VALIDADO",
        scoreCalidad: Math.round((archivo.ocrConfidence ?? 94) / 10),
        filename: archivo.filename,
        sizeBytes: 0,
        detalle: `Ingresado vía BATCH · Confianza OCR ${archivo.ocrConfidence ?? 94}%`,
        mesaId: consulado.mesas[0]?.id ?? null,
        consuladoId: consulado.id,
        pais,
        ciudad,
        consuladoLabel: `${pais} · ${ciudad}`,
        mesaLabel: `MESA ${pad3(numMesa)}`,
        createdAt: new Date().toISOString(),
        resultados: [],
        origen: "BATCH",
        imagenIdx: n % 8,
      };
      state.actas.push(actaNueva);
      if (creado) {
        state.nuevosConsulados.push({
          consulado,
          acta: actaNueva,
        });
      }
    }

    state.queueRemoved.push(fileId);
    state.audit.unshift({
      time: new Date().toISOString(),
      title: "INTEGRAR_BATCH",
      desc: `${archivo.filename} integrado · Nuevo registro ${pais} > ${ciudad} > MESA ${pad3(
        numMesa
      )} · Barcode ${archivo.barcode} · (demo local)`,
      usuario: "BATCH-SIG-04",
    });
    guardarEstado(state);

    return {
      ok: true,
      accion: "NUEVO_REGISTRO",
      mensaje: `Archivo integrado. ${ciudad} > Mesa ${pad3(numMesa)} agregado al Monitor Global.`,
    };
  }

  return { ok: false, error: "Estado OCR no soportado para integración" };
}

// ------------------------------------------------------------
// Informes consolidados (GET /api/informes + deltas demo)
// ------------------------------------------------------------

export async function demoInformes(): Promise<InformesEstaticos & {
  anomaliasResueltas: number;
  generadoEn: string;
}> {
  const estatico = await informesEstaticos();
  const state = cargarEstado();
  const vista = await vistaBootstrap();

  // Actas demo (VALIDADO/ANOMALIA) → recientes
  const recientesDemo = state.actas
    .filter((a) => a.estado === "VALIDADO" || a.estado === "ANOMALIA")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12)
    .map((a) => ({
      id: a.id,
      barcode15: a.barcode15,
      tipoEjemplar: a.tipoEjemplar,
      pagina: a.pagina,
      estado: a.estado,
      scoreCalidad: a.scoreCalidad,
      consulado: a.consuladoLabel,
      mesa: a.mesaLabel,
      createdAt: a.createdAt,
      imagenUrl: imagenEjemplo(a.imagenIdx),
      resultados: a.resultados.map((r) => ({
        candidato: r.candidato,
        votos: r.votos,
      })),
    }));

  const actasRecientes = [...recientesDemo, ...estatico.actasRecientes].slice(
    0,
    12
  );

  // Escrutinio acumulado (estático + votos de actas demo)
  const votos = new Map<string, number>();
  for (const c of estatico.escrutinio.candidatos) {
    votos.set(c.candidato, c.votos);
  }
  for (const a of state.actas) {
    if (a.estado === "RECHAZADO") continue;
    for (const r of a.resultados) {
      votos.set(r.candidato, (votos.get(r.candidato) ?? 0) + r.votos);
    }
  }
  const totalVotos = [...votos.values()].reduce((x, y) => x + y, 0);
  const candidatos = [...votos.entries()]
    .map(([candidato, v]) => ({
      candidato,
      votos: v,
      percent: totalVotos ? Math.round((v / totalVotos) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.votos - a.votos);

  // Anomalías resueltas
  const resueltas =
    Object.keys(state.overrides).length +
    state.anomalias.filter(
      (a) => a.estado === "APROBADA" || a.estado === "RESCANEO_CONFIRMADO"
    ).length;

  return {
    ...estatico,
    resumen: vista.resumen,
    escrutinio: { totalVotos, candidatos },
    actasRecientes,
    anomaliasResueltas: estatico.anomaliasResueltas + resueltas,
    auditTrail: [
      ...state.audit.map((e) => ({
        time: e.time,
        title: e.title,
        desc: e.desc,
        usuario: e.usuario,
      })),
      ...estatico.auditTrail,
    ].slice(0, 30),
    generadoEn: new Date().toISOString(),
  };
}
