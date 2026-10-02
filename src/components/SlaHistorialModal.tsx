import React from 'react';
import { SlaRow } from '../types';

interface SlaHistorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  consulate: SlaRow | null;
}

export const SlaHistorialModal: React.FC<SlaHistorialModalProps> = ({
  isOpen,
  onClose,
  consulate,
}) => {
  if (!isOpen || !consulate) return null;

  const events = [
    {
      time: '16:48 UTC',
      tag: 'ACUSE DE RECIBO',
      text: 'El delegado consular confirmó lectura de alerta y notificó que el operador inició el lote de escaneo.',
      type: 'success',
    },
    {
      time: '16:45 UTC',
      tag: 'DESPACHO ALERTA FASE 3',
      text: 'Disparo automático de notificación nivel 2 por superar 40 minutos sin recepción de transmisión.',
      type: 'error',
    },
    {
      time: '16:22 UTC',
      tag: 'DESPACHO ALERTA FASE 2',
      text: 'Notificación preventiva enviada a terminal móvil vía WhatsApp Business API con acuse de entrega.',
      type: 'warning',
    },
    {
      time: '16:00 UTC',
      tag: 'CIERRE DE URNAS',
      text: `Puesto ${consulate.puesto} declaró formalmente cerrada la jornada de sufragio con presencia de testigos.`,
      type: 'info',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-surface-container border border-[#242E2E] w-full max-w-xl flex flex-col shadow-2xl rounded-xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#172121] px-6 py-4 border-b border-[#242E2E] flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[24px]">history</span>
            <div>
              <h2 className="font-headline-md text-on-surface font-bold text-[15px]">
                Historial de Trazabilidad SLA
              </h2>
              <span className="text-[11px] text-on-surface-variant font-mono">
                {consulate.consulateName} — {consulate.puesto}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3 bg-surface-container-lowest p-3 rounded border border-outline-variant/30 text-[11px] font-mono">
            <div>
              <span className="text-on-surface-variant">PAÍS / JURISDICCIÓN:</span>
              <p className="text-on-surface font-bold">{consulate.pais}</p>
            </div>
            <div>
              <span className="text-on-surface-variant">ESTADO DE MORA:</span>
              <p className="text-tertiary-container font-bold">{consulate.tiempoTranscurridoLabel}</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 relative pl-4 border-l-2 border-outline-variant/40 ml-2 mt-2">
            {events.map((ev, i) => (
              <div key={i} className="relative">
                <div
                  className={`absolute -left-[23px] top-1 w-3 h-3 rounded-full border-2 border-surface-container ${
                    ev.type === 'success'
                      ? 'bg-primary'
                      : ev.type === 'error'
                      ? 'bg-error'
                      : ev.type === 'warning'
                      ? 'bg-secondary-container'
                      : 'bg-outline'
                  }`}
                ></div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-primary">{ev.time}</span>
                    <span
                      className={`text-[9px] font-label-caps font-bold px-1.5 py-0.2 rounded border ${
                        ev.type === 'success'
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : ev.type === 'error'
                          ? 'bg-error/10 border-error/30 text-error'
                          : 'bg-secondary-container/10 border-secondary-container/30 text-secondary-container'
                      }`}
                    >
                      {ev.tag}
                    </span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed mt-0.5">
                    {ev.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-surface-container-high border-t border-[#242E2E] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-primary text-on-primary font-label-caps font-bold rounded text-[11px] uppercase tracking-wider"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
