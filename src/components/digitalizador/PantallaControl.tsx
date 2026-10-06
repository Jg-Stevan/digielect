"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — CONTROL ACTAS E-14
// Diseño oficial "digitalizador_control_actas_e_14": acordeón
// de mesas con tarjetas DELEGADOS / TRANSMISIÓN y chips P1/P2
// (✓ enviado · ⚠️ rescaneo · ⏳ pendiente). Tocar un chip
// pendiente lanza la captura de ese pliego.
// ============================================================

import React, { useState, useSyncExternalStore } from "react";
import { ArrowLeftRight, ChevronDown, Radar, WifiOff } from "lucide-react";
import type { ConsulateRow, MesaDetail, TipoEjemplar } from "@/lib/types";
import { estadoPagina, type CapturaContexto } from "./shared";

// §4.2.9 — estado online HONESTO (navigator.onLine + listeners).
// useSyncExternalStore evita setState en efecto y el mismatch de hidratación
// (en servidor se asume en línea).
function suscribirOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
const onlineCliente = () => navigator.onLine;
const onlineServidor = () => true;

interface PantallaControlProps {
  consulado: ConsulateRow;
  mesaSel: string | null;
  cargando: boolean;
  onSelectMesa: (id: string | null) => void;
  /** D-09: la captura lleva la mesa del PROPIO chip (nunca la global) */
  onCapturar: (mesaId: string, tipo: TipoEjemplar) => void;
  onEscanearLibre: () => void;
  onResumen: () => void;
  /** D-07: vuelve a la pantalla de selección de puesto (confirmación en la app) */
  onCambiarPuesto: () => void;
}

/** Estado de la mesa para la etiqueta del acordeón (diseño) */
function estadoMesa(mesa: MesaDetail): { label: string; clase: string } {
  const paginas = [
    mesa.delegados.p1,
    mesa.delegados.p2,
    mesa.transmision.p1,
    mesa.transmision.p2,
  ];
  const ok = paginas.filter((p) => p === true).length;
  if (ok === 4) return { label: "COMPLETADA 100%", clase: "text-primary" };
  if (ok > 0 || paginas.includes("rescaneo")) return { label: "EN PROCESO", clase: "text-secondary" };
  return { label: "PENDIENTE", clase: "text-on-surface-variant" };
}

const ChipPagina: React.FC<{
  etiqueta: string;
  estado: "ok" | "pendiente" | "rescaneo";
  onClick?: () => void;
}> = ({ etiqueta, estado, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={!onClick}
    className={`min-h-[44px] min-w-[52px] px-2.5 inline-flex items-center justify-center font-stats-number text-[12px] rounded-sm transition-colors ${
      estado === "ok"
        ? "bg-primary/20 text-primary"
        : estado === "rescaneo"
          ? "bg-error/20 text-error"
          : "bg-surface-container-highest text-on-surface-variant hover:bg-surface-variant hover:text-on-surface"
    } ${onClick ? "cursor-pointer" : "cursor-default"}`}
    aria-label={`${etiqueta} ${estado === "ok" ? "enviada" : estado === "rescaneo" ? "requiere rescaneo" : "pendiente"}`}
  >
    {estado === "ok" ? `${etiqueta} ✓` : estado === "rescaneo" ? `${etiqueta} ⚠️ Rescaneo` : `${etiqueta} ⏳`}
  </button>
);

export const PantallaControl: React.FC<PantallaControlProps> = ({
  consulado,
  mesaSel,
  onSelectMesa,
  onCapturar,
  onEscanearLibre,
  onCambiarPuesto,
}) => {
  const [mesaAbierta, setMesaAbierta] = useState<string | null>(mesaSel ?? consulado.mesas[0]?.id ?? null);
  // §4.2.9 — estado online HONESTO: navigator.onLine + listeners
  // online/offline (antes "EN LÍNEA" era texto fijo).
  const online = useSyncExternalStore(suscribirOnline, onlineCliente, onlineServidor);

  const partes = consulado.code.split("-");
  const zona = partes[1] ?? consulado.zona;
  const puesto = partes[2] ?? "02";

  const tarjetaEjemplar = (
    mesa: MesaDetail,
    tipo: TipoEjemplar
  ): React.ReactNode => {
    const paginas = tipo === "DELEGADOS" ? mesa.delegados : mesa.transmision;
    return (
      <div className="p-2 bg-surface-variant border border-outline-variant flex flex-col gap-1">
        <span className="text-on-surface-variant font-label-caps text-[11px]">
          {tipo === "DELEGADOS" ? "DELEGADOS" : "TRANSMISIÓN"}
        </span>
        <div className="flex gap-1 flex-wrap">
          <ChipPagina
            etiqueta="P1"
            estado={estadoPagina(paginas.p1)}
            onClick={
              paginas.p1 === true
                ? undefined
                : () => {
                    // D-09: selecciona la mesa del chip ANTES de capturar
                    onSelectMesa(mesa.id);
                    onCapturar(mesa.id, tipo);
                  }
            }
          />
          <ChipPagina
            etiqueta="P2"
            estado={estadoPagina(paginas.p2)}
            onClick={
              paginas.p2 === true
                ? undefined
                : () => {
                    // D-09: selecciona la mesa del chip ANTES de capturar
                    onSelectMesa(mesa.id);
                    onCapturar(mesa.id, tipo);
                  }
            }
          />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-full flex flex-col gap-4 p-4 no-scrollbar">
      {/* ---- Encabezado del puesto (diseño) + CAMBIAR PUESTO (D-07) ---- */}
      <section className="flex justify-between items-end gap-2 border-b-2 border-outline-variant pb-2">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="font-label-caps text-label-caps text-on-surface-variant">
            PUESTO ACTUAL
          </span>
          <h2 className="font-pwa-display text-primary tracking-tighter uppercase">
            {consulado.puesto}
          </h2>
          <div className="flex items-center justify-between mt-1">
            <span className="font-stats-number text-[12px] text-on-surface-variant">
              {consulado.code} · {consulado.pais} &gt; ZONA {zona} &gt; PUESTO {puesto}
            </span>
            {online ? (
              <span className="font-label-caps text-label-caps text-primary flex items-center gap-1">
                <Radar size={12} className="text-primary animate-pulse" aria-hidden />
                EN LÍNEA
              </span>
            ) : (
              <span
                className="font-label-caps text-label-caps text-error flex items-center gap-1"
                role="status"
              >
                <WifiOff size={12} aria-hidden />
                SIN CONEXIÓN
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onCambiarPuesto}
          className="shrink-0 h-8 px-2 border border-outline-variant bg-surface-container text-on-surface-variant
            hover:border-primary/60 hover:text-primary font-label-caps text-[10px] uppercase
            flex items-center gap-1 rounded-sm transition-colors min-h-[32px]"
          aria-label="Cambiar de puesto consular"
          title="Cambiar de puesto consular"
        >
          <ArrowLeftRight size={12} aria-hidden />
          CAMBIAR PUESTO
        </button>
      </section>

      {/* ---- Acción de escaneo libre (QR guía el flujo) ---- */}
      <button
        type="button"
        onClick={onEscanearLibre}
        className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-primary text-on-primary font-label-caps text-label-caps hover:bg-primary-container transition-colors shadow-[0_0_12px_#4be277]"
      >
        ESCANEAR SIGUIENTE ACTA (EL QR ASIGNA LA MESA)
      </button>

      {/* ---- Acordeón de mesas ---- */}
      <div className="flex flex-col gap-3">
        {consulado.mesas.map((mesa) => {
          const abierta = mesaAbierta === mesa.id;
          const estado = estadoMesa(mesa);
          return (
            <div
              key={mesa.id}
              className="bg-surface-container border-2 border-outline-variant p-2 flex flex-col gap-2"
            >
              <button
                type="button"
                onClick={() => setMesaAbierta(abierta ? null : mesa.id)}
                aria-expanded={abierta}
                className="flex justify-between items-center cursor-pointer select-none w-full text-left"
              >
                <span className="font-headline-md text-headline-md text-on-surface flex items-center gap-2">
                  {mesa.mesaNumber.toUpperCase()}
                  <ChevronDown
                    size={16}
                    className={`text-on-surface-variant transition-transform duration-100 ${
                      abierta ? "rotate-180" : ""
                    }`}
                    aria-hidden
                  />
                </span>
                <span className={`font-label-caps text-label-caps ${estado.clase}`}>
                  {estado.label}
                </span>
              </button>
              {abierta && (
                <div className="grid grid-cols-2 gap-1 text-[12px] pt-1">
                  {tarjetaEjemplar(mesa, "DELEGADOS")}
                  {tarjetaEjemplar(mesa, "TRANSMISION")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
