/*
 * Genera imágenes sintéticas de hojas "fotografiadas" para probar el lector
 * sin depender de un navegador: dibuja la hoja a partir del layout y luego
 * simula perspectiva, iluminación irregular, fondo y ruido de cámara.
 */
'use strict';

const OMR = require('../../js/omr.js');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fillRect(img, ppm, x0, y0, x1, y1, value) {
  const { width: w, height: h, data } = img;
  const a = Math.max(0, Math.round(x0 * ppm)), b = Math.min(w, Math.round(x1 * ppm));
  const c = Math.max(0, Math.round(y0 * ppm)), d = Math.min(h, Math.round(y1 * ppm));
  for (let y = c; y < d; y++) for (let x = a; x < b; x++) data[y * w + x] = Math.min(data[y * w + x], value);
}

function fillDisk(img, ppm, cx, cy, r, value, rand, holes) {
  const { width: w, data } = img;
  const R = r * ppm, X = cx * ppm, Y = cy * ppm;
  for (let y = Math.floor(Y - R); y <= Math.ceil(Y + R); y++)
    for (let x = Math.floor(X - R); x <= Math.ceil(X + R); x++) {
      const dx = x + 0.5 - X, dy = y + 0.5 - Y;
      if (dx * dx + dy * dy > R * R) continue;
      if (holes && rand() < holes) continue;
      const i = y * w + x;
      data[i] = Math.min(data[i], value);
    }
}

function strokeCircle(img, ppm, cx, cy, r, width, value) {
  const { width: w, data } = img;
  const R = r * ppm, X = cx * ppm, Y = cy * ppm, hw = (width * ppm) / 2 + 0.5;
  for (let y = Math.floor(Y - R - hw); y <= Math.ceil(Y + R + hw); y++)
    for (let x = Math.floor(X - R - hw); x <= Math.ceil(X + R + hw); x++) {
      const d = Math.abs(Math.hypot(x + 0.5 - X, y + 0.5 - Y) - R);
      if (d > hw) continue;
      const i = y * w + x;
      data[i] = Math.min(data[i], value);
    }
}

/**
 * Dibuja la hoja.
 * marks: { answers: [[{choice, value, holes}]...], id: [digit...] }
 */
function rasterizeSheet(layout, ppm, marks, seed) {
  const rand = mulberry32(seed || 1);
  const w = Math.round(layout.width * ppm), h = Math.round(layout.height * ppm);
  const img = { width: w, height: h, data: new Float32Array(w * h).fill(240) };
  const ms = layout.markerSize;
  for (const m of layout.markers) fillRect(img, ppm, m.x - ms / 2, m.y - ms / 2, m.x + ms / 2, m.y + ms / 2, 20);
  const o = layout.orientation;
  fillRect(img, ppm, o.x - o.size / 2, o.y - o.size / 2, o.x + o.size / 2, o.y + o.size / 2, 20);
  if (!(marks && marks.hideSideMarks))
    for (const sm of layout.sideMarks) fillRect(img, ppm, sm.x - sm.size / 2, sm.y - sm.size / 2, sm.x + sm.size / 2, sm.y + sm.size / 2, 20);
  for (const c of layout.codeCells)
    if (c.bit) fillRect(img, ppm, c.x - c.size / 2, c.y - c.size / 2, c.x + c.size / 2, c.y + c.size / 2, 20);
  // Texto del encabezado simulado como barras finas.
  fillRect(img, ppm, layout.header.titleX, 12, layout.header.titleX + 90, 17, 30);
  for (const f of layout.header.fields) fillRect(img, ppm, f.x, f.y + 0.4, f.x2, f.y + 0.7, 30);
  const bubbles = (b) => {
    strokeCircle(img, ppm, b.x, b.y, b.r, 0.25, 70);
    fillRect(img, ppm, b.x - b.r * 0.3, b.y - b.r * 0.4, b.x + b.r * 0.3, b.y + b.r * 0.4, 170); // letra
  };
  for (const q of layout.questions) {
    fillRect(img, ppm, q.labelX - 3, q.y - 1.1, q.labelX, q.y + 1.1, 40); // número
    q.bubbles.forEach(bubbles);
  }
  for (const row of layout.idRows) row.bubbles.forEach(bubbles);

  const answers = (marks && marks.answers) || [];
  answers.forEach((list, qi) => {
    for (const mk of list || []) {
      const b = layout.questions[qi].bubbles[mk.choice];
      fillDisk(img, ppm, b.x, b.y, b.r * (mk.radius || 0.9), mk.value == null ? 60 : mk.value, rand, mk.holes || 0.15);
    }
  });
  const id = (marks && marks.id) || [];
  id.forEach((digit, di) => {
    if (digit == null) return;
    const b = layout.idRows[di].bubbles[digit];
    fillDisk(img, ppm, b.x, b.y, b.r * 0.9, 60, rand, 0.15);
  });
  return img;
}

/**
 * Simula una foto: `corners` son las posiciones (px) en la foto de las
 * esquinas del papel TL, TR, BR, BL.
 */
function photograph(sheet, sheetPpm, layout, opts) {
  const rand = mulberry32(opts.seed || 7);
  const W = opts.width, H = opts.height;
  const paper = [
    { x: 0, y: 0 },
    { x: layout.width, y: 0 },
    { x: layout.width, y: layout.height },
    { x: 0, y: layout.height },
  ];
  // Homografía foto → hoja (mm).
  const Hinv = OMR.solveHomography(opts.corners, paper);
  const data = new Float32Array(W * H);
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const light = opts.light || ((x, y) => 1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = OMR.project(Hinv, x + 0.5, y + 0.5);
      // Curvatura: desplazamiento vertical que no puede modelar una sola homografía.
      if (opts.bend) p.y += opts.bend * Math.sin((Math.PI * p.y) / layout.height) * (0.6 + 0.4 * Math.sin((Math.PI * p.x) / layout.width));
      let v;
      if (p.x >= 0 && p.y >= 0 && p.x < layout.width && p.y < layout.height) {
        const sx = Math.min(sheet.width - 1, Math.floor(p.x * sheetPpm));
        const sy = Math.min(sheet.height - 1, Math.floor(p.y * sheetPpm));
        v = sheet.data[sy * sheet.width + sx];
      } else {
        v = opts.background == null ? 90 : opts.background;
      }
      v = v * light(x / W, y / H) + gauss() * (opts.noise == null ? 5 : opts.noise);
      data[y * W + x] = Math.max(0, Math.min(255, v));
    }
  let img = { width: W, height: H, data };
  if (opts.blur) img = boxBlur(img);
  return img;
}

function boxBlur(img) {
  const { width: w, height: h, data } = img;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy < 0 || xx < 0 || yy >= h || xx >= w) continue;
          s += data[yy * w + xx];
          n++;
        }
      out[y * w + x] = s / n;
    }
  return { width: w, height: h, data: out };
}

/** Respuestas aleatorias: marca simple, en blanco o doble. */
function randomAnswers(numQuestions, numChoices, seed, opts) {
  const rand = mulberry32(seed);
  opts = opts || {};
  const marks = [];
  const expected = [];
  for (let q = 0; q < numQuestions; q++) {
    const r = rand();
    if (r < (opts.blankRate || 0.1)) {
      marks.push([]);
      expected.push([]);
    } else if (r < (opts.blankRate || 0.1) + (opts.multipleRate || 0.05)) {
      const a = Math.floor(rand() * numChoices);
      const b = (a + 1 + Math.floor(rand() * (numChoices - 1))) % numChoices;
      marks.push([{ choice: a }, { choice: b }]);
      expected.push([a, b].sort((x, y) => x - y));
    } else {
      const a = Math.floor(rand() * numChoices);
      marks.push([{ choice: a }]);
      expected.push([a]);
    }
  }
  return { marks, expected };
}

module.exports = { rasterizeSheet, photograph, randomAnswers, mulberry32 };
