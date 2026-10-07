/**
 * opencv-4.5.5.js — puente de compatibilidad para el DetectionWorker.
 *
 * El worker del usuario (dist/detection-worker.js, INTACTO) configura el
 * callback de arranque con el patrón del build oficial de docs.opencv.org:
 *
 *     self.Module = self.Module ?? {};
 *     self.Module.onRuntimeInitialized = () => { ...post 'ready'... };
 *     importScripts("../../vendor/opencv-4.5.5.js");
 *
 * El build self-hosted (npm @techstark/opencv-js@4.5.5-release.2 →
 * opencv-4.5.5-core.js) es un build MODULARIZADO de emscripten: expone
 * `cv = factory()` con `cv.then(...)` y NO lee el `self.Module` global
 * preexistente — sin este puente, 'ready' nunca llegaría.
 *
 * El puente carga el core y conecta el callback del worker al runtime real:
 *   - con cv.then(...)  → modularizado: then() envuelve onRuntimeInitialized
 *   - sin cv.then       → build clásico: asigna y envuelve el previo
 *
 * La URL del core NO puede ser absoluta: GitHub Pages sirve el repo bajo
 * /web-scanner/ y una ruta "/vendor/…" apuntaría fuera del sitio (404).
 * Como importScripts anidado resuelve contra la URL base del worker
 * (/scanner/…), se calcula dinámicamente desde self.location:
 *   · servidor en raíz → /vendor/opencv-4.5.5-core.js
 *   · GitHub Pages     → /web-scanner/vendor/opencv-4.5.5-core.js
 */
"use strict";

var OPENCV_CORE_URL = new URL("../vendor/opencv-4.5.5-core.js", self.location.href).href;
importScripts(OPENCV_CORE_URL);

(function () {
  /** @type {any} */
  var target = typeof self.cv === "object" && self.cv !== null ? self.cv : null;
  var pending =
    self.Module && typeof self.Module.onRuntimeInitialized === "function"
      ? self.Module.onRuntimeInitialized
      : null;
  if (!target || !pending) return; // nada que puentear (build clásico ya avisó)

  if (typeof target.then === "function") {
    // Build modularizado: then(func) dispara cuando el runtime WASM queda
    // inicializado (o inmediatamente si ya corrió — calledRun).
    target.then(function () {
      try { pending(); } catch (e) { /* nunca romper el arranque */ }
    });
  } else if (target.onRuntimeInitialized !== pending) {
    // Build clásico sin self.Module global: envuelve y llama.
    var prev = target.onRuntimeInitialized;
    target.onRuntimeInitialized = function () {
      if (typeof prev === "function" && prev !== pending) prev();
      pending();
    };
  }
})();
