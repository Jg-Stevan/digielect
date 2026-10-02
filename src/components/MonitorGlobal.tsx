import React, { useState } from 'react';
import { ConsulateRow, StatusType } from '../types';

interface MonitorGlobalProps {
  consulates: ConsulateRow[];
  onOpenReinspection: (mesaId?: string) => void;
  onOpenWhatsApp: (consulateName: string) => void;
}

export const MonitorGlobal: React.FC<MonitorGlobalProps> = ({
  consulates,
  onOpenReinspection,
  onOpenWhatsApp,
}) => {
  const [expandedRowId, setExpandedRowId] = useState<string | null>('italia-roma');
  const [selectedPais, setSelectedPais] = useState<string>('Todos');
  const [selectedEstado, setSelectedEstado] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [notificationToast, setNotificationToast] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  };

  const handleNotifyMesa = (mesaNumber: string, consulateName: string) => {
    setNotificationToast(`Notificación despachada con éxito a ${consulateName} (${mesaNumber}).`);
    setTimeout(() => {
      setNotificationToast(null);
    }, 3500);
  };

  // Filtered rows
  const filteredConsulates = consulates.filter((row) => {
    if (selectedPais !== 'Todos' && !row.pais.toLowerCase().includes(selectedPais.toLowerCase())) {
      return false;
    }
    if (selectedEstado !== 'Todos' && row.estadoGlobal !== selectedEstado) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = `${row.code} ${row.pais} ${row.puesto} ${row.zona}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-6 max-w-[1440px] mx-auto pb-16">
      {/* Toast Notification */}
      {notificationToast && (
        <div className="fixed top-16 right-6 z-50 bg-[#0e1414] border border-primary text-primary px-4 py-2.5 rounded shadow-xl flex items-center gap-2 text-label-caps animate-in fade-in slide-in-from-top-2">
          <span className="material-symbols-outlined text-[18px]">mark_email_read</span>
          <span>{notificationToast}</span>
        </div>
      )}

      {/* Summary Cards */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-surface-container p-4 border border-outline-variant relative rounded-sm">
          <h3 className="text-label-caps font-label-caps text-on-surface-variant mb-2 uppercase">
            TOTAL PUESTOS
          </h3>
          <div className="text-stats-number font-stats-number text-right text-on-surface">20</div>
        </div>

        <div className="bg-surface-container p-4 border border-outline-variant relative border-t-2 border-t-primary rounded-sm">
          <h3 className="text-label-caps font-label-caps text-primary mb-2 uppercase">COMPLETO</h3>
          <div className="text-stats-number font-stats-number text-right text-primary">5</div>
        </div>

        <div className="bg-surface-container p-4 border border-outline-variant relative border-t-2 border-t-error rounded-sm">
          <h3 className="text-label-caps font-label-caps text-error mb-2 uppercase">CRÍTICO</h3>
          <div className="text-stats-number font-stats-number text-right text-error">1</div>
        </div>

        <div className="bg-surface-container p-4 border border-outline-variant relative border-t-2 border-t-secondary-fixed-dim rounded-sm">
          <h3 className="text-label-caps font-label-caps text-secondary-fixed-dim mb-2 uppercase">
            PENDIENTE
          </h3>
          <div className="text-stats-number font-stats-number text-right text-secondary-fixed-dim">
            4
          </div>
        </div>

        <div className="bg-surface-container p-4 border border-outline-variant relative border-t-2 border-t-[#869583] rounded-sm">
          <h3 className="text-label-caps font-label-caps text-[#869583] mb-2 uppercase">
            NO INICIADO
          </h3>
          <div className="text-stats-number font-stats-number text-right text-[#869583]">10</div>
        </div>
      </section>

      <hr className="border-t border-[#242E2E]" />

      {/* Filters Toolbar */}
      <section className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
          <label className="text-label-caps font-label-caps text-on-surface-variant uppercase text-[11px]">
            PAÍS
          </label>
          <select
            value={selectedPais}
            onChange={(e) => setSelectedPais(e.target.value)}
            className="bg-[#121919] border border-[#242E2E] text-body-md font-body-md text-on-surface rounded-none p-2 h-[36px] focus:border-primary focus:ring-0 outline-none"
          >
            <option value="Todos">Todos</option>
            <option value="Italia">Italia</option>
            <option value="España">España</option>
            <option value="Paises Bajos">Países Bajos</option>
            <option value="Inglaterra">Inglaterra</option>
            <option value="Estados Unidos">Estados Unidos</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
          <label className="text-label-caps font-label-caps text-on-surface-variant uppercase text-[11px]">
            FECHA
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant">
              calendar_month
            </span>
            <input
              className="bg-[#121919] border border-[#242E2E] text-body-md font-body-md text-on-surface rounded-none pl-8 p-2 h-[36px] w-full focus:border-primary focus:ring-0 outline-none"
              readOnly
              type="text"
              defaultValue="Lunes, 30 Ago"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
          <label className="text-label-caps font-label-caps text-on-surface-variant uppercase text-[11px]">
            ZONA
          </label>
          <select className="bg-[#121919] border border-[#242E2E] text-body-md font-body-md text-on-surface rounded-none p-2 h-[36px] focus:border-primary focus:ring-0 outline-none">
            <option>Todos</option>
            <option>Zona 01</option>
            <option>Zona 05</option>
            <option>Zona 10</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
          <label className="text-label-caps font-label-caps text-on-surface-variant uppercase text-[11px]">
            PUESTO
          </label>
          <select className="bg-[#121919] border border-[#242E2E] text-body-md font-body-md text-on-surface rounded-none p-2 h-[36px] focus:border-primary focus:ring-0 outline-none">
            <option>Todas</option>
            <option>Consulado Roma</option>
            <option>Consulado La Haya</option>
            <option>Consulado Tarragona</option>
            <option>Consulado Londres</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 flex-[2] min-w-[250px]">
          <label className="text-label-caps font-label-caps text-on-surface-variant uppercase text-[11px]">
            BÚSQUEDA RÁPIDA
          </label>
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant">
              search
            </span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#121919] border border-[#242E2E] text-body-md font-body-md text-on-surface rounded-none pl-8 p-2 h-[36px] w-full focus:border-primary focus:ring-0 placeholder:text-[#3c4a3c] outline-none"
              placeholder="Buscar por ID o Nombre."
              type="text"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
          <label className="text-label-caps font-label-caps text-on-surface-variant uppercase text-[11px]">
            ESTADO
          </label>
          <select
            value={selectedEstado}
            onChange={(e) => setSelectedEstado(e.target.value)}
            className="bg-[#121919] border border-[#242E2E] text-body-md font-body-md text-on-surface rounded-none p-2 h-[36px] focus:border-primary focus:ring-0 outline-none"
          >
            <option value="Todos">Todos</option>
            <option value="COMPLETO">COMPLETO</option>
            <option value="CRÍTICO">CRÍTICO</option>
            <option value="PENDIENTE">PENDIENTE</option>
            <option value="NO INICIADO">NO INICIADO</option>
          </select>
        </div>
      </section>

      <hr className="border-t border-[#242E2E]" />

      {/* Status Actions Header */}
      <div className="flex justify-between items-center bg-surface-container p-3 border border-outline-variant">
        <h2 className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider text-[11px]">
          RESUMEN DE ESTADO
        </h2>
        <div className="flex gap-3">
          <button
            onClick={() => setSelectedEstado(selectedEstado === 'CRÍTICO' ? 'Todos' : 'CRÍTICO')}
            className={`flex items-center gap-2 px-3 py-1.5 border border-[#410004] transition-colors ${
              selectedEstado === 'CRÍTICO'
                ? 'bg-[#410004]/40 text-error'
                : 'bg-[#410004]/10 text-error hover:bg-[#410004]/20'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">electric_bolt</span>
            <span className="text-label-caps font-label-caps">CRÍTICO: 1</span>
          </button>
          <button
            onClick={() => setSelectedEstado(selectedEstado === 'PENDIENTE' ? 'Todos' : 'PENDIENTE')}
            className={`flex items-center gap-2 px-3 py-1.5 border border-[#544600] transition-colors ${
              selectedEstado === 'PENDIENTE'
                ? 'bg-[#544600]/40 text-secondary-fixed-dim'
                : 'bg-[#544600]/10 text-secondary-fixed-dim hover:bg-[#544600]/20'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">schedule</span>
            <span className="text-label-caps font-label-caps">PENDIENTE: 4</span>
          </button>
          <button
            onClick={() => setSelectedEstado(selectedEstado === 'COMPLETO' ? 'Todos' : 'COMPLETO')}
            className={`flex items-center gap-2 px-3 py-1.5 border border-[#003912] transition-colors ${
              selectedEstado === 'COMPLETO'
                ? 'bg-[#003912]/40 text-primary'
                : 'bg-[#003912]/10 text-primary hover:bg-[#003912]/20'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            <span className="text-label-caps font-label-caps">COMPLETO: 5</span>
          </button>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="border border-outline-variant bg-[#121919] overflow-x-auto">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-[#242E2E] sticky top-0 bg-[#121919] z-10 min-w-[1100px] text-left">
          <div className="col-span-2 text-label-caps font-label-caps text-on-surface-variant uppercase">
            PAÍS
          </div>
          <div className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase text-center">
            ZONA
          </div>
          <div className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase">
            PUESTO
          </div>
          <div className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase text-center">
            # MESAS
          </div>
          <div className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase text-center leading-tight">
            HORA CIERRE
            <br />
            COLOMBIA
          </div>
          <div className="col-span-1 text-label-caps font-label-caps text-primary uppercase text-center leading-tight">
            HORA
            <br />
            ACTUAL
            <br />
            PAÍS
          </div>
          <div className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase text-center leading-tight">
            TIEMPO
            <br />
            DESDE
            <br />
            CIERRE
          </div>
          <div className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase text-center">
            E-14
            <br />
            DELEGADOS
          </div>
          <div className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase text-center">
            E14-
            <br />
            TRANSMISIÓN
          </div>
          <div className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase text-center">
            ESTADO
            <br />
            GLOBAL
          </div>
          <div className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase text-center">
            ACCIONES
          </div>
        </div>

        {/* Rows */}
        <div className="flex flex-col min-w-[1100px]">
          {filteredConsulates.map((row) => {
            const isExpanded = expandedRowId === row.id;
            const isCritical = row.estadoGlobal === 'CRÍTICO';
            const isPending = row.estadoGlobal === 'PENDIENTE';
            const isComplete = row.estadoGlobal === 'COMPLETO';
            const isNotStarted = row.estadoGlobal === 'NO INICIADO';

            return (
              <React.Fragment key={row.id}>
                <div
                  className={`grid grid-cols-12 gap-3 px-4 py-3 border-b border-[#242E2E] items-center hover:bg-[#1A2323] transition-colors ${
                    isCritical ? 'border-l-4 border-l-error bg-surface-container-high/40' : ''
                  } ${isPending ? 'border-l-4 border-l-secondary-fixed-dim' : ''} ${
                    isComplete ? '' : ''
                  } ${isNotStarted ? 'opacity-65' : ''}`}
                >
                  {/* País */}
                  <div
                    onClick={() => row.mesas.length > 0 && toggleExpand(row.id)}
                    className="col-span-2 flex items-center gap-2 cursor-pointer text-body-md font-body-md font-bold text-on-surface"
                  >
                    {row.mesas.length > 0 ? (
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                        {isExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                    ) : (
                      <span className="w-4"></span>
                    )}
                    <span>
                      {row.code} - {row.pais}
                    </span>
                  </div>

                  {/* Zona */}
                  <div className="col-span-1 text-body-md font-body-md text-center">{row.zona}</div>

                  {/* Puesto */}
                  <div className="col-span-1 text-body-md font-body-md truncate" title={row.puesto}>
                    {row.puesto}
                  </div>

                  {/* # Mesas */}
                  <div className="col-span-1 text-body-md font-body-md text-center">
                    {row.numMesas}
                  </div>

                  {/* Hora Cierre Col */}
                  <div className="col-span-1 flex justify-center">
                    <span className="border border-[#242E2E] px-2 py-0.5 text-[10px] text-on-surface-variant font-stats-number">
                      {row.horaCierreColombia}
                    </span>
                  </div>

                  {/* Hora Actual Pais */}
                  <div className="col-span-1 flex justify-center">
                    <span className="border border-primary px-2 py-0.5 text-[10px] text-primary font-stats-number">
                      {row.horaActualPais}
                    </span>
                  </div>

                  {/* Tiempo desde cierre */}
                  <div
                    className={`col-span-1 text-body-md font-body-md text-center font-bold ${
                      isCritical
                        ? 'text-error'
                        : isPending
                        ? 'text-secondary-fixed-dim'
                        : isComplete
                        ? 'text-primary'
                        : 'text-on-surface-variant'
                    }`}
                  >
                    {row.tiempoDesdeCierre}
                  </div>

                  {/* E-14 Delegados Progress */}
                  <div className="col-span-1 flex flex-col items-center gap-1">
                    <span className="text-body-md font-body-md font-stats-number">
                      {row.delegadosProgress}
                    </span>
                    <div className="w-full bg-[#242E2E] h-1 flex rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          row.delegadosPercent === 100
                            ? 'bg-primary'
                            : row.delegadosPercent === 0
                            ? 'bg-error'
                            : 'bg-error'
                        }`}
                        style={{ width: `${row.delegadosPercent}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* E-14 Transmision Progress */}
                  <div className="col-span-1 flex flex-col items-center gap-1">
                    <span className="text-body-md font-body-md font-stats-number">
                      {row.transmisionProgress}
                    </span>
                    <div className="w-full bg-[#242E2E] h-1 flex rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          row.transmisionPercent === 100
                            ? 'bg-primary'
                            : row.transmisionPercent === 50
                            ? 'bg-secondary-fixed-dim'
                            : 'bg-error'
                        }`}
                        style={{ width: `${row.transmisionPercent}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Estado Global Chip */}
                  <div className="col-span-1 flex justify-center">
                    {isCritical && (
                      <span className="bg-[#410004]/20 border border-[#410004] text-error px-3 py-1 text-label-caps font-label-caps rounded-full whitespace-nowrap">
                        CRÍTICO
                      </span>
                    )}
                    {isPending && (
                      <span className="bg-[#544600]/20 border border-[#544600] text-secondary-fixed-dim px-3 py-1 text-label-caps font-label-caps rounded-full whitespace-nowrap">
                        PENDIENTE
                      </span>
                    )}
                    {isComplete && (
                      <span className="bg-[#003912]/20 border border-[#003912] text-primary px-3 py-1 text-label-caps font-label-caps rounded-full whitespace-nowrap">
                        COMPLETO
                      </span>
                    )}
                    {isNotStarted && (
                      <span className="bg-[#3c4a3c]/20 border border-[#3c4a3c] text-[#bbcbb8] px-3 py-1 text-label-caps font-label-caps rounded-full whitespace-nowrap">
                        NO INICIADO
                      </span>
                    )}
                  </div>

                  {/* Acciones */}
                  <div className="col-span-1 flex justify-center gap-2">
                    <button
                      onClick={() => onOpenReinspection(row.mesas[0]?.id)}
                      className="text-on-surface-variant hover:text-primary transition-colors p-1"
                      title="Ver actas y detalles"
                    >
                      <span className="material-symbols-outlined text-[18px]">visibility</span>
                    </button>
                    <button
                      onClick={() => onOpenWhatsApp(row.pais)}
                      className="text-on-surface-variant hover:text-secondary-fixed-dim transition-colors p-1"
                      title="Notificación urgente WhatsApp / Alerta"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        notification_important
                      </span>
                    </button>
                  </div>
                </div>

                {/* Sub-table (Accordion) */}
                {isExpanded && row.mesas.length > 0 && (
                  <div className="bg-surface-container-lowest border-b border-[#242E2E] px-6 py-4">
                    <div className="border border-[#242E2E] bg-[#090f0f] rounded-sm overflow-hidden">
                      {/* Sub-table Header */}
                      <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-[#1b2121] border-b border-[#242E2E]">
                        <div className="col-span-2 text-label-caps font-label-caps text-[#869583] uppercase">
                          MESA
                        </div>
                        <div className="col-span-2 text-label-caps font-label-caps text-[#869583] uppercase text-center">
                          DELEGADOS
                        </div>
                        <div className="col-span-3 text-label-caps font-label-caps text-[#869583] uppercase text-center">
                          TRANSMISIÓN
                        </div>
                        <div className="col-span-2 text-label-caps font-label-caps text-[#869583] uppercase text-center">
                          ESTADO MESA
                        </div>
                        <div className="col-span-2 text-label-caps font-label-caps text-[#869583] uppercase text-center">
                          ULTIMA CARGA
                        </div>
                        <div className="col-span-1 text-label-caps font-label-caps text-[#869583] uppercase text-right">
                          ACCIÓN
                        </div>
                      </div>

                      {/* Sub-table Rows */}
                      {row.mesas.map((mesa) => (
                        <div
                          key={mesa.id}
                          className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-[#242E2E] last:border-b-0 items-center hover:bg-[#121919] transition-colors"
                        >
                          <div className="col-span-2 text-body-md font-body-md text-on-surface font-semibold">
                            {mesa.mesaNumber}
                          </div>

                          {/* Delegados Status */}
                          <div className="col-span-2 flex justify-center gap-1.5 font-stats-number">
                            {mesa.delegados.p1 ? (
                              <span className="bg-[#003912] text-primary px-1.5 py-0.5 rounded text-[10px] font-bold">
                                P1 ✓
                              </span>
                            ) : (
                              <span className="bg-[#242E2E] text-[#869583] px-1.5 py-0.5 rounded text-[10px] font-bold">
                                P1 ⏳
                              </span>
                            )}
                            {mesa.delegados.p2 ? (
                              <span className="bg-[#003912] text-primary px-1.5 py-0.5 rounded text-[10px] font-bold">
                                P2 ✓
                              </span>
                            ) : (
                              <span className="bg-[#242E2E] text-[#869583] px-1.5 py-0.5 rounded text-[10px] font-bold">
                                P2 ⏳
                              </span>
                            )}
                          </div>

                          {/* Transmisión Status */}
                          <div className="col-span-3 flex justify-center gap-1.5 font-stats-number">
                            {mesa.transmision.p1 === true ? (
                              <span className="bg-[#003912] text-primary px-1.5 py-0.5 rounded text-[10px] font-bold">
                                P1 ✓
                              </span>
                            ) : mesa.transmision.p1 === 'pending' ? (
                              <span className="bg-[#242E2E] text-[#869583] px-1.5 py-0.5 rounded text-[10px] font-bold">
                                P1 ⏳
                              </span>
                            ) : (
                              <span className="bg-[#410004] text-error px-1.5 py-0.5 rounded text-[10px] font-bold">
                                P1 ✕
                              </span>
                            )}

                            {mesa.transmision.p2 === 'rescaneo' ? (
                              <span className="bg-[#410004] text-error px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 border border-error/40">
                                P2 <span className="material-symbols-outlined text-[12px]">warning</span>{' '}
                                Rescaneo
                              </span>
                            ) : mesa.transmision.p2 === true ? (
                              <span className="bg-[#003912] text-primary px-1.5 py-0.5 rounded text-[10px] font-bold">
                                P2 ✓
                              </span>
                            ) : (
                              <span className="bg-[#242E2E] text-[#869583] px-1.5 py-0.5 rounded text-[10px] font-bold">
                                P2 ⏳
                              </span>
                            )}
                          </div>

                          {/* Estado Mesa */}
                          <div className="col-span-2 flex justify-center">
                            {mesa.estado === 'INCOMPLETO' && (
                              <span className="border border-[#410004] bg-[#410004]/10 text-error px-2.5 py-0.5 text-[10px] font-label-caps rounded-full">
                                INCOMPLETO
                              </span>
                            )}
                            {mesa.estado === 'PENDIENTE' && (
                              <span className="border border-[#544600] bg-[#544600]/10 text-secondary-fixed-dim px-2.5 py-0.5 text-[10px] font-label-caps rounded-full">
                                PENDIENTE
                              </span>
                            )}
                            {mesa.estado === 'NO INICIADO' && (
                              <span className="border border-[#3c4a3c] text-[#869583] px-2.5 py-0.5 text-[10px] font-label-caps rounded-full">
                                NO INICIADO
                              </span>
                            )}
                            {mesa.estado === 'COMPLETO' && (
                              <span className="border border-[#003912] bg-[#003912]/20 text-primary px-2.5 py-0.5 text-[10px] font-label-caps rounded-full">
                                COMPLETO
                              </span>
                            )}
                          </div>

                          {/* Ultima Carga */}
                          <div className="col-span-2 text-body-md font-body-md text-center text-on-surface-variant font-stats-number">
                            {mesa.ultimaCarga}
                          </div>

                          {/* Acción */}
                          <div className="col-span-1 flex justify-end">
                            {mesa.transmision.p2 === 'rescaneo' || mesa.estado === 'INCOMPLETO' ? (
                              <button
                                onClick={() => onOpenReinspection(mesa.id)}
                                className="text-[10px] font-label-caps text-primary border border-primary px-2 py-1 hover:bg-primary/10 transition-colors uppercase whitespace-nowrap rounded-sm"
                              >
                                REINSPECCIONAR
                              </button>
                            ) : (
                              <button
                                onClick={() => handleNotifyMesa(mesa.mesaNumber, row.puesto)}
                                className="text-[10px] font-label-caps text-secondary-fixed-dim border border-[#544600] px-2 py-1 hover:bg-[#544600]/10 transition-colors uppercase whitespace-nowrap rounded-sm"
                              >
                                NOTIFICAR
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
