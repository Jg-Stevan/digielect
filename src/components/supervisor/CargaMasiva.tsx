"use client";

import React, { useRef, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  CirclePlus,
  CloudUpload,
  Copy,
  FileImage,
  FileText,
  FileType,
  FolderArchive,
  FolderOpen,
  Info,
  ListChecks,
  ListTodo,
  Loader2,
  Lock,
  RefreshCw,
  ScanBarcode,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import type { OcrStatus, QueueFileItem } from "@/lib/types";

interface CargaMasivaProps {
  queueFiles: QueueFileItem[];
  onIntegrate: (fileId: string) => void;
  onRemoveFile: (id: string) => void;
}

interface ScanFeedback {
  count: number;
  names: string[];
  totalLabel: string;
}

/** Metadatos visuales por estado OCR (RF-2.4) */
const OCR_STATUS_META: Record<
  OcrStatus,
  {
    label: string;
    icon: React.ElementType;
    classes: string;
    iconClasses: string;
  }
> = {
  RECONOCIDO: {
    label: "RECONOCIDO",
    icon: CheckCircle2,
    classes: "bg-primary/10 border-primary/30 text-primary",
    iconClasses: "text-primary",
  },
  DUPLICADO: {
    label: "DUPLICADO (YA EXISTE)",
    icon: Copy,
    classes: "bg-warning/10 border-warning/40 text-warning",
    iconClasses: "text-warning",
  },
  RESUELVE_ALERTA: {
    label: "RESUELVE ALERTA",
    icon: Wrench,
    classes: "bg-teal-400/10 border-teal-400/40 text-teal-300",
    iconClasses: "text-teal-300",
  },
  NUEVO_REGISTRO: {
    label: "NUEVO REGISTRO",
    icon: CirclePlus,
    classes: "bg-primary/10 border-primary/30 text-primary-fixed",
    iconClasses: "text-primary-fixed",
  },
  MANUAL_REQUERIDA: {
    label: "MANUAL REQUERIDA",
    icon: AlertTriangle,
    classes: "bg-orange-500/10 border-orange-500/40 text-orange-400",
    iconClasses: "text-orange-400",
  },
};

/** Icono según extensión del archivo */
function iconPorExtension(ext: string): React.ElementType {
  const e = ext.toUpperCase();
  if (e === "JPG" || e === "JPEG" || e === "PNG") return FileImage;
  if (e === "PDF") return FileType;
  if (e === "ZIP") return FolderArchive;
  return FileText;
}

function formatBytes(total: number): string {
  if (total < 1024) return `${total} B`;
  if (total < 1024 * 1024) return `${(total / 1024).toFixed(1)} KB`;
  return `${(total / (1024 * 1024)).toFixed(1)} MB`;
}

export const CargaMasiva: React.FC<CargaMasivaProps> = ({
  queueFiles,
  onIntegrate,
  onRemoveFile,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null);

  /** Simula el escaneo local de archivos (RN: no se sube nada al servidor) */
  const simulateScan = (files: File[]) => {
    if (files.length === 0) return;
    setScanFeedback(null);
    setIsScanning(true);
    window.setTimeout(() => {
      setIsScanning(false);
      setScanFeedback({
        count: files.length,
        names: files.map((f) => f.name),
        totalLabel: formatBytes(files.reduce((acc, f) => acc + f.size, 0)),
      });
    }, 1500);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    simulateScan(Array.from(e.dataTransfer.files));
  };

  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    simulateScan(Array.from(e.target.files ?? []));
    // Permite re-seleccionar los mismos archivos luego
    e.target.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpenFilePicker();
    }
  };

  const reconocidos = queueFiles.filter(
    (f) => f.ocrStatus === "RECONOCIDO" || f.ocrStatus === "NUEVO_REGISTRO"
  ).length;
  const manuales = queueFiles.filter(
    (f) => f.ocrStatus === "MANUAL_REQUERIDA"
  ).length;
  const alertas = queueFiles.filter(
    (f) => f.ocrStatus === "RESUELVE_ALERTA"
  ).length;
  const duplicados = queueFiles.filter(
    (f) => f.ocrStatus === "DUPLICADO"
  ).length;
  const integrables = queueFiles.length - duplicados;

  const integrablePct =
    queueFiles.length > 0
      ? Math.round((integrables / queueFiles.length) * 100)
      : 0;

  return (
    <div className="flex flex-col w-full max-w-[1440px] mx-auto gap-6 pb-8">
      {/* ============ HEADER DEL MÓDULO ============ */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-headline-lg text-headline-lg text-primary uppercase tracking-wider">
            Módulo de Carga Masiva — Batch
          </h1>
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-warning/40 bg-warning/10 text-warning font-label-caps text-[10px] uppercase tracking-wider"
            title="Módulo exclusivo para el rol de Supervisor de Digitalización"
          >
            <Lock size={11} aria-hidden="true" />
            Solo Supervisor de Digitalización
          </span>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
          Módulo de contingencia para la ingesta por lotes de actas E-14 físicas
          con reconocimiento automático de ubicación vía código de barras 15D.
          Procesamiento OCR antes de la integración al Monitor Global.
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-label-caps text-[10px] uppercase tracking-wider text-on-surface-variant">
          <span className="flex items-center gap-1.5">
            <Info size={12} className="text-primary" aria-hidden="true" />
            Límite por lote: 500 MB (aprox. 200 actas en alta resolución)
          </span>
          <span className="flex items-center gap-1.5">
            <ScanBarcode size={12} className="text-primary" aria-hidden="true" />
            Formatos: ZIP · PDF · JPG · PNG
          </span>
        </div>
      </header>

      {/* ============ ZONA DROP + ESTADO OCR ============ */}
      <div className="grid grid-cols-12 gap-4 lg:gap-6">
        {/* Zona de arrastre (simulada, sin subida real) */}
        <section className="col-span-12 xl:col-span-8 bg-surface-container border border-outline-variant/40 rounded-sm p-4 relative overflow-hidden group">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            accept=".zip,.pdf,.jpg,.jpeg,.png"
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
          <div
            role="button"
            tabIndex={0}
            aria-label="Zona de carga de archivos de actas E-14: arrastra y suelta o presiona Enter para explorar"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleOpenFilePicker}
            onKeyDown={handleKeyDown}
            className={`w-full rounded-sm border-2 border-dashed transition-all flex flex-col items-center justify-center p-8 sm:p-10 cursor-pointer outline-none focus-visible:border-primary ${
              isDragging
                ? "border-primary bg-primary/10"
                : "border-primary/40 group-hover:border-primary bg-surface-container-lowest/50 group-hover:bg-surface-container-lowest"
            }`}
          >
            {isScanning ? (
              <>
                <Loader2
                  size={44}
                  className="text-primary mb-3 animate-spin"
                  aria-hidden="true"
                />
                <span className="font-headline-md text-headline-md text-on-surface mb-1 text-center">
                  Escaneando archivos…
                </span>
                <span className="font-body-md text-body-md text-on-surface-variant text-center">
                  Validando firmas digitales y calculando hash de lote
                </span>
                <div className="w-full max-w-sm h-1.5 bg-surface-container-high rounded-full overflow-hidden mt-4">
                  <div
                    className="h-full bg-primary rounded-full shadow-[0_0_8px_rgba(0,200,83,0.6)]"
                    style={{ width: "65%" }}
                  />
                </div>
              </>
            ) : scanFeedback ? (
              <>
                <CheckCircle2
                  size={40}
                  className="text-primary mb-3"
                  aria-hidden="true"
                />
                <span className="font-headline-md text-headline-md text-on-surface mb-1 text-center">
                  Escaneo completado · {scanFeedback.count} archivo
                  {scanFeedback.count === 1 ? "" : "s"} (
                  {scanFeedback.totalLabel})
                </span>
                <ul className="mt-3 w-full max-w-sm max-h-24 overflow-y-auto flex flex-col gap-1">
                  {scanFeedback.names.map((name) => (
                    <li
                      key={name}
                      className="font-stats-number text-[11px] text-on-surface-variant bg-surface-container-lowest border border-outline-variant/30 rounded-sm px-2 py-1 truncate"
                      title={name}
                    >
                      {name}
                    </li>
                  ))}
                </ul>
                <span className="mt-3 flex items-center gap-1.5 font-body-md text-[10px] uppercase tracking-wider text-on-surface-variant">
                  <Info size={12} aria-hidden="true" />
                  Vista previa local — los archivos no se suben al servidor
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setScanFeedback(null);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-outline-variant/50 text-on-surface-variant hover:text-on-surface hover:border-on-surface-variant/60 transition-colors font-label-caps text-[10px] uppercase tracking-wider"
                  aria-label="Limpiar vista previa de archivos escaneados"
                >
                  <X size={12} aria-hidden="true" />
                  Limpiar vista previa
                </button>
              </>
            ) : (
              <>
                <CloudUpload
                  size={44}
                  className={`text-primary mb-3 transition-transform ${
                    isDragging ? "scale-125" : "group-hover:-translate-y-1"
                  }`}
                  aria-hidden="true"
                />
                <span className="font-headline-md text-headline-md text-on-surface mb-1 text-center">
                  Arrastra y suelta aquí los archivos de actas E-14
                </span>
                <span className="font-body-md text-[11px] text-on-surface-variant mb-5 uppercase tracking-wider text-center">
                  Formatos soportados: ZIP, PDF, JPG, PNG
                </span>
                <span className="inline-flex items-center gap-2 bg-primary text-on-primary px-6 py-2 rounded-sm font-label-caps text-label-caps uppercase tracking-wider hover:bg-primary-fixed transition-colors">
                  <FolderOpen size={14} aria-hidden="true" />
                  Explorar archivos
                </span>
                <div className="mt-5 flex items-center gap-2 text-on-surface-variant">
                  <Info size={13} aria-hidden="true" />
                  <span className="font-body-md text-[10px] uppercase">
                    Lotes de hasta 500 MB (aprox. 200 actas en alta resolución)
                  </span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Estado del servidor OCR */}
        <aside
          className="col-span-12 xl:col-span-4 bg-surface-container border border-outline-variant/40 rounded-sm p-5 flex flex-col"
          aria-label="Estado del servidor OCR"
        >
          <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-4 border-b border-outline-variant/40 pb-2">
            Estado del Servidor OCR
          </h3>
          <div className="flex-1 flex flex-col justify-center gap-4">
            <div className="flex justify-between items-center bg-surface-container-lowest p-3 rounded-sm border border-outline-variant/30">
              <div className="flex items-center gap-3">
                <BrainCircuit
                  size={22}
                  className="text-secondary-fixed-dim"
                  aria-hidden="true"
                />
                <span className="font-body-lg text-body-lg text-on-surface font-semibold">
                  Motor Neuronal C-4
                </span>
              </div>
              <div className="flex items-center gap-2 bg-primary/10 px-2 py-1 rounded-full border border-primary/20">
                <span className="w-1.5 h-1.5 rounded-full bg-primary pulse-dot" />
                <span className="font-body-md text-[10px] text-primary uppercase font-bold">
                  Activo
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-body-md text-body-md text-on-surface-variant">
                <span>Capacidad de cola (MB/s)</span>
                <span className="font-stats-number text-[12px] text-on-surface">
                  850 / 1000
                </span>
              </div>
              <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full shadow-[0_0_8px_rgba(0,200,83,0.6)]"
                  style={{ width: "85%" }}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-body-md text-body-md text-on-surface-variant">
                <span>Confianza media OCR actual</span>
                <span className="font-stats-number text-[12px] text-primary font-bold">
                  98.4%
                </span>
              </div>
              <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: "98.4%" }}
                />
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* ============ TABLA DE COLA DE PROCESAMIENTO ============ */}
      <section className="flex flex-col bg-surface-container border border-outline-variant/40 rounded-sm overflow-hidden">
        {/* Toolbar superior */}
        <div className="p-4 bg-surface-container-high border-b border-outline-variant/40 flex flex-wrap justify-between items-center gap-3">
          <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2 uppercase">
            <ListTodo
              size={18}
              className="text-secondary-fixed-dim"
              aria-hidden="true"
            />
            Cola de Procesamiento
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-body-md text-[11px]">
            <span className="flex items-center gap-1.5 text-on-surface-variant">
              <span className="w-2 h-2 rounded-sm bg-primary" aria-hidden="true" />
              <span className="font-stats-number">Reconocidos ({reconocidos})</span>
            </span>
            <span className="flex items-center gap-1.5 text-on-surface-variant">
              <span
                className="w-2 h-2 rounded-sm bg-warning"
                aria-hidden="true"
              />
              <span className="font-stats-number">Manual ({manuales})</span>
            </span>
            <span className="flex items-center gap-1.5 text-on-surface-variant">
              <span
                className="w-2 h-2 rounded-sm bg-teal-400"
                aria-hidden="true"
              />
              <span className="font-stats-number">Alertas ({alertas})</span>
            </span>
            <span className="flex items-center gap-1.5 text-on-surface-variant">
              <span
                className="w-2 h-2 rounded-sm bg-danger"
                aria-hidden="true"
              />
              <span className="font-stats-number">Duplicados ({duplicados})</span>
            </span>
          </div>
        </div>

        {/* Filas */}
        {queueFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-on-surface-variant">
            <ListChecks size={36} className="text-on-surface-variant/50" aria-hidden="true" />
            <p className="font-label-caps text-label-caps uppercase tracking-wider">
              No hay archivos en la cola de procesamiento
            </p>
            <p className="font-body-md text-body-md">
              Arrastra un lote de actas E-14 para iniciar el análisis OCR.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-surface-container-highest border-b border-outline-variant/40">
                <tr>
                  <th
                    scope="col"
                    className="p-3 font-label-caps text-label-caps text-on-surface-variant uppercase w-12 text-center"
                  >
                    #
                  </th>
                  <th
                    scope="col"
                    className="p-3 font-label-caps text-label-caps text-on-surface-variant uppercase w-1/4"
                  >
                    Archivo / Vista Previa
                  </th>
                  <th
                    scope="col"
                    className="p-3 font-label-caps text-label-caps text-on-surface-variant uppercase w-1/6"
                  >
                    Cód. Barras Detección
                  </th>
                  <th
                    scope="col"
                    className="p-3 font-label-caps text-label-caps text-on-surface-variant uppercase w-1/4"
                  >
                    Ubicación Estructural Mapeada
                  </th>
                  <th
                    scope="col"
                    className="p-3 font-label-caps text-label-caps text-on-surface-variant uppercase w-[170px]"
                  >
                    Estado OCR
                  </th>
                  <th
                    scope="col"
                    className="p-3 font-label-caps text-label-caps text-on-surface-variant uppercase text-right min-w-[220px]"
                  >
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {queueFiles.map((file, idx) => {
                  const meta = OCR_STATUS_META[file.ocrStatus];
                  const StatusIcon = meta.icon;
                  const IconoArchivo = iconPorExtension(file.ext);
                  const esDuplicado = file.ocrStatus === "DUPLICADO";
                  return (
                    <tr
                      key={file.id}
                      className="hover:bg-surface-container-highest transition-colors bg-surface-container"
                    >
                      <td className="p-3 text-center text-on-surface-variant font-stats-number text-[11px]">
                        {String(idx + 1).padStart(2, "0")}
                      </td>

                      {/* Archivo */}
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-14 bg-surface-container-lowest rounded-sm border border-outline-variant/30 flex items-center justify-center shrink-0">
                            <IconoArchivo
                              size={18}
                              className="text-outline"
                              aria-hidden="true"
                            />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span
                              className="font-stats-number text-[12px] truncate text-on-surface font-semibold"
                              title={file.filename}
                            >
                              {file.filename}
                            </span>
                            <span className="text-[10px] text-on-surface-variant font-stats-number">
                              {file.size} · {file.ext}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Código de barras */}
                      <td className="p-3 font-stats-number text-[12px] text-secondary-fixed-dim">
                        <div className="flex items-center gap-1.5">
                          <ScanBarcode size={15} aria-hidden="true" />
                          <span>{file.barcode}</span>
                        </div>
                      </td>

                      {/* Ubicación */}
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2 text-on-surface min-w-0">
                            <span className="px-1.5 py-0.5 bg-surface-container-lowest rounded-sm text-[9px] font-label-caps uppercase border border-outline-variant/30 shrink-0">
                              EXT
                            </span>
                            <span
                              className="truncate text-[12px] font-medium"
                              title={file.location}
                            >
                              {file.location}
                            </span>
                          </div>
                          {file.details && (
                            <span className="text-[10px] text-on-surface-variant mt-0.5">
                              {file.details}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Estado OCR */}
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <div
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border w-fit ${meta.classes}`}
                          >
                            <StatusIcon size={13} aria-hidden="true" />
                            <span className="font-label-caps text-[9px] uppercase font-bold tracking-wider">
                              {file.ocrStatus === "RECONOCIDO"
                                ? `Reconocido (${file.ocrConfidence ?? 99}%)`
                                : meta.label}
                            </span>
                          </div>
                          {esDuplicado && (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-surface-container-lowest border border-outline-variant/30 w-fit">
                              <Lock
                                size={12}
                                className="text-on-surface-variant"
                                aria-hidden="true"
                              />
                              <span className="font-label-caps text-[9px] text-on-surface-variant uppercase">
                                Omitido
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Acciones */}
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onIntegrate(file.id)}
                            disabled={esDuplicado}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm font-label-caps text-[10px] uppercase tracking-wider transition-colors ${
                              esDuplicado
                                ? "bg-surface-container-highest text-on-surface-variant/50 border border-outline-variant/30 cursor-not-allowed"
                                : "bg-primary text-on-primary hover:bg-primary-fixed font-bold"
                            }`}
                            aria-label={`Integrar ${file.filename} al sistema${esDuplicado ? " (bloqueado: duplicado)" : ""}`}
                            title={
                              esDuplicado
                                ? "Bloqueado: archivo duplicado ya integrado"
                                : "Integrar al Monitor Global"
                            }
                          >
                            <ListChecks size={12} aria-hidden="true" />
                            Integrar al sistema
                          </button>
                          <button
                            type="button"
                            onClick={() => onRemoveFile(file.id)}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-sm border border-danger/40 text-danger hover:bg-danger/10 transition-colors"
                            aria-label={`Eliminar ${file.filename} del lote`}
                            title="Eliminar del lote"
                          >
                            <Trash2 size={13} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer del lote */}
        <div className="p-4 bg-surface-container-highest border-t border-outline-variant/40 flex flex-col gap-3">
          <div className="flex flex-wrap justify-between items-center gap-2 text-[11px] text-on-surface-variant">
            <span className="flex items-center gap-1.5">
              <RefreshCw
                size={12}
                className={`${isScanning ? "animate-spin text-primary" : "text-primary"}`}
                aria-hidden="true"
              />
              {isScanning
                ? "Analizando lote…"
                : `Mostrando ${queueFiles.length} archivo${
                    queueFiles.length === 1 ? "" : "s"
                  } del lote actual`}
            </span>
            <span className="font-stats-number">
              Integrables {integrables} de {queueFiles.length} —{" "}
              {integrablePct}%
            </span>
          </div>
          <div
            className="w-full h-2 bg-surface-container-lowest rounded-full overflow-hidden flex"
            role="progressbar"
            aria-valuenow={integrablePct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso de integración del lote"
          >
            <div
              className="h-full bg-primary transition-all duration-500 ease-out shadow-[0_0_8px_rgba(0,200,83,0.8)]"
              style={{ width: `${integrablePct}%` }}
              title="Integrables"
            />
            <div
              className="h-full bg-warning transition-all duration-500 ease-out"
              style={{
                width: `${
                  queueFiles.length > 0 ? (manuales / queueFiles.length) * 100 : 0
                }%`,
              }}
              title="Manual requerida"
            />
            <div
              className="h-full bg-teal-400 transition-all duration-500 ease-out"
              style={{
                width:
                  queueFiles.length > 0
                    ? (alertas / queueFiles.length) * 100
                    : 0,
              }}
              title="Resuelve alerta"
            />
            <div
              className="h-full bg-danger/70 transition-all duration-500 ease-out"
              style={{
                width:
                  queueFiles.length > 0
                    ? (duplicados / queueFiles.length) * 100
                    : 0,
              }}
              title="Duplicados (omitidos)"
            />
          </div>
        </div>
      </section>
    </div>
  );
};
