"use client";

import React, { useEffect, useRef, useState } from "react";
import { CheckCheck, MessageCircle, Send, X } from "lucide-react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { DemoBadge } from "./DemoBadge";

interface WhatsAppChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  consulateName: string;
}

type ChatSender = "system" | "consul" | "supervisor";

interface ChatMessage {
  sender: ChatSender;
  text: string;
  time: string;
}

/** Respuestas automáticas simuladas del delegado consular */
const RESPUESTAS_AUTOMATICAS = [
  "Enterado. Procedemos con la instrucción de inmediato para dar cumplimiento al SLA.",
  "Recibido, supervisor. El digitalizador ya está en camino a la mesa para reintentar la captura.",
  "Confirmado. Le envío el comprobante de la nueva transmisión en los próximos minutos.",
  "Entendido. Verifico el acta física en este momento y le confirmo el estado.",
  "A la orden. Activamos el protocolo de contingencia con el coordinador local del puesto.",
];

function horaActual(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

function mensajesIniciales(consulateName: string): ChatMessage[] {
  return [
    {
      sender: "system",
      // [OLA3 3.5] Sin claims falsos: antes decía "Canal oficial de
      // enlace consular cifrado de extremo a extremo" — no hay canal
      // real ni cifrado: es una simulación local de demostración.
      text: `Canal de enlace consular SIMULADO con ${consulateName} — demostración local sin conexión real.`,
      time: "16:15",
    },
    {
      sender: "consul",
      text: "Buenas tardes mesa de control electoral central. Aquí el delegado consular de enlace.",
      time: "16:20",
    },
    {
      sender: "supervisor",
      text: "Buenas tardes. Observamos que las urnas cerraron a las 16:00 Local y aún faltan por transmitir las actas de las mesas asignadas.",
      time: "16:25",
    },
    {
      sender: "consul",
      text: "Recibido. Tuvimos un retraso de 15 minutos en el escrutinio de mesa por recuento de votos en blanco, pero el delegado ya está digitalizando.",
      time: "16:27",
    },
  ];
}

/**
 * Componente externo: monta la conversación fresca cada vez que se abre
 * (el estado interno vive en WhatsAppChatInner y se reinicia al montar).
 */
export const WhatsAppChatModal: React.FC<WhatsAppChatModalProps> = ({
  isOpen,
  onClose,
  consulateName,
}) => {
  if (!isOpen) return null;
  return (
    <WhatsAppChatInner
      key={consulateName}
      consulateName={consulateName}
      onClose={onClose}
    />
  );
};

const WhatsAppChatInner: React.FC<{
  consulateName: string;
  onClose: () => void;
}> = ({ consulateName, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    mensajesIniciales(consulateName)
  );
  const [inputText, setInputText] = useState("");
  const [consulEscribiendo, setConsulEscribiendo] = useState(false);

  const replyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // [OLA3 3.11] Focus trap mientras el diálogo está montado
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  // Limpieza del temporizador de respuesta al desmontar
  useEffect(() => {
    return () => {
      if (replyTimeoutRef.current) clearTimeout(replyTimeoutRef.current);
    };
  }, []);

  // Auto-scroll al último mensaje
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, consulEscribiendo]);

  // Cierre con tecla Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;

    const newMsg: ChatMessage = {
      sender: "supervisor",
      text,
      time: horaActual(),
    };
    setMessages((prev) => [...prev, newMsg]);
    setInputText("");
    setConsulEscribiendo(true);

    // Respuesta automática simulada del cónsul tras ~1.5s
    if (replyTimeoutRef.current) clearTimeout(replyTimeoutRef.current);
    replyTimeoutRef.current = setTimeout(() => {
      const reply: ChatMessage = {
        sender: "consul",
        text: RESPUESTAS_AUTOMATICAS[
          Math.floor(Math.random() * RESPUESTAS_AUTOMATICAS.length)
        ],
        time: horaActual(),
      };
      setMessages((prev) => [...prev, reply]);
      setConsulEscribiendo(false);
    }, 1500);
  };

  return (
    <div
      ref={trapRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={`Chat simulado de enlace consular con ${consulateName}`}
    >
      <div className="bg-[#121919] border border-[#242E2E] w-full max-w-lg h-[600px] max-h-[90vh] flex flex-col shadow-2xl rounded-xl overflow-hidden">
        {/* Cabecera estilo WhatsApp */}
        <div className="bg-[#172121] px-5 py-3.5 border-b border-[#242E2E] flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-whatsapp/20 border border-whatsapp/40 flex items-center justify-center text-whatsapp shrink-0">
              <MessageCircle size={22} aria-hidden="true" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-headline-md text-on-surface font-bold text-[14px] truncate flex items-center gap-2">
                {consulateName}
                {/* [OLA3 3.5] Marcado como simulación (convención
                    DemoBadge): las respuestas son automáticas y
                    locales, no un delegado real en línea. */}
                <DemoBadge
                  texto="SIMULACIÓN"
                  motivo="Chat de demostración: las respuestas del “delegado” son automáticas y locales; no hay conexión real ni canal oficial."
                />
              </span>
              {/* [OLA3 3.5] Antes: "Delegado Consular en línea" (falso:
                  no hay persona al otro lado, solo respuestas
                  automáticas predefinidas). */}
              <span className="text-[10px] text-whatsapp flex items-center gap-1 font-mono">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-whatsapp animate-pulse"
                  aria-hidden="true"
                ></span>
                {consulEscribiendo
                  ? "escribiendo (respuesta automática)..."
                  : "RESPUESTA AUTOMÁTICA (SIMULADA)"}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container-high transition-colors shrink-0"
            aria-label="Cerrar chat de WhatsApp"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Historial de mensajes */}
        <div
          ref={scrollRef}
          className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 bg-[#0a1010]"
          aria-live="polite"
          aria-label="Historial de mensajes"
        >
          {messages.map((m, idx) => {
            if (m.sender === "system") {
              return (
                <div
                  key={idx}
                  className="mx-auto bg-surface-container-high/60 border border-outline-variant/30 text-on-surface-variant text-[10px] px-3 py-1 rounded-full text-center max-w-xs font-mono"
                >
                  {m.text}
                </div>
              );
            }
            const isSupervisor = m.sender === "supervisor";
            return (
              <div
                key={idx}
                className={`flex flex-col max-w-[80%] ${
                  isSupervisor ? "self-end items-end" : "self-start items-start"
                }`}
              >
                <div
                  className={`p-3 rounded-xl text-[12px] font-body-md ${
                    isSupervisor
                      ? "bg-[#004c1b] text-on-surface border border-primary/30 rounded-br-none"
                      : "bg-surface-container-high text-on-surface border border-outline-variant/30 rounded-bl-none"
                  }`}
                >
                  {m.text}
                </div>
                <span className="text-[9px] text-on-surface-variant font-mono mt-0.5 px-1 flex items-center gap-1">
                  {m.time}
                  {isSupervisor && (
                    <CheckCheck
                      size={11}
                      className="text-whatsapp"
                      aria-label="Mensaje leído"
                    />
                  )}
                </span>
              </div>
            );
          })}

          {consulEscribiendo && (
            <div className="self-start items-start flex flex-col">
              <div className="bg-surface-container-high text-on-surface-variant border border-outline-variant/30 rounded-xl rounded-bl-none px-3 py-2.5 font-mono text-[12px] flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-whatsapp animate-pulse"
                  aria-hidden="true"
                ></span>
                <span
                  className="w-1.5 h-1.5 rounded-full bg-whatsapp/60 animate-pulse"
                  style={{ animationDelay: "0.25s" }}
                  aria-hidden="true"
                ></span>
                <span
                  className="w-1.5 h-1.5 rounded-full bg-whatsapp/40 animate-pulse"
                  style={{ animationDelay: "0.5s" }}
                  aria-hidden="true"
                ></span>
              </div>
            </div>
          )}
        </div>

        {/* Barra de entrada */}
        <div className="p-3 bg-surface-container-high border-t border-[#242E2E] flex items-center gap-2 shrink-0">
          <input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSend();
            }}
            placeholder="Escriba un mensaje al delegado consular..."
            aria-label="Mensaje para el delegado consular"
            className="flex-1 bg-surface-container-lowest border border-[#242E2E] text-on-surface px-3 py-2 rounded-lg text-body-md focus:border-whatsapp focus:outline-none placeholder:text-on-surface-variant/60"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim()}
            className="bg-whatsapp hover:brightness-110 text-[#003912] font-bold p-2.5 rounded-lg flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Enviar mensaje"
            aria-label="Enviar mensaje"
          >
            <Send size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
};
