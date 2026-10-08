// ============================================================
// DIGIELECT · Parser de datos del acta E-14
// Estrategias de extracción robustas e independientes del
// formato exacto del QR impreso (la Registraduría lo publica
// como "matriz cifrada" y ha variado entre elecciones):
//   1. Barcode15 — 15 dígitos impresos bajo el código de barras:
//      [elección 2][kit 6][tipoEjemplar 1][versión 2][pág 2][total 2]
//   2. QR → corridas de dígitos: se busca un barcode15 válido
//      embebido y los códigos DIVIPOL (municipio·zona·puesto)
//      por coincidencia contra la tabla real de consulados.
//   3. Localización DIVIPOL tolerante: contigua o por
//      subsecuencia con huecos, + mesa al final.
// Módulo PURO (cliente y servidor): sin dependencias de DOM.
// [4.7] La validación estructural del barcode15 vive ahora en
// lib/reglas-e14.ts (fuente única); este módulo es una fachada
// que preserva la forma histórica Barcode15 | null.
// ============================================================

import type { ConsulateRow, TipoEjemplar } from "@/lib/types";
import { parseBarcode15Estructura } from "@/lib/reglas-e14";

// ------------------------------------------------------------
// Barcode15 (RF-1.2)
// ------------------------------------------------------------

export interface Barcode15 {
  /** Dígitos crudos, ej. "710003993010202" */
  crudo: string;
  /** Dígitos 1-2 · tipo de elección ("71" = Presidencia) */
  tipoEleccion: string;
  /** Dígitos 3-8 · kit secuencial del formulario */
  kit: string;
  /** Dígito 9 normalizado · 1=CLAVEROS, 2=DELEGADOS, 3=TRANSMISION */
  tipoEjemplar: TipoEjemplarBarcode;
  /** Dígito crudo del tipo (1/2/3) */
  tipoDigito: string;
  /** Dígitos 10-11 · versión de diagramación */
  version: string;
  /** Dígitos 12-13 · página actual (1-based) */
  pagina: number;
  /** Dígitos 14-15 · total de páginas */
  totalPaginas: number;
}

/**
 * Valor del dígito 9 del barcode. El E-14 exterior tipa sus
 * ejemplares como TipoEjemplar ("DELEGADOS" | "TRANSMISION");
 * el dígito 1 (CLAVEROS) solo existe en el E-14 interior, por lo
 * que el campo se tipa con esta unión local ampliada y quien
 * consuma el barcode debe normalizar antes de asignar
 * TipoEjemplar (ver verificar-acta.ts).
 */
export type TipoEjemplarBarcode = TipoEjemplar | "CLAVEROS";

/**
 * Valida y estructura un código de barras de 15 dígitos.
 * Devuelve null si la estructura no es consistente
 * (longitud, dígito de ejemplar 1-3, página ≤ total, total 1-4).
 * [4.7] Delega en parseBarcode15Estructura (lib/reglas-e14.ts,
 * fuente única compartida con el digitalizador). Acepta CLAVEROS
 * estructuralmente — la decisión de qué hacer con él pertenece al
 * llamador.
 */
export function parseBarcode15(input: string): Barcode15 | null {
  const r = parseBarcode15Estructura(input);
  if (!r.ok) return null;
  return {
    crudo: r.info.crudo,
    tipoEleccion: r.info.eleccion,
    kit: r.info.kit,
    tipoEjemplar: r.tipoEjemplar,
    tipoDigito: r.info.digitoTipo,
    version: r.info.version,
    pagina: r.info.pagina,
    totalPaginas: r.info.totalPaginas,
  };
}

// ------------------------------------------------------------
// Utilidades DIVIPOL
// ------------------------------------------------------------

/** Sólo dígitos de un string */
export function soloDigitos(s: string): string {
  return (s ?? "").replace(/\D/g, "");
}

/** Mesa numérica desde "Mesa 001" / "001" / "1" → 1 */
export function numeroDeMesa(mesaNumber: string): number {
  const n = Number(soloDigitos(mesaNumber));
  return isNaN(n) ? 0 : n;
}

/** Primera aparición (mínimo índice) de cualquiera de las variantes */
function buscarVariantes(s: string, variantes: string[], desde: number): number {
  let mejor = -1;
  for (const v of variantes) {
    const i = s.indexOf(v, desde);
    if (i >= 0 && (mejor < 0 || i < mejor)) mejor = i;
  }
  return mejor;
}

/**
 * Intenta leer un número de mesa (1..numMesas) del FINAL de una
 * corrida corta de dígitos (≤ 6). Acepta relleno variable:
 * "001"→1, "01"→1, "12"→12, "8"→8. Devuelve null si es ambiguo.
 */
function extraerMesaFinal(corrida: string, numMesas: number): number | null {
  if (!corrida || corrida.length > 6) return null;
  for (let len = 4; len >= 1; len--) {
    if (len > corrida.length) continue;
    const n = Number(corrida.slice(corrida.length - len));
    if (!isNaN(n) && n >= 1 && n <= numMesas) return n;
  }
  return null;
}

// ------------------------------------------------------------
// QR E-14
// ------------------------------------------------------------

/** Resultado del análisis del texto decodificado del QR */
export interface QrParseo {
  /** Texto crudo decodificado */
  texto: string;
  /** Barcode15 embebido en el QR (si se encontró) */
  barcode15: Barcode15 | null;
  /** Consulado localizado por códigos DIVIPOL */
  consuladoId: string | null;
  /** Mesa localizada (número 1..N) */
  mesa: number | null;
  /** Confianza 0-1 de la localización DIVIPOL */
  confianza: number;
  /** Notas de trazabilidad para el operador */
  notas: string[];
}

/**
 * Parsea el texto del QR de un acta E-14 contra la tabla real
 * de consulados (bootstrap). Tolerante al formato:
 *  · corrida contigua "muni+zona+puesto" (+mesa) → confianza 0.9+
 *  · subsecuencia con separadores ("88 495 010 02 000") → 0.75+
 *  · barcode15 válido embebido → estructura del ejemplar
 */
export function parseQrE14(texto: string, consulados: ConsulateRow[]): QrParseo {
  const notas: string[] = [];
  const bruto = (texto ?? "").trim();
  const parseo: QrParseo = {
    texto: bruto,
    barcode15: null,
    consuladoId: null,
    mesa: null,
    confianza: 0,
    notas,
  };
  if (!bruto) {
    notas.push("QR vacío");
    return parseo;
  }

  const digitosTotal = soloDigitos(bruto);

  // ---- 1. Barcode15 embebido: ventanas de 15 dígitos en cada corrida ----
  const corridas = bruto.match(/\d{4,}/g) ?? [digitosTotal].filter(Boolean);
  buscarBarcode: for (const corrida of corridas) {
    for (let i = 0; i + 15 <= corrida.length; i++) {
      const bc = parseBarcode15(corrida.slice(i, i + 15));
      if (bc) {
        parseo.barcode15 = bc;
        notas.push(
          `barcode15 embebido ${bc.crudo} · ${bc.tipoEjemplar} · PÁG ${bc.pagina}/${bc.totalPaginas}`
        );
        break buscarBarcode;
      }
    }
  }
  if (!parseo.barcode15) {
    const bc = parseBarcode15(bruto);
    if (bc) {
      parseo.barcode15 = bc;
      notas.push(`QR = barcode15 ${bc.crudo}`);
    }
  }

  // ---- 2. Localización DIVIPOL contra consulados reales ----
  let mejor: { consulado: ConsulateRow; mesa: number | null; confianza: number } | null = null;

  for (const cons of consulados) {
    const partes = (cons.code ?? "").split("-").map((p) => soloDigitos(p));
    if (partes.length < 3 || partes.some((p) => !p)) continue;
    const [muni, zona, puesto] = partes;
    const zonaVars = [...new Set([zona, zona.padStart(2, "0"), zona.padStart(3, "0")])].filter(Boolean);
    const puestoVars = [
      ...new Set([
        puesto,
        puesto.padStart(2, "0"),
        puesto.padStart(3, "0"),
        puesto.padStart(4, "0"),
      ]),
    ].filter(Boolean);

    // 2a. Contiguo: "495" + zona + puesto (+ mesa al final)
    for (const z of zonaVars) {
      for (const p of puestoVars) {
        const prefijo = muni + z + p;
        const idx = digitosTotal.indexOf(prefijo);
        if (idx < 0) continue;
        const resto = digitosTotal.slice(idx + prefijo.length);
        const mesa = extraerMesaFinal(resto, cons.numMesas);
        const conf = Math.min(1, 0.9 + (mesa != null ? 0.08 : 0));
        if (!mejor || conf > mejor.confianza) {
          mejor = { consulado: cons, mesa, confianza: conf };
          notas.push(
            `DIVIPOL contiguo ${cons.code}${mesa != null ? ` · MESA ${mesa}` : " · mesa por confirmar"}`
          );
        }
      }
    }

    // 2b. Subsecuencia: muni … zona … puesto en orden (con separadores)
    if (!mejor || (mejor.consulado.id !== cons.id && mejor.confianza < 0.8)) {
      const idxMuni = digitosTotal.indexOf(muni);
      if (idxMuni >= 0) {
        const idxZona = buscarVariantes(digitosTotal, zonaVars, idxMuni + muni.length);
        if (idxZona > idxMuni) {
          const idxPuesto = buscarVariantes(digitosTotal, puestoVars, idxZona + 2);
          if (idxPuesto > idxZona) {
            const resto = digitosTotal.slice(idxPuesto + 2);
            const mesa =
              extraerMesaFinal(resto, cons.numMesas) ??
              extraerMesaFinal(digitosTotal.slice(0, idxMuni), cons.numMesas);
            const conf = Math.min(1, 0.75 + (mesa != null ? 0.1 : 0));
            if (!mejor || conf > mejor.confianza) {
              mejor = { consulado: cons, mesa, confianza: conf };
              notas.push(
                `DIVIPOL subsecuencia ${cons.code}${mesa != null ? ` · MESA ${mesa}` : ""}`
              );
            }
          }
        }
      }
    }
  }

  if (mejor) {
    parseo.consuladoId = mejor.consulado.id;
    parseo.mesa = mejor.mesa;
    parseo.confianza = mejor.confianza;
    if (mejor.mesa == null) {
      notas.push("Puesto identificado · la mesa se confirmará con el VLM o manualmente");
    }
  } else {
    notas.push("Sin coincidencia DIVIPOL en el QR");
  }

  return parseo;
}

// ------------------------------------------------------------
// Verificación cruzada QR ↔ imagen (VLM)
// ------------------------------------------------------------

/** Códigos/nombres del encabezado del acta leídos por el VLM */
export interface DivipolLeido {
  departamento: string | null;
  municipio: string | null;
  zona: string | null;
  puesto: string | null;
  mesa: string | null;
}

/** Compara un texto leído por VLM contra un código DIVIPOL (tolerante) */
export function textoCoicideConCodigo(texto: string | null, codigo: string): boolean {
  if (!texto) return false;
  const t = soloDigitos(texto);
  const c = soloDigitos(codigo);
  if (!t || !c) return false;
  return t === c || t.endsWith(c) || c.endsWith(t);
}

/** Normaliza texto de VLM para comparar nombres de puesto/ciudad */
export function normalizarNombre(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
