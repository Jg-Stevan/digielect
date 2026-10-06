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
import { ArrowLeft, Loader2, Smartphone, WifiOff } from "lucide-react";
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
import { procesarCaptura } from "@/lib/scanner/pipeline";
import { leerSenalesOcr } from "@/lib/scanner/ocr-local";
import type { CapturaProcesada } from "@/lib/types";
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
  rotarImagen90,
  siguientePagina,
  urlActaEjemplo,
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
  useEffect(() => {
    qrTextoRef.current = qrTexto;
  }, [qrTexto]);

  // ---------------- Varios ----------------
  const [cargandoEjemplo, setCargandoEjemplo] = useState(false);
  const [ejemploIdx, setEjemploIdx] = useState(0);
  const [now, setNow] = useState<Date>(() => new Date());
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

  // Reintentos de red (cola offline simulada)
  const falloRef = useRef<{
    analisis: ActaAnalysis;
    imagen: string;
    ctx: CapturaContexto;
    qrTexto: string | null;
  } | null>(null);

  // ---------------- Reloj en vivo ----------------
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
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
  const ejecutarIdentificacion = useCallback(
    (params: {
      imagen: string;
      qr: string | null;
      codigoManual?: string | null;
      encabezado?: EncabezadoLeido | null;
      respaldoVlm?: { pagina?: 1 | 2 | null; tipo?: TipoEjemplar | null } | null;
      /** Rol A · señales crudas del pipeline (barcode15, calidad, OCR local) */
      senales?: CapturaProcesada | null;
    }) => {
      idChainRef.current = idChainRef.current.then(async () => {
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
    [ctx, consulados, calidadDeImagen]
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
        setConsulado((prev) => {
          const roma =
            json.consulados?.find(
              (c) => /ROMA - CONSULADO$/i.test(c.puesto) && c.numMesas >= 8
            ) ?? null;
          const id = prev?.id ?? roma?.id ?? json.consulados?.[0]?.id;
          return (
            json.consulados?.find((c) => c.id === id) ??
            roma ??
            json.consulados?.[0] ??
            null
          );
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
            hora: horaEnZona(new Date(), "Europe/Rome"),
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
    async (imagenParam?: string, qrTextoParam?: string | null) => {
      const img = imagenParam ?? imagen;
      const qr = qrTextoParam ?? qrTexto;
      if (!img) return;
      setAnalizando(true);
      setErrorRed(null);
      try {
        const json = await apiAnalizarActa(img, qr ?? undefined);
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
    [imagen, qrTexto, ctx, resolverCtx, enviarActa, ejecutarIdentificacion]
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
    async (imagenDataUrl: string) => {
      ocrBusyRef.current = true;
      setOcrBusy(true);
      try {
        const ocr = await leerSenalesOcr(imagenDataUrl);
        if (ocr) {
          const prev = senalesRef.current;
          const actualizadas: CapturaProcesada | null = prev
            ? {
                ...prev,
                textoSuperior: ocr.textoSuperior,
                codigoXCrudo: ocr.codigoXCrudo,
                encabezadoCrudo: ocr.encabezadoCrudo,
              }
            : // Pipeline degradado (sin recorte): señales parciales sobre
              // la imagen provisional; la calidad la aproxima el cliente.
              {
                imagenDataUrl,
                calidad: (await calidadDeImagen(imagenDataUrl)) ?? {
                  nitidez: 0,
                  contraste: 0,
                  brillo: 0,
                },
                textoSuperior: ocr.textoSuperior,
                codigoXCrudo: ocr.codigoXCrudo,
                encabezadoCrudo: ocr.encabezadoCrudo,
              };
          senalesRef.current = actualizadas;
          setSenales(actualizadas);
          void ejecutarIdentificacion({
            imagen: actualizadas.imagenDataUrl,
            qr: qrTextoRef.current,
            senales: actualizadas,
          });
        }
      } finally {
        ocrBusyRef.current = false;
        setOcrBusy(false);
      }
    },
    [ejecutarIdentificacion, calidadDeImagen]
  );

  /** Pipeline del escáner (rol A) + análisis VLM, tras abrir Revisión */
  const procesarYAnalizar = useCallback(
    async (dataUrl: string, qr: string | null) => {
      let finalDataUrl = dataUrl;
      let procesada: CapturaProcesada | null = null;
      try {
        procesada = await procesarCaptura(dataUrl, { qrTexto: qr });
        finalDataUrl = procesada.imagenDataUrl;
        setImagen(finalDataUrl);
        setSenales(procesada);
        senalesRef.current = procesada;
      } catch {
        // Respaldo honesto: la imagen provisional ya está en pantalla
        // y el flujo de análisis continúa con ella.
      }
      setProcesandoRecorte(false);
      // FASE 1 (rol C) × rol A: la identificación corre sobre la imagen
      // PROCESADA con las señales reales del pipeline (barcode15 + calidad
      // del worker); cuando el OCR local aterrice (completarOcr) se
      // re-ejecuta con el código X y el encabezado DIVIPOL leídos.
      void ejecutarIdentificacion({ imagen: finalDataUrl, qr, senales: procesada });
      void analizar(finalDataUrl, qr);
      if (finalDataUrl) void completarOcr(finalDataUrl);
    },
    [analizar, completarOcr, ejecutarIdentificacion]
  );

  const onCaptura = useCallback(
    (dataUrl: string, qrTextoCapturado: string | null) => {
      setImagen(dataUrl);
      setQrTexto(qrTextoCapturado);
      setSenales(null);
      setAnalisis(null);
      setVerificacion(null);
      setAsignacion(null);
      setErrorRed(null);
      resetIdentificacion();
      if (modoManual) {
        // Modo manual (diseño): foto de respaldo → asignación manual
        setScreen("contingencia");
        return;
      }
      // F-DEFER-CROP: Revisión abre YA; el recorte automático
      // aterriza en segundo plano y luego corre el análisis.
      setProcesandoRecorte(true);
      setScreen("revision");
      void procesarYAnalizar(dataUrl, qrTextoCapturado);
    },
    [modoManual, procesarYAnalizar]
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
    (tipo: TipoEjemplar) => {
      if (!consulado || !mesaSel) return;
      const mesa = consulado.mesas.find((m) => m.id === mesaSel);
      if (!mesa) return;
      setCtx({ mesa, consulado, tipoEjemplar: tipo, pagina: siguientePagina(mesa, tipo) });
      setImagen(null);
      setAnalisis(null);
      setQrTexto(null);
      setSenales(null);
      senalesRef.current = null;
      setProcesandoRecorte(false);
      setOcrBusy(false);
      ocrBusyRef.current = false;
      resetIdentificacion();
      setScreen("captura");
    },
    [consulado, mesaSel, resetIdentificacion]
  );

  /** ESCANEAR libre: el QR del acta asigna la mesa automáticamente */
  const irAEscanear = useCallback(() => {
    if (screen === "captura") return;
    setImagen(null);
    setAnalisis(null);
    setQrTexto(null);
    setVerificacion(null);
    setAsignacion(null);
    setSenales(null);
    senalesRef.current = null;
    setProcesandoRecorte(false);
    setOcrBusy(false);
    ocrBusyRef.current = false;
    resetIdentificacion();
    setScreen("captura");
  }, [screen, resetIdentificacion]);

  // ---------------- Reintentos (RN-02 / RN-03) ----------------
  const reintentarFoto = useCallback(() => {
    if (ctx) {
      const key = pliegoKey(ctx.mesa.id, ctx.tipoEjemplar, ctx.pagina);
      setReintentos((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
    }
    setStats((prev) => ({ ...prev, rechazos: prev.rechazos + 1 }));
    setImagen(null);
    setAnalisis(null);
    setQrTexto(null);
    setVerificacion(null);
    setAsignacion(null);
    setSenales(null);
    senalesRef.current = null;
    setProcesandoRecorte(false);
    setOcrBusy(false);
    ocrBusyRef.current = false;
    resetIdentificacion();
    setScreen("captura");
  }, [ctx, resetIdentificacion]);

  const rotar = useCallback(async () => {
    if (!imagen) return;
    const rotada = await rotarImagen90(imagen);
    setImagen(rotada);
  }, [imagen]);

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
  const sincronizar = useCallback(async () => {
    const fallo = falloRef.current;
    if (fallo) {
      falloRef.current = null;
      setColaOffline(0);
      await enviarActa(false, fallo.analisis, fallo.imagen, fallo.ctx, fallo.qrTexto);
      return;
    }
    await cargarBootstrap(true);
  }, [enviarActa, cargarBootstrap]);

  const reintentosPliego = ctx
    ? reintentos[pliegoKey(ctx.mesa.id, ctx.tipoEjemplar, ctx.pagina)] ?? 0
    : 0;

  // ---------------- Render ----------------
  return (
    <div className="pwa-e14 min-h-screen w-full flex flex-col items-center justify-center gap-4 py-6 px-4 overflow-x-hidden bg-gradient-to-b from-surface-container-lowest via-surface-dim to-surface-container-lowest">
      {/* ---- Controles superiores (fuera del teléfono) ---- */}
      <div className="w-full max-w-[390px] flex flex-col gap-2">
        <button
          type="button"
          onClick={onExit}
          className="h-11 px-4 border border-outline-variant bg-surface-container text-on-surface
            hover:border-primary/60 hover:text-primary font-label-caps text-label-caps uppercase
            flex items-center gap-2 rounded-sm transition-colors min-h-[44px]"
          aria-label="Volver al panel del supervisor"
        >
          <ArrowLeft size={14} aria-hidden />
          VOLVER AL PANEL DEL SUPERVISOR
        </button>
        <span className="flex items-center gap-1.5 font-label-caps text-[10px] text-on-surface-variant uppercase tracking-wider">
          <Smartphone size={12} aria-hidden />
          SIMULACIÓN PWA DIGITALIZADOR · SIN CONTRASEÑA · AUTO-ENVÍO POR SCORE
        </span>
      </div>

      {/* ---- Teléfono ---- */}
      <PhoneFrame
        now={now}
        bottomNav={
          <BottomNav
            activo={tabDePantalla(screen)}
            onEscanear={irAEscanear}
            onActas={() => setScreen("control")}
            onResumen={() => setScreen("resumen")}
          />
        }
      >
        {/* Banner de error de red (cola offline / RN) */}
        {errorRed && (
          <div
            role="alert"
            className="sticky top-0 z-30 bg-error/15 border-b-2 border-error/60 px-3 py-2 flex items-center gap-2 backdrop-blur-sm"
          >
            <WifiOff size={14} className="text-error shrink-0" aria-hidden />
            <span className="font-label-caps text-[11px] text-error">{errorRed}</span>
          </div>
        )}

        {/* Pantalla de carga inicial del puesto */}
        {cargandoBootstrap && !consulado ? (
          <div className="flex flex-col items-center justify-center min-h-[420px] gap-3">
            <Loader2 size={28} className="animate-spin text-primary" aria-hidden />
            <span className="font-label-caps text-label-caps text-on-surface-variant">
              CARGANDO PUESTO · CONSULADO ROMA...
            </span>
          </div>
        ) : !consulado ? (
          <div className="flex flex-col items-center justify-center min-h-[420px] gap-3 p-6 text-center">
            <WifiOff size={28} className="text-error" aria-hidden />
            <span className="font-headline-md text-headline-md text-error">
              SIN DATOS DEL PUESTO
            </span>
            <span className="text-body-md text-on-surface-variant">
              No se pudo cargar el consulado asignado. Verifique la conexión.
            </span>
          </div>
        ) : (
          <>
            {screen === "control" && (
              <PantallaControl
                consulado={consulado}
                now={now}
                mesaSel={mesaSel}
                cargando={cargandoBootstrap}
                onSelectMesa={setMesaSel}
                onCapturar={irACaptura}
                onEscanearLibre={irAEscanear}
                onResumen={() => setScreen("resumen")}
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
                onVolver={irAEscanear}
                onReintentarFoto={reintentarFoto}
                onRotar={() => void rotar()}
                onContingencia={() => setScreen("contingencia")}
                onEnviarAdvertencia={() => void enviarActa(true)}
                integracion={integracion}
                identificando={identificando}
                onIdentificarManual={identificarConCodigoManual}
                onConfirmarValidacion={() => confirmarRanura("VALIDADO")}
                onRegistrarEnCola={() => confirmarRanura("EN_COLA")}
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
                now={now}
                sincronizando={sincronizando}
                colaOffline={colaOffline}
                onSincronizar={() => void sincronizar()}
              />
            )}
          </>
        )}
      </PhoneFrame>
    </div>
  );
};
