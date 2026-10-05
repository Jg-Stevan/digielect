// ============================================================
// DIGIELECT — Cruce QR ↔ VLM ↔ bootstrap (E-14 exterior)
// Tercer paso del flujo del digitalizador:
//   1. Cliente decodifica el QR → texto crudo
//   2. VLM (analisis-acta.ts) lee la imagen: códigos DIVIPOL
//      del encabezado, ejemplar impreso, "Página X de Y" y barcode15
//   3. AQUÍ: se cruzan ambas lecturas contra la tabla real de
//      consulados y se decide la UBICACIÓN FINAL del acta
//      (consulado/mesa/tipo/página) con su origen y confianza.
//
// Módulo PURO y SINCRÓNICO (cliente y servidor): importa
// únicamente de @/lib/types y @/lib/e14/parse (sin Prisma,
// sin monitor, sin z-ai). La tabla de consulados (bootstrap)
// se recibe por parámetro.
// ============================================================

import type {
  ActaAnalysis,
  AsignacionActa,
  ConsulateRow,
  QrParseoWire,
  TipoEjemplar,
  VerificacionActa,
} from "@/lib/types";
import {
  normalizarNombre,
  numeroDeMesa,
  parseBarcode15,
  parseQrE14,
  soloDigitos,
  textoCoicideConCodigo,
  type Barcode15,
  type QrParseo,
} from "@/lib/e14/parse";

// ------------------------------------------------------------
// Parámetros y resultado
// ------------------------------------------------------------

export interface VerificarActaParams {
  /** Análisis VLM de la imagen (con divipolCodigos/ejemplar leídos) */
  analisis: ActaAnalysis;
  /** Texto crudo del QR decodificado en cliente (opcional) */
  qrTexto?: string | null;
  /** Tabla real de consulados (bootstrap del monitor o demo) */
  consulados: ConsulateRow[];
}

export interface VerificarActarResult {
  verificacion: VerificacionActa;
  asignacion: AsignacionActa;
}

/** Lectura del lado VLM (imagen) */
interface LadoVlm {
  cons: ConsulateRow | null;
  /** Cómo se resolvió el consulado: códigos DIVIPOL o nombres */
  metodo: "codigos" | "nombres" | null;
  /** Mesa leída (0 = sin mesa) */
  mesaNum: number;
  /** Barcode15 leído del código de barras de la imagen */
  barcode: Barcode15 | null;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/** Códigos DIVIPOL numéricos del análisis (defensivo ante JSON viejo) */
function codigosDe(analisis: ActaAnalysis): {
  depto: string | null;
  municipio: string | null;
  zona: string | null;
  puesto: string | null;
  mesa: string | null;
} {
  const c = analisis.divipolCodigos;
  if (!c) return { depto: null, municipio: null, zona: null, puesto: null, mesa: null };
  return {
    depto: c.depto ?? null,
    municipio: c.municipio ?? null,
    zona: c.zona ?? null,
    puesto: c.puesto ?? null,
    mesa: c.mesa ?? null,
  };
}

/** Normaliza un tipo de ejemplar (VLM/barcode) al union TipoEjemplar */
function normalizarTipo(raw: string | null | undefined): TipoEjemplar | null {
  const n = normalizarNombre(raw);
  if (!n) return null;
  if (n.includes("DELEGADO")) return "DELEGADOS";
  if (n.includes("TRANSMIS")) return "TRANSMISION";
  // CLAVEROS (E-14 interior) y cualquier otro texto → no tipable aquí
  return null;
}

/**
 * Resuelve el consulado del lado VLM contra la tabla real:
 *  a) códigos DIVIPOL numéricos (municipio+zona+puesto) — método fuerte
 *  b) nombres del encabezado (ciudad en consulado/municipio/puesto) — débil
 */
function resolverConsuladoVlm(
  cod: ReturnType<typeof codigosDe>,
  nombres: ActaAnalysis["divipol"],
  consulados: ConsulateRow[]
): { cons: ConsulateRow | null; metodo: "codigos" | "nombres" | null } {
  const codMuni = soloDigitos(cod.municipio ?? "");
  const codZona = soloDigitos(cod.zona ?? "");
  const codPuesto = soloDigitos(cod.puesto ?? "");

  // a) Por códigos: cons.code "495-10-02" → muni "495", zona "10", puesto "02"
  if (codMuni && codZona && codPuesto) {
    for (const cons of consulados) {
      const partes = (cons.code ?? "").split("-").map((p) => soloDigitos(p));
      if (partes.length < 3 || partes.some((p) => !p)) continue;
      const [muni, zona, puesto] = partes;
      const ok =
        textoCoicideConCodigo(codMuni, muni) &&
        textoCoicideConCodigo(codZona, zona) &&
        textoCoicideConCodigo(codPuesto, puesto);
      if (ok) return { cons, metodo: "codigos" };
    }
  }

  // b) Por nombres: la ciudad del consulado aparece en el consulado,
  //    municipio o puesto leídos del encabezado (y/o tokens del puesto)
  const nomCons = normalizarNombre(nombres.consulado);
  const nomMuni = normalizarNombre(nombres.municipio);
  const nomPuesto = normalizarNombre(nombres.puesto);
  let mejor: { cons: ConsulateRow; score: number } | null = null;
  for (const cons of consulados) {
    const ciudad = normalizarNombre(cons.ciudad);
    if (ciudad.length < 4) continue;
    let score = 0;
    if (nomCons.includes(ciudad)) score += 4;
    if (nomMuni.includes(ciudad)) score += 3;
    if (nomPuesto.includes(ciudad)) score += 3;
    if (score === 0) {
      // tokens alfabéticos del puesto real presentes en los nombres leídos
      const tokens = normalizarNombre(cons.puesto)
        .split(" ")
        .filter((t) => t.length >= 5 && /[A-Z]/.test(t));
      if (tokens.some((t) => nomCons.includes(t) || nomMuni.includes(t))) score = 1;
    }
    if (score > 0 && (!mejor || score > mejor.score)) mejor = { cons, score };
  }
  if (mejor) return { cons: mejor.cons, metodo: "nombres" };
  return { cons: null, metodo: null };
}

/** Mesa válida (id legible + label) dentro del consulado, 1..numMesas */
function resolverMesa(
  cons: ConsulateRow,
  num: number
): { mesaId: string | null; mesaLabel: string | null } {
  if (num < 1 || num > cons.numMesas) return { mesaId: null, mesaLabel: null };
  const m = cons.mesas.find((mm) => numeroDeMesa(mm.mesaNumber) === num);
  if (m) return { mesaId: m.id, mesaLabel: m.mesaNumber };
  return { mesaId: null, mesaLabel: null };
}

// ------------------------------------------------------------
// Cruce principal (puro y sincrónico)
// ------------------------------------------------------------

/**
 * Cruza el QR decodificado en cliente con la lectura VLM de la
 * imagen y la tabla real de consulados. Produce:
 *  · verificacion: qué leyó cada lado, si coinciden y las notas
 *  · asignacion:   consulado/mesa/tipo/página FINALES con origen
 */
export function verificarActaE14(params: VerificarActaParams): VerificarActarResult {
  const { analisis, consulados } = params;
  const notas: string[] = [];
  const qrTexto = (params.qrTexto ?? "").trim();

  // ---- a. Lado QR -------------------------------------------------
  const qrParseo: QrParseo | null = qrTexto ? parseQrE14(qrTexto, consulados) : null;
  if (qrParseo) notas.push(...qrParseo.notas);

  // QR cifrado (E-14 real): sin DIVIPOL legible pero con apariencia de
  // payload criptográfico → se usa como huella digital del documento
  // (deduplicación en la ingesta) y la ubicación se resuelve por VLM.
  if (qrTexto && !qrParseo?.consuladoId && /^[A-Za-z0-9+/=]{20,}$/.test(qrTexto)) {
    notas.push("QR CIFRADO · huella digital del documento (la ubicación se lee del encabezado con IA)");
  }

  const qrConsuladoId = qrParseo?.consuladoId ?? null;
  const qrCons =
    qrConsuladoId != null
      ? (consulados.find((c) => c.id === qrConsuladoId) ?? null)
      : null;
  const qrMesa = qrParseo?.mesa ?? null;
  const qrBarcode = qrParseo?.barcode15 ?? null;

  // ---- b. Lado VLM (imagen) ---------------------------------------
  const cod = codigosDe(analisis);
  const nombres = analisis.divipol;
  const vlmBarcode = analisis.barcode ? parseBarcode15(analisis.barcode) : null;

  // ---- c. Consulado VLM -------------------------------------------
  const vlmRes = resolverConsuladoVlm(cod, nombres, consulados);
  const vlm: LadoVlm = {
    cons: vlmRes.cons,
    metodo: vlmRes.metodo,
    mesaNum: 0,
    barcode: vlmBarcode,
  };

  // ---- d. Mesa VLM --------------------------------------------------
  let vlmMesaNum = numeroDeMesa(cod.mesa ?? "");
  if (!vlmMesaNum) vlmMesaNum = numeroDeMesa(nombres.mesa ?? "");
  vlm.mesaNum = vlmMesaNum;

  // ---- e. Asignación final (prioridad QR > QR+VLM > VLM) -----------
  let consFinal: ConsulateRow | null = null;
  let origen: AsignacionActa["origen"] = null;
  let confianza = 0;
  let mesaNum: number | null = null;

  if (qrCons && (qrParseo?.confianza ?? 0) >= 0.9) {
    // QR con DIVIPOL contiguo (confianza alta) → manda el QR
    consFinal = qrCons;
    origen = "QR";
    confianza = qrParseo?.confianza ?? 0.9;
    if (qrMesa != null) mesaNum = qrMesa;
    else if (vlm.cons?.id === qrCons.id && vlm.mesaNum >= 1) mesaNum = vlm.mesaNum;
  } else if (qrCons && vlm.cons && vlm.cons.id === qrCons.id) {
    // QR débil confirmado por el VLM con el MISMO consulado
    consFinal = qrCons;
    origen = "QR+VLM";
    confianza = Math.min(1, (qrParseo?.confianza ?? 0.75) + 0.1);
    mesaNum = qrMesa ?? (vlm.mesaNum >= 1 ? vlm.mesaNum : null);
  } else if (!qrCons && vlm.cons) {
    // Sin QR útil → la imagen manda
    consFinal = vlm.cons;
    origen = "VLM";
    confianza = vlm.metodo === "codigos" ? 0.85 : 0.7;
    mesaNum = vlm.mesaNum >= 1 ? vlm.mesaNum : null;
  } else if (qrCons) {
    // QR con confianza baja (< 0.9) sin confirmación VLM: el DIVIPOL
    // del QR (subsecuencia) sigue siendo la mejor evidencia disponible
    consFinal = qrCons;
    origen = "QR";
    confianza = qrParseo?.confianza ?? 0;
    if (qrMesa != null) mesaNum = qrMesa;
    notas.push("QR con confianza baja y sin confirmación del VLM");
  }

  // ---- f. Mesa final validada contra el consulado -------------------
  let mesaId: string | null = null;
  let mesaLabel: string | null = null;
  if (consFinal) {
    if (mesaNum != null) {
      const r = resolverMesa(consFinal, mesaNum);
      mesaId = r.mesaId;
      mesaLabel = r.mesaLabel;
      if (!mesaId) {
        notas.push(
          `Mesa ${mesaNum} fuera de rango o no encontrada en ${consFinal.code} (1..${consFinal.numMesas}) · se confirmará manualmente`
        );
      }
    } else {
      notas.push(`Puesto ${consFinal.code} identificado · mesa por confirmar`);
    }
  }

  // ---- g. ¿Coinciden QR y VLM en ubicación? --------------------------
  const vlmMesaONull = vlm.mesaNum >= 1 ? vlm.mesaNum : null;
  let coincidenUbicacion: boolean | null = null;
  if (qrConsuladoId && vlm.cons) {
    if (qrConsuladoId !== vlm.cons.id) {
      coincidenUbicacion = false;
      notas.push(
        `MISMATCH ubicación · QR ${qrConsuladoId} vs VLM ${vlm.cons.id}`
      );
    } else if (qrMesa != null && vlmMesaONull != null) {
      coincidenUbicacion = qrMesa === vlmMesaONull;
      notas.push(
        coincidenUbicacion
          ? `Cruce OK · QR y VLM coinciden en ${qrConsuladoId}${qrMesa != null ? ` · MESA ${qrMesa}` : ""}`
          : `MISMATCH mesa · QR MESA ${qrMesa} vs VLM MESA ${vlmMesaONull}`
      );
    } else {
      coincidenUbicacion = true;
      notas.push(`Cruce OK · QR y VLM coinciden en ${qrConsuladoId}`);
    }
  }

  // ---- h. ¿Coinciden QR y VLM en ejemplar/página? --------------------
  const vlmTipoRaw: string | null =
    analisis.tipoEjemplarLeido ?? vlmBarcode?.tipoEjemplar ?? null;
  const vlmPagina: number | null =
    analisis.paginaLeida ?? vlmBarcode?.pagina ?? null;
  let coincidenEjemplar: boolean | null = null;
  if (qrBarcode && (vlmTipoRaw || vlmPagina != null)) {
    let ok = true;
    if (vlmTipoRaw) {
      const mismos = normalizarNombre(vlmTipoRaw) === normalizarNombre(qrBarcode.tipoEjemplar);
      if (!mismos) {
        ok = false;
        notas.push(
          `MISMATCH ejemplar · QR ${qrBarcode.tipoEjemplar} vs imagen ${vlmTipoRaw}`
        );
      }
    }
    if (vlmPagina != null && vlmPagina !== qrBarcode.pagina) {
      ok = false;
      notas.push(
        `MISMATCH página · QR PÁG ${qrBarcode.pagina}/${qrBarcode.totalPaginas} vs imagen PÁG ${vlmPagina}`
      );
    }
    coincidenEjemplar = ok;
    if (ok) {
      notas.push(
        `Cruce OK · ejemplar ${qrBarcode.tipoEjemplar} · PÁG ${qrBarcode.pagina}/${qrBarcode.totalPaginas} confirmado por la imagen`
      );
    }
  }

  // ---- i. Ejemplar/página finales (barcode > VLM) --------------------
  const bcFinal: Barcode15 | null = qrBarcode ?? vlmBarcode ?? null;
  const tipoFinal: TipoEjemplar | null = bcFinal
    ? (normalizarTipo(bcFinal.tipoEjemplar) ?? normalizarTipo(analisis.tipoEjemplarLeido))
    : normalizarTipo(analisis.tipoEjemplarLeido);
  const paginaFinal: number | null = bcFinal
    ? bcFinal.pagina
    : (analisis.paginaLeida ?? null);
  const totalPaginasFinal: number | null = bcFinal
    ? bcFinal.totalPaginas
    : (analisis.totalPaginasLeidas ?? null);

  // ---- j/k. Notas y flags --------------------------------------------
  const vlmDivipolLeido = Boolean(soloDigitos(cod.municipio ?? "")) ||
    Boolean((nombres.consulado ?? "").trim());
  const partesLeidas = [cod.depto, cod.municipio, cod.zona, cod.puesto].filter(Boolean);
  if (partesLeidas.length > 0) {
    notas.push(
      `VLM leyó DIVIPOL ${partesLeidas.join("·")}${cod.mesa ? ` · MESA ${soloDigitos(cod.mesa)}` : ""}`
    );
  } else if (vlmDivipolLeido) {
    notas.push(
      `VLM leyó encabezado: ${[nombres.consulado, nombres.municipio, nombres.zona, nombres.puesto]
        .filter(Boolean)
        .join(" > ") || "(parcial)"}`
    );
  } else {
    notas.push("VLM no leyó DIVIPOL del encabezado");
  }

  if (vlm.cons) {
    notas.push(`VLM resuelve ${vlm.cons.id} (${vlm.metodo === "codigos" ? "códigos DIVIPOL" : "nombres del encabezado"})`);
  } else if (origen !== "QR" && origen !== "QR+VLM") {
    notas.push("VLM no resuelve consulado contra la tabla real");
  }

  if (origen) {
    notas.push(
      `Asignación por ${origen} → ${consFinal?.id ?? "?"}${mesaId ? ` · ${mesaLabel}` : " · mesa por confirmar"}`
    );
  } else {
    notas.push("Sin ubicación resoluble · requiere asignación manual");
  }

  const qrWire: QrParseoWire | null = qrParseo
    ? {
        texto: qrParseo.texto,
        barcode15: qrParseo.barcode15?.crudo ?? null,
        consuladoId: qrParseo.consuladoId,
        mesa: qrParseo.mesa,
        confianza: qrParseo.confianza,
        notas: qrParseo.notas,
      }
    : null;

  const verificacion: VerificacionActa = {
    qr: qrWire,
    qrDivipolOk: Boolean(qrParseo?.consuladoId),
    vlmDivipolLeido,
    coincidenUbicacion,
    coincidenEjemplar,
    mesaAsignada: mesaId,
    notas,
  };

  const asignacion: AsignacionActa = {
    consuladoId: consFinal?.id ?? null,
    mesaId,
    mesaLabel,
    tipoEjemplar: tipoFinal,
    pagina: paginaFinal,
    totalPaginas: totalPaginasFinal,
    origen,
    confianza: Math.round(confianza * 100) / 100,
  };

  return { verificacion, asignacion };
}
