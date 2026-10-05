import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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
};

export const viewport: Viewport = {
  themeColor: "#0e1414",
  width: "device-width",
  initialScale: 1,
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
      </body>
    </html>
  );
}
