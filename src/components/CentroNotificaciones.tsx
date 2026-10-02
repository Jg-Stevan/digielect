import React, { useState } from 'react';
import { SlaRow } from '../types';

interface CentroNotificacionesProps {
  slaRows: SlaRow[];
  onOpenWhatsApp: (consulateName: string) => void;
  onOpenHistorial: (consulate: SlaRow) => void;
  onOpenConfigSla: () => void;
  onExportReport: () => void;
}

export const CentroNotificaciones: React.FC<CentroNotificacionesProps> = ({
  slaRows,
  onOpenWhatsApp,
  onOpenHistorial,
  onOpenConfigSla,
  onExportReport,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPais, setSelectedPais] = useState('all');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedFase, setSelectedFase] = useState('all');
  const [selectedNotif, setSelectedNotif] = useState('all');
  const [hideNormal, setHideNormal] = useState(true);
  const [sentToast, setSentToast] = useState<string | null>(null);

  const handleSendEmail = (consulateName: string) => {
    setSentToast(`Correo oficial de escalamiento SLA enviado a ${consulateName}`);
    setTimeout(() => {
      setSentToast(null);
    }, 3500);
  };

  const filteredRows = slaRows.filter((row) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match = `${row.consulateName} ${row.pais} ${row.mesasInactivas.join(' ')}`.toLowerCase();
      if (!match.includes(q)) return false;
    }
    if (selectedPais !== 'all' && row.pais.toLowerCase() !== selectedPais.toLowerCase()) {
      return false;
    }
    if (selectedRegion !== 'all' && row.region !== selectedRegion) {
      return false;
    }
    if (selectedFase === 'critico' && row.fase !== 'fase3') return false;
    if (selectedFase === 'advertencia' && row.fase !== 'fase2') return false;

    if (selectedNotif === 'leido' && !row.notifEstado.includes('Leído')) return false;
    if (selectedNotif === 'entregado' && !row.notifEstado.includes('Entregado')) return false;
    if (selectedNotif === 'sin_respuesta' && !row.notifEstado.includes('Sin acuse')) return false;

    return true;
  });

  return (
    <div className="flex flex-col w-full max-w-[1440px] mx-auto pb-16 gap-6">
      {/* Sent Toast notification */}
      {sentToast && (
        <div className="fixed top-16 right-6 z-50 bg-[#0e1414] border border-primary text-primary px-4 py-2.5 rounded shadow-2xl flex items-center gap-2 text-label-caps animate-in fade-in">
          <span className="material-symbols-outlined text-[18px]">mark_email_read</span>
          <span>{sentToast}</span>
        </div>
      )}

      {/* Header Superior del Módulo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-outline-variant/30">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <span className="p-1.5 rounded-lg bg-surface-container-high text-primary flex items-center justify-center border border-primary/20">
              <span className="material-symbols-outlined text-[20px]">acute</span>
            </span>
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight uppercase text-[22px]">
              CENTRO DE NOTIFICACIONES // MORA OPERATIVA Y SLA
            </h1>
            <span className="font-label-caps text-label-caps px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant font-mono text-[10px]">
              MATRIZ SLA POR PUESTO
            </span>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant ml-10">
            Monitoreo de tolerancia de tiempo de escaneo post-cierre de urnas y escalamiento
            progresivo de alertas en consulados
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
          <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-lg border border-outline-variant/30">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
            </span>
            <span className="font-label-caps text-label-caps text-on-surface tracking-wider text-[11px]">
              SLA ENGINE: EN VIVO (INTERVALO 30s)
            </span>
          </div>

          <button
            onClick={onOpenConfigSla}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface border border-outline-variant/40 transition-colors font-label-caps text-label-caps tracking-wider text-[11px]"
          >
            <span className="material-symbols-outlined text-[16px]">settings</span>
            CONFIGURAR UMBRALES SLA
          </button>

          <button
            onClick={onExportReport}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface border border-outline-variant/40 transition-colors font-label-caps text-label-caps tracking-wider text-[11px]"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
            EXPORTAR REPORTE MORA
          </button>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/20 pb-2">
        <div className="inline-flex gap-2 p-1 bg-surface-container-lowest rounded-xl border border-outline-variant/20">
          <button className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-surface-container-high text-primary font-label-caps text-label-caps border border-primary/30 shadow-sm text-[11px]">
            <span className="material-symbols-outlined text-[15px]">hourglass_top</span>
            CONTROL DE MORA OPERATIVA (SLA)
            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-secondary-container/20 text-secondary-container font-stats-number text-[11px] font-bold">
              08
            </span>
          </button>
        </div>

        <div className="flex items-center gap-4 text-on-surface-variant font-body-md text-body-md text-[12px]">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-primary text-[16px]">sync</span>
            <span>
              Ventana de tolerancia activa:{' '}
              <span className="text-on-surface font-stats-number text-body-md font-bold">
                POST-CIERRE 16:00
              </span>
            </span>
          </div>
          <div className="h-3 w-[1px] bg-outline-variant/50"></div>
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-on-surface-variant text-[16px]">
              security
            </span>
            <span>Auditoría Legal SLA</span>
          </div>
        </div>
      </div>

      {/* Summary Cards / SLA Phases Gauge (4 KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Fase 1 */}
        <div className="bg-surface-container-low rounded-xl p-4 border-t-2 border-primary border-r border-b border-l border-outline-variant/20 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-caps text-label-caps text-on-surface-variant tracking-wider uppercase text-[10px]">
              FASE 1 - RITMO NORMAL (0-20 min)
            </span>
            <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-stats-number text-stats-number text-primary font-bold">
              42 Mesas
            </span>
            <span className="font-body-md text-body-md text-on-surface-variant font-medium">
              84.0%
            </span>
          </div>
          <div className="mt-2 text-on-surface-variant font-body-md text-[11px] flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px] text-primary">verified</span>
            Dentro de la ventana estándar post-cierre
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded-full mt-3 overflow-hidden">
            <div className="bg-primary h-full rounded-full" style={{ width: '84%' }}></div>
          </div>
        </div>

        {/* Card 2: Fase 2 */}
        <div className="bg-surface-container-low rounded-xl p-4 border-t-2 border-secondary-container border-r border-b border-l border-outline-variant/20 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-caps text-label-caps text-on-surface-variant tracking-wider uppercase text-[10px]">
              FASE 2 - ADVERTENCIA PREVENTIVA (21-40 min)
            </span>
            <span className="material-symbols-outlined text-secondary-container text-[20px]">
              alarm
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-stats-number text-stats-number text-secondary-container font-bold">
              05 Mesas
            </span>
            <span className="font-body-md text-body-md text-secondary-container font-medium">
              Alerta 1
            </span>
          </div>
          <div className="mt-2 text-on-surface-variant font-body-md text-[11px] flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px] text-secondary-container">
              chat
            </span>
            Notificación Nivel 1 WhatsApp enviada automáticamente
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded-full mt-3 overflow-hidden">
            <div className="bg-secondary-container h-full rounded-full" style={{ width: '25%' }}></div>
          </div>
        </div>

        {/* Card 3: Fase 3 */}
        <div className="bg-surface-container-low rounded-xl p-4 border-t-2 border-tertiary-container border-r border-b border-l border-outline-variant/20 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-caps text-label-caps text-on-surface-variant tracking-wider uppercase text-[10px]">
              FASE 3 - MORA CRÍTICA (&gt; 1.5 hr)
            </span>
            <span className="material-symbols-outlined text-tertiary-container text-[20px]">
              fmd_bad
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-stats-number text-stats-number text-tertiary-container font-bold">
              03 Mesas
            </span>
            <span className="font-body-md text-body-md text-tertiary-container font-medium">
              Escalado
            </span>
          </div>
          <div className="mt-2 text-on-surface-variant font-body-md text-[11px] flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px] text-tertiary-container">
              notification_important
            </span>
            Notificación Nivel 2 + Escalamiento a Delegado Consular
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded-full mt-3 overflow-hidden">
            <div className="bg-tertiary-container h-full rounded-full" style={{ width: '15%' }}></div>
          </div>
        </div>

        {/* Card 4: Tiempo Promedio */}
        <div className="bg-surface-container-low rounded-xl p-4 border-t-2 border-outline border-r border-b border-l border-outline-variant/20 flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="font-label-caps text-label-caps text-on-surface-variant tracking-wider uppercase text-[10px]">
              TIEMPO PROMEDIO RECEPCIÓN 1ª PÁGINA
            </span>
            <span className="material-symbols-outlined text-on-surface text-[20px]">timer</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-stats-number text-stats-number text-on-surface font-bold">
              18.4 min
            </span>
            <span className="font-body-md text-body-md text-primary font-medium">
              SLA Meta &lt; 25 min
            </span>
          </div>
          <div className="mt-2 text-on-surface-variant font-body-md text-[11px] flex items-center gap-1">
            <span className="material-symbols-outlined text-[13px] text-primary">trending_up</span>
            Cumplimiento global SLA: 91.2%
          </div>
          <div className="w-full bg-surface-container-highest h-1 rounded-full mt-3 overflow-hidden">
            <div className="bg-primary h-full rounded-full" style={{ width: '91.2%' }}></div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[280px]">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
            search
          </span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-surface-container text-on-surface placeholder-on-surface-variant font-body-md text-body-md rounded-lg border border-outline-variant/40 focus:border-primary focus:outline-none transition-colors"
            placeholder="Buscar por puesto, consulado o número de mesa..."
            type="text"
          />
        </div>

        {/* Selects */}
        <div className="flex flex-wrap items-center gap-2">
          {/* País */}
          <div className="relative">
            <select
              value={selectedPais}
              onChange={(e) => setSelectedPais(e.target.value)}
              className="appearance-none bg-surface-container text-on-surface font-body-md text-body-md px-3 py-2 pr-8 rounded-lg border border-outline-variant/40 focus:border-primary focus:outline-none cursor-pointer text-[12px]"
            >
              <option value="all">País: Todos los Países</option>
              <option value="alemania">Alemania</option>
              <option value="egipto">Egipto</option>
              <option value="francia">Francia</option>
              <option value="italia">Italia</option>
              <option value="reino unido">Reino Unido</option>
            </select>
            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[18px]">
              arrow_drop_down
            </span>
          </div>

          {/* Región */}
          <div className="relative">
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="appearance-none bg-surface-container text-on-surface font-body-md text-body-md px-3 py-2 pr-8 rounded-lg border border-outline-variant/40 focus:border-primary focus:outline-none cursor-pointer text-[12px]"
            >
              <option value="all">Región: Todas (Europa, América, Asia)</option>
              <option value="europa">Europa</option>
              <option value="america">América</option>
              <option value="asia">Asia / África</option>
            </select>
            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[18px]">
              arrow_drop_down
            </span>
          </div>

          {/* Fase */}
          <div className="relative">
            <select
              value={selectedFase}
              onChange={(e) => setSelectedFase(e.target.value)}
              className="appearance-none bg-surface-container text-on-surface font-body-md text-body-md px-3 py-2 pr-8 rounded-lg border border-outline-variant/40 focus:border-primary focus:outline-none cursor-pointer text-[12px]"
            >
              <option value="all">Fase: Todas las Fases</option>
              <option value="critico">Solo Crítico Nivel 2 (&gt;40m)</option>
              <option value="advertencia">Solo Advertencia Nivel 1 (21-40m)</option>
            </select>
            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[18px]">
              arrow_drop_down
            </span>
          </div>

          {/* Notificación */}
          <div className="relative">
            <select
              value={selectedNotif}
              onChange={(e) => setSelectedNotif(e.target.value)}
              className="appearance-none bg-surface-container text-on-surface font-body-md text-body-md px-3 py-2 pr-8 rounded-lg border border-outline-variant/40 focus:border-primary focus:outline-none cursor-pointer text-[12px]"
            >
              <option value="all">Notificación: Todos los Estados</option>
              <option value="leido">Leído con Acuse</option>
              <option value="entregado">Entregado Móvil</option>
              <option value="sin_respuesta">Sin Respuesta / Alerta</option>
            </select>
            <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[18px]">
              arrow_drop_down
            </span>
          </div>

          {/* Checkbox ocultar ritmo normal */}
          <label className="flex items-center gap-2 px-3 py-2 bg-surface-container rounded-lg border border-outline-variant/40 cursor-pointer hover:bg-surface-container-high transition-colors select-none text-[11px]">
            <input
              checked={hideNormal}
              onChange={(e) => setHideNormal(e.target.checked)}
              className="rounded bg-surface-container-lowest border-outline-variant text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer w-4 h-4 accent-primary"
              type="checkbox"
            />
            <span className="font-label-caps text-label-caps text-on-surface whitespace-nowrap">
              OCULTAR EN RITMO NORMAL (&lt;20M)
            </span>
          </label>

          {/* Botón Actualizar */}
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedPais('all');
              setSelectedRegion('all');
              setSelectedFase('all');
              setSelectedNotif('all');
            }}
            className="p-2 rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/40 hover:bg-surface-container-high transition-colors"
            title="Refrescar matriz"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
          </button>
        </div>
      </div>

      {/* Matriz Central de Seguimiento de Mora por Puesto */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/30 overflow-hidden shadow-md">
        <div className="p-4 border-b border-outline-variant/30 bg-surface-container flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">table_chart</span>
            <h2 className="font-headline-md text-[15px] text-on-surface font-bold uppercase tracking-tight">
              MATRIZ DE SEGUIMIENTO DE MORA POR PUESTO
            </h2>
            <span className="font-label-caps text-label-caps px-2 py-0.5 rounded bg-tertiary-container/15 text-tertiary-container border border-tertiary-container/30 text-[10px]">
              08 EN ATENCIÓN PRIORITARIA
            </span>
          </div>
          <div className="font-body-md text-on-surface-variant text-[11px]">
            Corte de Auditoría Electoral:{' '}
            <span className="text-primary font-mono font-bold">16:55:00 UTC</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-surface-container-high/60 border-b border-outline-variant/40 font-label-caps text-label-caps text-on-surface-variant tracking-wider text-[10px]">
                <th className="py-3 px-4 w-60">PUESTO / UBICACIÓN</th>
                <th className="py-3 px-4 w-44">MESAS INACTIVAS</th>
                <th className="py-3 px-4 w-32">HORA CIERRE LOCAL</th>
                <th className="py-3 px-4 w-36">TIEMPO TRANSCURRIDO (MORA)</th>
                <th className="py-3 px-4 w-48">FASE / NIVEL DE ALERTA</th>
                <th className="py-3 px-4">TRAZABILIDAD ÚLTIMA NOTIFICACIÓN</th>
                <th className="py-3 px-4 w-64 text-right">ACCIÓN OPERATIVA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 font-body-md text-body-md text-on-surface text-[12px]">
              {filteredRows.map((row) => {
                const isCrit = row.fase === 'fase3';
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-surface-container/60 transition-colors ${
                      isCrit
                        ? 'border-l-4 border-l-tertiary-container'
                        : 'border-l-4 border-l-secondary-container'
                    }`}
                  >
                    {/* Location */}
                    <td className="py-3 px-4 align-top">
                      <div className="font-headline-md text-[14px] text-primary font-bold tracking-tight">
                        {row.consulateName}
                      </div>
                      <div className="font-body-md text-[11px] text-on-surface-variant tracking-wider uppercase mt-0.5 flex items-center gap-1">
                        <span>{row.pais}</span>
                        <span className="text-outline">&gt;</span>
                        <span>ZONA {row.zona}</span>
                        <span className="text-outline">&gt;</span>
                        <span className="text-on-surface font-mono">{row.puesto}</span>
                      </div>
                    </td>

                    {/* Mesas */}
                    <td className="py-3 px-4 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {row.mesasInactivas.map((m, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded bg-surface-container-highest border border-outline-variant/40 font-mono text-[11px] text-primary font-semibold"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Hora Cierre */}
                    <td className="py-3 px-4 align-top whitespace-nowrap">
                      <span className="px-2 py-1 rounded bg-surface-container font-stats-number text-[11px] text-on-surface border border-outline-variant/30">
                        {row.horaCierreLocal}
                      </span>
                    </td>

                    {/* Tiempo Transcurrido */}
                    <td className="py-3 px-4 align-top whitespace-nowrap">
                      <div
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-stats-number font-bold text-[12px] ${
                          isCrit
                            ? 'bg-tertiary-container/20 border border-tertiary-container/40 text-tertiary-container'
                            : 'bg-secondary-container/20 border border-secondary-container/40 text-secondary-container'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {isCrit ? 'hourglass_disabled' : 'timer'}
                        </span>
                        {row.tiempoTranscurridoLabel}
                      </div>
                    </td>

                    {/* Fase */}
                    <td className="py-3 px-4 align-top">
                      <div
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-label-caps text-label-caps font-bold tracking-wider text-[10px] ${
                          isCrit
                            ? 'bg-tertiary-container/15 text-tertiary-container border border-tertiary-container/40'
                            : 'bg-secondary-container/15 text-secondary-container border border-secondary-container/40'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isCrit ? 'bg-tertiary-container animate-pulse' : 'bg-secondary-container'
                          }`}
                        ></span>
                        {row.faseLabel}
                      </div>
                      <div className="text-[10px] text-on-surface-variant font-mono mt-1">
                        {row.subFaseDesc}
                      </div>
                    </td>

                    {/* Notificación trace */}
                    <td className="py-3 px-4 align-top">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#25D366]/15 text-[#25D366] border border-[#25D366]/30 flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-[10px]">chat</span> WA
                        </span>
                        {row.notifChannelExtra && (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                              row.notifChannelExtra === 'SMS'
                                ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                                : 'bg-[#25D366]/15 text-[#25D366] border-[#25D366]/30'
                            }`}
                          >
                            {row.notifChannelExtra}
                          </span>
                        )}
                        <span className="text-[11px] text-on-surface font-mono">
                          {row.notifDespacho}
                        </span>
                      </div>
                      <div
                        className="text-[11px] mt-1 flex items-center gap-1"
                        style={{ color: row.notifEstadoColor }}
                      >
                        {row.notifEstado}
                      </div>
                    </td>

                    {/* Operaciones */}
                    <td className="py-3 px-4 whitespace-nowrap align-top text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onOpenHistorial(row)}
                          className="px-2.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface border border-outline-variant/40 font-label-caps text-label-caps font-semibold transition-colors flex items-center gap-1 text-[11px]"
                          title="Ver reporte de estados de notificaciones del puesto"
                        >
                          <span className="material-symbols-outlined text-[14px] text-primary">
                            assessment
                          </span>
                          HISTORIAL
                        </button>

                        <button
                          onClick={() => onOpenWhatsApp(row.consulateName)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] border border-[#25D366]/40 font-label-caps text-label-caps font-bold transition-colors flex items-center gap-1 shadow-sm text-[11px]"
                        >
                          <span className="material-symbols-outlined text-[14px]">chat</span>
                          CHAT WA
                        </button>

                        <button
                          onClick={() => handleSendEmail(row.consulateName)}
                          className="px-2.5 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-variant text-on-surface border border-outline-variant/40 font-label-caps text-label-caps font-semibold transition-colors flex items-center gap-1 text-[11px]"
                        >
                          <span className="material-symbols-outlined text-[14px]">mail</span>
                          {row.fase === 'fase2' ? 'REENVIAR' : 'CORREO'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer / Telemetry Bar */}
        <div className="p-3 bg-surface-container border-t border-outline-variant/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-on-surface-variant font-body-md text-[11px]">
          <div className="flex items-center gap-3">
            <span>
              Mostrando <span className="text-on-surface font-semibold">5 de 8</span> consulados
              con mesas fuera de SLA (&gt;20 min)
            </span>
            <span className="h-3 w-[1px] bg-outline-variant"></span>
            <span className="flex items-center gap-1 text-primary">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping"></span>
              Monitor de latencia operacional: 0.8s
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface border border-outline-variant/40 disabled:opacity-40"
              disabled
            >
              <span className="material-symbols-outlined text-[14px]">chevron_left</span>
            </button>
            <span className="px-2 py-0.5 rounded bg-surface-container-highest text-primary font-mono font-bold">
              1
            </span>
            <button className="px-2 py-1 rounded bg-surface-container-high hover:bg-surface-variant text-on-surface border border-outline-variant/40">
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
