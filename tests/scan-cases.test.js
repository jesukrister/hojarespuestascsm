'use strict';

/*
 * Casos reales que el lector rechazaba:
 *  - burbujas del N° de lista impresas o fotografiadas muy tenues;
 *  - hoja de otro formato (p. ej. cuarto de hoja impresa ampliada) con la
 *    prueba configurada en hoja completa: debe decir cuál es su configuración;
 *  - marcas laterales tapadas o recortadas (otra mancha se tomaba por ellas).
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
  return photograph(sheet, PPM, layout, Object.assign({
    width: W,
    height: H,
    corners: [{ x: 70, y: 90 }, { x: W - 60, y: 75 }, { x: W - 80, y: H - 70 }, { x: 60, y: H - 90 }],
    seed,
  }, extra || {}));
}

/** Aclara una zona de la hoja (tinta débil). */
function fade(sheet, x0, y0, x1, y1, amount) {
  for (let y = Math.round(y0 * PPM); y < Math.round(y1 * PPM); y++)
    for (let x = Math.round(x0 * PPM); x < Math.round(x1 * PPM); x++) {
      const i = y * sheet.width + x;
      sheet.data[i] = sheet.data[i] + (240 - sheet.data[i]) * amount;
    }
}

test('burbujas del N° de lista muy tenues no hacen rechazar la hoja', () => {
  const cfg = { paper: 'oficio', format: 'quarter', numQuestions: 16, numChoices: 4, idDigits: 2 };
  const layout = SheetLayout.computeLayout(cfg);
  const { marks, expected } = randomAnswers(16, 4, 3);
  const sheet = rasterizeSheet(layout, PPM, { answers: marks, id: [0, 2] }, 3);
  // Las dos últimas columnas del N° de lista (dígitos 8 y 9) casi sin tinta.
  const row = layout.idRows[0].bubbles;
  fade(sheet, row[8].x - row[8].r - 1, layout.idRows[0].y - 4, row[9].x + row[9].r + 1, layout.idRows[1].y + 4, 0.8);
  const res = OMR.scanSheet(shoot(layout, sheet, 3), layout);
  assert.ok(res.ok, res.error);
  assert.equal(res.id.value, '02');
  res.answers.forEach((a, i) => assert.deepEqual(a.marked, expected[i]));
});

test('hoja de otro formato: se informa su configuración para poder usarla', () => {
  const printed = SheetLayout.computeLayout({ paper: 'oficio', format: 'quarter', numQuestions: 16, numChoices: 4, idDigits: 2 });
  const { marks } = randomAnswers(16, 4, 4);
  const sheet = rasterizeSheet(printed, PPM, { answers: marks, id: [1, 5] }, 4);
  const photo = shoot(printed, sheet, 4);
  for (const expectedCfg of [
    { paper: 'carta', format: 'full', numQuestions: 16, numChoices: 4, idDigits: 2 },
    { paper: 'a4', format: 'half', numQuestions: 30, numChoices: 5, idDigits: 2 },
  ]) {
    const res = OMR.scanSheet(photo, SheetLayout.computeLayout(expectedCfg));
    assert.equal(res.ok, false);
    assert.ok(res.decoded, `sin configuración leída (${res.error})`);
    assert.deepEqual(
      { paper: res.decoded.paper, format: res.decoded.format, numQuestions: res.decoded.numQuestions, numChoices: res.decoded.numChoices, idDigits: res.decoded.idDigits },
      { paper: 'oficio', format: 'quarter', numQuestions: 16, numChoices: 4, idDigits: 2 }
    );
  }
});

test('sin marcas laterales visibles, la hoja se lee igual (sin confundirlas con otras manchas)', () => {
  for (const [format, n, seed] of [['half', 84, 68], ['half', 54, 70], ['quarter', 27, 79], ['full', 100, 51]]) {
    const cfg = { paper: 'carta', format, numQuestions: n, numChoices: 4, idDigits: 2 };
    const layout = SheetLayout.computeLayout(cfg);
    const { marks, expected } = randomAnswers(n, 4, seed);
    const sheet = rasterizeSheet(layout, PPM, { answers: marks, id: [3, 1], hideSideMarks: true }, seed);
    const res = OMR.scanSheet(shoot(layout, sheet, seed, { blur: true }), layout);
    assert.ok(res.ok, `${format}: ${res.error}`);
    res.answers.forEach((a, i) => assert.deepEqual(a.marked, expected[i], `${format} pregunta ${i + 1}`));
    assert.equal(res.id.value, '31');
  }
});
