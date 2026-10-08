"use client";

// ============================================================
// DIGIELECT · [OLA7] ErrorBoundary global del panel supervisor
// Antes un crash de render en CUALQUIER componente (un Record sin
// la clave de un tipo nuevo, un campo undefined del bootstrap…)
// derribaba la página entera con la pantalla blanca de Next — en
// jornada electoral eso es "el sistema se cayó". El boundary
// atrapa el error de render, conserva el mensaje para el reporte
// y ofrece RECARGAR (estado fresco del servidor) sin perder la
// sesión (cookie httpOnly ajena a este árbol React).
// ============================================================

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Trazabilidad del crash en consola del servidor cliente (no PII:
    // mensaje de error + componente, nunca contenido de actas).
    console.error("[ErrorBoundary] crash de render:", error.message, info.componentStack);
  }

  private recargar = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background px-4 py-8">
        <div
          role="alert"
          className="w-full max-w-lg border border-error/50 bg-surface-container rounded-sm p-6 flex flex-col gap-4"
        >
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 border-2 border-error/60 flex items-center justify-center rounded-sm bg-error/10 shrink-0">
              <AlertTriangle size={22} className="text-error" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="font-headline-md text-headline-md text-on-surface uppercase">
                ERROR DE INTERFACE
              </h1>
              <p className="font-label-caps text-label-caps text-on-surface-variant">
                EL PANEL SUPERVISOR NO PUDO RENDERIZAR ESTA VISTA
              </p>
            </div>
          </div>

          <p className="text-body-md text-on-surface-variant">
            El resto del sistema sigue operando (la ingesta de la PWA y las
            APIs no se ven afectadas). La vista quedó interceptada para
            proteger los datos en pantalla.
          </p>

          <pre className="font-stats-number text-[11px] text-on-surface-variant/80 bg-surface-container-lowest border border-outline-variant/50 rounded-sm px-3 py-2 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
            {this.state.error.message || "Error desconocido de renderizado"}
          </pre>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.recargar}
              className="h-11 px-4 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-headline-md text-headline-md uppercase rounded-sm transition-all hover:brightness-110 active:scale-[0.98] min-h-[44px]"
            >
              <RefreshCw size={16} aria-hidden />
              RECARGAR PANEL
            </button>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="h-11 px-4 flex items-center justify-center gap-2 border border-outline-variant text-on-surface-variant font-label-caps text-label-caps uppercase rounded-sm transition-colors hover:border-primary/50 hover:text-on-surface min-h-[44px]"
            >
              REINTENTAR SIN RECARGAR
            </button>
          </div>
        </div>
      </div>
    );
  }
}
