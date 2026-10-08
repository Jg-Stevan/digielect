import type { NextConfig } from "next";

// Export estática para GitHub Pages: solo se activa en CI
// (workflow deploy-pages) y en verificación local con
// NEXT_STATIC_EXPORT=1. En dev y en servidor completo se
// mantiene el modo standalone con backend.
const isStaticExport = process.env.NEXT_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isStaticExport
    ? {
        output: "export",
        // El sitio del proyecto se sirve en /digielect (GitHub Pages)
        basePath: "/digielect",
        trailingSlash: true,
        images: { unoptimized: true },
        // El demo estático NO tiene backend: excluye los route
        // handlers (src/app/api/**/route.ts) de la exportación.
        // Sólo las páginas .tsx se exportan; el demo usa
        // public/data/*.json + almacenamiento del navegador.
        // (Sustituye el antiguo `rm -rf src/app/api` del workflow.)
        pageExtensions: ["tsx", "jsx"],
      }
    : {
        output: "standalone",
      }),
  // Inline en el bundle cliente para lib/env.ts: basta con
  // NEXT_STATIC_EXPORT=1 para activar TODO el modo demo.
  env: {
    NEXT_PUBLIC_STATIC_EXPORT: isStaticExport ? "1" : "0",
    NEXT_PUBLIC_BASE_PATH: isStaticExport ? "/digielect" : "",
  },
  /* config options here */
  // [OLA 6 · 6.1] ignoreBuildErrors retirado: `bunx tsc --noEmit`
  // está en 0 errores y el workflow de CI corre el gate ANTES del
  // deploy (deploy-pages.yml "Quality gates"). El type-check nativo
  // de `next build` vuelve a ser exigible.
  reactStrictMode: false,
};

export default nextConfig;
