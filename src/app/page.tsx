"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Download, LogOut, RefreshCw, RotateCcw, ShieldCheck, Upload } from "lucide-react";
import type {
  AnomaliaItem,
  AppMode,
  ConsulateRow,
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
  apiResetDemo,
  apiResolverAnomalia,
} from "@/lib/api-client";
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

interface BootstrapData {
  consulados: ConsulateRow[];
  anomalias: AnomaliaItem[];
  queueFiles: QueueFileItem[];
  slaRows: SlaRow[];
  resumen: ResumenGlobal;
}

export default function Page() {
  const [app, setApp] = useState<AppMode>("supervisor");
  const [loading, setLoading] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const [section, setSection] = useState<
    | "monitor-global"
    | "carga-masiva"
    | "centro-notificaciones"
    | "revision-anomalias"
    | "generar-informes"
  >("monitor-global");

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

  // ---------------- FASE 5 · Sincronización pestaña↔pestaña (rol B) ----------------
  // El Monitor se actualiza EN VIVO cuando otra pestaña del mismo
  // navegador ingiere hojas (digitalizador) o corre el BATCH, vía
  // BroadcastChannel "digielect-sync". En modo demo además se
  // invalida la copia en memoria del demo-store (la otra pestaña
  // mutó el localStorage). Degradación silenciosa sin BroadcastChannel.
  const refetchThrottleRef = useRef(0);
  useEffect(() => {
    const desuscribir = suscribirSync((msg: MensajeSync) => {
      if (msg.evento === "hoja:ingestada" || msg.evento === "anomalia:nueva") {
        invalidarCacheDemo();
        void refetch();
        return;
      }
      if (msg.evento === "sesion:reset") {
        invalidarCacheDemo();
        void refetch();
        return;
      }
      if (msg.evento === "batch:progreso") {
        // Throttle 1/s: el BATCH emite un evento por hoja
        const ahora = Date.now();
        if (ahora - refetchThrottleRef.current < 1000) return;
        refetchThrottleRef.current = ahora;
        invalidarCacheDemo();
        void refetch();
      }
    });
    return desuscribir;
  }, [refetch]);

  // Respaldo del canal: el evento "storage" también avisa cambios
  // de localStorage entre pestañas (donde no hay BroadcastChannel)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === "digielect-demo-v1") {
        invalidarCacheDemo();
        void refetch();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refetch]);

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

  /** Abre el modal de auditoría para una mesa (RF-2.3) */
  const handleOpenReinspection = (mesaId?: string) => {
    const ref = mesaId ?? "mesa-roma-001";

    // Buscar la anomalía abierta de esa mesa
    const anomalia = data.anomalias.find((a) => a.mesaIdRef === ref);
    // Buscar la mesa en el monitor para etiqueta
    let mesaLabel = ref;
    for (const c of data.consulados) {
      const mesa = c.mesas.find((m) => m.id === ref);
      if (mesa) {
        mesaLabel = `${mesa.mesaNumber} · ${c.puesto}`;
        break;
      }
    }

    setReinspectionTarget({
      mesaId: ref,
      mesaLabel,
      anomaliaId: anomalia?.id,
      formulario: anomalia?.formulario ?? "TRANSMISIÓN - PÁGINA 2",
      tipoLabel: anomalia?.tipoLabel ?? "REVISIÓN MANUAL",
      actaImagenUrl: IS_STATIC_EXPORT
        ? imagenDemoParaActa(anomalia?.actaId)
        : anomalia?.actaId
          ? `/api/actas/${anomalia.actaId}/imagen`
          : withBasePath(
              "/actas-ejemplo/E14_XXX_X_88_495_010_02_000_X_XXX-2.jpg"
            ),
    });
    setReinspectionOpen(true);
  };

  /** Resuelve la anomalía desde el modal (APROBADA / RESCANEO) */
  const handleResolveReinspection = async (
    action: "APROBADA" | "RESCANEO_CONFIRMADO",
    justificacion: string
  ) => {
    if (!reinspectionTarget) return;
    try {
      const json = await apiResolverAnomalia(
        reinspectionTarget.anomaliaId,
        action,
        justificacion
      );
      if (!json.ok) {
        alert(json.error ?? "Error resolviendo la anomalía");
        return;
      }
      setReinspectionOpen(false);
      await refetch();
    } catch (e) {
      console.error(e);
      alert("Error de red al resolver la anomalía");
    } finally {
      setReinspectionOpen(false);
    }
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
        alert(json.error ?? "No se pudo integrar el archivo");
        return;
      }
      await refetch();
    } catch (e) {
      console.error(e);
      alert("Error de red al integrar el archivo");
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
    handleOpenReinspection(anomalia.mesaIdRef);
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
      />

      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        <Header
          currentSection={section}
          onSelectSection={setSection}
          anomaliasCount={data.anomalias.length}
          onOpenDigitalizador={() => setApp("digitalizador")}
        />

        <main className="flex-1 p-4 sm:p-6 pt-[72px] lg:pt-20 overflow-x-hidden min-h-screen">
          {/* Barra de refresco + sesión */}
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-[10px] text-on-surface-variant font-stats-number">
              <span className="w-1.5 h-1.5 rounded-full bg-primary pulse-dot" />
              {refrescando || loading
                ? "SINCRONIZANDO..."
                : `ÚLTIMA SYNC · ${new Date().toLocaleTimeString("es-CO", { timeZone: "America/Bogota" })}`}
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
                onClick={() => {
                  setAuthUsuario(null);
                  setApp("supervisor");
                }}
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
                          alert("No se pudo exportar la sesión");
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
                              alert(res.error ?? "No se pudo importar");
                              return;
                            }
                            await refetch();
                          } catch {
                            alert("No se pudo leer el archivo de sesión");
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
                />
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
