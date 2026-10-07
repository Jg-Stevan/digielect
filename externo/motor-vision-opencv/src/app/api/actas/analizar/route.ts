import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import type { AnalisisVLM } from "@/lib/digitalizador/types";

// ============================================================
// POST /api/actas/analizar
// Análisis de la imagen del acta E-14 con VLM (GLM-4.6V).
// No persiste nada: devuelve el análisis para la revisión del operador.
// ============================================================

const PROMPT_ANALISIS = `Analiza esta fotografía de un acta electoral E-14 (jurado de votación en el exterior).
Extrae la información visible con máxima precisión y responde EXCLUSIVAMENTE un objeto JSON válido (sin markdown, sin explicaciones) con esta estructura:

{
  "barcode": string | null,            // código de barras numérico de 15 dígitos del encabezado, si es legible
  "tipoEjemplar": string | null,       // "DELEGADOS" o "TRANSMISION" según lo leído en el encabezado (ejemplar para delegados / para transmisión)
  "paginaLeida": number | null,        // número de página del ejemplar (p.ej. 1)
  "totalPaginasLeidas": number | null, // total de páginas del ejemplar (p.ej. 2)
  "divipol": {                         // ubicación impresa en el encabezado
    "pais": string | null,
    "ciudad": string | null,
    "zona": string | null,
    "puesto": string | null,
    "mesa": string | null              // número de mesa
  },
  "firmasDetectadas": boolean | null,  // ¿se observan firmas de los jurados en la zona de constancias?
  "scoreCalidad": number,              // calidad fotográfica del documento 0-10 (legibilidad, enfoque, iluminación)
  "nivelacion": {
    "ciudadanosHabiles": number | null,
    "sobresUrna": number | null,
    "testigos": number | null
  },
  "resultados": [                      // votos marcados por candidatura/party list (página de votación)
    { "candidato": string, "votos": number | null }
  ],
  "votosInformativos": [
    { "concepto": string, "votos": number | null }   // p.ej. BLANCOS, NULOS, NO MARCADOS
  ],
  "problemas": [string],               // problemas visibles: "borrosa", "poca luz", "recorte incompleto", "reflejos", "sin firmas", etc. [] si no hay
  "observaciones": string | null,      // nota breve
  "confianza": number                  // confianza global del análisis 0-1
}

Reglas: si un dato no es legible usa null. No inventes números. Si la imagen no parece un acta E-14, pon "problemas": ["no es un acta E-14"] y confianza baja.`;

interface MensajeVision {
  role: "user";
  content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;
}

function extraerJSON(texto: string): AnalisisVLM | null {
  const limpio = texto
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio === -1 || fin === -1) return null;
  try {
    return JSON.parse(limpio.slice(inicio, fin + 1)) as AnalisisVLM;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { imagenDataUrl?: string; qrTexto?: string };
    const imagen = body.imagenDataUrl;
    if (!imagen || typeof imagen !== "string" || !imagen.startsWith("data:image")) {
      return NextResponse.json({ error: "Imagen inválida" }, { status: 400 });
    }
    if (imagen.length > 9_000_000) {
      return NextResponse.json({ error: "Imagen demasiado grande (máx. ~8 MB)" }, { status: 413 });
    }

    const zai = await ZAI.create();
    const mensajes: MensajeVision[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              PROMPT_ANALISIS +
              (body.qrTexto
                ? `\n\nNota: el lector de QR del dispositivo leyó este texto en la captura: "${body.qrTexto}". Úsalo como pista (puede contener el código de barras o la ubicación).`
                : ""),
          },
          { type: "image_url", image_url: { url: imagen } },
        ],
      },
    ];

    const completion = await zai.chat.completions.createVision({
      model: "glm-4.6v",
      messages: mensajes,
      thinking: { type: "disabled" },
    });

    const texto = completion.choices[0]?.message?.content ?? "";
    const analisis = extraerJSON(texto);
    if (!analisis) {
      return NextResponse.json(
        { ok: false, error: "El análisis no devolvió un resultado interpretable" },
        { status: 502 }
      );
    }

    // Pista del QR: si el modelo no leyó barcode pero el QR trae 15 dígitos, úselos
    if (!analisis.barcode && body.qrTexto) {
      const corrida = (body.qrTexto.match(/\d{15}/g) ?? [])[0];
      if (corrida) analisis.barcode = corrida;
    }

    return NextResponse.json({ ok: true, analisis });
  } catch (e) {
    console.error("analizar error", e);
    const msg = e instanceof Error ? e.message : "Fallo del análisis";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
