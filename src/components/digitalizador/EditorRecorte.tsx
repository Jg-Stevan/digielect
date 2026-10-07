"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — EDITOR DE ESQUINAS DEL RECORTE
// D-03/D-04 (rol A · auditoría FASE 0): el operador corrige a
// mano el cuadrilátero del acta cuando la detección automática
// falla o se desvía. Herencia web-scanner (8 handles → aquí 4
// esquinas, targets ≥44px) con lupa de 80px junto al dedo.
//
// El quad vive en coordenadas NORMALIZADAS de la imagen ORIGINAL
// (0-1, orden [TL, TR, BR, BL]). Al confirmar, DigitalizadorApp
// re-ejecuta el pipeline con `quadFijo` (mismo camino que el
// F-DEFER-CROP: warp + B/N + OCR local + identificador).
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import type { PuntoNorm, QuadNormalizado } from "@/lib/types";

interface EditorRecorteProps {
  /** Imagen ORIGINAL (frame sin recortar) sobre la que se edita */
  imagen: string;
  /** Quad inicial: el del pipeline, o el 90% interior si no hay */
  quadInicial?: QuadNormalizado | null;
  onConfirmar: (quad: QuadNormalizado) => void;
  onCancelar: () => void;
  /** Re-procesado en curso (deshabilita confirmar) */
  ocupado?: boolean;
}

/** Quad interior al 90% (default cuando no hay detección) */
function quadInterior(): QuadNormalizado {
  return [
    { x: 0.05, y: 0.05 },
    { x: 0.95, y: 0.05 },
    { x: 0.95, y: 0.95 },
    { x: 0.05, y: 0.95 },
  ];
}

const ETIQUETAS = ["TL", "TR", "BR", "BL"] as const;

export const EditorRecorte: React.FC<EditorRecorteProps> = ({
  imagen,
  quadInicial,
  onConfirmar,
  onCancelar,
  ocupado = false,
}) => {
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const lupaRef = useRef<HTMLCanvasElement | null>(null);
  const [quad, setQuad] = useState<QuadNormalizado>(() => {
    if (quadInicial && quadInicial.length === 4) {
      return quadInicial.map((p) => ({ ...p })) as QuadNormalizado;
    }
    return quadInterior();
  });
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const [lupaPos, setLupaPos] = useState<{ x: number; y: number } | null>(null);
  /** Rect de la imagen dibujada dentro del contenedor (object-contain) */
  const [rect, setRect] = useState<{ ox: number; oy: number; dw: number; dh: number; cw: number } | null>(null);

  /** Calcula el rect de la imagen (object-contain) dentro del contenedor */
  const medir = useCallback(() => {
    const cont = contenedorRef.current;
    const img = imgRef.current;
    if (!cont || !img || !img.naturalWidth) return;
    const cw = cont.clientWidth;
    const ch = cont.clientHeight;
    if (cw < 2 || ch < 2) return;
    const escala = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * escala;
    const dh = img.naturalHeight * escala;
    setRect({ ox: (cw - dw) / 2, oy: (ch - dh) / 2, dw, dh, cw });
  }, []);

  useEffect(() => {
    medir();
    const cont = contenedorRef.current;
    if (!cont || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => medir());
    ro.observe(cont);
    return () => ro.disconnect();
  }, [medir]);

  // Cargar la imagen original para la lupa (dibujo directo del buffer).
  // Al terminar la carga SE RE-MIDE: sin esto, el primer medir() corre
  // antes del onload y el editor quedaba invisible (rect null).
  useEffect(() => {
    const el = new Image();
    el.onload = () => {
      imgRef.current = el;
      medir();
    };
    el.src = imagen;
  }, [imagen, medir]);

  /** Puntero (px del contenedor) → coordenada normalizada de la imagen */
  const aNormalizado = useCallback(
    (clientX: number, clientY: number): PuntoNorm | null => {
      if (!rect) return null;
      const cont = contenedorRef.current;
      if (!cont) return null;
      const r = cont.getBoundingClientRect();
      const x = (clientX - r.left - rect.ox) / rect.dw;
      const y = (clientY - r.top - rect.oy) / rect.dh;
      return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    },
    [rect]
  );

  /** Lupa: dibuja el zoom 2.5× alrededor del punto tocado */
  const dibujarLupa = useCallback(
    (clientX: number, clientY: number) => {
      const lupa = lupaRef.current;
      const img = imgRef.current;
      if (!lupa || !img || !img.naturalWidth) return;
      const ctx = lupa.getContext("2d");
      if (!ctx) return;
      const cont = contenedorRef.current;
      if (!cont) return;
      const r = cont.getBoundingClientRect();
      const px = clientX - r.left;
      const py = clientY - r.top;
      setLupaPos({ x: px, y: py });
      const LADO = 80;
      const ZOOM = 2.5;
      // Punto en píxeles de imagen
      if (!rect) return;
      const ix = (px - rect.ox) * (img.naturalWidth / rect.dw);
      const iy = (py - rect.oy) * (img.naturalHeight / rect.dh);
      const srcLado = LADO / ZOOM;
      ctx.clearRect(0, 0, LADO, LADO);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        img,
        ix - srcLado / 2,
        iy - srcLado / 2,
        srcLado,
        srcLado,
        0,
        0,
        LADO,
        LADO
      );
      // Cruz central (ámbar del diseño del fork, sobre la lupa con borde blanco)
      ctx.strokeStyle = "#ffd60a";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(LADO / 2 - 8, LADO / 2);
      ctx.lineTo(LADO / 2 + 8, LADO / 2);
      ctx.moveTo(LADO / 2, LADO / 2 - 8);
      ctx.lineTo(LADO / 2, LADO / 2 + 8);
      ctx.stroke();
    },
    [rect]
  );

  const moverHandle = useCallback(
    (idx: number, clientX: number, clientY: number) => {
      const p = aNormalizado(clientX, clientY);
      if (!p) return;
      setQuad((prev) => {
        const next = prev.map((q) => ({ ...q })) as QuadNormalizado;
        next[idx] = p;
        return next;
      });
      dibujarLupa(clientX, clientY);
    },
    [aNormalizado, dibujarLupa]
  );

  const onPointerDown = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setArrastrando(idx);
    dibujarLupa(e.clientX, e.clientY);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (arrastrando === null) return;
    e.preventDefault();
    moverHandle(arrastrando, e.clientX, e.clientY);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (arrastrando === null) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    setArrastrando(null);
    setLupaPos(null);
  };

  const px = (p: PuntoNorm) =>
    rect
      ? { left: rect.ox + p.x * rect.dw, top: rect.oy + p.y * rect.dh }
      : { left: 0, top: 0 };
  const a = px(quad[0]);
  const b = px(quad[1]);
  const c = px(quad[2]);
  const d = px(quad[3]);
  // Anillo para el agujero del quad: exterior horario + interior
  // ANTIHORARIO (TL→BL→BR→TR) — regla nonzero de clip-path.
  const poligono = `${a.left}px ${a.top}px, ${d.left}px ${d.top}px, ${c.left}px ${c.top}px, ${b.left}px ${b.top}px`;

  return (
    // [COORD C-15] overlay oscuro ink-950 del diseño Stitch v2
    <div className="absolute inset-0 z-30 bg-ink-950/95 flex flex-col" role="dialog" aria-label="Editor de recorte del acta">
      <div className="px-3 pt-3 pb-2 text-center shrink-0">
        <span className="data-mono text-[11px] font-semibold text-brand-400">
          AJUSTE LAS 4 ESQUINAS SOBRE LOS BORDES DEL ACTA
        </span>
      </div>

      {/* Zona de edición */}
      <div
        ref={contenedorRef}
        className="relative flex-grow min-h-0 mx-3 rounded-lg border border-ink-border bg-black overflow-hidden touch-none select-none"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img
          src={imagen}
          alt="Acta original para ajustar el recorte"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          draggable={false}
        />
        {/* Oscurecer el exterior del quad (requiere rect medido) */}
        {rect && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(#0008, #0008)`,
              clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${poligono})`,
            }}
            aria-hidden
          />
        )}
        {/* Borde del quad (SVG sobre el rect exacto de la imagen) */}
        {rect && (
        <div
          className="absolute pointer-events-none"
          style={{ left: rect.ox, top: rect.oy, width: rect.dw, height: rect.dh }}
          aria-hidden
        >
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <polygon
              points={`${quad[0].x * 100},${quad[0].y * 100} ${quad[1].x * 100},${quad[1].y * 100} ${quad[2].x * 100},${quad[2].y * 100} ${quad[3].x * 100},${quad[3].y * 100}`}
              fill="none"
              stroke="#00e676"
              strokeWidth="0.6"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        )}
        {/* 4 handles (≥44px de target) — esquinas brand-500 del diseño */}
        {quad.map((p, i) => {
          const pos = px(p);
          return (
            <button
              key={ETIQUETAS[i]}
              type="button"
              onPointerDown={onPointerDown(i)}
              aria-label={`Esquina ${ETIQUETAS[i]}`}
              className="absolute w-11 h-11 -ml-[22px] -mt-[22px] rounded-full bg-brand-500/20 border-2 border-brand-500 flex items-center justify-center touch-none"
              style={{ left: pos.left, top: pos.top, cursor: "grab" }}
            >
              <span className="w-2.5 h-2.5 rounded-full bg-brand-500" aria-hidden />
            </button>
          );
        })}
        {/* Lupa (80px) junto al dedo mientras se arrastra */}
        {rect && arrastrando !== null && lupaPos && (
          <canvas
            ref={lupaRef}
            width={80}
            height={80}
            className="absolute pointer-events-none rounded-full border-2 border-white shadow-lg"
            style={{
              left: Math.min(Math.max(lupaPos.x - 40, 4), Math.max(4, rect.cw - 84)),
              top: lupaPos.y > 120 ? lupaPos.y - 104 : lupaPos.y + 24,
            }}
            aria-hidden
          />
        )}
      </div>

      {/* Acciones del editor — botones industriales rectos (≥44px) */}
      <div className="flex gap-2 p-3 shrink-0">
        <button
          type="button"
          onClick={onCancelar}
          disabled={ocupado}
          className="flex-1 flex items-center justify-center gap-1 py-3 rounded-none bg-ink-700 border border-white/15 text-white data-mono font-label-caps text-label-caps active:scale-95 disabled:opacity-50 transition-transform"
        >
          <X size={16} aria-hidden /> CANCELAR
        </button>
        {/* [COORD C-15] CTA brand-500 con glow */}
        <button
          type="button"
          onClick={() => onConfirmar(quad)}
          disabled={ocupado}
          className="flex-[2] flex items-center justify-center gap-2 py-3 rounded-none bg-brand-500 text-black data-mono font-label-caps text-label-caps active:scale-95 shadow-glow-emerald disabled:opacity-50 transition-transform"
        >
          {ocupado ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden /> REPROCESANDO…
            </>
          ) : (
            <>
              <Check size={16} aria-hidden /> APLICAR RECORTE
            </>
          )}
        </button>
      </div>
    </div>
  );
};
