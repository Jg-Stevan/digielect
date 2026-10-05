"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — Tipos y helpers compartidos
// Captura E-14 · Análisis IA · RN-01/02/03 · RF-1.1..RF-1.5
// ============================================================

import type {
  ActaAnalysis,
  ActaRegistro,
  ActaUploadPayload,
  ConsulateRow,
  MesaDetail,
  PageStatus,
  TipoEjemplar,
} from "@/lib/types";
import { withBasePath } from "@/lib/env";

// ------------------------------------------------------------
// Navegación y contexto del pliego en captura
// ------------------------------------------------------------

export type PwaScreen =
  | "control"
  | "captura"
  | "revision"
  | "exito"
  | "contingencia"
  | "resumen";

export interface CapturaContexto {
  mesa: MesaDetail;
  consulado: ConsulateRow;
  tipoEjemplar: TipoEjemplar;
  pagina: 1 | 2;
}

/** Payload de ingesta: alias semántico de ActaUploadPayload (incluye mesaIdRef legible) */
export type IngestaPayload = ActaUploadPayload;

export interface IngestaResponse {
  ok: boolean;
  acta?: ActaRegistro;
  analisis?: ActaAnalysis;
  decision?: {
    estado: "VALIDADO" | "ANOMALIA" | "RECHAZADO";
    motivo: string;
  };
  anomaliaId?: string | null;
  error?: string;
}

export interface AnalizarResponse {
  ok: boolean;
  analisis?: ActaAnalysis;
  error?: string;
}

export interface BootstrapJson {
  ok: boolean;
  /** Campo del wire: /api/bootstrap devuelve "consulados" */
  consulados?: ConsulateRow[];
  error?: string;
}

// ------------------------------------------------------------
// Estadísticas de la sesión del digitalizador
// ------------------------------------------------------------

export interface SesionStats {
  enviadas: number;
  aprobadas: number;
  advertencia: number;
  rechazos: number;
  delegadosEnviados: number;
  manualEnviados: number;
  /** Date.now() del arranque de la sesión */
  inicio: number;
}

export type OrigenEnvio = "AUTO" | "EMERGENCIA" | "MANUAL";

export interface EnvioHistorial {
  hora: string;
  mesa: string;
  tipo: TipoEjemplar;
  pagina: number;
  estado: "VALIDADO" | "ANOMALIA" | "RECHAZADO";
  origen: OrigenEnvio;
  score: string | null;
}

export interface ExitoState {
  estado: "VALIDADO" | "ANOMALIA";
  score: string | null;
  motivo: string;
  mesa: string;
  tipo: TipoEjemplar;
  pagina: number;
  origen: OrigenEnvio;
}

// ------------------------------------------------------------
// Reglas de negocio (lado cliente)
// ------------------------------------------------------------

/** Veredicto RN-02 tras el análisis de visión artificial */
export type Veredicto = "AUTO" | "ADVERTENCIA" | "RECHAZADO";

/**
 * RN-02 — Criterio de validación binario:
 *  · AUTO: score >= 9 y firmas detectadas → envío automático
 *  · RECHAZADO: score <= 5 → transmisión bloqueada
 *  · ADVERTENCIA: 6-8 (o score alto sin firmas) → reintentos / RN-03
 */
export function veredictoDe(a: ActaAnalysis): Veredicto {
  if (a.scoreCalidad >= 9 && a.firmasDetectadas) return "AUTO";
  if (a.scoreCalidad <= 5) return "RECHAZADO";
  return "ADVERTENCIA";
}

/** Banda de color del score: verde >=9 / amarillo 6-8 / rojo <=5 */
export function bandaScore(score: number): "verde" | "amarillo" | "rojo" {
  if (score >= 9) return "verde";
  if (score >= 6) return "amarillo";
  return "rojo";
}

// ------------------------------------------------------------
// Mesas y páginas
// ------------------------------------------------------------

export type PaginaVisual = "ok" | "pendiente" | "rescaneo";

export function estadoPagina(s: PageStatus): PaginaVisual {
  if (s === true) return "ok";
  if (s === "rescaneo") return "rescaneo";
  return "pendiente";
}

/** Siguiente página pendiente del ejemplar (rescaneo cuenta como pendiente) */
export function siguientePagina(mesa: MesaDetail, tipo: TipoEjemplar): 1 | 2 {
  const p1 = tipo === "DELEGADOS" ? mesa.delegados.p1 : mesa.transmision.p1;
  const p2 = tipo === "DELEGADOS" ? mesa.delegados.p2 : mesa.transmision.p2;
  if (p1 !== true) return 1;
  if (p2 !== true) return 2;
  return 1;
}

/** Clave del pliego para el contador de reintentos (RN-03) */
export function pliegoKey(
  mesaId: string,
  tipo: TipoEjemplar,
  pagina: number
): string {
  return `${mesaId}|${tipo}|${pagina}`;
}

// ------------------------------------------------------------
// Relojes (Italia / Colombia)
// ------------------------------------------------------------

export function horaEnZona(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).format(d);
}

// ------------------------------------------------------------
// Imagen: lectura de archivo + compresión en canvas (RF-1.1)
// Máx. lado 1400px · JPEG 0.85 — perfil hardware restringido
// ------------------------------------------------------------

export async function archivoADataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export function comprimirImagen(
  dataUrl: string,
  maxLado = 1400,
  calidad = 0.85
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * escala));
        const h = Math.max(1, Math.round(img.height * escala));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", calidad));
      } catch {
        reject(new Error("Error comprimiendo la imagen en canvas"));
      }
    };
    img.onerror = () => reject(new Error("Imagen no válida"));
    img.src = dataUrl;
  });
}

// ------------------------------------------------------------
// Actas E-14 de ejemplo servidas desde /actas-ejemplo
// (permiten probar el flujo real de visión sin cámara)
// ------------------------------------------------------------

export const ACTAS_EJEMPLO: string[] = [
  "E14_XXX_X_88_495_010_02_000_X_XXX",
  "E14_XXX_X_88_335_005_02_000_X_XXX",
  "E14_XXX_X_88_355_003_08_000_X_XXX",
  "E14_XXX_X_88_335_005_81_000_X_XXX",
];

export function urlActaEjemplo(base: string, pagina: 1 | 2): string {
  return withBasePath(`/actas-ejemplo/${base}-${pagina}.jpg`);
}

/** Descarga una acta de ejemplo del servidor y la comprime en canvas */
export async function cargarActaEjemplo(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo descargar el acta de ejemplo");
  const blob = await res.blob();
  const dataUrl = await archivoADataUrl(
    blob instanceof File
      ? blob
      : new File([blob], "acta-ejemplo.jpg", { type: blob.type })
  );
  return comprimirImagen(dataUrl);
}

// ------------------------------------------------------------
// Flujo E-14 con verificación QR ↔ imagen (nuevo)
// ------------------------------------------------------------

/** Texto del QR decodificado de la captura (null si no se pudo) */
export type QrTexto = string | null;

/** Línea de ubicación tipo diseño: "ITALIA > ZONA 10 > PUESTO 02 > MESA 001 > TRANSMISIÓN > PAG 1 DE 2" */
export function ubicacionLinea(ctx: CapturaContexto): string {
  return [
    ctx.consulado.pais,
    `ZONA ${ctx.consulado.zona}`,
    `PUESTO ${ctx.consulado.code.split("-")[2] ?? ctx.consulado.puesto.slice(0, 2)}`,
    ctx.mesa.mesaNumber.toUpperCase(),
    ctx.tipoEjemplar === "TRANSMISION" ? "TRANSMISIÓN" : "DELEGADOS",
    `PAG ${ctx.pagina} DE 2`,
  ].join(" > ");
}

/** Rota una imagen dataURL 90° en sentido horario (canvas) */
export function rotarImagen90(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.height;
        canvas.height = img.width;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
