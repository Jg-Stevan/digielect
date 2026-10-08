"use client";

// ============================================================
// DIGIELECT · Apartado de descarga del proyecto (entregable)
// Banner superior del inicio: sirve el .zip completo del
// repositorio generado con `git archive` (código fuente,
// prisma, public, docs, workflows) desde /api/descargar-proyecto.
// La carpeta download/ del sandbox NO es un estático público:
// esta es la única puerta de descarga del entregable.
//
// Oculto en el build estático de GitHub Pages (la ruta API no
// se exporta allí y el zip no forma parte del repo).
// ============================================================

import React, { useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  Download,
  FileArchive,
  Loader2,
  PackageOpen,
} from "lucide-react";
import { IS_STATIC_EXPORT } from "@/lib/env";

interface ZipInfo {
  nombre: string;
  commit: string | null;
  tamanoBytes: number;
  tamanoLegible: string;
  sha256: string;
  generado: string;
}

const FechaLegible: React.FC<{ iso: string }> = ({ iso }) => {
  const fecha = new Date(iso);
  const texto = Number.isNaN(fecha.getTime())
    ? iso
    : fecha.toLocaleDateString("es-CO", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
  return <>{texto}</>;
};

export const DescargarProyecto: React.FC = () => {
  const [info, setInfo] = useState<ZipInfo | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">(
    "cargando"
  );
  const [verEjecucion, setVerEjecucion] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const res = await fetch("/api/descargar-proyecto?info=1", {
          cache: "no-store",
        });
        const json = await res.json();
        if (!vigente) return;
        if (res.ok && json.ok) {
          setInfo(json as ZipInfo);
          setEstado("listo");
        } else {
          setEstado("error");
        }
      } catch {
        if (vigente) setEstado("error");
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  // En la exportación estática (GitHub Pages) la ruta no existe
  // y el entregable no aplica: no renderizar nada.
  if (IS_STATIC_EXPORT) return null;

  const copiarSha = async () => {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.sha256);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1600);
    } catch {
      // Portapapeles no disponible (permiso/entorno): sin feedback
    }
  };

  return (
    <section
      aria-labelledby="descargar-proyecto-title"
      className="border border-outline-variant border-l-2 border-l-primary bg-surface-container-low rounded-sm p-4 sm:p-5 flex flex-col gap-4"
    >
      {/* ---- Encabezado: título + acción ---- */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="w-11 h-11 shrink-0 border-2 border-primary flex items-center justify-center rounded-sm bg-primary/10"
            aria-hidden="true"
          >
            <FileArchive size={20} className="text-primary" />
          </div>
          <div className="min-w-0">
            <h2
              id="descargar-proyecto-title"
              className="font-headline-md text-headline-md text-on-surface"
            >
              DESCARGAR PROYECTO
            </h2>
            <p className="font-label-caps text-label-caps text-on-surface-variant">
              CÓDIGO FUENTE COMPLETO · ENTREGABLE .ZIP
            </p>
          </div>
        </div>

        {estado === "listo" && info ? (
          <a
            href="/api/descargar-proyecto"
            download={info.nombre}
            className="h-12 shrink-0 bg-primary text-primary-foreground font-headline-md text-headline-md uppercase
              flex items-center justify-center gap-2 rounded-sm transition-all hover:brightness-110 active:scale-[0.98]
              min-h-[44px] px-6"
          >
            <Download size={18} aria-hidden />
            DESCARGAR .ZIP · {info.tamanoLegible}
          </a>
        ) : estado === "cargando" ? (
          <span
            className="h-12 min-h-[44px] px-6 shrink-0 border border-outline-variant bg-surface-container text-on-surface-variant
              flex items-center justify-center gap-2 rounded-sm font-label-caps text-label-caps tracking-wider"
            aria-live="polite"
          >
            <Loader2 size={16} className="animate-spin" aria-hidden />
            VERIFICANDO EMPAQUETADO…
          </span>
        ) : null}
      </div>

      {/* ---- Detalles del artefacto ---- */}
      {estado === "listo" && info ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 font-stats-number text-[11px] text-on-surface-variant">
            <span className="text-on-surface truncate max-w-full sm:max-w-[340px]">
              {info.nombre}
            </span>
            <span aria-hidden className="text-outline-variant">
              ·
            </span>
            <span>{info.tamanoLegible}</span>
            <span aria-hidden className="text-outline-variant">
              ·
            </span>
            <span className="flex items-center gap-1.5">
              <FechaLegible iso={info.generado} />
              {info.commit && (
                <span className="text-primary/80">· commit {info.commit}</span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-label-caps text-[9px] text-on-surface-variant/70 tracking-wider shrink-0">
              SHA-256
            </span>
            <code className="font-stats-number text-[11px] text-on-surface-variant truncate flex-1 min-w-0">
              {info.sha256.slice(0, 32)}…
            </code>
            <button
              type="button"
              onClick={copiarSha}
              className="shrink-0 h-7 px-2 border border-outline-variant rounded-sm font-label-caps text-[9px]
                tracking-wider text-on-surface-variant hover:text-primary hover:border-primary/60 transition-colors
                flex items-center gap-1"
              aria-label="Copiar la suma de verificación SHA-256 completa"
            >
              {copiado ? (
                <>
                  <Check size={11} className="text-primary" aria-hidden />
                  COPIADO
                </>
              ) : (
                "COPIAR")
              }
            </button>
          </div>
        </div>
      ) : estado === "error" ? (
        <p
          role="alert"
          className="text-body-md text-error border-l-2 border-error pl-2"
        >
          El empaquetado del proyecto no está disponible en este servidor.
        </p>
      ) : null}

      {/* ---- Guía de ejecución (colapsable) ---- */}
      {estado === "listo" && (
        <div className="border border-outline-variant/60 bg-surface-container rounded-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setVerEjecucion((v) => !v)}
            aria-expanded={verEjecucion}
            aria-controls="descargar-ejecucion"
            className="w-full flex items-center justify-between gap-2 px-3 py-2 font-label-caps text-[10px]
              text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/40 transition-colors tracking-wider"
          >
            <span className="flex items-center gap-1.5">
              <PackageOpen size={12} aria-hidden />
              CÓMO EJECUTAR TRAS EXTRAER
            </span>
            <span
              className="text-on-surface-variant/70 transition-transform duration-200"
              style={{ transform: verEjecucion ? "rotate(90deg)" : "none" }}
              aria-hidden
            >
              <ChevronRight size={12} />
            </span>
          </button>
          {verEjecucion && (
            <div
              id="descargar-ejecucion"
              className="px-3 pb-3 pt-1 flex flex-col gap-2"
            >
              <p className="text-body-md text-on-surface-variant">
                El zip contiene solo archivos versionados (sin{" "}
                <code className="font-stats-number text-[12px]">node_modules</code>{" "}
                ni base de datos local: se regeneran con estos pasos.
              </p>
              <ol className="font-stats-number text-[12px] text-on-surface flex flex-col gap-1 list-decimal pl-5">
                <li>
                  bun install{" "}
                  <span className="text-on-surface-variant">
                    — dependencias del proyecto
                  </span>
                </li>
                <li>
                  bun run db:push && bun run db:seed{" "}
                  <span className="text-on-surface-variant">
                    — esquema + datos reales (949 puestos · 3.670 mesas)
                  </span>
                </li>
                <li>
                  bun run dev{" "}
                  <span className="text-on-surface-variant">
                    — panel en http://localhost:3000
                  </span>
                </li>
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
