"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Download, LogOut, RefreshCw, RotateCcw, ShieldCheck, Upload } from "lucide-react";
import type {
  AnomaliaItem,
  AppMode,
  ConsulateRow,
  NavSection,
  QueueFileItem,
  ReinspectionTarget,
  ResumenGlobal,
  SlaRow,
} from "@/lib/types";
import { IS_STATIC_EXPORT, withBasePath } from "@/lib/env";
import {
  apiBatch,
  apiBootstrap,
  apiExportarSesion,
  apiImportarSesion,
  apiLogout,
  apiResetDemo,
  apiResolverAnomalia,
  apiSesion,
} from "@/lib/api-client";
import { useToast } from "@/hooks/use-toast";
import { imagenDemoParaActa, invalidarCacheDemo } from "@/lib/demo-store";
import { suscribirSync, type MensajeSync } from "@/lib/sync";
import {
  getAuthUsuario,
  getAuthUsuarioServer,
  setAuthUsuario,
  subscribeAuth,
} from "@/lib/auth-store";
import { Sidebar } from "@/components/supervisor/Sidebar";
import { Header } from "@/components/supervisor/Header";
import { LoginScreen } from "@/components/supervisor/LoginScreen";
import { SaludSistema } from "@/components/supervisor/SaludSistema";
import { MonitorGlobal } from "@/components/supervisor/MonitorGlobal";
import { CargaMasiva } from "@/components/supervisor/CargaMasiva";
import { CentroNotificaciones } from "@/components/supervisor/CentroNotificaciones";
import { RevisionAnomalias } from "@/components/supervisor/RevisionAnomalias";
import { GenerarInformes } from "@/components/supervisor/GenerarInformes";
import { ReinspectionModal } from "@/components/supervisor/ReinspectionModal";
import { WhatsAppChatModal } from "@/components/supervisor/WhatsAppChatModal";
import { SlaHistorialModal } from "@/components/supervisor/SlaHistorialModal";
import { ConfigSlaModal } from "@/components/supervisor/ConfigSlaModal";
import { DigitalizadorApp } from "@/components/digitalizador/DigitalizadorApp";
import { TokensDispositivo } from "@/components/supervisor/TokensDispositivo";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface BootstrapData {
  consulados: ConsulateRow[];
  anomalias: AnomaliaItem[];
  queueFiles: QueueFileItem[];
  slaRows: SlaRow[];
  resumen: ResumenGlobal;
}

// [OLA7] ErrorBoundary global: envuelto en el export (crash de render
// en CUALQUIER vista → pantalla de recuperación en español, no la
// pantalla blanca de Next — ver componente para el detalle).
function PageInner() {
  const [app, setApp] = useState<AppMode>("supervisor");
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // [OLA3 3.8 / B-1 AN-2] Momento de la ÚLTIMA SYNC EXITOSA: antes se
  // recalculaba new Date() en cada render (cambiar de sección
  // "refrescaba" la hora sin sincronizar nada). Solo cambia en fetch.
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  // [OLA3 3.9] Feedback unificado: el Toaster shadcn ya montado en el
  // layout (mismo patrón que usa el digitalizador) — se eliminan los
  // 7 avisos "alert" nativos de esta página y el del Sidebar.
  const { toast } = useToast();

  // Sesión del supervisor (localStorage, sin mismatch de hidratación):
  // el digitalizador NO requiere sesión (flujo sin fricción).
  const authUsuario = useSyncExternalStore(
    subscribeAuth,
    getAuthUsuario,
    getAuthUsuarioServer
  );

  const [data, setData] = useState<BootstrapData>({
    consulados: [],
    anomalias: [],
    queueFiles: [],
    slaRows: [],
    resumen: {
      totalPuestos: 0,
      completo: 0,
      critico: 0,
      pendiente: 0,
      noIniciado: 0,
      actasIngestadas: 0,
      anomaliasAbiertas: 0,
    },
  });

  const [section, setSection] = useState<NavSection>("monitor-global");

  // ---------------- Carga de datos ----------------
  const refetch = useCallback(async () => {
    setRefrescando(true);
    try {
      const json = await apiBootstrap();
      if (json.ok) {
        setData({
          consulados: json.consulados ?? [],
          anomalias: json.anomalias ?? [],
          queueFiles: json.queueFiles ?? [],
          slaRows: json.slaRows ?? [],
          resumen: json.resumen ?? {
            totalPuestos: 0,
            completo: 0,
            critico: 0,
            pendiente: 0,
            noIniciado: 0,
            actasIngestadas: 0,
            anomaliasAbiertas: 0,
          },
        });
        setError(null);
        // [OLA3 3.8] Solo la sync EXITOSA actualiza la hora mostrada.
        setLastSyncAt(Date.now());
      } else {
        setError(json.error ?? "Error cargando datos");
      }
    } catch (e) {
      console.error(e);
      setError("Sin conexión con el servidor");
    } finally {
      setLoading(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // [OLA5 5.1] Verificación de sesión contra el SERVIDOR: localStorage
  // hidrata la sesión para UX (sin flash del login), pero la verdad es
  // la cookie httpOnly — si expiró (o se inyectó a mano el valor del
  // auth-store), la UI vuelve al login honestamente en vez de dejar
  // un panel que falla con 401 en cada acción.
  useEffect(() => {
    if (!authUsuario) return;
    let vigente = true;
    void apiSesion().then((sesion) => {
      if (vigente && !sesion.ok) {
        setAuthUsuario(null);
        toast({
          title: "SESIÓN EXPIRADA",
          description: "Inicie sesión de nuevo como supervisor.",
        });
      }
    });
    return () => {
      vigente = false;
    };
  }, [authUsuario]);

  // [OLA3 3.8] Frescura del monitor: refetch ligero cada 60 s, SOLO si
  // la pestaña está visible. horaActualPais / tiempoDesdeCierre / SLA
  // ya no quedan congelados "HACE 3m" durante una hora (A-11 AN-2).
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void refetch();
    }, 60_000);
    return () => window.clearInterval(t);
  }, [refetch]);

  // ---------------- FASE 5 · Sincronización pestaña↔pestaña (rol B) ----------------
  // El Monitor se actualiza EN VIVO cuando otra pestaña del mismo
  // navegador ingiere hojas (digitalizador) o corre el BATCH, vía
  // BroadcastChannel "digielect-sync" (respaldado por el evento
  // "storage" de localStorage). En modo demo se invalida además la
  // copia en memoria del demo-store. Degradación silenciosa sin
  // BroadcastChannel.
  //
  // THROTTLE TRAILING compartido (1/s): el BATCH escribe localStorage
  // por cada hoja ingerida (~23 storage-events por lote) — sin esto,
  // cada escritura dispararía un refetch + re-render completo del
  // monitor y congelaría la pestaña. El trailing garantiza que el
  // ESTADO FINAL siempre llega (nunca se pierde el último evento).
  const ultimoRefetchSyncRef = useRef(0);
  const timeoutPendienteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchSincronizado = useCallback(() => {
    const ahora = Date.now();
    const desde = ahora - ultimoRefetchSyncRef.current;
    if (desde >= 1000) {
      ultimoRefetchSyncRef.current = ahora;
      invalidarCacheDemo();
      void refetch();
      return;
    }
    if (timeoutPendienteRef.current) return;
    timeoutPendienteRef.current = setTimeout(() => {
      timeoutPendienteRef.current = null;
      ultimoRefetchSyncRef.current = Date.now();
      invalidarCacheDemo();
      void refetch();
    }, 1000 - desde);
  }, [refetch]);

  useEffect(() => {
    const desuscribir = suscribirSync((msg: MensajeSync) => {
      refetchSincronizado();
    });
    return desuscribir;
  }, [refetchSincronizado]);

  // Respaldo del canal: el evento "storage" también avisa cambios
  // de localStorage entre pestañas (donde no hay BroadcastChannel)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === "digielect-demo-v1") {
        refetchSincronizado();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      if (timeoutPendienteRef.current) {
        clearTimeout(timeoutPendienteRef.current);
        timeoutPendienteRef.current = null;
      }
    };
  }, [refetchSincronizado]);

  // ---------------- Modales ----------------
  const [reinspectionOpen, setReinspectionOpen] = useState(false);
  const [reinspectionTarget, setReinspectionTarget] =
    useState<ReinspectionTarget | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatConsulate, setChatConsulate] = useState("Consulado Roma");

  const [historialOpen, setHistorialOpen] = useState(false);
  const [selectedHistorialConsulate, setSelectedHistorialConsulate] =
    useState<SlaRow | null>(null);

  const [configSlaOpen, setConfigSlaOpen] = useState(false);

  // ---------------- Handlers ----------------

  /**
   * Abre el modal de auditoría (RF-2.3).
   * [S-15] Puede abrirse DESDE una anomalía concreta (usa SU id, no la
   * primera de la mesa) o desde una mesa (busca su anomalía abierta).
   * [S-08] Sin mesa ni anomalía NO se fabrica nada: el fallback
   * "mesa-roma-001" mostraba una mesa inexistente y buscaba su
   * anomalía fantasma.
   */
  const abrirReinspeccion = (args: { anomalia?: AnomaliaItem; mesaId?: string }) => {
    const { anomalia, mesaId } = args;
    if (!anomalia && !mesaId) return;

    const ref = anomalia?.mesaIdRef ?? mesaId ?? "";
    // Buscar la anomalía abierta de esa mesa SOLO si no vino explícita
    const anomaliaMesa = anomalia ?? data.anomalias.find((a) => a.mesaIdRef === ref);
    // Buscar la mesa en el monitor para etiqueta
    let mesaLabel = ref || "MESA SIN ASIGNAR";
    if (ref) {
      for (const c of data.consulados) {
        const mesa = c.mesas.find((m) => m.id === ref);
        if (mesa) {
          mesaLabel = `${mesa.mesaNumber} · ${c.puesto}`;
          break;
        }
      }
    }

    setReinspectionTarget({
      mesaId: ref || "sin-mesa",
      mesaLabel: anomalia && !ref ? `${anomalia.mesa} · SIN MESA VINCULADA` : mesaLabel,
      anomaliaId: anomaliaMesa?.id,
      formulario: anomaliaMesa?.formulario ?? "TRANSMISIÓN - PÁGINA 2",
      tipoLabel: anomaliaMesa?.tipoLabel ?? "REVISIÓN MANUAL",
      // [OLA3 3.3] Tipo y hora REALES para derivar la evidencia del
      // visor y la timeline del modal (antes: teatro fijo).
      tipoAnomalia: anomaliaMesa?.tipoAnomalia,
      horaAlerta: anomaliaMesa?.horaAlertaLocal,
      actaImagenUrl: IS_STATIC_EXPORT
        ? imagenDemoParaActa(anomaliaMesa?.actaId)
        : anomaliaMesa?.actaId
          ? `/api/actas/${anomaliaMesa.actaId}/imagen`
          : withBasePath(
              "/actas/E14_XXX_X_88_495_010_02_000_X_XXX-2.jpg"
            ),
    });
    setReinspectionOpen(true);
  };

  /** Abre el modal de auditoría para una mesa (RF-2.3) */
  const handleOpenReinspection = (mesaId?: string) => {
    if (!mesaId) return; // [S-08] sin mesa no hay nada que auditar
    abrirReinspeccion({ mesaId });
  };

  /**
   * Resuelve la anomalía desde el modal (APROBADA / RESCANEO).
   * [OLA3 3.2] Devuelve el resultado al modal: SOLO se cierra en
   * éxito (con toast); en error permanece abierto con mensaje inline
   * y la justificación PRESERVADA. Antes el finally cerraba el modal
   * SIEMPRE y la justificación (≥10 chars) se perdía.
   */
  const handleResolveReinspection = async (
    action: "APROBADA" | "RESCANEO_CONFIRMADO",
    justificacion: string
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!reinspectionTarget) {
      return { ok: false, error: "No hay anomalía seleccionada" };
    }
    try {
      const json = await apiResolverAnomalia(
        reinspectionTarget.anomaliaId,
        action,
        justificacion
      );
      if (!json.ok) {
        return { ok: false, error: json.error ?? "Error resolviendo la anomalía" };
      }
    } catch (e) {
      console.error(e);
      return {
        ok: false,
        error: "Error de red al resolver la anomalía — la justificación se conserva",
      };
    }
    // Éxito: toast + refetch. El modal muestra la confirmación y se
    // cierra solo (el padre ya NO lo cierra aquí).
    toast({
      title:
        action === "APROBADA"
          ? "ACTA APROBADA Y VALIDADA"
          : "RESCANEO CONFIRMADO",
      description: "La decisión quedó registrada en la bitácora de auditoría.",
    });
    await refetch();
    return { ok: true };
  };

  const handleOpenWhatsApp = (consulateName: string) => {
    setChatConsulate(consulateName);
    setChatOpen(true);
  };

  const handleOpenHistorial = (consulate: SlaRow) => {
    setSelectedHistorialConsulate(consulate);
    setHistorialOpen(true);
  };

  /** Integra un archivo del lote BATCH (RF-2.4) */
  const handleIntegrate = async (fileId: string) => {
    setRefrescando(true);
    try {
      const json = await apiBatch(fileId, "integrar");
      if (!json.ok) {
        toast({
          title: "No se pudo integrar el archivo",
          description: json.error ?? "Error del servidor",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Archivo integrado al Monitor Global" });
      await refetch();
    } catch (e) {
      console.error(e);
      toast({
        title: "Error de red",
        description: "No se pudo integrar el archivo",
        variant: "destructive",
      });
    } finally {
      setRefrescando(false);
    }
  };

  const handleRemoveQueueFile = async (fileId: string) => {
    try {
      await apiBatch(fileId, "remove");
      await refetch();
    } catch (e) {
      console.error(e);
    }
  };

  const handleResolveAnomalia = (anomalia: AnomaliaItem) => {
    // [S-15] Abre ESTA anomalía (su id), no la primera de su mesa: con
    // dos anomalías abiertas en la misma mesa se abría la equivocada.
    abrirReinspeccion({ anomalia });
  };

  /**
   * [OLA3 3.1] Logout real compartido por el header y el SIDEBAR
   * (antes el del sidebar mostraba un aviso falso de "sesión
   * activa" y no cerraba nada: dos botones idénticos con
   * comportamiento opuesto).
   * [OLA5 5.1] Además expira la cookie httpOnly en el SERVIDOR:
   * limpiar solo localStorage dejaba la sesión viva para las
   * rutas mutantes (resolver/batch/notificaciones).
   */
  const handleLogout = () => {
    void apiLogout();
    setAuthUsuario(null);
    setApp("supervisor");
  };

  // ---------------- Render ----------------

  // PWA del digitalizador — sin credenciales, accesible siempre
  if (app === "digitalizador") {
    return (
      <DigitalizadorApp
        onExit={() => setApp("supervisor")}
        onIngested={refetch}
      />
    );
  }

  // Sin sesión de supervisor → pantalla de acceso (login + digitalizador)
  if (!authUsuario) {
    return (
      <LoginScreen
        onSuccess={(usuario) => setAuthUsuario(usuario)}
        onOpenDigitalizador={() => setApp("digitalizador")}
      />
    );
  }

  return (
    <div className="bg-background text-on-surface font-body-md min-h-screen flex selection:bg-primary/20 selection:text-primary-fixed">
      <Sidebar
        currentSection={section}
        onSelectSection={setSection}
        anomaliasCount={data.anomalias.length}
        onOpenDigitalizador={() => setApp("digitalizador")}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Header
          currentSection={section}
          onSelectSection={setSection}
          anomaliasCount={data.anomalias.length}
          onOpenDigitalizador={() => setApp("digitalizador")}
          connectionState={loading ? "connecting" : error ? "offline" : "online"}
          usuario={authUsuario}
        />

        <main className="flex-1 p-4 sm:p-6 pt-[72px] lg:pt-20 overflow-x-hidden min-h-screen">
          {/* Barra de refresco + sesión — no se imprime (solo el informe) */}
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap print:hidden">
            <div className="flex items-center gap-2 text-[10px] text-on-surface-variant font-stats-number">
              <span className="w-1.5 h-1.5 rounded-full bg-primary pulse-dot" />
              {refrescando || loading
                ? "SINCRONIZANDO..."
                : `ÚLTIMA SYNC · ${new Date(
                    lastSyncAt ?? Date.now()
                  ).toLocaleTimeString("es-CO", {
                    timeZone: "America/Bogota",
                  })}`}
            </div>
            <div className="flex items-center gap-2">
              <span
                className="hidden sm:flex items-center gap-1.5 border border-outline-variant/50 text-on-surface-variant px-2.5 py-1 rounded text-[10px] font-label-caps tracking-wider"
                aria-label="Sesión activa"
              >
                <ShieldCheck size={12} aria-hidden />
                SUPERVISOR · {authUsuario.toUpperCase()}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 border border-outline-variant/50 hover:border-danger/60 hover:text-danger text-on-surface-variant px-2.5 py-1 rounded transition-colors text-[10px] font-label-caps tracking-wider"
                aria-label="Cerrar sesión de supervisor"
              >
                <LogOut size={12} />
                CERRAR SESIÓN
              </button>
              {IS_STATIC_EXPORT && (
                <>
                  <span className="border border-secondary-fixed-dim/50 text-secondary-fixed-dim px-2 py-1 rounded text-[10px] font-label-caps tracking-wider">
                    MODO DEMO · GITHUB PAGES
                  </span>
                  <button
                    onClick={() => {
                      void (async () => {
                        try {
                          const json = await apiExportarSesion();
                          const blob = new Blob([json], {
                            type: "application/json",
                          });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `digielect-sesion-${new Date()
                            .toISOString()
                            .slice(0, 19)
                            .replace(/[:T]/g, "-")}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch {
                          toast({
                            title: "No se pudo exportar la sesión",
                            variant: "destructive",
                          });
                        }
                      })();
                    }}
                    className="flex items-center gap-1.5 border border-outline-variant/50 hover:border-primary/50 hover:text-primary text-on-surface-variant px-2.5 py-1 rounded transition-colors text-[10px] font-label-caps tracking-wider"
                    aria-label="Exportar sesión demo a JSON portable"
                    title="Respaldo portable: localStorage + IndexedDB en un archivo"
                  >
                    <Download size={12} />
                    EXPORTAR SESIÓN
                  </button>
                  <label
                    className="flex items-center gap-1.5 border border-outline-variant/50 hover:border-primary/50 hover:text-primary text-on-surface-variant px-2.5 py-1 rounded transition-colors text-[10px] font-label-caps tracking-wider cursor-pointer"
                    aria-label="Importar sesión demo desde JSON"
                    title="Restaura una sesión exportada (sobrescribe la actual)"
                  >
                    <Upload size={12} />
                    IMPORTAR SESIÓN
                    <input
                      type="file"
                      accept="application/json,.json"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        void (async () => {
                          try {
                            const texto = await f.text();
                            const res = await apiImportarSesion(texto);
                            if (!res.ok) {
                              toast({
                                title: "No se pudo importar la sesión",
                                description: res.error ?? "Error del importador",
                                variant: "destructive",
                              });
                              return;
                            }
                            await refetch();
                          } catch {
                            toast({
                              title: "No se pudo leer el archivo de sesión",
                              variant: "destructive",
                            });
                          }
                        })();
                      }}
                    />
                  </label>
                  <button
                    onClick={() => {
                      void (async () => {
                        await apiResetDemo();
                        await refetch();
                      })();
                    }}
                    className="flex items-center gap-1.5 border border-outline-variant/50 hover:border-warning/60 hover:text-warning text-on-surface-variant px-2.5 py-1 rounded transition-colors text-[10px] font-label-caps tracking-wider"
                    aria-label="Reiniciar datos de la demo"
                  >
                    <RotateCcw size={12} />
                    REINICIAR DEMO
                  </button>
                </>
              )}
              <button
                onClick={refetch}
                disabled={refrescando}
                className="flex items-center gap-1.5 border border-outline-variant/50 hover:border-primary/50 hover:text-primary text-on-surface-variant px-2.5 py-1 rounded transition-colors text-[10px] font-label-caps tracking-wider disabled:opacity-50"
                aria-label="Refrescar datos"
              >
                <RefreshCw size={12} className={refrescando ? "animate-spin" : ""} />
                REFRESCAR
              </button>
            </div>
          </div>

          {error && (
            <div className="border border-error/40 bg-error/10 text-error px-4 py-3 mb-4 rounded">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col gap-4 max-w-[1440px] mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-surface-container border border-outline-variant h-24 animate-pulse rounded-sm"
                  />
                ))}
              </div>
              <div className="bg-surface-container border border-outline-variant h-64 animate-pulse rounded-sm" />
            </div>
          ) : (
            <div className="pb-16">
              {section === "monitor-global" && (
                <>
                  {/* Salud del sistema frente al pico de cierre */}
                  <SaludSistema consulates={data.consulados} />
                  <MonitorGlobal
                    consulates={data.consulados}
                    resumen={data.resumen}
                    onOpenReinspection={handleOpenReinspection}
                    onOpenWhatsApp={handleOpenWhatsApp}
                    anomaliasAbiertas={data.anomalias.length}
                  />
                </>
              )}

              {section === "carga-masiva" && (
                <CargaMasiva
                  queueFiles={data.queueFiles}
                  onIntegrate={handleIntegrate}
                  onRemoveFile={handleRemoveQueueFile}
                  onRefetch={() => void refetch()}
                />
              )}

              {section === "centro-notificaciones" && (
                <CentroNotificaciones
                  slaRows={data.slaRows}
                  onOpenWhatsApp={handleOpenWhatsApp}
                  onOpenHistorial={handleOpenHistorial}
                  onOpenConfigSla={() => setConfigSlaOpen(true)}
                  onExportReport={() => setSection("generar-informes")}
                  onRefresh={() => void refetch()}
                />
              )}

              {section === "tokens-dispositivo" && (
                <TokensDispositivo />
              )}
              {section === "revision-anomalias" && (
                <RevisionAnomalias
                  anomalias={data.anomalias}
                  onResolveAnomalia={handleResolveAnomalia}
                />
              )}

              {section === "generar-informes" && (
                <GenerarInformes
                  consulates={data.consulados}
                  anomalias={data.anomalias}
                  slaRows={data.slaRows}
                  supervisorUsuario={authUsuario}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Modales */}
      <ReinspectionModal
        isOpen={reinspectionOpen}
        target={reinspectionTarget}
        onClose={() => setReinspectionOpen(false)}
        onResolve={handleResolveReinspection}
      />

      <WhatsAppChatModal
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        consulateName={chatConsulate}
      />

      <SlaHistorialModal
        isOpen={historialOpen}
        onClose={() => setHistorialOpen(false)}
        consulate={selectedHistorialConsulate}
      />

      <ConfigSlaModal
        isOpen={configSlaOpen}
        onClose={() => setConfigSlaOpen(false)}
      />
    </div>
  );
}

export default function Page() {
  return (
    <ErrorBoundary>
      <PageInner />
    </ErrorBoundary>
  );
}
