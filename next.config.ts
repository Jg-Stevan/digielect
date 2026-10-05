import type { NextConfig } from "next";

// Export estática para GitHub Pages: solo se activa en CI
// (workflow deploy-pages) con NEXT_STATIC_EXPORT=1. En dev y en
// servidor completo se mantiene el modo standalone con backend.
const isStaticExport = process.env.NEXT_STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isStaticExport
    ? {
        output: "export",
        // El sitio del proyecto se sirve en /digielect (GitHub Pages)
        basePath: "/digielect",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
        output: "standalone",
      }),
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
