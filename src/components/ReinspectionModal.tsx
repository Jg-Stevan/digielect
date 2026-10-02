import React, { useState } from 'react';

interface ReinspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  mesaId?: string;
  onResolve?: (action: 'APROBADA' | 'RESCANEO_CONFIRMADO', observation: string) => void;
}

export const ReinspectionModal: React.FC<ReinspectionModalProps> = ({
  isOpen,
  onClose,
  onResolve,
}) => {
  const [formType, setFormType] = useState<'DELEGADOS' | 'TRANSMISIÓN'>('TRANSMISIÓN');
  const [activePage, setActivePage] = useState<1 | 2>(2);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [rotation, setRotation] = useState<number>(0);
  const [highContrast, setHighContrast] = useState<boolean>(false);
  const [currentMesaIdx, setCurrentMesaIdx] = useState<number>(1);
  const [observation, setObservation] = useState<string>('');
  const [timeline, setTimeline] = useState([
    {
      time: '14:20 LOCAL',
      title: 'SOLICITUD DE RESCANEO',
      desc: 'Alerta automática: Falta de firmas / Ilegible',
      color: 'bg-error',
      textColor: 'text-error',
    },
    {
      time: '14:18 LOCAL',
      title: 'RECIBIDO EN COLA',
      desc: 'Enviado desde sesión #A92-F',
      color: 'bg-secondary-fixed-dim',
      textColor: 'text-secondary-fixed-dim',
    },
    {
      time: '14:00 LOCAL',
      title: 'PENDIENTE',
      desc: 'Cierre del puesto de votación',
      color: 'bg-outline',
      textColor: 'text-on-surface-variant',
    },
  ]);
  const [actionDone, setActionDone] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 20, 200));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 20, 60));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleContrastToggle = () => setHighContrast((prev) => !prev);

  const handleApprove = () => {
    const obsText = observation || 'Acta aprobada por el supervisor tras verificación visual.';
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} LOCAL`;
    setTimeline([
      {
        time: timeStr,
        title: 'APROBADA Y VALIDADA',
        desc: obsText,
        color: 'bg-primary',
        textColor: 'text-primary',
      },
      ...timeline,
    ]);
    setActionDone('APROBADA');
    if (onResolve) onResolve('APROBADA', obsText);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  const handleConfirmRescan = () => {
    const obsText = observation || 'Rescaneo confirmado: Falta de firmas de jurados en página 2.';
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} LOCAL`;
    setTimeline([
      {
        time: timeStr,
        title: 'RESCANEO CONFIRMADO',
        desc: obsText,
        color: 'bg-error',
        textColor: 'text-error',
      },
      ...timeline,
    ]);
    setActionDone('RESCANEO_CONFIRMADO');
    if (onResolve) onResolve('RESCANEO_CONFIRMADO', obsText);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
      id="reinspection-modal"
    >
      <div className="bg-surface-container border border-[#242E2E] w-full max-w-[1440px] h-[92vh] flex flex-col shadow-2xl overflow-hidden rounded-md">
        {/* Modal Header */}
        <header className="flex justify-between items-center px-6 py-3 border-b border-[#242E2E] bg-[#090f0f] shrink-0">
          {/* LADO IZQUIERDO */}
          <div className="flex flex-col gap-1 min-w-[280px]">
            <div className="flex items-center gap-1 text-[11px] font-label-caps text-[#869583] tracking-widest uppercase">
              <span>ITALIA (495)</span>
              <span className="material-symbols-outlined text-[12px]">chevron_right</span>
              <span>ZONA 10</span>
              <span className="material-symbols-outlined text-[12px]">chevron_right</span>
              <span className="text-on-surface">CONSULADO ROMA</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-[#171d1d] border border-[#242E2E] px-1 py-0.5">
                <button
                  onClick={() => setCurrentMesaIdx((prev) => (prev > 1 ? prev - 1 : 8))}
                  className="px-1.5 py-0.5 text-on-surface-variant hover:text-primary transition-colors flex items-center"
                  title="Mesa anterior"
                >
                  <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                </button>
                <span className="text-headline-md font-headline-md font-bold text-primary px-2 tracking-tight">
                  MESA {currentMesaIdx}/8
                </span>
                <button
                  onClick={() => setCurrentMesaIdx((prev) => (prev < 8 ? prev + 1 : 1))}
                  className="px-1.5 py-0.5 text-on-surface-variant hover:text-primary transition-colors flex items-center"
                  title="Mesa siguiente"
                >
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </button>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-label-caps text-[#869583]">
                <span className="px-2 py-0.5 bg-[#1b2121] border border-[#242E2E] text-primary font-stats-number">
                  ID: #A92-F
                </span>
                <span>14:20 LOCAL</span>
              </div>
            </div>
          </div>

          {/* CENTRO: NAVEGADOR DE FORMULARIO Y PÁGINAS */}
          <div className="flex items-center gap-4">
            {/* Selector Tipo Formulario */}
            <div className="flex items-center bg-[#0e1414] border border-[#242E2E] p-1 rounded-sm">
              <button
                onClick={() => setFormType('DELEGADOS')}
                className={`px-3 py-1 text-label-caps font-label-caps transition-all flex items-center gap-1.5 ${
                  formType === 'DELEGADOS'
                    ? 'font-bold bg-[#003912] text-primary border border-primary'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">badge</span>
                <span>DELEGADOS</span>
              </button>
              <button
                onClick={() => setFormType('TRANSMISIÓN')}
                className={`px-3 py-1 text-label-caps font-label-caps transition-all flex items-center gap-1.5 ${
                  formType === 'TRANSMISIÓN'
                    ? 'font-bold bg-[#003912] text-primary border border-primary'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">send</span>
                <span>TRANSMISIÓN</span>
              </button>
            </div>

            <div className="w-px h-6 bg-[#242E2E]"></div>

            {/* Conmutador de Folio / Páginas */}
            <div className="flex items-center bg-[#0e1414] border border-[#242E2E] p-1 gap-1 rounded-sm">
              <button
                onClick={() => setActivePage(1)}
                className={`px-3 py-1 text-label-caps font-label-caps transition-all flex items-center gap-1.5 border ${
                  activePage === 1
                    ? 'border-primary text-primary bg-[#003912]/30'
                    : 'text-on-surface-variant hover:bg-surface-container-high border-transparent'
                }`}
              >
                <span>PÁGINA 1</span>
                <span className="bg-[#003912] text-primary px-1.5 py-0.2 rounded text-[10px] font-bold">
                  ✓
                </span>
              </button>
              <button
                onClick={() => setActivePage(2)}
                className={`px-3 py-1 text-label-caps font-label-caps font-bold transition-all flex items-center gap-1.5 border ${
                  activePage === 2
                    ? 'text-error bg-[#410004]/20 border-error animate-pulse'
                    : 'text-error hover:bg-surface-container-high border-transparent'
                }`}
              >
                <span>PÁGINA 2</span>
                <span className="bg-[#410004] text-error px-1.5 py-0.2 rounded text-[10px] font-bold flex items-center">
                  <span className="material-symbols-outlined text-[12px]">warning</span>
                </span>
              </button>
            </div>
          </div>

          {/* LADO DERECHO: ALERTA Y CERRAR */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-[#410004]/20 border border-[#410004] text-error px-3 py-1.5 rounded-full">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span className="text-label-caps font-label-caps tracking-wider text-[11px]">
                MOTIVO: SOLICITUD DE RESCANEO
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded transition-colors"
              title="Cerrar ventana"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          </div>
        </header>

        {/* Modal Content */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* Main Viewer Area */}
          <div className="flex-1 bg-surface-container-lowest relative overflow-hidden flex flex-col">
            {/* Controls Bar Flotante */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-[#121919]/90 backdrop-blur p-1.5 border border-[#242E2E] shadow-xl rounded">
              <button
                onClick={handleZoomIn}
                className="p-1.5 hover:bg-surface-container-highest text-on-surface transition-colors flex items-center rounded"
                title="Acercar (+)"
              >
                <span className="material-symbols-outlined text-[18px]">zoom_in</span>
              </button>
              <button
                onClick={handleZoomOut}
                className="p-1.5 hover:bg-surface-container-highest text-on-surface transition-colors flex items-center rounded"
                title="Alejar (-)"
              >
                <span className="material-symbols-outlined text-[18px]">zoom_out</span>
              </button>
              <span className="text-[11px] font-stats-number text-[#869583] px-1 select-none">
                {zoomLevel}%
              </span>
              <div className="w-px h-5 bg-[#242E2E] my-auto"></div>
              <button
                onClick={handleRotate}
                className="p-1.5 hover:bg-surface-container-highest text-on-surface transition-colors flex items-center rounded"
                title="Rotar 90°"
              >
                <span className="material-symbols-outlined text-[18px]">rotate_right</span>
              </button>
              <button
                onClick={handleContrastToggle}
                className={`p-1.5 transition-colors flex items-center rounded ${
                  highContrast
                    ? 'bg-primary text-on-primary'
                    : 'hover:bg-surface-container-highest text-on-surface'
                }`}
                title="Ajustar Contraste B/N"
              >
                <span className="material-symbols-outlined text-[18px]">contrast</span>
              </button>
              <div className="w-px h-5 bg-[#242E2E] my-auto"></div>
              <button
                onClick={() => {
                  setZoomLevel(100);
                  setRotation(0);
                  setHighContrast(false);
                }}
                className="p-1.5 hover:bg-surface-container-highest text-on-surface transition-colors flex items-center rounded"
                title="Restablecer vista"
              >
                <span className="material-symbols-outlined text-[18px]">fullscreen</span>
              </button>
            </div>

            {/* Flechas Laterales de Navegación Rápida */}
            <button
              onClick={() => setActivePage(1)}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-[#0e1414]/90 hover:bg-surface-container-high border border-[#242E2E] text-on-surface hover:text-primary flex items-center justify-center transition-colors shadow-lg rounded"
              title="Página anterior (Pág 1)"
            >
              <span className="material-symbols-outlined text-[24px]">chevron_left</span>
            </button>
            <button
              onClick={() => setActivePage(2)}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-[#0e1414]/90 hover:bg-surface-container-high border border-[#242E2E] text-on-surface hover:text-primary flex items-center justify-center transition-colors shadow-lg rounded"
              title="Página siguiente (Pág 2)"
            >
              <span className="material-symbols-outlined text-[24px]">chevron_right</span>
            </button>

            {/* Image Display Area */}
            <div className="flex-1 flex items-center justify-center p-6 overflow-auto relative">
              <div
                style={{
                  transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                  filter: highContrast ? 'contrast(200%) brightness(120%)' : 'none',
                  transition: 'transform 0.2s ease-out',
                }}
                className="w-full max-w-xl bg-[#1b2121] border-2 border-[#3c4a3c] flex flex-col shadow-2xl relative select-none rounded"
              >
                {/* Top Header del Formulario E-14 */}
                <div className="bg-[#090f0f] border-b border-[#242E2E] p-3 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    {activePage === 2 ? (
                      <span className="bg-error text-[#690005] text-[10px] font-bold px-1.5 py-0.5 rounded">
                        ANOMALÍA DETECTADA
                      </span>
                    ) : (
                      <span className="bg-primary text-[#003912] text-[10px] font-bold px-1.5 py-0.5 rounded">
                        DOCUMENTO VÁLIDO
                      </span>
                    )}
                    <span className="text-[11px] font-stats-number text-[#dee4e3]">
                      FORMULARIO E-14 ({formType})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-stats-number text-primary border border-primary px-1.5 py-0.5 rounded">
                      FOLIO: 00{activePage}/002
                    </span>
                  </div>
                </div>

                {/* Cuerpo del Acta / Vista de Documento */}
                <div className="p-4 flex flex-col justify-between bg-[#121919] relative opacity-95">
                  {/* Encabezado de mesa */}
                  <div className="border border-[#242E2E] p-2.5 bg-[#0e1414] text-[10px] font-stats-number flex justify-between text-[#869583]">
                    <span>DEPARTAMENTO: CONSULAR (EXT)</span>
                    <span>MUNICIPIO: ROMA (02)</span>
                    <span className="text-primary font-bold">MESA: 001</span>
                  </div>

                  {/* Tabla de Votos */}
                  <div className="border border-[#242E2E] mt-3 flex flex-col divide-y divide-[#242E2E] text-[11px] font-stats-number">
                    <div className="flex justify-between p-1.5 bg-[#1b2121] text-[#869583] font-bold text-[9px] uppercase tracking-wider">
                      <span>PARTIDO / MOVIMIENTO</span>
                      <span>TOTAL VOTOS</span>
                    </div>
                    <div className="flex justify-between p-1.5 text-on-surface hover:bg-surface-container-high transition-colors">
                      <span>001 - PARTIDO LIBERAL</span>
                      <span className="text-primary font-bold">042</span>
                    </div>
                    <div className="flex justify-between p-1.5 text-on-surface hover:bg-surface-container-high transition-colors">
                      <span>002 - PARTIDO CONSERVADOR</span>
                      <span className="text-primary font-bold">038</span>
                    </div>
                    <div className="flex justify-between p-1.5 text-on-surface hover:bg-surface-container-high transition-colors">
                      <span>003 - PACTO HISTÓRICO</span>
                      <span className="text-primary font-bold">089</span>
                    </div>
                    <div className="flex justify-between p-1.5 text-on-surface hover:bg-surface-container-high transition-colors">
                      <span>004 - CENTRO DEMOCRÁTICO</span>
                      <span className="text-primary font-bold">051</span>
                    </div>
                    <div className="flex justify-between p-1.5 text-on-surface hover:bg-surface-container-high transition-colors">
                      <span>005 - ALIANZA VERDE</span>
                      <span className="text-primary font-bold">027</span>
                    </div>
                    <div className="flex justify-between p-1.5 text-on-surface-variant bg-[#171d1d]">
                      <span>VOTOS EN BLANCO</span>
                      <span className="font-bold">004</span>
                    </div>
                    <div className="flex justify-between p-1.5 text-on-surface-variant bg-[#171d1d]">
                      <span>VOTOS NULOS</span>
                      <span className="font-bold">002</span>
                    </div>
                  </div>

                  {/* Zona de Firmas: Page 2 vs Page 1 */}
                  {activePage === 2 ? (
                    <div className="mt-3 border-2 border-dashed border-error bg-[#410004]/10 p-2.5 relative flex flex-col gap-1 rounded">
                      <div className="flex justify-between items-center text-error text-[10px] font-bold">
                        <span className="flex items-center gap-1 font-label-caps">
                          <span className="material-symbols-outlined text-[14px]">warning</span>
                          SECCIÓN FIRMAS DE JURADOS
                        </span>
                        <span className="bg-error text-[#410004] px-1.5 py-0.5 text-[9px] rounded font-stats-number">
                          ILEGIBLE / FALTANTE
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        <div className="h-8 border border-[#410004] flex items-center justify-center text-[9px] text-[#869583] italic bg-black/20 rounded">
                          Firma Jurado 1 ✓
                        </div>
                        <div className="h-8 border border-error bg-error/15 flex items-center justify-center text-[9px] text-error font-bold rounded animate-pulse">
                          NO DETECTADA ✕
                        </div>
                        <div className="h-8 border border-[#410004] flex items-center justify-center text-[9px] text-[#869583] italic bg-black/20 rounded">
                          Firma Jurado 3 ✓
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 border border-primary/40 bg-primary/5 p-2.5 relative flex flex-col gap-1 rounded">
                      <div className="flex justify-between items-center text-primary text-[10px] font-bold">
                        <span className="flex items-center gap-1 font-label-caps">
                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          SECCIÓN CONTROL INICIAL DE URNAS
                        </span>
                        <span className="bg-primary text-[#003912] px-1.5 py-0.5 text-[9px] rounded font-stats-number">
                          CONFORME (100%)
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        <div className="h-8 border border-primary/30 flex items-center justify-center text-[9px] text-primary italic bg-black/20 rounded">
                          Apertura 08:00 AM ✓
                        </div>
                        <div className="h-8 border border-primary/30 flex items-center justify-center text-[9px] text-primary italic bg-black/20 rounded">
                          Urnas Vacías Verificadas ✓
                        </div>
                        <div className="h-8 border border-primary/30 flex items-center justify-center text-[9px] text-primary italic bg-black/20 rounded">
                          Firma Clavero 1 ✓
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Indicador Inferior Sutil de Folio */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-[#121919]/90 border border-[#242E2E] px-3 py-1 text-[11px] font-label-caps text-[#869583] rounded-full shadow-md">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  activePage === 2 ? 'bg-error animate-pulse' : 'bg-primary'
                }`}
              ></span>
              <span>
                PÁGINA {activePage} DE 2 — FORMULARIO {formType} (E-14)
              </span>
            </div>
          </div>

          {/* Sidebar Actions */}
          <aside className="w-80 border-l border-[#242E2E] bg-surface-container-low p-5 flex flex-col justify-between shrink-0 overflow-y-auto">
            <div className="flex flex-col gap-5">
              {/* Status Alert if action was taken */}
              {actionDone && (
                <div
                  className={`p-3 rounded border text-center font-label-caps text-[11px] ${
                    actionDone === 'APROBADA'
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'bg-error/20 border-error text-error'
                  }`}
                >
                  ✓ ACCIÓN REGISTRADA EXITOSAMENTE
                </div>
              )}

              {/* Botones de acción */}
              <div>
                <h3 className="text-label-caps font-label-caps text-on-surface-variant mb-3 uppercase tracking-widest text-[11px]">
                  Acciones del Supervisor
                </h3>
                <div className="flex flex-col gap-2.5">
                  <button
                    onClick={handleApprove}
                    className="w-full py-2.5 bg-primary text-on-primary font-label-caps font-bold rounded hover:brightness-110 transition-all active:scale-98 flex items-center justify-center gap-2 text-[12px] shadow-lg shadow-primary/20"
                  >
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                    APROBAR Y MARCAR COMO VÁLIDA
                  </button>
                  <button
                    onClick={handleConfirmRescan}
                    className="w-full py-2.5 border border-error bg-[#410004]/10 text-error font-label-caps font-bold rounded hover:bg-error/20 transition-all active:scale-98 flex items-center justify-center gap-2 text-[12px]"
                  >
                    <span className="material-symbols-outlined text-[18px]">replay</span>
                    CONFIRMAR RESCANEO
                  </button>
                </div>
              </div>

              {/* Observaciones */}
              <div className="flex flex-col">
                <label className="text-label-caps font-label-caps text-on-surface-variant mb-1.5 uppercase text-[11px]">
                  Observaciones
                </label>
                <textarea
                  value={observation}
                  onChange={(e) => setObservation(e.target.value)}
                  className="bg-surface-container-lowest border border-[#242E2E] p-2.5 text-body-md font-body-md text-on-surface focus:border-primary focus:ring-0 resize-none h-[88px] text-[12px] rounded"
                  placeholder="Ingrese el motivo de la decisión..."
                ></textarea>
              </div>

              {/* Historial y Trazabilidad */}
              <div className="flex flex-col gap-3">
                <h3 className="text-label-caps font-label-caps text-on-surface-variant uppercase tracking-widest text-[10px]">
                  HISTORIAL Y TRAZABILIDAD
                </h3>
                <div className="flex flex-col gap-3 relative pl-4 border-l border-outline-variant ml-1.5">
                  {timeline.map((item, idx) => (
                    <div key={idx} className="relative">
                      <div
                        className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full ${item.color} border-2 border-surface-container-low`}
                      ></div>
                      <div className="flex flex-col">
                        <span className={`text-[11px] font-bold ${item.textColor} leading-tight`}>
                          {item.time} — {item.title}
                        </span>
                        <span className="text-[10px] text-on-surface-variant leading-normal mt-0.5">
                          {item.desc}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Legal / Audit footnote */}
            <div className="pt-3 border-t border-[#242E2E] mt-4">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px]">info</span>
                <span className="text-[9px] uppercase tracking-wider">
                  Esta acción quedará registrada en la auditoría.
                </span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
