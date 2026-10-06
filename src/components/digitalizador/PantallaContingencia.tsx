"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — CONTINGENCIA: ASIGNACIÓN
// MANUAL (diseño oficial "digitalizador_contingencia_asignaci_n
// _manual"). Se activa cuando el QR / código no se detecta.
//  · Campo de 15 dígitos del código de barras con validación
//    y feedback en vivo (elección·kit·ejemplar·versión·pág)
//  · "O BIEN" selector jerárquico País → Consulado → Mesa
//  · CONFIRMAR Y PROCESAR ACTA
// ============================================================

import React, { useMemo, useState } from "react";
import { Barcode, CheckCircle2, ChevronDown, MapPin, RotateCcw } from "lucide-react";
import { parseBarcode15, soloDigitos } from "@/lib/e14/parse";
import type { ConsulateRow, TipoEjemplar } from "@/lib/types";

export interface DatosContingencia {
  imagenBase64: string;
  barcode?: string;
  tipoEjemplar: TipoEjemplar;
  pagina: 1 | 2;
  mesaIdRef?: string;
  /** FASE 1 (rol C): la hoja REEMPLAZA una previa no validada en la ranura */
  reemplazoDe?: string;
  datosManuales?: {
    divipol?: {
      consulado?: string;
      municipio?: string;
      zona?: string;
      puesto?: string;
      mesa?: string;
    };
  };
}

interface PantallaContingenciaProps {
  imagen: string | null;
  consulados: ConsulateRow[];
  enviando: boolean;
  onRepetir: () => void;
  onVolver: () => void;
  onEnviarManual: (datos: DatosContingencia) => void;
}

export const PantallaContingencia: React.FC<PantallaContingenciaProps> = ({
  imagen,
  consulados,
  enviando,
  onRepetir,
  onVolver,
  onEnviarManual,
}) => {
  const [barcode, setBarcode] = useState("");
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [paisSel, setPaisSel] = useState("");
  const [consuladoSel, setConsuladoSel] = useState("");
  const [mesaSel, setMesaSel] = useState("");

  const digitos = soloDigitos(barcode);
  const bc = parseBarcode15(digitos);

  const paises = useMemo(
    () => [...new Set(consulados.map((c) => c.pais))].sort((a, b) => a.localeCompare(b)),
    [consulados]
  );
  const consuladosDePais = useMemo(
    () => consulados.filter((c) => c.pais === paisSel),
    [consulados, paisSel]
  );
  const consuladoObj = useMemo(
    () => consulados.find((c) => c.id === consuladoSel) ?? null,
    [consulados, consuladoSel]
  );
  const mesasDeConsulado = useMemo(() => consuladoObj?.mesas ?? [], [consuladoObj]);
  const mesaObj = useMemo(
    () => mesasDeConsulado.find((m) => m.id === mesaSel) ?? null,
    [mesasDeConsulado, mesaSel]
  );

  const puedeConfirmar = Boolean(bc) || Boolean(mesaObj);

  const confirmar = () => {
    if (!puedeConfirmar || !imagen) return;
    const tipo: TipoEjemplar = bc ? (bc.tipoEjemplar === "CLAVEROS" ? "DELEGADOS" : bc.tipoEjemplar) : "DELEGADOS";
    const pagina: 1 | 2 = bc ? ((bc.pagina === 2 ? 2 : 1) as 1 | 2) : 1;
    onEnviarManual({
      imagenBase64: imagen,
      barcode: bc ? bc.crudo : undefined,
      tipoEjemplar: tipo,
      pagina,
      mesaIdRef: mesaObj?.id,
      datosManuales: mesaObj && consuladoObj
        ? {
            divipol: {
              consulado: consuladoObj.ciudad,
              municipio: consuladoObj.code.split("-")[0],
              zona: consuladoObj.code.split("-")[1],
              puesto: consuladoObj.code.split("-")[2],
              mesa: mesaObj.mesaNumber,
            },
          }
        : undefined,
    });
  };

  return (
    <div className="h-full flex flex-col bg-surface-container-lowest overflow-y-auto no-scrollbar">
      {/* ---- Top bar (diseño: MODO MANUAL ON) ---- */}
      <header className="bg-surface w-full border-b-2 border-outline-variant flex items-center justify-between px-4 h-[64px] shrink-0 z-10">
        <div className="flex items-center min-w-0">
          <button
            type="button"
            onClick={onVolver}
            aria-label="Volver al control de actas"
            className="p-2 -ml-2 mr-1 text-primary hover:bg-surface-variant rounded-full shrink-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
          </button>
          <h1 className="font-pwa-display text-primary tracking-tight truncate">DIGITALIZADOR E-14</h1>
          <button
            type="button"
            onClick={onRepetir}
            className="flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-surface-container-high hover:bg-surface-variant transition-colors ml-3 shrink-0"
            aria-label="Repetir captura"
          >
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" aria-hidden />
            <span className="font-label-caps text-label-caps text-primary font-bold">
              REPETIR CAPTURA
            </span>
          </button>
        </div>
      </header>

      <main className="relative z-10 flex flex-col items-center w-full p-4 gap-3">
        {/* ---- Visor de la captura con error (diseño) ---- */}
        {imagen && (
          <div className="w-full max-w-sm flex flex-col items-center shrink-0">
            <div className="relative w-full h-36 rounded-lg overflow-hidden border-2 border-[#e6a100] shadow-[0_0_12px_rgba(230,161,0,0.25)] bg-surface-container-lowest flex items-center justify-center">
              <img
                alt="Foto E-14 capturada sin código detectado"
                src={imagen}
                className="w-full h-full object-cover opacity-75"
              />
              <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#171d1d]/90 border border-[#e6a100]/60 backdrop-blur-sm">
                <span className="text-[11px] font-bold text-[#fdd400] font-label-caps leading-none flex items-center gap-1">
                  ⚠️ CÓDIGO NO DETECTADO
                </span>
              </div>
              <button
                type="button"
                onClick={onRepetir}
                className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-surface-container-high/90 border border-outline-variant text-[11px] font-label-caps text-on-surface hover:bg-surface-variant transition-colors"
              >
                <RotateCcw size={13} aria-hidden />
                <span>REPETIR</span>
              </button>
            </div>
          </div>
        )}

        {/* ---- Tarjeta de contingencia (diseño) ---- */}
        <div className="w-full max-w-sm rounded-xl border-2 border-[#e6a100] bg-[#161e1e] p-4 shadow-2xl flex flex-col gap-3.5">
          <div className="border-b border-[#e6a100]/20 pb-2.5">
            <div className="flex items-center gap-1.5">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fdd400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </svg>
              <h2 className="font-headline-md text-[14px] font-bold tracking-tight text-[#fdd400] uppercase leading-tight">
                CONTINGENCIA: ASIGNACIÓN MANUAL
              </h2>
            </div>
            <p className="text-body-md text-[12px] text-[#bbcbb8] mt-1 leading-snug">
              Ingrese los 15 dígitos del código o seleccione la ubicación manualmente para
              validar el acta.
            </p>
          </div>

          {/* Campo barcode15 */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="barcode15"
              className="font-label-caps text-[11px] font-bold tracking-wider text-on-surface uppercase flex items-center justify-between"
            >
              <span>DIGITAR CÓDIGO DE BARRAS (15 DÍGITOS)</span>
              <span className="text-primary text-[10px] font-normal">OPCIONAL</span>
            </label>
            <div className="relative flex items-center">
              <Barcode size={18} className="absolute left-3 text-outline" aria-hidden />
              <input
                id="barcode15"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={15}
                value={digitos}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="710003993010202"
                className="w-full bg-[#090f0f] border border-outline focus:border-primary focus:ring-1 focus:ring-primary rounded pl-9 pr-3 py-2 font-stats-number text-[16px] tracking-wider text-primary font-bold outline-none"
              />
            </div>
            {/* Feedback en vivo del parseo */}
            <div className="min-h-[16px] flex items-center">
              {digitos.length === 0 ? (
                <span className="font-body-md text-[10px] text-[#bbcbb8]/70">
                  Verifique el número impreso bajo el código de barras en el encabezado.
                </span>
              ) : digitos.length < 15 ? (
                <span className="font-label-caps text-[10px] text-on-surface-variant">
                  FALTAN {15 - digitos.length} DÍGITOS
                </span>
              ) : bc ? (
                <span className="flex items-center gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-primary/15 text-primary font-label-caps text-[10px] border border-primary/40">
                    {bc.tipoEjemplar === "TRANSMISION" ? "TRANSMISIÓN" : bc.tipoEjemplar}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-primary/15 text-primary font-label-caps text-[10px] border border-primary/40">
                    PÁG {bc.pagina} DE {bc.totalPaginas}
                  </span>
                  <span className="font-label-caps text-[10px] text-on-surface-variant">
                    KIT {bc.kit} · ELECCIÓN {bc.tipoEleccion}
                  </span>
                </span>
              ) : (
                <span className="font-label-caps text-[10px] text-red-400">
                  DÍGITOS INVÁLIDOS · REVISE EL CÓDIGO IMPRESO
                </span>
              )}
            </div>
          </div>

          {/* Separador O BIEN */}
          <div className="relative flex py-0.5 items-center">
            <div className="flex-grow border-t border-outline-variant" />
            <span className="flex-shrink mx-2 text-[10px] font-label-caps text-outline uppercase">
              O BIEN
            </span>
            <div className="flex-grow border-t border-outline-variant" />
          </div>

          {/* Selector de ubicación */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setSelectorAbierto((v) => !v)}
              aria-expanded={selectorAbierto}
              className="w-full flex items-center justify-between px-3 py-2 rounded bg-surface-container-high border border-outline-variant hover:border-primary/50 text-left transition-colors"
            >
              <span className="flex items-center gap-2 truncate text-[12px] text-on-surface">
                <MapPin size={16} className="text-outline shrink-0" aria-hidden />
                <span className="truncate">
                  {mesaObj && consuladoObj
                    ? `${consuladoObj.ciudad} · ${mesaObj.mesaNumber}`
                    : "Seleccionar por ubicación (Depto > Munc > Mesa)"}
                </span>
              </span>
              <ChevronDown
                size={16}
                className={`text-outline shrink-0 transition-transform ${selectorAbierto ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>

            {selectorAbierto && (
              <div className="flex flex-col gap-2 p-2 bg-[#090f0f] border border-outline-variant rounded">
                <select
                  aria-label="País del consulado"
                  value={paisSel}
                  onChange={(e) => {
                    setPaisSel(e.target.value);
                    setConsuladoSel("");
                    setMesaSel("");
                  }}
                  className="w-full bg-surface-container-high border border-outline rounded px-2 py-2 text-[12px] text-on-surface outline-none focus:border-primary"
                >
                  <option value="">País…</option>
                  {paises.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Consulado"
                  value={consuladoSel}
                  disabled={!paisSel}
                  onChange={(e) => {
                    setConsuladoSel(e.target.value);
                    setMesaSel("");
                  }}
                  className="w-full bg-surface-container-high border border-outline rounded px-2 py-2 text-[12px] text-on-surface outline-none focus:border-primary disabled:opacity-50"
                >
                  <option value="">Consulado…</option>
                  {consuladosDePais.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ciudad} — {c.puesto} ({c.numMesas} mesas)
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Mesa de votación"
                  value={mesaSel}
                  disabled={!consuladoSel}
                  onChange={(e) => setMesaSel(e.target.value)}
                  className="w-full bg-surface-container-high border border-outline rounded px-2 py-2 text-[12px] text-on-surface outline-none focus:border-primary disabled:opacity-50"
                >
                  <option value="">Mesa…</option>
                  {mesasDeConsulado.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.mesaNumber}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Confirmar */}
          <div className="pt-1">
            <button
              type="button"
              onClick={confirmar}
              disabled={!puedeConfirmar || enviando || !imagen}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded font-bold font-headline-md text-[13px] bg-primary text-on-primary hover:bg-primary-container shadow-[0_0_15px_rgba(75,226,119,0.3)] active:scale-95 transition-all tracking-wide uppercase disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
            >
              <CheckCircle2 size={18} className="font-bold" aria-hidden />
              {enviando ? "PROCESANDO…" : "CONFIRMAR Y PROCESAR ACTA"}
            </button>
            {!puedeConfirmar && (
              <p className="text-center font-label-caps text-[10px] text-on-surface-variant mt-1.5">
                Digite el código de 15 dígitos o seleccione la ubicación de la mesa
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
