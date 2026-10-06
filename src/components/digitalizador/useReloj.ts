"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — Reloj aislado (D-22)
// Antes DigitalizadorApp corría un setInterval de 1 Hz y con un
// setState re-renderizaba TODO el árbol cada segundo (Revisión
// con la imagen grande incluida) — gratis en escritorio, caro en
// un teléfono de gama baja. Ahora cada consumidor que necesita
// la hora se suscribe por su cuenta: el tick re-renderiza sólo
// el componente que pide el reloj.
// ============================================================

import { useEffect, useState } from "react";

/** Hora en vivo, actualizada cada segundo dentro del componente que la usa */
export function useReloj(): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}
