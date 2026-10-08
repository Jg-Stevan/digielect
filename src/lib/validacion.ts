import { NextResponse } from "next/server";
import { z } from "zod";

// ============================================================
// DIGIELECT · [OLA5 5.3] Validación Zod de TODOS los bodies
// Antes cada ruta hacía `(await req.json()) as T` — un cast que
// confía ciegamente en el cliente: cualquier campo faltante o
// con tipo incorrecto explotaba en runtime (500) o peor, se
// persistía. Aquí viven los schemas del wire de cada ruta
// mutante + el validador de imagen compartido.
// ============================================================

/**
 * [B-08 → OLA5] Límite de tamaño de la imagen de ingesta
 * (~8 MB decodificados). La PWA comprime a ~300 KB, pero el
 * servidor no debe aceptar payloads arbitrarios (RAM en cada
 * rebuild + costo VLM sin cota). Antes sólo /api/actas lo
 * aplicaba; /api/actas/analizar aceptaba cualquier tamaño.
 */
const LIMITE_IMAGEN_BYTES = 8 * 1024 * 1024;

type ValidacionImagen =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * Valida imagenBase64: data URL image/* (o base64 crudo),
 * charset base64 y límite de tamaño. Extraído de api/actas para
 * reutilizarse en /api/actas/analizar (misma regla, mismo límite).
 */
export function validarImagenBase64(crudo: string): ValidacionImagen {
  let b64 = crudo;
  if (crudo.startsWith("data:")) {
    const coma = crudo.indexOf(",");
    if (coma < 0) {
      return { ok: false, error: "imagenBase64: data URL sin coma", status: 400 };
    }
    const meta = crudo.slice(0, coma);
    const mime = meta.match(/^data:([^;,]+)[^,]*$/)?.[1] ?? "";
    if (!mime.startsWith("image/")) {
      return {
        ok: false,
        error: "imagenBase64 debe ser una imagen (data:image/…;base64,…)",
        status: 400,
      };
    }
    b64 = crudo.slice(coma + 1);
  }
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    return { ok: false, error: "imagenBase64 no es base64 válido", status: 400 };
  }
  const bytes = Math.floor((b64.length * 3) / 4);
  if (bytes > LIMITE_IMAGEN_BYTES) {
    return {
      ok: false,
      error: `imagenBase64 excede el límite de ~8 MB (${(bytes / 1048576).toFixed(1)} MB)`,
      status: 413,
    };
  }
  return { ok: true };
}

// ------------------------------------------------------------
// Schemas del wire
// ------------------------------------------------------------

export const LoginSchema = z.object({
  usuario: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

export const AnalizarSchema = z.object({
  imagenBase64: z.string().min(1),
  qrTexto: z.string().nullable().optional(),
});

/** Resultado de votación transcrito manualmente (modo contingencia). */
const ResultadoManualSchema = z.object({
  candidato: z.string().min(1).max(120),
  votos: z.number().int().min(0).max(1_000_000),
});

export const ActaUploadSchema = z.object({
  imagenBase64: z.string().min(1),
  // null del wire se normaliza a undefined (el contrato del tipo no
  // acepta null y el route trata ambos igual)
  barcode: z
    .string()
    .regex(/^\d{15}$/, "barcode debe ser de 15 dígitos")
    .nullish()
    .transform((v) => v ?? undefined),
  tipoEjemplar: z.enum(["DELEGADOS", "TRANSMISION"]),
  pagina: z.number().int().min(1).max(9),
  totalPaginas: z.number().int().min(1).max(9),
  modoManual: z.boolean().optional(),
  datosManuales: z
    .object({
      resultados: z.array(ResultadoManualSchema).max(20).optional(),
    })
    .optional(),
  envioEmergencia: z.boolean().optional(),
  scoreCliente: z.number().min(0).max(100).optional(),
  mesaIdRef: z
    .string()
    .max(64)
    .nullish()
    .transform((v) => v ?? undefined),
  /** Texto crudo del QR (huella de dedup) — formato validado en ruta. */
  qrTexto: z
    .string()
    .max(256)
    .nullish()
    .transform((v) => v ?? undefined),
  reemplazoDe: z.string().max(160).optional(),
  qualityScore: z.number().min(0).max(100).optional(),
});

export const ResolverSchema = z.object({
  anomaliaId: z.string().min(1).max(64),
  action: z.enum(["APROBADA", "RESCANEO_CONFIRMADO"]),
  justificacion: z.string().trim().min(10).max(2000),
});

export const BatchSchema = z.object({
  fileId: z.string().min(1).max(64),
  action: z.enum(["integrar", "remove"]),
});

export const NotificacionesSchema = z.object({
  consuladoId: z.string().min(1).max(64),
  mesaId: z.string().max(64).nullable().optional(),
  mesaLabel: z.string().min(1).max(120),
});

// ------------------------------------------------------------
// Helper de parseo
// ------------------------------------------------------------

/**
 * Parsea el body JSON de un request contra un schema Zod.
 * Devuelve los datos tipados o una respuesta 400 con el primer
 * error legible (campo + mensaje) — nunca un cast ciego.
 */
export async function parsearBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S
): Promise<
  | { ok: true; data: z.infer<S> }
  | { ok: false; response: NextResponse }
> {
  let crudo: unknown;
  try {
    crudo = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Body JSON inválido" },
        { status: 400 }
      ),
    };
  }
  const parsed = schema.safeParse(crudo);
  if (!parsed.success) {
    const primer = parsed.error.issues[0];
    const campo = primer?.path?.length ? `${primer.path.join(".")}: ` : "";
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: `Payload inválido — ${campo}${primer?.message ?? "estructura incorrecta"}`,
        },
        { status: 400 }
      ),
    };
  }
  return { ok: true, data: parsed.data };
}
