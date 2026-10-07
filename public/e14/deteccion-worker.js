// ============================================================
// DIGITALIZADOR E-14 · WORKER DE ESCÁNER v2 — puerto del motor
// probado (web-scanner v6.2 → digielect rol A) con las mejoras
// de la especificación maestra:
//   · detectar  — cuadrilátero del documento (proyecciones Sobel
//     + respaldo de contornos Otsu/hull). Coordenadas 0-1.
//   · procesar  — warp de perspectiva (homografía + bilineal,
//     SIN upscale) + métricas de calidad sobre el gris + 3
//     filtros EXACTOS: original · texto · bw (Bradley/Wellner
//     adaptativo + despeckle <3 px).
//
// Regla sagrada: NUNCA sacrificar la capacidad de ver bien la
// imagen y reconocer el texto. El warp no inventa nitidez y el
// B/N es adaptativo LOCAL (no umbral global que mata el papel).
// Encoge el quad 3.5 px por lado SOLO si el recorte NO es
// manual (la decisión del humano manda al píxel).
// ============================================================

/** Convierte RGBA a gris (Rec. 601) */
function aGris(rgba, n) {
  const gris = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    gris[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) | 0;
  }
  return gris;
}

// ------------------------------------------------------------
// DETECCIÓN DE CUADRILÁTERO (proyecciones + contornos)
// ------------------------------------------------------------

function detectarCuadrilatero(rgba, w, h) {
  // (el chequeo de "papel llena el marco" vive en el router: ahí se
  //  reporta el flag fullFrame explícito y se aplica el respaldo bbox)
  const porProyecciones = detectarPorProyecciones(rgba, w, h);
  let porContornos = null;
  try {
    porContornos = detectarPorContornos(aGris(rgba, w * h), w, h);
  } catch {
    porContornos = null;
  }
  if (porProyecciones && porContornos) {
    return areaQuad(porProyecciones) >= areaQuad(porContornos)
      ? porProyecciones
      : porContornos;
  }
  if (porProyecciones || porContornos) return porProyecciones ?? porContornos;
  // ÚLTIMO RESPALDO (recorte automático garantizado): bbox del
  // componente claro mayor. Aunque no dé el quad con perspectiva,
  // recortar el bbox del papel SIEMPRE es mejor que entregar la
  // foto completa con la mesa/manos alrededor.
  try {
    return bboxPapel(aGris(rgba, w * h), w, h);
  } catch {
    return null;
  }
}

/**
 * Último respaldo del recorte automático: umbral de Otsu → componente
 * conexo claro (papel) de mayor área → bbox → quad alineado a ejes
 * con un margen interior del 2%. Devuelve null si no hay papel claro
 * diferenciable (ese caso cae al marco provisional manual).
 */
function bboxPapel(gris, w, h) {
  if (w < 40 || h < 40) return null;
  const n = w * h;
  const t = umbralOtsu(gris, n);
  let cuentaPapel = 0;
  const papel = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (gris[i] > t) {
      papel[i] = 1;
      cuentaPapel++;
    }
  }
  const frac = cuentaPapel / n;
  if (frac < 0.1 || frac > 0.97) return null;

  const etiqueta = new Int32Array(n).fill(-1);
  const pila = new Int32Array(n);
  let mejorArea = 0;
  let mejorBBox = null;
  let idActual = 0;
  for (let s = 0; s < n; s++) {
    if (!papel[s] || etiqueta[s] !== -1) continue;
    let sp = 0;
    pila[sp++] = s;
    etiqueta[s] = idActual;
    let area = 0;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    while (sp > 0) {
      const i = pila[--sp];
      area++;
      const x = i % w;
      const y = (i / w) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && papel[i - 1] && etiqueta[i - 1] === -1) { etiqueta[i - 1] = idActual; pila[sp++] = i - 1; }
      if (x < w - 1 && papel[i + 1] && etiqueta[i + 1] === -1) { etiqueta[i + 1] = idActual; pila[sp++] = i + 1; }
      if (y > 0 && papel[i - w] && etiqueta[i - w] === -1) { etiqueta[i - w] = idActual; pila[sp++] = i - w; }
      if (y < h - 1 && papel[i + w] && etiqueta[i + w] === -1) { etiqueta[i + w] = idActual; pila[sp++] = i + w; }
    }
    if (area > mejorArea) {
      mejorArea = area;
      mejorBBox = { minX, maxX, minY, maxY };
    }
    idActual++;
  }
  if (!mejorBBox || mejorArea < n * 0.08) return null;
  if (mejorArea > n * 0.985) return null; // papel hasta el borde: sin recorte

  // margen interior del 2% para no arrastrar sombra del borde
  const mx = Math.max(1, Math.round((mejorBBox.maxX - mejorBBox.minX) * 0.02));
  const my = Math.max(1, Math.round((mejorBBox.maxY - mejorBBox.minY) * 0.02));
  const x0 = Math.min(1, Math.max(0, (mejorBBox.minX + mx) / w));
  const y0 = Math.min(1, Math.max(0, (mejorBBox.minY + my) / h));
  const x1 = Math.min(1, Math.max(0, (mejorBBox.maxX - mx + 1) / w));
  const y1 = Math.min(1, Math.max(0, (mejorBBox.maxY - my + 1) / h));
  if (x1 - x0 < 0.2 || y1 - y0 < 0.2) return null;
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

function detectarPorProyecciones(rgba, w, h) {
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

  const yTop = argmax(rowScore, Math.round(h * 0.03), Math.round(h * 0.45));
  const yBot = argmax(rowScore, Math.round(h * 0.55), Math.round(h * 0.97));
  const xLeft = argmax(colScore, Math.round(w * 0.03), Math.round(w * 0.45));
  const xRight = argmax(colScore, Math.round(w * 0.55), Math.round(w * 0.97));
  if (yTop < 0 || yBot < 0 || xLeft < 0 || xRight < 0) return null;

  // Las 4 líneas deben ser bordes largos y creíbles (≥ 32% de la banda central)
  const minFila = (cx1 - cx0) * 0.32;
  const minCol = (cy1 - cy0) * 0.32;
  if (
    rowScore[yTop] < minFila || rowScore[yBot] < minFila ||
    colScore[xLeft] < minCol || colScore[xRight] < minCol
  ) {
    return null;
  }

  // --- Verificación de franjas exteriores (anti líneas internas) ---
  if (!franjasSonBordePapel(gris, w, h, yTop, yBot, xLeft, xRight)) {
    return null;
  }

  // --- Ajuste de rectas por mínimos cuadrados → cuadrilátero con perspectiva ---
  const delta = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  const lineaTop = ajustarRectaH(mag, w, h, yTop, delta, cx0, cx1, umbral);
  const lineaBot = ajustarRectaH(mag, w, h, yBot, delta, cx0, cx1, umbral);
  const lineaLeft = ajustarRectaV(mag, w, h, xLeft, delta, cy0, cy1, umbral);
  const lineaRight = ajustarRectaV(mag, w, h, xRight, delta, cy0, cy1, umbral);
  if (!lineaTop || !lineaBot || !lineaLeft || !lineaRight) return null;

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

/** Media de gris en una franja (muestreada). Devuelve -1 si degenerada. */
function mediaFranjaGris(gris, w, h, x0, y0, x1, y1) {
  x0 = Math.max(0, Math.floor(x0));
  y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(w, Math.ceil(x1));
  y1 = Math.min(h, Math.ceil(y1));
  if (y1 - y0 < 2 || x1 - x0 < 2) return -1;
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
 * (diferencia ≥ 20 niveles). Franja degenerada = aceptada.
 */
function franjasSonBordePapel(gris, w, h, yTop, yBot, xLeft, xRight) {
  const paso = 3;
  const ancho = 9;
  const SALTO_MINIMO = 20;
  const cx0 = Math.round(w * 0.18);
  const cx1 = Math.round(w * 0.82);
  const cy0 = Math.round(h * 0.15);
  const cy1 = Math.round(h * 0.85);

  function revisar(mediaDentro, mediaFuera) {
    if (mediaDentro < 0 || mediaFuera < 0) return true; // sin opinión
    return mediaFuera < mediaDentro - SALTO_MINIMO;
  }
  if (!revisar(
    mediaFranjaGris(gris, w, h, cx0, yTop + paso, cx1, yTop + paso + ancho),
    mediaFranjaGris(gris, w, h, cx0, yTop - paso - ancho, cx1, yTop - paso)
  )) return false;
  if (!revisar(
    mediaFranjaGris(gris, w, h, cx0, yBot - paso - ancho, cx1, yBot - paso),
    mediaFranjaGris(gris, w, h, cx0, yBot + paso, cx1, yBot + paso + ancho)
  )) return false;
  if (!revisar(
    mediaFranjaGris(gris, w, h, xLeft + paso, cy0, xLeft + paso + ancho, cy1),
    mediaFranjaGris(gris, w, h, xLeft - paso - ancho, cy0, xLeft - paso, cy1)
  )) return false;
  if (!revisar(
    mediaFranjaGris(gris, w, h, xRight - paso - ancho, cy0, xRight - paso, cy1),
    mediaFranjaGris(gris, w, h, xRight + paso, cy0, xRight + paso + ancho, cy1)
  )) return false;
  return true;
}

/** Ajusta recta horizontal cerca de yLinea: y = a·x + b (pendiente acotada) */
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
  if (pts.length < (x1 - x0) * 0.25) return { a: 0, b: yLinea };
  return minimosCuadrados(pts, 0.35);
}

/** Igual que ajustarRectaH pero para rectas verticales (x = a·y + b) */
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
  if (pts.length < (y1 - y0) * 0.25) return { a: 0, b: xLinea };
  return minimosCuadrados(pts, 0.35);
}

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

function validarQuad(q) {
  for (const p of q) {
    if (!isFinite(p.x) || !isFinite(p.y)) return false;
    if (p.x < -0.03 || p.x > 1.03 || p.y < -0.03 || p.y > 1.03) return false;
    p.x = Math.min(1, Math.max(0, p.x));
    p.y = Math.min(1, Math.max(0, p.y));
  }
  const area = areaQuad(q);
  if (area < 0.07) return false;
  const lado = (p, r) => Math.hypot(r.x - p.x, r.y - p.y);
  if (lado(q[0], q[1]) < 0.22 || lado(q[2], q[3]) < 0.22) return false;
  if (lado(q[1], q[2]) < 0.2 || lado(q[3], q[0]) < 0.2) return false;
  return true;
}

function areaQuad(q) {
  return Math.abs(
    q[0].x * q[1].y - q[1].x * q[0].y +
    q[1].x * q[2].y - q[2].x * q[1].y +
    q[2].x * q[3].y - q[3].x * q[2].y +
    q[3].x * q[0].y - q[0].x * q[3].y
  ) / 2;
}

/** Convexidad y ángulos 70–110° entre lados consecutivos */
function quadConvexo(q) {
  const n = q.length;
  let signo = 0;
  for (let i = 0; i < n; i++) {
    const a = q[i];
    const b = q[(i + 1) % n];
    const c = q[(i + 2) % n];
    const cruz = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cruz) < 1e-9) return false;
    const s = cruz > 0 ? 1 : -1;
    if (signo === 0) signo = s;
    else if (s !== signo) return false;
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const bc = { x: c.x - b.x, y: c.y - b.y };
    const cosAng = (ab.x * bc.x + ab.y * bc.y) / (Math.hypot(ab.x, ab.y) * Math.hypot(bc.x, bc.y) || 1);
    const ang = Math.acos(Math.min(1, Math.max(-1, cosAng))) * (180 / Math.PI);
    if (ang < 70 || ang > 110) return false;
  }
  return true;
}

function umbralOtsu(gris, n) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[gris[i]]++;
  let sumaTotal = 0;
  for (let v = 0; v < 256; v++) sumaTotal += v * hist[v];
  let sumaB = 0;
  let wB = 0;
  let best = 0;
  let bestVar = -1;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumaB += v * hist[v];
    const mB = sumaB / wB;
    const mF = (sumaTotal - sumaB) / wF;
    const varEntre = wB * wF * (mB - mF) * (mB - mF);
    if (varEntre > bestVar) {
      bestVar = varEntre;
      best = v;
    }
  }
  return best;
}

/**
 * RESPALDO DE CONTORNOS: Otsu → componente conexo (papel) mayor →
 * convex hull → cuadrilátero. Cubre actas rotadas y fondos ruidosos.
 */
function detectarPorContornos(gris, w, h) {
  if (w < 40 || h < 40) return null;
  const n = w * h;
  const t = umbralOtsu(gris, n);
  let cuentaPapel = 0;
  const papel = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (gris[i] > t) {
      papel[i] = 1;
      cuentaPapel++;
    }
  }
  const frac = cuentaPapel / n;
  if (frac < 0.12 || frac > 0.97) return null;

  const etiqueta = new Int32Array(n).fill(-1);
  const pila = new Int32Array(n);
  let mejorId = -1;
  let mejorArea = 0;
  let mejorBBox = null;
  let idActual = 0;
  for (let s = 0; s < n; s++) {
    if (!papel[s] || etiqueta[s] !== -1) continue;
    let sp = 0;
    pila[sp++] = s;
    etiqueta[s] = idActual;
    let area = 0;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    while (sp > 0) {
      const i = pila[--sp];
      area++;
      const x = i % w;
      const y = (i / w) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && papel[i - 1] && etiqueta[i - 1] === -1) { etiqueta[i - 1] = idActual; pila[sp++] = i - 1; }
      if (x < w - 1 && papel[i + 1] && etiqueta[i + 1] === -1) { etiqueta[i + 1] = idActual; pila[sp++] = i + 1; }
      if (y > 0 && papel[i - w] && etiqueta[i - w] === -1) { etiqueta[i - w] = idActual; pila[sp++] = i - w; }
      if (y < h - 1 && papel[i + w] && etiqueta[i + w] === -1) { etiqueta[i + w] = idActual; pila[sp++] = i + w; }
    }
    if (area > mejorArea) {
      mejorArea = area;
      mejorId = idActual;
      mejorBBox = { minX, maxX, minY, maxY };
    }
    idActual++;
  }
  if (mejorId < 0 || !mejorBBox || mejorArea < n * 0.07) return null;
  if (mejorArea > n * 0.985) return null; // fondo claro global: sin recorte

  // Puntos frontera del componente → convex hull
  const pts = [];
  const paso = Math.max(1, Math.round(Math.sqrt(mejorArea) / 40));
  for (let y = mejorBBox.minY; y <= mejorBBox.maxY; y++) {
    for (let x = mejorBBox.minX; x <= mejorBBox.maxX; x += paso) {
      const i = y * w + x;
      if (etiqueta[i] !== mejorId) continue;
      const x0 = x > 0 ? etiqueta[i - 1] : -1;
      const x1 = x < w - 1 ? etiqueta[i + 1] : -1;
      const y0 = y > 0 ? etiqueta[i - w] : -1;
      const y1 = y < h - 1 ? etiqueta[i + w] : -1;
      if (x0 !== mejorId || x1 !== mejorId || y0 !== mejorId || y1 !== mejorId) {
        pts.push({ x: x / w, y: y / h });
        break;
      }
    }
  }
  if (pts.length < 4) return null;
  const hull = convexHull(pts);
  if (hull.length < 4) return null;

  let perim = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    perim += Math.hypot(b.x - a.x, b.y - a.y);
  }
  let cuatro = douglasPeucker(hull, perim * 0.02);
  if (cuatro.length !== 4) {
    let top = hull[0], bot = hull[0], izq = hull[0], der = hull[0];
    for (const p of hull) {
      if (p.y < top.y) top = p;
      if (p.y > bot.y) bot = p;
      if (p.x < izq.x) izq = p;
      if (p.x > der.x) der = p;
    }
    cuatro = [top, der, bot, izq];
    if (new Set(cuatro.map((p) => p.x.toFixed(3) + "," + p.y.toFixed(3))).size < 4) return null;
  }

  const ordenado = ordenarQuad(cuatro);
  if (!ordenado) return null;
  const quad = ordenado.map((p) => ({
    x: Math.min(1, Math.max(0, p.x)),
    y: Math.min(1, Math.max(0, p.y)),
  }));
  return validarQuad(quad) && quadConvexo(quad) ? quad : null;
}

function convexHull(puntos) {
  const p = puntos.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const abajo = [];
  for (const q of p) {
    while (abajo.length >= 2 && cross(abajo[abajo.length - 2], abajo[abajo.length - 1], q) <= 0) abajo.pop();
    abajo.push(q);
  }
  const arriba = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (arriba.length >= 2 && cross(arriba[arriba.length - 2], arriba[arriba.length - 1], q) <= 0) arriba.pop();
    arriba.push(q);
  }
  abajo.pop();
  arriba.pop();
  return abajo.concat(arriba);
}

function douglasPeucker(pts, eps) {
  if (pts.length <= 4) return pts.slice();
  const n = pts.length;
  const primero = pts[0];
  let idx = 1;
  let dmax = -1;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(pts[i].x - primero.x, pts[i].y - primero.y);
    if (d > dmax) { dmax = d; idx = i; }
  }
  const a = simplificar(pts.slice(0, idx + 1), eps);
  const b = simplificar(pts.slice(idx).concat([primero]), eps);
  return a.slice(0, -1).concat(b.slice(0, -1));
}

function simplificar(pts, eps) {
  if (pts.length <= 2) return pts.slice();
  const a = pts[0];
  const b = pts[pts.length - 1];
  let dmax = -1;
  let idx = -1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i].x - dx * pts[i].y + b.x * a.y - b.y * a.x) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) {
    const izq = simplificar(pts.slice(0, idx + 1), eps);
    const der = simplificar(pts.slice(idx), eps);
    return izq.slice(0, -1).concat(der);
  }
  return [a, b];
}

function ordenarQuad(pts) {
  const unicos = [];
  for (const p of pts) {
    if (!unicos.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.02)) unicos.push(p);
  }
  if (unicos.length < 4) return null;
  const porSuma = unicos.slice().sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const porResta = unicos.slice().sort((a, b) => (a.x - a.y) - (b.x - b.y));
  return [porSuma[0], porResta[unicos.length - 1] ?? porResta[0], porSuma[unicos.length - 1] ?? porSuma[0], porResta[0]];
}

// ------------------------------------------------------------
// WARP DE PERSPECTIVA (homografía + bilineal, sin upscale)
// ------------------------------------------------------------

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
 * Homografía rectángulo destino → quad fuente:
 *   u = (h0·x + h1·y + h2) / (h6·x + h7·y + 1)
 *   v = (h3·x + h4·y + h5) / (h6·x + h7·y + 1)
 */
function homografiaRectAQuad(W, H, src) {
  const A = new Float64Array(64);
  const b = new Float64Array(8);
  const dst = [[0, 0], [W, 0], [W, H], [0, H]];
  for (let i = 0; i < 4; i++) {
    const x = dst[i][0];
    const y = dst[i][1];
    const u = src[i].x;
    const v = src[i].y;
    const r = i * 2 * 8;
    A[r + 0] = x; A[r + 1] = y; A[r + 2] = 1;
    A[r + 6] = -x * u; A[r + 7] = -y * u;
    b[i * 2] = u;
    const s = (i * 2 + 1) * 8;
    A[s + 3] = x; A[s + 4] = y; A[s + 5] = 1;
    A[s + 6] = -x * v; A[s + 7] = -y * v;
    b[i * 2 + 1] = v;
  }
  const h = resolverSistema(A, b, 8);
  return h ? Array.from(h) : null;
}

/** Muestreo bilineal RGBA con límites (fuera del frame = blanco) */
function muestrearRgbaBilineal(rgba, w, h, u, v, out, oi) {
  if (u < -1 || v < -1 || u > w || v > h) {
    out[oi] = 255; out[oi + 1] = 255; out[oi + 2] = 255; out[oi + 3] = 255;
    return;
  }
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const leer = function (x, y, c) {
    const cx = Math.min(w - 1, Math.max(0, x));
    const cy = Math.min(h - 1, Math.max(0, y));
    return rgba[(cy * w + cx) * 4 + c];
  };
  for (let c = 0; c < 4; c++) {
    const p00 = leer(x0, y0, c);
    const p10 = leer(x0 + 1, y0, c);
    const p01 = leer(x0, y0 + 1, c);
    const p11 = leer(x0 + 1, y0 + 1, c);
    out[oi + c] = (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
  }
}

/**
 * Encoge el quad 3.5 px por lado (solo quad NO manual) para no
 * incluir fondo del borde. Cap de desplazamiento 35 px por esquina.
 */
function encogerQuad(quadPx, shrinkPx) {
  if (!(shrinkPx > 0)) return quadPx;
  const lineas = [];
  for (let i = 0; i < 4; i++) {
    const a = quadPx[i];
    const b = quadPx[(i + 1) % 4];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey) || 1;
    let nx = ey / len;
    let ny = -ex / len;
    // la normal debe apuntar hacia adentro (hacia el centroide)
    const cx = (quadPx[0].x + quadPx[1].x + quadPx[2].x + quadPx[3].x) / 4;
    const cy = (quadPx[0].y + quadPx[1].y + quadPx[2].y + quadPx[3].y) / 4;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (nx * (cx - mx) + ny * (cy - my) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const desp = Math.min(shrinkPx, len * 0.3);
    lineas.push({ a, b, nx, ny, desp });
  }
  // desplazar cada línea hacia adentro y recomputar esquinas
  const pts = [];
  for (let i = 0; i < 4; i++) {
    const L1 = lineas[(i + 3) % 4]; // línea que termina en esta esquina
    const L2 = lineas[i];           // línea que empieza en esta esquina
    const p1 = { x: L1.a.x + L1.nx * L1.desp, y: L1.a.y + L1.ny * L1.desp };
    const p2 = { x: L1.b.x + L1.nx * L1.desp, y: L1.b.y + L1.ny * L1.desp };
    const p3 = { x: L2.a.x + L2.nx * L2.desp, y: L2.a.y + L2.ny * L2.desp };
    const p4 = { x: L2.b.x + L2.nx * L2.desp, y: L2.b.y + L2.ny * L2.desp };
    const inter = interseccionSegmentos(p1, p2, p3, p4);
    const orig = quadPx[i];
    const d = Math.hypot(inter.x - orig.x, inter.y - orig.y);
    pts.push(
      d > 35
        ? { x: orig.x + (inter.x - orig.x) * (35 / d), y: orig.y + (inter.y - orig.y) * (35 / d) }
        : inter
    );
  }
  return pts;
}

function interseccionSegmentos(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-9) return { x: p2.x, y: p2.y };
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  return { x: p1.x + d1x * t, y: p1.y + d1y * t };
}

// ------------------------------------------------------------
// FILTROS — matemática de la especificación maestra
// ------------------------------------------------------------

/**
 * Mapa de iluminación (modelo de sombras de text): downscale a
 * lado mayor 800 → close morfológico separable (min/max
 * deslizante O(n)) con kernel impar = 25.
 */
function mapaIluminacion(gris, W, H) {
  const ladoMax = Math.max(W, H);
  const escala = Math.min(1, 800 / ladoMax);
  const w = Math.max(8, Math.round(W * escala));
  const h = Math.max(8, Math.round(H * escala));
  const small = new Float32Array(w * h);
  const counts = new Float32Array(w * h);
  for (let y = 0; y < H; y++) {
    const sy = Math.min(h - 1, ((y * h) / H) | 0);
    const fila = y * W;
    for (let x = 0; x < W; x++) {
      const sx = Math.min(w - 1, ((x * w) / W) | 0);
      small[sy * w + sx] += gris[fila + x];
      counts[sy * w + sx]++;
    }
  }
  for (let i = 0; i < w * h; i++) small[i] = counts[i] > 0 ? small[i] / counts[i] : 255;

  const k = Math.max(3, Math.round(800 / 32)) | 1; // 25
  const erode = minMaxSliding(small, w, h, k, true);
  const closed = minMaxSliding(erode, w, h, k, false);
  return { map: closed, w, h };
}

/** min/max deslizante separable (H+V) O(n) con monotones */
function minMaxSliding(src, w, h, k, esMin) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fila = y * w;
    const idx = new Int32Array(w);
    let head = 0;
    let tail = 0;
    for (let x = 0; x < w; x++) {
      const v = src[fila + x];
      while (tail > head && (esMin ? src[fila + idx[tail - 1]] >= v : src[fila + idx[tail - 1]] <= v)) tail--;
      idx[tail++] = x;
      if (idx[head] <= x - k - 1) head++;
      tmp[fila + x] = src[fila + idx[head]];
    }
  }
  for (let x = 0; x < w; x++) {
    const idx = new Int32Array(h);
    let head = 0;
    let tail = 0;
    for (let y = 0; y < h; y++) {
      const v = tmp[y * w + x];
      while (tail > head && (esMin ? tmp[idx[tail - 1] * w + x] >= v : tmp[idx[tail - 1] * w + x] <= v)) tail--;
      idx[tail++] = y;
      if (idx[head] <= y - k - 1) head++;
      out[y * w + x] = tmp[idx[head] * w + x];
    }
  }
  return out;
}

/** Aplica ganancia mean(map)/map[i] muestreada BILINEAL al gris */
function corregirSombras(gris, W, H) {
  const { map, w, h } = mapaIluminacion(gris, W, H);
  let suma = 0;
  for (let i = 0; i < w * h; i++) suma += map[i];
  const mediaMap = suma / (w * h);
  const out = new Uint8ClampedArray(W * H);
  for (let y = 0; y < H; y++) {
    const fy = (y * h) / H;
    const y0 = Math.min(h - 1, Math.floor(fy));
    const y1 = Math.min(h - 1, y0 + 1);
    const ty = fy - y0;
    const fila = y * W;
    for (let x = 0; x < W; x++) {
      const fx = (x * w) / W;
      const x0 = Math.min(w - 1, Math.floor(fx));
      const x1 = Math.min(w - 1, x0 + 1);
      const tx = fx - x0;
      const m =
        map[y0 * w + x0] * (1 - tx) * (1 - ty) +
        map[y0 * w + x1] * tx * (1 - ty) +
        map[y1 * w + x0] * (1 - tx) * ty +
        map[y1 * w + x1] * tx * ty;
      const ganancia = Math.min(4, m > 1 ? mediaMap / m : 1);
      out[fila + x] = gris[fila + x] * ganancia;
    }
  }
  return out;
}

/** Unsharp: Gaussiano separable σ=1.5 (radio 3) + src·1.5 − blur·0.5 */
function unsharp(gris, W, H) {
  const r = 3;
  const sigma = 1.5;
  const kernel = new Float32Array(2 * r + 1);
  let sumaK = 0;
  for (let i = -r; i <= r; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + r] = v;
    sumaK += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sumaK;

  const tmp = new Float32Array(W * H);
  const blur = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    const fila = y * W;
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const cx = Math.min(W - 1, Math.max(0, x + i));
        s += gris[fila + cx] * kernel[i + r];
      }
      tmp[fila + x] = s;
    }
  }
  for (let y = 0; y < H; y++) {
    const fila = y * W;
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) {
        const cy = Math.min(H - 1, Math.max(0, y + i));
        s += tmp[cy * W + x] * kernel[i + r];
      }
      blur[fila + x] = s;
    }
  }
  const out = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) {
    out[i] = gris[i] * 1.5 - blur[i] * 0.5;
  }
  return out;
}

/** Percentil p del histograma de gris */
function percentil(gris, n, p) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[gris[i]]++;
  const objetivo = n * p;
  let acum = 0;
  for (let v = 0; v < 256; v++) {
    acum += hist[v];
    if (acum >= objetivo) return v;
  }
  return 255;
}

/**
 * FILTRO «texto claro»: sombras → unsharp → white-point p85 →
 * S-curve (pivote 0.72, factor 1.8) → black point 0.2 → ganancia
 * de tinta min(4, ink/gray) → factor total min(8) conservando croma.
 */
function filtroTexto(grisOrig, rgba, W, H) {
  let gris = corregirSombras(grisOrig, W, H);
  gris = unsharp(gris, W, H);

  const wp = Math.max(1, percentil(gris, W * H, 0.85));
  const bp = 0.2 * 255;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    // white-point stretch + black point
    let v = ((gris[i] - bp) / Math.max(1, wp - bp)) * 255;
    v = Math.max(0, Math.min(255, v));
    // S-curve
    let u = v / 255;
    u = Math.max(0, Math.min(1, (u - 0.72) * 1.8 + 0.72));
    v = u * 255;
    // ganancia de tinta min(4, ink/gray)
    const ink = 255 - v;
    const factor = Math.min(4, v > 1 ? ink / v : 4);
    v = 255 - Math.min(255, ink * factor);

    // conservar croma: factor total min(8)
    const g0 = Math.max(1, gris[i]);
    const total = Math.min(8, v / g0);
    const j = i * 4;
    out[j] = rgba[j] * total;
    out[j + 1] = rgba[j + 1] * total;
    out[j + 2] = rgba[j + 2] * total;
    out[j + 3] = 255;
  }
  return out;
}

/**
 * B/N ADAPTATIVO Bradley/Wellner con imagen integral:
 * ventana = min(W,H)/24 (impar, mín 15), negro si v ≤ media·0.85
 * (BW_T = 0.15). Despeckle: componentes negras < 3 px → blanco.
 */
function filtroBn(gris, W, H) {
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
  const t = 0.85; // BW_T = 0.15 → negro si v ≤ media·(1−0.15)
  const bin = new Uint8Array(W * H); // 1 = negro
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
      if (gris[fila + x] <= media * t) {
        bin[fila + x] = 1;
      }
    }
  }

  // Despeckle: componentes de negros < 3 px → blancos (flood fill 4-conexo)
  const visitado = new Uint8Array(W * H);
  const pila = [];
  const comp = [];
  for (let s = 0; s < W * H; s++) {
    if (!bin[s] || visitado[s]) continue;
    pila.length = 0;
    comp.length = 0;
    pila.push(s);
    visitado[s] = 1;
    while (pila.length > 0) {
      const i = pila.pop();
      comp.push(i);
      const x = i % W;
      const y = (i / W) | 0;
      if (x > 0 && bin[i - 1] && !visitado[i - 1]) { visitado[i - 1] = 1; pila.push(i - 1); }
      if (x < W - 1 && bin[i + 1] && !visitado[i + 1]) { visitado[i + 1] = 1; pila.push(i + 1); }
      if (y > 0 && bin[i - W] && !visitado[i - W]) { visitado[i - W] = 1; pila.push(i - W); }
      if (y < H - 1 && bin[i + W] && !visitado[i + W]) { visitado[i + W] = 1; pila.push(i + W); }
    }
    if (comp.length < 3) {
      for (const i of comp) bin[i] = 0;
    }
  }

  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const v = bin[i] ? 0 : 255;
    const j = i * 4;
    out[j] = v;
    out[j + 1] = v;
    out[j + 2] = v;
    out[j + 3] = 255;
  }
  return out;
}

/** Métricas de calidad 0-1 sobre el gris del warp (ANTES de filtrar) */
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
  const nitidez = Math.max(0, Math.min(1, varLap / 140));

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
  if (media < 100) brillo -= ((100 - media) / 100) * 1.2;
  if (fracSub > 0.35) brillo -= (fracSub - 0.35) * 2;
  if (media > 246 && fracOscura < 0.015) brillo -= 0.8;
  return {
    nitidez,
    contraste,
    brillo: Math.max(0, Math.min(1, brillo)),
  };
}

/** D-03: ¿el documento llena el frame completo? (escaneo/foto cerrada)
 *  Discriminador por ESQUINAS vs CENTRO: si alguna esquina del marco
 *  es claramente más oscura que el centro hay FONDO visible (mesa,
 *  manos) → NO es full-frame y el recorte automático debe actuar.
 *  Un acta que llena la foto (aunque la foto sea oscura) tiene
 *  esquinas ≈ al centro (todo es papel). La tinta interna (código de
 *  barras, fotos de candidatos) no afecta: vive fuera de las esquinas.
 */
function frameEsPapelCompleto(rgba, w, h) {
  if (w < 40 || h < 40) return false;
  const gris = aGris(rgba, w * h);
  const cx0 = Math.round(w * 0.35);
  const cx1 = Math.round(w * 0.65);
  const cy0 = Math.round(h * 0.35);
  const cy1 = Math.round(h * 0.65);
  let sCentro = 0;
  let nCentro = 0;
  for (let y = cy0; y < cy1; y++) {
    const fila = y * w;
    for (let x = cx0; x < cx1; x++) {
      sCentro += gris[fila + x];
      nCentro++;
    }
  }
  if (nCentro === 0) return false;
  const mediaCentro = sCentro / nCentro;
  // foto casi negra / sin papel: que la detección decida
  if (mediaCentro < 60) return false;
  const lw = Math.max(4, Math.round(w * 0.15));
  const lh = Math.max(4, Math.round(h * 0.15));
  const esquinas = [
    [0, 0],
    [w - lw, 0],
    [0, h - lh],
    [w - lw, h - lh],
  ];
  for (const [ex, ey] of esquinas) {
    let s = 0;
    let n = 0;
    for (let y = ey; y < Math.min(h, ey + lh); y += 2) {
      const fila = y * w;
      for (let x = ex; x < Math.min(w, ex + lw); x += 2) {
        s += gris[fila + x];
        n++;
      }
    }
    if (n === 0) continue;
    const mediaEsquina = s / n;
    // esquina claramente más oscura que el papel del centro → hay fondo
    if (mediaEsquina < mediaCentro - 25) return false;
  }
  return true;
}

/**
 * Warp + filtro. quadPx en píxeles fuente ([TL,TR,BR,BL]).
 * modo: "original" | "texto" | "bw".
 */
function procesarCaptura(rgba, w, h, quadPx, modo, targetLongSide, manual) {
  let W = w;
  let H = h;
  let src = null;
  if (quadPx && quadPx.length === 4) {
    const p = manual ? quadPx : encogerQuad(quadPx, 3.5);
    const lado = function (a, b) { return Math.hypot(b.x - a.x, b.y - a.y); };
    const wOut = Math.max(lado(p[0], p[1]), lado(p[3], p[2]));
    const hOut = Math.max(lado(p[0], p[3]), lado(p[1], p[2]));
    // SIN escalado ascendente: nunca inventar nitidez
    const escala = Math.min(1, targetLongSide / Math.max(wOut, hOut, 1));
    W = Math.max(16, Math.round(wOut * escala));
    H = Math.max(16, Math.round(hOut * escala));
    src = p;
  } else {
    const escala = Math.min(1, targetLongSide / Math.max(w, h, 1));
    W = Math.max(16, Math.round(w * escala));
    H = Math.max(16, Math.round(h * escala));
  }

  const Hom = src ? homografiaRectAQuad(W, H, src) : null;
  const out = new Uint8ClampedArray(W * H * 4);

  if (Hom) {
    const h0 = Hom[0], h1 = Hom[1], h2 = Hom[2], h3 = Hom[3];
    const h4 = Hom[4], h5 = Hom[5], h6 = Hom[6], h7 = Hom[7];
    for (let y = 0; y < H; y++) {
      const fila = y * W;
      for (let x = 0; x < W; x++) {
        const denominador = h6 * x + h7 * y + 1;
        const u = (h0 * x + h1 * y + h2) / denominador;
        const v = (h3 * x + h4 * y + h5) / denominador;
        muestrearRgbaBilineal(rgba, w, h, u, v, out, (fila + x) * 4);
      }
    }
  } else {
    // sin quad: reducción bilineal por posición relativa
    for (let y = 0; y < H; y++) {
      const sy = (y * h) / H;
      const fila = y * W;
      for (let x = 0; x < W; x++) {
        const sx = (x * w) / W;
        muestrearRgbaBilineal(rgba, w, h, sx, sy, out, (fila + x) * 4);
      }
    }
  }

  const gris = aGris(out, W * H);
  const calidad = metricasCalidad(gris, W, H);

  let final = out;
  if (modo === "bw") {
    final = filtroBn(gris, W, H);
  } else if (modo === "texto") {
    final = filtroTexto(gris, out, W, H);
  } // "original" → passthrough

  const fullFrame = src ? false : frameEsPapelCompleto(rgba, w, h);
  return { buf: final, w: W, h: H, calidad, fullFrame };
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
      // D-03 explícito: el cliente distingue "papel llena el marco"
      // (no recortar) de "detección falló" (marco provisional).
      const fullFrame = frameEsPapelCompleto(rgba, msg.w, msg.h) === true;
      const quad = fullFrame ? null : detectarCuadrilatero(rgba, msg.w, msg.h);
      self.postMessage({ id: id, ok: true, quad: quad, fullFrame: fullFrame });
    } else if (op === "procesar") {
      const rgba = new Uint8ClampedArray(msg.buf);
      const r = procesarCaptura(
        rgba,
        msg.w,
        msg.h,
        msg.quad || null,
        msg.modo || "bw",
        msg.targetLongSide || 3200,
        msg.manual === true
      );
      self.postMessage(
        {
          id: id,
          ok: true,
          buf: r.buf.buffer,
          w: r.w,
          h: r.h,
          calidad: r.calidad,
          fullFrame: r.fullFrame === true,
        },
        [r.buf.buffer]
      );
    } else {
      self.postMessage({ id: id, ok: false, error: "op_desconocida" });
    }
  } catch (err) {
    self.postMessage({ id: id, ok: false, error: String((err && err.message) || err) });
  }
};
