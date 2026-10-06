// ============================================================
// DIGIELECT · Worker de procesamiento BATCH (FASE 4 · rol B)
// ------------------------------------------------------------
// Procesa UNA imagen de acta POR COMPLETO EN EL DISPOSITIVO
// (filosofía del proyecto: el servidor no recibe imágenes crudas
// para procesar):
//
//   1. Decodifica el dataURL (createImageBitmap)
//   2. Miniatura gris 256px → Laplaciano + histograma → calidad
//      (puerto del motor validado del web-scanner/e14 quality)
//   3. Re-comprime a JPEG ~1600px / 0.85 (objetivo < 200 KB)
//   4. Devuelve métricas + imagen comprimida + duración
//
// Si el navegador del operador no soporta OffscreenCanvas /
// createImageBitmap, responde { ok:false, razon:'sin-soporte' }
// y el hilo principal hace el mismo trabajo con <canvas>.
// ============================================================

/* eslint-disable no-restricted-globals */

// Constantes del motor original (src/lib/e14/quality.ts)
var SHARPNESS_NORM = 140;
var BLUR_THRESHOLD = 45;
var UNDER_EXPOSED_PX = 30;
var OVER_EXPOSED_PX = 225;
var SPECULAR_PX = 248;
var SPECULAR_RATIO_WARN = 0.03;
var THUMB = 256;
var LADO_MAX_COMPRIMIDO = 1600;
var CALIDAD_JPEG = 0.85;

function miniaturaGris(bitmap) {
  var escala = Math.min(1, THUMB / Math.max(bitmap.width, bitmap.height));
  var w = Math.max(1, Math.round(bitmap.width * escala));
  var h = Math.max(1, Math.round(bitmap.height * escala));
  var canvas = new OffscreenCanvas(w, h);
  var ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);
  var data = ctx.getImageData(0, 0, w, h).data;
  return { data: data, w: w, h: h };
}

function evaluarCalidad(bitmap) {
  var mini = miniaturaGris(bitmap);
  var data = mini.data;
  var canvasW = mini.w;
  var canvasH = mini.h;

  // Escala de grises (índices enteros exactos del canvas)
  var gris = new Float32Array(canvasW * canvasH);
  for (var i = 0; i < canvasW * canvasH; i++) {
    gris[i] =
      0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  // Laplaciano 3x3 (varianza = nitidez)
  var suma = 0;
  var suma2 = 0;
  var n = 0;
  for (var y = 1; y < canvasH - 1; y++) {
    for (var x = 1; x < canvasW - 1; x++) {
      var idx = y * canvasW + x;
      var lap =
        4 * gris[idx] -
        gris[idx - 1] -
        gris[idx + 1] -
        gris[idx - canvasW] -
        gris[idx + canvasW];
      suma += lap;
      suma2 += lap * lap;
      n++;
    }
  }
  var nitidezVar = n > 0 ? suma2 / n - (suma / n) * (suma / n) : 0;

  // Histograma de exposición
  var sub = 0;
  var sobre = 0;
  var especular = 0;
  var total = gris.length;
  for (var j = 0; j < total; j++) {
    var v = gris[j];
    if (v < UNDER_EXPOSED_PX) sub++;
    else if (v > SPECULAR_PX) especular++;
    else if (v > OVER_EXPOSED_PX) sobre++;
  }
  var fracSub = sub / total;
  var fracSobre = sobre / total;
  var fracEspecular = especular / total;

  var nitidez = Math.max(0, Math.min(1, nitidezVar / SHARPNESS_NORM));
  var exposicion = Math.max(
    0,
    Math.min(1, 1 - (fracSub * 1.4 + fracSobre * 1.2 + fracEspecular * 2))
  );
  var compuesto = 0.5 * nitidez + 0.5 * exposicion;
  var score = Math.max(0, Math.min(10, Math.round(compuesto * 10)));

  var problemas = [];
  if (nitidezVar < BLUR_THRESHOLD) problemas.push("desenfoque");
  if (fracSub > 0.25) problemas.push("poca luz");
  if (fracSobre > 0.25) problemas.push("sobreexposicion");
  if (fracEspecular > SPECULAR_RATIO_WARN) problemas.push("sombra");

  return {
    score: score,
    nitidezVar: nitidezVar,
    nitidez: nitidez,
    exposicion: exposicion,
    especular: fracEspecular,
    problemas: problemas,
  };
}

/** Re-comprime el bitmap a JPEG (lado máximo 1600px, calidad 0.85) */
async function comprimir(bitmap) {
  var escala = Math.min(
    1,
    LADO_MAX_COMPRIMIDO / Math.max(bitmap.width, bitmap.height)
  );
  var w = Math.max(1, Math.round(bitmap.width * escala));
  var h = Math.max(1, Math.round(bitmap.height * escala));
  var canvas = new OffscreenCanvas(w, h);
  var ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  var blob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: CALIDAD_JPEG,
  });
  // Blob → dataURL con FileReaderSync (disponible en workers)
  var fr = new FileReaderSync();
  return { dataUrl: fr.readAsDataURL(blob), ancho: w, alto: h };
}

self.onmessage = async function (ev) {
  var msg = ev.data || {};
  var id = msg.id;
  var t0 = Date.now();
  try {
    if (
      typeof createImageBitmap !== "function" ||
      typeof OffscreenCanvas === "undefined"
    ) {
      self.postMessage({ ok: false, id: id, razon: "sin-soporte" });
      return;
    }
    // dataURL → blob → bitmap
    var res = await fetch(msg.imagen);
    var blob = await res.blob();
    var bitmap = await createImageBitmap(blob);
    var calidad = evaluarCalidad(bitmap);
    var comp = await comprimir(bitmap);
    var anchoOriginal = bitmap.width;
    var bytesOriginales = blob.size;
    bitmap.close();
    self.postMessage({
      ok: true,
      id: id,
      calidad: calidad,
      imagenDataUrl: comp.dataUrl,
      anchoOriginal: anchoOriginal,
      ancho: comp.ancho,
      alto: comp.alto,
      bytesOriginales: bytesOriginales,
      durMs: Date.now() - t0,
    });
  } catch (e) {
    self.postMessage({
      ok: false,
      id: id,
      razon: "error",
      detalle: String(e && e.message ? e.message : e),
      durMs: Date.now() - t0,
    });
  }
};
