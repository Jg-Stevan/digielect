import React, { useState } from 'react';
import { ConsulateRow, AnomaliaItem, SlaRow } from '../types';

interface GenerarInformesProps {
  consulates: ConsulateRow[];
  anomalias: AnomaliaItem[];
  slaRows: SlaRow[];
}

export const GenerarInformes: React.FC<GenerarInformesProps> = ({
  consulates,
  anomalias,
  slaRows,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<'CSV' | 'JSON' | 'PDF'>('CSV');
  const [selectedReport, setSelectedReport] = useState<string>('consolidado');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const reportsList = [
    {
      id: 'consolidado',
      title: 'Reporte General de Consolidación E-14 Exterior',
      desc: 'Detalle de avance por consulado, mesas recibidas, delegados vs transmisión, porcentajes de cómputo y estado de cierre.',
      icon: 'description',
      badge: 'OFICIAL AUDITORÍA',
    },
    {
      id: 'anomalias',
      title: 'Informe Técnico de Rescaneos y Calidad de Imagen',
      desc: 'Listado exhaustivo de actas con firmas ilegibles, anomalías de código de barras, tiempos de resolución y decisiones del supervisor.',
      icon: 'rule',
      badge: 'SEGURIDAD ELECTORAL',
    },
    {
      id: 'sla',
      title: 'Trazabilidad y Cumplimiento de Acuerdos SLA',
      desc: 'Tiempos de respuesta desde el cierre de urnas (16:00 Local), alertas preventivas Fase 2 y mora crítica Fase 3 con acuses de recibo.',
      icon: 'hourglass_top',
      badge: 'CONTROL OPERATIVO',
    },
    {
      id: 'certificado',
      title: 'Acta de Cierre y Hash de Integridad Criptográfica',
      desc: 'Certificado de auditoría para organismos de observación internacional con sellos de tiempo UTC y firma digital del supervisor.',
      icon: 'verified_user',
      badge: 'VALIDEZ LEGAL',
    },
  ];

  const handleDownloadReport = () => {
    setIsExporting(true);

    setTimeout(() => {
      let content = '';
      let filename = `E14_${selectedReport}_${new Date().toISOString().slice(0, 10)}`;

      if (selectedFormat === 'CSV') {
        filename += '.csv';
        if (selectedReport === 'consolidado') {
          content = 'CODIGO,PAIS,ZONA,PUESTO,MESAS,DELEGADOS,TRANSMISION,ESTADO\n';
          consulates.forEach((c) => {
            content += `"${c.code}","${c.pais}","${c.zona}","${c.puesto}",${c.numMesas},"${c.delegadosProgress}","${c.transmisionProgress}","${c.estadoGlobal}"\n`;
          });
        } else if (selectedReport === 'anomalias') {
          content = 'ID,HORA_LOCAL,PAIS,CIUDAD,MESA,TIPO_ANOMALIA,SLA\n';
          anomalias.forEach((a) => {
            content += `"${a.id}","${a.horaAlertaLocal}","${a.pais}","${a.ciudad}","${a.mesa}","${a.tipoLabel}","${a.slaDisplay}"\n`;
          });
        } else {
          content = 'CONSULADO,PAIS,ZONA,MESAS_INACTIVAS,HORA_CIERRE,TIEMPO_MORA,FASE,ESTADO_NOTIF\n';
          slaRows.forEach((s) => {
            content += `"${s.consulateName}","${s.pais}","${s.zona}","${s.mesasInactivas.join('; ')}","${s.horaCierreLocal}","${s.tiempoTranscurridoLabel}","${s.faseLabel}","${s.notifEstado}"\n`;
          });
        }
      } else if (selectedFormat === 'JSON') {
        filename += '.json';
        const data = {
          auditSystem: 'SISTEMA DE MONITOREO ELECTORAL E-14',
          supervisorId: 'ADM-9482',
          timestampUtc: new Date().toISOString(),
          reportType: selectedReport,
          consulates,
          anomalias,
          slaRows,
        };
        content = JSON.stringify(data, null, 2);
      } else {
        filename += '.txt';
        content = `*** SISTEMA DE MONITOREO ELECTORAL E-14 ***\nREPORT: ${selectedReport.toUpperCase()}\nSUPERVISOR: ADM-9482\nDATE: ${new Date().toLocaleString()}\nSTATUS: AUDIT-COMPLIANT\n\n`;
        consulates.forEach((c) => {
          content += `[${c.code}] ${c.pais} (${c.puesto}): ${c.estadoGlobal} - DELEGADOS: ${c.delegadosProgress}, TRANSMISION: ${c.transmisionProgress}\n`;
        });
      }

      // Trigger download
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setIsExporting(false);
      setExportNotice(`Archivo ${filename} generado y descargado exitosamente.`);
      setTimeout(() => setExportNotice(null), 4000);
    }, 800);
  };

  return (
    <div className="flex flex-col w-full max-w-[1440px] mx-auto pb-16 gap-6">
      {/* Toast Notice */}
      {exportNotice && (
        <div className="fixed top-16 right-6 z-50 bg-[#0e1414] border border-primary text-primary px-4 py-2.5 rounded shadow-xl flex items-center gap-2 text-label-caps animate-in fade-in">
          <span className="material-symbols-outlined text-[18px]">file_download_done</span>
          <span>{exportNotice}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-2 mt-4 mb-4 border-b border-outline-variant/30 pb-6">
        <div className="flex items-center gap-3">
          <span className="p-1.5 rounded-lg bg-surface-container-high text-primary flex items-center justify-center border border-primary/20">
            <span className="material-symbols-outlined text-[24px]">bar_chart</span>
          </span>
          <h1 className="font-headline-lg text-[28px] text-on-surface tracking-tight uppercase font-bold">
            Generar Informes y Auditoría E-14
          </h1>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
          Exportación de reportes técnicos, bitácoras de auditoría, actas consolidadas y métricas de
          desempeño de transmisión para supervisores y misiones de observación electoral.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left List of Report Types */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-4">
          <h2 className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider text-[11px]">
            SELECCIONE EL TIPO DE INFORME
          </h2>

          <div className="flex flex-col gap-3">
            {reportsList.map((rep) => {
              const isSelected = selectedReport === rep.id;
              return (
                <div
                  key={rep.id}
                  onClick={() => setSelectedReport(rep.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-4 ${
                    isSelected
                      ? 'bg-surface-container-highest border-primary shadow-lg shadow-primary/5 ring-1 ring-primary/40'
                      : 'bg-surface-container border-outline-variant/30 hover:bg-surface-container-high'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
                      isSelected
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[20px]">{rep.icon}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3
                        className={`font-headline-md text-[14px] font-bold ${
                          isSelected ? 'text-primary' : 'text-on-surface'
                        }`}
                      >
                        {rep.title}
                      </h3>
                      <span className="text-[9px] font-label-caps font-bold px-2 py-0.5 rounded bg-surface-container-lowest border border-outline-variant/30 text-on-surface-variant">
                        {rep.badge}
                      </span>
                    </div>
                    <p className="font-body-md text-[11px] text-on-surface-variant leading-relaxed">
                      {rep.desc}
                    </p>
                  </div>

                  <div className="shrink-0 self-center">
                    <span
                      className={`material-symbols-outlined text-[20px] ${
                        isSelected ? 'text-primary' : 'text-outline-variant'
                      }`}
                    >
                      {isSelected ? 'radio_button_checked' : 'radio_button_unchecked'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Configuration & Export Panel */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-5">
          <div className="bg-surface-container rounded-xl p-5 border border-outline-variant/30 flex flex-col gap-5">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider text-[11px] border-b border-[#242E2E] pb-2">
              PARÁMETROS DE EXPORTACIÓN
            </h3>

            {/* Format Selector */}
            <div className="flex flex-col gap-2">
              <label className="text-label-caps font-label-caps text-on-surface uppercase text-[11px]">
                FORMATO DE SALIDA
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['CSV', 'JSON', 'PDF'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setSelectedFormat(fmt)}
                    className={`py-2 px-3 rounded font-label-caps text-[11px] tracking-wider font-bold transition-all border ${
                      selectedFormat === fmt
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface-container-lowest text-on-surface border-outline-variant/40 hover:bg-surface-container-high'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            {/* Security Audit Stamp */}
            <div className="bg-surface-container-lowest p-3 rounded border border-outline-variant/30 flex flex-col gap-2 font-mono text-[11px]">
              <div className="flex justify-between text-on-surface-variant">
                <span>ESTACIÓN:</span>
                <span className="text-on-surface">SIG-04 BOGOTÁ</span>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>SUPERVISOR:</span>
                <span className="text-primary font-bold">ADM-9482</span>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>SELLO CRIPTO:</span>
                <span className="text-on-surface">SHA-256 (VERIFICADO)</span>
              </div>
            </div>

            {/* Action button */}
            <button
              onClick={handleDownloadReport}
              disabled={isExporting}
              className="w-full py-3 bg-primary text-on-primary font-headline-md text-headline-md uppercase tracking-wider rounded font-bold hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 text-[13px]"
            >
              <span className={`material-symbols-outlined ${isExporting ? 'animate-spin' : ''}`}>
                {isExporting ? 'sync' : 'download'}
              </span>
              <span>{isExporting ? 'GENERANDO ARCHIVO...' : 'DESCARGAR INFORME'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
