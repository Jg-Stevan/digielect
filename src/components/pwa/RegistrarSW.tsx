"use client";

// ============================================================
// DIGIELECT · Registro del Service Worker (FASE 2.1 — rol A)
// A-01: PWA real del digitalizador. Sólo en producción (en dev
// el SW interferiría con el hot reload y con el backend local).
// El mismo sw.js funciona con basePath (/digielect en Pages)
// y sin él (dev / servidor Windows) porque deriva el base del
// scope de registro.
// ============================================================

import { useEffect } from "react";
import { withBasePath } from "@/lib/env";

export function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const registrar = () => {
      navigator.serviceWorker
        .register(withBasePath("/sw.js"))
        .then((reg) => {
          // Pide el precache del vendor cuando el SW ya está activo
          // (redundante con el activate, pero completa faltantes).
          const activo = reg.active ?? reg.installing ?? reg.waiting;
          activo?.postMessage?.("precache-vendor");
        })
        .catch(() => {
          /* sin SW: la PWA sigue funcionando en línea */
        });
    };

    if (document.readyState === "complete") {
      registrar();
      return;
    }
    window.addEventListener("load", registrar, { once: true });
    return () => window.removeEventListener("load", registrar);
  }, []);

  return null;
}
