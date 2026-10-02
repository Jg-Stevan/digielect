import React, { useState } from 'react';

interface WhatsAppChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  consulateName: string;
}

export const WhatsAppChatModal: React.FC<WhatsAppChatModalProps> = ({
  isOpen,
  onClose,
  consulateName,
}) => {
  const [messages, setMessages] = useState([
    {
      sender: 'system',
      text: `Canal oficial de enlace consular cifrado de extremo a extremo con ${consulateName}.`,
      time: '16:15',
    },
    {
      sender: 'consul',
      text: 'Buenas tardes mesa de control electoral central. Aquí el delegado consular de enlace.',
      time: '16:20',
    },
    {
      sender: 'supervisor',
      text: 'Buenas tardes. Observamos que las urnas cerraron a las 16:00 Local y aún faltan por transmitir las actas de las mesas asignadas.',
      time: '16:25',
    },
    {
      sender: 'consul',
      text: 'Recibido. Tuvimos un retraso de 15 minutos en el escrutinio de mesa por recuento de votos en blanco, pero el delegado ya está digitalizando.',
      time: '16:27',
    },
  ]);
  const [inputText, setInputText] = useState('');

  if (!isOpen) return null;

  const handleSend = () => {
    if (!inputText.trim()) return;
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const newMsg = { sender: 'supervisor', text: inputText, time: timeStr };
    setMessages((prev) => [...prev, newMsg]);
    setInputText('');

    // Simulate auto reply after 1.5s
    setTimeout(() => {
      const reply = {
        sender: 'consul',
        text: 'Enterado. Procedemos con la instrucción de inmediato para dar cumplimiento al SLA.',
        time: `${now.getHours().toString().padStart(2, '0')}:${(now.getMinutes() + 1).toString().padStart(2, '0')}`,
      };
      setMessages((prev) => [...prev, reply]);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[#121919] border border-[#242E2E] w-full max-w-lg h-[600px] flex flex-col shadow-2xl rounded-xl overflow-hidden">
        {/* Header WhatsApp */}
        <div className="bg-[#172121] px-5 py-3.5 border-b border-[#242E2E] flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#25D366]/20 border border-[#25D366]/40 flex items-center justify-center text-[#25D366]">
              <span className="material-symbols-outlined text-[22px]">chat</span>
            </div>
            <div className="flex flex-col">
              <span className="font-headline-md text-on-surface font-bold text-[14px]">
                {consulateName}
              </span>
              <span className="text-[10px] text-[#25D366] flex items-center gap-1 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] animate-pulse"></span>
                Delegado Consular en línea
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

        {/* Chat message history */}
        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 bg-[#0a1010]">
          {messages.map((m, idx) => {
            if (m.sender === 'system') {
              return (
                <div
                  key={idx}
                  className="mx-auto bg-surface-container-high/60 border border-outline-variant/30 text-on-surface-variant text-[10px] px-3 py-1 rounded-full text-center max-w-xs font-mono"
                >
                  {m.text}
                </div>
              );
            }
            const isSupervisor = m.sender === 'supervisor';
            return (
              <div
                key={idx}
                className={`flex flex-col max-w-[80%] ${
                  isSupervisor ? 'self-end items-end' : 'self-start items-start'
                }`}
              >
                <div
                  className={`p-3 rounded-xl text-[12px] font-body-md ${
                    isSupervisor
                      ? 'bg-[#004c1b] text-on-surface border border-primary/30 rounded-br-none'
                      : 'bg-surface-container-high text-on-surface border border-outline-variant/30 rounded-bl-none'
                  }`}
                >
                  {m.text}
                </div>
                <span className="text-[9px] text-on-surface-variant font-mono mt-0.5 px-1 flex items-center gap-1">
                  {m.time}
                  {isSupervisor && <span className="text-[#25D366] font-bold">✓✓</span>}
                </span>
              </div>
            );
          })}
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-surface-container-high border-t border-[#242E2E] flex items-center gap-2 shrink-0">
          <input
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Escriba un mensaje al delegado consular..."
            className="flex-1 bg-surface-container-lowest border border-[#242E2E] text-on-surface px-3 py-2 rounded-lg text-body-md focus:border-[#25D366] focus:outline-none"
          />
          <button
            onClick={handleSend}
            className="bg-[#25D366] hover:brightness-110 text-on-primary font-bold p-2.5 rounded-lg flex items-center justify-center transition-all"
            title="Enviar mensaje"
          >
            <span className="material-symbols-outlined text-[18px]">send</span>
          </button>
        </div>
      </div>
    </div>
  );
};
