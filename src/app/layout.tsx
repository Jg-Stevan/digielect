import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { withBasePath } from "@/lib/env";
import { RegistrarSW } from "@/components/pwa/RegistrarSW";

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

/** Inter: tipografía oficial del PWA Digitalizador (diseño Stitch) */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Digielect — Monitoreo Electoral E-14 (Exterior)",
  description:
    "Plataforma de Digitalización, Transmisión y Auditoría de Actas E-14 para consulados de Colombia en el exterior. Monitor global, bandeja de anomalías, control SLA y carga masiva BATCH.",
  keywords: [
    "E-14",
    "Registraduría",
    "elecciones",
    "Colombia",
    "escrutinio",
    "digitalización",
    "consulados",
  ],
  // D-06: PWA instalable del digitalizador (con basePath en export estática)
  manifest: withBasePath("/manifest.webmanifest"),
};

export const viewport: Viewport = {
  themeColor: "#0e1414",
  width: "device-width",
  initialScale: 1,
  // D-06: el contenido llega hasta los bordes del dispositivo real
  // (habilita env(safe-area-inset-*) en la PWA standalone).
  viewportFit: "cover",
  // §4.2.5 — el teclado en pantalla redimensiona el viewport en vez de
  // tapar los CTAs (CONFIRMAR / IDENTIFICAR) al escribir en inputs 16px.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${hankenGrotesk.variable} ${jetbrainsMono.variable} ${inter.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        {/* A-01 (FASE 2): Service Worker mínimo — PWA real, assets y
            vendor de OCR cacheados para la jornada sin red */}
        <RegistrarSW />
      </body>
    </html>
  );
}
