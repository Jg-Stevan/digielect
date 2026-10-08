"use client";

// ============================================================
// DIGITALIZADOR E-14 — DOCUMENTO DEL ACTA (re-render de datos)
// Réplica del diseño Stitch "REVISIÓN DE ACTA": el acta E-14 se
// REDIBUJA como documento (papel blanco) con la información que
// el escaneo leyó en cada espacio del diseño:
//   · Encabezado REGISTRADURÍA NACIONAL + chip ACTA E-14
//   · Código de barras (render determinista) + código + PÁG X DE Y
//   · [ACTA ESCANEADA] la IMAGEN REAL digitalizada del pliego
//     (recorte automático + filtro B/N que viajó al servidor)
//   · DEP / MUN + ZONA / PUESTO / MESA
//   · Título de la contienda + casillas de votos por candidato
//     (+ votos informativos EN BLANCO / NULOS cuando se leyeron)
//   · Franja de firmas de jurados (línea + etiqueta)
// Honestidad (S-11): cada espacio muestra el DATO leído; lo no
// leído se muestra como "—" (nunca se inventan valores).
// ============================================================

import { cn } from "@/lib/utils";

export interface DatoResultadoActa {
  etiqueta: string;
  votos: number | null;
}

export interface DatosActaDocumento {
  /** Código mostrado bajo el barcode (ej. *E14-710009*) */
  codigoMostrado: string | null;
  /** Dígitos para dibujar el código de barras (barcode15 o código X) */
  digitosBarcode: string | null;
  pagina: number | null;
  totalPaginas: number | null;
  /** Encabezado DIVIPOL: "CONSULADOS" (depto 88 exterior) */
  dep: string | null;
  /** Municipio/país leído (ej. ROMA) */
  mun: string | null;
  zona: string | null;
  puesto: string | null;
  mesa: string | null;
  /** Título de la contienda en el cuerpo (ej. PRESIDENCIA…) */
  tituloCuerpo: string | null;
  resultados: DatoResultadoActa[];
  /** Votos informativos leídos (EN BLANCO / NULOS / NO MARCADOS) */
  informativos?: DatoResultadoActa[];
  firmasDetectadas: boolean | null;
  /** DELEGADOS | TRANSMISION — para la píldora inferior */
  tipoEjemplar: string | null;
}

/** Barras deterministas del código de barras (ancho 1-3 px por dígito) */
function barrasDe(digitos: string | null): { w: number; negro: boolean }[] {
  const src = (digitos ?? "").replace(/\D/g, "") || "000000000000000";
  const barras: { w: number; negro: boolean }[] = [];
  for (let i = 0; i < 46; i++) {
    const d = Number(src[i % src.length] ?? "0");
    barras.push({ w: 1 + (d % 3), negro: i % 2 === 0 });
  }
  return barras;
}

/** Trazo de firma (representa la PRESENCIA detectada, no un nombre) */
function TrazoFirma({ detectada }: { detectada: boolean }) {
  if (!detectada) return null;
  return (
    <svg
      viewBox="0 0 84 18"
      aria-hidden="true"
      className="h-4 w-[70px] text-zinc-700"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <path d="M3 13 C 12 2, 18 16, 26 9 S 40 2, 46 12 S 60 15, 68 7 S 78 5, 81 10" />
    </svg>
  );
}

export function ActaDocumento({
  datos,
  imagen,
}: {
  datos: DatosActaDocumento;
  /** [ACTA ESCANEADA] imagen REAL del pliego digitalizado (recorte + B/N)
   *  — la misma que viajó al servidor. Null = documento solo con datos. */
  imagen?: string | null;
}) {
  const barras = barrasDe(datos.digitosBarcode);
  const paginaTxt =
    datos.pagina != null ? String(datos.pagina).padStart(2, "0") : "—";
  const totalTxt =
    datos.totalPaginas != null ? String(datos.totalPaginas).padStart(2, "0") : "—";

  return (
    <article
      aria-label="Documento del acta E-14 con los datos leídos"
      className="relative mx-auto w-full max-w-[340px] overflow-hidden rounded-md bg-white text-black shadow-[0_18px_50px_-18px_rgba(0,230,118,0.35)]"
    >
      {/* ===== ENCABEZADO DEL FORMULARIO ===== */}
      <div className="flex items-center justify-between px-4 pb-1.5 pt-3">
        <h3 className="text-[11px] font-extrabold tracking-[0.08em] text-zinc-900">
          REGISTRADURÍA NACIONAL
        </h3>
        <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-zinc-600">
          ACTA E-14
        </span>
      </div>

      {/* Código de barras + código legible */}
      <div className="px-4">
        <div
          className="flex h-11 items-end gap-0 border-y border-zinc-300 py-1"
          role="img"
          aria-label="Código de barras del acta"
        >
          {barras.map((b, i) => (
            <span
              key={i}
              className={cn("h-full", b.negro ? "bg-zinc-900" : "bg-white")}
              style={{ width: `${b.w}px` }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between pb-1.5 pt-1">
          <span className="font-mono text-[9px] tracking-wide text-zinc-500">
            {datos.codigoMostrado ? `*E14-${datos.codigoMostrado}*` : "*E14*"}
          </span>
          <span className="font-mono text-[9px] tracking-wide text-zinc-500">
            PÁG {paginaTxt} DE {totalTxt}
          </span>
        </div>
      </div>

      <div className="border-t border-zinc-300" />

      {/* ===== [ACTA ESCANEADA] imagen real del pliego digitalizado ===== */}
      {imagen && (
        <figure className="px-4 pb-3 pt-3">
          <div className="relative overflow-hidden rounded-sm border border-zinc-300 bg-zinc-100">
            <img
              src={imagen}
              alt="Acta E-14 escaneada (imagen digitalizada enviada al servidor)"
              className="mx-auto max-h-[300px] w-full select-none object-contain"
              draggable={false}
            />
          </div>
          <figcaption className="flex items-center justify-between pt-1 font-mono text-[8px] tracking-wider text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-600" />
              ACTA ESCANEADA
            </span>
            <span>IMAGEN DIGITALIZADA · B/N</span>
          </figcaption>
        </figure>
      )}

      {imagen && <div className="border-t border-zinc-300" />}

      {/* ===== DIVIPOL ===== */}
      <div className="grid grid-cols-2 gap-x-2 px-4 py-2 font-mono text-[10px] font-bold tracking-wide text-zinc-800">
        <span>DEP: {datos.dep ?? "—"}</span>
        <span className="text-right">MUN: {datos.mun ?? "—"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 pb-2 font-mono text-[10px] font-bold tracking-wide text-zinc-800">
        <span>ZONA: {datos.zona ?? "—"}</span>
        <span>PUESTO: {datos.puesto ?? "—"}</span>
        <span>MESA: {datos.mesa ?? "—"}</span>
      </div>

      <div className="border-t border-zinc-300" />

      {/* ===== CUERPO: contienda + votos ===== */}
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-4 px-4 py-5",
          imagen ? "min-h-[120px]" : "min-h-[210px]"
        )}
      >
        <h4 className="text-center text-[13px] font-bold tracking-wide text-zinc-900">
          {datos.tituloCuerpo ?? "ACTA DE ESCRUTINIO"}
        </h4>
        {datos.resultados.length > 0 ? (
          <div className="grid w-full max-w-[300px] grid-cols-2 gap-2 sm:grid-cols-4">
            {datos.resultados.slice(0, 8).map((r, i) => (
              <div
                key={`${r.etiqueta}-${i}`}
                className="border border-zinc-400 px-2 py-2 text-center font-mono text-[10px] font-bold text-zinc-800"
              >
                {r.etiqueta} : {r.votos ?? "—"}
              </div>
            ))}
          </div>
        ) : (
          <p className="font-mono text-[10px] text-zinc-400">
            — SIN LECTURA DE RESULTADOS —
          </p>
        )}
        {/* Votos informativos leídos (EN BLANCO / NULOS / NO MARCADOS) */}
        {datos.informativos && datos.informativos.length > 0 && (
          <div className="flex w-full max-w-[300px] flex-wrap justify-center gap-2">
            {datos.informativos.map((r, i) => (
              <div
                key={`${r.etiqueta}-${i}`}
                className="rounded-full border border-dashed border-zinc-400 px-2.5 py-1 text-center font-mono text-[9px] font-bold text-zinc-600"
              >
                {r.etiqueta} : {r.votos ?? "—"}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Separador recortable + franja de firmas */}
      <div className="mx-4 border-t-2 border-dashed border-zinc-300" />
      <div className="flex items-end justify-around px-4 pb-3 pt-4">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex w-[92px] flex-col items-center">
            <TrazoFirma detectada={Boolean(datos.firmasDetectadas)} />
            <div className="mt-0.5 h-px w-full bg-zinc-500" />
            <span className="mt-1 font-mono text-[8px] tracking-wider text-zinc-500">
              JURADO {n}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

export default ActaDocumento;
