// ============================================================
// DIGIELECT — Lógica de monitoreo (servidor)
// Transforma los datos de Prisma en las estructuras de la
// interfaz (ConsulateRow, AnomaliaItem, SlaRow, QueueFileItem)
// siguiendo las reglas del ERS.
// ============================================================

import { NextResponse } from "next/server";
import { gzipSync } from "node:zlib";
import { db } from "@/lib/db";
import { horaEnZona, minutosDelDiaEnZona, zonaIanaDePuesto } from "@/lib/hora-zona";
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

type ActaMesa = {
  id: string;
  tipoEjemplar: string;
  pagina: number;
  estado: string;
  createdAt: Date;
};

const ESTADOS_INGESTADOS = ["VALIDADO", "OFFLINE", "ANOMALIA"];

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

/**
 * [B-11] Hora local actual del puesto — reloj vivo por zona IANA (DST
 * correcto). Antes: Date.now() + utcOffsetMin, tratando el offset
 * "respecto a Bogotá" como offset-desde-UTC (+5h de error en Roma) y
 * sin DST. La única fuente de hora local es hora-zona.ts.
 * [OLA6-TZ · 6.8] `lugar` = campo `puesto` del consulado (contiene el
 * standName completo): los países multi-zona (EE.UU./Canadá/Brasil…)
 * resuelven la zona por CIUDAD, no por país.
 */
function horaLocalAhora(pais: string, lugar?: string | null): string {
  return horaEnZona(new Date(), zonaIanaDePuesto(pais, lugar));
}

/**
 * [B-11] Etiqueta de tiempo desde el cierre local (reloj vivo, zona
 * IANA del país — el cierre 16:00 se compara contra la hora local
 * REAL del país, no contra un offset fijo sin DST).
 * [OLA6-TZ · 6.8] `lugar` (puesto/standName) para países multi-zona.
 */
function tiempoDesdeCierreLabel(
  horaCierreLocal: string,
  pais: string,
  lugar?: string | null
): string {
  const partes = horaCierreLocal.split(":").map((p) => parseInt(p, 10));
  const cierreMin =
    (isNaN(partes[0]) ? 16 : partes[0]) * 60 + (isNaN(partes[1]) ? 0 : partes[1]);
  const ahoraMin = minutosDelDiaEnZona(new Date(), zonaIanaDePuesto(pais, lugar));
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

/**
 * [B-13] Acta VIGENTE de una ranura (tipoEjemplar, pagina): la ÚLTIMA
 * por createdAt (actas vienen orden asc). La PWA persiste los
 * RECHAZADO/reintentos: la primera acta ya no "gana" la ranura —
 * un rechazo + reintento válido deja la ranura sana. El acta
 * reemplazada/archivada queda en el historial pero no manda.
 */
function actaVigente(
  actas: ActaMesa[],
  tipoEjemplar: "DELEGADOS" | "TRANSMISION",
  pagina: 1 | 2
): ActaMesa | undefined {
  return actas.findLast(
    (a) => a.tipoEjemplar === tipoEjemplar && a.pagina === pagina
  );
}

const TIPO_LABEL: Record<string, string> = {
  SIN_FIRMAS: "SIN FIRMAS DETECTADAS",
  ILEGIBLE_RESCANEO: "SOLICITUD RESCANEO",
  CODIGO_NO_DETECTADO: "CÓDIGO NO DETECTADO",
  UBICACION_DISCREPANTE: "UBICACIÓN DISCREPANTE",
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

/**
 * [OLA2 2.3] Respuesta JSON comprimida (Content-Encoding: gzip).
 *
 * Los bootstrap (`/api/bootstrap` 1,19 MB y `/api/digitalizador/bootstrap`
 * 6,03 MB en bruto con el seed completo) son MUY compresibles por su
 * estructura repetitiva: gzip-6 los deja en ~65 KB y ~260 KB. El
 * contrato HTTP no cambia: todo cliente estándar (fetch del navegador,
 * curl --compressed, undici) decodifica Content-Encoding de forma
 * transparente antes de `res.json()`. En producción esto lo haría el
 * reverse proxy (Caddy `encode` / nginx gzip); en `next dev` no hay
 * compresión, por eso se aplica aquí.
 *
 * OJO al depurar: `curl -s <url> | head` sin `--compressed` muestra
 * bytes gzip — usar `curl --compressed`.
 */
export function respuestaJsonGzip(datos: unknown): NextResponse {
  const gz = gzipSync(Buffer.from(JSON.stringify(datos), "utf-8"));
  return new NextResponse(new Uint8Array(gz), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Encoding": "gzip",
      "Cache-Control": "no-store",
      Vary: "Accept-Encoding",
    },
  });
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
  // [OLA2 2.1] Select explícito en las actas incluidas: SOLO los 5
  // campos que consume la vista (tipo `ActaMesa`: id, tipoEjemplar,
  // pagina, estado, createdAt). El `include` completo materializaba en
  // CADA reconstrucción del tablero las columnas pesadas de TODAS las
  // actas (imagenBase64 ~0,5 MB y creciendo con cada captura, más
  // detalle ~0,9 MB, filename ~0,4 MB, analisisJson…) solo para
  // calcular ranuras/estados que no las usan. La respuesta JSON no
  // cambia: sigue conteniendo exactamente los mismos campos de
  // ConsulateRow/MesaDetail.
  const consulados = await db.consulado.findMany({
    orderBy: { orden: "asc" },
    include: {
      mesas: {
        orderBy: { orden: "asc" },
        select: {
          id: true,
          numero: true,
          horaCierreLocal: true,
          actas: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              tipoEjemplar: true,
              pagina: true,
              estado: true,
              createdAt: true,
            },
          },
        },
      },
      // [OLA2 2.1] ídem anomalías: solo los campos que la fila consume
      anomalias: {
        where: { estado: "ABIERTA" },
        select: { tipo: true, mesa: true, mesaIdRef: true, actaId: true },
      },
    },
  });

  return consulados.map((c) => {
    const mesasDetalle: MesaDetail[] = c.mesas.map((m) => {
      // [B-13] La ranura la manda el acta VIGENTE (última por página),
      // no la primera: rechazo + reintento válido deja la ranura sana.
      const d1 = actaVigente(m.actas, "DELEGADOS", 1);
      const d2 = actaVigente(m.actas, "DELEGADOS", 2);
      const t1 = actaVigente(m.actas, "TRANSMISION", 1);
      const t2 = actaVigente(m.actas, "TRANSMISION", 2);
      const vigentes = [d1, d2, t1, t2];

      const delegados = {
        p1: d1 ? pageStatus(d1.estado, "DELEGADOS") : "pending",
        p2: d2 ? pageStatus(d2.estado, "DELEGADOS") : "pending",
      };
      const transmision = {
        p1: t1 ? pageStatus(t1.estado, "TRANSMISION") : "pending",
        p2: t2 ? pageStatus(t2.estado, "TRANSMISION") : "pending",
      };

      // [B-12] La identidad de la mesa es el PK REAL de la BD (m.id),
      // generado UNA vez en el seed con sus sufijos (-diario, -z<zona>).
      // PROHIBIDO re-derivar por slug: la derivación anterior no
      // replicaba los sufijos y producía ~41% de IDs fantasma → mesas
      // que nunca iluminaban su anomalía y actas huérfanas del monitor.
      const anomaliaAbierta = c.anomalias.find(
        (a) =>
          a.mesaIdRef === m.id ||
          (a.actaId !== null && m.actas.some((x) => x.id === a.actaId))
      );

      // Estado de la mesa — [B-13] sobre las 4 VIGENTES
      let estado: StatusType;
      if (m.actas.length === 0) {
        estado = c.enMora ? "CRÍTICO" : "NO INICIADO";
      } else {
        const todasValidadas =
          vigentes.every((a) => a !== undefined) &&
          vigentes.every((a) => a?.estado === "VALIDADO");
        const conProblemas = vigentes.some(
          (a) => a !== undefined && (a.estado === "ANOMALIA" || a.estado === "RECHAZADO")
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
        id: m.id,
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
    // [B-13] contados sobre ranuras VIGENTES (un rechazo reintentado no
    // doble-cuenta, una ranura vacía no cuenta).
    const totalPaginas = c.numMesas * 2;
    const delegadosOk = c.mesas.reduce(
      (acc, m) =>
        acc +
        ([1, 2] as const)
          .map((p) => actaVigente(m.actas, "DELEGADOS", p))
          .filter(
            (a) => a !== undefined && ESTADOS_INGESTADOS.includes(a.estado)
          ).length,
      0
    );
    const transmisionOk = c.mesas.reduce(
      (acc, m) =>
        acc +
        ([1, 2] as const)
          .map((p) => actaVigente(m.actas, "TRANSMISION", p))
          .filter(
            (a) => a !== undefined && ESTADOS_INGESTADOS.includes(a.estado)
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
      horaActualPais: horaLocalAhora(c.pais, c.puesto),
      tiempoDesdeCierre: tiempoDesdeCierreLabel(c.horaCierreLocal, c.pais, c.puesto),
      region: c.region,
      // Offset estático vs Bogotá (legado del seed, informativo). Los
      // relojes vivos ya NO usan este campo: hora-zona.ts resuelve la
      // zona IANA del país con DST (fix B-11/S-38).
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
  // [OLA2 2.5] Límite sensato: las 100 abiertas más urgentes (hoy hay
  // ~7 en el seed; sin límite una BD real con miles dejaría el payload
  // y el render de la bandeja sin cota). Select: solo los campos que
  // mapea el DTO AnomaliaItem (la fila Anomalia ya trae los campos
  // denormalizados, no hay include de consulado que recortar).
  const anomalias = await db.anomalia.findMany({
    where: { estado: "ABIERTA" },
    orderBy: { slaMinutesRemaining: "asc" },
    take: 100,
    select: {
      id: true,
      horaAlertaLocal: true,
      horaAlertaCol: true,
      pais: true,
      ciudad: true,
      mesa: true,
      formulario: true,
      tipo: true,
      slaMinutesRemaining: true,
      mesaIdRef: true,
      actaId: true,
      createdAt: true,
    },
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
    // [OLA3 3.6] Creación real: el cliente computa el SLA restante en
    // render (createdAt + SLA_MINUTOS) con ticker de 30 s — el número
    // persistido ya no manda en la bandeja.
    createdAt: a.createdAt.toISOString(),
  }));
}

/** Filas del Centro de Control SLA */
export async function getSlaRows(): Promise<SlaRow[]> {
  // [OLA2 2.5] Límite sensato + select del consulado: antes hacía
  // `include: { consulado: true }` (TODOS los campos del consulado por
  // fila) y sin take. Solo se consumen 6 campos para el display; se
  // toman las 100 notificaciones con mayor mora.
  const notis = await db.notificacionSla.findMany({
    orderBy: { tiempoTranscurridoMin: "desc" },
    take: 100,
    include: {
      consulado: {
        select: {
          ciudad: true,
          pais: true,
          region: true,
          zona: true,
          puesto: true,
          horaCierreLocal: true,
        },
      },
    },
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
  // [OLA2 2.5] Las 200 más recientes (take) presentadas en orden FIFO
  // (las más antiguas primero), exactamente como antes: la cola de
  // BATCH es una vista del "ahora", no un histórico ilimitado.
  const archivos = await db.colaArchivo.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  archivos.reverse();

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
