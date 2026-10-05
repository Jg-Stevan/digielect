"use client";

// ============================================================
// DIGIELECT · Pantalla de ACCESO
// Dos vías de entrada (alineadas con el modelo operativo):
//  · SUPERVISOR DE DIGITALIZACIÓN → con credenciales (sesión
//    persistente en localStorage, válida también en demo).
//  · DIGITALIZADOR CONSULAR → SIN credenciales (flujo sin
//    fricción: el acta se analiza y se sube sola si cumple el
//    score RN-02). No se pide nada al operador de mesa.
// ============================================================

import React, { useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  LogIn,
  ScanLine,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { apiLogin, DEMO_CREDENCIALES } from "@/lib/api-client";

interface LoginScreenProps {
  /** Sesión iniciada correctamente como supervisor */
  onSuccess: (usuario: string) => void;
  /** Entrar directo a la PWA del digitalizador (sin credenciales) */
  onOpenDigitalizador: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  onSuccess,
  onOpenDigitalizador,
}) => {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarClave, setMostrarClave] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (cargando) return;
    if (!usuario.trim() || !password) {
      setError("Ingrese usuario y contraseña");
      return;
    }
    setCargando(true);
    setError(null);
    try {
      const json = await apiLogin(usuario, password);
      if (json.ok && json.usuario) {
        onSuccess(json.usuario);
      } else {
        setError(json.error ?? "Credenciales inválidas");
      }
    } catch {
      setError("Error de red al validar credenciales");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-gradient-to-b from-surface-container-lowest via-surface-dim to-surface-container-lowest px-4 py-8">
      {/* ---- Marca ---- */}
      <header className="flex flex-col items-center gap-2 text-center mb-8">
        <div className="w-14 h-14 border-2 border-primary flex items-center justify-center rounded-sm bg-primary/10">
          <ScanLine size={26} className="text-primary" aria-hidden />
        </div>
        <h1 className="font-headline-lg text-headline-lg text-primary tracking-tight">
          DIGIELECT
        </h1>
        <p className="text-body-md text-on-surface-variant max-w-md">
          Sistema de digitalización y monitoreo de actas E-14 · Presidenciales
          2ª vuelta · Voto en el exterior
        </p>
        <span className="font-label-caps text-label-caps text-on-surface-variant border border-outline-variant px-2.5 py-1 rounded-sm">
          949 PUESTOS CONSULARES · 3.670 MESAS · DATOS REALES REGISTRADURÍA
        </span>
      </header>

      <div className="flex-1 w-full flex items-start sm:items-center justify-center">
        <div className="w-full max-w-4xl grid gap-4 md:grid-cols-2">
          {/* ---- Tarjeta Supervisor (con credenciales) ---- */}
          <section
            aria-labelledby="login-supervisor-title"
            className="border border-outline-variant bg-surface-container rounded-sm p-6 flex flex-col gap-4"
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={20} className="text-primary shrink-0" aria-hidden />
              <div className="min-w-0">
                <h2
                  id="login-supervisor-title"
                  className="font-headline-md text-headline-md text-on-surface"
                >
                  SUPERVISOR DE DIGITALIZACIÓN
                </h2>
                <p className="font-label-caps text-label-caps text-on-surface-variant">
                  PANEL DE MONITOREO · CON CREDENCIALES
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="login-usuario"
                  className="font-label-caps text-label-caps text-on-surface-variant"
                >
                  USUARIO
                </label>
                <input
                  id="login-usuario"
                  type="text"
                  autoComplete="username"
                  value={usuario}
                  onChange={(e) => {
                    setUsuario(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={cargando}
                  placeholder="supervisor"
                  className="h-11 px-3 bg-surface-container-highest border border-outline-variant text-on-surface
                    font-stats-number text-[14px] rounded-sm outline-none focus:border-primary
                    placeholder:text-on-surface-variant/50 disabled:opacity-50"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="login-password"
                  className="font-label-caps text-label-caps text-on-surface-variant"
                >
                  CONTRASEÑA
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={mostrarClave ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    disabled={cargando}
                    placeholder="••••••••••"
                    className="h-11 w-full px-3 pr-11 bg-surface-container-highest border border-outline-variant text-on-surface
                      font-stats-number text-[14px] rounded-sm outline-none focus:border-primary
                      placeholder:text-on-surface-variant/50 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarClave((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-on-surface-variant hover:text-primary rounded-sm"
                    aria-label={mostrarClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {mostrarClave ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                  </button>
                </div>
              </div>

              {error && (
                <p role="alert" className="text-body-md text-error border-l-2 border-error pl-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={cargando}
                className="h-12 bg-primary text-primary-foreground font-headline-md text-headline-md uppercase
                  flex items-center justify-center gap-2 rounded-sm transition-all hover:brightness-110 active:scale-[0.98]
                  disabled:opacity-50 min-h-[44px]"
              >
                {cargando ? (
                  <Loader2 size={18} className="animate-spin" aria-hidden />
                ) : (
                  <LogIn size={18} aria-hidden />
                )}
                {cargando ? "VALIDANDO..." : "INGRESAR"}
              </button>
            </form>

            <p className="font-stats-number text-[11px] text-on-surface-variant border border-outline-variant/60 bg-surface-container-low px-3 py-2 rounded-sm">
              DEMO · usuario: <span className="text-primary">{DEMO_CREDENCIALES.usuario}</span> ·
              clave: <span className="text-primary">{DEMO_CREDENCIALES.clave}</span>
            </p>
          </section>

          {/* ---- Tarjeta Digitalizador (sin credenciales) ---- */}
          <section
            aria-labelledby="login-digitalizador-title"
            className="border border-outline-variant bg-surface-container rounded-sm p-6 flex flex-col gap-4"
          >
            <div className="flex items-center gap-2.5">
              <Smartphone size={20} className="text-secondary-fixed-dim shrink-0" aria-hidden />
              <div className="min-w-0">
                <h2
                  id="login-digitalizador-title"
                  className="font-headline-md text-headline-md text-on-surface"
                >
                  DIGITALIZADOR CONSULAR
                </h2>
                <p className="font-label-caps text-label-caps text-on-surface-variant">
                  PWA MÓVIL · SIN CREDENCIALES
                </p>
              </div>
            </div>

            <ul className="flex flex-col gap-2 text-body-md text-on-surface-variant">
              <li className="flex items-start gap-2">
                <ScanLine size={14} className="text-secondary-fixed-dim mt-1 shrink-0" aria-hidden />
                Apunte la cámara al acta: el análisis de visión arranca solo.
              </li>
              <li className="flex items-start gap-2">
                <Lock size={14} className="text-secondary-fixed-dim mt-1 shrink-0" aria-hidden />
                Sin usuario ni contraseña — nada que estorbe al operador.
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight size={14} className="text-secondary-fixed-dim mt-1 shrink-0" aria-hidden />
                Si el acta cumple el score de calidad (RN-02) se sube
                automáticamente; solo las advertencias piden intervención.
              </li>
            </ul>

            <button
              type="button"
              onClick={onOpenDigitalizador}
              className="h-12 border-2 border-secondary-fixed-dim text-secondary-fixed-dim font-headline-md text-headline-md uppercase
                flex items-center justify-center gap-2 rounded-sm transition-colors hover:bg-secondary-fixed-dim/10
                min-h-[44px] mt-auto"
              aria-label="Abrir la PWA del digitalizador sin credenciales"
            >
              <Smartphone size={18} aria-hidden />
              ABRIR DIGITALIZADOR
            </button>
          </section>
        </div>
      </div>

      <footer className="mt-8 text-center font-label-caps text-[10px] text-on-surface-variant">
        DIGIELECT · DIGITALIZACIÓN E-14 · REGISTRADURÍA NACIONAL DEL ESTADO CIVIL
      </footer>
    </div>
  );
};
