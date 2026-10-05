"use client";

import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  MessageCircle,
  Save,
  Settings,
  Siren,
  Smartphone,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface ConfigSlaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type CanalKey = "wa" | "sms" | "email";
type PhaseKey = "fase1" | "fase2" | "fase3";
type ChannelSet = Record<CanalKey, boolean>;
type ChannelsState = Record<PhaseKey, ChannelSet>;

interface FaseDef {
  key: PhaseKey;
  titulo: string;
  rol: string;
  descripcion: string;
  icono: React.ElementType;
  colorClases: string;
  min: number;
  max: number;
  defecto: number;
}

/** Umbrales por defecto (RN-06) */
const FASES: FaseDef[] = [
  {
    key: "fase1",
    titulo: "Fase 1",
    rol: "Tolerancia",
    descripcion:
      "Ventana base para el conteo de mesa y la primera transmisión sin alertas.",
    icono: Clock,
    colorClases: "text-primary",
    min: 10,
    max: 60,
    defecto: 40,
  },
  {
    key: "fase2",
    titulo: "Fase 2",
    rol: "Advertencia",
    descripcion:
      "Dispara la notificación preventiva automatizada al enlace consular de cada puesto.",
    icono: AlertTriangle,
    colorClases: "text-warning",
    min: 45,
    max: 90,
    defecto: 60,
  },
  {
    key: "fase3",
    titulo: "Fase 3",
    rol: "Crítica",
    descripcion:
      "Mora crítica: escalamiento a la Dirección de Asuntos Migratorios y Consulares.",
    icono: Siren,
    colorClases: "text-danger",
    min: 90,
    max: 240,
    defecto: 120,
  },
];

const CANALES: {
  key: CanalKey;
  label: string;
  icono: React.ElementType;
  clases: string;
}[] = [
  {
    key: "wa",
    label: "WhatsApp",
    icono: MessageCircle,
    clases: "text-whatsapp",
  },
  { key: "sms", label: "SMS", icono: Smartphone, clases: "text-on-surface-variant" },
  { key: "email", label: "Email", icono: Mail, clases: "text-primary" },
];

const CANALES_DEFECTO: ChannelsState = {
  fase1: { wa: true, sms: false, email: false },
  fase2: { wa: true, sms: true, email: false },
  fase3: { wa: true, sms: true, email: true },
};

const ESCALACION_DEFECTO = true;

export const ConfigSlaModal: React.FC<ConfigSlaModalProps> = ({
  isOpen,
  onClose,
}) => {
  // Cierre con tecla Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // El formulario se monta fresco en cada apertura: los valores
  // vuelven a los umbrales por defecto (la configuración no persiste).
  return <ConfigSlaForm onClose={onClose} />;
};

const ConfigSlaForm: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [umbrales, setUmbrales] = useState<Record<PhaseKey, number>>({
    fase1: FASES[0].defecto,
    fase2: FASES[1].defecto,
    fase3: FASES[2].defecto,
  });
  const [canales, setCanales] = useState<ChannelsState>(CANALES_DEFECTO);
  const [escalacionAuto, setEscalacionAuto] = useState(ESCALACION_DEFECTO);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  const cambiarUmbral = (fase: PhaseKey, valor: number) => {
    setUmbrales((prev) => ({ ...prev, [fase]: valor }));
    setGuardado(false);
  };

  const toggleCanal = (fase: PhaseKey, canal: CanalKey) => {
    const siguiente: ChannelsState = { ...canales };
    siguiente[fase] = { ...canales[fase], [canal]: !canales[fase][canal] };
    setCanales(siguiente);
    setGuardado(false);
  };

  const fasesConCanal = FASES.every((f) =>
    Object.values(canales[f.key]).some((activo) => activo)
  );
  const umbralesValidos =
    Number.isFinite(umbrales.fase1) &&
    Number.isFinite(umbrales.fase2) &&
    Number.isFinite(umbrales.fase3) &&
    umbrales.fase1 > 0 &&
    umbrales.fase2 > umbrales.fase1 &&
    umbrales.fase3 > umbrales.fase2;
  const formularioValido = umbralesValidos && fasesConCanal;

  const handleGuardar = () => {
    if (!formularioValido || guardando) return;
    setGuardando(true);
    setGuardado(false);
    // Confirmación simulada (demo: no se persiste en el servidor)
    window.setTimeout(() => {
      setGuardando(false);
      setGuardado(true);
    }, 800);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Configurar umbrales SLA"
    >
      <div className="bg-surface-container border border-outline-variant/50 w-full max-w-lg flex flex-col shadow-2xl rounded-sm overflow-hidden max-h-[92vh]">
        {/* ============ HEADER ============ */}
        <div className="bg-surface-container-high px-5 sm:px-6 py-4 border-b border-outline-variant/40 flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Settings size={22} className="text-primary shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="font-headline-md text-headline-md text-on-surface font-bold uppercase">
                Configurar Umbrales SLA
              </h2>
              <span className="font-stats-number text-[11px] text-on-surface-variant block">
                Reglas automáticas de tolerancia y escalamiento · RN-06
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1.5 rounded-sm hover:bg-surface-container-highest transition-colors shrink-0"
            aria-label="Cerrar configuración SLA"
          >
            <X size={18} />
          </button>
        </div>

        {/* ============ FORMULARIO ============ */}
        <form
          className="p-5 sm:p-6 flex flex-col gap-4 overflow-y-auto"
          onSubmit={(e) => {
            e.preventDefault();
            handleGuardar();
          }}
        >
          {FASES.map((fase) => {
            const IconoFase = fase.icono;
            return (
              <fieldset
                key={fase.key}
                className="bg-surface-container-lowest border border-outline-variant/40 rounded-sm p-4"
              >
                <legend className="sr-only">
                  Configuración de la {fase.titulo}: {fase.rol}
                </legend>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <IconoFase size={16} className={fase.colorClases} aria-hidden="true" />
                    <span
                      className={`font-label-caps text-label-caps uppercase tracking-wider ${fase.colorClases}`}
                    >
                      {fase.titulo}: {fase.rol}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min={fase.min}
                      max={fase.max}
                      step={5}
                      value={Number.isFinite(umbrales[fase.key]) ? umbrales[fase.key] : ""}
                      onChange={(e) =>
                        cambiarUmbral(fase.key, e.target.valueAsNumber)
                      }
                      className="bg-surface-container border-outline-variant/60 text-on-surface font-stats-number h-8 w-20 text-center rounded-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      aria-label={`Minutos de la ${fase.titulo} (${fase.rol})`}
                      required
                    />
                    <span className="font-label-caps text-[10px] text-on-surface-variant uppercase">
                      min
                    </span>
                  </div>
                </div>
                <p className="font-body-md text-[11px] text-on-surface-variant mt-2 leading-relaxed">
                  {fase.descripcion}
                </p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 pt-3 border-t border-outline-variant/30">
                  <span className="font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider">
                    Canales:
                  </span>
                  {CANALES.map((canal) => {
                    const IconoCanal = canal.icono;
                    return (
                      <div key={canal.key} className="flex items-center gap-2">
                        <Switch
                          checked={canales[fase.key][canal.key]}
                          onCheckedChange={() => toggleCanal(fase.key, canal.key)}
                          aria-label={`Canal ${canal.label} para la ${fase.titulo}`}
                        />
                        <span className="flex items-center gap-1 font-label-caps text-[10px] text-on-surface-variant uppercase">
                          <IconoCanal size={11} className={canal.clases} aria-hidden="true" />
                          {canal.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          {/* Escalación automática */}
          <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-sm p-4 flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-2 font-label-caps text-label-caps text-on-surface uppercase tracking-wider">
                <Siren size={14} className="text-danger" aria-hidden="true" />
                Escalación automática
              </span>
              <p className="font-body-md text-[11px] text-on-surface-variant leading-relaxed">
                Al superar la Fase 3 sin acuse de recepción, el caso escala
                automáticamente con radicado formal a la Dirección de Asuntos
                Migratorios y Consulares.
              </p>
            </div>
            <Switch
              checked={escalacionAuto}
              onCheckedChange={(v) => {
                setEscalacionAuto(v);
                setGuardado(false);
              }}
              aria-label="Activar escalación automática al superar la fase crítica"
              className="mt-1"
            />
          </div>

          {/* Validación */}
          {!umbralesValidos && (
            <p
              className="flex items-start gap-2 text-[11px] text-warning font-body-md"
              role="alert"
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              Los umbrales deben ser estrictamente crecientes: Fase 1 &lt; Fase
              2 &lt; Fase 3 (en minutos).
            </p>
          )}
          {!fasesConCanal && (
            <p
              className="flex items-start gap-2 text-[11px] text-warning font-body-md"
              role="alert"
            >
              <BellRing size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
              Cada fase requiere al menos un canal de notificación activo.
            </p>
          )}

          {/* Confirmación de guardado (simulada) */}
          {guardado && (
            <p
              className="flex items-start gap-2 bg-primary/10 border border-primary/30 text-primary rounded-sm p-3 font-body-md text-[11px]"
              role="status"
            >
              <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              Configuración SLA validada y aplicada a la sesión actual
              (demostración: los umbrales no se persisten en el servidor).
            </p>
          )}

          {/* Botonera */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-on-surface-variant hover:text-on-surface font-label-caps text-[11px] uppercase tracking-wider transition-colors"
              aria-label="Cancelar y cerrar la configuración SLA"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!formularioValido || guardando}
              className={`px-5 py-2 rounded-sm font-label-caps font-bold text-[11px] uppercase tracking-wider inline-flex items-center gap-2 transition-colors ${
                formularioValido && !guardando
                  ? "bg-primary text-on-primary hover:bg-primary-fixed shadow-md shadow-primary/20"
                  : "bg-surface-container-highest text-on-surface-variant/50 border border-outline-variant/40 cursor-not-allowed"
              }`}
              aria-label="Guardar configuración de umbrales SLA"
            >
              {guardando ? (
                <>
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  Guardando…
                </>
              ) : (
                <>
                  <Save size={13} aria-hidden="true" />
                  Guardar configuración
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
