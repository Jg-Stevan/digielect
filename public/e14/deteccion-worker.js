// ============================================================
// DIGIELECT · WORKER DE ESCÁNER (rol A) — puerto del motor de
// web-scanner (Jg-Stevan/web-scanner v6.2) adaptado al flujo
// E-14. Archivo plano y autocontenido: se sirve desde /public
// y se carga con withBasePath("/e14/deteccion-worker.js") para
// funcionar igual en dev, en el modo standalone y en la demo
// estática de GitHub Pages (basePath /digielect).
//
// Operaciones (todas OFF del hilo principal):
//  · detectar  — cuadrilátero del acta en un frame reducido:
//      gris → Sobel → mapa binario → proyecciones por fila/columna
//      (banda central) → ajuste de rectas por mínimos cuadrados →
//      intersecciones → validación (área, convexidad, lados).
//      Devuelve coordenadas NORMALIZADAS 0-1 ([TL,TR,BR,BL]).
//  · procesar  — pipeline pesado de captura (F-RES-PRIORITY):
//      warp de perspectiva por homografía (muestreo bilineal,
//      SIN escalado ascendente: nunca inventar nitidez) →
//      métricas de calidad (Laplaciano/contraste/brillo sobre el
//      gris ANTES de binarizar) → filtro B/N ADAPTATIVO
//      (Bradley/Wellner con imagen integral: EL filtro para
//      actas — maximiza el OCR del código entre X y del barcode).
//
// Regla sagrada heredada de web-scanner: NUNCA sacrificar la
// capacidad de leer bien la imagen y reconocer el texto. El warp
// no amplía más allá de la resolución fuente y el B/N es
// adaptativo local (no un umbral global que mata el papel).
// ============================================================

/** Convierte RGBA a gris (Rec. 601, igual que quality.ts) */
function aGris(rgba, n) {
  const gris = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    gris[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) | 0;
  }
  return gris;
}

// ------------------------------------------------------------
// DETECCIÓN DE CUADRILÁTERO
// ------------------------------------------------------------

/**
 * Detecta el acta dentro del frame. Entrada RGBA reducida
 * (~320px de lado). Devuelve [{x,y}×4] normalizado o null.
 */
function detectarCuadrilatero(rgba, w, h) {
  if (w < 40 || h < 40) return null;
  const n = w * h;
  const gris = aGris(rgba, n);

  // --- Sobel (magnitud) ---
  const mag = new Float32Array(n);
  let sumaMag = 0;
  let sumaMag2 = 0;
  let m = 0;
  for (let y = 1; y < h - 1; y++) {
    const fila = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = fila + x;
      const gx =
        -gris[i - w - 1] - 2 * gris[i - 1] - gris[i + w - 1] +
        gris[i - w + 1] + 2 * gris[i + 1] + gris[i + w + 1];
      const gy =
        -gris[i - w - 1] - 2 * gris[i - w] - gris[i - w + 1] +
        gris[i + w - 1] + 2 * gris[i + w] + gris[i + w + 1];
      const v = Math.sqrt(gx * gx + gy * gy);
      mag[i] = v;
      sumaMag += v;
      sumaMag2 += v * v;
      m++;
    }
  }
  if (m === 0) return null;
  const media = sumaMag / m;
  const desv = Math.sqrt(Math.max(0, sumaMag2 / m - media * media));
  const umbral = media + 1.1 * desv;

  // --- Mapa binario de bordes ---
  const bin = new Uint8Array(n);
  for (let i = 0; i < n; i++) bin[i] = mag[i] > umbral ? 1 : 0;

  // --- Proyecciones con banda central (evita el fondo de la mesa) ---
  const cx0 = Math.round(w * 0.18);
  const cx1 = Math.round(w * 0.82);
  const cy0 = Math.round(h * 0.15);
  const cy1 = Math.round(h * 0.85);

  const rowScore = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let c = 0;
    const fila = y * w;
    for (let x = cx0; x < cx1; x++) c += bin[fila + x];
    rowScore[y] = c;
  }
  const colScore = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let c = 0;
    for (let y = cy0; y < cy1; y++) c += bin[y * w + x];
    colScore[x] = c;
  }

  const rTop0 = Math.round(h * 0.03);
  const rTop1 = Math.round(h * 0.45);
  const rBot0 = Math.round(h * 0.55);
  const rBot1 = Math.round(h * 0.97);
  const cLeft0 = Math.round(w * 0.03);
  const cLeft1 = Math.round(w * 0.45);
  const cRight0 = Math.round(w * 0.55);
  const cRight1 = Math.round(w * 0.97);

  const yTop = argmax(rowScore, rTop0, rTop1);
  const yBot = argmax(rowScore, rBot0, rBot1);
  const xLeft = argmax(colScore, cLeft0, cLeft1);
  const xRight = argmax(colScore, cRight0, cRight1);
  if (yTop < 0 || yBot < 0 || xLeft < 0 || xRight < 0) return null;

  // Las 4 líneas deben ser bordes largos y creíbles (≥ 32% de la
  // banda central: una tira vertical de acta en un frame horizontal
  // cubre ~38%; líneas de textura aleatoria mucho menos). Las líneas
  // que pasan siguen verificadas por el contraste papel↔fondo.
  const anchoCentral = cx1 - cx0;
  const altoCentral = cy1 - cy0;
  const minFila = anchoCentral * 0.32;
  const minCol = altoCentral * 0.32;
  if (
    rowScore[yTop] < minFila || rowScore[yBot] < minFila ||
    colScore[xLeft] < minCol || colScore[xRight] < minCol
  ) {
    return null;
  }

  // --- Verificación de franjas exteriores (anti líneas internas) ---
  // El acta tiene tablas con bordes internos MUY fuertes que pueden
  // ganarle a la proyección. Un borde de PAPEL real separa papel
  // claro (dentro) de fondo oscuro/mesa (fuera). Una línea interna
  // del formulario tiene papel claro a AMBOS lados → descartada.
  // En escaneos (el formulario ya llena la imagen) todas las líneas
  // son "internas" → sin recorte: frame completo.
  if (!franjasSonBordePapel(gris, bin, w, h, yTop, yBot, xLeft, xRight)) {
    return null;
  }

  // --- Ajuste de rectas (mínimos cuadrados sobre los puntos de
  //     borde cercanos a cada línea) → cuadrilátero CON perspectiva ---
  const delta = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  const lineaTop = ajustarRectaH(mag, w, h, yTop, delta, cx0, cx1, umbral);
  const lineaBot = ajustarRectaH(mag, w, h, yBot, delta, cx0, cx1, umbral);
  const lineaLeft = ajustarRectaV(mag, w, h, xLeft, delta, cy0, cy1, umbral);
  const lineaRight = ajustarRectaV(mag, w, h, xRight, delta, cy0, cy1, umbral);
  if (!lineaTop || !lineaBot || !lineaLeft || !lineaRight) return null;

  // Intersecciones: top/bottom son y = a·x + b; left/right son x = a·y + b
  const TL = intersectar(lineaTop, lineaLeft);
  const TR = intersectar(lineaTop, lineaRight);
  const BR = intersectar(lineaBot, lineaRight);
  const BL = intersectar(lineaBot, lineaLeft);
  if (!TL || !TR || !BR || !BL) return null;

  const quad = [
    { x: TL.x / w, y: TL.y / h },
    { x: TR.x / w, y: TR.y / h },
    { x: BR.x / w, y: BR.y / h },
    { x: BL.x / w, y: BL.y / h },
  ];
  return validarQuad(quad) ? quad : null;
}

function argmax(arr, desde, hasta) {
  let best = -1;
  let bestV = 0;
  for (let i = Math.max(0, desde); i < Math.min(arr.length, hasta); i++) {
    if (arr[i] > bestV) {
      bestV = arr[i];
      best = i;
    }
  }
  return best;
}

/**
 * Densidad de píxeles de borde en una región (muestreada cada 2px).
 */
function densidadRegionBordes(bin, w, h, x0, y0, x1, y1) {
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(w, Math.ceil(x1));
  y1 = Math.min(h, Math.ceil(y1));
  const alto = y1 - y0;
  const ancho = x1 - x0;
  if (alto < 3 || ancho < 3) return -1; // franja degenerada: sin opinión
  let c = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 2) {
    const fila = y * w;
    for (let x = x0; x < x1; x += 2) {
      c += bin[fila + x];
      n++;
    }
  }
  return n > 0 ? c / n : 0;
}

/** Media de gris en una franja (muestreada). Devuelve -1 si degenerada. */
function mediaFranjaGris(gris, w, h, x0, y0, x1, y1) {
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(w, Math.ceil(x1));
  y1 = Math.min(h, Math.ceil(y1));
  const alto = y1 - y0;
  const ancho = x1 - x0;
  if (alto < 2 || ancho < 2) return -1;
  let s = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 2) {
    const fila = y * w;
    for (let x = x0; x < x1; x += 2) {
      s += gris[fila + x];
      n++;
    }
  }
  return n > 0 ? s / n : -1;
}

/**
 * Verifica que las 4 líneas candidatas sean bordes de PAPEL:
 * fuera debe haber fondo más oscuro que el papel de dentro
 * (diferencia ≥ 20 niveles de gris). Franja degenerada (la línea
 * toca el marco de la imagen) = sin opinión = aceptada.
 */
function franjasSonBordePapel(gris, bin, w, h, yTop, yBot, xLeft, xRight) {
  const paso = 3;
  const ancho = 9;
  const SALTO_MINIMO = 20;

  function revisar(mediaDentro, mediaFuera) {
    if (mediaDentro < 0 || mediaFuera < 0) return true; // sin opinión
    return mediaFuera < mediaDentro - SALTO_MINIMO;
  }

  const cx0 = Math.round(w * 0.18);
  const cx1 = Math.round(w * 0.82);
  const cy0 = Math.round(h * 0.15);
  const cy1 = Math.round(h * 0.85);

  // TOP: dentro = debajo de la línea, fuera = encima
  if (!revisar(
    mediaFranjaGris(gris, w, h, cx0, yTop + paso, cx1, yTop + paso + ancho),
    mediaFranjaGris(gris, w, h, cx0, yTop - paso - ancho, cx1, yTop - paso)
  )) return false;
  // BOTTOM: dentro = encima de la línea, fuera = debajo
  if (!revisar(
    mediaFranjaGris(gris, w, h, cx0, yBot - paso - ancho, cx1, yBot - paso),
    mediaFranjaGris(gris, w, h, cx0, yBot + paso, cx1, yBot + paso + ancho)
  )) return false;
  // LEFT: dentro = a la derecha, fuera = a la izquierda
  if (!revisar(
    mediaFranjaGris(gris, w, h, xLeft + paso, cy0, xLeft + paso + ancho, cy1),
    mediaFranjaGris(gris, w, h, xLeft - paso - ancho, cy0, xLeft - paso, cy1)
  )) return false;
  // RIGHT: dentro = a la izquierda, fuera = a la derecha
  if (!revisar(
    mediaFranjaGris(gris, w, h, xRight - paso - ancho, cy0, xRight - paso, cy1),
    mediaFranjaGris(gris, w, h, xRight + paso, cy0, xRight + paso + ancho, cy1)
  )) return false;
  return true;
}

/**
 * Ajusta la recta horizontal cerca de `yLinea`: para cada x de la
 * banda central busca el borde más fuerte en la ventana ±delta y
 * resuelve y = a·x + b por mínimos cuadrados (pendiente acotada).
 */
function ajustarRectaH(mag, w, h, yLinea, delta, x0, x1, umbral) {
  const pts = [];
  const y0 = Math.max(1, yLinea - delta);
  const y1 = Math.min(h - 2, yLinea + delta);
  for (let x = x0; x < x1; x++) {
    let bestY = -1;
    let bestV = umbral * 0.6;
    for (let y = y0; y <= y1; y++) {
      const v = mag[y * w + x];
      if (v > bestV) {
        bestV = v;
        bestY = y;
      }
    }
    if (bestY >= 0) pts.push([x, bestY]);
  }
  if (pts.length < (x1 - x0) * 0.25) {
    // borde insuficiente: recta horizontal plana como respaldo
    return { a: 0, b: yLinea };
  }
  return minimosCuadrados(pts, 0.35);
}

/** Igual que ajustarRectaH pero para rectas verticales (x = a·y + b). */
function ajustarRectaV(mag, w, h, xLinea, delta, y0, y1, umbral) {
  const pts = [];
  const x0 = Math.max(1, xLinea - delta);
  const x1 = Math.min(w - 2, xLinea + delta);
  for (let y = y0; y < y1; y++) {
    let bestX = -1;
    let bestV = umbral * 0.6;
    const fila = y * w;
    for (let x = x0; x <= x1; x++) {
      const v = mag[fila + x];
      if (v > bestV) {
        bestV = v;
        bestX = x;
      }
    }
    if (bestX >= 0) pts.push([y, bestX]);
  }
  if (pts.length < (y1 - y0) * 0.25) {
    return { a: 0, b: xLinea };
  }
  return minimosCuadrados(pts, 0.35);
}

/** Mínimos cuadrados con pendiente acotada a ±maxAbs */
function minimosCuadrados(pts, maxAbs) {
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    sx += pts[i][0];
    sy += pts[i][1];
    sxx += pts[i][0] * pts[i][0];
    sxy += pts[i][0] * pts[i][1];
  }
  const denominador = n * sxx - sx * sx;
  let a = 0;
  let b = sy / n;
  if (Math.abs(denominador) > 1e-6) {
    a = (n * sxy - sx * sy) / denominador;
    b = (sy - a * sx) / n;
  }
  if (a > maxAbs) a = maxAbs;
  if (a < -maxAbs) a = -maxAbs;
  return { a, b };
}

/** Intersección de y = A.a·x + A.b con x = B.a·y + B.b */
function intersectar(A, B) {
  const denom = 1 - A.a * B.a;
  if (Math.abs(denom) < 1e-6) return null;
  const x = (B.a * A.b + B.b) / denom;
  const y = A.a * x + A.b;
  return { x, y };
}

/** Validación geométrica: finito, dentro de tolerancia, área y lados mínimos */
function validarQuad(q) {
  for (const p of q) {
    if (!isFinite(p.x) || !isFinite(p.y)) return false;
    if (p.x < -0.03 || p.x > 1.03 || p.y < -0.03 || p.y > 1.03) return false;
    p.x = Math.min(1, Math.max(0, p.x));
    p.y = Math.min(1, Math.max(0, p.y));
  }
  const area = Math.abs(
    q[0].x * q[1].y - q[1].x * q[0].y +
    q[1].x * q[2].y - q[2].x * q[1].y +
    q[2].x * q[3].y - q[3].x * q[2].y +
    q[3].x * q[0].y - q[0].x * q[3].y
  ) / 2;
  // 12%: una tira E-14 fotografiada a distancia ocupa ~15-20% del
  // frame; los protectores reales contra líneas internas son el
  // contraste papel↔fondo y la longitud mínima de los lados.
  if (area < 0.12) return false;
  const lado = (p, r) => Math.hypot(r.x - p.x, r.y - p.y);
  if (lado(q[0], q[1]) < 0.22 || lado(q[2], q[3]) < 0.22) return false;
  if (lado(q[1], q[2]) < 0.2 || lado(q[3], q[0]) < 0.2) return false;
  return true;
}

// ------------------------------------------------------------
// PROCESAR: warp de perspectiva + métricas + B/N adaptativo
// ------------------------------------------------------------

/** Resuelve el sistema lineal n×n por eliminación gaussiana */
function resolverSistema(A, b, n) {
  for (let col = 0; col < n; col++) {
    let pivote = col;
    for (let f = col + 1; f < n; f++) {
      if (Math.abs(A[f * n + col]) > Math.abs(A[pivote * n + col])) pivote = f;
    }
    if (Math.abs(A[pivote * n + col]) < 1e-10) return null;
    if (pivote !== col) {
      for (let c = 0; c < n; c++) {
        const tmp = A[col * n + c];
        A[col * n + c] = A[pivote * n + c];
        A[pivote * n + c] = tmp;
      }
      const tb = b[col];
      b[col] = b[pivote];
      b[pivote] = tb;
    }
    for (let f = col + 1; f < n; f++) {
      const factor = A[f * n + col] / A[col * n + col];
      if (factor === 0) continue;
      for (let c = col; c < n; c++) A[f * n + c] -= factor * A[col * n + c];
      b[f] -= factor * b[col];
    }
  }
  const x = new Float64Array(n);
  for (let f = n - 1; f >= 0; f--) {
    let s = b[f];
    for (let c = f + 1; c < n; c++) s -= A[f * n + c] * x[c];
    x[f] = s / A[f * n + f];
  }
  return x;
}

/**
 * Homografía que mapea el rectángulo de salida (0,0)-(W,0)-(W,H)-(0,H)
 * al cuadrilátero fuente (px). Devuelve [h0..h7] con
 *   u = (h0·x + h1·y + h2) / (h6·x + h7·y + 1)
 *   v = (h3·x + h4·y + h5) / (h6·x + h7·y + 1)
 */
function homografiaRectAQuad(W, H, src) {
  const A = new Float64Array(64);
  const b = new Float64Array(8);
  const dst = [
    [0, 0],
    [W, 0],
    [W, H],
    [0, H],
  ];
  for (let i = 0; i < 4; i++) {
    const x = dst[i][0];
    const y = dst[i][1];
    const u = src[i].x;
    const v = src[i].y;
    const r = i * 2 * 8;
    A[r + 0] = x; A[r + 1] = y; A[r + 2] = 1;
    A[r + 3] = 0; A[r + 4] = 0; A[r + 5] = 0;
    A[r + 6] = -x * u; A[r + 7] = -y * u;
    b[i * 2] = u;
    const s = (i * 2 + 1) * 8;
    A[s + 0] = 0; A[s + 1] = 0; A[s + 2] = 0;
    A[s + 3] = x; A[s + 4] = y; A[s + 5] = 1;
    A[s + 6] = -x * v; A[s + 7] = -y * v;
    b[i * 2 + 1] = v;
  }
  const h = resolverSistema(A, b, 8);
  return h ? Array.from(h) : null;
}

/** B/N adaptativo Bradley/Wellner con imagen integral */
function bnAdaptativo(gris, W, H, outRgba) {
  const iw = W + 1;
  const integral = new Uint32Array(iw * (H + 1));
  for (let y = 0; y < H; y++) {
    let sumaFila = 0;
    const fila = y * W;
    const filaI = (y + 1) * iw;
    const filaPrev = y * iw;
    for (let x = 0; x < W; x++) {
      sumaFila += gris[fila + x];
      integral[filaI + x + 1] = integral[filaPrev + x + 1] + sumaFila;
    }
  }
  const win = Math.max(15, Math.round(Math.min(W, H) / 24)) | 1;
  const radio = win >> 1;
  const t = 0.82; // fracción de la media local (Bradley)
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - radio);
    const y1 = Math.min(H - 1, y + radio);
    const fila = y * W;
    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - radio);
      const x1 = Math.min(W - 1, x + radio);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const suma =
        integral[(y1 + 1) * iw + (x1 + 1)] -
        integral[y0 * iw + (x1 + 1)] -
        integral[(y1 + 1) * iw + x0] +
        integral[y0 * iw + x0];
      const media = suma / count;
      const v = gris[fila + x] > media * t ? 255 : 0;
      const j = (fila + x) * 4;
      outRgba[j] = v;
      outRgba[j + 1] = v;
      outRgba[j + 2] = v;
      outRgba[j + 3] = 255;
    }
  }
}

/** Métricas de calidad 0-1 sobre el gris (ANTES de binarizar) */
function metricasCalidad(gris, W, H) {
  let suma = 0, suma2 = 0, nLap = 0;
  for (let y = 1; y < H - 1; y++) {
    const fila = y * W;
    for (let x = 1; x < W - 1; x++) {
      const i = fila + x;
      const lap = 4 * gris[i] - gris[i - 1] - gris[i + 1] - gris[i - W] - gris[i + W];
      suma += lap;
      suma2 += lap * lap;
      nLap++;
    }
  }
  const varLap = nLap > 0 ? suma2 / nLap - (suma / nLap) * (suma / nLap) : 0;
  const nitidez = Math.max(0, Math.min(1, varLap / 140)); // SHARPNESS_NORM de quality.ts

  // BRILLO = ¿la exposición compromete la LECTURA? Semántica de
  // documento (no de foto): el papel de un escaneo es 255 puro y
  // NO es un defecto; lo que mata el OCR es la sombra densa o el
  // lavado (brillo que borra la tinta).
  let s = 0, s2 = 0, sub = 0, oscura = 0;
  const total = W * H;
  for (let i = 0; i < total; i++) {
    const v = gris[i];
    s += v;
    s2 += v * v;
    if (v < 30) sub++;
    if (v < 100) oscura++;
  }
  const media = s / total;
  const desv = Math.sqrt(Math.max(0, s2 / total - media * media));
  const contraste = Math.max(0, Math.min(1, desv / 56));
  const fracSub = sub / total;
  const fracOscura = oscura / total;
  let brillo = 1;
  if (media < 100) brillo -= ((100 - media) / 100) * 1.2; // foto oscura
  if (fracSub > 0.35) brillo -= (fracSub - 0.35) * 2;     // sombras dominan
  if (media > 246 && fracOscura < 0.015) brillo -= 0.8;   // lavado sin tinta
  return {
    nitidez: nitidez,
    contraste: contraste,
    brillo: Math.max(0, Math.min(1, brillo)),
  };
}

/**
 * Warp de perspectiva (bilineal, sin upscale) + gris + métricas +
 * B/N adaptativo. Devuelve { buf RGBA binario, w, h, calidad }.
 */
function procesarCaptura(rgba, w, h, quad, targetLongSide) {
  let W = w;
  let H = h;
  let src = null;
  if (quad && quad.length === 4) {
    const p = quad.map(function (q) { return { x: q.x * w, y: q.y * h }; });
    const lado = function (a, b) { return Math.hypot(b.x - a.x, b.y - a.y); };
    const wOut = Math.max(lado(p[0], p[1]), lado(p[3], p[2]));
    const hOut = Math.max(lado(p[0], p[3]), lado(p[1], p[2]));
    // SIN escalado ascendente: nunca inventar nitidez (regla sagrada)
    const escala = Math.min(1, targetLongSide / Math.max(wOut, hOut, 1));
    W = Math.max(8, Math.round(wOut * escala));
    H = Math.max(8, Math.round(hOut * escala));
    src = [p[0], p[1], p[2], p[3]];
  } else {
    const escala = Math.min(1, targetLongSide / Math.max(w, h, 1));
    W = Math.max(8, Math.round(w * escala));
    H = Math.max(8, Math.round(h * escala));
  }

  const Hom = src ? homografiaRectAQuad(W, H, src) : null;
  const gris = new Uint8ClampedArray(W * H);

  if (Hom) {
    const h0 = Hom[0], h1 = Hom[1], h2 = Hom[2], h3 = Hom[3];
    const h4 = Hom[4], h5 = Hom[5], h6 = Hom[6], h7 = Hom[7];
    for (let y = 0; y < H; y++) {
      const fila = y * W;
      for (let x = 0; x < W; x++) {
        const denominador = h6 * x + h7 * y + 1;
        const u = (h0 * x + h1 * y + h2) / denominador;
        const v = (h3 * x + h4 * y + h5) / denominador;
        gris[fila + x] = muestrearGrisBilineal(rgba, w, h, u, v);
      }
    }
  } else if (W === w && H === h) {
    for (let i = 0; i < W * H; i++) {
      gris[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) | 0;
    }
  } else {
    // Reducción sin quad: muestreo bilineal por posición relativa
    for (let y = 0; y < H; y++) {
      const sy = (y * h) / H;
      const fila = y * W;
      for (let x = 0; x < W; x++) {
        const sx = (x * w) / W;
        gris[fila + x] = muestrearGrisBilineal(rgba, w, h, sx, sy);
      }
    }
  }

  const calidad = metricasCalidad(gris, W, H);
  const out = new Uint8ClampedArray(W * H * 4);
  bnAdaptativo(gris, W, H, out);
  return { buf: out, w: W, h: H, calidad: calidad };
}

/** Muestreo bilineal de luma con límites (fuera del frame = blanco) */
function muestrearGrisBilineal(rgba, w, h, u, v) {
  if (u < -1 || v < -1 || u > w || v > h) return 255;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const leer = function (x, y) {
    const cx = Math.min(w - 1, Math.max(0, x));
    const cy = Math.min(h - 1, Math.max(0, y));
    const j = (cy * w + cx) * 4;
    return 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
  };
  const p00 = leer(x0, y0);
  const p10 = leer(x0 + 1, y0);
  const p01 = leer(x0, y0 + 1);
  const p11 = leer(x0 + 1, y0 + 1);
  return (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
}

// ------------------------------------------------------------
// Router de mensajes
// ------------------------------------------------------------

self.onmessage = function (e) {
  const msg = e.data || {};
  const id = msg.id;
  const op = msg.op;
  try {
    if (op === "detectar") {
      const rgba = new Uint8ClampedArray(msg.buf);
      const quad = detectarCuadrilatero(rgba, msg.w, msg.h);
      self.postMessage({ id: id, ok: true, quad: quad });
    } else if (op === "procesar") {
      const rgba = new Uint8ClampedArray(msg.buf);
      const r = procesarCaptura(
        rgba,
        msg.w,
        msg.h,
        msg.quad || null,
        msg.targetLongSide || 3200
      );
      self.postMessage(
        { id: id, ok: true, buf: r.buf.buffer, w: r.w, h: r.h, calidad: r.calidad },
        [r.buf.buffer]
      );
    } else {
      self.postMessage({ id: id, ok: false, error: "op_desconocida" });
    }
  } catch (err) {
    self.postMessage({ id: id, ok: false, error: String((err && err.message) || err) });
  }
};
