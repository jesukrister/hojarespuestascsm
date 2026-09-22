/*
 * Motor de reconocimiento óptico de marcas (OMR).
 *
 * Flujo:
 *   1. Imagen a escala de grises.
 *   2. Umbral adaptativo + componentes conexas para encontrar las cuatro
 *      marcas negras de las esquinas.
 *   3. Homografía hoja(mm) → foto(px). Se prueban las cuatro rotaciones y
 *      se elige la que muestra la marca de orientación y un código válido.
 *   4. Se "endereza" la hoja, se corrige la iluminación y se mide qué tan
 *      oscuro está el interior de cada burbuja.
 *   5. Un umbral (automático o manual) decide qué burbujas están marcadas.
 *
 * No depende del DOM: funciona en el navegador y en Node (para las pruebas).
 */
(function (root, factory) {
  const layoutApi =
    root && root.SheetLayout ? root.SheetLayout : typeof require === 'function' ? require('./layout.js') : null;
  const api = factory(layoutApi);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OMR = api;
})(typeof self !== 'undefined' ? self : this, function (SheetLayout) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Utilidades de imagen                                                */
  /* ------------------------------------------------------------------ */

  /** RGBA (Uint8ClampedArray) → { width, height, data: Float32Array 0–255 } */
  function toGray(rgba, width, height) {
    const data = new Float32Array(width * height);
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      data[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    }
    return { width, height, data };
  }

  function integralImage(img) {
    const { width: w, height: h, data } = img;
    const W1 = w + 1;
    const integ = new Float64Array(W1 * (h + 1));
    for (let y = 0; y < h; y++) {
      let rowSum = 0;
      const row = y * w;
      const o = (y + 1) * W1;
      const p = y * W1;
      for (let x = 0; x < w; x++) {
        rowSum += data[row + x];
        integ[o + x + 1] = integ[p + x + 1] + rowSum;
      }
    }
    return integ;
  }

  /** 1 = píxel más oscuro que `ratio` veces el promedio de su vecindario. */
  function adaptiveThreshold(img, win, ratio) {
    const { width: w, height: h, data } = img;
    const integ = integralImage(img);
    const W1 = w + 1;
    const half = Math.max(1, win >> 1);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - half);
      const y1 = Math.min(h - 1, y + half);
      const rTop = y0 * W1;
      const rBot = (y1 + 1) * W1;
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - half);
        const x1 = Math.min(w - 1, x + half);
        const sum = integ[rBot + x1 + 1] - integ[rTop + x1 + 1] - integ[rBot + x0] + integ[rTop + x0];
        const mean = sum / ((x1 - x0 + 1) * (y1 - y0 + 1));
        out[y * w + x] = data[y * w + x] < mean * ratio ? 1 : 0;
      }
    }
    return out;
  }

  /** Componentes conexas (4-vecindad) de una imagen binaria. */
  function findBlobs(bin, w, h) {
    const labels = new Int32Array(w * h);
    const stack = new Int32Array(w * h);
    const blobs = [];
    for (let start = 0; start < bin.length; start++) {
      if (!bin[start] || labels[start]) continue;
      const id = blobs.length + 1;
      let sp = 0;
      stack[sp++] = start;
      labels[start] = id;
      let area = 0, sx = 0, sy = 0;
      let minX = w, minY = h, maxX = 0, maxY = 0;
      while (sp > 0) {
        const p = stack[--sp];
        const x = p % w;
        const y = (p - x) / w;
        area++;
        sx += x;
        sy += y;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x > 0 && bin[p - 1] && !labels[p - 1]) { labels[p - 1] = id; stack[sp++] = p - 1; }
        if (x < w - 1 && bin[p + 1] && !labels[p + 1]) { labels[p + 1] = id; stack[sp++] = p + 1; }
        if (y > 0 && bin[p - w] && !labels[p - w]) { labels[p - w] = id; stack[sp++] = p - w; }
        if (y < h - 1 && bin[p + w] && !labels[p + w]) { labels[p + w] = id; stack[sp++] = p + w; }
      }
      blobs.push({
        area,
        x: sx / area,
        y: sy / area,
        minX, minY, maxX, maxY,
        border: minX === 0 || minY === 0 || maxX === w - 1 || maxY === h - 1,
      });
    }
    return blobs;
  }

  function sampleBilinear(img, x, y) {
    const { width: w, height: h, data } = img;
    if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 255;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, w - 1);
    const y1 = Math.min(y0 + 1, h - 1);
    const fx = x - x0;
    const fy = y - y0;
    const a = data[y0 * w + x0];
    const b = data[y0 * w + x1];
    const c = data[y1 * w + x0];
    const d = data[y1 * w + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  /* ------------------------------------------------------------------ */
  /* Geometría                                                           */
  /* ------------------------------------------------------------------ */

  function solveLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (Math.abs(M[piv][col]) < 1e-12) return null;
      [M[col], M[piv]] = [M[piv], M[col]];
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col] / M[col][col];
        if (f === 0) continue;
        for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }

  /** Homografía que lleva los 4 puntos `src` a los 4 puntos `dst`. */
  function solveHomography(src, dst) {
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
      const X = src[i].x, Y = src[i].y, x = dst[i].x, y = dst[i].y;
      A.push([X, Y, 1, 0, 0, 0, -x * X, -x * Y]);
      b.push(x);
      A.push([0, 0, 0, X, Y, 1, -y * X, -y * Y]);
      b.push(y);
    }
    const h = solveLinear(A, b);
    return h ? h.concat([1]) : null;
  }

  function project(H, X, Y) {
    const d = H[6] * X + H[7] * Y + H[8];
    return { x: (H[0] * X + H[1] * Y + H[2]) / d, y: (H[3] * X + H[4] * Y + H[5]) / d };
  }

  function polygonArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      a += p.x * q.y - q.x * p.y;
    }
    return Math.abs(a) / 2;
  }

  /** Ordena en sentido horario en pantalla (y hacia abajo). */
  function orderClockwise(pts) {
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return pts.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  }

  function isConvex(pts) {
    let sign = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], c = pts[(i + 2) % pts.length];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) < 1e-9) return false;
      const s = cross > 0 ? 1 : -1;
      if (sign && s !== sign) return false;
      sign = s;
    }
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* Detección de las marcas de las esquinas                             */
  /* ------------------------------------------------------------------ */

  function markerCandidates(blobs, w, h) {
    const minSide = Math.min(w, h);
    const minArea = Math.max(25, Math.pow(minSide * 0.007, 2));
    const maxArea = w * h * 0.03;
    const out = [];
    for (const b of blobs) {
      if (b.border || b.area < minArea || b.area > maxArea) continue;
      const bw = b.maxX - b.minX + 1;
      const bh = b.maxY - b.minY + 1;
      const aspect = bw / bh;
      if (aspect < 0.5 || aspect > 2) continue;
      const fillRatio = b.area / (bw * bh);
      if (fillRatio < 0.45) continue;
      out.push(b);
    }
    out.sort((a, b) => b.area - a.area);
    return out.slice(0, 18);
  }

  function findMarkerQuad(blobs, w, h, layout) {
    const cands = markerCandidates(blobs, w, h);
    if (cands.length < 4) return null;
    const m = layout.markers;
    const sheetQuadArea = polygonArea(m);
    const expected = (layout.markerSize * layout.markerSize) / sheetQuadArea;
    const sheetAspect = Math.min(layout.width, layout.height) / Math.max(layout.width, layout.height);
    let best = null;
    const n = cands.length;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        for (let k = j + 1; k < n; k++)
          for (let l = k + 1; l < n; l++) {
            const set = [cands[i], cands[j], cands[k], cands[l]];
            // cands está ordenado por área descendente.
            if (set[0].area > set[3].area * 3) continue;
            const pts = orderClockwise(set);
            if (!isConvex(pts)) continue;
            const qa = polygonArea(pts);
            const meanArea = (set[0].area + set[1].area + set[2].area + set[3].area) / 4;
            const ratio = meanArea / qa;
            if (ratio < expected / 4 || ratio > expected * 4) continue;
            const s01 = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            const s12 = Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y);
            const s23 = Math.hypot(pts[3].x - pts[2].x, pts[3].y - pts[2].y);
            const s30 = Math.hypot(pts[0].x - pts[3].x, pts[0].y - pts[3].y);
            const a1 = (s01 + s23) / 2;
            const a2 = (s12 + s30) / 2;
            const aspect = Math.min(a1, a2) / Math.max(a1, a2);
            if (aspect < sheetAspect * 0.45) continue;
            const score =
              qa *
              Math.exp(-Math.abs(Math.log(ratio / expected))) *
              Math.exp(-2 * Math.abs(Math.log(aspect / sheetAspect)));
            if (!best || score > best.score) best = { score, pts };
          }
    return best ? best.pts : null;
  }

  function locateMarkers(img, layout) {
    const { width: w, height: h } = img;
    const maxSide = Math.max(w, h);
    const attempts = [
      { win: maxSide / 8, ratio: 0.8 },
      { win: maxSide / 14, ratio: 0.85 },
      { win: maxSide / 5, ratio: 0.72 },
      { win: maxSide / 3, ratio: 0.65 },
    ];
    for (const a of attempts) {
      const bin = adaptiveThreshold(img, Math.round(a.win) | 1, a.ratio);
      const blobs = findBlobs(bin, w, h);
      const quad = findMarkerQuad(blobs, w, h, layout);
      if (quad) return { quad, blobs };
    }
    return null;
  }

  /**
   * Busca las marcas laterales cerca de donde las predice la homografía de
   * las esquinas. Devuelve su posición en la foto (o null si no aparece).
   */
  function locateSideMarks(blobs, H, layout, pxPerMm) {
    return layout.sideMarks.map((sm) => {
      const p = project(H, sm.x, sm.y);
      const expArea = Math.pow(sm.size * pxPerMm, 2);
      const maxDist = 12 * pxPerMm;
      let best = null;
      let bestD = Infinity;
      for (const b of blobs) {
        if (b.area < expArea * 0.25 || b.area > expArea * 3) continue;
        const bw = b.maxX - b.minX + 1;
        const bh = b.maxY - b.minY + 1;
        if (bw / bh < 0.4 || bw / bh > 2.5 || b.area / (bw * bh) < 0.4) continue;
        const d = Math.hypot(b.x - p.x, b.y - p.y);
        if (d < maxDist && d < bestD) {
          best = b;
          bestD = d;
        }
      }
      return best ? { x: best.x, y: best.y } : null;
    });
  }

  /**
   * Divide la hoja en franjas horizontales delimitadas por las marcas de las
   * esquinas y las laterales encontradas, con una homografía por franja.
   * Así se compensa una hoja que no está perfectamente plana.
   */
  function buildMapping(layout, corners, sidePts) {
    const m = layout.markers;
    const levels = [{ y: m[0].y, L: m[0], R: m[1], l: corners[0], r: corners[1] }];
    for (let level = 1; level <= 2; level++) {
      const li = layout.sideMarks.findIndex((sm) => sm.level === level && sm.side === 'left');
      const ri = layout.sideMarks.findIndex((sm) => sm.level === level && sm.side === 'right');
      if (sidePts[li] && sidePts[ri]) {
        levels.push({ y: layout.sideMarks[li].y, L: layout.sideMarks[li], R: layout.sideMarks[ri], l: sidePts[li], r: sidePts[ri] });
      }
    }
    levels.push({ y: m[3].y, L: m[3], R: m[2], l: corners[3], r: corners[2] });
    const bands = [];
    for (let i = 0; i < levels.length - 1; i++) {
      const a = levels[i], b = levels[i + 1];
      const H = solveHomography([a.L, a.R, b.R, b.L], [a.l, a.r, b.r, b.l]);
      if (!H) return null;
      bands.push({ yMax: b.y, H });
    }
    return {
      bands: bands.length,
      /** Homografía a usar para un punto de la hoja con coordenada Y (mm). */
      forY(Y) {
        for (const band of bands) if (Y <= band.yMax) return band.H;
        return bands[bands.length - 1].H;
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Orientación y código de configuración                               */
  /* ------------------------------------------------------------------ */

  /** Promedio de gris en un cuadrado de lado `size` mm alrededor de (X,Y) mm. */
  function sampleSheetPatch(img, H, X, Y, size) {
    const steps = 5;
    let sum = 0;
    for (let i = 0; i < steps; i++)
      for (let j = 0; j < steps; j++) {
        const p = project(H, X + ((i + 0.5) / steps - 0.5) * size, Y + ((j + 0.5) / steps - 0.5) * size);
        sum += sampleBilinear(img, p.x, p.y);
      }
    return sum / (steps * steps);
  }

  function evaluateHypothesis(img, H, layout) {
    const o = layout.orientation;
    const mark = sampleSheetPatch(img, H, o.x, o.y, o.size * 0.5);
    const ref = Math.max(
      sampleSheetPatch(img, H, o.x, o.y - 6, 2),
      sampleSheetPatch(img, H, o.x, o.y + 6, 2)
    );
    const orientContrast = ref > 1 ? 1 - mark / ref : 0;

    const bits = [];
    let codeWhite = 0;
    for (const cell of layout.codeCells) {
      codeWhite = Math.max(
        codeWhite,
        sampleSheetPatch(img, H, cell.x, cell.y - 4.5, 1.5),
        sampleSheetPatch(img, H, cell.x, cell.y + 4, 1.5)
      );
    }
    for (const cell of layout.codeCells) {
      const v = sampleSheetPatch(img, H, cell.x, cell.y, cell.size * 0.5);
      bits.push(codeWhite > 1 && 1 - v / codeWhite > 0.35 ? 1 : 0);
    }
    const decoded = SheetLayout.decodeConfig(bits);
    return { orientContrast, bits, decoded };
  }

  /* ------------------------------------------------------------------ */
  /* Hoja enderezada y normalización de iluminación                      */
  /* ------------------------------------------------------------------ */

  function rectify(img, mapping, layout, ppm) {
    const RW = Math.round(layout.width * ppm);
    const RH = Math.round(layout.height * ppm);
    const data = new Float32Array(RW * RH);
    for (let y = 0; y < RH; y++) {
      const Y = (y + 0.5) / ppm;
      const H = mapping.forY(Y);
      for (let x = 0; x < RW; x++) {
        const X = (x + 0.5) / ppm;
        const d = H[6] * X + H[7] * Y + H[8];
        const px = (H[0] * X + H[1] * Y + H[2]) / d;
        const py = (H[3] * X + H[4] * Y + H[5]) / d;
        data[y * RW + x] = sampleBilinear(img, px, py);
      }
    }
    return { width: RW, height: RH, data, ppm };
  }

  /**
   * Estima el "blanco del papel" en cada zona (percentil alto por celda,
   * dilatado y suavizado) y devuelve un mapa de oscuridad 0 (papel) – 1 (negro).
   */
  function darknessMap(rect) {
    const { width: w, height: h, data, ppm } = rect;
    const cell = Math.max(8, Math.round(ppm * 4));
    const gx = Math.ceil(w / cell);
    const gy = Math.ceil(h / cell);
    let white = new Float32Array(gx * gy);
    const buf = new Float32Array(cell * cell);
    for (let cy = 0; cy < gy; cy++)
      for (let cx = 0; cx < gx; cx++) {
        let n = 0;
        const x1 = Math.min(w, (cx + 1) * cell);
        const y1 = Math.min(h, (cy + 1) * cell);
        for (let y = cy * cell; y < y1; y++) for (let x = cx * cell; x < x1; x++) buf[n++] = data[y * w + x];
        const vals = buf.subarray(0, n).slice().sort();
        white[cy * gx + cx] = vals[Math.min(n - 1, Math.floor(n * 0.9))];
      }
    // Dilatación (máximo) para que las celdas cubiertas de tinta tomen el blanco vecino.
    const R = 2;
    const dil = new Float32Array(gx * gy);
    for (let cy = 0; cy < gy; cy++)
      for (let cx = 0; cx < gx; cx++) {
        let mx = 0;
        for (let dy = -R; dy <= R; dy++)
          for (let dx = -R; dx <= R; dx++) {
            const yy = cy + dy, xx = cx + dx;
            if (yy < 0 || xx < 0 || yy >= gy || xx >= gx) continue;
            if (white[yy * gx + xx] > mx) mx = white[yy * gx + xx];
          }
        dil[cy * gx + cx] = mx;
      }
    // Suavizado 3×3.
    white = new Float32Array(gx * gy);
    for (let cy = 0; cy < gy; cy++)
      for (let cx = 0; cx < gx; cx++) {
        let s = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const yy = cy + dy, xx = cx + dx;
            if (yy < 0 || xx < 0 || yy >= gy || xx >= gx) continue;
            s += dil[yy * gx + xx];
            n++;
          }
        white[cy * gx + cx] = s / n;
      }
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const fy = Math.min(gy - 1, Math.max(0, (y + 0.5) / cell - 0.5));
      const y0 = Math.floor(fy), y1 = Math.min(gy - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < w; x++) {
        const fx = Math.min(gx - 1, Math.max(0, (x + 0.5) / cell - 0.5));
        const x0 = Math.floor(fx), x1 = Math.min(gx - 1, x0 + 1), tx = fx - x0;
        const wv =
          white[y0 * gx + x0] * (1 - tx) * (1 - ty) +
          white[y0 * gx + x1] * tx * (1 - ty) +
          white[y1 * gx + x0] * (1 - tx) * ty +
          white[y1 * gx + x1] * tx * ty;
        const d = wv > 1 ? 1 - data[y * w + x] / wv : 0;
        out[y * w + x] = d < 0 ? 0 : d > 1 ? 1 : d;
      }
    }
    return { width: w, height: h, data: out, ppm };
  }

  /* ------------------------------------------------------------------ */
  /* Lectura de burbujas                                                 */
  /* ------------------------------------------------------------------ */

  const RING_POINTS = 20;
  const RING_COS = [];
  const RING_SIN = [];
  for (let i = 0; i < RING_POINTS; i++) {
    RING_COS.push(Math.cos((2 * Math.PI * i) / RING_POINTS));
    RING_SIN.push(Math.sin((2 * Math.PI * i) / RING_POINTS));
  }

  function ringMean(dark, cx, cy, rad) {
    let s = 0;
    for (let i = 0; i < RING_POINTS; i++) s += sampleBilinear(dark, cx + rad * RING_COS[i], cy + rad * RING_SIN[i]);
    return s / RING_POINTS;
  }

  function diskMean(dark, cx, cy, rad) {
    const { width: w, height: h, data } = dark;
    const r2 = rad * rad;
    const x0 = Math.max(0, Math.floor(cx - rad));
    const x1 = Math.min(w - 1, Math.ceil(cx + rad));
    const y0 = Math.max(0, Math.floor(cy - rad));
    const y1 = Math.min(h - 1, Math.ceil(cy + rad));
    let s = 0, n = 0;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        if (dx * dx + dy * dy <= r2) {
          s += data[y * w + x];
          n++;
        }
      }
    }
    return n ? s / n : 0;
  }

  /**
   * Calidad de alineación de una fila con desplazamiento (dx, dy) en px:
   * contraste entre el contorno impreso de cada burbuja y el papel que la rodea.
   */
  function rowFit(dark, bubbles, ppm) {
    const gap = 0.9 * ppm;
    return (dx, dy) => {
      let s = 0;
      for (const b of bubbles) {
        const cx = b.x * ppm + dx, cy = b.y * ppm + dy, r = b.r * ppm;
        s += ringMean(dark, cx, cy, r) - ringMean(dark, cx, cy, r + gap);
      }
      return s / bubbles.length;
    };
  }

  function searchShift(fit, cx, cy, rx, ry, step, maxAbsX) {
    let best = { dx: cx, dy: cy, score: -Infinity };
    const x0 = Math.max(cx - rx, -maxAbsX);
    const x1 = Math.min(cx + rx, maxAbsX);
    for (let dy = cy - ry; dy <= cy + ry; dy += step)
      for (let dx = x0; dx <= x1; dx += step) {
        const sc = fit(dx, dy);
        if (sc > best.score) best = { dx, dy, score: sc };
      }
    return best;
  }

  /**
   * Alinea un grupo de filas (una columna de preguntas o el bloque de ID).
   * Se parte de la fila `anchor` (la más cercana a una marca de referencia)
   * con una búsqueda amplia, y luego se "sigue" la columna fila a fila
   * buscando alrededor del desplazamiento de la fila vecina. Así se
   * compensan hojas curvadas sin saltar a la fila de al lado. El ajuste
   * horizontal se limita más, porque las burbujas de una fila están
   * equiespaciadas y un corrimiento de una alternativa completa también
   * "calzaría".
   */
  function alignGroup(dark, rowsBubbles, ppm, anchor, pitchMm) {
    const step = Math.max(1, Math.round(ppm / 5));
    const maxX = Math.round(2 * ppm);
    const wideX = Math.round(1.5 * ppm);
    const wideY = Math.round(0.45 * pitchMm * ppm);
    const nearX = Math.max(step, Math.round(0.4 * ppm));
    const nearY = Math.round(1.0 * ppm);
    const fits = rowsBubbles.map((b) => rowFit(dark, b, ppm));
    const out = new Array(rowsBubbles.length);
    out[anchor] = searchShift(fits[anchor], 0, 0, wideX, wideY, step, maxX);
    for (let i = anchor + 1; i < out.length; i++) {
      out[i] = searchShift(fits[i], out[i - 1].dx, out[i - 1].dy, nearX, nearY, step, maxX);
    }
    for (let i = anchor - 1; i >= 0; i--) {
      out[i] = searchShift(fits[i], out[i + 1].dx, out[i + 1].dy, nearX, nearY, step, maxX);
    }
    return out.map((sft) => ({ dx: sft.dx, dy: sft.dy }));
  }

  /** Umbral de Otsu sobre una lista de valores 0–1. */
  function otsu(values) {
    const bins = 100;
    const hist = new Array(bins).fill(0);
    for (const v of values) hist[Math.min(bins - 1, Math.max(0, Math.floor(v * bins)))]++;
    const total = values.length;
    let sumAll = 0;
    for (let i = 0; i < bins; i++) sumAll += i * hist[i];
    let sumB = 0, wB = 0, best = -1, thr = 0.35;
    let m0 = 0, m1 = 0;
    for (let i = 0; i < bins; i++) {
      wB += hist[i];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += i * hist[i];
      const mB = sumB / wB;
      const mF = (sumAll - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) {
        best = between;
        thr = (i + 1) / bins;
        m0 = mB / bins;
        m1 = mF / bins;
      }
    }
    return { threshold: thr, lowMean: m0, highMean: m1 };
  }

  const DEFAULTS = {
    threshold: null, // null = automático
    minThreshold: 0.22,
    maxThreshold: 0.55,
    fallbackThreshold: 0.35,
    relativeRatio: 0.6, // una segunda marca debe ser al menos 60 % de la más oscura
    uncertainBand: 0.07,
    innerRadius: 0.6,
  };

  function decideRow(scores, T, opts) {
    let max = 0;
    for (const s of scores) if (s > max) max = s;
    const marked = [];
    scores.forEach((s, i) => {
      if (s >= T && s >= max * opts.relativeRatio) marked.push(i);
    });
    let uncertain = Math.abs(max - T) < opts.uncertainBand;
    for (const s of scores) {
      if (s !== max && s >= T - opts.uncertainBand && s < T + opts.uncertainBand) uncertain = true;
    }
    return { marked, uncertain };
  }

  /* ------------------------------------------------------------------ */
  /* API principal                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Lee una hoja.
   * @param img    { width, height, data: Float32Array gris 0–255 }
   * @param layout SheetLayout.computeLayout(config)
   * @param options ver DEFAULTS
   */
  function scanSheet(img, layout, options) {
    const opts = Object.assign({}, DEFAULTS, options || {});

    const found = locateMarkers(img, layout);
    if (!found) {
      return {
        ok: false,
        error:
          'No se encontraron las cuatro marcas negras de las esquinas. ' +
          'Asegúrese de que la hoja completa aparezca en la foto, bien iluminada y sin sombras fuertes.',
      };
    }

    const quad = found.quad;
    // Probar las cuatro asignaciones posibles de esquinas (rotaciones).
    let best = null;
    for (let k = 0; k < 4; k++) {
      const dst = [quad[k], quad[(k + 1) % 4], quad[(k + 2) % 4], quad[(k + 3) % 4]];
      const H = solveHomography(layout.markers, dst);
      if (!H) continue;
      const ev = evaluateHypothesis(img, H, layout);
      const score = ev.orientContrast + (ev.decoded ? 1 : 0);
      if (!best || score > best.score) best = { k, H, ev, score, dst };
    }
    if (!best) {
      return { ok: false, corners: quad, error: 'No se pudo calcular la geometría de la hoja.' };
    }

    const d = best.dst;
    const sidePx = (Math.hypot(d[1].x - d[0].x, d[1].y - d[0].y) + Math.hypot(d[2].x - d[3].x, d[2].y - d[3].y)) / 2;
    const sideMm = layout.markers[1].x - layout.markers[0].x;
    const pxPerMm = sidePx / sideMm;
    const sidePts = locateSideMarks(found.blobs, best.H, layout, pxPerMm);
    const sideFound = sidePts.filter(Boolean).length;

    const decoded = best.ev.decoded;
    // Sin código legible se exige una marca de orientación nítida y las marcas laterales.
    if (!decoded && (best.ev.orientContrast < 0.3 || sideFound < 2)) {
      return {
        ok: false,
        corners: d,
        error:
          'No se reconoció la hoja completa (marca de orientación o código inferior). ' +
          'Verifique que sea una hoja generada por este programa y que aparezca entera en la foto.',
      };
    }

    const warnings = [];
    if (decoded && !SheetLayout.sameStructure(decoded, layout.config)) {
      const paper = SheetLayout.PAPERS[decoded.paper];
      return {
        ok: false,
        corners: d,
        decoded,
        error:
          `Esta hoja corresponde a otra prueba: ${decoded.numQuestions} preguntas, ${decoded.numChoices} alternativas, ` +
          `${decoded.idDigits} dígitos de identificación, papel ${paper ? paper.label : decoded.paper}. ` +
          'Revise la configuración de la prueba.',
      };
    }
    if (!decoded) warnings.push('No se pudo verificar el código de la hoja; revise que corresponda a esta prueba.');

    const mapping = buildMapping(layout, d, sidePts);
    if (!mapping) return { ok: false, corners: d, error: 'No se pudo calcular la geometría de la hoja.' };

    // Resolución de la hoja enderezada: similar a la de la foto (4–8 px/mm).
    const ppm = Math.min(8, Math.max(4, Math.round(pxPerMm)));

    const rect = rectify(img, mapping, layout, ppm);
    const dark = darknessMap(rect);

    // Alinear filas (preguntas y dígitos de ID), columna por columna.
    const rows = layout.questions.map((q) => q.bubbles).concat(layout.idRows.map((r) => r.bubbles));
    const levelsY = [layout.markers[0].y, layout.markers[3].y].concat(
      layout.sideMarks.filter((sm, i) => sidePts[i]).map((sm) => sm.y)
    );
    const groups = layout.grid.columns.map((col) => {
      const idx = [];
      for (let i = 0; i < col.count; i++) idx.push(col.firstQuestion + i);
      return idx;
    });
    if (layout.idRows.length) groups.push(layout.idRows.map((_, i) => layout.questions.length + i));
    const shifts = new Array(rows.length);
    for (const idxs of groups) {
      let anchor = 0;
      let bestD = Infinity;
      idxs.forEach((ri, k) => {
        const y = rows[ri][0].y;
        const dist = Math.min.apply(null, levelsY.map((l) => Math.abs(l - y)));
        if (dist < bestD) {
          bestD = dist;
          anchor = k;
        }
      });
      const pitchMm = idxs.length > 1 ? Math.abs(rows[idxs[1]][0].y - rows[idxs[0]][0].y) : layout.grid.pitch;
      const s = alignGroup(dark, idxs.map((ri) => rows[ri]), ppm, anchor, pitchMm);
      idxs.forEach((ri, k) => (shifts[ri] = s[k]));
    }

    // Control de alineación. Toda burbuja real tiene su contorno impreso y
    // alrededor de la grilla (encima de la primera fila, debajo de la última,
    // a la derecha de la última alternativa) no hay burbujas. Si falta un
    // contorno donde debería estar, o aparece donde no debería, la lectura
    // quedó corrida: es preferible rechazar la foto que corregir mal.
    const shiftedFit = (bubbles, s, ox, oy) =>
      rowFit(dark, bubbles.map((b) => ({ x: b.x + ox, y: b.y + oy, r: b.r })), ppm)(s.dx, s.dy);
    const misaligned = () => ({
      ok: false,
      corners: d,
      error:
        'Las filas de respuestas no quedaron bien alineadas (la hoja parece doblada o curvada). ' +
        'Alísela sobre una superficie plana y tome la foto nuevamente.',
    });
    const pitch = layout.grid.pitch;
    for (let g = 0; g < groups.length; g++) {
      const idxs = groups[g];
      const nb = rows[idxs[0]].length;
      const bubblePitch = nb > 1 ? rows[idxs[0]][1].x - rows[idxs[0]][0].x : pitch;
      // Contraste por fila y por posición de alternativa (promediado en la columna).
      const rowC = [];
      const posC = new Array(nb + 1).fill(0);
      for (const ri of idxs) {
        let sum = 0;
        for (let k = 0; k < nb; k++) {
          const c = shiftedFit([rows[ri][k]], shifts[ri], 0, 0);
          posC[k] += c / idxs.length;
          sum += c;
        }
        rowC.push(sum / nb);
        posC[nb] += shiftedFit([rows[ri][nb - 1]], shifts[ri], bubblePitch, 0) / idxs.length;
      }
      const sorted = rowC.slice().sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      if (med < 0.04) continue; // imagen sin contraste suficiente para evaluar
      if (sorted[0] < med * 0.3) return misaligned();
      for (let k = 0; k < nb; k++) if (posC[k] < med * 0.4) return misaligned();
      const isQuestionColumn = g < layout.grid.columns.length;
      if (!isQuestionColumn) continue;
      if (posC[nb] > med * 0.45) return misaligned();
      if (idxs.length < 2) continue;
      const first = idxs[0];
      const last = idxs[idxs.length - 1];
      const above = shiftedFit(rows[first], shifts[first], 0, -pitch);
      const below = shiftedFit(rows[last], shifts[last], 0, pitch);
      if (above > med * 0.45 || below > med * 0.45) return misaligned();
    }

    const rowScores = rows.map((bubbles, i) =>
      bubbles.map((b) => diskMean(dark, b.x * ppm + shifts[i].dx, b.y * ppm + shifts[i].dy, b.r * ppm * opts.innerRadius))
    );

    // Umbral.
    let T;
    let thresholdMode;
    if (typeof opts.threshold === 'number') {
      T = opts.threshold;
      thresholdMode = 'manual';
    } else {
      const all = [].concat(...rowScores);
      const o = otsu(all);
      // Punto medio entre ambas clases: más estable que el corte de Otsu
      // cuando hay una gran brecha entre burbujas vacías y marcadas.
      T = o.highMean - o.lowMean >= 0.15 ? (o.lowMean + o.highMean) / 2 : opts.fallbackThreshold;
      T = Math.min(opts.maxThreshold, Math.max(opts.minThreshold, T));
      thresholdMode = 'auto';
    }

    const answers = layout.questions.map((q, i) => {
      const r = decideRow(rowScores[i], T, opts);
      return { marked: r.marked, uncertain: r.uncertain, scores: rowScores[i].map((s) => Math.round(s * 1000) / 1000) };
    });

    const idDigits = layout.idRows.map((row, j) => {
      const i = layout.questions.length + j;
      const r = decideRow(rowScores[i], T, opts);
      return { value: r.marked.length === 1 ? r.marked[0] : null, marked: r.marked, uncertain: r.uncertain };
    });
    const idComplete = idDigits.length > 0 && idDigits.every((dg) => dg.value !== null);
    const idValue = idDigits.length ? idDigits.map((dg) => (dg.value === null ? '?' : String(dg.value))).join('') : null;

    // Posiciones en px (sobre la hoja enderezada) para dibujar resultados.
    const toPx = (bubbles, s) => bubbles.map((b) => ({ x: b.x * ppm + s.dx, y: b.y * ppm + s.dy, r: b.r * ppm }));
    const overlay = {
      questions: layout.questions.map((q, i) => toPx(q.bubbles, shifts[i])),
      id: layout.idRows.map((row, j) => toPx(row.bubbles, shifts[layout.questions.length + j])),
    };

    return {
      ok: true,
      answers,
      id: { value: idValue, complete: idComplete, digits: idDigits },
      threshold: Math.round(T * 1000) / 1000,
      thresholdMode,
      rotation: best.k,
      corners: best.dst,
      codeVerified: !!decoded,
      warnings,
      rectified: rect,
      overlay,
    };
  }

  return {
    DEFAULTS,
    toGray,
    adaptiveThreshold,
    findBlobs,
    solveHomography,
    project,
    locateMarkers,
    rectify,
    darknessMap,
    otsu,
    scanSheet,
  };
});
