'use strict';

/*
 * Hojas a las que les faltan marcas de las esquinas (impresión cortada, por
 * ejemplo una hoja de papel oficio impresa en papel carta, o una esquina rota
 * o tapada): el lector las ubica con las marcas que sí están (al menos 5) y
 * avisa. Nunca debe leer mal: si no puede ubicarla con seguridad, la rechaza.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const SheetLayout = require('../js/layout.js');
const OMR = require('../js/omr.js');
const { rasterizeSheet, photograph, randomAnswers } = require('./helpers/synth.js');

const PPM = 7;

function shoot(layout, sheet, seed, extra) {
  const W = 1500;
  const H = Math.round(W * (layout.height / layout.width) * 1.1);
  return photograph(
    sheet,
    PPM,
    layout,
    Object.assign(
      {
        width: W,
        height: H,
        corners: [{ x: 80, y: 95 }, { x: W - 70, y: 80 }, { x: W - 90, y: H - 75 }, { x: 70, y: H - 95 }],
        seed,
      },
      extra || {}
    )
  );
}

/** Deja en blanco (papel) un rectángulo de la hoja, en mm. */
function blank(sheet, x0, y0, x1, y1) {
  for (let y = Math.max(0, Math.round(y0 * PPM)); y < Math.min(sheet.height, Math.round(y1 * PPM)); y++)
    for (let x = Math.max(0, Math.round(x0 * PPM)); x < Math.min(sheet.width, Math.round(x1 * PPM)); x++) sheet.data[y * sheet.width + x] = 240;
}

function check(res, expected, idValue, label) {
  assert.ok(res.ok, `${label}: ${res.error}`);
  res.answers.forEach((a, i) => assert.deepEqual(a.marked, expected[i], `${label}: pregunta ${i + 1}`));
  if (idValue !== undefined) assert.equal(res.id.value, idValue, `${label}: N° de lista`);
}

test('hoja de papel oficio impresa en carta (sin la franja de abajo): se lee con las demás marcas', () => {
  const cfg = { paper: 'oficio', format: 'full', numQuestions: 40, numChoices: 4, idDigits: 2 };
  const layout = SheetLayout.computeLayout(cfg);
  const { marks, expected } = randomAnswers(40, 4, 21);
  const sheet = rasterizeSheet(layout, PPM, { answers: marks, id: [1, 7] }, 21);
  // La carta mide 279,4 mm: todo lo que queda más abajo no se imprimió.
  blank(sheet, 0, 279.4 - 4, layout.width, layout.height);
  const res = OMR.scanSheet(shoot(layout, sheet, 21), layout);
  check(res, expected, '17', 'oficio en carta');
  assert.equal(res.partialMarks, true);
  assert.ok(res.warnings.some((w) => /Faltan 2 marcas negras/.test(w)), res.warnings.join(' | '));
});

test('una esquina rota o tapada: se lee con las otras tres y las laterales', () => {
  for (const [corner, seed] of [[2, 31], [3, 32], [1, 33]]) {
    const cfg = { paper: 'carta', format: 'full', numQuestions: 30, numChoices: 5, idDigits: 2 };
    const layout = SheetLayout.computeLayout(cfg);
    const { marks, expected } = randomAnswers(30, 5, seed);
    const sheet = rasterizeSheet(layout, PPM, { answers: marks, id: [2, 4] }, seed);
    const m = layout.markers[corner];
    const s = layout.markerSize;
    blank(sheet, m.x - s, m.y - s, m.x + s, m.y + s);
    const res = OMR.scanSheet(shoot(layout, sheet, seed), layout);
    check(res, expected, '24', `esquina ${corner}`);
    assert.ok(res.warnings.some((w) => /Falta una marca negra/.test(w)), res.warnings.join(' | '));
  }
});

test('sin la franja de arriba (ni marca de orientación): el código de abajo confirma la hoja', () => {
  const cfg = { paper: 'carta', format: 'full', numQuestions: 20, numChoices: 4, idDigits: 0 };
  const layout = SheetLayout.computeLayout(cfg);
  const { marks, expected } = randomAnswers(20, 4, 41);
  const sheet = rasterizeSheet(layout, PPM, { answers: marks }, 41);
  blank(sheet, 0, 0, layout.width, layout.markers[0].y + layout.markerSize);
  // Foto girada en 180°: la orientación sale del código.
  const H = Math.round(1500 * (layout.height / layout.width) * 1.1);
  const res = OMR.scanSheet(
    shoot(layout, sheet, 41, { corners: [{ x: 1430, y: H - 95 }, { x: 70, y: H - 80 }, { x: 90, y: 75 }, { x: 1420, y: 95 }] }),
    layout
  );
  check(res, expected, undefined, 'sin franja superior');
  assert.equal(res.partialMarks, true);
});

test('media hoja con una esquina cortada', () => {
  const cfg = { paper: 'carta', format: 'half', numQuestions: 25, numChoices: 4, idDigits: 2 };
  const layout = SheetLayout.computeLayout(cfg);
  const { marks, expected } = randomAnswers(25, 4, 51);
  const sheet = rasterizeSheet(layout, PPM, { answers: marks, id: [0, 9] }, 51);
  const m = layout.markers[3];
  blank(sheet, 0, m.y - layout.markerSize, m.x + layout.markerSize, layout.height);
  const res = OMR.scanSheet(shoot(layout, sheet, 51, { blur: true }), layout);
  check(res, expected, '09', 'media hoja');
});

test('con muy pocas marcas no se adivina: la hoja se rechaza', () => {
  const cfg = { paper: 'carta', format: 'full', numQuestions: 30, numChoices: 4, idDigits: 2 };
  const layout = SheetLayout.computeLayout(cfg);
  const { marks } = randomAnswers(30, 4, 61);
  // Sin marcas laterales y sin las dos esquinas de abajo: quedan sólo 2 marcas.
  const sheet = rasterizeSheet(layout, PPM, { answers: marks, id: [1, 1], hideSideMarks: true }, 61);
  blank(sheet, 0, layout.markers[3].y - layout.markerSize, layout.width, layout.height);
  const res = OMR.scanSheet(shoot(layout, sheet, 61), layout);
  assert.equal(res.ok, false);
});

test('una hoja completa se lee como siempre (sin aviso de marcas faltantes)', () => {
  const cfg = { paper: 'oficio', format: 'full', numQuestions: 40, numChoices: 4, idDigits: 2 };
  const layout = SheetLayout.computeLayout(cfg);
  const { marks, expected } = randomAnswers(40, 4, 71);
  const sheet = rasterizeSheet(layout, PPM, { answers: marks, id: [3, 3] }, 71);
  const res = OMR.scanSheet(shoot(layout, sheet, 71), layout);
  check(res, expected, '33', 'hoja completa');
  assert.ok(!res.partialMarks);
  assert.ok(!res.warnings.some((w) => /marca/.test(w)), res.warnings.join(' | '));
});

test('ajuste geométrico con marcas sobrantes (mínimos cuadrados)', () => {
  const H = [1.1, 0.05, 30, -0.02, 0.95, 12, 0.0002, -0.0001, 1];
  const src = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 300 }, { x: 0, y: 300 }, { x: 100, y: 150 }, { x: 10, y: 100 }];
  const dst = src.map((p) => OMR.project(H, p.x, p.y));
  const fit = OMR.fitTransform(src, dst);
  for (const p of [{ x: 50, y: 250 }, { x: 180, y: 20 }]) {
    const a = OMR.project(H, p.x, p.y);
    const b = OMR.project(fit, p.x, p.y);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1e-6);
  }
  // Con dos puntos: semejanza (rotación, escala y traslación).
  const sim = OMR.fitTransform([{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 5, y: 5 }, { x: 5, y: 25 }]);
  const q = OMR.project(sim, 0, 10);
  assert.ok(Math.hypot(q.x - -15, q.y - 5) < 1e-9, JSON.stringify(q));
});
