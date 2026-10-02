import React, { useState, useRef } from 'react';
import { QueueFileItem } from '../types';

interface CargaMasivaProps {
  queueFiles: QueueFileItem[];
  onIntegrate: () => void;
  onRemoveFile: (id: string) => void;
}

export const CargaMasiva: React.FC<CargaMasivaProps> = ({
  queueFiles,
  onIntegrate,
  onRemoveFile,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [integratedSuccess, setIntegratedSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    simulateFileIngestion();
  };

  const simulateFileIngestion = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
    }, 1500);
  };

  const handleIntegrateClick = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setIntegratedSuccess(true);
      onIntegrate();
      setTimeout(() => {
        setIntegratedSuccess(false);
      }, 4000);
    }, 1200);
  };

  return (
    <div className="flex flex-col w-full max-w-[1440px] mx-auto pb-28">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-headline-lg text-headline-lg text-primary uppercase tracking-wider mb-1.5 text-[24px]">
          Carga Masiva de Actas
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
          Módulo de contingencia para ingesta manual de actas E-14 físicas. Procesamiento por
          lotes con reconocimiento automático de ubicación vía código de barras.
        </p>
      </div>

      {/* Grid: Drop Zone + OCR Server Status */}
      <div className="grid grid-cols-12 gap-6 mb-8">
        {/* Drop Zone */}
        <div className="col-span-12 xl:col-span-8 bg-surface-container rounded-xl shadow-md p-4 relative overflow-hidden group">
          <input
            type="file"
            ref={fileInputRef}
            onChange={simulateFileIngestion}
            multiple
            className="hidden"
          />
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`w-full rounded-lg border-2 border-dashed transition-all flex flex-col items-center justify-center p-10 cursor-pointer ${
              isDragging
                ? 'border-primary bg-primary/10 scale-[1.01]'
                : 'border-primary/50 group-hover:border-primary bg-surface-container-lowest/50 group-hover:bg-surface-container-lowest'
            }`}
          >
            <span
              className={`material-symbols-outlined text-primary text-[48px] mb-3 ${
                isDragging ? 'scale-125' : 'group-hover:-translate-y-1'
              } transition-transform`}
            >
              cloud_upload
            </span>
            <span className="font-headline-md text-[17px] text-on-surface mb-1 text-center font-bold">
              Arrastra y suelta aquí los archivos de actas E-14
            </span>
            <span className="font-body-md text-[11px] text-on-surface-variant mb-5 uppercase tracking-wider text-center">
              FORMATOS SOPORTADOS: ZIP, PDF, JPG, PNG
            </span>
            <button
              type="button"
              className="bg-primary text-on-primary px-6 py-2 rounded font-label-caps text-label-caps uppercase tracking-wider hover:bg-primary-fixed transition-colors shadow-md hover:shadow-primary/20 flex items-center gap-2 text-[12px] font-bold"
            >
              <span className="material-symbols-outlined text-[16px]">folder_open</span>
              EXPLORAR ARCHIVOS
            </button>
            <div className="mt-5 flex items-center gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-[15px]">info</span>
              <span className="font-body-md text-[10px] uppercase">
                Lotes de hasta 500 MB (aprox 200 actas en alta resolución)
              </span>
            </div>
          </div>
        </div>

        {/* OCR Server Status */}
        <div className="col-span-12 xl:col-span-4 bg-surface-container rounded-xl shadow-md p-5 flex flex-col border border-outline-variant/30">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider mb-4 border-b border-[#242E2E] pb-2 text-[11px]">
            Estado del Servidor OCR
          </h3>
          <div className="flex-1 flex flex-col justify-center gap-4">
            <div className="flex justify-between items-center bg-surface-container-lowest p-3 rounded border border-outline-variant/20">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary-container text-[22px]">
                  psychology
                </span>
                <span className="font-body-lg text-[13px] text-on-surface font-semibold">
                  Motor Neuronal C-4
                </span>
              </div>
              <div className="flex items-center gap-2 bg-primary/10 px-2 py-1 rounded-full border border-primary/20">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                <span className="font-body-md text-[10px] text-primary uppercase font-bold">
                  Activo
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1 mt-1">
              <div className="flex justify-between font-body-md text-body-md text-on-surface-variant">
                <span>Capacidad de cola (MB/s)</span>
                <span className="font-stats-number text-[12px] text-on-surface">850 / 1000</span>
              </div>
              <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full shadow-[0_0_8px_rgba(0,200,83,0.6)]"
                  style={{ width: '85%' }}
                ></div>
              </div>
            </div>

            <div className="flex flex-col gap-1 mt-1">
              <div className="flex justify-between font-body-md text-body-md text-on-surface-variant">
                <span>Confianza media OCR actual</span>
                <span className="font-stats-number text-[12px] text-primary font-bold">98.4%</span>
              </div>
              <div className="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden">
                <div className="bg-primary h-full rounded-full" style={{ width: '98.4%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Processing Queue Table */}
      <div className="flex-1 flex flex-col bg-surface-container rounded-xl shadow-lg border border-outline-variant/30 overflow-hidden">
        {/* Table Top Toolbar */}
        <div className="p-4 bg-surface-container-high border-b border-[#242E2E] flex justify-between items-center">
          <h2 className="font-headline-md text-headline-md text-on-surface flex items-center gap-2 text-[15px] font-bold uppercase">
            <span className="material-symbols-outlined text-secondary-container text-[20px]">
              list_alt
            </span>
            Cola de Procesamiento
          </h2>
          <div className="flex items-center gap-4 font-body-md text-body-md text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary"></span>
              <span className="text-on-surface-variant font-stats-number">Reconocido (16)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-secondary-container"></span>
              <span className="text-on-surface-variant font-stats-number">Manual (4)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-error"></span>
              <span className="text-on-surface-variant font-stats-number">Error (0)</span>
            </div>
          </div>
        </div>

        {/* Table rows */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[850px]">
            <thead className="bg-surface-container-highest border-b border-[#242E2E]">
              <tr>
                <th className="p-3 font-label-caps text-label-caps text-on-surface-variant uppercase w-12 text-center text-[10px]">
                  #
                </th>
                <th className="p-3 font-label-caps text-label-caps text-on-surface-variant uppercase w-1/4 text-[10px]">
                  Archivo / Vista Previa
                </th>
                <th className="p-3 font-label-caps text-label-caps text-on-surface-variant uppercase w-1/6 text-[10px]">
                  Cód. Barras Detección
                </th>
                <th className="p-3 font-label-caps text-label-caps text-on-surface-variant uppercase w-1/3 text-[10px]">
                  Ubicación Estructural Mapeada
                </th>
                <th className="p-3 font-label-caps text-label-caps text-on-surface-variant uppercase w-[160px] text-[10px]">
                  Estado OCR
                </th>
                <th className="p-3 font-label-caps text-label-caps text-on-surface-variant uppercase w-20 text-right text-[10px]">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#242E2E]">
              {queueFiles.map((file, idx) => (
                <tr
                  key={file.id}
                  className="hover:bg-surface-container-highest transition-colors group bg-surface-container"
                >
                  <td className="p-3 text-center text-on-surface-variant font-stats-number text-[11px]">
                    0{idx + 1}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-14 bg-surface-container-lowest rounded shadow-sm flex items-center justify-center overflow-hidden shrink-0 border border-outline-variant/30">
                        <span className="material-symbols-outlined text-outline text-[20px]">
                          image
                        </span>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span
                          className="font-stats-number text-[12px] truncate text-on-surface font-semibold"
                          title={file.filename}
                        >
                          {file.filename}
                        </span>
                        <span className="text-[10px] text-on-surface-variant font-stats-number">
                          {file.size} • {file.ext}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Barcode */}
                  <td className="p-3 font-stats-number text-[12px] text-secondary-container">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">barcode_scanner</span>
                      <span>{file.barcode}</span>
                    </div>
                  </td>

                  {/* Location */}
                  <td className="p-3">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2 text-on-surface">
                        <span className="px-1.5 py-0.5 bg-surface-container-lowest rounded text-[9px] font-label-caps uppercase border border-outline-variant/30">
                          EXT
                        </span>
                        <span className="truncate text-[12px] font-medium" title={file.location}>
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

                  {/* OCR Status */}
                  <td className="p-3">
                    {file.ocrStatus === 'DUPLICADO' && (
                      <div className="flex flex-col gap-1">
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 w-fit">
                          <span className="material-symbols-outlined text-[13px] text-blue-400">
                            content_copy
                          </span>
                          <span className="font-label-caps text-[9px] text-blue-400 uppercase font-bold">
                            DUPLICADO (YA EXISTE)
                          </span>
                        </div>
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container-lowest border border-outline-variant/30 w-fit">
                          <span className="material-symbols-outlined text-[13px] text-on-surface-variant">
                            lock
                          </span>
                          <span className="font-label-caps text-[9px] text-on-surface-variant uppercase">
                            Omitido
                          </span>
                        </div>
                      </div>
                    )}

                    {file.ocrStatus === 'RESUELVE_ALERTA' && (
                      <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-yellow-500/15 border border-yellow-500/40">
                        <span className="material-symbols-outlined text-[14px] text-yellow-400">
                          build
                        </span>
                        <span className="font-label-caps text-[9px] text-yellow-400 uppercase font-bold tracking-wider">
                          RESUELVE ALERTA
                        </span>
                      </div>
                    )}

                    {file.ocrStatus === 'NUEVO_REGISTRO' && (
                      <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-green-500/15 border border-green-500/40">
                        <span className="material-symbols-outlined text-[14px] text-green-400">
                          add_circle
                        </span>
                        <span className="font-label-caps text-[9px] text-green-400 uppercase font-bold tracking-wider">
                          NUEVO REGISTRO
                        </span>
                      </div>
                    )}

                    {file.ocrStatus === 'RECONOCIDO' && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-primary/10 border border-primary/20">
                        <span className="material-symbols-outlined text-[14px] text-primary">
                          check_circle
                        </span>
                        <span className="font-label-caps text-[9px] text-primary uppercase font-bold">
                          Reconocido ({file.ocrConfidence || 99}%)
                        </span>
                      </div>
                    )}

                    {file.ocrStatus === 'MANUAL_REQUERIDA' && (
                      <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-secondary-container/10 border border-secondary-container/30">
                        <span className="material-symbols-outlined text-[14px] text-secondary-container">
                          warning
                        </span>
                        <span className="font-label-caps text-[9px] text-secondary-container uppercase">
                          Manual Requerida
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="p-3 text-right">
                    <button
                      onClick={() => onRemoveFile(file.id)}
                      className="text-on-surface-variant hover:text-error transition-colors p-1 rounded"
                      title="Eliminar del lote"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="p-3 bg-surface-container-highest border-t border-[#242E2E] flex justify-between items-center text-[11px] text-on-surface-variant">
          <span>Mostrando {queueFiles.length} de 20 archivos en lote actual</span>
          <div className="flex items-center gap-2">
            <button className="p-1 hover:text-on-surface transition-colors disabled:opacity-30">
              <span className="material-symbols-outlined text-[16px]">chevron_left</span>
            </button>
            <span className="font-stats-number">Pág 1 de 7</span>
            <button className="p-1 hover:text-on-surface transition-colors">
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Floating Bottom Bar: Batch integration */}
      <div className="fixed bottom-0 left-64 right-0 bg-surface-container-high/95 backdrop-blur shadow-[0_-4px_20px_rgba(0,0,0,0.6)] z-40 border-t border-outline-variant/30">
        <div className="flex items-center justify-between p-4 px-8 max-w-[1440px] mx-auto gap-8">
          <div className="flex-1 flex flex-col gap-2 max-w-xl">
            <div className="flex justify-between font-body-md text-body-md text-on-surface">
              <span className="flex items-center gap-2">
                <span
                  className={`material-symbols-outlined text-[16px] text-primary ${
                    isProcessing ? 'animate-spin' : ''
                  }`}
                >
                  sync
                </span>
                {isProcessing ? 'Procesando lote...' : 'Analizando lote actual...'}
              </span>
              <span className="font-stats-number text-[13px]">
                Procesados 16 de 20 archivos — 80%
              </span>
            </div>
            <div className="w-full h-2 bg-surface-container-lowest rounded-full overflow-hidden flex">
              <div
                className="h-full bg-primary transition-all duration-500 ease-out shadow-[0_0_8px_rgba(0,200,83,0.8)] relative"
                style={{ width: '80%' }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_2s_infinite]"></div>
              </div>
              <div
                className="h-full bg-secondary-container transition-all duration-500 ease-out"
                style={{ width: '10%' }}
                title="Manual (2)"
              ></div>
              <div
                className="h-full bg-surface-variant transition-all duration-500 ease-out"
                style={{ width: '10%' }}
                title="Pendiente (2)"
              ></div>
            </div>
          </div>

          <button
            onClick={handleIntegrateClick}
            disabled={isProcessing}
            className={`transition-all px-8 py-3.5 rounded-lg font-headline-md text-headline-md uppercase tracking-wider flex items-center gap-3 shadow-lg ${
              integratedSuccess
                ? 'bg-primary text-on-primary ring-2 ring-primary ring-offset-2 ring-offset-black'
                : 'bg-primary text-on-primary hover:brightness-110 active:scale-95 shadow-primary/20'
            }`}
          >
            <span className="material-symbols-outlined">
              {integratedSuccess ? 'check_circle' : 'playlist_add_check'}
            </span>
            <span className="text-[14px] font-bold">
              {integratedSuccess ? '¡ACTAS INTEGRADAS AL MONITOR!' : 'INTEGRAR AL MONITOR GLOBAL'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
