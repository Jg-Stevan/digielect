import { useState } from 'react';
import { NavSection, ConsulateRow, QueueFileItem, SlaRow, AnomaliaItem } from './types';
import {
  INITIAL_CONSULATES,
  INITIAL_QUEUE_FILES,
  INITIAL_SLA_DATA,
  INITIAL_ANOMALIAS,
} from './mockData';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { MonitorGlobal } from './components/MonitorGlobal';
import { CargaMasiva } from './components/CargaMasiva';
import { CentroNotificaciones } from './components/CentroNotificaciones';
import { RevisionAnomalias } from './components/RevisionAnomalias';
import { GenerarInformes } from './components/GenerarInformes';
import { ReinspectionModal } from './components/ReinspectionModal';
import { WhatsAppChatModal } from './components/WhatsAppChatModal';
import { SlaHistorialModal } from './components/SlaHistorialModal';
import { ConfigSlaModal } from './components/ConfigSlaModal';

export default function App() {
  const [currentSection, setCurrentSection] = useState<NavSection>('monitor-global');
  const [consulates, setConsulates] = useState<ConsulateRow[]>(INITIAL_CONSULATES);
  const [queueFiles, setQueueFiles] = useState<QueueFileItem[]>(INITIAL_QUEUE_FILES);
  const [slaRows] = useState<SlaRow[]>(INITIAL_SLA_DATA);
  const [anomalias, setAnomalias] = useState<AnomaliaItem[]>(INITIAL_ANOMALIAS);

  // Modals state
  const [reinspectionOpen, setReinspectionOpen] = useState(false);
  const [activeMesaId, setActiveMesaId] = useState<string | undefined>('mesa-roma-001');

  const [chatOpen, setChatOpen] = useState(false);
  const [chatConsulate, setChatConsulate] = useState('Consulado Roma');

  const [historialOpen, setHistorialOpen] = useState(false);
  const [selectedHistorialConsulate, setSelectedHistorialConsulate] = useState<SlaRow | null>(null);

  const [configSlaOpen, setConfigSlaOpen] = useState(false);

  // Handlers
  const handleOpenReinspection = (mesaId?: string) => {
    setActiveMesaId(mesaId || 'mesa-roma-001');
    setReinspectionOpen(true);
  };

  const handleResolveReinspection = (
    action: 'APROBADA' | 'RESCANEO_CONFIRMADO',
    _observation: string
  ) => {
    if (action === 'APROBADA') {
      // Mark mesa 001 in Roma as complete
      setConsulates((prev) =>
        prev.map((c) => {
          if (c.id === 'italia-roma') {
            const updatedMesas = c.mesas.map((m) => {
              if (m.id === 'mesa-roma-001') {
                return {
                  ...m,
                  transmision: { p1: true, p2: true },
                  estado: 'COMPLETO' as const,
                  ultimaCarga: 'Aprobado hace 1 min',
                };
              }
              return m;
            });
            return {
              ...c,
              transmisionProgress: '8/16',
              transmisionPercent: 50,
              mesas: updatedMesas,
            };
          }
          return c;
        })
      );

      // Remove from anomalias list
      setAnomalias((prev) => prev.filter((a) => a.mesaIdRef !== 'mesa-roma-001'));
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

  const handleIntegrateBatch = () => {
    // When batch is integrated:
    // 1. Resolve Roma mesa 001 alert
    setConsulates((prev) =>
      prev.map((c) => {
        if (c.id === 'italia-roma') {
          return {
            ...c,
            transmisionProgress: '8/16',
            transmisionPercent: 50,
            estadoGlobal: 'PENDIENTE',
            mesas: c.mesas.map((m) =>
              m.id === 'mesa-roma-001'
                ? {
                    ...m,
                    transmision: { p1: true, p2: true },
                    estado: 'COMPLETO' as const,
                    ultimaCarga: 'Subida manual OCR',
                  }
                : m
            ),
          };
        }
        return c;
      })
    );
    // Remove the resolved file from queue
    setQueueFiles((prev) => prev.filter((f) => f.id !== 'file-02'));
    // Clear the anomaly
    setAnomalias((prev) => prev.filter((a) => a.mesaIdRef !== 'mesa-roma-001'));
  };

  const handleRemoveQueueFile = (id: string) => {
    setQueueFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleResolveAnomalia = (anomalia: AnomaliaItem) => {
    setActiveMesaId(anomalia.mesaIdRef);
    setReinspectionOpen(true);
  };

  return (
    <div className="bg-background text-on-surface font-body-md min-h-screen flex selection:bg-primary/20 selection:text-primary">
      {/* Sidebar */}
      <Sidebar
        currentSection={currentSection}
        onSelectSection={setCurrentSection}
        anomaliasCount={anomalias.length}
      />

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-w-0 pl-64">
        {/* Top Header */}
        <Header />

        {/* Dynamic Content View with top spacing for header */}
        <main className="flex-1 p-6 pt-20 overflow-y-auto">
          {currentSection === 'monitor-global' && (
            <MonitorGlobal
              consulates={consulates}
              onOpenReinspection={handleOpenReinspection}
              onOpenWhatsApp={handleOpenWhatsApp}
            />
          )}

          {currentSection === 'carga-masiva' && (
            <CargaMasiva
              queueFiles={queueFiles}
              onIntegrate={handleIntegrateBatch}
              onRemoveFile={handleRemoveQueueFile}
            />
          )}

          {currentSection === 'centro-notificaciones' && (
            <CentroNotificaciones
              slaRows={slaRows}
              onOpenWhatsApp={handleOpenWhatsApp}
              onOpenHistorial={handleOpenHistorial}
              onOpenConfigSla={() => setConfigSlaOpen(true)}
              onExportReport={() => setCurrentSection('generar-informes')}
            />
          )}

          {currentSection === 'revision-anomalias' && (
            <RevisionAnomalias
              anomalias={anomalias}
              onResolveAnomalia={handleResolveAnomalia}
            />
          )}

          {currentSection === 'generar-informes' && (
            <GenerarInformes
              consulates={consulates}
              anomalias={anomalias}
              slaRows={slaRows}
            />
          )}
        </main>
      </div>

      {/* Reinspection Modal */}
      <ReinspectionModal
        isOpen={reinspectionOpen}
        onClose={() => setReinspectionOpen(false)}
        mesaId={activeMesaId}
        onResolve={handleResolveReinspection}
      />

      {/* WhatsApp Consular Chat Modal */}
      <WhatsAppChatModal
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        consulateName={chatConsulate}
      />

      {/* SLA Historial Modal */}
      <SlaHistorialModal
        isOpen={historialOpen}
        onClose={() => setHistorialOpen(false)}
        consulate={selectedHistorialConsulate}
      />

      {/* SLA Configuration Modal */}
      <ConfigSlaModal
        isOpen={configSlaOpen}
        onClose={() => setConfigSlaOpen(false)}
      />
    </div>
  );
}
