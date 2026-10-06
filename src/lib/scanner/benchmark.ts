// ============================================================
// DIGIELECT · Benchmark del dispositivo (rol A)
// Puerto del benchmark de web-scanner (v6.1): decide el tope de
// procesado del lado largo. La CALIDAD NUNCA se sacrifica
// (regla del producto): el cap solo limita cuánto se baja la
// imagen antes de procesar, nunca se sube por encima de la
// resolución fuente (sin upscale = sin nitidez inventada).
//   · gama baja  → 3200 px (antes 2560 en web-scanner; se subió
//     para proteger la legibilidad del código entre X)
//   · gama media/alta → 4032 px (resolución plena del sensor)
// Si una captura tarda demasiado en un dispositivo "alto", se
// degrada persistentemente a 3200 (localStorage).
// ============================================================

const KEY_CAP_FORZADO = "e14-cap-procesado-forzado";
const UMBRAL_LENTO_MS = 4500;
const UMBRAL_LENTO_VECES = 2;

export type ClaseDispositivo = "baja" | "media" | "alta";

interface NavigatorConMemoria extends Navigator {
  deviceMemory?: number;
}

/** Clase aproximada del dispositivo (sin permisos ni APIs raras) */
export function claseDispositivo(): ClaseDispositivo {
  if (typeof navigator === "undefined") return "media";
  const nav = navigator as NavigatorConMemoria;
  const memoria = nav.deviceMemory;
  const nucleos = nav.hardwareConcurrency ?? 4;
  if ((memoria !== undefined && memoria <= 4) || nucleos <= 4) return "baja";
  if (memoria !== undefined && memoria <= 6) return "media";
  return "media";
}

/** Tope del lado largo para el procesado de capturas */
export function capProcesado(): number {
  if (typeof window !== "undefined") {
    try {
      if (window.localStorage.getItem(KEY_CAP_FORZADO) === "3200") return 3200;
    } catch {
      /* localStorage puede estar bloqueado: seguir con el default */
    }
  }
  return claseDispositivo() === "baja" ? 3200 : 4032;
}

/** Contador de capturas lentas para degradar el cap de forma persistente */
let lentas = 0;

/** Registrar cuánto tardó el pipeline completo de una captura */
export function registrarTiempoProcesado(ms: number): void {
  if (ms <= UMBRAL_LENTO_MS) {
    lentas = 0;
    return;
  }
  lentas++;
  if (lentas >= UMBRAL_LENTO_VECES) {
    try {
      window.localStorage.setItem(KEY_CAP_FORZADO, "3200");
    } catch {
      /* sin persistencia: la degradación vale solo por la sesión */
    }
  }
}
