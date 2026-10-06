"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  MailCheck,
  Search,
  Zap,
} from "lucide-react";
import type {
  ConsulateRow,
  MesaDetail,
  PageStatus,
  ResumenGlobal,
  StatusType,
} from "@/lib/types";
import { apiNotificarMesa } from "@/lib/api-client";
import { DemoBadge } from "./DemoBadge";

/** Fecha local del navegador formateada en español (solo lectura, decorativa) */
function fechaHoy(): string {
  try {
    const s = new Date().toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "short",
    });
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return "—";
  }
}

interface MonitorGlobalProps {
  consulates: ConsulateRow[];
  resumen: ResumenGlobal | null;
  onOpenReinspection: (mesaId?: string) => void;
  onOpenWhatsApp: (consulateName: string) => void;
}

/** Chip de estado de una página de ejemplar (delegados / transmisión) */
const PageChip: React.FC<{ status: PageStatus; page: "P1" | "P2" }> = ({
  status,
  page,
}) => {
  if (status === true) {
    return (
      <span className="bg-[#003912] text-primary px-1.5 py-0.5 rounded text-[10px] font-bold">
        {page} ✓
      </span>
    );
  }
  if (status === "rescaneo") {
    return (
      <span className="bg-[#410004] text-error px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 border border-error/40">
        {page} <AlertTriangle size={12} aria-hidden="true" /> Rescaneo
      </span>
    );
  }
  if (status === false) {
    return (
      <span className="bg-[#410004] text-error px-1.5 py-0.5 rounded text-[10px] font-bold">
        {page} ✕
      </span>
    );
  }
  return (
    <span className="bg-[#242E2E] text-[#869583] px-1.5 py-0.5 rounded text-[10px] font-bold">
      {page} ⏳
    </span>
  );
};

/** Chip redondeado de estado (mesa o global) */
const StatusChip: React.FC<{ estado: StatusType; size?: "sm" | "md" }> = ({
  estado,
  size = "md",
}) => {
  const pad =
    size === "sm" ? "px-2.5 py-0.5 text-[10px]" : "px-3 py-1 text-label-caps";
  const base = `${size === "sm" ? "font-label-caps" : "text-label-caps font-label-caps"} rounded-full whitespace-nowrap`;
  switch (estado) {
    case "CRÍTICO":
      return (
        <span className={`bg-[#410004]/20 border border-[#410004] text-error ${pad} ${base}`}>
          CRÍTICO
        </span>
      );
    case "INCOMPLETO":
      return (
        <span className={`border border-[#410004] bg-[#410004]/10 text-error ${pad} ${base}`}>
          INCOMPLETO
        </span>
      );
    case "PENDIENTE":
      return (
        <span className={`bg-[#544600]/20 border border-[#544600] text-secondary-fixed-dim ${pad} ${base}`}>
          PENDIENTE
        </span>
      );
    case "COMPLETO":
      return (
        <span className={`bg-[#003912]/20 border border-[#003912] text-primary ${pad} ${base}`}>
          COMPLETO
        </span>
      );
    default:
      return (
        <span className={`bg-[#3c4a3c]/20 border border-[#3c4a3c] text-[#bbcbb8] ${pad} ${base}`}>
          NO INICIADO
        </span>
      );
  }
};

export const MonitorGlobal: React.FC<MonitorGlobalProps> = ({
  consulates,
  resumen,
  onOpenReinspection,
  onOpenWhatsApp,
}) => {
  const [haInteractuado, setHaInteractuado] = useState(false);
  const [expandedOverride, setExpandedOverride] = useState<string | null>(null);
  const [selectedPais, setSelectedPais] = useState<string>("Todos");
  const [selectedZona, setSelectedZona] = useState<string>("Todos");
  const [selectedPuesto, setSelectedPuesto] = useState<string>("Todos");
  const [selectedEstado, setSelectedEstado] = useState<string>("Todos");
  const [searchQuery, setSearchQuery] = useState<string>("");
  // [S-28] Búsqueda con debounce: el filtrado de 949 filas × 3.670
  // subfilas NO corre en cada tecla — 250 ms de gracia por letra.
  const [searchEfectiva, setSearchEfectiva] = useState<string>("");
  const [notificationToast, setNotificationToast] = useState<{
    texto: string;
    demo: boolean;
  } | null>(null);
  const [notificandoMesa, setNotificandoMesa] = useState<string | null>(null);

  const totalPuestos = resumen?.totalPuestos ?? 0;
  const nCompleto = resumen?.completo ?? 0;
  const nCritico = resumen?.critico ?? 0;
  const nPendiente = resumen?.pendiente ?? 0;
  const nNoIniciado = resumen?.noIniciado ?? 0;

  /** Guardia defensiva: el contrato exige ConsulateRow[], pero toleramos undefined */
  const rows: ConsulateRow[] = Array.isArray(consulates) ? consulates : [];

  /** Opciones de filtro derivadas dinámicamente de los datos */
  const paisesUnicos = useMemo(
    () => Array.from(new Set(rows.map((c) => c.pais))),
    [rows]
  );
  const zonasUnicas = useMemo(
    () =>
      Array.from(new Set(rows.map((c) => c.zona))).sort((a, b) =>
        a.localeCompare(b, "es", { numeric: true })
      ),
    [rows]
  );
  const puestosUnicos = useMemo(
    () => Array.from(new Set(rows.map((c) => c.puesto))),
    [rows]
  );

  /** Fila expandida: derivada por defecto (primer crítico con mesas, como el original con Roma)
   *  y sustituible por interacción del usuario — sin efectos síncronos */
  const defaultExpandedId = useMemo(() => {
    const critico = rows.find(
      (r) => r.estadoGlobal === "CRÍTICO" && r.mesas.length > 0
    );
    return (critico ?? rows.find((r) => r.mesas.length > 0))?.id ?? null;
  }, [rows]);

  const expandedRowId = haInteractuado ? expandedOverride : defaultExpandedId;

  /** Fecha local del navegador (render puro; suppressHydrationWarning evita diferencias SSR) */

  /** Auto-ocultar el toast de notificación (con limpieza del timeout) */
  useEffect(() => {
    if (!notificationToast) return;
    const t = setTimeout(() => setNotificationToast(null), 3500);
    return () => clearTimeout(t);
  }, [notificationToast]);

  /** [S-28] Debounce de la búsqueda: 250 ms sin teclas → aplica el filtro */
  useEffect(() => {
    const t = setTimeout(() => setSearchEfectiva(searchQuery), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  /** [S-39] Cambiar cualquier filtro resetea la fila expandida: la
   *  expansión nunca queda "invisible" apuntando a una fila filtrada. */
  const cambiarFiltro = (
    setter: (v: string) => void
  ): ((e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => void) =>
    (e) => {
      setter(e.target.value);
      setHaInteractuado(true);
      setExpandedOverride(null);
    };

  const toggleExpand = (id: string) => {
    setHaInteractuado(true);
    setExpandedOverride(expandedRowId === id ? null : id);
  };

  /**
   * [S-12] NOTIFICAR ahora REGISTRA la notificación (POST
   * /api/notificaciones → NotificacionSla + audit + refresco). En modo
   * demo no hay backend: el toast se marca con <DemoBadge /> — nunca
   * más un "despachada con éxito" sin nada detrás.
   */
  const handleNotifyMesa = async (
    mesa: MesaDetail,
    consulado: ConsulateRow
  ) => {
    if (notificandoMesa) return;
    setNotificandoMesa(mesa.id);
    try {
      const json = await apiNotificarMesa({
        consuladoId: consulado.id,
        mesaId: mesa.id,
        mesaLabel: mesa.mesaNumber,
      });
      if (!json.ok) {
        setNotificationToast({
          texto: `No se pudo registrar la notificación (${json.error ?? "error"})`,
          demo: false,
        });
        return;
      }
      setNotificationToast({
        texto: json.demo
          ? `Notificación de ${mesa.mesaNumber} · ${consulado.puesto} registrada`
          : `Notificación de ${mesa.mesaNumber} · ${consulado.puesto} REGISTRADA en SLA (${json.despachadoCol ?? ""} COL · fase ${json.fase ?? 1})`,
        demo: Boolean(json.demo),
      });
    } catch {
      setNotificationToast({
        texto: "Error de red registrando la notificación",
        demo: false,
      });
    } finally {
      setNotificandoMesa(null);
    }
  };

  // Filtrado de filas — [S-28] memoizado sobre los filtros + búsqueda
  // con debounce (antes se re-filtraban 949 filas en cada keystroke)
  const filteredConsulates = useMemo(() => {
    return rows.filter((row) => {
      if (selectedPais !== "Todos" && row.pais !== selectedPais) return false;
      if (selectedZona !== "Todos" && row.zona !== selectedZona) return false;
      if (selectedPuesto !== "Todos" && row.puesto !== selectedPuesto) return false;
      if (selectedEstado !== "Todos" && row.estadoGlobal !== selectedEstado) {
        return false;
      }
      if (searchEfectiva.trim()) {
        const q = searchEfectiva.toLowerCase();
        const matchText = `${row.code} ${row.pais} ${row.puesto} ${row.zona}`.toLowerCase();
        if (!matchText.includes(q)) return false;
      }
      return true;
    });
  }, [rows, selectedPais, selectedZona, selectedPuesto, selectedEstado, searchEfectiva]);

  const selectCls =
    "bg-[#121919] border border-[#242E2E] text-body-md font-body-md text-on-surface rounded-none p-2 h-[36px] focus:border-primary focus:ring-0 focus:outline-none";
  const filterLabelCls =
    "text-label-caps font-label-caps text-on-surface-variant uppercase text-[11px]";

  return (
    <div className="flex flex-col gap-6 max-w-[1440px] mx-auto pb-16">
      {/* Toast de notificación — [S-12] marcado DEMO cuando no hay backend */}
      {notificationToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 right-6 z-50 bg-[#0e1414] border border-primary text-primary px-4 py-2.5 rounded shadow-xl flex items-center gap-2 text-label-caps font-label-caps animate-in fade-in slide-in-from-top-2"
        >
          <MailCheck size={18} aria-hidden="true" />
          <span>{notificationToast.texto}</span>
          {notificationToast.demo && (
            <DemoBadge
              texto="DEMO"
              motivo="Modo demo estático: la notificación no se persiste (no hay backend)."
            />
          )}
        </div>
      )}

      {/* Tarjetas de resumen (valores dinámicos del prop resumen) */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4" aria-label="Resumen global de puestos">
        <div className="bg-surface-container p-4 border border-outline-variant relative rounded-sm">
          <h3 className="text-label-caps font-label-caps text-on-surface-variant mb-2 uppercase">
            TOTAL PUESTOS
          </h3>
          <div className="text-stats-number font-stats-number text-right text-on-surface">
            {totalPuestos}
          </div>
        </div>

        <div className="bg-surface-container p-4 border border-outline-variant relative border-t-2 border-t-primary rounded-sm">
          <h3 className="text-label-caps font-label-caps text-primary mb-2 uppercase">
            COMPLETO
          </h3>
          <div className="text-stats-number font-stats-number text-right text-primary">
            {nCompleto}
          </div>
        </div>

        <div className="bg-surface-container p-4 border border-outline-variant relative border-t-2 border-t-error rounded-sm">
          <h3 className="text-label-caps font-label-caps text-error mb-2 uppercase">
            CRÍTICO
          </h3>
          <div className="text-stats-number font-stats-number text-right text-error">
            {nCritico}
          </div>
        </div>

        <div className="bg-surface-container p-4 border border-outline-variant relative border-t-2 border-t-secondary-fixed-dim rounded-sm">
          <h3 className="text-label-caps font-label-caps text-secondary-fixed-dim mb-2 uppercase">
            PENDIENTE
          </h3>
          <div className="text-stats-number font-stats-number text-right text-secondary-fixed-dim">
            {nPendiente}
          </div>
        </div>

        <div className="bg-surface-container p-4 border border-outline-variant relative border-t-2 border-t-[#869583] rounded-sm">
          <h3 className="text-label-caps font-label-caps text-[#869583] mb-2 uppercase">
            NO INICIADO
          </h3>
          <div className="text-stats-number font-stats-number text-right text-[#869583]">
            {nNoIniciado}
          </div>
        </div>
      </section>

      <hr className="border-t border-[#242E2E]" />

      {/* Barra de filtros (países derivados de los datos) */}
      <section className="flex flex-wrap gap-4 items-end" aria-label="Filtros del monitor global">
        <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
          <label htmlFor="filtro-pais" className={filterLabelCls}>
            PAÍS
          </label>
          <select
            id="filtro-pais"
            value={selectedPais}
            onChange={cambiarFiltro(setSelectedPais)}
            className={selectCls}
          >
            <option value="Todos">Todos</option>
            {paisesUnicos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
          <label htmlFor="filtro-fecha" className={filterLabelCls}>
            FECHA
          </label>
          <div className="relative">
            <CalendarDays
              size={16}
              aria-hidden="true"
              className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
            />
            <input
              id="filtro-fecha"
              className="bg-[#121919] border border-[#242E2E] text-body-md font-body-md text-on-surface rounded-none pl-8 p-2 h-[36px] w-full focus:border-primary focus:ring-0 outline-none"
              readOnly
              type="text"
              value={fechaHoy()}
              suppressHydrationWarning
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
          <label htmlFor="filtro-zona" className={filterLabelCls}>
            ZONA
          </label>
          <select
            id="filtro-zona"
            value={selectedZona}
            onChange={cambiarFiltro(setSelectedZona)}
            className={selectCls}
          >
            <option value="Todos">Todos</option>
            {zonasUnicas.map((z) => (
              <option key={z} value={z}>
                Zona {z}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
          <label htmlFor="filtro-puesto" className={filterLabelCls}>
            PUESTO
          </label>
          <select
            id="filtro-puesto"
            value={selectedPuesto}
            onChange={cambiarFiltro(setSelectedPuesto)}
            className={selectCls}
          >
            <option value="Todos">Todos</option>
            {puestosUnicos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 flex-[2] min-w-[250px]">
          <label htmlFor="filtro-busqueda" className={filterLabelCls}>
            BÚSQUEDA RÁPIDA
          </label>
          <div className="relative">
            <Search
              size={16}
              aria-hidden="true"
              className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
            />
            <input
              id="filtro-busqueda"
              value={searchQuery}
              onChange={cambiarFiltro(setSearchQuery)}
              className="bg-[#121919] border border-[#242E2E] text-body-md font-body-md text-on-surface rounded-none pl-8 p-2 h-[36px] w-full focus:border-primary focus:ring-0 placeholder:text-[#3c4a3c] outline-none"
              placeholder="Buscar por ID o Nombre."
              type="text"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[150px]">
          <label htmlFor="filtro-estado" className={filterLabelCls}>
            ESTADO
          </label>
          <select
            id="filtro-estado"
            value={selectedEstado}
            onChange={cambiarFiltro(setSelectedEstado)}
            className={selectCls}
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

      {/* Cabecera de acciones de estado */}
      <div className="flex flex-wrap gap-2 justify-between items-center bg-surface-container p-3 border border-outline-variant">
        <h2 className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-wider text-[11px]">
          RESUMEN DE ESTADO
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() =>
              setSelectedEstado(selectedEstado === "CRÍTICO" ? "Todos" : "CRÍTICO")
            }
            className={`flex items-center gap-2 px-3 py-1.5 border border-[#410004] transition-colors ${
              selectedEstado === "CRÍTICO"
                ? "bg-[#410004]/40 text-error"
                : "bg-[#410004]/10 text-error hover:bg-[#410004]/20"
            }`}
            aria-pressed={selectedEstado === "CRÍTICO"}
            aria-label={`Filtrar puestos en estado crítico (${nCritico})`}
          >
            <Zap size={16} aria-hidden="true" />
            <span className="text-label-caps font-label-caps">
              CRÍTICO: {nCritico}
            </span>
          </button>
          <button
            onClick={() =>
              setSelectedEstado(selectedEstado === "PENDIENTE" ? "Todos" : "PENDIENTE")
            }
            className={`flex items-center gap-2 px-3 py-1.5 border border-[#544600] transition-colors ${
              selectedEstado === "PENDIENTE"
                ? "bg-[#544600]/40 text-secondary-fixed-dim"
                : "bg-[#544600]/10 text-secondary-fixed-dim hover:bg-[#544600]/20"
            }`}
            aria-pressed={selectedEstado === "PENDIENTE"}
            aria-label={`Filtrar puestos en estado pendiente (${nPendiente})`}
          >
            <Clock size={16} aria-hidden="true" />
            <span className="text-label-caps font-label-caps">
              PENDIENTE: {nPendiente}
            </span>
          </button>
          <button
            onClick={() =>
              setSelectedEstado(selectedEstado === "COMPLETO" ? "Todos" : "COMPLETO")
            }
            className={`flex items-center gap-2 px-3 py-1.5 border border-[#003912] transition-colors ${
              selectedEstado === "COMPLETO"
                ? "bg-[#003912]/40 text-primary"
                : "bg-[#003912]/10 text-primary hover:bg-[#003912]/20"
            }`}
            aria-pressed={selectedEstado === "COMPLETO"}
            aria-label={`Filtrar puestos en estado completo (${nCompleto})`}
          >
            <CheckCircle2 size={16} aria-hidden="true" />
            <span className="text-label-caps font-label-caps">
              COMPLETO: {nCompleto}
            </span>
          </button>
        </div>
      </div>

      {/* Tabla principal de datos */}
      <div className="border border-outline-variant bg-[#121919] overflow-x-auto">
        {/* Cabecera de la tabla */}
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

        {/* Filas */}
        <div className="flex flex-col min-w-[1100px]">
          {filteredConsulates.map((row) => {
            const isExpanded = expandedRowId === row.id;
            const isCritical = row.estadoGlobal === "CRÍTICO";
            const isPending = row.estadoGlobal === "PENDIENTE";
            const isComplete = row.estadoGlobal === "COMPLETO";
            const isNotStarted = row.estadoGlobal === "NO INICIADO";
            const expandible = row.mesas.length > 0;

            return (
              <React.Fragment key={row.id}>
                <div
                  className={`grid grid-cols-12 gap-3 px-4 py-3 border-b border-[#242E2E] items-center hover:bg-[#1A2323] transition-colors ${
                    isCritical
                      ? "border-l-4 border-l-error bg-surface-container-high/40"
                      : ""
                  } ${isPending ? "border-l-4 border-l-secondary-fixed-dim" : ""} ${
                    isNotStarted ? "opacity-65" : ""
                  }`}
                >
                  {/* País — celda expandible con teclado (Enter/Espacio) */}
                  <button
                    type="button"
                    onClick={() => expandible && toggleExpand(row.id)}
                    aria-expanded={expandible ? isExpanded : undefined}
                    aria-controls={expandible ? `mesas-${row.id}` : undefined}
                    aria-label={
                      expandible
                        ? `${isExpanded ? "Colapsar" : "Expandir"} mesas de ${row.pais}`
                        : `${row.code} - ${row.pais} (sin mesas)`
                    }
                    disabled={!expandible}
                    className={`col-span-2 flex items-center gap-2 text-left text-body-md font-body-md font-bold text-on-surface ${
                      expandible ? "cursor-pointer" : "cursor-default opacity-80"
                    }`}
                  >
                    {expandible ? (
                      isExpanded ? (
                        <ChevronUp
                          size={16}
                          aria-hidden="true"
                          className="text-on-surface-variant shrink-0"
                        />
                      ) : (
                        <ChevronDown
                          size={16}
                          aria-hidden="true"
                          className="text-on-surface-variant shrink-0"
                        />
                      )
                    ) : (
                      <span className="w-4" aria-hidden="true"></span>
                    )}
                    <span className="truncate">
                      {row.code} - {row.pais}
                    </span>
                  </button>

                  {/* Zona */}
                  <div className="col-span-1 text-body-md font-body-md text-center">
                    {row.zona}
                  </div>

                  {/* Puesto */}
                  <div
                    className="col-span-1 text-body-md font-body-md truncate"
                    title={row.puesto}
                  >
                    {row.puesto}
                  </div>

                  {/* # Mesas */}
                  <div className="col-span-1 text-body-md font-body-md text-center">
                    {row.numMesas}
                  </div>

                  {/* Hora Cierre Colombia (reloj 1) */}
                  <div className="col-span-1 flex justify-center">
                    <span
                      className="border border-[#242E2E] px-2 py-0.5 text-[10px] text-on-surface-variant font-stats-number"
                      title="Hora de cierre en Colombia"
                    >
                      {row.horaCierreColombia}
                    </span>
                  </div>

                  {/* Hora Actual País (reloj 2) */}
                  <div className="col-span-1 flex justify-center">
                    <span
                      className="border border-primary px-2 py-0.5 text-[10px] text-primary font-stats-number"
                      title="Hora actual del país del consulado"
                    >
                      {row.horaActualPais}
                    </span>
                  </div>

                  {/* Tiempo desde cierre */}
                  <div
                    className={`col-span-1 text-body-md font-body-md text-center font-bold ${
                      isCritical
                        ? "text-error"
                        : isPending
                          ? "text-secondary-fixed-dim"
                          : isComplete
                            ? "text-primary"
                            : "text-on-surface-variant"
                    }`}
                  >
                    {row.tiempoDesdeCierre}
                  </div>

                  {/* E-14 Delegados — progreso */}
                  <div className="col-span-1 flex flex-col items-center gap-1">
                    <span className="text-body-md font-body-md font-stats-number">
                      {row.delegadosProgress}
                    </span>
                    <div
                      className="w-full bg-[#242E2E] h-1 flex rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={row.delegadosPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`E-14 Delegados ${row.delegadosProgress}`}
                    >
                      <div
                        className={`h-full ${
                          row.delegadosPercent === 100 ? "bg-primary" : "bg-error"
                        }`}
                        style={{ width: `${row.delegadosPercent}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* E-14 Transmisión — progreso */}
                  <div className="col-span-1 flex flex-col items-center gap-1">
                    <span className="text-body-md font-body-md font-stats-number">
                      {row.transmisionProgress}
                    </span>
                    <div
                      className="w-full bg-[#242E2E] h-1 flex rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={row.transmisionPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`E-14 Transmisión ${row.transmisionProgress}`}
                    >
                      <div
                        className={`h-full ${
                          row.transmisionPercent === 100
                            ? "bg-primary"
                            : row.transmisionPercent >= 50
                              ? "bg-secondary-fixed-dim"
                              : "bg-error"
                        }`}
                        style={{ width: `${row.transmisionPercent}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Estado Global */}
                  <div className="col-span-1 flex justify-center">
                    <StatusChip estado={row.estadoGlobal} />
                  </div>

                  {/* Acciones */}
                  <div className="col-span-1 flex justify-center gap-2">
                    {/* [S-13] El ojo abre la mesa CON PROBLEMA (anomalía o
                        estado ≠ COMPLETO), no siempre la mesas[0]: un
                        consulado con 8 mesas y anomalía en la 5 abría la 1. */}
                    <button
                      onClick={() => {
                        const mesaObjetivo =
                          row.mesas.find((m) => m.anomalia) ??
                          row.mesas.find((m) => m.estado !== "COMPLETO") ??
                          row.mesas[0];
                        onOpenReinspection(mesaObjetivo?.id);
                      }}
                      disabled={row.mesas.length === 0}
                      className="text-on-surface-variant hover:text-primary transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                      title={
                        row.mesas.length === 0
                          ? "Sin mesas que auditar"
                          : "Ver actas y detalles"
                      }
                      aria-label={`Ver actas y detalles de ${row.puesto}`}
                    >
                      <Eye size={18} aria-hidden="true" />
                    </button>
                    <button
                      onClick={() => onOpenWhatsApp(row.puesto)}
                      className="text-on-surface-variant hover:text-secondary-fixed-dim transition-colors p-1"
                      title="Notificación urgente WhatsApp / Alerta"
                      aria-label={`Notificación urgente por WhatsApp a ${row.puesto}`}
                    >
                      <BellRing size={18} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Subtabla de mesas (acordeón) */}
                {isExpanded && expandible && (
                  <div
                    id={`mesas-${row.id}`}
                    className="bg-surface-container-lowest border-b border-[#242E2E] px-6 py-4"
                  >
                    <div className="border border-[#242E2E] bg-[#090f0f] rounded-sm overflow-hidden">
                      {/* Cabecera de la subtabla */}
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

                      {/* Filas de la subtabla */}
                      {row.mesas.map((mesa) => {
                        // [S-14] El rescaneo pendiente en DELEGADOS también
                        // exige reinspección (antes solo TRANSMISIÓN contaba
                        // y mostraba el botón NOTIFICAR, inofensivo ahí).
                        const requiereReinspeccion =
                          mesa.transmision.p1 === "rescaneo" ||
                          mesa.transmision.p2 === "rescaneo" ||
                          mesa.delegados.p1 === "rescaneo" ||
                          mesa.delegados.p2 === "rescaneo" ||
                          mesa.estado === "INCOMPLETO" ||
                          mesa.estado === "CRÍTICO";

                        return (
                          <div
                            key={mesa.id}
                            className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-[#242E2E] last:border-b-0 items-center hover:bg-[#121919] transition-colors"
                          >
                            <div className="col-span-2 text-body-md font-body-md text-on-surface font-semibold flex items-center gap-1.5">
                              {mesa.mesaNumber}
                              {mesa.anomalia && (
                                <span
                                  role="img"
                                  aria-label={`Anomalía: ${mesa.anomalia}`}
                                  title={mesa.anomalia}
                                  className="text-error shrink-0 flex items-center"
                                >
                                  <AlertTriangle size={13} aria-hidden="true" />
                                </span>
                              )}
                            </div>

                            {/* Estado Delegados */}
                            <div className="col-span-2 flex justify-center gap-1.5 font-stats-number">
                              <PageChip page="P1" status={mesa.delegados.p1} />
                              <PageChip page="P2" status={mesa.delegados.p2} />
                            </div>

                            {/* Estado Transmisión */}
                            <div className="col-span-3 flex justify-center gap-1.5 font-stats-number">
                              <PageChip page="P1" status={mesa.transmision.p1} />
                              <PageChip page="P2" status={mesa.transmision.p2} />
                            </div>

                            {/* Estado Mesa */}
                            <div className="col-span-2 flex justify-center">
                              <StatusChip estado={mesa.estado} size="sm" />
                            </div>

                            {/* Última carga */}
                            <div className="col-span-2 text-body-md font-body-md text-center text-on-surface-variant font-stats-number">
                              {mesa.ultimaCarga}
                            </div>

                            {/* Acción */}
                            <div className="col-span-1 flex justify-end">
                              {requiereReinspeccion ? (
                                <button
                                  onClick={() => onOpenReinspection(mesa.id)}
                                  className="text-[10px] font-label-caps text-primary border border-primary px-2 py-1 hover:bg-primary/10 transition-colors uppercase whitespace-nowrap rounded-sm"
                                  aria-label={`Reinspeccionar acta de ${mesa.mesaNumber}`}
                                >
                                  REINSPECCIONAR
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleNotifyMesa(mesa, row)}
                                  disabled={notificandoMesa === mesa.id}
                                  className="text-[10px] font-label-caps text-secondary-fixed-dim border border-[#544600] px-2 py-1 hover:bg-[#544600]/10 transition-colors uppercase whitespace-nowrap rounded-sm disabled:opacity-50 disabled:cursor-wait"
                                  aria-label={`Notificar a ${mesa.mesaNumber} de ${row.puesto}`}
                                >
                                  {notificandoMesa === mesa.id
                                    ? "REGISTRANDO…"
                                    : "NOTIFICAR"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {filteredConsulates.length === 0 && (
            <div className="px-4 py-10 text-center text-on-surface-variant text-body-md font-body-md">
              No se encontraron puestos que coincidan con los filtros
              aplicados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
