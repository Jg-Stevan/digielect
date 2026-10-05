// ============================================================
// DIGIELECT — Lógica de monitoreo (servidor)
// Transforma los datos de Prisma en las estructuras de la
// interfaz (ConsulateRow, AnomaliaItem, SlaRow, QueueFileItem)
// siguiendo las reglas del ERS.
// ============================================================

import { db } from "@/lib/db";
import type {
  AnomaliaItem,
  ConsulateRow,
  MesaDetail,
  PageStatus,
  QueueFileItem,
  SlaRow,
  StatusType,
  TipoAnomalia,
} from "@/lib/types";

const ESTADOS_INGESTADOS = ["VALIDADO", "OFFLINE", "ANOMALIA"];

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

/** Hace N min desde una fecha */
function haceMinutos(fecha: Date): string {
  const min = Math.max(1, Math.round((Date.now() - fecha.getTime()) / 60000));
  if (min < 60) return `Hace ${min} min`;
  const hrs = Math.floor(min / 60);
  return `Hace ${hrs} hr${hrs > 1 ? "s" : ""}`;
}

/** Hora local actual del país (reloj vivo, offset vs Bogotá en min) */
function horaLocalAhora(offsetMin: number): string {
  const d = new Date(Date.now() + offsetMin * 60000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes()
  ).padStart(2, "0")}`;
}

/** Etiqueta de tiempo desde el cierre local de 16:00 (reloj vivo) */
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

/** Estado de una página de ejemplar según el estado del acta */
function pageStatus(estado: string, tipoEjemplar: string): PageStatus {
  if (estado === "VALIDADO" || estado === "OFFLINE") return true;
  if (estado === "ANOMALIA") {
    return tipoEjemplar === "TRANSMISION" ? "rescaneo" : true;
  }
  if (estado === "RECHAZADO") return false;
  return "pending";
}

const TIPO_LABEL: Record<string, string> = {
  SIN_FIRMAS: "SIN FIRMAS DETECTADAS",
  ILEGIBLE_RESCANEO: "SOLICITUD RESCANEO",
  CODIGO_NO_DETECTADO: "CÓDIGO NO DETECTADO",
};

const FASE_LABEL: Record<number, string> = {
  1: "🟢 FASE 1 · TOLERANCIA",
  2: "🟡 FASE 2 · ADVERTENCIA",
  3: "🔴 FASE 3 · CRÍTICA",
};

const FASE_KEY: Record<number, string> = {
  1: "fase1",
  2: "fase2",
  3: "fase3",
};

/**
 * Calcula las filas del Monitor Global a partir de la BD.
 * CACHE de corto plazo: la vista de 949 consulados es costosa
 * (Prisma + mapeo completo); cada flujo de acta la solicita
 * varias veces (analizar + ingesta + refrescos del cliente).
 * TTL de 8 s + invalidación explícita al ingerir actas → como
 * máximo UNA reconstrucción por evento de escritura.
 */
let cacheConsulados: { filas: ConsulateRow[]; ts: number } | null = null;
const CACHE_CONSULADOS_TTL_MS = 8_000;

/** Invalida la caché del monitor (llamar tras ingesta/resolución) */
export function invalidarCacheConsulados(): void {
  cacheConsulados = null;
}

export async function getConsulateRows(): Promise<ConsulateRow[]> {
  if (cacheConsulados && Date.now() - cacheConsulados.ts < CACHE_CONSULADOS_TTL_MS) {
    return cacheConsulados.filas;
  }
  const filas = await construirConsulateRows();
  cacheConsulados = { filas, ts: Date.now() };
  return filas;
}

/** Construcción real de la vista (sin caché) */
async function construirConsulateRows(): Promise<ConsulateRow[]> {
  const consulados = await db.consulado.findMany({
    orderBy: { orden: "asc" },
    include: {
      mesas: {
        orderBy: { orden: "asc" },
        include: { actas: { orderBy: { createdAt: "asc" } } },
      },
      anomalias: { where: { estado: "ABIERTA" } },
    },
  });

  return consulados.map((c) => {
    const mesasDetalle: MesaDetail[] = c.mesas.map((m) => {
      const d1 = m.actas.find((a) => a.tipoEjemplar === "DELEGADOS" && a.pagina === 1);
      const d2 = m.actas.find((a) => a.tipoEjemplar === "DELEGADOS" && a.pagina === 2);
      const t1 = m.actas.find((a) => a.tipoEjemplar === "TRANSMISION" && a.pagina === 1);
      const t2 = m.actas.find((a) => a.tipoEjemplar === "TRANSMISION" && a.pagina === 2);

      const delegados = {
        p1: d1 ? pageStatus(d1.estado, "DELEGADOS") : "pending",
        p2: d2 ? pageStatus(d2.estado, "DELEGADOS") : "pending",
      };
      const transmision = {
        p1: t1 ? pageStatus(t1.estado, "TRANSMISION") : "pending",
        p2: t2 ? pageStatus(t2.estado, "TRANSMISION") : "pending",
      };

      // Anomalía abierta asociada a esta mesa (por referencia legible)
      const mesaIdRef = `mesa-${slug(c.ciudad)}-${pad3(m.numero)}`;
      const anomaliaAbierta = c.anomalias.find((a) => a.mesaIdRef === mesaIdRef);

      // Estado de la mesa
      let estado: StatusType;
      if (m.actas.length === 0) {
        estado = c.enMora ? "CRÍTICO" : "NO INICIADO";
      } else {
        const todasValidadas =
          m.actas.length === 4 && m.actas.every((a) => a.estado === "VALIDADO");
        const conProblemas = m.actas.some(
          (a) => a.estado === "ANOMALIA" || a.estado === "RECHAZADO"
        );
        if (todasValidadas) estado = "COMPLETO";
        else if (conProblemas) estado = "INCOMPLETO";
        else estado = "PENDIENTE";
      }

      const ultimaActa = m.actas[m.actas.length - 1];
      let ultimaCarga = "-";
      if (m.actas.length === 0 && c.enMora) ultimaCarga = "Sin reporte";
      else if (ultimaActa) ultimaCarga = haceMinutos(ultimaActa.createdAt);

      return {
        id: mesaIdRef,
        mesaNumber: `Mesa ${pad3(m.numero)}`,
        delegados,
        transmision,
        estado,
        ultimaCarga,
        anomalia: anomaliaAbierta
          ? `${anomaliaAbierta.mesa} · ${TIPO_LABEL[anomaliaAbierta.tipo] ?? anomaliaAbierta.tipo}`
          : undefined,
        horaCierreLocal: m.horaCierreLocal
          ? `${m.horaCierreLocal} LOCAL`
          : undefined,
      };
    });

    // Progresos por tipo de ejemplar (RN-01: delegados prioritario)
    const totalPaginas = c.numMesas * 2;
    const delegadosOk = c.mesas.reduce(
      (acc, m) =>
        acc +
        m.actas.filter(
          (a) => a.tipoEjemplar === "DELEGADOS" && ESTADOS_INGESTADOS.includes(a.estado)
        ).length,
      0
    );
    const transmisionOk = c.mesas.reduce(
      (acc, m) =>
        acc +
        m.actas.filter(
          (a) => a.tipoEjemplar === "TRANSMISION" && ESTADOS_INGESTADOS.includes(a.estado)
        ).length,
      0
    );

    // Estado global del consulado
    let estadoGlobal: StatusType;
    const estados = mesasDetalle.map((m) => m.estado);
    if (estados.length > 0 && estados.every((e) => e === "COMPLETO")) {
      estadoGlobal = "COMPLETO";
    } else if (estados.includes("CRÍTICO") || c.anomalias.length > 0) {
      estadoGlobal = "CRÍTICO";
    } else if (estados.every((e) => e === "NO INICIADO")) {
      estadoGlobal = "NO INICIADO";
    } else {
      estadoGlobal = "PENDIENTE";
    }

    return {
      id: `cons-${c.codigo}`,
      code: c.codigo,
      pais: c.pais,
      ciudad: c.ciudad,
      zona: c.zona,
      puesto: c.puesto,
      numMesas: c.numMesas,
      horaCierreColombia: c.horaCierreColombia,
      horaActualPais: horaLocalAhora(c.utcOffsetMin),
      tiempoDesdeCierre: tiempoDesdeCierreLabel(
        c.horaCierreLocal,
        c.utcOffsetMin
      ),
      region: c.region,
      // Salud del sistema / pico de cierre: offset UTC vs Bogotá en minutos
      utcOffsetMin: c.utcOffsetMin,
      horaCierreLocalRaw: c.horaCierreLocal,
      delegadosProgress: `${delegadosOk}/${totalPaginas}`,
      delegadosPercent: totalPaginas ? Math.round((delegadosOk / totalPaginas) * 100) : 0,
      transmisionProgress: `${transmisionOk}/${totalPaginas}`,
      transmisionPercent: totalPaginas
        ? Math.round((transmisionOk / totalPaginas) * 100)
        : 0,
      estadoGlobal,
      mesas: mesasDetalle,
    };
  });
}

/** Anomalías abiertas de la bandeja del supervisor */
export async function getAnomalias(): Promise<AnomaliaItem[]> {
  const anomalias = await db.anomalia.findMany({
    where: { estado: "ABIERTA" },
    orderBy: { slaMinutesRemaining: "asc" },
  });

  return anomalias.map((a) => ({
    id: a.id,
    horaAlertaLocal: a.horaAlertaLocal,
    horaAlertaCol: a.horaAlertaCol,
    pais: a.pais,
    ciudad: a.ciudad,
    mesa: a.mesa,
    formulario: a.formulario,
    tipoAnomalia: a.tipo as TipoAnomalia,
    tipoLabel: TIPO_LABEL[a.tipo] ?? a.tipo,
    slaMinutesRemaining: a.slaMinutesRemaining,
    slaDisplay:
      a.slaMinutesRemaining >= 60
        ? `${Math.floor(a.slaMinutesRemaining / 60)}h`
        : `${a.slaMinutesRemaining}m`,
    mesaIdRef: a.mesaIdRef,
    actaId: a.actaId,
  }));
}

/** Filas del Centro de Control SLA */
export async function getSlaRows(): Promise<SlaRow[]> {
  const notis = await db.notificacionSla.findMany({
    orderBy: { tiempoTranscurridoMin: "desc" },
    include: { consulado: true },
  });

  return notis.map((n) => ({
    id: n.id,
    consulateName: `${n.consulado.ciudad} - CONSULADO`,
    pais: n.consulado.pais,
    region: n.consulado.region as SlaRow["region"],
    zona: n.consulado.zona,
    puesto: n.consulado.puesto,
    mesasInactivas: n.mesasInactivas
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    horaCierreLocal: `${n.consulado.horaCierreLocal} Local`,
    tiempoTranscurridoMin: n.tiempoTranscurridoMin,
    tiempoTranscurridoLabel: n.tiempoTranscurridoLabel,
    fase: (FASE_KEY[n.fase] ?? "fase2") as SlaRow["fase"],
    faseLabel: FASE_LABEL[n.fase] ?? FASE_LABEL[2],
    subFaseDesc: n.subFaseDesc,
    notifChannel: n.canal as SlaRow["notifChannel"],
    notifChannelExtra: (n.canalExtra ?? undefined) as SlaRow["notifChannelExtra"],
    notifDespacho: n.despachadoAt,
    notifEstado: n.estadoDetalle,
    notifEstadoColor:
      n.estado === "LEIDO"
        ? "#25D366"
        : n.estado === "SIN_ACUSE"
          ? "#fdd400"
          : "#3fe56c",
    notifHasWarning: n.estado === "SIN_ACUSE",
  }));
}

/** Cola de archivos del módulo BATCH */
export async function getQueueFiles(): Promise<QueueFileItem[]> {
  const archivos = await db.colaArchivo.findMany({
    orderBy: { createdAt: "asc" },
  });

  return archivos.map((f) => ({
    id: f.id,
    filename: f.filename,
    size: f.size,
    ext: f.ext,
    barcode: f.barcode,
    location: f.location,
    ocrStatus: f.ocrStatus as QueueFileItem["ocrStatus"],
    ocrConfidence: f.ocrConfidence ?? undefined,
    details: f.details ?? undefined,
  }));
}

/** Resumen global para tarjetas superiores e informes */
export async function getResumen() {
  const rows = await getConsulateRows();
  const [actasTotal, anomaliasAbiertas] = await Promise.all([
    db.acta.count({ where: { estado: { not: "EN_COLA" } } }),
    db.anomalia.count({ where: { estado: "ABIERTA" } }),
  ]);

  return {
    totalPuestos: rows.length,
    completo: rows.filter((r) => r.estadoGlobal === "COMPLETO").length,
    critico: rows.filter((r) => r.estadoGlobal === "CRÍTICO").length,
    pendiente: rows.filter((r) => r.estadoGlobal === "PENDIENTE").length,
    noIniciado: rows.filter((r) => r.estadoGlobal === "NO INICIADO").length,
    actasIngestadas: actasTotal,
    anomaliasAbiertas,
  };
}
