"use client";

// ============================================================
// DIGIELECT — Focus trap para modales custom (OLA3 · 3.11)
//
// Los 4 modales del supervisor (Reinspection, ConfigSla,
// SlaHistorial, WhatsAppChat) son divs custom con role=dialog y
// estilos industriales propios: migrarlos a Dialog de Radix
// rompería el layout. Este hook añade el comportamiento de
// foco que Radix daría gratis, sin tocar el marcado:
//  · al abrir  → foco al primer elemento focable del diálogo
//  · Tab       → cicla dentro del diálogo (último → primero)
//  · Shift+Tab → cicla en reversa (primero → último)
//  · al cerrar → restaura el foco al elemento que abrió
// (Esc ya lo manejaba cada modal con su listener propio.)
// ============================================================

import { useEffect, useRef } from "react";

const SELECTOR_FOCABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Elementos focables y VISIBLES dentro del nodo (los display:none no cuentan) */
function focables(node: HTMLElement): HTMLElement[] {
  return Array.from(node.querySelectorAll<HTMLElement>(SELECTOR_FOCABLE)).filter(
    (el) => {
      // getClientRects() vacío = elemento no renderizado (oculto)
      try {
        return el.getClientRects().length > 0;
      } catch {
        return false;
      }
    }
  );
}

/**
 * @param active true mientras el diálogo está abierto. Al pasar a
 * false (o desmontar), el foco vuelve al trigger original.
 * @returns ref para el elemento raíz del diálogo.
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    // Elemento que tenía el foco al abrir (el trigger) — se restaura al cerrar
    const previo = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    // Foco inicial al primer focable (tras el commit del DOM del diálogo)
    const tInicial = window.setTimeout(() => {
      const lista = focables(node);
      (lista[0] ?? node).focus();
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const lista = focables(node);
      if (lista.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      const activo = document.activeElement;
      if (e.shiftKey && (activo === primero || !node.contains(activo))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (activo === ultimo || !node.contains(activo))) {
        e.preventDefault();
        primero.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(tInicial);
      node.removeEventListener("keydown", onKeyDown);
      previo?.focus?.();
    };
  }, [active]);

  return ref;
}
