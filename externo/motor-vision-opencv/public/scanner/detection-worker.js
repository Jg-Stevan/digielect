"use strict";
(() => {
  // src/scanner/core/geometry.ts
  var QUAD_MIN_AREA_RATIO = 0.25;
  var QUAD_MIN_AREA_RATIO_DETECT = 0.1;
  var MIN_SIDE_RATIO = 0.05;
  var BAND_MIN_PX = 30;
  var BAND_PCT_OF_SIDE = 0.015;
  var TRIM_FRACTION = 0.12;
  function orderPoints(pts) {
    if (pts.length !== 4) {
      throw new Error(`orderPoints: se esperan exactamente 4 puntos, recib\xED ${pts.length}`);
    }
    const sums = pts.map((p) => p.x + p.y);
    const diffs = pts.map((p) => p.x - p.y);
    const idxMin = (v) => v.indexOf(Math.min(...v));
    const idxMax = (v) => v.indexOf(Math.max(...v));
    const tl = idxMin(sums);
    const br = idxMax(sums);
    const tr = idxMax(diffs);
    const bl = idxMin(diffs);
    const idxs = /* @__PURE__ */ new Set([tl, tr, br, bl]);
    if (idxs.size !== 4) {
      throw new Error("orderPoints: cuadril\xE1tero degenerado (coordenadas empatadas)");
    }
    return [pts[tl], pts[tr], pts[br], pts[bl]];
  }
  function orderPointsAngle(pts) {
    if (pts.length !== 4) {
      throw new Error(`orderPointsAngle: se esperan exactamente 4 puntos, recib\xED ${pts.length}`);
    }
    let cx = 0;
    let cy = 0;
    for (const p of pts) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        throw new Error("orderPointsAngle: coordenadas no finitas");
      }
      cx += p.x / 4;
      cy += p.y / 4;
    }
    const angled = pts.map((p, i) => ({ i, a: Math.atan2(p.y - cy, p.x - cx) }));
    angled.sort((u, v) => u.a - v.a);
    let bestStart = 0;
    let bestDist = Infinity;
    for (let k = 0; k < 4; k++) {
      let d = Math.abs(angled[k].a + 3 * Math.PI / 4);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d < bestDist) {
        bestDist = d;
        bestStart = k;
      }
    }
    const out = [];
    for (let k = 0; k < 4; k++) {
      out.push(pts[angled[(bestStart + k) % 4].i]);
    }
    for (let k = 1; k < 4; k++) {
      const prev = angled[(bestStart + k - 1) % 4].a;
      const cur = angled[(bestStart + k) % 4].a;
      if (Math.abs(cur - prev) < 1e-9) {
        throw new Error("orderPointsAngle: cuadril\xE1tero degenerado (\xE1ngulos empatados)");
      }
    }
    return out;
  }
  function quadArea(q) {
    let sum = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i];
      const b = q[(i + 1) % 4];
      sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
  }
  function isConvex(q) {
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const p0 = q[i];
      const p1 = q[(i + 1) % 4];
      const p2 = q[(i + 2) % 4];
      const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
      if (Math.abs(cross) < 1e-12) return false;
      const s = Math.sign(cross);
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
    return true;
  }
  function orient(p, q, r) {
    return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  }
  function segmentsCross(a, b, c, d) {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    return o1 * o2 < 0 && o3 * o4 < 0;
  }
  function hasSelfIntersection(q) {
    return segmentsCross(q[0], q[1], q[2], q[3]) || segmentsCross(q[1], q[2], q[3], q[0]);
  }
  function sideRatios(q) {
    const len = (i) => Math.hypot(q[(i + 1) % 4].x - q[i].x, q[(i + 1) % 4].y - q[i].y);
    const sides = [len(0), len(1), len(2), len(3)];
    const max = Math.max(...sides);
    if (max < 1e-12) return [0, 0, 0, 0];
    return [sides[0] / max, sides[1] / max, sides[2] / max, sides[3] / max];
  }
  function validateQuad(q, frameW, frameH, minAreaRatio = QUAD_MIN_AREA_RATIO) {
    if (!isConvex(q) || hasSelfIntersection(q)) return false;
    if (quadArea(q) <= minAreaRatio * frameW * frameH) return false;
    const ratios = sideRatios(q);
    for (const r of ratios) {
      if (r < MIN_SIDE_RATIO) return false;
    }
    return true;
  }
  function fitLineTrimmed(points, trim = TRIM_FRACTION) {
    if (points.length < 2) {
      throw new Error(`fitLineTrimmed: se requieren \u2265 2 puntos (recib\xED ${points.length})`);
    }
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const dominantX = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
    const sorted = [...points].sort((p, q) => dominantX ? p.x - q.x : p.y - q.y);
    const trimN = Math.max(0, Math.floor(sorted.length * trim));
    const kept = trimN * 2 < sorted.length ? sorted.slice(trimN, sorted.length - trimN) : sorted;
    if (dominantX) {
      const fit2 = leastSquares(kept.map((p) => p.x), kept.map((p) => p.y));
      if (fit2) return normalizeLine(-fit2.m, 1, -fit2.b);
      const xm = mean(kept.map((p) => p.x));
      return normalizeLine(1, 0, -xm);
    }
    const fit = leastSquares(kept.map((p) => p.y), kept.map((p) => p.x));
    if (fit) return normalizeLine(1, -fit.m, -fit.b);
    const ym = mean(kept.map((p) => p.y));
    return normalizeLine(0, 1, -ym);
  }
  function leastSquares(x, y) {
    const n = x.length;
    let sx = 0;
    let sy = 0;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      sx += x[i];
      sy += y[i];
      sxy += x[i] * y[i];
      sxx += x[i] * x[i];
    }
    const den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-12) return null;
    const m = (n * sxy - sx * sy) / den;
    const b = (sy - m * sx) / n;
    return { m, b };
  }
  var RANSAC_INLIER_PX = 5;
  var RANSAC_MAX_MODELS = 24;
  function fitLineRansac(points, inlierPx = RANSAC_INLIER_PX, maxModels = RANSAC_MAX_MODELS) {
    if (points.length < 2) {
      throw new Error(`fitLineRansac: se requieren \u2265 2 puntos (recib\xED ${points.length})`);
    }
    const n = points.length;
    const offsets = [Math.max(1, Math.floor(n / 4)), Math.max(1, Math.floor(n / 2)), Math.max(1, Math.floor(3 * n / 4))];
    let bestInliers = null;
    let bestCount = 1;
    let models = 0;
    for (const off of offsets) {
      for (let k = 0; k < n && models < maxModels; k++) {
        if (off >= n && k > 0) break;
        const a = points[k];
        const b = points[(k + off) % n];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (Math.hypot(dx, dy) < 1e-6) continue;
        const la = dy;
        const lb = -dx;
        const lc = -(la * a.x + lb * a.y);
        const norm = Math.hypot(la, lb);
        const A = la / norm;
        const B = lb / norm;
        const C = lc / norm;
        const inliers = [];
        for (const p of points) {
          if (Math.abs(A * p.x + B * p.y + C) <= inlierPx) inliers.push(p);
        }
        models++;
        if (inliers.length > bestCount) {
          bestCount = inliers.length;
          bestInliers = inliers;
        }
      }
    }
    if (bestInliers === null) {
      throw new Error("fitLineRansac: ning\xFAn modelo con \u22652 inliers (banda sin estructura lineal)");
    }
    return fitLineTrimmed(bestInliers, 0);
  }
  function normalizeLine(a, b, c) {
    const n = Math.hypot(a, b);
    if (n < 1e-12) {
      throw new Error(`normalizeLine: l\xEDnea degenerada (a=${a}, b=${b})`);
    }
    return { a: a / n, b: b / n, c: c / n };
  }
  function mean(v) {
    return v.reduce((acc, x) => acc + x, 0) / v.length;
  }
  function intersectLines(l1, l2) {
    const den = l1.a * l2.b - l2.a * l1.b;
    if (Math.abs(den) < 1e-12) return null;
    const x = (l1.b * l2.c - l2.b * l1.c) / den;
    const y = (l1.c * l2.a - l2.c * l1.a) / den;
    return { x, y };
  }
  function refineQuadFromLines(topL, rightL, bottomL, leftL, fallback) {
    const refined = [
      intersectLines(leftL, topL),
      // TL (lados 3+0)
      intersectLines(topL, rightL),
      // TR (lados 0+1)
      intersectLines(rightL, bottomL),
      // BR (lados 1+2)
      intersectLines(bottomL, leftL)
      // BL (lados 2+3)
    ];
    const bad = refined.map((c) => c === null);
    const r0 = refined[0];
    const r1 = refined[1];
    const r2 = refined[2];
    const r3 = refined[3];
    if (r0 && r1 && r2 && r3) {
      const cand = [r0, r1, r2, r3];
      if (isConvex(cand) && !hasSelfIntersection(cand) && quadArea(cand) > 0) {
        return { quad: cand, fellBack: [false, false, false, false] };
      }
    }
    const fellBack = [false, false, false, false];
    if (bad.some(Boolean)) {
      for (let i = 0; i < 4; i++) {
        fellBack[i] = bad[i] === true && bad[(i + 1) % 4] === true;
      }
      for (let i = 0; i < 4; i++) {
        if (bad[i] && !fellBack[(i + 3) % 4] && !fellBack[i]) {
          fellBack[(i + 3) % 4] = true;
          fellBack[i] = true;
        }
      }
    } else {
      fellBack[0] = true;
      fellBack[1] = true;
      fellBack[2] = true;
      fellBack[3] = true;
    }
    const quad = [0, 1, 2, 3].map((i) => {
      if (fellBack[(i + 3) % 4] || fellBack[i]) return fallback[i];
      const rc = refined[i];
      if (rc === null) {
        throw new Error("refineQuadFromLines: invariante roto (esquina null sin fallback)");
      }
      return rc;
    });
    return { quad, fellBack };
  }

  // src/scanner/core/warp.ts
  // F-PERSP: 3500 → 4032 (foto completa del sensor; el enhance del cliente
  // ya capa a 4032, así que 3500 tiraba resolución real). Ajustable EN
  // CALIENTE por config {maxWarpLongSide} según el benchmark del dispositivo
  // (F-DEVBENCH: 4032/3200/2560).
  var warpMaxLongSide = 4032;
  var UNSHARP_AMOUNT = 0.5;
  var UNSHARP_RADIUS = 1.5;
  var UNSHARP_KERNEL_SIZE = Math.max(3, 2 * Math.ceil(2 * UNSHARP_RADIUS) + 1);
  function sideLen(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function computeWarpDims(quad) {
    const w0 = Math.max(sideLen(quad[0], quad[1]), sideLen(quad[2], quad[3]));
    const h0 = Math.max(sideLen(quad[1], quad[2]), sideLen(quad[3], quad[0]));
    if (!Number.isFinite(w0) || !Number.isFinite(h0)) {
      return { w: 1, h: 1 };
    }
    const s = Math.max(w0, h0) > warpMaxLongSide ? warpMaxLongSide / Math.max(w0, h0) : 1;
    return {
      w: Math.max(1, Math.round(w0 * s)),
      h: Math.max(1, Math.round(h0 * s))
    };
  }
  var SHRINK_QUAD_PX = 3.5;
  function shrinkQuad(quad, px) {
    for (const c of quad) {
      if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) {
        return quad;
      }
    }
    if (!Number.isFinite(px)) {
      return [{ ...quad[0] }, { ...quad[1] }, { ...quad[2] }, { ...quad[3] }];
    }
    const lines = [];
    for (let i = 0; i < 4; i++) {
      const p = quad[i];
      const q = quad[(i + 1) % 4];
      const ex = q.x - p.x;
      const ey = q.y - p.y;
      const len = Math.hypot(ex, ey);
      if (!(len > 1e-12)) {
        lines.push({ a: 0, b: 0, c: 0 });
        continue;
      }
      const a = -ey / len;
      const b = ex / len;
      lines.push({ a, b, c: -(a * p.x + b * p.y) - px });
    }
    const maxShift = 10 * Math.abs(px);
    return [0, 1, 2, 3].map((i) => {
      const hit = intersectLines(lines[(i + 3) % 4], lines[i]);
      const orig = quad[i];
      if (hit !== null && Number.isFinite(hit.x) && Number.isFinite(hit.y) && Math.hypot(hit.x - orig.x, hit.y - orig.y) <= maxShift) {
        return hit;
      }
      return { ...orig };
    });
  }

  // src/scanner/core/cornerBands.ts
  function computeBandRects(quadPx, photoW, photoH) {
    if (!Number.isFinite(photoW) || !Number.isFinite(photoH) || !(photoW > 0) || !(photoH > 0)) {
      return [];
    }
    for (let i = 0; i < 4; i++) {
      if (!Number.isFinite(quadPx[i].x) || !Number.isFinite(quadPx[i].y)) {
        return [];
      }
    }
    const out = [];
    for (let s = 0; s < 4; s++) {
      const a = quadPx[s];
      const b = quadPx[(s + 1) % 4];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (!(len > 0)) continue;
      const bandW = Math.max(BAND_MIN_PX, BAND_PCT_OF_SIDE * len);
      const half = bandW / 2;
      const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - half));
      const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - half));
      const x1 = Math.min(photoW, Math.ceil(Math.max(a.x, b.x) + half));
      const y1 = Math.min(photoH, Math.ceil(Math.max(a.y, b.y) + half));
      if (x1 - x0 < 1 || y1 - y0 < 1) continue;
      out.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, side: s, bandW });
    }
    return out;
  }

  // src/scanner/core/quadSelect.ts
  var TOP_CONTOURS = 5;
  var PROFILE_ASPECT_BONUS = 0.15;
  var WHITENESS_WEIGHT = 0.25;
  var PROFILE_ASPECT_PRIORS = {
    auto: null,
    "documento-largo": { ratio: "h/w", min: 1.3, max: 4.5 },
    pagina: { ratio: "long/short", min: 1.2, max: 1.6 },
    tarjeta: { ratio: "h/w", min: 0.6, max: 0.8 }
  };
  function sideLens(q) {
    const len = (i) => Math.hypot(q[(i + 1) % 4].x - q[i].x, q[(i + 1) % 4].y - q[i].y);
    return {
      w: Math.max(len(0), len(2)),
      // top, bottom
      h: Math.max(len(1), len(3))
      // right, left
    };
  }
  function aspectMatches(quad, prior) {
    if (prior === null) return false;
    const { w, h } = sideLens(quad);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 1e-9 || h <= 1e-9) {
      return false;
    }
    if (prior.ratio === "h/w") {
      const hw = h / w;
      return hw >= prior.min && hw <= prior.max;
    }
    const ls = Math.max(w, h) / Math.min(w, h);
    return ls >= prior.min && ls <= prior.max;
  }
  function selectQuad(polys, frameW, frameH, topN = TOP_CONTOURS, opts = {}) {
    const prior = PROFILE_ASPECT_PRIORS[opts.profile ?? "auto"] ?? null;
    const top = [...polys].sort((a, b) => b.area - a.area).slice(0, Math.max(0, topN));
    let best = null;
    for (const poly of top) {
      if (poly.points.length !== 4) continue;
      let ordered = null;
      try {
        ordered = orderPoints(poly.points);
      } catch {
        try {
          ordered = orderPointsAngle(poly.points);
        } catch {
          continue;
        }
      }
      if (ordered === null) continue;
      if (
        // [F5-CROP, 2026-10-01] umbral de DETECCIÓN 0.10 (fotos reales issue #2:
        // documento a distancia normal no llena el 25% §F1 del encuadre).
        !validateQuad(ordered, frameW, frameH, QUAD_MIN_AREA_RATIO_DETECT)
      ) {
        continue;
      }
      const score = poly.area / (frameW * frameH) + (aspectMatches(ordered, prior) ? PROFILE_ASPECT_BONUS : 0) + WHITENESS_WEIGHT * (poly.whiteness ?? 0);
      if (best === null || score > best.score || score === best.score && poly.area > best.area) {
        best = { quad: ordered, score, area: poly.area };
      }
    }
    return best === null ? null : best.quad;
  }
  function scalePoly(points, sx, sy) {
    return points.map((p) => ({ x: p.x * sx, y: p.y * sy }));
  }

  // src/scanner/workers/withMats.ts
  function withMats(fn) {
    const tracked = [];
    const track = (m) => {
      tracked.push(m);
      return m;
    };
    try {
      return fn(track);
    } finally {
      for (let i = tracked.length - 1; i >= 0; i--) {
        tracked[i].delete();
      }
    }
  }

  // src/scanner/core/imageModes.ts
  var TEXT_CLARO_WHITE_PCT = 0.85;
  var TEXT_CLARO_CONTRAST = 1.8;
  var TEXT_CLARO_PIVOT = 0.72;
  var TEXT_CLARO_BLACK_POINT = 0.2;
  var JPEG_QUALITY = 0.9;
  var ILLUM_MAP_LONG_SIDE = 800;
  var BW_WINDOW_RATIO = 1 / 12;
  var BW_T = 0.15;
  var BW_SAUVOLA_K = 0.34;
  var BW_SAUVOLA_R = 128;
  var BW_DESPECKLE_PX = 3;
  var FF_FLOOR_DEFAULT = 40;
  function integralImage(gray, w, h) {
    if (!(w > 0) || !(h > 0) || gray.length < w * h) return new Float64Array(0);
    const iw = w + 1;
    const ii = new Float64Array(iw * (h + 1));
    for (let y = 0; y < h; y++) {
      let rowAcc = 0;
      const src = y * w;
      const dst = (y + 1) * iw;
      const prev = y * iw;
      for (let x = 0; x < w; x++) {
        rowAcc += gray[src + x];
        ii[dst + x + 1] = ii[prev + x + 1] + rowAcc;
      }
    }
    return ii;
  }
  function integralImageSq(gray, w, h) {
    if (!(w > 0) || !(h > 0) || gray.length < w * h) return new Float64Array(0);
    const iw = w + 1;
    const ii = new Float64Array(iw * (h + 1));
    for (let y = 0; y < h; y++) {
      let rowAcc = 0;
      const src = y * w;
      const dst = (y + 1) * iw;
      const prev = y * iw;
      for (let x = 0; x < w; x++) {
        const v = gray[src + x];
        rowAcc += v * v;
        ii[dst + x + 1] = ii[prev + x + 1] + rowAcc;
      }
    }
    return ii;
  }
  function oddWindow(w, windowRatio) {
    const raw = Math.max(8, Math.round(w * windowRatio));
    return raw % 2 === 0 ? raw + 1 : raw;
  }
  function bradleyRoth(gray, w, h, t = BW_T, windowRatio = BW_WINDOW_RATIO) {
    const n = w * h;
    if (!(n > 0) || gray.length < n) return new Uint8ClampedArray(0);
    const ii = integralImage(gray, w, h);
    const iw = w + 1;
    const half = oddWindow(w, windowRatio) >> 1;
    const out = new Uint8ClampedArray(n);
    const k = 1 - t;
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - half);
      const y1 = Math.min(h - 1, y + half);
      const r0 = y0 * iw;
      const r1 = (y1 + 1) * iw;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - half);
        const x1 = Math.min(w - 1, x + half);
        const sum = ii[r1 + x1 + 1] - ii[r0 + x1 + 1] - ii[r1 + x0] + ii[r0 + x0];
        const count = (x1 - x0 + 1) * (y1 - y0 + 1);
        const m = sum / count;
        out[row + x] = gray[row + x] <= m * k ? 0 : 255;
      }
    }
    return out;
  }
  function sauvola(gray, w, h, k = BW_SAUVOLA_K, r = BW_SAUVOLA_R, windowRatio = BW_WINDOW_RATIO) {
    const n = w * h;
    if (!(n > 0) || gray.length < n) return new Uint8ClampedArray(0);
    const ii = integralImage(gray, w, h);
    const iiSq = integralImageSq(gray, w, h);
    const iw = w + 1;
    const half = oddWindow(w, windowRatio) >> 1;
    const out = new Uint8ClampedArray(n);
    const rr = r > 0 ? r : 1;
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - half);
      const y1 = Math.min(h - 1, y + half);
      const r0 = y0 * iw;
      const r1 = (y1 + 1) * iw;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - half);
        const x1 = Math.min(w - 1, x + half);
        const c0 = x0;
        const c1 = x1 + 1;
        const count = (x1 - x0 + 1) * (y1 - y0 + 1);
        const sum = ii[r1 + c1] - ii[r0 + c1] - ii[r1 + c0] + ii[r0 + c0];
        const sumSq = iiSq[r1 + c1] - iiSq[r0 + c1] - iiSq[r1 + c0] + iiSq[r0 + c0];
        const m = sum / count;
        const variance = sumSq / count - m * m;
        const s = Math.sqrt(variance > 0 ? variance : 0);
        const t = m * (1 + k * (s / rr - 1));
        out[row + x] = gray[row + x] <= t ? 0 : 255;
      }
    }
    return out;
  }
  function despeckleBinary(binary, w, h, minPx = BW_DESPECKLE_PX) {
    const n = w * h;
    if (!(n > 0) || binary.length < n) return binary.slice();
    if (!(minPx > 1)) return binary.slice();
    const out = binary.slice();
    const visited = new Uint8Array(n);
    const queue = new Int32Array(n);
    for (let seed = 0; seed < n; seed++) {
      if (visited[seed] !== 0 || binary[seed] !== 0) continue;
      visited[seed] = 1;
      let r = 0;
      let sp = 0;
      queue[sp++] = seed;
      while (r < sp) {
        const i = queue[r++];
        const x = i % w;
        if (x > 0 && visited[i - 1] === 0 && binary[i - 1] === 0) {
          visited[i - 1] = 1;
          queue[sp++] = i - 1;
        }
        if (x < w - 1 && visited[i + 1] === 0 && binary[i + 1] === 0) {
          visited[i + 1] = 1;
          queue[sp++] = i + 1;
        }
        if (i >= w && visited[i - w] === 0 && binary[i - w] === 0) {
          visited[i - w] = 1;
          queue[sp++] = i - w;
        }
        if (i < n - w && visited[i + w] === 0 && binary[i + w] === 0) {
          visited[i + w] = 1;
          queue[sp++] = i + w;
        }
      }
      if (sp < minPx) {
        for (let j = 0; j < sp; j++) out[queue[j]] = 255;
      }
    }
    return out;
  }
  function whitePointStretchPct(gray, pct) {
    const n = gray.length;
    if (!(n > 0)) return new Uint8ClampedArray(0);
    const p = Math.min(1, Math.max(0, pct));
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) hist[gray[i]] += 1;
    const target = Math.ceil(n * p);
    let acc = 0;
    let pivot = 255;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) {
        pivot = v;
        break;
      }
    }
    if (pivot <= 0) return gray.slice();
    const scale = 255 / pivot;
    const out = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) {
      const v = Math.round(gray[i] * scale);
      out[i] = v > 255 ? 255 : v;
    }
    return out;
  }
  function whitePointStretch(gray) {
    return whitePointStretchPct(gray, 0.97);
  }
  function textClaroContrast(gray, contrast = TEXT_CLARO_CONTRAST, pivot = TEXT_CLARO_PIVOT) {
    const n = gray.length;
    const out = new Uint8ClampedArray(n);
    if (!(n > 0)) return out;
    for (let i = 0; i < n; i++) {
      const v = gray[i] / 255;
      out[i] = ((v - pivot) * contrast + pivot) * 255;
    }
    return out;
  }
  function enhanceMime(mode) {
    return mode === "raw" || mode === "text" || mode === "bw" ? "image/png" : "image/jpeg";
  }

  // src/scanner/workers/enhanceJs.ts
  var ILLUM_KERNEL = Math.max(3, Math.floor(ILLUM_MAP_LONG_SIDE / 32)) % 2 === 0 ? Math.max(3, Math.floor(ILLUM_MAP_LONG_SIDE / 32)) - 1 : Math.max(3, Math.floor(ILLUM_MAP_LONG_SIDE / 32));
  function rgbaToGray(data, w, h) {
    const n = w * h;
    if (!(n > 0) || data.length < n * 4) return new Uint8ClampedArray(0);
    const out = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      out[i] = data[o] * 77 + data[o + 1] * 150 + data[o + 2] * 29 >> 8;
    }
    return out;
  }
  function grayToRgba(gray, w, h) {
    const n = w * h;
    if (!(n > 0) || gray.length < n) return new Uint8ClampedArray(0);
    const out = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      const v = gray[i];
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = 255;
    }
    return out;
  }
  var SRGB_LIN = (() => {
    const lut = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const c = i / 255;
      lut[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return lut;
  })();
  function cieLightnessFromLinear(y) {
    const eps = 216 / 24389;
    const f = y > eps ? Math.cbrt(y) : y * (841 / 108) + 4 / 29;
    return 116 * f - 16;
  }
  var LAB_L8 = (() => {
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) lut[i] = Math.round(cieLightnessFromLinear(i / 255));
    return lut;
  })();
  function labL8(r, g, b) {
    const y = 0.2126 * SRGB_LIN[r] + 0.7152 * SRGB_LIN[g] + 0.0722 * SRGB_LIN[b];
    return LAB_L8[Math.round(y * 255)];
  }
  function sampleDownscale(gray, w, h, mw, mh) {
    const map = new Float64Array(mw * mh);
    for (let my = 0; my < mh; my++) {
      const y = Math.min(h - 1, Math.floor((my + 0.5) * h / mh));
      for (let mx = 0; mx < mw; mx++) {
        const x = Math.min(w - 1, Math.floor((mx + 0.5) * w / mw));
        map[my * mw + mx] = gray[y * w + x];
      }
    }
    return map;
  }
  function slidingMinMax1D(src, n, k, isMax) {
    const causal = new Float64Array(n);
    const dq = new Int32Array(n);
    let head = 0;
    let tail = 0;
    const better = (a, b) => isMax ? a >= b : a <= b;
    for (let i = 0; i < n; i++) {
      while (tail > head && better(src[i], src[dq[tail - 1]])) tail--;
      dq[tail] = i;
      tail++;
      while (dq[head] <= i - k) head++;
      causal[i] = src[dq[head]];
    }
    const half = k - 1 >> 1;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const e = Math.min(n - 1, i + half);
      out[i] = causal[e];
    }
    return out;
  }
  function morphClose(map, mw, mh, k) {
    const hmax = new Float64Array(mw * mh);
    for (let y = 0; y < mh; y++) {
      const row = slidingMinMax1D(map.subarray(y * mw, (y + 1) * mw), mw, k, true);
      hmax.set(row, y * mw);
    }
    const dil = new Float64Array(mw * mh);
    for (let x = 0; x < mw; x++) {
      const col = new Float64Array(mh);
      for (let y = 0; y < mh; y++) col[y] = hmax[y * mw + x];
      const r = slidingMinMax1D(col, mh, k, true);
      for (let y = 0; y < mh; y++) dil[y * mw + x] = r[y];
    }
    const hmin = new Float64Array(mw * mh);
    for (let y = 0; y < mh; y++) {
      const row = slidingMinMax1D(dil.subarray(y * mw, (y + 1) * mw), mw, k, false);
      hmin.set(row, y * mw);
    }
    const ero = new Float64Array(mw * mh);
    for (let x = 0; x < mw; x++) {
      const col = new Float64Array(mh);
      for (let y = 0; y < mh; y++) col[y] = hmin[y * mw + x];
      const r = slidingMinMax1D(col, mh, k, false);
      for (let y = 0; y < mh; y++) ero[y * mw + x] = r[y];
    }
    return ero;
  }
  function estimateIlluminationMap(gray, w, h) {
    const scale = Math.min(1, ILLUM_MAP_LONG_SIDE / Math.max(w, h));
    const mw = Math.max(1, Math.round(w * scale));
    const mh = Math.max(1, Math.round(h * scale));
    const reduced = sampleDownscale(gray, w, h, mw, mh);
    const map = mw * mh <= 1 ? reduced : morphClose(reduced, mw, mh, ILLUM_KERNEL);
    return { map, mw, mh };
  }
  function estimateShadowModel(gray, w, h) {
    const { map, mw, mh } = estimateIlluminationMap(gray, w, h);
    let acc = 0;
    for (let i = 0; i < map.length; i++) acc += map[i];
    const mean2 = map.length > 0 ? acc / map.length : 255;
    const gains = new Float32Array(map.length);
    for (let i = 0; i < map.length; i++) {
      gains[i] = map[i] > 0 ? mean2 / map[i] : 1;
    }
    const xMap = new Uint16Array(w);
    const yMap = new Uint16Array(h);
    for (let x = 0; x < w; x++) xMap[x] = Math.min(mw - 1, Math.floor(x * mw / w));
    for (let y = 0; y < h; y++) yMap[y] = Math.min(mh - 1, Math.floor(y * mh / h));
    return { gains, xMap, yMap, mw };
  }
  function flatFieldModel(gray, w, h, floor = FF_FLOOR_DEFAULT) {
    const { map, mw, mh } = estimateIlluminationMap(gray, w, h);
    const f = floor > 1 ? floor : 1;
    const gains = new Float32Array(map.length);
    for (let i = 0; i < map.length; i++) {
      const b = map[i] > f ? map[i] : f;
      gains[i] = 255 / b;
    }
    const xMap = new Uint16Array(w);
    const yMap = new Uint16Array(h);
    for (let x = 0; x < w; x++) xMap[x] = Math.min(mw - 1, Math.floor(x * mw / w));
    for (let y = 0; y < h; y++) yMap[y] = Math.min(mh - 1, Math.floor(y * mh / h));
    return { gains, xMap, yMap, mw };
  }
  function correctedGrayWithModel(gray, model, w, h) {
    // F-TEXT-SMOOTH: muestreo BILINEAR del mapa de ganancias (antes nearest:
    // cada celda del mapa de ~800 px era un bloque de ~5 px con ganancia
    // saltante → píxeles feos en el papel). Bilinear = fondo parejo.
    const out = new Uint8ClampedArray(w * h);
    const mw = model.mw > 0 ? model.mw : 1;
    const mh = Math.max(1, Math.floor(model.gains.length / mw));
    const gains = model.gains;
    const x0Arr = new Int32Array(w);
    const x1Arr = new Int32Array(w);
    const txArr = new Float64Array(w);
    for (let x = 0; x < w; x++) {
      const fx = (x * mw) / w;
      const x0 = Math.min(mw - 1, Math.floor(fx));
      x0Arr[x] = x0;
      x1Arr[x] = x0 + 1 < mw ? x0 + 1 : x0;
      txArr[x] = Math.min(1, Math.max(0, fx - x0));
    }
    for (let y = 0; y < h; y++) {
      const fy = (y * mh) / h;
      const y0 = Math.min(mh - 1, Math.floor(fy));
      const y1 = y0 + 1 < mh ? y0 + 1 : y0;
      const ty = Math.min(1, Math.max(0, fy - y0));
      const r0 = y0 * mw;
      const r1 = y1 * mw;
      const rowOut = y * w;
      for (let x = 0; x < w; x++) {
        const x0 = x0Arr[x];
        const x1 = x1Arr[x];
        const tx = txArr[x];
        const g00 = gains[r0 + x0];
        const g01 = gains[r0 + x1];
        const g10 = gains[r1 + x0];
        const g11 = gains[r1 + x1];
        const top = g00 + (g01 - g00) * tx;
        const bottom = g10 + (g11 - g10) * tx;
        out[rowOut + x] = gray[rowOut + x] * (top + (bottom - top) * ty);
      }
    }
    return out;
  }
  function labL8WithModel(data, model, w, h) {
    const out = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      const row = model.yMap[y] * model.mw;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const o = i * 4;
        const mx = model.xMap[x];
        const gain = model.gains[row + mx];
        out[i] = labL8(
          Math.min(255, Math.round(data[o] * gain)),
          Math.min(255, Math.round(data[o + 1] * gain)),
          Math.min(255, Math.round(data[o + 2] * gain))
        );
      }
    }
    return out;
  }
  function applyModelAndGainToRgba(data, model, gain, w, h) {
    // F-TEXT-SMOOTH: bilinear (ver correctedGrayWithModel) + tope del factor
    // total (8) para amortiguar outliers de ruido sin cambiar el look.
    const out = new Uint8ClampedArray(w * h * 4);
    const mw = model.mw > 0 ? model.mw : 1;
    const mh = Math.max(1, Math.floor(model.gains.length / mw));
    const gains = model.gains;
    const x0Arr = new Int32Array(w);
    const x1Arr = new Int32Array(w);
    const txArr = new Float64Array(w);
    for (let x = 0; x < w; x++) {
      const fx = (x * mw) / w;
      const x0 = Math.min(mw - 1, Math.floor(fx));
      x0Arr[x] = x0;
      x1Arr[x] = x0 + 1 < mw ? x0 + 1 : x0;
      txArr[x] = Math.min(1, Math.max(0, fx - x0));
    }
    for (let y = 0; y < h; y++) {
      const fy = (y * mh) / h;
      const y0 = Math.min(mh - 1, Math.floor(fy));
      const y1 = y0 + 1 < mh ? y0 + 1 : y0;
      const ty = Math.min(1, Math.max(0, fy - y0));
      const r0 = y0 * mw;
      const r1 = y1 * mw;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const o = i * 4;
        const x0 = x0Arr[x];
        const x1 = x1Arr[x];
        const tx = txArr[x];
        const g00 = gains[r0 + x0];
        const g01 = gains[r0 + x1];
        const g10 = gains[r1 + x0];
        const g11 = gains[r1 + x1];
        const top = g00 + (g01 - g00) * tx;
        const bottom = g10 + (g11 - g10) * tx;
        const gBil = top + (bottom - top) * ty;
        const factor = Math.min(8, Math.max(0, gBil * gain[i]));
        out[o] = data[o] * factor;
        out[o + 1] = data[o + 1] * factor;
        out[o + 2] = data[o + 2] * factor;
        out[o + 3] = data[o + 3];
      }
    }
    return out;
  }
  function claheGray(gray, w, h, clipLimit = 2, tiles = 8) {
    const n = w * h;
    if (!(n > 0) || gray.length < n) return new Uint8ClampedArray(0);
    const T = Math.max(1, tiles);
    const cellW = Math.ceil(w / T);
    const cellH = Math.ceil(h / T);
    const hist = [];
    for (let t = 0; t < T * T; t++) hist.push(new Uint32Array(256));
    for (let y = 0; y < h; y++) {
      const ty2 = Math.min(T - 1, Math.floor(y / cellH));
      for (let x = 0; x < w; x++) {
        const tx = Math.min(T - 1, Math.floor(x / cellW));
        hist[ty2 * T + tx][gray[y * w + x]] += 1;
      }
    }
    const tilePx = cellW * cellH;
    const clip = Math.max(1, Math.floor(clipLimit * tilePx / 256));
    const luts = [];
    for (let t = 0; t < T * T; t++) {
      const hh = hist[t];
      let excess = 0;
      for (let b = 0; b < 256; b++) {
        if (hh[b] > clip) {
          excess += hh[b] - clip;
          hh[b] = clip;
        }
      }
      const redist = Math.floor(excess / 256);
      let rem = excess % 256;
      for (let b = 0; b < 256; b++) {
        hh[b] += redist + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
      }
      const lut = new Float32Array(256);
      let acc = 0;
      const total = tilePx;
      for (let b = 0; b < 256; b++) {
        acc += hh[b];
        lut[b] = acc / total * 255;
      }
      luts.push(lut);
    }
    const out = new Uint8ClampedArray(n);
    let ty = 0;
    let nextY = cellH;
    for (let y = 0; y < h; y++) {
      if (y >= nextY && ty < T - 1) {
        ty++;
        nextY += cellH;
      }
      const row = ty * T;
      let tx = 0;
      let nextX = cellW;
      for (let x = 0; x < w; x++) {
        if (x >= nextX && tx < T - 1) {
          tx++;
          nextX += cellW;
        }
        out[y * w + x] = luts[row + tx][gray[y * w + x]];
      }
    }
    return out;
  }
  function enhanceToRgba(data, w, h, mode, opts = {}) {
    const n = w * h;
    if (!(n > 0) || data.length < n * 4) return new Uint8ClampedArray(0);
    if (mode === "raw") {
      const out = data.slice(0, n * 4);
      for (let i = 3; i < out.length; i += 4) out[i] = 255;
      return out;
    }
    const gray = rgbaToGray(data, w, h);
    const shadow = opts.flatField === true && mode !== "natural" ? flatFieldModel(gray, w, h, opts.flatFieldFloor ?? FF_FLOOR_DEFAULT) : estimateShadowModel(gray, w, h);
    if (mode === "bw") {
      const grayS = correctedGrayWithModel(gray, shadow, w, h);
      const bin = opts.bwMethod === "sauvola" ? sauvola(
        grayS,
        w,
        h,
        opts.bwSauvolaK ?? BW_SAUVOLA_K,
        BW_SAUVOLA_R,
        opts.bwWindowRatio ?? BW_WINDOW_RATIO
      ) : bradleyRoth(
        grayS,
        w,
        h,
        opts.bwT ?? BW_T,
        opts.bwWindowRatio ?? BW_WINDOW_RATIO
      );
      const clean = opts.bwDespecklePx !== 0 ? despeckleBinary(bin, w, h, opts.bwDespecklePx ?? BW_DESPECKLE_PX) : bin;
      return grayToRgba(clean, w, h);
    }
    if (mode === "gray") {
      const grayS = correctedGrayWithModel(gray, shadow, w, h);
      return grayToRgba(whitePointStretchPct(grayS, opts.grayWhitePct ?? 0.97), w, h);
    }
    if (mode === "text") {
      const grayS = correctedGrayWithModel(gray, shadow, w, h);
      const wp = whitePointStretchPct(grayS, opts.textWhitePct ?? TEXT_CLARO_WHITE_PCT);
      const ink = textClaroContrast(wp, opts.textContrast, opts.textPivot);
      const bp = opts.textBlackPoint ?? TEXT_CLARO_BLACK_POINT;
      const gainW = new Float32Array(n);
      if (bp > 0) {
        const k = 1 / (1 - bp);
        for (let i = 0; i < n; i++) {
          const v = ink[i] / 255;
          const lv = v <= bp ? 0 : (v - bp) * k;
          ink[i] = lv * 255;
        }
      }
      for (let i = 0; i < n; i++) {
        const src = grayS[i];
        // F-TEXT-SMOOTH: tope por píxel — una muestra oscura del papel ya
        // no se convierte en un punto brillante (ruido amplificado).
        gainW[i] = src > 0 ? Math.min(4, ink[i] / src) : 1;
      }
      return applyModelAndGainToRgba(data, shadow, gainW, w, h);
    }
    if (mode === "natural") {
      const grayS = correctedGrayWithModel(gray, shadow, w, h);
      const wp = whitePointStretch(grayS);
      const gainW = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const src = grayS[i];
        gainW[i] = src > 0 ? wp[i] / src : 1;
      }
      return applyModelAndGainToRgba(data, shadow, gainW, w, h);
    }
    const L = labL8WithModel(data, shadow, w, h);
    const Lc = claheGray(L, w, h, 2, 8);
    const gainL = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const src = L[i];
      gainL[i] = src > 0 ? Lc[i] / src : 1;
    }
    return applyModelAndGainToRgba(data, shadow, gainL, w, h);
  }

  // src/scanner/workers/pipeline.ts
  var CANNY_LOW = 50;
  var CANNY_HIGH = 150;
  var APPROX_EPSILON_RATIO = 0.02;
  // F-PERSP — cascada de detección: cada pasada intenta encontrar el quad
  // con parámetros distintos ANTES de dar el frame por inválido. La 1ª es
  // idéntica al pipeline histórico (coste cero en el caso feliz); las
  // siguientes rescatan papeles con poco contraste (Canny suave), bordes
  // rotos (dilate) y esquinas sobre-suavizadas (epsilon fino). Sobreviven
  // los mismos validadores (área ≥10%, convexidad, lados ≥5%).
  var DETECT_PASSES = [
    { low: CANNY_LOW, high: CANNY_HIGH, dilate: 0, eps: APPROX_EPSILON_RATIO },
    { low: CANNY_LOW, high: CANNY_HIGH, dilate: 2, eps: APPROX_EPSILON_RATIO },
    { low: CANNY_LOW, high: CANNY_HIGH, dilate: 2, eps: APPROX_EPSILON_RATIO * 2.5 },
    { low: 30, high: 90, dilate: 0, eps: APPROX_EPSILON_RATIO * 0.6 },
    { low: 30, high: 90, dilate: 2, eps: APPROX_EPSILON_RATIO },
    { low: 20, high: 60, dilate: 2, eps: APPROX_EPSILON_RATIO * 1.5 }
  ];
  var MIN_CONTOUR_AREA_PCT = 5e-3;
  var MAX_CONTOUR_CANDIDATES = 8;
  var MIN_EDGE_POINTS = 20;
  var docProfile = "auto";
  function setDocProfile(p) {
    docProfile = p;
  }
  function pointInQuad(q, x, y) {
    let pos = false;
    let neg = false;
    for (let i = 0; i < 4; i++) {
      const a = q[i];
      const b = q[(i + 1) % 4];
      const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
      if (cross > 0) pos = true;
      else if (cross < 0) neg = true;
    }
    return !(pos && neg);
  }
  function whitenessOfQuad(imageData, pts, procW, procH) {
    let ordered;
    try {
      ordered = orderPoints(pts);
    } catch {
      return void 0;
    }
    const xs = ordered.map((c) => c.x);
    const ys = ordered.map((c) => c.y);
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const x1 = Math.min(procW - 1, Math.ceil(Math.max(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(procH - 1, Math.ceil(Math.max(...ys)));
    const data = imageData.data;
    let sum = 0;
    let count = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!pointInQuad(ordered, x + 0.5, y + 0.5)) continue;
        const i = (y * procW + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        const sat = (mx - mn) / Math.max(mx, 1);
        const wpx = luma / 255 * (1 - sat * 2.2);
        sum += wpx > 0 ? wpx : 0;
        count++;
      }
    }
    return count > 0 ? sum / count : void 0;
  }
  function clampRect(x0, y0, x1, y1, w, h) {
    const x = Math.max(0, Math.min(x0, x1));
    const y = Math.max(0, Math.min(y0, y1));
    const xe = Math.min(w, Math.max(x0, x1));
    const ye = Math.min(h, Math.max(y0, y1));
    if (xe - x < 1 || ye - y < 1) return null;
    return { x, y, width: xe - x, height: ye - y };
  }
  function toFractions(q, frameW, frameH) {
    const out = new Float32Array(8);
    for (let i = 0; i < 4; i++) {
      out[2 * i] = q[i].x / frameW;
      out[2 * i + 1] = q[i].y / frameH;
    }
    return out;
  }
  function collectQuadCandidates(cv, edges, imageData, procW, procH, sx, sy, epsRatio) {
    const contours = cv.createMatVector();
    const hierarchy = cv.createMat();
    try {
      cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
      const n = cv.contourCount(contours);
      const minArea = procW * procH * MIN_CONTOUR_AREA_PCT;
      const cands = [];
      for (let i = 0; i < n; i++) {
        const cnt = cv.getContour(contours, i);
        const area = cv.contourArea(cnt);
        if (area < minArea) {
          cnt.delete();
          continue;
        }
        cands.push({ cnt, area });
      }
      cands.sort((a, b) => b.area - a.area);
      const polys = [];
      const top = cands.slice(0, MAX_CONTOUR_CANDIDATES);
      for (const { cnt, area } of top) {
        const peri = cv.arcLength(cnt, true);
        const approx = cv.createMat();
        try {
          cv.approxPolyDP(cnt, approx, epsRatio * peri, true);
          if (approx.rows !== 4) continue;
          const pts = [
            { x: approx.data32S[0], y: approx.data32S[1] },
            { x: approx.data32S[2], y: approx.data32S[3] },
            { x: approx.data32S[4], y: approx.data32S[5] },
            { x: approx.data32S[6], y: approx.data32S[7] }
          ];
          const whiteness = whitenessOfQuad(imageData, pts, procW, procH);
          polys.push({ points: scalePoly(pts, sx, sy), area: area * sx * sy, whiteness });
        } finally {
          approx.delete();
          cnt.delete();
        }
      }
      for (const { cnt } of cands.slice(MAX_CONTOUR_CANDIDATES)) {
        cnt.delete();
      }
      return { polys, contourCount: n };
    } finally {
      contours.delete();
      hierarchy.delete();
    }
  }
  function processFrame(cv, imageData, frameW, frameH, ts, canny = null) {
    const procW = imageData.width;
    const procH = imageData.height;
    const sx = frameW / procW;
    const sy = frameH / procH;
    return withMats((track) => {
      const rgba = track(cv.matFromImageData(imageData));
      const gray = track(cv.createMat());
      cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
      const blur = track(cv.createMat());
      cv.GaussianBlur(gray, blur, cv.createSize(5, 5), 0, 0);
      const edges = track(cv.createMat());
      const kernel = track(
        cv.getStructuringElement(cv.MORPH_RECT, cv.createSize(3, 3))
      );
      const dilated = track(cv.createMat());
      const profileOpts = { profile: docProfile };
      // F-PERSP: cascada DETECT_PASSES (ver comentario arriba). La pasada
      // explícita `canny` (llamadores externos) se respeta como 1ª pasada.
      const passes = canny
        ? [{ low: canny.low, high: canny.high, dilate: 0, eps: APPROX_EPSILON_RATIO }].concat(DETECT_PASSES)
        : DETECT_PASSES;
      let collected = null;
      let quad = null;
      for (const pass of passes) {
        cv.Canny(blur, edges, pass.low, pass.high);
        let srcEdges = edges;
        if (pass.dilate > 0) {
          cv.dilate(edges, dilated, kernel, pass.dilate);
          srcEdges = dilated;
        }
        collected = collectQuadCandidates(
          cv,
          srcEdges,
          imageData,
          procW,
          procH,
          sx,
          sy,
          pass.eps
        );
        quad = selectQuad(collected.polys, frameW, frameH, TOP_CONTOURS, profileOpts);
        if (quad !== null) break;
      }
      let statSrc = gray;
      if (quad !== null) {
        const xs = quad.map((c) => c.x);
        const ys = quad.map((c) => c.y);
        const rect = clampRect(
          Math.min(...xs) / sx,
          Math.min(...ys) / sy,
          Math.max(...xs) / sx,
          Math.max(...ys) / sy,
          procW,
          procH
        );
        if (rect !== null) {
          statSrc = track(cv.roi(gray, rect));
        }
      }
      const lap = track(cv.createMat());
      cv.Laplacian(statSrc, lap, cv.CV_64F);
      const mean2 = track(cv.createMat());
      const stddev = track(cv.createMat());
      cv.meanStdDev(lap, mean2, stddev);
      const s = stddev.doubleAt(0, 0);
      cv.meanStdDev(statSrc, mean2, stddev);
      const sd = stddev.doubleAt(0, 0);
      const md = mean2.doubleAt(0, 0);
      const qualityInput = {
        laplacianVar: Number.isFinite(s) ? s * s : null,
        cropMean: Number.isFinite(md) ? md : null,
        cropStdDev: Number.isFinite(sd) ? sd : null,
        frameW,
        frameH,
        diag: { contourCount: collected.contourCount }
      };
      return {
        type: "result",
        corners: quad === null ? null : toFractions(quad, frameW, frameH),
        qualityInput,
        ts
      };
    });
  }
  function warpPage(cv, foto, quadPx, outW, outH, opts = {}) {
    return withMats((track) => {
      const src = track(cv.matFromImageData(foto));
      const M = track(
        cv.getPerspectiveTransform(quadPx, [
          { x: 0, y: 0 },
          { x: outW, y: 0 },
          { x: outW, y: outH },
          { x: 0, y: outH }
        ])
      );
      const warped = track(cv.createMat());
      cv.warpPerspective(src, warped, M, cv.createSize(outW, outH), cv.INTER_CUBIC);
      if (opts.unsharp === false) {
        return {
          width: outW,
          height: outH,
          data: cv.matDataRGBA(warped, outW, outH)
        };
      }
      const blur = track(cv.createMat());
      cv.GaussianBlur(
        warped,
        blur,
        cv.createSize(UNSHARP_KERNEL_SIZE, UNSHARP_KERNEL_SIZE),
        UNSHARP_RADIUS,
        UNSHARP_RADIUS
      );
      const sharp = track(cv.createMat());
      cv.addWeighted(warped, 1 + UNSHARP_AMOUNT, blur, -UNSHARP_AMOUNT, 0, sharp);
      return {
        width: outW,
        height: outH,
        data: cv.matDataRGBA(sharp, outW, outH)
      };
    });
  }
  function unsharpRgba(cv, foto) {
    return withMats((track) => {
      const src = track(cv.matFromImageData(foto));
      const blur = track(cv.createMat());
      cv.GaussianBlur(
        src,
        blur,
        cv.createSize(UNSHARP_KERNEL_SIZE, UNSHARP_KERNEL_SIZE),
        UNSHARP_RADIUS,
        UNSHARP_RADIUS
      );
      const sharp = track(cv.createMat());
      cv.addWeighted(src, 1 + UNSHARP_AMOUNT, blur, -UNSHARP_AMOUNT, 0, sharp);
      return {
        width: foto.width,
        height: foto.height,
        data: cv.matDataRGBA(sharp, foto.width, foto.height)
      };
    });
  }
  function applyMode(_cv, warped, mode, outW, outH, opts = {}) {
    const src = warped instanceof Uint8ClampedArray ? warped : warped.data ?? new Uint8ClampedArray(0);
    if (outW <= 0 || outH <= 0 || src.length < outW * outH * 4) {
      return { width: outW, height: outH, data: new Uint8ClampedArray(0) };
    }
    return {
      width: outW,
      height: outH,
      data: enhanceToRgba(src, outW, outH, mode, opts)
    };
  }
  function extractBandEdges(cv, foto, bands) {
    return withMats((track) => {
      const src = track(cv.matFromImageData(foto));
      const gray = track(cv.createMat());
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      return bands.map((b) => {
        const crop = track(cv.roi(gray, b));
        const edges = track(cv.createMat());
        cv.Canny(crop, edges, CANNY_LOW, CANNY_HIGH);
        const px = cv.matDataU8(edges, b.width, b.height);
        const cap = MIN_EDGE_POINTS * 100;
        const stride = Math.max(1, Math.floor(b.width * b.height / cap));
        const points = [];
        for (let i = 0; i < px.length; i += stride) {
          if (px[i] > 0) {
            if (points.length >= cap) break;
            points.push({ x: b.x + i % b.width, y: b.y + Math.floor(i / b.width) });
          }
        }
        return { side: b.side, points };
      });
    });
  }
  var DEAD_LINE = { a: 0, b: 0, c: 0 };
  var REFINE_CORNER_MARGIN_RATIO = 0.05;
  function refineQuad(cv, foto, quadPx) {
    const bands = computeBandRects(quadPx, foto.width, foto.height);
    if (bands.length === 0) {
      return { quad: quadPx, fellBack: [true, true, true, true] };
    }
    const edges = extractBandEdges(cv, foto, bands);
    const bySide = /* @__PURE__ */ new Map();
    for (const e of edges) bySide.set(e.side, e.points);
    const lines = [DEAD_LINE, DEAD_LINE, DEAD_LINE, DEAD_LINE];
    for (let s = 0; s < 4; s++) {
      const pts = bySide.get(s) ?? [];
      if (pts.length < MIN_EDGE_POINTS) continue;
      try {
        lines[s] = fitLineRansac(pts);
      } catch {
        try {
          lines[s] = fitLineTrimmed(pts);
        } catch {
        }
      }
    }
    const ref = refineQuadFromLines(lines[0], lines[1], lines[2], lines[3], quadPx);
    const m = REFINE_CORNER_MARGIN_RATIO * Math.hypot(foto.width, foto.height);
    const inBounds = (c) => c.x >= -m && c.x <= foto.width + m && c.y >= -m && c.y <= foto.height + m;
    const sideBandW = /* @__PURE__ */ new Map();
    for (const b of bands) sideBandW.set(b.side, b.bandW);
    const capFor = (i) => 2 * Math.max(
      sideBandW.get((i + 3) % 4) ?? BAND_MIN_PX,
      sideBandW.get(i) ?? BAND_MIN_PX
    );
    const quad = [...ref.quad];
    const fellBack = [...ref.fellBack];
    for (let i = 0; i < 4; i++) {
      const displaced = Math.hypot(quad[i].x - quadPx[i].x, quad[i].y - quadPx[i].y) > capFor(i);
      if (inBounds(quad[i]) && !displaced) continue;
      quad[i] = { ...quadPx[i] };
      fellBack[(i + 3) % 4] = true;
      fellBack[i] = true;
    }
    return { quad, fellBack };
  }

  // src/scanner/workers/protocol.ts
  var OPENCV_CDN_URL = "https://docs.opencv.org/4.5.5/opencv.js";
  var OPENCV_VENDOR_FILENAME = "opencv-4.5.5.js";
  function opencvCandidateUrls(workerScriptUrl) {
    const out = [];
    for (const rel of [`../../vendor/${OPENCV_VENDOR_FILENAME}`, `../vendor/${OPENCV_VENDOR_FILENAME}`]) {
      const u = new URL(rel, workerScriptUrl);
      if (!out.includes(u.href)) out.push(u.href);
    }
    out.push(OPENCV_CDN_URL);
    return out;
  }

  // src/scanner/workers/detection.worker.ts
  function post(msg, transfer) {
    self.postMessage(msg, transfer);
  }
  function memorySnapshot() {
    const perf = performance;
    const memory = cvRuntime?.memory;
    return {
      jsHeapBytes: perf.memory?.usedJSHeapSize ?? null,
      wasmBytes: memory?.buffer?.byteLength ?? null
    };
  }
  function adaptCv(cv) {
    return {
      COLOR_RGBA2GRAY: cv.COLOR_RGBA2GRAY,
      RETR_LIST: cv.RETR_LIST,
      RETR_EXTERNAL: cv.RETR_EXTERNAL,
      CHAIN_APPROX_SIMPLE: cv.CHAIN_APPROX_SIMPLE,
      CV_64F: cv.CV_64F,
      matFromImageData: (img) => cv.matFromImageData(img),
      createMat: () => new cv.Mat(),
      createMatVector: () => new cv.MatVector(),
      createSize: (w, h) => new cv.Size(w, h),
      cvtColor: (s, d, c) => cv.cvtColor(s, d, c),
      GaussianBlur: (s, d, k, x, y) => cv.GaussianBlur(s, d, k, x, y),
      Canny: (s, d, t1, t2) => cv.Canny(s, d, t1, t2),
      findContours: (img, c, h, m1, m2) => cv.findContours(img, c, h, m1, m2),
      contourCount: (v) => v.size(),
      getContour: (v, i) => v.get(i),
      contourArea: (m) => cv.contourArea(m),
      arcLength: (m, closed) => cv.arcLength(m, closed),
      approxPolyDP: (s, d, eps, closed) => cv.approxPolyDP(s, d, eps, closed),
      Laplacian: (s, d, depth) => cv.Laplacian(s, d, depth),
      meanStdDev: (s, m, v) => cv.meanStdDev(s, m, v),
      roi: (m, r) => m.roi(
        new cv.Rect(r.x, r.y, r.width, r.height)
      ),
      INTER_CUBIC: cv.INTER_CUBIC,
      // Los Mats 4×2 temporales nacen y mueren AQUÍ (try/finally); el H
      // retornado lo registra el llamador en withMats().
      getPerspectiveTransform: (src, dst) => {
        const flat = (q) => [
          q[0].x,
          q[0].y,
          q[1].x,
          q[1].y,
          q[2].x,
          q[2].y,
          q[3].x,
          q[3].y
        ];
        const s = cv.matFromArray(4, 2, cv.CV_32F, flat(src));
        const d = cv.matFromArray(4, 2, cv.CV_32F, flat(dst));
        try {
          return cv.getPerspectiveTransform(s, d);
        } finally {
          s.delete();
          d.delete();
        }
      },
      warpPerspective: (src, dst, M, dsize, flags) => {
        const size = new cv.Size(dsize.width, dsize.height);
        cv.warpPerspective(
          src,
          dst,
          M,
          size,
          flags
        );
      },
      addWeighted: (s1, a, s2, b, g, dst) => cv.addWeighted(s1, a, s2, b, g, dst),
      // [F5-CROP fallback] dilatación del edge map (3×3 ×N) para puentear
      // los gaps del borde de un papel inclinado (evidencia issue #2).
      MORPH_RECT: cv.MORPH_RECT,
      getStructuringElement: (shape, ksize) => cv.getStructuringElement(shape, new cv.Size(ksize.width, ksize.height)),
      dilate: (src, dst, kernel, iterations) => cv.dilate(
        src,
        dst,
        kernel,
        new cv.Point(-1, -1),
        iterations
      ),
      // COPIA a Uint8ClampedArray: el buffer WASM se reutiliza tras withMats().
      matDataRGBA: (m, w, h) => {
        const raw = m.data;
        if (raw.length < w * h * 4) throw new Error("matDataRGBA: Mat menor que la salida");
        return new Uint8ClampedArray(raw.slice(0, w * h * 4));
      },
      // COPIA U8 de un canal (mapa Canny 0/255): mismo buffer reutilizable.
      matDataU8: (m, w, h) => {
        const raw = m.data;
        if (raw.length < w * h) throw new Error("matDataU8: Mat menor que la banda");
        return raw.slice(0, w * h);
      }
    };
  }
  var cvApi = null;
  var cvRuntime = null;
  var busy = false;
  var canvas = null;
  var warpCanvas = null;
  var enhanceCanvas = null;
  function probeCvSurface(cv) {
    const isFn = (k) => {
      const v = cv[k];
      return typeof v === "function";
    };
    const isNum = (k) => {
      const v = cv[k];
      return typeof v === "number";
    };
    return {
      createCLAHE: isFn("createCLAHE"),
      COLOR_RGBA2Lab: isNum("COLOR_RGBA2Lab"),
      COLOR_RGB2Lab: isNum("COLOR_RGB2Lab"),
      COLOR_Lab2RGB: isNum("COLOR_Lab2RGB"),
      dilate: isFn("dilate"),
      erode: isFn("erode"),
      divide: isFn("divide"),
      medianBlur: isFn("medianBlur"),
      threshold: isFn("threshold"),
      morphologyEx: isFn("morphologyEx"),
      getStructuringElement: isFn("getStructuringElement"),
      MORPH_RECT: isNum("MORPH_RECT"),
      MORPH_CLOSE: isNum("MORPH_CLOSE"),
      resize: isFn("resize"),
      INTER_AREA: isNum("INTER_AREA"),
      INTER_LINEAR: isNum("INTER_LINEAR"),
      boxFilter: isFn("boxFilter"),
      blur: isFn("blur"),
      split: isFn("split"),
      merge: isFn("merge")
    };
  }
  function isFractions8(c) {
    if (c === null || c === void 0 || c.length !== 8) return false;
    for (let i = 0; i < 8; i++) {
      if (!Number.isFinite(c[i])) return false;
    }
    return true;
  }
  post({ type: "boot", pct: 5 });
  function loadOpenCv() {
    const wself = self;
    const candidates = opencvCandidateUrls(wself.location.href);
    const tried = [];
    for (const url of candidates) {
      try {
        tried.push(url);
        importScripts(url);
        return url;
      } catch {
      }
    }
    throw new Error(`carga opencv.js fall\xF3 en ${tried.length} candidatos: ${tried.join(" | ")}`);
  }
  var opencvLoadedUrl;
  try {
    const holder = self;
    holder.Module = holder.Module ?? {};
    holder.Module.onRuntimeInitialized = () => {
      const cv = self["cv"];
      if (cv === void 0 || cv === null) {
        post({ type: "error", message: "opencv.js carg\xF3 pero `cv` es undefined" });
        return;
      }
      cvRuntime = cv;
      cvApi = adaptCv(cv);
      post({ type: "ready", probe: probeCvSurface(cv), opencvUrl: opencvLoadedUrl });
    };
    opencvLoadedUrl = loadOpenCv();
  } catch (e) {
    post({ type: "error", message: `carga opencv.js fall\xF3: ${e instanceof Error ? e.message : String(e)}` });
  }
  self.onmessage = (ev) => {
    const msg = ev.data;
    if (msg.type === "config") {
      if (msg.docProfile !== void 0) setDocProfile(msg.docProfile);
      if (Number.isFinite(msg.maxWarpLongSide) && msg.maxWarpLongSide >= 256) {
        warpMaxLongSide = msg.maxWarpLongSide;
      }
      return;
    }
    if (msg.type === "warp") {
      handleWarp(msg);
      return;
    }
    if (msg.type === "enhance") {
      handleEnhance(msg);
      return;
    }
    if (msg.type !== "detect") return;
    if (cvApi === null) return;
    if (busy) {
      post({ type: "busy", ts: msg.ts });
      return;
    }
    busy = true;
    const bitmap = msg.bitmap;
    try {
      if (canvas === null || canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      }
      const ctx = canvas.getContext("2d");
      if (ctx === null) throw new Error("OffscreenCanvas 2d null");
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const reply = processFrame(cvApi, imageData, bitmap.width, bitmap.height, msg.ts);
      post(reply);
    } catch (e) {
      post({ type: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      try {
        bitmap.close();
      } catch {
      }
      busy = false;
    }
  };
  function handleWarp(msg) {
    if (cvApi === null) return;
    if (busy) {
      post({ type: "busy", ts: msg.ts });
      return;
    }
    busy = true;
    const bitmap = msg.bitmap;
    try {
      if (!isFractions8(msg.quad)) throw new Error("warp: quad no son 8 fracciones finitas");
      if (!(bitmap.width > 0) || !(bitmap.height > 0)) throw new Error("warp: dims de foto inv\xE1lidas");
      if (canvas === null || canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
        canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      }
      const ctx = canvas.getContext("2d");
      if (ctx === null) throw new Error("OffscreenCanvas 2d null");
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      const quadPx = [
        { x: msg.quad[0] * bitmap.width, y: msg.quad[1] * bitmap.height },
        { x: msg.quad[2] * bitmap.width, y: msg.quad[3] * bitmap.height },
        { x: msg.quad[4] * bitmap.width, y: msg.quad[5] * bitmap.height },
        { x: msg.quad[6] * bitmap.width, y: msg.quad[7] * bitmap.height }
      ];
      const manual = msg.manual === true;
      let refQuad = quadPx;
      let fellBack = [true, true, true, true];
      if (!manual) {
        try {
          const ref = refineQuad(cvApi, imageData, quadPx);
          refQuad = ref.quad;
          fellBack = ref.fellBack;
        } catch {
        }
      } else {
        fellBack = null;
      }
      const refined = fellBack !== null && fellBack.some((f) => !f);
      const shrunk = manual ? refQuad : shrinkQuad(refQuad, SHRINK_QUAD_PX);
      const dims = computeWarpDims(shrunk);
      const pix = warpPage(cvApi, imageData, shrunk, dims.w, dims.h, {
        unsharp: false
      });
      if (warpCanvas === null || warpCanvas.width !== dims.w || warpCanvas.height !== dims.h) {
        warpCanvas = new OffscreenCanvas(dims.w, dims.h);
      }
      const octx = warpCanvas.getContext("2d");
      if (octx === null) throw new Error("OffscreenCanvas destino 2d null");
      const img = octx.createImageData(dims.w, dims.h);
      img.data.set(pix.data);
      octx.putImageData(img, 0, 0);
      const outBitmap = warpCanvas.transferToImageBitmap();
      const refinedQuad = new Float32Array(8);
      for (let i = 0; i < 4; i++) {
        refinedQuad[2 * i] = refQuad[i].x / bitmap.width;
        refinedQuad[2 * i + 1] = refQuad[i].y / bitmap.height;
      }
      post(
        {
          type: "warped",
          bitmap: outBitmap,
          w: dims.w,
          h: dims.h,
          ts: msg.ts,
          refinedQuad,
          refined,
          // [F5-MANUAL] null = sin refinado (quad manual): el consumidor
          // (assembleRefinedQuad/fbOf/app mRef) ya tolera null ("sin info").
          fellBack: fellBack === null ? null : [...fellBack]
        },
        [outBitmap]
      );
    } catch (e) {
      post({ type: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      try {
        bitmap.close();
      } catch {
      }
      busy = false;
    }
  }
  async function handleEnhance(msg) {
    if (cvApi === null) return;
    if (busy) {
      post({ type: "busy", ts: msg.ts });
      return;
    }
    busy = true;
    const startedAt = performance.now();
    const bitmap = msg.bitmap;
    try {
      if (!(bitmap.width > 0) || !(bitmap.height > 0)) {
        throw new Error("enhance: dims de warped inv\xE1lidas");
      }
      const maxLong = msg.maxLongSide ?? 0;
      const scale = maxLong > 0 ? Math.min(1, maxLong / Math.max(bitmap.width, bitmap.height)) : 1;
      const tw = Math.max(1, Math.round(bitmap.width * scale));
      const th = Math.max(1, Math.round(bitmap.height * scale));
      if (canvas === null || canvas.width !== tw || canvas.height !== th) {
        canvas = new OffscreenCanvas(tw, th);
      }
      const ctx = canvas.getContext("2d");
      if (ctx === null) throw new Error("OffscreenCanvas 2d null (enhance)");
      ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, tw, th);
      const imageData = ctx.getImageData(0, 0, tw, th);
      let src = imageData.data;
      if (msg.mode !== "raw") {
        try {
          const sharp = unsharpRgba(cvApi, imageData);
          if (sharp.data.length === src.length) src = sharp.data;
        } catch {
        }
      }
      const pix = applyMode(cvApi, src, msg.mode, tw, th, msg.opts ?? {});
      if (pix.data.length === 0) throw new Error("enhance: salida vac\xEDa (dims no cuadran)");
      const mime = enhanceMime(msg.mode);
      if (enhanceCanvas === null || enhanceCanvas.width !== tw || enhanceCanvas.height !== th) {
        enhanceCanvas = new OffscreenCanvas(tw, th);
      }
      const octx = enhanceCanvas.getContext("2d");
      if (octx === null) throw new Error("OffscreenCanvas destino 2d null (enhance)");
      const img = octx.createImageData(tw, th);
      img.data.set(pix.data);
      octx.putImageData(img, 0, 0);
      const quality = msg.quality ?? JPEG_QUALITY;
      const blob = await enhanceCanvas.convertToBlob({
        type: mime,
        quality: mime === "image/jpeg" ? quality : void 0
      });
      post({
        type: "enhanced",
        blob,
        mime,
        w: tw,
        h: th,
        mode: msg.mode,
        elapsedMs: performance.now() - startedAt,
        memory: memorySnapshot(),
        ts: msg.ts
      });
    } catch (e) {
      post({ type: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      try {
        bitmap.close();
      } catch {
      }
      busy = false;
    }
  }
})();
