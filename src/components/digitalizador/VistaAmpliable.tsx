"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — Vista de imagen ampliable
// Pack micro-UX §4.2.3 (canon): pinch-zoom / tap-para-ampliar
// en TODAS las vistas de imagen del digitalizador (Revisión,
// Éxito, Contingencia; la galería de C la reutiliza en OLA-C2).
//
// Uso: reemplaza al <img> directo. Tap abre un overlay a pantalla
// completa; ahí: pinch para zoom, arrastre para desplazar, doble
// tap para alternar 1×/2.5×, ESC o ✕ para cerrar. Rueda del ratón
// también hace zoom (escritorio).
// ============================================================

import React, { useCallback, useRef, useState } from "react";
import { X } from "lucide-react";

interface VistaAmpliableProps {
  src: string;
  alt: string;
  className?: string;
}

const ZOOM_DOBLE_TAP = 2.5;
const ZOOM_MAX = 6;
const ZOOM_MIN = 1;

export const VistaAmpliable: React.FC<VistaAmpliableProps> = ({
  src,
  alt,
  className,
}) => {
  const [abierto, setAbierto] = useState(false);
  const [escala, setEscala] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Punteros activos para el pinch (touch + ratón unificados)
  const punteros = useRef<Map<number, { x: number; y: number }>>(new Map());
  const distInicial = useRef<number | null>(null);
  const escalaBase = useRef(1);
  const panBase = useRef({ x: 0, y: 0 });
  const ultimoTap = useRef(0);
  const arrastrando = useRef(false);
  const inicioArrastre = useRef({ x: 0, y: 0 });
  // Transición suave salvo durante el pinch (ahi va sin transición)
  const [pinchActivo, setPinchActivo] = useState(false);

  const cerrar = useCallback(() => {
    setAbierto(false);
    setEscala(1);
    setOffset({ x: 0, y: 0 });
    punteros.current.clear();
    distInicial.current = null;
  }, []);

  const limitar = useCallback((esc: number, off: { x: number; y: number }) => {
    const e = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, esc));
    const limite = (e - 1) * 220; // px de margen razonable en pantalla
    return {
      escala: e,
      offset: {
        x: Math.max(-limite, Math.min(limite, off.x)),
        y: Math.max(-limite, Math.min(limite, off.y)),
      },
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.current.size === 2) {
      const [a, b] = [...punteros.current.values()];
      distInicial.current = Math.hypot(a.x - b.x, a.y - b.y);
      escalaBase.current = escala;
      panBase.current = { ...offset };
      arrastrando.current = false;
      setPinchActivo(true);
    } else if (punteros.current.size === 1) {
      // Doble tap → alternar zoom (ventana de 300 ms)
      const ahora = Date.now();
      if (ahora - ultimoTap.current < 300) {
        const destino = escala > 1.2 ? 1 : ZOOM_DOBLE_TAP;
        setEscala(destino);
        setOffset({ x: 0, y: 0 });
        ultimoTap.current = 0;
        return;
      }
      ultimoTap.current = ahora;
      arrastrando.current = true;
      inicioArrastre.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    }
  }, [escala, offset]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!punteros.current.has(e.pointerId)) return;
    punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (punteros.current.size === 2 && distInicial.current) {
      const [a, b] = [...punteros.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const centro = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const nueva = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, escalaBase.current * (dist / distInicial.current))
      );
      // Pan del centro del pinch proporcional al zoom (simple y estable)
      const dx = centro.x - window.innerWidth / 2;
      const dy = centro.y - window.innerHeight / 2;
      const nx = dx * (nueva - 1) * -0.35 + panBase.current.x;
      const ny = dy * (nueva - 1) * -0.35 + panBase.current.y;
      const l = limitar(nueva, { x: nx, y: ny });
      setEscala(l.escala);
      setOffset(l.offset);
    } else if (punteros.current.size === 1 && arrastrando.current && escala > 1) {
      setOffset({
        x: e.clientX - inicioArrastre.current.x,
        y: e.clientY - inicioArrastre.current.y,
      });
    }
  }, [escala, limitar]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    punteros.current.delete(e.pointerId);
    if (punteros.current.size < 2) {
      distInicial.current = null;
      setPinchActivo(false);
    }
    if (punteros.current.size === 0) arrastrando.current = false;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const nueva = Math.min(
      ZOOM_MAX,
      Math.max(ZOOM_MIN, escala * (e.deltaY < 0 ? 1.15 : 0.87))
    );
    setEscala(nueva);
    if (nueva === 1) setOffset({ x: 0, y: 0 });
  }, [escala]);

  return (
    <>
      <img
        alt={alt}
        src={src}
        className={className}
        onClick={() => setAbierto(true)}
        role="button"
        tabIndex={0}
        aria-label={`${alt} — ampliar`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setAbierto(true);
        }}
      />
      {abierto && (
        <div
          className="fixed inset-0 z-[90] bg-black/95 flex items-center justify-center p-2"
          role="dialog"
          aria-modal="true"
          aria-label="Acta ampliada"
          onClick={(e) => {
            if (e.target === e.currentTarget) cerrar();
          }}
        >
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar vista ampliada"
            className="absolute top-3 right-3 z-10 h-11 w-11 rounded-full bg-white/10 border border-white/30 text-white flex items-center justify-center hover:bg-white/20 active:scale-95 transition-all"
          >
            <X size={20} aria-hidden />
          </button>
          <img
            alt={alt}
            src={src}
            draggable={false}
            className="max-w-full max-h-full object-contain select-none touch-none"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${escala})`,
              transition: pinchActivo ? "none" : "transform 120ms ease-out",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            onKeyDown={(e) => {
              if (e.key === "Escape") cerrar();
            }}
          />
          <span
            role="status"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 font-label-caps text-[10px] text-white/70 bg-black/60 border border-white/20 rounded-full px-3 py-1"
          >
            Pellizque para hacer zoom · doble toque alterna 1×/2.5× · toca fuera para cerrar
          </span>
        </div>
      )}
    </>
  );
};
