"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Download,
  Eye,
  FilterX,
  Loader2,
  MailCheck,
  Search,
  Siren,
  X,
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
import { useToast } from "@/hooks/use-toast";
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

/** [OLA6-UX] Escapa un campo CSV (RFC 4180): entrecomilla si trae
 *  separador (;), comillas o saltos de línea; duplica las comillas
 *  internas. Separador ";" = list separator de Excel es-CO (el comma
 *  es separador DECIMAL en Colombia y abriría todo en una columna). */
function csvCampo(valor: string | number | null | undefined): string {
  const s = valor === null || valor === undefined ? "" : String(valor);
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** [BÚSQUEDA+] Resalta la PRIMERA coincidencia (case-insensitive) de la
 *  búsqueda activa dentro del texto de una celda. Sin búsqueda o sin
 *  coincidencia devuelve el texto plano — cero costo en el flujo normal.
 *  <mark> semántico con estilo ámbar del tema (bg-warning/30). */
function Resaltado({ texto, query }: { texto: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{texto}</>;
  const idx = texto.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, idx)}
      <mark
        className="rounded-[2px] bg-warning/25 px-0.5 font-bold text-warning"
        aria-label={`Coincidencia: ${texto.slice(idx, idx + q.length)}`}
      >
        {texto.slice(idx, idx + q.length)}
      </mark>
      {texto.slice(idx + q.length)}
    </>
  );
}

/** [OLA6-UX] "HH:MM" → minutos del día (null si no es parseable). */
function minutosDelDia(hhmm: string | undefined | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
}

/** [OLA6-UX] Minutos hasta el cierre LOCAL del puesto (negativo = ya
 *  cerró; null = relojes no computables). horaCierreLocalRaw y
 *  horaActualPais vienen AMBOS en hora local del país → el delta es
 *  correcto sin resolver zonas IANA (eso ya lo hizo monitor.ts). */
function minutosParaCierre(row: ConsulateRow): number | null {
  const cierre = minutosDelDia(row.horaCierreLocalRaw);
  const ahora = minutosDelDia(row.horaActualPais);
  if (cierre === null || ahora === null) return null;
  return cierre - ahora;
}

/** [OLA6-UX] Columnas con orden rápido (clic en cabecera).
 *  Tercer clic limpia el orden y vuelve al orden por defecto. */
type OrdenCol =
  | "mesas"
  | "anomalias"
  | "horaLocal"
  | "delegados"
  | "transmision";
type OrdenDir = "asc" | "desc";
interface OrdenActivo {
  col: OrdenCol;
  dir: OrdenDir;
}

/** [OLA6-UX] Motivos del PANEL DE ATENCIÓN PRIORITARIA — triage
 *  rápido del supervisor sobre el dataset completo (sin filtros). */
type MotivoAtencion =
  | { tipo: "ANOMALÍAS"; prioridad: 0; metrica: string }
  | { tipo: "CIERRE PRÓXIMO"; prioridad: 1; metrica: string; urgencia: number }
  | { tipo: "SIN AVANCE"; prioridad: 2; metrica: string }
  | { tipo: "SLA VENCIDO"; prioridad: 3; metrica: string; urgencia: number };

/** [OLA6-UX] Máximo de tarjetas del panel de atención (triage, no
 *  lista completa: el drill-down se hace con el filtro de puesto). */
const MAX_TARJETAS_ATENCION = 8;

/** [OLA6-UX] Barra de progreso de la tabla del monitor: el % vive
 *  DENTRO del relleno cuando el ancho lo permite (>= 30 % de la
 *  columna) y sobre la pista al costado cuando es angosto; el ancho
 *  anima en 500 ms. Colores = reglas existentes (100 % = primario,
 *  >= 50 % transmisión = secundario, resto = error) — sin colores
 *  nuevos. */
const TEXTO_DENTRO_BARRA = {
  primary: "text-[#003912]",
  secondary: "text-[#544600]",
  error: "text-[#410004]",
} as const;

const BarraProgreso: React.FC<{
  pct: number;
  tono: "primary" | "secondary" | "error";
  ariaLabel: string;
}> = ({ pct, tono, ariaLabel }) => {
  const seguro = Math.max(0, Math.min(100, Math.round(pct)));
  const fondo =
    tono === "primary"
      ? "bg-primary"
      : tono === "secondary"
        ? "bg-secondary-fixed-dim"
        : "bg-error";
  return (
    <div
      className="w-full h-4 bg-[#242E2E] rounded-full overflow-hidden relative"
      role="progressbar"
      aria-valuenow={seguro}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out relative ${fondo}`}
        style={{ width: `${seguro}%` }}
      >
        {seguro >= 30 && (
          <span
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-label-caps leading-none ${TEXTO_DENTRO_BARRA[tono]}`}
          >
            {seguro}%
          </span>
        )}
      </div>
      {seguro < 30 && (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-label-caps leading-none text-on-surface-variant">
          {seguro}%
        </span>
      )}
    </div>
  );
};

/** [OLA6-UX] Valor de orden de una fila por columna (numérico; la
 *  hora local se parsea a minutos del día — ordenable sin zonas IANA).
 *  A nivel de módulo para entrar limpia al useMemo del orden. */
function valorOrdenDe(
  col: OrdenCol,
  row: ConsulateRow,
  anomalias: Map<string, number>
): number {
  switch (col) {
    case "mesas":
      return row.numMesas;
    case "anomalias":
      return anomalias.get(row.id) ?? 0;
    case "horaLocal":
      return minutosDelDia(row.horaActualPais) ?? -1;
    case "delegados":
      return row.delegadosPercent;
    case "transmision":
      return row.transmisionPercent;
  }
}

/** [OLA6-UX] Celda de cabecera ORDENABLE: botón con indicador
 *  visible (flecha activa / ⇅ tenue), aria-sort en la celda, foco
 *  visible y título descriptivo. Tercer clic vuelve al orden base. */
const CabeceraOrdenable: React.FC<{
  col: OrdenCol;
  orden: OrdenActivo | null;
  onAlternar: (col: OrdenCol) => void;
  className?: string;
  ariaLabel: string;
  children: React.ReactNode;
}> = ({ col, orden, onAlternar, className = "", ariaLabel, children }) => {
  const activo = orden?.col === col;
  const asc = orden?.dir === "asc";
  return (
    <div
      className={className}
      aria-sort={activo ? (asc ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onAlternar(col)}
        aria-label={`${ariaLabel} — orden ${
          activo ? (asc ? "ascendente" : "descendente") : "sin orden"
        } (clic para alternar)`}
        title={`Ordenar por ${ariaLabel.toLowerCase()} — asc / desc / limpiar`}
        className="block w-full text-center transition-colors hover:text-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 rounded-sm"
      >
        {children}{" "}
        <span className="inline-block ml-0.5 align-middle" aria-hidden="true">
          {activo ? (
            asc ? (
              <ArrowUp size={11} className="text-primary" aria-hidden="true" />
            ) : (
              <ArrowDown size={11} className="text-primary" aria-hidden="true" />
            )
          ) : (
            <ArrowUpDown size={11} className="opacity-40" aria-hidden="true" />
          )}
        </span>
      </button>
    </div>
  );
};

/** [OLA6-UX] Tono visual por motivo de atención — SOLO tokens
 *  semánticos existentes (error / warning / superficies), mismo
 *  lenguaje de la tabla (border-l como las filas CRÍTICO/PENDIENTE). */
const TONO_MOTIVO: Record<
  MotivoAtencion["tipo"],
  { badge: string; borde: string }
> = {
  "ANOMALÍAS": {
    badge: "bg-error/10 border-error/50 text-error",
    borde: "border-l-error",
  },
  "CIERRE PRÓXIMO": {
    badge: "bg-warning/10 border-warning/40 text-warning",
    borde: "border-l-warning",
  },
  "SIN AVANCE": {
    badge: "bg-surface-container-high border-outline-variant text-on-surface-variant",
    borde: "border-l-outline-variant",
  },
  "SLA VENCIDO": {
    badge: "bg-[#410004]/20 border-error/40 text-error",
    borde: "border-l-error/70",
  },
};

interface MonitorGlobalProps {
  consulates: ConsulateRow[];
  resumen: ResumenGlobal | null;
  onOpenReinspection: (mesaId?: string) => void;
  onOpenWhatsApp: (consulateName: string) => void;
  /** [OLA7] Anomalías abiertas (indicador top-level, no enterrado en sidebar) */
  anomaliasAbiertas?: number;
}

/**
 * [OLA7 · M-13] Filas por página del monitor: pintar las 949 filas de
 * golpe (~2.900 nodos, 131 KB de texto) congelaba el scroll y el
 * filtrado; 50 filas por página mantienen el DOM liviano y el pager
 * preserva el acceso a TODO el dataset.
 */
const FILAS_POR_PAGINA = 50;

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
  anomaliasAbiertas = 0,
}) => {
  const [haInteractuado, setHaInteractuado] = useState(false);
  const [expandedOverride, setExpandedOverride] = useState<string | null>(null);
  const [selectedPais, setSelectedPais] = useState<string>("Todos");
  const [selectedZona, setSelectedZona] = useState<string>("Todos");
  const [selectedPuesto, setSelectedPuesto] = useState<string>("Todos");
  const [selectedEstado, setSelectedEstado] = useState<string>("Todos");
  const [soloAnomalias, setSoloAnomalias] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  // [S-28] Búsqueda con debounce: el filtrado de 949 filas × 3.670
  // subfilas NO corre en cada tecla — 250 ms de gracia por letra.
  const [searchEfectiva, setSearchEfectiva] = useState<string>("");
  const [notificationToast, setNotificationToast] = useState<{
    texto: string;
    demo: boolean;
  } | null>(null);
  const [notificandoMesa, setNotificandoMesa] = useState<string | null>(null);
  // [OLA7 · M-13] Página visible del monitor (empieza en 1).
  const [pagina, setPagina] = useState(1);
  // [OLA6-UX] Orden activo por columna (asc → desc → sin orden).
  const [orden, setOrden] = useState<OrdenActivo | null>(null);
  // [OLA6-UX] Sombra bajo la cabecera sticky: solo cuando el cuerpo
  // scrolleó — sin scroll la cabecera y el cuerpo comparten borde.
  const [cabeceraFlotante, setCabeceraFlotante] = useState(false);
  // [OLA6-UX] Pulso de sincronización: cada refresco de `resumen`
  // (refetch 60 s del padre) enciende 700 ms de pulso en los KPI.
  const [refrescoKpi, setRefrescoKpi] = useState(false);
  // Ref del contenedor scrolleable de la tabla: al cambiar de página se
  // lleva al top para que el usuario no quede "a mitad de tabla".
  const contenedorTablaRef = useRef<HTMLDivElement | null>(null);
  // [BÚSQUEDA+] Ref del input de búsqueda — el atajo "/" lo enfoca.
  const inputBusquedaRef = useRef<HTMLInputElement | null>(null);
  // [OLA6-UX] Primera renderización con datos: para no pulsar en el mount.
  const primerResumen = useRef(true);

  // [BÚSQUEDA+] Atajos de teclado del monitor: "/" enfoca la búsqueda
  // (fuera de campos de texto) y "Esc" la limpia y devuelve el foco a la
  // página. Patrón estándar de búsqueda (GitHub, Gmail, YouTube).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const enCampoEditable =
        !!t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable);
      if (e.key === "/" && !enCampoEditable) {
        e.preventDefault();
        inputBusquedaRef.current?.focus();
        inputBusquedaRef.current?.select();
      } else if (
        e.key === "Escape" &&
        document.activeElement === inputBusquedaRef.current
      ) {
        setSearchQuery("");
        inputBusquedaRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // [OLA6-UX] Toast del proyecto: Toaster shadcn montado en layout.tsx
  // (el Toaster de sonner existe pero NO está montado — convención del
  // repo: useToast de @/hooks/use-toast, como page.tsx [OLA3 3.9]).
  const { toast } = useToast();

  const totalPuestos = resumen?.totalPuestos ?? 0;
  const nCompleto = resumen?.completo ?? 0;
  const nCritico = resumen?.critico ?? 0;
  const nPendiente = resumen?.pendiente ?? 0;
  const nNoIniciado = resumen?.noIniciado ?? 0;

  /** Guardia defensiva: el contrato exige ConsulateRow[], pero toleramos undefined */
  const rows: ConsulateRow[] = Array.isArray(consulates) ? consulates : [];

  /** Opciones de filtro derivadas dinámicamente de los datos.
   *  [OLA7 · M-8] CASCADA país → zona/puesto: las opciones de zona y
   *  puesto se estrechan al país seleccionado (antes los tres selects
   *  eran independientes: elegir ESPAÑA + un puesto de ITALIA mostraba
   *  la tabla vacía sin explicación). */
  const paisesUnicos = useMemo(
    () => Array.from(new Set(rows.map((c) => c.pais))),
    [rows]
  );
  const zonasUnicas = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((c) => selectedPais === "Todos" || c.pais === selectedPais)
            .map((c) => c.zona)
        )
      ).sort((a, b) => a.localeCompare(b, "es", { numeric: true })),
    [rows, selectedPais]
  );
  const puestosUnicos = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((c) => selectedPais === "Todos" || c.pais === selectedPais)
            .map((c) => c.puesto)
        )
      ),
    [rows, selectedPais]
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

  /** [OLA6-UX] Pulso de sincronización de KPIs: cada vez que `resumen`
   *  llega NUEVO (el padre refresca cada 60 s — mismo instante en que
   *  el header dice "SINCRONIZANDO...") los números pulsan 700 ms y la
   *  sección se marca aria-busy. Solo presentación: no toca la lógica
   *  de carga del padre. El mount inicial no pulsa. */
  useEffect(() => {
    if (primerResumen.current) {
      primerResumen.current = false;
      return;
    }
    setRefrescoKpi(true);
    const t = setTimeout(() => setRefrescoKpi(false), 700);
    return () => clearTimeout(t);
  }, [resumen]);

  /** [OLA6-UX] Estado de sincronización derivado: sin resumen o sin
   *  filas = aún no hay datos que mostrar (esqueletos + spinner). */
  const cargandoInicial = resumen === null || rows.length === 0;

  /** [S-39] Cambiar cualquier filtro resetea la fila expandida: la
   *  expansión nunca queda "invisible" apuntando a una fila filtrada.
   *  [OLA7 · M-13] También vuelve a la página 1: quedarse en la página
   *  12 tras un filtro que deja 8 filas mostraba una tabla vacía. */
  const cambiarFiltro = (
    setter: (v: string) => void
  ): ((e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => void) =>
    (e) => {
      setter(e.target.value);
      setHaInteractuado(true);
      setExpandedOverride(null);
      setPagina(1);
    };

  /** [OLA7 · M-8] Cambio de país con limpieza de dependientes en cascada:
   *  la zona/puesto seleccionados pueden no existir en el nuevo país. */
  const cambiarPais = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pais = e.target.value;
    setSelectedPais(pais);
    setHaInteractuado(true);
    setExpandedOverride(null);
    setPagina(1);
    // Los dependientes solo se limpian si su valor no existe en el país
    // nuevo ("Todos" siempre existe).
    const filasPais = rows.filter((c) => pais === "Todos" || c.pais === pais);
    const zonas = new Set(filasPais.map((c) => c.zona));
    const puestos = new Set(filasPais.map((c) => c.puesto));
    if (!zonas.has(selectedZona)) setSelectedZona("Todos");
    if (!puestos.has(selectedPuesto)) setSelectedPuesto("Todos");
  };

  /** [OLA7 · M-8] ¿Hay filtros activos? (para el botón LIMPIAR FILTROS) */
  const hayFiltrosActivos =
    selectedPais !== "Todos" ||
    selectedZona !== "Todos" ||
    selectedPuesto !== "Todos" ||
    selectedEstado !== "Todos" ||
    soloAnomalias ||
    searchEfectiva.trim().length > 0;

  /** [OLA7 · M-8] Limpia todos los filtros de una sola acción (antes el
   *  único camino era re-abrir cada select y devolverlo a "Todos").
   *  [OLA6-UX] También limpia el orden por columna (reset total). */
  const limpiarFiltros = () => {
    setSelectedPais("Todos");
    setSelectedZona("Todos");
    setSelectedPuesto("Todos");
    setSelectedEstado("Todos");
    setSoloAnomalias(false);
    setSearchQuery("");
    setSearchEfectiva("");
    setOrden(null);
    setHaInteractuado(true);
    setExpandedOverride(null);
    setPagina(1);
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
  // con debounce (antes se re-filtraban 949 filas en cada keystroke).
  // [OLA7] soloAnomalias: filtra puestos con AL MENOS una mesa en
  // anomalía (antes la única pista era el icono ⚠ dentro del acordeón
  // de cada fila — hallazgo VLM: "anomalías enterradas en el sidebar").
  const filteredConsulates = useMemo(() => {
    return rows.filter((row) => {
      if (selectedPais !== "Todos" && row.pais !== selectedPais) return false;
      if (selectedZona !== "Todos" && row.zona !== selectedZona) return false;
      if (selectedPuesto !== "Todos" && row.puesto !== selectedPuesto) return false;
      if (selectedEstado !== "Todos" && row.estadoGlobal !== selectedEstado) {
        return false;
      }
      if (soloAnomalias && !row.mesas.some((m) => m.anomalia)) return false;
      if (searchEfectiva.trim()) {
        const q = searchEfectiva.toLowerCase();
        // [BÚSQUEDA+] ciudad añadida al texto matcheable (antes solo
        // code/pais/puesto/zona: buscar "Roma" no encontraba el puesto
        // "02 - Roma - Consulado" porque la ciudad no estaba en el índice).
        const matchText = `${row.code} ${row.pais} ${row.puesto} ${row.zona} ${row.ciudad}`.toLowerCase();
        if (!matchText.includes(q)) return false;
      }
      return true;
    });
  }, [rows, selectedPais, selectedZona, selectedPuesto, selectedEstado, soloAnomalias, searchEfectiva]);

  /** [OLA6-UX] Nº de mesas con anomalía por puesto — una sola pasada
   *  sobre rows (la columna ANOMALÍAS de la tabla, el orden por esa
   *  columna y el panel de atención consumen el mismo mapa). */
  const anomaliasPorPuesto = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const row of rows) {
      mapa.set(
        row.id,
        row.mesas.reduce((acc, m) => acc + (m.anomalia ? 1 : 0), 0)
      );
    }
    return mapa;
  }, [rows]);

  /** [OLA6-UX] Filas filtradas ORDENADAS por la columna activa.
   *  Array#sort es estable (empates conservan el orden del dataset) y
   *  se ordena una COPIA — el orden por defecto nunca muta. */
  const ordenados = useMemo(() => {
    if (!orden) return filteredConsulates;
    const copia = [...filteredConsulates];
    copia.sort((a, b) => {
      const cmp =
        valorOrdenDe(orden.col, a, anomaliasPorPuesto) -
        valorOrdenDe(orden.col, b, anomaliasPorPuesto);
      if (cmp === 0) return 0;
      return orden.dir === "asc" ? cmp : -cmp;
    });
    return copia;
  }, [filteredConsulates, orden, anomaliasPorPuesto]);

  /** [OLA6-UX] Ciclo de orden por columna: asc → desc → sin orden
   *  (tercer clic limpia — reset-friendly). */
  const alternarOrden = (col: OrdenCol) => {
    setPagina(1);
    setOrden((prev) => {
      if (!prev || prev.col !== col) return { col, dir: "asc" };
      if (prev.dir === "asc") return { col, dir: "desc" };
      return null;
    });
  };

  /** [OLA6-UX] aria-sort de una columna de la cabecera. */
  const ariaSortDe = (
    col: OrdenCol
  ): "ascending" | "descending" | "none" => {
    if (!orden || orden.col !== col) return "none";
    return orden.dir === "asc" ? "ascending" : "descending";
  };

  /** [OLA6-UX] PANEL DE ATENCIÓN PRIORITARIA — triage sobre el dataset
   *  COMPLETO (ignora filtros: es la foto global de la jornada). Un
   *  puesto aparece una sola vez con su motivo más severo:
   *  anomalías > cierre próximo (≤ 60 min) > sin avance > SLA vencido. */
  const itemsAtencion = useMemo(() => {
    interface Item {
      row: ConsulateRow;
      motivo: MotivoAtencion;
    }
    const items: Item[] = [];
    for (const row of rows) {
      const nAnom = anomaliasPorPuesto.get(row.id) ?? 0;
      const completo = row.estadoGlobal === "COMPLETO";
      if (nAnom > 0) {
        items.push({
          row,
          motivo: {
            tipo: "ANOMALÍAS",
            prioridad: 0,
            metrica: `${nAnom} ${nAnom === 1 ? "MESA" : "MESAS"} CON ALERTA`,
          },
        });
        continue;
      }
      const paraCierre = minutosParaCierre(row);
      if (
        paraCierre !== null &&
        paraCierre >= 0 &&
        paraCierre <= 60 &&
        !completo
      ) {
        items.push({
          row,
          motivo: {
            tipo: "CIERRE PRÓXIMO",
            prioridad: 1,
            urgencia: paraCierre,
            metrica: `CIERRA EN ${paraCierre} MIN · ${row.horaCierreLocalRaw ?? "--:--"}`,
          },
        });
        continue;
      }
      if (
        row.numMesas > 0 &&
        row.delegadosPercent === 0 &&
        row.transmisionPercent === 0 &&
        !completo
      ) {
        items.push({
          row,
          motivo: {
            tipo: "SIN AVANCE",
            prioridad: 2,
            metrica: `${row.numMesas} ${row.numMesas === 1 ? "MESA" : "MESAS"} · 0 ACTAS`,
          },
        });
        continue;
      }
      if (row.estadoGlobal === "CRÍTICO") {
        const vencido = paraCierre !== null ? -paraCierre : 0;
        items.push({
          row,
          motivo: {
            tipo: "SLA VENCIDO",
            prioridad: 3,
            urgencia: vencido,
            metrica: `SIN E-14 · ${row.tiempoDesdeCierre}`,
          },
        });
      }
    }
    // Severidad primero; dentro de cada motivo, lo más urgente primero
    // (menos minutos para cerrar / más minutos vencido el SLA).
    items.sort((a, b) => {
      const p = a.motivo.prioridad - b.motivo.prioridad;
      if (p !== 0) return p;
      if (a.motivo.prioridad === 1 && b.motivo.prioridad === 1) {
        return a.motivo.urgencia - b.motivo.urgencia;
      }
      if (a.motivo.prioridad === 3 && b.motivo.prioridad === 3) {
        return b.motivo.urgencia - a.motivo.urgencia;
      }
      return 0;
    });
    return items;
  }, [rows, anomaliasPorPuesto]);

  const atencionPrioritaria = itemsAtencion.slice(0, MAX_TARJETAS_ATENCION);
  /** [OLA6-UX] Total bajo atención (para la nota "+ N PUESTOS MÁS"). */
  const totalAtencion = itemsAtencion.length;

  /** [OLA6-UX] Clic en una tarjeta de atención → drill-down: filtra la
   *  tabla por ese puesto, expande su fila y baja hasta la tabla. */
  const abrirAtencion = (row: ConsulateRow) => {
    setSelectedPuesto(row.puesto);
    setHaInteractuado(true);
    setExpandedOverride(row.id);
    setPagina(1);
    contenedorTablaRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  /** [OLA6-UX] EXPORTAR CSV — descarga client-side (Blob) de las filas
   *  FILTRADAS del monitor (las mismas que ve la tabla, todas las
   *  páginas). BOM UTF-8 para que Excel es-CO abra acentos correctos;
   *  cabeceras en MAYÚSCULAS español; nombre con sello local. */
  const exportarCsv = () => {
    if (ordenados.length === 0) return;
    const CABECERAS = [
      "PUESTO",
      "CÓDIGO",
      "PAÍS",
      "CIUDAD",
      "ZONA",
      "REGIÓN",
      "MESAS TOTALES",
      "E-14 DELEGADOS",
      "AVANCE DELEGADOS (%)",
      "E-14 TRANSMISIÓN",
      "AVANCE TRANSMISIÓN (%)",
      "ESTADO GLOBAL",
      "ANOMALÍAS",
      "HORA CIERRE COLOMBIA",
      "HORA LOCAL PAÍS",
      "HORA CIERRE LOCAL",
      "TIEMPO DESDE CIERRE (SLA)",
    ];
    const lineas = [CABECERAS.join(";")];
    for (const row of ordenados) {
      lineas.push(
        [
          row.puesto,
          row.code,
          row.pais,
          row.ciudad,
          row.zona,
          row.region ?? "—",
          row.numMesas,
          row.delegadosProgress,
          row.delegadosPercent,
          row.transmisionProgress,
          row.transmisionPercent,
          row.estadoGlobal,
          anomaliasPorPuesto.get(row.id) ?? 0,
          row.horaCierreColombia,
          row.horaActualPais,
          row.horaCierreLocalRaw ?? "—",
          row.tiempoDesdeCierre,
        ]
          .map(csvCampo)
          .join(";")
      );
    }
    const d = new Date();
    const p2 = (n: number) => String(n).padStart(2, "0");
    const nombre = `digielect-monitor-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.csv`;
    try {
      // \uFEFF = BOM UTF-8: Excel detecta el encoding y no rompe acentos.
      const blob = new Blob(["\uFEFF" + lineas.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: `CSV EXPORTADO — ${ordenados.length} ${ordenados.length === 1 ? "FILA" : "FILAS"}`,
        description: `${nombre} · ${hayFiltrosActivos ? "con filtros aplicados" : "dataset completo"} · 17 columnas.`,
      });
    } catch {
      toast({
        title: "NO SE PUDO EXPORTAR EL CSV",
        variant: "destructive",
      });
    }
  };

  // [OLA7 · M-13] Porción visible de la página + cálculo del pager.
  // [OLA6-UX] La porción sale de `ordenados` (filtrado + orden activo).
  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / FILAS_POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const desde = (paginaSegura - 1) * FILAS_POR_PAGINA;
  const visibles = useMemo(
    () => ordenados.slice(desde, desde + FILAS_POR_PAGINA),
    [ordenados, desde]
  );

  /** [OLA7 · M-13] Cambio de página: sube el scroll de la tabla al top
   *  (la fila 50 de la página 1 y la fila 1 de la página 2 no son el
   *  mismo sitio — sin esto el usuario "se perdía" al avanzar). */
  const irPagina = (p: number) => {
    const destino = Math.max(1, Math.min(totalPaginas, p));
    setPagina(destino);
    contenedorTablaRef.current?.scrollTo({ top: 0 });
  };

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

      {/* [OLA6-UX] PANEL DE ATENCIÓN PRIORITARIA — triage real de la
          jornada: los puestos que necesitan acción AHORA (anomalías >
          cierre próximo ≤ 60 min > sin avance > SLA vencido). Cada
          tarjeta filtra la tabla por su puesto (drill-down). Derivado
          del MISMO dataset del monitor — cero datos nuevos. */}
      <section
        aria-label="Panel de atención prioritaria de puestos"
        className="bg-surface-container-lowest border border-outline-variant rounded-sm p-4"
        aria-busy={cargandoInicial}
      >
        <header className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="text-label-caps font-label-caps text-on-surface uppercase tracking-wider flex items-center gap-2">
            <Siren size={14} className="text-error" aria-hidden="true" />
            PANEL DE ATENCIÓN PRIORITARIA
          </h2>
          {cargandoInicial ? (
            <span
              role="status"
              aria-live="polite"
              className="flex items-center gap-1.5 text-label-caps font-label-caps text-on-surface-variant uppercase"
            >
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              SINCRONIZANDO DATOS…
            </span>
          ) : (
            <span className="font-stats-number text-[11px] text-on-surface-variant uppercase tabular-nums">
              {totalAtencion} {totalAtencion === 1 ? "PUESTO" : "PUESTOS"} BAJO ATENCIÓN
            </span>
          )}
        </header>

        {cargandoInicial ? (
          // Esqueleto honesto: aún no se sabe si la jornada es nominal.
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[76px] bg-surface-container-high/40 animate-pulse rounded-sm border border-outline-variant/40"
              />
            ))}
          </div>
        ) : atencionPrioritaria.length === 0 ? (
          <p className="border border-dashed border-outline-variant rounded-sm px-4 py-6 text-center text-body-md font-body-md text-on-surface-variant">
            SIN PUESTOS BAJO ATENCIÓN — JORNADA NOMINAL
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {atencionPrioritaria.map(({ row, motivo }) => {
                const tono = TONO_MOTIVO[motivo.tipo];
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => abrirAtencion(row)}
                      title={`Filtrar el monitor por ${row.puesto} — ${motivo.tipo}`}
                      aria-label={`Atención prioritaria ${motivo.tipo}: ${row.puesto}, ${row.ciudad} (${row.pais}). ${motivo.metrica}. Aplica el filtro de puesto en la tabla.`}
                      className={`w-full text-left bg-surface-container border border-outline-variant border-l-2 ${tono.borde} p-3 rounded-sm transition-colors hover:bg-surface-container-high/70 hover:border-outline/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/60 active:bg-surface-container-high`}
                    >
                      <span className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className="text-body-md font-body-md font-bold text-on-surface truncate"
                          title={row.puesto}
                        >
                          {row.puesto}
                        </span>
                        <span
                          className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-label-caps uppercase tracking-wide border ${tono.badge}`}
                        >
                          {motivo.tipo}
                        </span>
                      </span>
                      <span className="block text-[10px] font-label-caps text-on-surface-variant uppercase truncate">
                        {row.ciudad} · {row.pais}
                      </span>
                      <span className="block mt-1.5 font-stats-number text-[11px] text-on-surface tabular-nums">
                        {motivo.metrica}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {totalAtencion > atencionPrioritaria.length && (
              <p className="mt-2.5 text-[10px] font-label-caps text-on-surface-variant uppercase">
                + {totalAtencion - atencionPrioritaria.length} PUESTOS MÁS BAJO
                ATENCIÓN — ORDENA LA TABLA POR ANOMALÍAS O FILTRA PARA VERLOS
              </p>
            )}
          </>
        )}
      </section>

      {/* Tarjetas de resumen (valores dinámicos del prop resumen) —
          [OLA7] 6ª tarjeta ANOMALÍAS ABIERTAS top-level (antes la única
          pista vivía en el badge del sidebar — hallazgo VLM).
          [OLA6-UX] micro-interacciones (hover/active con tokens),
          tabular-nums explícito, esqueletos mientras no hay resumen y
          pulso de 700 ms en cada sincronización (aria-busy). */}
      <section
        className="grid grid-cols-2 md:grid-cols-6 gap-4"
        aria-label="Resumen global de puestos"
        aria-busy={cargandoInicial || refrescoKpi}
      >
        <div className="bg-surface-container p-4 border border-outline-variant relative rounded-sm transition-colors hover:bg-surface-container-high/60 hover:border-outline/50 active:bg-surface-container-high/80">
          <h3 className="text-label-caps font-label-caps text-on-surface-variant mb-2 uppercase">
            TOTAL PUESTOS
          </h3>
          {cargandoInicial ? (
            <span
              className="block h-7 w-14 ml-auto bg-surface-container-high animate-pulse rounded-sm"
              aria-hidden="true"
            />
          ) : (
            <div
              className={`text-stats-number font-stats-number text-right text-on-surface tabular-nums ${refrescoKpi ? "animate-pulse" : ""}`}
            >
              {totalPuestos}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setSoloAnomalias((v) => !v)}
          aria-pressed={soloAnomalias}
          aria-label={`Filtrar puestos con anomalías abiertas (${anomaliasAbiertas})`}
          className={`bg-surface-container p-4 border rounded-sm text-left transition-colors relative border-t-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-error/60 active:bg-error/15 ${
            soloAnomalias
              ? "border-t-error border-error/60 bg-error/10"
              : "border-t-error border-outline-variant hover:border-error/50 hover:bg-surface-container-high/40"
          }`}
        >
          <h3 className="text-label-caps font-label-caps text-error mb-2 uppercase flex items-center gap-1.5">
            <AlertTriangle size={13} aria-hidden="true" />
            ANOMALÍAS ABIERTAS
          </h3>
          {cargandoInicial ? (
            <span
              className="block h-7 w-14 ml-auto bg-error/20 animate-pulse rounded-sm"
              aria-hidden="true"
            />
          ) : (
            <div
              className={`text-stats-number font-stats-number text-right text-error tabular-nums ${refrescoKpi ? "animate-pulse" : ""}`}
            >
              {anomaliasAbiertas}
            </div>
          )}
          {anomaliasAbiertas > 0 && !cargandoInicial && (
            <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-error animate-pulse" aria-hidden="true" />
          )}
        </button>

        <div className="bg-surface-container p-4 border border-outline-variant relative border-t-2 border-t-primary rounded-sm transition-colors hover:bg-surface-container-high/60 hover:border-outline/50 active:bg-surface-container-high/80">
          <h3 className="text-label-caps font-label-caps text-primary mb-2 uppercase">
            COMPLETO
          </h3>
          {cargandoInicial ? (
            <span className="block h-7 w-14 ml-auto bg-surface-container-high animate-pulse rounded-sm" aria-hidden="true" />
          ) : (
            <div className={`text-stats-number font-stats-number text-right text-primary tabular-nums ${refrescoKpi ? "animate-pulse" : ""}`}>
              {nCompleto}
            </div>
          )}
        </div>

        <div className="bg-surface-container p-4 border border-outline-variant relative border-t-2 border-t-error rounded-sm transition-colors hover:bg-surface-container-high/60 hover:border-outline/50 active:bg-surface-container-high/80">
          <h3 className="text-label-caps font-label-caps text-error mb-2 uppercase">
            CRÍTICO
          </h3>
          {cargandoInicial ? (
            <span className="block h-7 w-14 ml-auto bg-surface-container-high animate-pulse rounded-sm" aria-hidden="true" />
          ) : (
            <div className={`text-stats-number font-stats-number text-right text-error tabular-nums ${refrescoKpi ? "animate-pulse" : ""}`}>
              {nCritico}
            </div>
          )}
        </div>

        <div className="bg-surface-container p-4 border border-outline-variant relative border-t-2 border-t-secondary-fixed-dim rounded-sm transition-colors hover:bg-surface-container-high/60 hover:border-outline/50 active:bg-surface-container-high/80">
          <h3 className="text-label-caps font-label-caps text-secondary-fixed-dim mb-2 uppercase">
            PENDIENTE
          </h3>
          {cargandoInicial ? (
            <span className="block h-7 w-14 ml-auto bg-surface-container-high animate-pulse rounded-sm" aria-hidden="true" />
          ) : (
            <div className={`text-stats-number font-stats-number text-right text-secondary-fixed-dim tabular-nums ${refrescoKpi ? "animate-pulse" : ""}`}>
              {nPendiente}
            </div>
          )}
        </div>

        <div className="bg-surface-container p-4 border border-outline-variant relative border-t-2 border-t-[#869583] rounded-sm transition-colors hover:bg-surface-container-high/60 hover:border-outline/50 active:bg-surface-container-high/80">
          <h3 className="text-label-caps font-label-caps text-[#869583] mb-2 uppercase">
            NO INICIADO
          </h3>
          {cargandoInicial ? (
            <span className="block h-7 w-14 ml-auto bg-surface-container-high animate-pulse rounded-sm" aria-hidden="true" />
          ) : (
            <div className={`text-stats-number font-stats-number text-right text-[#869583] tabular-nums ${refrescoKpi ? "animate-pulse" : ""}`}>
              {nNoIniciado}
            </div>
          )}
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
            onChange={cambiarPais}
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
          <div className="flex items-center gap-1.5">
            <label htmlFor="filtro-busqueda" className={filterLabelCls}>
              BÚSQUEDA RÁPIDA
            </label>
            {/* [BÚSQUEDA+] Pista del atajo de teclado — kbd discreto */}
            <kbd
              className="rounded border border-[#242E2E] bg-[#0e1414] px-1 py-px text-[9px] font-bold leading-tight text-on-surface-variant"
              title='Tecla "/" para enfocar la búsqueda · "Esc" para limpiarla'
            >
              /
            </kbd>
          </div>
          <div className="relative">
            <Search
              size={16}
              aria-hidden="true"
              className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none"
            />
            <input
              id="filtro-busqueda"
              ref={inputBusquedaRef}
              value={searchQuery}
              onChange={cambiarFiltro(setSearchQuery)}
              className="bg-[#121919] border border-[#242E2E] text-body-md font-body-md text-on-surface rounded-none pl-8 pr-8 p-2 h-[36px] w-full focus:border-primary focus:ring-0 placeholder:text-[#3c4a3c] outline-none"
              placeholder="Buscar por ID, nombre o ciudad."
              type="text"
            />
            {/* [BÚSQUEDA+] Botón limpiar visible solo con texto */}
            {searchQuery && (
              <button
                type="button"
                aria-label="Limpiar la búsqueda"
                onClick={() => {
                  setSearchQuery("");
                  inputBusquedaRef.current?.focus();
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded text-on-surface-variant transition-colors hover:bg-[#242E2E] hover:text-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
              >
                <X size={13} aria-hidden="true" />
              </button>
            )}
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

        {/* [OLA7 · M-8] LIMPIAR FILTROS de una acción — visible solo con
            filtros activos (antes tocar devolver 5 selects a mano).
            [OLA6-UX] EXPORTAR CSV al lado: descarga las filas FILTRADAS
            (todas las páginas de la tabla) con BOM UTF-8 para Excel. */}
        <div className="flex flex-wrap gap-2 items-end justify-end">
          <button
            type="button"
            onClick={limpiarFiltros}
            disabled={!hayFiltrosActivos}
            className={`flex items-center justify-center gap-1.5 h-[36px] px-3 border font-label-caps text-label-caps uppercase tracking-wider rounded-none transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-error/50 ${
              hayFiltrosActivos
                ? "border-error/60 text-error hover:bg-error/10"
                : "border-[#242E2E] text-on-surface-variant/40 cursor-not-allowed"
            }`}
            aria-label="Limpiar todos los filtros del monitor"
          >
            <FilterX size={14} aria-hidden="true" />
            LIMPIAR FILTROS
          </button>
          <button
            type="button"
            onClick={exportarCsv}
            disabled={ordenados.length === 0}
            title={
              ordenados.length === 0
                ? "Sin filas visibles para exportar"
                : `Exportar ${ordenados.length} ${ordenados.length === 1 ? "fila" : "filas"} visibles a CSV (Excel, UTF-8)`
            }
            aria-label={
              ordenados.length === 0
                ? "Exportar CSV deshabilitado: sin filas visibles"
                : `Exportar ${ordenados.length} filas visibles a CSV`
            }
            className={`flex items-center justify-center gap-1.5 h-[36px] px-3 border font-label-caps text-label-caps uppercase tracking-wider rounded-none transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 ${
              ordenados.length > 0
                ? "border-outline-variant text-on-surface hover:border-primary/60 hover:text-primary hover:bg-primary/5 active:bg-primary/10"
                : "border-[#242E2E] text-on-surface-variant/40 cursor-not-allowed"
            }`}
          >
            <Download size={14} aria-hidden="true" />
            EXPORTAR CSV
          </button>
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

      {/* Tabla principal de datos — [OLA7 · M-7] cabecera sticky REAL:
          el contenedor ahora tiene scroll vertical propio (max-h) y la
          cabecera sticky vive DENTRO de él (antes sticky top-0 dentro de
          overflow-x-auto no pegaba nunca — CSS muerto). [OLA7 · M-13]
          solo se pintan las filas de la página actual.
          [OLA6-UX] la cabecera gana sombra de profundidad cuando el
          cuerpo scrollea (afordance de "cabecera flotante"), columnas
          ordenables y la columna ANOMALÍAS por puesto. */}
      <div className="border border-outline-variant bg-[#121919] rounded-sm overflow-hidden">
        <div
          ref={contenedorTablaRef}
          className="max-h-[68vh] overflow-auto"
          tabIndex={0}
          role="region"
          aria-label="Tabla de puestos consulares (desplazable)"
          onScroll={(e) => setCabeceraFlotante(e.currentTarget.scrollTop > 4)}
        >
        {/* Cabecera de la tabla — [OLA6-UX] grid de 13 columnas con
            celdas ordenables (# MESAS · HORA ACTUAL · ANOMALÍAS ·
            E-14 DELEGADOS · E-14 TRANSMISIÓN). */}
        <div
          className={`grid grid-cols-13 gap-3 px-4 py-3 border-b border-[#242E2E] sticky top-0 bg-[#121919] z-10 min-w-[1150px] text-left transition-shadow duration-300 ${
            cabeceraFlotante
              ? "shadow-[0_10px_16px_-10px_rgba(0,0,0,0.85)]"
              : "shadow-[0_1px_0_0_#242E2E]"
          }`}
        >
          <div className="col-span-2 text-label-caps font-label-caps text-on-surface-variant uppercase">
            PAÍS
          </div>
          <div className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase text-center">
            ZONA
          </div>
          <div className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase">
            PUESTO
          </div>
          <CabeceraOrdenable
            col="mesas"
            orden={orden}
            onAlternar={alternarOrden}
            className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase text-center"
            ariaLabel="Número de mesas"
          >
            # MESAS
          </CabeceraOrdenable>
          <div className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase text-center leading-tight">
            HORA CIERRE
            <br />
            COLOMBIA
          </div>
          <CabeceraOrdenable
            col="horaLocal"
            orden={orden}
            onAlternar={alternarOrden}
            className="col-span-1 text-label-caps font-label-caps text-primary uppercase text-center leading-tight"
            ariaLabel="Hora actual del país"
          >
            HORA
            <br />
            ACTUAL
            <br />
            PAÍS
          </CabeceraOrdenable>
          <div className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase text-center leading-tight">
            TIEMPO
            <br />
            DESDE
            <br />
            CIERRE
          </div>
          <CabeceraOrdenable
            col="anomalias"
            orden={orden}
            onAlternar={alternarOrden}
            className="col-span-1 text-label-caps font-label-caps text-error uppercase text-center"
            ariaLabel="Mesas con anomalía"
          >
            ANOMALÍAS
          </CabeceraOrdenable>
          <CabeceraOrdenable
            col="delegados"
            orden={orden}
            onAlternar={alternarOrden}
            className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase text-center"
            ariaLabel="Avance E-14 delegados"
          >
            E-14
            <br />
            DELEGADOS
          </CabeceraOrdenable>
          <CabeceraOrdenable
            col="transmision"
            orden={orden}
            onAlternar={alternarOrden}
            className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase text-center"
            ariaLabel="Avance E-14 transmisión"
          >
            E14-
            <br />
            TRANSMISIÓN
          </CabeceraOrdenable>
          <div className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase text-center">
            ESTADO
            <br />
            GLOBAL
          </div>
          <div className="col-span-1 text-label-caps font-label-caps text-on-surface-variant uppercase text-center">
            ACCIONES
          </div>
        </div>

        {/* Filas — [OLA7 · M-13] solo la página actual; [OLA7 estilos]
            cebra para no perder la fila en columnas anchas. [OLA6-UX]
            13 columnas (nueva ANOMALÍAS), barras con % y anillos de
            foco en los botones de fila. */}
        <div className="flex flex-col min-w-[1150px]">
          {visibles.map((row, idx) => {
            const isExpanded = expandedRowId === row.id;
            const isCritical = row.estadoGlobal === "CRÍTICO";
            const isPending = row.estadoGlobal === "PENDIENTE";
            const isComplete = row.estadoGlobal === "COMPLETO";
            const isNotStarted = row.estadoGlobal === "NO INICIADO";
            const expandible = row.mesas.length > 0;
            const tieneAnomalia = row.mesas.some((m) => m.anomalia);
            // [OLA6-UX] Contador de anomalías de la fila (columna + orden).
            const nAnomRow = anomaliasPorPuesto.get(row.id) ?? 0;

            return (
              <React.Fragment key={row.id}>
                <div
                  className={`grid grid-cols-13 gap-3 px-4 py-3 border-b border-[#242E2E] items-center transition-colors ${
                    idx % 2 === 1 && !isCritical ? "bg-[#161f1f]" : ""
                  } hover:bg-[#1A2323] ${
                    isCritical
                      ? "border-l-4 border-l-error bg-surface-container-high/40"
                      : ""
                  } ${isPending ? "border-l-4 border-l-secondary-fixed-dim" : ""} ${
                    isNotStarted ? "opacity-65" : ""
                  }`}
                >
                  {/* País — celda expandible con teclado (Enter/Espacio).
                      [OLA7] marca ⚠ en filas con anomalía (aunque esté
                      colapsada: la anomalía ya no vive solo en el
                      acordeón abierto). */}
                  <button
                    type="button"
                    onClick={() => expandible && toggleExpand(row.id)}
                    aria-expanded={expandible ? isExpanded : undefined}
                    aria-controls={expandible ? `mesas-${row.id}` : undefined}
                    aria-label={
                      expandible
                        ? `${isExpanded ? "Colapsar" : "Expandir"} mesas de ${row.pais}${tieneAnomalia ? " (con anomalía abierta)" : ""}`
                        : `${row.code} - ${row.pais} (sin mesas)`
                    }
                    disabled={!expandible}
                    className={`col-span-2 flex items-center gap-2 text-left text-body-md font-body-md font-bold text-on-surface rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 ${
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
                    <span
                      className="truncate flex items-center gap-1.5"
                      title={`${row.code} - ${row.pais}${tieneAnomalia ? " — puesto con anomalía abierta" : ""}`}
                    >
                      {/* [BÚSQUEDA+] coincidencia resaltada en la celda ID */}
                      <Resaltado texto={`${row.code} - ${row.pais}`} query={searchEfectiva} />
                      {tieneAnomalia && (
                        <span
                          role="img"
                          aria-label="Puesto con anomalía abierta"
                          title="Puesto con anomalía abierta"
                          className="text-error shrink-0"
                        >
                          <AlertTriangle size={12} aria-hidden="true" />
                        </span>
                      )}
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
                    {/* [BÚSQUEDA+] coincidencia resaltada en la celda PUESTO */}
                    <Resaltado texto={row.puesto} query={searchEfectiva} />
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

                  {/* [OLA6-UX] Anomalías — contador por puesto (ordenable
                      en cabecera; coincide con la marca ⚠ del país).
                      [QA-móvil] `relative` en la celda: el sr-only interior
                      es position:absolute y, sin ancestro posicionado, su
                      bloque contenedor era el ICB — escapaba del clip de la
                      tabla (overflow-auto) y estiraba el scroll horizontal
                      del DOCUMENTO a ~756px en móvil (fila 1150px). */}
                  <div className="col-span-1 text-center relative">
                    {nAnomRow > 0 ? (
                      <span
                        className="inline-flex items-center gap-1 text-error font-bold"
                        title={`${nAnomRow} ${nAnomRow === 1 ? "mesa con" : "mesas con"} anomalía abierta`}
                      >
                        <AlertTriangle size={12} aria-hidden="true" />
                        <span className="font-stats-number tabular-nums text-body-md">
                          {nAnomRow}
                        </span>
                        <span className="sr-only">
                          {nAnomRow === 1
                            ? "mesa con anomalía"
                            : "mesas con anomalías"}
                        </span>
                      </span>
                    ) : (
                      <span
                        className="text-body-md font-body-md text-on-surface-variant/50 font-stats-number"
                        title="Sin anomalías abiertas"
                      >
                        —
                      </span>
                    )}
                  </div>

                  {/* E-14 Delegados — progreso ([OLA6-UX] barra con %
                      dentro del relleno / sobre la pista si es angosta). */}
                  <div className="col-span-1 flex flex-col items-center gap-1">
                    <span className="text-body-md font-body-md font-stats-number tabular-nums">
                      {row.delegadosProgress}
                    </span>
                    <BarraProgreso
                      pct={row.delegadosPercent}
                      tono={row.delegadosPercent === 100 ? "primary" : "error"}
                      ariaLabel={`E-14 Delegados ${row.delegadosProgress} (${row.delegadosPercent}%)`}
                    />
                  </div>

                  {/* E-14 Transmisión — progreso ([OLA6-UX] ídem; tono
                      secundario >= 50 % — regla existente). */}
                  <div className="col-span-1 flex flex-col items-center gap-1">
                    <span className="text-body-md font-body-md font-stats-number tabular-nums">
                      {row.transmisionProgress}
                    </span>
                    <BarraProgreso
                      pct={row.transmisionPercent}
                      tono={
                        row.transmisionPercent === 100
                          ? "primary"
                          : row.transmisionPercent >= 50
                            ? "secondary"
                            : "error"
                      }
                      ariaLabel={`E-14 Transmisión ${row.transmisionProgress} (${row.transmisionPercent}%)`}
                    />
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
                      className="text-on-surface-variant hover:text-primary transition-colors p-1 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 disabled:opacity-30 disabled:cursor-not-allowed"
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
                      className="text-on-surface-variant hover:text-secondary-fixed-dim transition-colors p-1 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-secondary-fixed-dim/50"
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

          {ordenados.length === 0 ? (
            <div className="px-4 py-12 flex flex-col items-center gap-3 text-on-surface-variant">
              <Search
                size={30}
                className="text-on-surface-variant/40"
                aria-hidden="true"
              />
              <p className="text-body-md font-body-md text-center">
                No se encontraron puestos que coincidan con los filtros
                aplicados.
              </p>
              {/* [OLA7 · M-8] CTA de escape en el estado vacío: antes el
                  único camino era devolver los 5 filtros a mano. */}
              {hayFiltrosActivos && (
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="flex items-center gap-1.5 border border-error/60 text-error px-3 py-2 font-label-caps text-label-caps uppercase tracking-wider rounded-sm hover:bg-error/10 transition-colors"
                >
                  <FilterX size={14} aria-hidden="true" />
                  LIMPIAR FILTROS Y VER LOS {rows.length} PUESTOS
                </button>
              )}
            </div>
          ) : (
            <></>
          )}
        </div>
        </div>{" "/* fin contenedor scrolleable */}

        {/* [OLA7 · M-13] PAGER — pie fijo de la tabla (fuera del scroll):
            ‹ página X de Y › + ventana visible. Ancho completo.
            [OLA6-UX] anillos de foco en los botones y texto con orden
            activo. */}
        {ordenados.length > 0 && (
          <div
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-surface-container border-t border-[#242E2E]"
            role="navigation"
            aria-label="Paginación del monitor global"
          >
            <span className="font-stats-number text-[11px] text-on-surface-variant tabular-nums">
              MOSTRANDO {desde + 1}–{Math.min(desde + FILAS_POR_PAGINA, ordenados.length)} DE {" "}
              {ordenados.length} PUESTOS
              {hayFiltrosActivos && " (FILTRADOS)"}
              {orden && " (ORDENADOS)"}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => irPagina(1)}
                disabled={paginaSegura === 1}
                aria-label="Primera página"
                className="flex items-center justify-center h-8 w-8 border border-[#242E2E] text-on-surface-variant hover:border-primary/50 hover:text-on-surface transition-colors disabled:opacity-30 disabled:cursor-not-allowed rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
              >
                <span className="text-[11px] font-bold" aria-hidden="true">«</span>
              </button>
              <button
                type="button"
                onClick={() => irPagina(paginaSegura - 1)}
                disabled={paginaSegura === 1}
                aria-label="Página anterior"
                className="flex items-center justify-center h-8 w-8 border border-[#242E2E] text-on-surface-variant hover:border-primary/50 hover:text-on-surface transition-colors disabled:opacity-30 disabled:cursor-not-allowed rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </button>
              <span
                className="font-stats-number text-[12px] text-on-surface px-2 tabular-nums"
                aria-current="page"
              >
                {paginaSegura} / {totalPaginas}
              </span>
              <button
                type="button"
                onClick={() => irPagina(paginaSegura + 1)}
                disabled={paginaSegura === totalPaginas}
                aria-label="Página siguiente"
                className="flex items-center justify-center h-8 w-8 border border-[#242E2E] text-on-surface-variant hover:border-primary/50 hover:text-on-surface transition-colors disabled:opacity-30 disabled:cursor-not-allowed rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
              >
                <ChevronRight size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => irPagina(totalPaginas)}
                disabled={paginaSegura === totalPaginas}
                aria-label="Última página"
                className="flex items-center justify-center h-8 w-8 border border-[#242E2E] text-on-surface-variant hover:border-primary/50 hover:text-on-surface transition-colors disabled:opacity-30 disabled:cursor-not-allowed rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
              >
                <span className="text-[11px] font-bold" aria-hidden="true">»</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
