"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — CONTROL ACTAS E-14
// Diseño oficial "digitalizador_control_actas_e_14": acordeón
// de mesas con tarjetas DELEGADOS / TRANSMISIÓN y chips P1/P2
// (✓ enviado · ⚠️ rescaneo · ⏳ pendiente). Tocar un chip
// pendiente lanza la captura de ese pliego.
// C-15-2-a · capa visual Stitch v2 (fork motor-vision-opencv):
// header industrial con scanline + IndicadorEnLinea, filas de
// mesa ind-container/ind-high, badges label-caps y chips mono.
// ============================================================

import React, { useState, useSyncExternalStore } from "react";
import { ArrowLeftRight, ChevronDown, ScanLine } from "lucide-react";
import type { ConsulateRow, MesaDetail, TipoEjemplar } from "@/lib/types";
import { estadoPagina, type CapturaContexto } from "./shared";
import { IndicadorEnLinea } from "./stitch";

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
  if (ok === 4) return { label: "COMPLETADA 100%", clase: "text-ind-primary" };
  if (ok > 0 || paginas.includes("rescaneo")) return { label: "EN PROCESO", clase: "text-ind-secondary" };
  return { label: "PENDIENTE", clase: "text-ind-on-surface-var" };
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
    className={`min-h-[44px] min-w-[52px] px-2.5 inline-flex items-center justify-center data-mono text-[12px] font-semibold rounded-none border transition-colors ${
      estado === "ok"
        ? "border-ind-primary/60 bg-ind-primary/20 text-ind-primary"
        : estado === "rescaneo"
          ? "border-ind-error/60 bg-ind-error/20 text-ind-error"
          : "border-ind-outline-variant bg-ind-high text-ind-on-surface-var hover:bg-ind-variant hover:text-ind-on-surface"
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
      <div className="p-2 bg-ind-variant border border-ind-outline-variant flex flex-col gap-1">
        <span className="label-caps text-ind-on-surface-var">
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
    <div className="min-h-full flex flex-col gap-4 bg-ind-bg bg-scanline p-4 no-scrollbar">
      {/* ---- Encabezado del puesto (estilo industrial) + CAMBIAR PUESTO (D-07) ---- */}
      <section className="flex justify-between items-end gap-2 border-b-2 border-ind-outline-variant pb-2">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <span className="label-caps text-ind-on-surface-var">
            PUESTO ACTUAL
          </span>
          <h2 className="display-industrial text-ind-primary">
            {consulado.puesto}
          </h2>
          <div className="flex items-center justify-between gap-2 mt-1">
            <span className="data-mono text-[12px] text-ind-on-surface-var min-w-0 truncate">
              {consulado.code} · {consulado.pais} &gt; ZONA {zona} &gt; PUESTO {puesto}
            </span>
            {/* §4.2.9 — online honesto (navigator.onLine) vía componente del diseño */}
            <IndicadorEnLinea enLinea={online} className="shrink-0" />
          </div>
        </div>
        <button
          type="button"
          onClick={onCambiarPuesto}
          className="shrink-0 min-h-[44px] px-3 border border-ind-outline-variant bg-ind-container text-ind-on-surface-var
            hover:border-ind-primary/60 hover:text-ind-primary label-caps
            flex items-center gap-1.5 rounded-none transition-colors"
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
        className="flex min-h-[44px] items-center justify-center gap-2 rounded-none bg-ind-primary text-ind-on-primary label-caps px-4 py-3 hover:bg-ind-primary/90 transition-colors shadow-glow-pill"
      >
        <ScanLine size={16} aria-hidden />
        ESCANEAR SIGUIENTE ACTA (EL QR ASIGNA LA MESA)
      </button>

      {/* ---- Acordeón de mesas (filas industriales) ---- */}
      <div className="flex flex-col gap-3">
        {consulado.mesas.map((mesa) => {
          const abierta = mesaAbierta === mesa.id;
          const estado = estadoMesa(mesa);
          return (
            <div
              key={mesa.id}
              className={`rounded-none border-2 border-ind-outline-variant p-2 flex flex-col gap-2 transition-colors ${
                abierta ? "bg-ind-high" : "bg-ind-container hover:bg-ind-high"
              }`}
            >
              <button
                type="button"
                onClick={() => setMesaAbierta(abierta ? null : mesa.id)}
                aria-expanded={abierta}
                className="flex justify-between items-center gap-2 cursor-pointer select-none w-full text-left min-h-[44px]"
              >
                <span className="font-headline-md text-headline-md text-ind-on-surface flex items-center gap-2">
                  {mesa.mesaNumber.toUpperCase()}
                  <ChevronDown
                    size={16}
                    className={`text-ind-on-surface-var transition-transform duration-100 ease-linear ${
                      abierta ? "rotate-180" : ""
                    }`}
                    aria-hidden
                  />
                </span>
                <span className={`label-caps shrink-0 ${estado.clase}`}>
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
