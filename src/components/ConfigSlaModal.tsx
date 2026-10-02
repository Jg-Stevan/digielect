import React, { useState } from 'react';

interface ConfigSlaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (config: { fase1: number; fase2: number; fase3: number }) => void;
}

export const ConfigSlaModal: React.FC<ConfigSlaModalProps> = ({ isOpen, onClose, onSave }) => {
  const [fase1, setFase1] = useState(20);
  const [fase2, setFase2] = useState(40);
  const [fase3, setFase3] = useState(90);
  const [autoEscalateWa, setAutoEscalateWa] = useState(true);
  const [autoEmailConsul, setAutoEmailConsul] = useState(true);

  if (!isOpen) return null;

  const handleSave = () => {
    if (onSave) onSave({ fase1, fase2, fase3 });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-surface-container border border-[#242E2E] w-full max-w-lg flex flex-col shadow-2xl rounded-xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#172121] px-6 py-4 border-b border-[#242E2E] flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[24px]">settings</span>
            <div>
              <h2 className="font-headline-md text-on-surface font-bold text-[15px] uppercase">
                Configurar Umbrales SLA
              </h2>
              <span className="text-[11px] text-on-surface-variant font-mono">
                Reglas automáticas de tolerancia y escalamiento
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

        {/* Form Body */}
        <div className="p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[12px] font-bold">
              <span className="text-primary">FASE 1: RITMO NORMAL (VENTANA BASE)</span>
              <span className="font-stats-number text-primary">{fase1} MIN</span>
            </div>
            <p className="text-[11px] text-on-surface-variant">
              Tiempo estimado para conteo de mesa y primera transmisión sin alertas.
            </p>
            <input
              type="range"
              min="10"
              max="40"
              value={fase1}
              onChange={(e) => setFase1(Number(e.target.value))}
              className="accent-primary cursor-pointer w-full mt-1"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[12px] font-bold">
              <span className="text-secondary-container">FASE 2: ADVERTENCIA PREVENTIVA</span>
              <span className="font-stats-number text-secondary-container">{fase2} MIN</span>
            </div>
            <p className="text-[11px] text-on-surface-variant">
              Dispara notificación automatizada vía WhatsApp al enlace consular.
            </p>
            <input
              type="range"
              min="25"
              max="60"
              value={fase2}
              onChange={(e) => setFase2(Number(e.target.value))}
              className="accent-yellow-400 cursor-pointer w-full mt-1"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-[12px] font-bold">
              <span className="text-error">FASE 3: MORA CRÍTICA (ESCALAMIENTO)</span>
              <span className="font-stats-number text-error">{fase3} MIN</span>
            </div>
            <p className="text-[11px] text-on-surface-variant">
              Escala incidencia a la Dirección de Asuntos Migratorios y Consulares.
            </p>
            <input
              type="range"
              min="60"
              max="150"
              value={fase3}
              onChange={(e) => setFase3(Number(e.target.value))}
              className="accent-red-500 cursor-pointer w-full mt-1"
            />
          </div>

          <hr className="border-t border-[#242E2E]" />

          <div className="flex flex-col gap-3 text-[12px]">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoEscalateWa}
                onChange={(e) => setAutoEscalateWa(e.target.checked)}
                className="w-4 h-4 rounded accent-primary bg-surface-container-lowest border-outline-variant"
              />
              <span className="text-on-surface font-body-md">
                Despachar automáticamente alerta WhatsApp al superar Fase 1
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoEmailConsul}
                onChange={(e) => setAutoEmailConsul(e.target.checked)}
                className="w-4 h-4 rounded accent-primary bg-surface-container-lowest border-outline-variant"
              />
              <span className="text-on-surface font-body-md">
                Generar radicado de correo formal con firma del supervisor
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-surface-container-high border-t border-[#242E2E] flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-on-surface-variant hover:text-on-surface font-label-caps text-[11px] uppercase tracking-wider"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 bg-primary text-on-primary font-label-caps font-bold rounded text-[11px] uppercase tracking-wider hover:brightness-110 shadow-md"
          >
            Guardar Configuración
          </button>
        </div>
      </div>
    </div>
  );
};
