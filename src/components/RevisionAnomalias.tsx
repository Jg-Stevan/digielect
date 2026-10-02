import React, { useState } from 'react';
import { AnomaliaItem } from '../types';

interface RevisionAnomaliasProps {
  anomalias: AnomaliaItem[];
  onResolveAnomalia: (anomalia: AnomaliaItem) => void;
}

export const RevisionAnomalias: React.FC<RevisionAnomaliasProps> = ({
  anomalias,
  onResolveAnomalia,
}) => {
  const [filterType, setFilterType] = useState<string>('TODAS');
  const [page, setPage] = useState<number>(1);
  const pageSize = 5;

  const sinFirmasCount = anomalias.filter((a) => a.tipoAnomalia === 'SIN_FIRMAS').length;
  const ilegiblesCount = anomalias.filter((a) => a.tipoAnomalia === 'ILEGIBLE_RESCANEO').length;
  const codigoCount = anomalias.filter((a) => a.tipoAnomalia === 'CODIGO_NO_DETECTADO').length;

  const filtered = anomalias.filter((item) => {
    if (filterType === 'TODAS') return true;
    if (filterType === 'SIN_FIRMAS') return item.tipoAnomalia === 'SIN_FIRMAS';
    if (filterType === 'ILEGIBLES_RESCANEO') return item.tipoAnomalia === 'ILEGIBLE_RESCANEO';
    if (filterType === 'CODIGO_NO_DETECTADO') return item.tipoAnomalia === 'CODIGO_NO_DETECTADO';
    return true;
  });

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginatedItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="flex flex-col w-full max-w-[1440px] mx-auto pb-16">
      {/* Header Section */}
      <div className="flex flex-col gap-3 mt-4 mb-6 border-b border-outline-variant/30 pb-6">
        <div className="flex items-center gap-4">
          <span className="material-symbols-outlined text-error text-[32px]">warning</span>
          <h1 className="font-headline-lg text-[28px] text-on-surface tracking-tight uppercase font-bold">
            Revisión de Anomalías
          </h1>
          <div className="ml-auto flex items-center gap-3">
            <span className="font-label-caps text-label-caps text-on-surface-variant text-[11px]">
              ÚLTIMA ACTUALIZACIÓN: HACE 2 MIN
            </span>
            <button
              onClick={() => {}}
              className="bg-surface-container-high hover:bg-surface-container-highest text-on-surface w-9 h-9 rounded-full flex items-center justify-center transition-colors border border-outline-variant/30"
              title="Refrescar lista de incidentes"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>
          </div>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
          Bandeja de entrada centralizada para incidentes detectados automáticamente por el sistema
          de visión artificial o reportados manualmente. Requiere acción inmediata del supervisor.
        </p>
      </div>

      {/* Tabs / Filter buttons */}
      <div className="flex items-center gap-3 mb-6 overflow-x-auto pb-1">
        <button
          onClick={() => {
            setFilterType('TODAS');
            setPage(1);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-label-caps text-label-caps tracking-widest whitespace-nowrap transition-colors text-[11px] ${
            filterType === 'TODAS'
              ? 'bg-primary-container text-on-primary-container border border-primary/50 font-bold'
              : 'bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/30'
          }`}
        >
          <span>TODAS</span>
          <span className="font-stats-number text-[12px] ml-1">({anomalias.length})</span>
        </button>

        <button
          onClick={() => {
            setFilterType('SIN_FIRMAS');
            setPage(1);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-label-caps text-label-caps tracking-widest whitespace-nowrap transition-colors text-[11px] ${
            filterType === 'SIN_FIRMAS'
              ? 'bg-primary-container text-on-primary-container border border-primary/50 font-bold'
              : 'bg-surface-container hover:bg-surface-container-high text-secondary border border-outline-variant/30'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">warning</span>
          <span>SIN FIRMAS</span>
          <span className="font-stats-number text-[12px] ml-1">({sinFirmasCount})</span>
        </button>

        <button
          onClick={() => {
            setFilterType('ILEGIBLES_RESCANEO');
            setPage(1);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-label-caps text-label-caps tracking-widest whitespace-nowrap transition-colors text-[11px] ${
            filterType === 'ILEGIBLES_RESCANEO'
              ? 'bg-primary-container text-on-primary-container border border-primary/50 font-bold'
              : 'bg-surface-container hover:bg-surface-container-high text-error border border-outline-variant/30'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">error</span>
          <span>ILEGIBLES / RESCANEO</span>
          <span className="font-stats-number text-[12px] ml-1">({ilegiblesCount})</span>
        </button>

        <button
          onClick={() => {
            setFilterType('CODIGO_NO_DETECTADO');
            setPage(1);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md font-label-caps text-label-caps tracking-widest whitespace-nowrap transition-colors text-[11px] ${
            filterType === 'CODIGO_NO_DETECTADO'
              ? 'bg-primary-container text-on-primary-container border border-primary/50 font-bold'
              : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant border border-outline-variant/30'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">help</span>
          <span>CÓDIGO NO DETECTADO</span>
          <span className="font-stats-number text-[12px] ml-1">({codigoCount})</span>
        </button>
      </div>

      {/* Incidents Table */}
      <div className="bg-surface-container-low border border-outline-variant/30 rounded-lg overflow-hidden shadow-sm">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-3.5 bg-surface-container border-b border-outline-variant/30">
          <div className="col-span-2 font-label-caps text-label-caps text-on-surface-variant text-[11px]">
            HORA ALERTA
          </div>
          <div className="col-span-3 font-label-caps text-label-caps text-on-surface-variant text-[11px]">
            UBICACIÓN
          </div>
          <div className="col-span-2 font-label-caps text-label-caps text-on-surface-variant text-[11px]">
            FORMULARIO
          </div>
          <div className="col-span-2 font-label-caps text-label-caps text-on-surface-variant text-[11px]">
            TIPO DE ANOMALÍA
          </div>
          <div className="col-span-1 font-label-caps text-label-caps text-on-surface-variant text-right text-[11px]">
            SLA
          </div>
          <div className="col-span-2 font-label-caps text-label-caps text-on-surface-variant text-right text-[11px]">
            ACCIÓN
          </div>
        </div>

        {/* Rows */}
        <div className="flex flex-col divide-y divide-[#242E2E]">
          {paginatedItems.map((item) => {
            const isSinFirmas = item.tipoAnomalia === 'SIN_FIRMAS';
            const isIlegible = item.tipoAnomalia === 'ILEGIBLE_RESCANEO';
            const isCodigo = item.tipoAnomalia === 'CODIGO_NO_DETECTADO';

            return (
              <div
                key={item.id}
                className="grid grid-cols-12 gap-4 px-6 py-4 items-center bg-surface hover:bg-surface-container-high transition-colors group relative"
              >
                {/* Status Bar Indicator */}
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1 ${
                    isSinFirmas
                      ? 'bg-secondary'
                      : isIlegible
                      ? 'bg-error'
                      : 'bg-on-surface-variant'
                  } opacity-90`}
                ></div>

                {/* Hora Alerta */}
                <div className="col-span-2 flex flex-col">
                  <span className="font-body-md text-[13px] text-on-surface font-semibold font-stats-number">
                    {item.horaAlertaLocal}
                  </span>
                  <span className="font-body-md text-[11px] text-on-surface-variant font-stats-number">
                    {item.horaAlertaCol}
                  </span>
                </div>

                {/* Ubicación */}
                <div className="col-span-3 flex flex-col">
                  <span className="font-headline-md text-[14px] text-on-surface font-bold">
                    {item.pais} &gt; {item.ciudad}
                  </span>
                  <span className="font-body-md text-[11px] text-on-surface-variant font-stats-number">
                    {item.mesa}
                  </span>
                </div>

                {/* Formulario */}
                <div className="col-span-2">
                  <span className="font-body-md text-[12px] text-on-surface">
                    {item.formulario}
                  </span>
                </div>

                {/* Tipo de Anomalía Badge */}
                <div className="col-span-2">
                  {isSinFirmas && (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/10 border border-secondary/20">
                      <span className="material-symbols-outlined text-[14px] text-secondary">
                        warning
                      </span>
                      <span className="font-label-caps text-[9px] text-secondary tracking-widest font-bold">
                        SIN FIRMAS DETECTADAS
                      </span>
                    </div>
                  )}

                  {isIlegible && (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-error/10 border border-error/20">
                      <span className="material-symbols-outlined text-[14px] text-error">error</span>
                      <span className="font-label-caps text-[9px] text-error tracking-widest font-bold">
                        SOLICITUD RESCANEO
                      </span>
                    </div>
                  )}

                  {isCodigo && (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-on-surface-variant/10 border border-on-surface-variant/20">
                      <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
                        help
                      </span>
                      <span className="font-label-caps text-[9px] text-on-surface-variant tracking-widest font-bold">
                        CÓDIGO NO DETECTADO
                      </span>
                    </div>
                  )}
                </div>

                {/* SLA Timer */}
                <div className="col-span-1 text-right flex items-center justify-end gap-1.5">
                  <span
                    className={`material-symbols-outlined text-[16px] ${
                      item.slaMinutesRemaining < 30 ? 'text-error animate-pulse' : 'text-on-surface-variant'
                    }`}
                  >
                    timer
                  </span>
                  <span
                    className={`font-stats-number text-[13px] font-bold ${
                      item.slaMinutesRemaining < 30 ? 'text-error' : 'text-on-surface-variant'
                    }`}
                  >
                    {item.slaDisplay}
                  </span>
                </div>

                {/* Acción */}
                <div className="col-span-2 text-right">
                  <button
                    onClick={() => onResolveAnomalia(item)}
                    className="bg-primary hover:bg-primary-fixed text-on-primary font-label-caps text-label-caps px-4 py-2 rounded-md transition-colors w-full uppercase tracking-wider flex items-center justify-center gap-2 group-hover:shadow-md text-[11px] font-bold"
                  >
                    <span className="material-symbols-outlined text-[16px]">build</span>
                    RESOLVER
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination / Footer */}
        <div className="px-6 py-4 bg-surface flex items-center justify-between border-t border-outline-variant/30">
          <span className="font-body-md text-body-md text-on-surface-variant text-[11px]">
            Mostrando {(page - 1) * pageSize + 1} -{' '}
            {Math.min(page * pageSize, filtered.length)} de {filtered.length} anomalías
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page === 1}
              className="w-8 h-8 flex items-center justify-center border border-outline-variant/30 rounded text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <span className="font-stats-number text-[12px] px-2 text-primary font-bold">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={page === totalPages}
              className="w-8 h-8 flex items-center justify-center bg-surface-container-high border border-outline-variant/30 rounded text-on-surface hover:bg-surface-container-highest transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
