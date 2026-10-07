"use client";

// ============================================================
// DIGIELECT · TAREA 5 (PLAN_DIGIELECT_DIGITALIZADOR.md) · C-17
// Feedback sonoro y háptico inmediato del escaneo (§ TAREA 5.2:
// "Feedback sonoro y háptico al detectar el código entre las X").
// WebAudio puro: sin assets ni dependencias; funciona offline.
// ============================================================

let ctxAudio: AudioContext | null = null;

function contexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctxAudio) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      ctxAudio = new AC();
    }
    if (ctxAudio.state === "suspended") void ctxAudio.resume();
    return ctxAudio;
  } catch {
    return null;
  }
}

/** Tono corto puro (oscilador + envolvente, sin assets) */
function tono(
  freq: number,
  durMs: number,
  tipo: OscillatorType = "sine",
  volumen = 0.14
): void {
  const ctx = contexto();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tipo;
    osc.frequency.value = freq;
    const t0 = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volumen, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durMs / 1000 + 0.02);
  } catch {
    /* audio bloqueado por el navegador: silencio, sigue el flujo */
  }
}

/** Beep de confirmación: código X detectado / identificación EXACTA */
export function beepExito(): void {
  tono(1046.5, 90); // C6
  setTimeout(() => tono(1568, 110), 95); // G6 — doble tono ascendente
}

/** Beep suave de aviso (cola encolada, anomalía recuperable) */
export function beepAviso(): void {
  tono(880, 140, "triangle");
}

/** Beep de error (anomalía de cruce, rechazo) */
export function beepError(): void {
  tono(329.6, 160, "square", 0.1); // E4 grave
  setTimeout(() => tono(246.9, 200, "square", 0.1), 165);
}

/** Vibración háptica (tolerante a dispositivos sin motor) */
export function vibrar(ms: number | number[]): void {
  if (typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* noop */
  }
}

/** Confirmación completa del escaneo: beep + pulso corto */
export function feedbackEscaneoOk(): void {
  beepExito();
  vibrar([40, 60, 40]);
}

/** Anomalía: error sonoro + vibración larga */
export function feedbackAnomalia(): void {
  beepError();
  vibrar([120, 80, 120]);
}
