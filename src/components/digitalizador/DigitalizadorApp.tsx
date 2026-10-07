"use client";

// ============================================================
// DIGIELECT · PWA DIGITALIZADOR — Componente raíz (diseño
// oficial "PWA (DIGITALIZADOR)" del repo digielect).
// Flujo E-14 con verificación de datos del acta:
//   Captura (cámara/galería) → decodifica QR en cliente →
//   /api/actas/analizar (VLM lee calidad + DIVIPOL + ejemplar
//   + página y CRUZA con el QR) → asignación de la ubicación
//   correcta (mesa/tipo/página) → RN-02: score ≥9 + cruce OK
//   → ENVÍO AUTOMÁTICO sin contraseña → pantalla de éxito.
//   Sin QR o sin coincidencia → CONTINGENCIA (barcode15 o
//   selector de ubicación). RN-03: 2 reintentos → emergencia.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Maximize, Smartphone, WifiOff } from "lucide-react";
import type {
  ActaAnalysis,
  ActaEstado,
  AsignacionActa,
  ConsulateRow,
  TipoEjemplar,
  VerificacionActa,
} from "@/lib/types";
import { ANALISIS_SIMULADO, apiAnalizarActa, apiBootstrap, apiIngestarActa } from "@/lib/api-client";
import { parseBarcode15 } from "@/lib/e14/parse";
import {
  contarHojasOffline,
  encolarHojaOffline,
  hojasOffline,
  quitarHojaOffline,
} from "@/lib/cola-contingencia";
import { procesarCaptura } from "@/lib/scanner/pipeline";
import { leerSenalesOcr } from "@/lib/scanner/ocr-local";
import type { CapturaProcesada, QuadNormalizado } from "@/lib/types";
import { evaluarCalidad } from "@/lib/e14/quality";
import { decodeQrDeDataUrl } from "@/lib/e14/qr";
import {
  encabezadoDeAnalisis,
  integrarCaptura,
  registrarHojaAceptada,
  respaldoVlmDeAnalisis,
  claveDeRanura,
  type PayloadIngesta,
  type ResultadoIntegracion,
} from "@/lib/integracion-captura";
import type { EncabezadoLeido } from "@/lib/identificacion-acta";
import { BottomNav, PhoneFrame, tabDePantalla } from "./PhoneFrame";
import { SelectorPuesto, leerIdPuestoGuardado } from "./SelectorPuesto";
import { PantallaControl } from "./PantallaControl";
import { PantallaCaptura } from "./PantallaCaptura";
import { PantallaRevision } from "./PantallaRevision";
import { PantallaExito } from "./PantallaExito";
import { PantallaContingencia, type DatosContingencia } from "./PantallaContingencia";
import { PantallaResumen } from "./PantallaResumen";
import {
  ACTAS_EJEMPLO,
  cargarActaEjemplo,
  horaEnZona,
  pliegoKey,
  rotarImagenLibre,
  rotarQuad,
  siguientePagina,
  urlActaEjemplo,
  zonaHorariaDispositivo,
  veredictoDe,
  type CapturaContexto,
  type EnvioHistorial,
  type ExitoState,
  type IngestaPayload,
  type IngestaResponse,
  type OrigenEnvio,
  type PwaScreen,
  type SesionStats,
} from "./shared";

interface DigitalizadorAppProps {
  onExit: () => void;
  /** Se llama tras cada ingesta exitosa para refrescar el monitor del supervisor */
  onIngested?: () => void;
}

const ERROR_RED = "ERROR DE RED · REINTENTANDO EN SEGUNDO PLANO";
const AVISO_CLAVEROS =
  "EJEMPLAR CLAVEROS (ARCA TRICLAVE) · NO SE INGRESA AL SISTEMA — USE LOS EJEMPLARES DELEGADOS O TRANSMISIÓN";

export const DigitalizadorApp: React.FC<DigitalizadorAppProps> = ({
  onExit,
  onIngested,
}) => {
  // ---------------- Datos del consulado ----------------
  const [consulados, setConsulados] = useState<ConsulateRow[]>([]);
  const [consulado, setConsulado] = useState<ConsulateRow | null>(null);
  const [cargandoBootstrap, setCargandoBootstrap] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);

  // ---------------- Navegación y flujo ----------------
  const [screen, setScreen] = useState<PwaScreen>("captura");
  const [mesaSel, setMesaSel] = useState<string | null>(null);
  const [ctx, setCtx] = useState<CapturaContexto | null>(null);
  const [imagen, setImagen] = useState<string | null>(null);
  const [qrTexto, setQrTexto] = useState<string | null>(null);
  const [analisis, setAnalisis] = useState<ActaAnalysis | null>(null);
  const [verificacion, setVerificacion] = useState<VerificacionActa | null>(null);
  const [asignacion, setAsignacion] = useState<AsignacionActa | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorRed, setErrorRed] = useState<string | null>(null);

  // ---------------- Escáner rol A (web-scanner port) ----------------
  // F-DEFER-CROP: al capturar, Revisión abre AL INSTANTE con el
  // frame provisional; el recorte automático + perspectiva + B/N
  // adaptativo aterrizan en segundo plano (procesarYAnalizar) y
  // reemplazan la imagen. Las señales crudas (CapturaProcesada)
  // quedan listas para el identificador determinista (rol C).
  const [senales, setSenales] = useState<CapturaProcesada | null>(null);
  const [procesandoRecorte, setProcesandoRecorte] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [reintentos, setReintentos] = useState<Record<string, number>>({});
  const [exito, setExito] = useState<ExitoState | null>(null);
  const [modoManual, setModoManual] = useState(false);
  const [colaOffline, setColaOffline] = useState(0);
  const [envioRechazado, setEnvioRechazado] = useState(false);

  // ---------------- D-06: modo dispositivo real vs simulación ----------------
  // Dispositivo real (puntero táctil + viewport estrecho, o ?pwa=1 explícito):
  // la PWA se renderiza a viewport completo SIN la maqueta del teléfono
  // (sin notch falso, sin rótulo de simulación, sin botón del supervisor).
  // Reactivo a resize (rotación / emulación de dispositivo en DevTools).
  const [modoDispositivo, setModoDispositivo] = useState(false);
  /** Escritorio: fullscreen del documento → también se oculta la maqueta */
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  /** Tooltip si requestFullscreen falla (iframe de Pages: permisos) */
  const [avisoFullscreen, setAvisoFullscreen] = useState<string | null>(null);

  // ---- FASE 1 (rol C): identificador determinista integrado ----
  const [integracion, setIntegracion] = useState<ResultadoIntegracion | null>(null);
  const [identificando, setIdentificando] = useState(false);
  const [codigoXManual, setCodigoXManual] = useState<string | null>(null);
  /** Envío RN-02 diferido hasta que el identificador emita veredicto */
  const [pendienteAuto, setPendienteAuto] = useState<{
    analisis: ActaAnalysis;
    imagen: string;
    ctx: CapturaContexto | null;
    qr: string | null;
  } | null>(null);
  const identificandoRef = useRef(false);
  const codigoXManualRef = useRef<string | null>(null);
  /** Rol A · espejo de `senales` para leerlas fuera del render (refs/efectos) */
  const senalesRef = useRef<CapturaProcesada | null>(null);
  const ocrBusyRef = useRef(false);
  /** Rol A × C · serializa corridas del identificador (nunca solapadas) */
  const idChainRef = useRef<Promise<void>>(Promise.resolve());
  /** Espejo de qrTexto para callbacks estables (completarOcr) */
  const qrTextoRef = useRef<string | null>(null);
  /** D-03: frame ORIGINAL sin comprimir — base del editor de esquinas */
  const originalRef = useRef<string | null>(null);
  /** D-03/D-04: editor de esquinas del recorte abierto */
  const [editorRecorte, setEditorRecorte] = useState(false);
  const [reprocesando, setReprocesando] = useState(false);
  useEffect(() => {
    qrTextoRef.current = qrTexto;
  }, [qrTexto]);
  /** D-14: token de generación de captura. Toda tarea asíncrona que
   *  escribe estado de la captura (pipeline, OCR, análisis VLM,
   *  identificador, re-procesado) captura el token al ARRANCAR y lo
   *  re-verifica antes de aplicar resultados: si una captura nueva
   *  incrementó el token, los resultados viejos se descartan y ya no
   *  pisan imagen/senales/analisis de la captura vigente. */
  const capturaTokenRef = useRef(0);
  const nuevaGeneracion = useCallback(() => {
    capturaTokenRef.current += 1;
    return capturaTokenRef.current;
  }, []);
  const tokenVigente = useCallback(
    (token: number) => token === capturaTokenRef.current,
    []
  );
  /** D-13: el intento de envío REAL (fue a la API, aunque falle o el
   *  servidor lo rechace) quema reintento RN-03; la recaptura sin envío
   *  NO lo quema (nunca se castiga un cambio de opinión del operador). */
  const envioIntentadoRef = useRef(false);

  // ---------------- Varios ----------------
  // D-22: el reloj 1 Hz ya NO vive aquí (re-renderizaba TODO el árbol,
  // incluida Revisión con la imagen grande, cada segundo). Cada
  // consumidor que necesita hora se suscribe por su cuenta vía <Reloj />.
  const [cargandoEjemplo, setCargandoEjemplo] = useState(false);
  const [ejemploIdx, setEjemploIdx] = useState(0);
  const [stats, setStats] = useState<SesionStats>({
    enviadas: 0,
    aprobadas: 0,
    advertencia: 0,
    rechazos: 0,
    delegadosEnviados: 0,
    manualEnviados: 0,
    inicio: Date.now(),
  });
  const [historial, setHistorial] = useState<EnvioHistorial[]>([]);

  // Reintentos de red (cola offline persistida en IndexedDB — FASE 4/5 rol B:
  // sobrevive al cierre de la pestaña; SINCRONIZAR COLA la drena)
  const falloRef = useRef<{
    analisis: ActaAnalysis;
    imagen: string;
    ctx: CapturaContexto;
    qrTexto: string | null;
  } | null>(null);

  /** Encola en IndexedDB una hoja que no pudo enviarse */
  const encolarFallo = useCallback(
    (
      ana: ActaAnalysis,
      img: string,
      c: CapturaContexto,
      qr: string | null,
      emergencia: boolean
    ) => {
      void (async () => {
        try {
          await encolarHojaOffline({
            imagen: img,
            qrTexto: qr,
            barcode: ana.barcode,
            mesaIdRef: c.mesa.id,
            tipo: c.tipoEjemplar,
            pagina: c.pagina,
            scoreCliente: Math.round(ana.scoreCalidad),
            envioEmergencia: emergencia,
          });
          setColaOffline(await contarHojasOffline());
        } catch {
          /* sin IndexedDB: queda solo el falloRef en memoria */
        }
      })();
    },
    []
  );

  // Conteo inicial de la cola persistida (hojas de sesiones previas)
  useEffect(() => {
    void (async () => {
      try {
        setColaOffline(await contarHojasOffline());
      } catch {
        /* noop */
      }
    })();
  }, []);



  // ---------------- FASE 1 (rol C): calidad de imagen en cliente ----------------
  const calidadDeImagen = useCallback(async (dataUrl: string) => {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("img"));
        el.src = dataUrl;
      });
      const c = evaluarCalidad(img);
      // El motor actual mide nitidez y exposición; contraste/brillo se
      // aproximan con la exposición hasta que el rol A entregue
      // CapturaProcesada con métricas separadas (TAREA-A §4).
      return { nitidez: c.nitidez, contraste: c.exposicion, brillo: c.exposicion };
    } catch {
      return null;
    }
  }, []);

  // ---------------- FASE 1 (rol C) × rol A: cadena del identificador ----------------
  // Serializada en idChainRef: las re-corridas (OCR local aterrizando,
  // encabezado VLM, código manual) se ENCOLAN en lugar de solaparse, y
  // `identificandoRef` refleja siempre la corrida realmente en curso.
  // D-14: cada corrida lleva el token de su captura; una corrida encolada
  // por una captura vieja se descarta cuando le toca ejecutar.
  const ejecutarIdentificacion = useCallback(
    (params: {
      imagen: string;
      qr: string | null;
      codigoManual?: string | null;
      encabezado?: EncabezadoLeido | null;
      respaldoVlm?: { pagina?: 1 | 2 | null; tipo?: TipoEjemplar | null } | null;
      /** Rol A · señales crudas del pipeline (barcode15, calidad, OCR local) */
      senales?: CapturaProcesada | null;
      /** D-14 · token de generación (sin token = siempre vigente) */
      token?: number;
    }) => {
      idChainRef.current = idChainRef.current.then(async () => {
        if (params.token !== undefined && !tokenVigente(params.token)) return;
        identificandoRef.current = true;
        setIdentificando(true);
        try {
          const senalesA = params.senales ?? null;
          // La calidad medida por el worker (rol A) manda; si no la hay
          // (pipeline degradado), se aproxima en cliente como antes.
          const calidad = senalesA?.calidad ?? (await calidadDeImagen(params.imagen));
          const resultado = await integrarCaptura(
            {
              // El código digitado por el operador (respaldo) pisa al OCR;
              // si no hay manual, manda la lectura REAL del OCR local (rol A).
              codigoXCrudo: params.codigoManual ?? senalesA?.codigoXCrudo ?? null,
              textoOcr: senalesA?.textoSuperior ?? null,
              barcode15: senalesA?.barcode15 ?? null,
              qrTexto: params.qr,
              imagenDataUrl: params.imagen,
              calidad,
              encabezado:
                params.encabezado ??
                (senalesA?.encabezadoCrudo
                  ? {
                      pais: senalesA.encabezadoCrudo.pais ?? null,
                      departamento: null,
                      zona: senalesA.encabezadoCrudo.zona ?? null,
                      puesto: senalesA.encabezadoCrudo.puesto ?? null,
                      mesa: senalesA.encabezadoCrudo.mesa ?? null,
                    }
                  : null),
              respaldoVlm: params.respaldoVlm ?? null,
              contextoOperador: ctx
                ? { tipoEjemplar: ctx.tipoEjemplar, pagina: ctx.pagina }
                : null,
            },
            consulados
          );
          setIntegracion(resultado);
        } catch {
          setIntegracion(null);
        } finally {
          identificandoRef.current = false;
          setIdentificando(false);
        }
      });
      return idChainRef.current;
    },
    [ctx, consulados, calidadDeImagen, tokenVigente]
  );

  /** Reinicia el estado del identificador (nueva captura / reintento) */
  const resetIdentificacion = useCallback(() => {
    setIntegracion(null);
    setCodigoXManual(null);
    codigoXManualRef.current = null;
    setPendienteAuto(null);
  }, []);

  /** Entrada manual de respaldo del código entre las X (mismo normalizador) */
  const identificarConCodigoManual = useCallback(
    (crudo: string) => {
      setCodigoXManual(crudo);
      codigoXManualRef.current = crudo;
      if (!imagen) return;
      void ejecutarIdentificacion({
        imagen,
        qr: qrTexto,
        codigoManual: crudo,
        senales: senalesRef.current,
        // En demo el análisis es SIMULADO: sus señales no alimentan al
        // identificador (sólo modo completo con VLM real).
        encabezado: ANALISIS_SIMULADO ? null : encabezadoDeAnalisis(analisis),
        respaldoVlm: ANALISIS_SIMULADO ? null : respaldoVlmDeAnalisis(analisis),
      });
    },
    [imagen, qrTexto, analisis, ejecutarIdentificacion]
  );

  // ---------------- Carga del puesto (bootstrap) ----------------
  const cargarBootstrap = useCallback(async (silencioso = false) => {
    if (silencioso) setSincronizando(true);
    try {
      const json = await apiBootstrap();
      if (json.ok && json.consulados && json.consulados.length > 0) {
        setConsulados(json.consulados);
        // D-07: nada se autoselecciona. El puesto se elige una vez en el
        // SelectorPuesto y persiste en "digielect-puesto-v1"; aquí solo se
        // restaura por id (si el id guardado ya no existe → selector en
        // blanco). Con puesto activo se re-vincula por id para refrescar
        // mesas/estados sin perder la selección del dispositivo.
        const lista = json.consulados;
        setConsulado((prev) => {
          if (prev) {
            return lista.find((c) => c.id === prev.id) ?? prev;
          }
          const idGuardado = leerIdPuestoGuardado();
          if (!idGuardado) return null;
          return lista.find((c) => c.id === idGuardado) ?? null;
        });
      } else {
        setErrorRed(ERROR_RED);
      }
    } catch {
      setErrorRed(ERROR_RED);
    } finally {
      setCargandoBootstrap(false);
      if (silencioso) setSincronizando(false);
    }
  }, []);

  useEffect(() => {
    void cargarBootstrap();
  }, [cargarBootstrap]);

  // ---------------- D-06: detección del contexto real ----------------
  useEffect(() => {
    const evaluar = () => {
      const pwaQuery =
        new URLSearchParams(window.location.search).get("pwa") === "1";
      const punteroTactil = window.matchMedia("(pointer: coarse)").matches;
      // Señal extra: UA móvil (algunos WebView en pantallas táctiles no
      // marcan pointer:coarse). El ancho sigue haciendo de guardia.
      const uaMovil =
        /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      setModoDispositivo(
        pwaQuery ||
          (punteroTactil && window.innerWidth < 768) ||
          (uaMovil && window.innerWidth < 768)
      );
    };
    evaluar();
    window.addEventListener("resize", evaluar);
    return () => window.removeEventListener("resize", evaluar);
  }, []);

  // ---------------- D-06: sincronizar el estado con fullscreenchange ----------------
  useEffect(() => {
    const onChange = () =>
      setPantallaCompleta(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ---------------- Resolución de la ubicación correcta ----------------
  /** Convierte la asignación (QR/VLM) en el contexto de captura final */
  const resolverCtx = useCallback(
    (asig: AsignacionActa | null, prev: CapturaContexto | null): CapturaContexto | null => {
      if (!asig?.mesaId) return prev;
      for (const cons of consulados) {
        if (asig.consuladoId && cons.id !== asig.consuladoId) continue;
        const mesa = cons.mesas.find((m) => m.id === asig.mesaId);
        if (mesa) {
          const tipo: TipoEjemplar =
            asig.tipoEjemplar === "TRANSMISION"
              ? "TRANSMISION"
              : asig.tipoEjemplar === "DELEGADOS"
                ? "DELEGADOS"
                : prev?.tipoEjemplar ?? "DELEGADOS";
          const pagina = (asig.pagina === 2 ? 2 : asig.pagina === 1 ? 1 : siguientePagina(mesa, tipo)) as 1 | 2;
          return { mesa, consulado: cons, tipoEjemplar: tipo, pagina };
        }
      }
      return prev;
    },
    [consulados]
  );

  // ---------------- Registro de envíos ----------------
  const registrarEnvio = useCallback(
    (
      json: IngestaResponse,
      meta: {
        mesaLabel: string;
        tipo: TipoEjemplar;
        pagina: number;
        pliego?: string;
      },
      origen: OrigenEnvio
    ) => {
      const decision = json.decision;
      const analisisResp = json.analisis ?? null;
      if (!decision) return;
      if (decision.estado === "RECHAZADO") return;

      setStats((prev) => ({
        ...prev,
        enviadas: prev.enviadas + 1,
        aprobadas: prev.aprobadas + (decision.estado === "VALIDADO" ? 1 : 0),
        advertencia: prev.advertencia + (decision.estado === "ANOMALIA" ? 1 : 0),
        delegadosEnviados: prev.delegadosEnviados + (meta.tipo === "DELEGADOS" ? 1 : 0),
        manualEnviados: prev.manualEnviados + (origen === "MANUAL" ? 1 : 0),
      }));

      setHistorial((prev) =>
        [
          {
            hora: horaEnZona(new Date(), zonaHorariaDispositivo()),
            mesa: meta.mesaLabel,
            tipo: meta.tipo,
            pagina: meta.pagina,
            estado: decision.estado,
            origen,
            score: analisisResp?.scoreLetra ?? null,
          },
          ...prev,
        ].slice(0, 12)
      );

      if (meta.pliego) {
        const pliego = meta.pliego;
        setReintentos((prev) => {
          const copia = { ...prev };
          delete copia[pliego];
          return copia;
        });
      }

      setExito({
        estado: decision.estado,
        score: analisisResp?.scoreLetra ?? null,
        motivo: decision.motivo,
        mesa: meta.mesaLabel,
        tipo: meta.tipo,
        pagina: meta.pagina,
        origen,
      });
      setScreen("exito");

      void cargarBootstrap(true);
      onIngested?.();
    },
    [cargarBootstrap, onIngested]
  );

  // ---------------- Envío del acta (automático / emergencia) ----------------
  const enviarActa = useCallback(
    async (
      emergencia: boolean,
      analisisParam?: ActaAnalysis,
      imagenParam?: string,
      ctxParam?: CapturaContexto,
      qrTextoParam?: string | null
    ) => {
      const ana = analisisParam ?? analisis;
      const img = imagenParam ?? imagen;
      const c = ctxParam ?? ctx;
      const qr = qrTextoParam ?? qrTexto;
      if (!c || !img || !ana) return;
      // D-13: hubo intento de envío REAL → la recaptura de este pliego
      // quemará reintento RN-03 (aquí ya no es un cambio de opinión).
      envioIntentadoRef.current = true;
      setEnviando(true);
      setErrorRed(null);
      setEnvioRechazado(false);
      try {
        const payload: IngestaPayload = {
          imagenBase64: img,
          tipoEjemplar: c.tipoEjemplar,
          pagina: c.pagina,
          totalPaginas: 2,
          scoreCliente: Math.round(ana.scoreCalidad),
          envioEmergencia: emergencia,
          mesaIdRef: c.mesa.id,
          qrTexto: qr ?? undefined,
        };
        if (ana.barcode) payload.barcode = ana.barcode;
        else if (qr) {
          const bc = parseBarcode15(qr);
          if (bc && bc.tipoEjemplar !== "CLAVEROS") payload.barcode = bc.crudo;
        }

        const json = await apiIngestarActa(payload);

        if (!json.ok || !json.decision) {
          setErrorRed(ERROR_RED);
          setColaOffline((n) => n + 1);
          falloRef.current = { analisis: ana, imagen: img, ctx: c, qrTexto: qr };
          encolarFallo(ana, img, c, qr, emergencia);
          return;
        }
        if (json.decision.estado === "RECHAZADO") {
          setErrorRed(
            `EL SERVIDOR RECHAZÓ EL ACTA · ${json.decision.motivo.toUpperCase()}`
          );
          setEnvioRechazado(true);
          return;
        }
        registrarEnvio(
          json,
          {
            mesaLabel: c.mesa.mesaNumber,
            tipo: c.tipoEjemplar,
            pagina: c.pagina,
            pliego: pliegoKey(c.mesa.id, c.tipoEjemplar, c.pagina),
          },
          emergencia ? "EMERGENCIA" : "AUTO"
        );
        falloRef.current = null;
      } catch {
        setErrorRed(ERROR_RED);
        setColaOffline((n) => n + 1);
        falloRef.current = { analisis: ana, imagen: img, ctx: c, qrTexto: qr };
        encolarFallo(ana, img, c, qr, emergencia);
      } finally {
        setEnviando(false);
      }
    },
    [ctx, imagen, analisis, qrTexto, registrarEnvio]
  );

  // ---------------- Análisis + verificación QR ↔ VLM ----------------
  // Sin fricción: al capturar se analiza de inmediato; si el acta
  // supera el umbral (RN-02 AUTO) y la verificación del QR contra
  // la imagen coincide, el envío se dispara solo, sin contraseña.
  const analizar = useCallback(
    async (
      imagenParam?: string,
      qrTextoParam?: string | null,
      token?: number
    ) => {
      const img = imagenParam ?? imagen;
      const qr = qrTextoParam ?? qrTexto;
      if (!img) return;
      setAnalizando(true);
      setErrorRed(null);
      try {
        const json = await apiAnalizarActa(img, qr ?? undefined);
        // D-14: captura nueva mientras el análisis corría → descartar todo
        if (token !== undefined && !tokenVigente(token)) return;
        if (json.ok && json.analisis) {
          setAnalisis(json.analisis);
          setVerificacion(json.verificacion ?? null);
          setAsignacion(json.asignacion ?? null);

          // FASE 1 (rol C): en modo completo re-integra con el encabezado
          // real leído por el VLM (DIVIPOL + "Página X de Y" + banner).
          // Rol A: las señales del pipeline (barcode15/calidad/OCR local)
          // acompañan la re-corrida para no degradar el veredicto.
          if (!ANALISIS_SIMULADO) {
            void ejecutarIdentificacion({
              imagen: img,
              qr,
              codigoManual: codigoXManualRef.current,
              encabezado: encabezadoDeAnalisis(json.analisis),
              respaldoVlm: respaldoVlmDeAnalisis(json.analisis),
              senales: senalesRef.current,
              token,
            });
          }

          // 1. Ubicación correcta del acta (QR → VLM → previa)
          const ctxResuelto = resolverCtx(json.asignacion ?? null, ctx);
          setCtx(ctxResuelto);
          setMesaSel((prev) => ctxResuelto?.mesa.id ?? prev);

          // 2. Ejemplar CLAVEROS: no se ingesta (arca triclave)
          const bcQr = qr ? parseBarcode15(qr) : null;
          const esClaveros =
            bcQr?.tipoEjemplar === "CLAVEROS" ||
            (json.analisis.barcode
              ? parseBarcode15(json.analisis.barcode)?.tipoEjemplar === "CLAVEROS"
              : false);
          if (esClaveros) {
            setErrorRed(AVISO_CLAVEROS);
            setAnalizando(false);
            return;
          }

          // 3. RN-02 AUTO → envío automático (sin contraseña):
          //    solo si los datos del acta (QR/VLM) ubicaron la mesa
          //    o si es el mismo pliego que veníamos capturando.
          const veredicto = veredictoDe(json.analisis);
          const cruceOk = (json.verificacion?.coincidenUbicacion ?? null) !== false;
          const asignadoPorDatos = Boolean(json.asignacion?.mesaId);
          const mismoPliego =
            ctx != null &&
            ctxResuelto != null &&
            ctx.mesa.id === ctxResuelto.mesa.id &&
            ctx.tipoEjemplar === ctxResuelto.tipoEjemplar &&
            ctx.pagina === ctxResuelto.pagina;
          // FASE 1 (rol C): el auto-envío RN-02 EXIGE el veredicto del
          // identificador determinista (ranura (mesa,tipo,pág) libre o
          // reemplazable + estadoSugerido VALIDADO + score ≥ 9). Se difiere
          // en pendienteAuto; si el código X falta (ID_CODIGO_ILEGIBLE) se
          // mantiene pendiente hasta que el operador lo digite en el panel.
          if (veredicto === "AUTO" && ctxResuelto && cruceOk && (asignadoPorDatos || mismoPliego)) {
            setPendienteAuto({ analisis: json.analisis, imagen: img, ctx: ctxResuelto, qr });
          } else if (veredicto === "AUTO" && !ctxResuelto && identificandoRef.current) {
            setPendienteAuto({ analisis: json.analisis, imagen: img, ctx: null, qr });
          } else if (veredicto === "AUTO" && !ctxResuelto) {
            // Calidad perfecta pero sin ubicación → contingencia
            setScreen("contingencia");
          }
        } else {
          setErrorRed("ERROR DEL MOTOR DE VISIÓN · REINTENTE EL ANÁLISIS");
        }
      } catch {
        setErrorRed(ERROR_RED);
      } finally {
        setAnalizando(false);
      }
    },
    [imagen, qrTexto, ctx, resolverCtx, enviarActa, ejecutarIdentificacion, tokenVigente]
  );

  // ---------------- FASE 1 (rol C): RN-02 con veredicto determinista ----------------
  useEffect(() => {
    const pend = pendienteAuto;
    if (!pend || identificandoRef.current) return;
    // Rol A: mientras el OCR local corre, el código X puede aterrizar en
    // segundos y cambiar el veredicto — no auto-enviar con señales parciales.
    if (ocrBusy || procesandoRecorte) return;
    if (!integracion) return; // aún contrastando contra el índice
    const codigoPendiente =
      integracion.decision.anomalias.includes("ID_CODIGO_ILEGIBLE") ||
      integracion.identificacion.estado === "CODIGO_ILEGIBLE";
    if (codigoPendiente) return; // espera la entrada manual del código X

    setPendienteAuto(null);
    const apto =
      integracion.decision.accion === "ALMACENAR" &&
      integracion.decision.estadoSugerido === "VALIDADO" &&
      integracion.scoreRN02 >= 9;
    if (!apto) return; // la tarjeta guía: registrar en cola / anomalía / rescan

    const ranura = integracion.decision.ranura;
    const loc = integracion.localizacion;
    const ctxEnvio: CapturaContexto | null =
      loc && ranura
        ? {
            mesa: loc.mesa,
            consulado: loc.consulado,
            tipoEjemplar: ranura.tipo,
            pagina: ranura.pagina,
          }
        : pend.ctx;
    if (!ctxEnvio) return;
    setCtx(ctxEnvio);
    if (ranura) {
      registrarHojaAceptada({
        ranura,
        huella: integracion.huella,
        estado: "VALIDADO",
        mesaIdRef: loc?.mesa.id ?? null,
      });
    }
    void enviarActa(false, pend.analisis, pend.imagen, ctxEnvio, pend.qr);
  }, [pendienteAuto, integracion, enviarActa, ocrBusy, procesandoRecorte]);

  // ---------------- Captura ----------------
  // OCR local diferido (rol A): llena textoSuperior/codigoXCrudo/
  // encabezadoCrudo del contrato SIN bloquear la revisión. Al aterrizar
  // RE-EJECUTA la identificación (rol C) con las señales completas: el
  // código entre las X leído en el dispositivo entra al identificador
  // sin intervención del operador.
  const completarOcr = useCallback(
    async (imagenDataUrl: string, token?: number) => {
      ocrBusyRef.current = true;
      setOcrBusy(true);
      try {
        const ocr = await leerSenalesOcr(imagenDataUrl);
        // D-14: llegó una captura nueva mientras el OCR corría → descartar
        if (token !== undefined && !tokenVigente(token)) return;
        if (ocr) {
          const prev = senalesRef.current;
          let actualizadas: CapturaProcesada;
          if (prev) {
            actualizadas = {
              ...prev,
              textoSuperior: ocr.textoSuperior,
              codigoXCrudo: ocr.codigoXCrudo,
              encabezadoCrudo: ocr.encabezadoCrudo,
            };
          } else {
            // Pipeline degradado (sin recorte): señales parciales sobre
            // la imagen provisional; la calidad la aproxima el cliente.
            actualizadas = {
              imagenDataUrl,
              calidad: (await calidadDeImagen(imagenDataUrl)) ?? {
                nitidez: 0,
                contraste: 0,
                brillo: 0,
              },
              textoSuperior: ocr.textoSuperior,
              codigoXCrudo: ocr.codigoXCrudo,
              encabezadoCrudo: ocr.encabezadoCrudo,
              recorteAplicado: false,
              fullFrame: false,
              quad: null,
            };
          }
          senalesRef.current = actualizadas;
          setSenales(actualizadas);
          void ejecutarIdentificacion({
            imagen: actualizadas.imagenDataUrl,
            qr: qrTextoRef.current,
            senales: actualizadas,
            token,
          });
        }
      } finally {
        ocrBusyRef.current = false;
        setOcrBusy(false);
      }
    },
    [ejecutarIdentificacion, calidadDeImagen, tokenVigente]
  );

  /** Pipeline del escáner (rol A) + análisis VLM, tras abrir Revisión.
   *  D-14: todo el bloque corre bajo el token de la captura; si una
   *  captura nueva llega en medio, los resultados aquí ya no se aplican. */
  const procesarYAnalizar = useCallback(
    async (dataUrl: string, qr: string | null, token: number) => {
      let finalDataUrl = dataUrl;
      let procesada: CapturaProcesada | null = null;
      // D-03: el ORIGINAL sin comprimir se conserva para el editor de
      // esquinas (el recorte manual re-procesa desde él, no del JPEG).
      originalRef.current = dataUrl;
      try {
        procesada = await procesarCaptura(dataUrl, { qrTexto: qr });
        if (!tokenVigente(token)) return;
        finalDataUrl = procesada.imagenDataUrl;
        setImagen(finalDataUrl);
        setSenales(procesada);
        senalesRef.current = procesada;
      } catch {
        // Respaldo honesto: la imagen provisional ya está en pantalla
        // y el flujo de análisis continúa con ella.
      }
      if (!tokenVigente(token)) return;
      setProcesandoRecorte(false);
      // FASE 1 (rol C) × rol A: la identificación corre sobre la imagen
      // PROCESADA con las señales reales del pipeline (barcode15 + calidad
      // del worker); cuando el OCR local aterrice (completarOcr) se
      // re-ejecuta con el código X y el encabezado DIVIPOL leídos.
      void ejecutarIdentificacion({ imagen: finalDataUrl, qr, senales: procesada, token });
      void analizar(finalDataUrl, qr, token);
      if (finalDataUrl) void completarOcr(finalDataUrl, token);
    },
    [analizar, completarOcr, ejecutarIdentificacion, tokenVigente]
  );

  const onCaptura = useCallback(
    (dataUrl: string, qrTextoCapturado: string | null) => {
      // D-14: nueva generación — toda tarea en curso de la captura
      // anterior (pipeline/OCR/identificación/análisis) queda huérfana.
      const token = nuevaGeneracion();
      envioIntentadoRef.current = false;
      setImagen(dataUrl);
      setQrTexto(qrTextoCapturado);
      setSenales(null);
      setAnalisis(null);
      setVerificacion(null);
      setAsignacion(null);
      setErrorRed(null);
      resetIdentificacion();
      setEditorRecorte(false);
      setReprocesando(false);
      if (modoManual) {
        // Modo manual (diseño): foto de respaldo → asignación manual
        setScreen("contingencia");
        return;
      }
      // F-DEFER-CROP: Revisión abre YA; el recorte automático
      // aterriza en segundo plano y luego corre el análisis.
      setProcesandoRecorte(true);
      setScreen("revision");
      void procesarYAnalizar(dataUrl, qrTextoCapturado, token);
    },
    [modoManual, procesarYAnalizar, resetIdentificacion, nuevaGeneracion]
  );

  // ---------------- D-03/D-04: editor de esquinas del recorte ----------------
  const abrirEditorRecorte = useCallback(() => {
    if (!originalRef.current) return;
    setEditorRecorte(true);
  }, []);

  const cancelarEditorRecorte = useCallback(() => {
    if (reprocesando) return; // no abandonar a mitad de un re-procesado
    setEditorRecorte(false);
  }, [reprocesando]);

  /** Re-procesa el ORIGINAL con el quad del operador (mismo camino
   *  F-DEFER-CROP: warp + B/N + OCR + identificador re-corridos) */
  const confirmarRecorte = useCallback(
    async (quadManual: QuadNormalizado) => {
      const original = originalRef.current;
      if (!original) return;
      const token = capturaTokenRef.current; // D-14: generación vigente
      setEditorRecorte(false);
      setReprocesando(true);
      try {
        const procesada = await procesarCaptura(original, {
          qrTexto: qrTextoRef.current,
          quadFijo: quadManual,
        });
        if (!tokenVigente(token)) return;
        setImagen(procesada.imagenDataUrl);
        setSenales(procesada);
        senalesRef.current = procesada;
        setProcesandoRecorte(false);
        void ejecutarIdentificacion({
          imagen: procesada.imagenDataUrl,
          qr: qrTextoRef.current,
          senales: procesada,
          token,
        });
        void analizar(procesada.imagenDataUrl, qrTextoRef.current, token);
        void completarOcr(procesada.imagenDataUrl, token);
      } catch {
        setErrorRed("NO SE PUDO APLICAR EL RECORTE · REINTENTE");
      } finally {
        setReprocesando(false);
      }
    },
    [ejecutarIdentificacion, analizar, completarOcr, tokenVigente]
  );

  // ---------------- Acta de ejemplo (demo sin cámara) ----------------
  const usarActaEjemplo = useCallback(async () => {
    setCargandoEjemplo(true);
    setErrorRed(null);
    try {
      const base = ACTAS_EJEMPLO[ejemploIdx % ACTAS_EJEMPLO.length];
      setEjemploIdx((i) => i + 1);
      const url = urlActaEjemplo(base, ctx?.pagina ?? 1);
      const dataUrl = await cargarActaEjemplo(url);
      // FASE 1 (rol C): decodifica el QR REAL del acta de ejemplo —
      // huella para el guard de ranuras (dedupe) y barcode15 embebido.
      let qrEjemplo: string | null = null;
      try {
        const dec = await decodeQrDeDataUrl(dataUrl);
        qrEjemplo = dec.texto;
      } catch {
        /* sin QR: el guard usa la huella de imagen (IMG-hash) */
      }
      onCaptura(dataUrl, qrEjemplo);
    } catch {
      setErrorRed(ERROR_RED);
    } finally {
      setCargandoEjemplo(false);
    }
  }, [ejemploIdx, ctx, onCaptura]);

  // ---------------- Navegación ----------------
  const irACaptura = useCallback(
    (mesaId: string, tipo: TipoEjemplar) => {
      if (!consulado) return;
      // D-09: la mesa viene del PROPIO chip (nunca del mesaSel global
      // del último QR): el clic nunca captura el pliego equivocado.
      const mesa = consulado.mesas.find((m) => m.id === mesaId);
      if (!mesa) return;
      nuevaGeneracion(); // D-14
      envioIntentadoRef.current = false;
      setMesaSel(mesaId);
      setCtx({ mesa, consulado, tipoEjemplar: tipo, pagina: siguientePagina(mesa, tipo) });
      setImagen(null);
      setAnalisis(null);
      setQrTexto(null);
      setSenales(null);
      senalesRef.current = null;
      originalRef.current = null;
      setEditorRecorte(false);
      setReprocesando(false);
      setProcesandoRecorte(false);
      setOcrBusy(false);
      ocrBusyRef.current = false;
      resetIdentificacion();
      setScreen("captura");
    },
    [consulado, mesaSel, resetIdentificacion, nuevaGeneracion]
  );

  /** ESCANEAR libre: el QR del acta asigna la mesa automáticamente */
  const irAEscanear = useCallback(() => {
    if (screen === "captura") return;
    nuevaGeneracion(); // D-14
    envioIntentadoRef.current = false;
    setImagen(null);
    setAnalisis(null);
    setQrTexto(null);
    setVerificacion(null);
    setAsignacion(null);
    setSenales(null);
    senalesRef.current = null;
    originalRef.current = null;
    setEditorRecorte(false);
    setReprocesando(false);
    setProcesandoRecorte(false);
    setOcrBusy(false);
    ocrBusyRef.current = false;
    resetIdentificacion();
    setScreen("captura");
  }, [screen, resetIdentificacion, nuevaGeneracion]);

  /** D-07: el operador eligió su puesto en el selector (id ya persistido) */
  const seleccionarPuesto = useCallback((c: ConsulateRow) => {
    setConsulado(c);
    setMesaSel(null);
    setCtx(null);
    setScreen("control");
  }, []);

  /** D-07: volver al selector de puesto (confirma si hay envíos en curso) */
  const cambiarPuesto = useCallback(() => {
    const envioEnCurso =
      enviando ||
      analizando ||
      identificando ||
      procesandoRecorte ||
      ocrBusy ||
      pendienteAuto != null;
    if (
      envioEnCurso &&
      !window.confirm(
        "HAY ENVÍOS EN CURSO · AL CAMBIAR DE PUESTO SE INTERRUMPIRÁN ¿CONTINUAR?"
      )
    ) {
      return;
    }
    nuevaGeneracion(); // D-14: huérfena todo el trabajo en curso
    envioIntentadoRef.current = false;
    resetIdentificacion();
    setConsulado(null);
    setMesaSel(null);
    setCtx(null);
  }, [
    enviando,
    analizando,
    identificando,
    procesandoRecorte,
    ocrBusy,
    pendienteAuto,
    resetIdentificacion,
    nuevaGeneracion,
  ]);

  /** D-06: PANTALLA COMPLETA en la simulación de escritorio. En el iframe
   *  de Pages el permiso puede faltar → catch silencioso + tooltip con la
   *  salida existente ("abrir en pestaña nueva"). */
  const alternarPantallaCompleta = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    document.documentElement
      .requestFullscreen()
      .then(() => setAvisoFullscreen(null))
      .catch(() =>
        setAvisoFullscreen("ABRE EN PESTAÑA NUEVA PARA PANTALLA COMPLETA")
      );
  }, []);

  // ---------------- Reintentos (RN-02 / RN-03) ----------------
  // D-13: la recaptura SOLO quema reintento RN-03 cuando hubo un intento
  // de envío REAL (fue a la API y falló o fue rechazada). Repetir la foto
  // por cambio de opinión o por calidad sin haber enviado NUNCA quema un
  // reintento: el contador RN-03 mide fallos de transmisión, no dudas.
  const reintentarFoto = useCallback(() => {
    const quemaReintento = envioIntentadoRef.current;
    envioIntentadoRef.current = false;
    // El rechazo LOCAL por calidad (banda roja, nunca se envió) cuenta
    // como rechazo del turno pero NO quema reintento RN-03 (D-13).
    const rechazoLocal = Boolean(analisis && veredictoDe(analisis) === "RECHAZADO");
    if (quemaReintento && ctx) {
      const key = pliegoKey(ctx.mesa.id, ctx.tipoEjemplar, ctx.pagina);
      setReintentos((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
    }
    if (quemaReintento || rechazoLocal) {
      setStats((prev) => ({ ...prev, rechazos: prev.rechazos + 1 }));
    }
    // D-14: huérfena la generación vigente (nada de la captura vieja
    // puede aterrizar sobre la siguiente)
    nuevaGeneracion();
    setImagen(null);
    setAnalisis(null);
    setQrTexto(null);
    setVerificacion(null);
    setAsignacion(null);
    setSenales(null);
    senalesRef.current = null;
    originalRef.current = null;
    setEditorRecorte(false);
    setReprocesando(false);
    setProcesandoRecorte(false);
    setOcrBusy(false);
    ocrBusyRef.current = false;
    resetIdentificacion();
    setScreen("captura");
  }, [ctx, analisis, resetIdentificacion, nuevaGeneracion]);

  /** D-13: rotación SIEMPRE desde el ORIGINAL (un solo encode a 0.95,
   *  sin degradación acumulada) + re-procesado completo del pliego con el
   *  quad rotado (±90°, ambos sentidos). Disponible siempre que haya
   *  imagen — no sólo en la banda ámbar. */
  const rotarDesdeOriginal = useCallback(
    async (senso: 1 | -1) => {
      const original = originalRef.current;
      if (!original || reprocesando) return;
      const token = capturaTokenRef.current; // D-14: generación vigente
      setReprocesando(true);
      try {
        const originalRotado = await rotarImagenLibre(original, senso);
        if (!tokenVigente(token)) return;
        originalRef.current = originalRotado;
        const quadPrevio = senalesRef.current?.quad ?? null;
        const procesada = await procesarCaptura(originalRotado, {
          qrTexto: qrTextoRef.current,
          quadFijo: quadPrevio ? rotarQuad(quadPrevio, senso) : null,
        });
        if (!tokenVigente(token)) return;
        setImagen(procesada.imagenDataUrl);
        setSenales(procesada);
        senalesRef.current = procesada;
        setProcesandoRecorte(false);
        void ejecutarIdentificacion({
          imagen: procesada.imagenDataUrl,
          qr: qrTextoRef.current,
          senales: procesada,
          token,
        });
        void analizar(procesada.imagenDataUrl, qrTextoRef.current, token);
        void completarOcr(procesada.imagenDataUrl, token);
      } catch {
        setErrorRed("NO SE PUDO ROTAR LA IMAGEN · REINTENTE");
      } finally {
        setReprocesando(false);
      }
    },
    [reprocesando, ejecutarIdentificacion, analizar, completarOcr, tokenVigente]
  );

  // ---- D-22: callbacks ESTABLES para el memo de PantallaRevision ----
  // (sin esto, los arrows inline del render recreaban props en cada
  // re-render del padre y React.memo no impedía el re-pintado).
  const irAContingencia = useCallback(() => setScreen("contingencia"), []);
  const enviarAdvertencia = useCallback(() => {
    void enviarActa(true);
  }, [enviarActa]);
  const confirmarRecorteManual = useCallback(
    (q: QuadNormalizado) => {
      void confirmarRecorte(q);
    },
    [confirmarRecorte]
  );
  const rotarSenso = useCallback(
    (senso: 1 | -1) => {
      void rotarDesdeOriginal(senso);
    },
    [rotarDesdeOriginal]
  );
  const liberarRanura = useCallback(() => {
    // D-15: la ranura liberada puede desbloquear el guard →
    // re-corrida del identificador con las señales vigentes.
    const img = imagen;
    if (img) {
      void ejecutarIdentificacion({
        imagen: img,
        qr: qrTexto,
        senales: senalesRef.current,
      });
    }
  }, [imagen, qrTexto, ejecutarIdentificacion]);

  // ---------------- Envío manual (contingencia RF-1.3/RF-1.5) ----------------
  const enviarManual = useCallback(
    async (datos: DatosContingencia) => {
      setEnviando(true);
      setErrorRed(null);
      try {
        // FASE 1 (rol C): reemplazoDe viaja en el payload para que la
        // dedupe plana por QR del demo-store permita el REEMPLAZO que el
        // guard de ranuras ya validó (en modo completo /api ignora el
        // campo hasta que rol B lo adopte — [COORD] propuesto en worklog).
        const payload: PayloadIngesta = {
          imagenBase64: datos.imagenBase64,
          tipoEjemplar: datos.tipoEjemplar,
          pagina: datos.pagina,
          totalPaginas: 2,
          modoManual: true,
          datosManuales: datos.datosManuales,
          mesaIdRef: datos.mesaIdRef,
          barcode: datos.barcode,
          qrTexto: datos.barcode,
          reemplazoDe: datos.reemplazoDe,
        };

        const json = await apiIngestarActa(payload);

        if (!json.ok || !json.decision) {
          setErrorRed(ERROR_RED);
          return;
        }
        if (json.decision.estado === "RECHAZADO") {
          setErrorRed("EL SERVIDOR RECHAZÓ EL ACTA MANUAL · REVISE LOS DATOS");
          return;
        }

        let mesaLabel = "MESA ASIGNADA MANUALMENTE";
        let ctxManual: CapturaContexto | null = null;
        if (datos.mesaIdRef) {
          for (const c of consulados) {
            const m = c.mesas.find((mm) => mm.id === datos.mesaIdRef);
            if (m) {
              mesaLabel = m.mesaNumber;
              ctxManual = {
                mesa: m,
                consulado: c,
                tipoEjemplar: datos.tipoEjemplar,
                pagina: datos.pagina,
              };
              break;
            }
          }
        }
        if (ctxManual) setCtx(ctxManual);
        registrarEnvio(
          json,
          {
            mesaLabel,
            tipo: datos.tipoEjemplar,
            pagina: datos.pagina,
            pliego: datos.mesaIdRef
              ? pliegoKey(datos.mesaIdRef, datos.tipoEjemplar, datos.pagina)
              : undefined,
          },
          "MANUAL"
        );
      } catch {
        setErrorRed(ERROR_RED);
      } finally {
        setEnviando(false);
      }
    },
    [consulados, registrarEnvio]
  );

  // ---------------- FASE 1 (rol C): persistencia de la hoja aceptada ----------------
  /** El guard dijo ALMACENAR/REEMPLAZAR y el operador confirma la ranura */
  const confirmarRanura = useCallback(
    (estado: ActaEstado) => {
      if (!integracion || !imagen) return;
      const ranura = integracion.decision.ranura;
      if (!ranura) return;
      const loc = integracion.localizacion;
      // 1) Ranura local del guard (fuente de verdad cliente para re-escaneos)
      registrarHojaAceptada({
        ranura,
        huella: integracion.huella,
        estado,
        mesaIdRef: loc?.mesa.id ?? null,
      });
      // 2) Persistencia vía la ingesta manual existente (RF-1.5) apuntando a
      //    la mesa REAL identificada (aunque el operador esté en otro puesto).
      const datos: DatosContingencia & PayloadIngesta = {
        imagenBase64: imagen,
        tipoEjemplar: ranura.tipo,
        pagina: ranura.pagina,
        totalPaginas: 2,
        mesaIdRef: loc?.mesa.id,
        reemplazoDe:
          integracion.decision.accion === "REEMPLAZAR"
            ? claveDeRanura(ranura, loc?.mesa.id ?? null)
            : undefined,
      };
      void enviarManual(datos);
    },
    [integracion, imagen, enviarManual]
  );

  // ---------------- Sincronización de la cola offline ----------------
  // Drena la cola persistida en IndexedDB (hojas de fallos de red,
  // incluidas las de sesiones anteriores) y luego reintenta el
  // fallo en memoria de la sesión actual.
  const sincronizar = useCallback(async () => {
    setSincronizando(true);
    try {
      const cola = await hojasOffline();
      for (const hoja of cola) {
        try {
          const json = await apiIngestarActa({
            imagenBase64: hoja.imagen,
            tipoEjemplar: hoja.tipo,
            pagina: hoja.pagina,
            totalPaginas: 2,
            barcode: hoja.barcode ?? undefined,
            mesaIdRef: hoja.mesaIdRef ?? undefined,
            scoreCliente: hoja.scoreCliente ?? undefined,
            envioEmergencia: hoja.envioEmergencia,
            qrTexto: hoja.qrTexto ?? undefined,
          });
          if (json.ok) {
            await quitarHojaOffline(hoja.id);
          }
        } catch {
          // Sin red todavía: la hoja sigue en la cola
          break;
        }
      }
      setColaOffline(await contarHojasOffline());

      const fallo = falloRef.current;
      if (fallo) {
        falloRef.current = null;
        await enviarActa(false, fallo.analisis, fallo.imagen, fallo.ctx, fallo.qrTexto);
      }
      await cargarBootstrap(true);
    } finally {
      setSincronizando(false);
    }
  }, [enviarActa, cargarBootstrap]);

  const reintentosPliego = ctx
    ? reintentos[pliegoKey(ctx.mesa.id, ctx.tipoEjemplar, ctx.pagina)] ?? 0
    : 0;

  // ---------------- Render ----------------
  const vistaCompleta = modoDispositivo || pantallaCompleta;

  /** Banner de error de red compartido por ambas vistas */
  const bannerError = errorRed ? (
    <div
      role="alert"
      className="sticky top-0 z-30 bg-ind-secondary/10 border-b-2 border-ind-secondary/60 px-3 py-2 flex items-center gap-2 backdrop-blur-sm"
    >
      <WifiOff size={14} className="text-ind-secondary shrink-0" aria-hidden />
      <span className="label-caps text-[11px] text-ind-secondary">{errorRed}</span>
    </div>
  ) : null;

  /** Contenido: carga → selector de puesto (D-07) → pantallas del puesto */
  const contenido = cargandoBootstrap && !consulado ? (
    <div className="flex flex-col items-center justify-center min-h-[420px] gap-3 bg-ind-bg bg-scanline">
      <Loader2 size={28} className="animate-spin text-brand-500" aria-hidden />
      <span className="label-caps text-ind-on-surface-var">
        CARGANDO DATOS DEL PUESTO…
      </span>
    </div>
  ) : !consulado ? (
    consulados.length > 0 ? (
      <SelectorPuesto
        consulados={consulados}
        onSeleccionar={seleccionarPuesto}
      />
    ) : (
      <div className="flex flex-col items-center justify-center min-h-[420px] gap-3 p-6 text-center bg-ind-bg bg-scanline">
        <WifiOff size={28} className="text-ind-secondary" aria-hidden />
        <span className="display-industrial text-ind-secondary text-lg">
          SIN DATOS DEL PUESTO
        </span>
        <span className="text-body-md text-ind-on-surface-var">
          No se pudo cargar la lista de puestos consulares. Verifique la
          conexión.
        </span>
      </div>
    )
  ) : (
    <>
      {screen === "control" && (
        <PantallaControl
          consulado={consulado}
          mesaSel={mesaSel}
          cargando={cargandoBootstrap}
          onSelectMesa={setMesaSel}
          onCapturar={irACaptura}
          onEscanearLibre={irAEscanear}
          onResumen={() => setScreen("resumen")}
          onCambiarPuesto={cambiarPuesto}
        />
      )}

      {screen === "captura" && (
        <PantallaCaptura
          ctx={ctx}
          modoManual={modoManual}
          onToggleModoManual={() => setModoManual((v) => !v)}
          cargandoEjemplo={cargandoEjemplo}
          onUsarEjemplo={() => void usarActaEjemplo()}
          onCaptura={onCaptura}
          onVolver={() => setScreen("control")}
        />
      )}

      {screen === "revision" && imagen && (
        <PantallaRevision
          ctx={ctx}
          imagen={imagen}
          qrTexto={qrTexto}
          analisis={analisis}
          verificacion={verificacion}
          asignacion={asignacion}
          analizando={analizando}
          enviando={enviando}
          envioRechazado={envioRechazado}
          reintentosPliego={reintentosPliego}
          procesandoRecorte={procesandoRecorte}
          ocrBusy={ocrBusy}
          senales={senales}
          recorteFallo={Boolean(
            senales && !procesandoRecorte && !senales.recorteAplicado && !senales.fullFrame
          )}
          editorActivo={editorRecorte}
          imagenOriginal={originalRef.current}
          quadActual={senales?.quad ?? null}
          reprocesando={reprocesando}
          onAbrirEditor={abrirEditorRecorte}
          onConfirmarRecorte={confirmarRecorteManual}
          onCancelarEditor={cancelarEditorRecorte}
          onVolver={irAEscanear}
          onReintentarFoto={reintentarFoto}
          onRotar={rotarSenso}
          onContingencia={irAContingencia}
          onEnviarAdvertencia={enviarAdvertencia}
          integracion={integracion}
          identificando={identificando}
          onIdentificarManual={identificarConCodigoManual}
          onConfirmarValidacion={() => confirmarRanura("VALIDADO")}
          onRegistrarEnCola={() => confirmarRanura("EN_COLA")}
          autoPendiente={pendienteAuto != null}
          onRanuraLiberada={liberarRanura}
        />
      )}

      {screen === "exito" && exito && (
        <PantallaExito
          exito={exito}
          ctx={ctx}
          onSeguirEscaneando={irAEscanear}
          onVerResumen={() => setScreen("resumen")}
        />
      )}

      {screen === "contingencia" && (
        <PantallaContingencia
          imagen={imagen}
          consulados={consulados}
          enviando={enviando}
          onRepetir={irAEscanear}
          onVolver={() => setScreen("control")}
          onEnviarManual={(d) => void enviarManual(d)}
        />
      )}

      {screen === "resumen" && (
        <PantallaResumen
          stats={stats}
          historial={historial}
          consulado={consulado}
          sincronizando={sincronizando}
          colaOffline={colaOffline}
          onSincronizar={() => void sincronizar()}
        />
      )}
    </>
  );

  // D-06 · MODO DISPOSITIVO REAL (o escritorio a pantalla completa):
  // viewport completo h-[100dvh], SIN PhoneFrame, sin notch falso, sin
  // botón del supervisor ni rótulo de simulación. La top bar y la
  // BottomNav respetan los safe-areas del dispositivo (env(safe-area-*)).
  if (vistaCompleta) {
    return (
      <div className="pwa-e14 h-[100dvh] w-full flex flex-col overflow-hidden bg-ind-bg bg-scanline">
        {/* Top bar propia con safe-area superior */}
        <div
          className="shrink-0 bg-ind-lowest border-b border-ind-outline-variant"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="h-9 px-3 flex items-center justify-between gap-2">
            <span className="label-caps text-[10px] text-brand-500 tracking-wider uppercase shrink-0">
              DIGIELECT · E-14
            </span>
            <span className="data-mono text-[10px] text-ind-on-surface-var uppercase truncate text-right">
              {consulado?.puesto ?? "SELECCIONE PUESTO"}
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-ind-bg">
          {bannerError}
          {contenido}
        </div>

        {/* BottomNav con safe-area inferior (home indicator real) */}
        <div
          className="shrink-0 bg-ind-lowest"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <BottomNav
            activo={tabDePantalla(screen)}
            onEscanear={irAEscanear}
            onActas={() => setScreen("control")}
            onResumen={() => setScreen("resumen")}
          />
        </div>
      </div>
    );
  }

  // MODO ESCRITORIO (simulación para la demo del supervisor): la maqueta
  // del teléfono sigue intacta + botón PANTALLA COMPLETA (D-06).
  return (
    <div className="pwa-e14 min-h-screen w-full flex flex-col items-center justify-center gap-4 py-6 px-4 overflow-x-hidden bg-gradient-to-b from-ind-lowest via-ind-bg to-ind-lowest bg-scanline">
      {/* ---- Controles superiores (fuera del teléfono) ---- */}
      <div className="w-full max-w-[390px] flex flex-col gap-2">
        <button
          type="button"
          onClick={onExit}
          className="h-11 px-4 border border-ind-outline-variant bg-ind-container text-ind-on-surface
            hover:border-brand-500/60 hover:text-brand-500 label-caps text-[11px] uppercase
            flex items-center gap-2 rounded-sm transition-colors min-h-[44px]"
          aria-label="Volver al panel del supervisor"
        >
          <ArrowLeft size={14} aria-hidden />
          VOLVER AL PANEL DEL SUPERVISOR
        </button>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 label-caps text-[10px] text-ind-on-surface-var uppercase tracking-wider min-w-0">
            <Smartphone size={12} aria-hidden />
            SIMULACIÓN PWA DIGITALIZADOR · SIN CONTRASEÑA · AUTO-ENVÍO POR SCORE
          </span>
          <button
            type="button"
            onClick={alternarPantallaCompleta}
            title={avisoFullscreen ?? "PANTALLA COMPLETA"}
            aria-label={avisoFullscreen ?? "Pantalla completa"}
            className="shrink-0 h-8 px-2 border border-ind-outline-variant bg-ind-container text-ind-on-surface-var
              hover:border-brand-500/60 hover:text-brand-500 label-caps text-[10px] uppercase
              flex items-center gap-1 rounded-sm transition-colors"
          >
            <Maximize size={12} aria-hidden />
            PANTALLA COMPLETA
          </button>
        </div>
        {avisoFullscreen && (
          <span
            role="status"
            className="label-caps text-[9px] text-ind-secondary uppercase tracking-wider"
          >
            {avisoFullscreen}
          </span>
        )}
      </div>

      {/* ---- Teléfono ---- */}
      <PhoneFrame
        bottomNav={
          <BottomNav
            activo={tabDePantalla(screen)}
            onEscanear={irAEscanear}
            onActas={() => setScreen("control")}
            onResumen={() => setScreen("resumen")}
          />
        }
      >
        {bannerError}
        {contenido}
      </PhoneFrame>
    </div>
  );
};
