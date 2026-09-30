/*
 * Versión Pro: hoja de la versión adecuada (PIE), con una alternativa menos
 * y una marca que el lector reconoce.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/layout.js');
const OMR = require('../js/omr.js');
const SheetRenderer = require('../js/sheet.js');
const S = require('./helpers/synth.js');

function shoot(layout, marks, seed) {
  const ppm = 6;
  const sheet = S.rasterizeSheet(layout, ppm, marks, seed);
  const W = 1300;
  const w = W * 0.82;
  const h = (w * layout.height) / layout.width;
  return S.photographMany([{ layout, sheet, ppm, corners: S.rectCorners(W / 2, h / 2 + 90, w, h, 0.03) }], W, Math.round(h + 180), seed);
}

const BASE = { numQuestions: 20, numChoices: 5, idDigits: 2 };
const PIE = Object.assign({}, BASE, { numChoices: 4, pie: true });

test('la marca PIE: dos celdas en los extremos del código', () => {
  for (const format of L.FORMAT_IDS) {
    const normal = L.computeLayout(Object.assign({}, BASE, { format, numQuestions: 5 }));
    const pie = L.computeLayout(Object.assign({}, PIE, { format, numQuestions: 5 }));
    assert.equal(normal.pie, false);
    assert.equal(pie.pie, true);
    assert.deepEqual(normal.pieCells.map((c) => c.bit), [0, 0]);
    assert.deepEqual(pie.pieCells.map((c) => c.bit), [1, 1]);
    // Misma posición en ambas hojas y lejos de las marcas de las esquinas.
    assert.deepEqual(normal.pieCells.map((c) => c.x), pie.pieCells.map((c) => c.x));
    const [left, right] = pie.pieCells;
    const ms = pie.markerSize / 2;
    assert.ok(left.x - left.size / 2 - (pie.markers[0].x + ms) > 3, format);
    assert.ok(pie.markers[1].x - ms - (right.x + right.size / 2) > 3, format);
    // No tocan el código ni las celdas de desarrollo.
    const all = pie.codeCells.concat(pie.extCells).map((c) => c.x);
    assert.ok(left.x < Math.min(...all) && right.x > Math.max(...all));
  }
  // Sólo el valor true marca la hoja (un objeto con los datos PIE de la prueba no).
  assert.equal(L.computeLayout(Object.assign({}, BASE, { pie: { remove: [1] } })).pie, false);
  assert.equal(L.decodePie([1, 1]), true);
  assert.equal(L.decodePie([0, 0]), false);
  assert.equal(L.decodePie([1, 0]), null);
  // La hoja PIE imprime las dos celdas (y nada más cambia).
  const cells = (cfg) => (SheetRenderer.renderPageSVG(L.computeLayout(cfg), { title: 'T' }).svg.match(/<rect [^>]*width="3\.5" height="3\.5"/g) || []).length;
  assert.equal(cells(PIE) - cells(Object.assign({}, PIE, { pie: false })), 2);
});

test('lector: hoja PIE con su diseño, y rechazo con el diseño normal', () => {
  const pie = L.computeLayout(PIE);
  const normal = L.computeLayout(BASE);
  const { marks, expected } = S.randomAnswers(20, 4, 31);
  const img = shoot(pie, { answers: marks, id: [0, 7] }, 31);
  const res = OMR.scanSheet(img, pie);
  assert.ok(res.ok, res.error);
  assert.equal(res.decoded.pie, true);
  assert.equal(res.id.value, '07');
  assert.deepEqual(res.answers.map((a) => a.marked), expected);
  assert.equal(res.warnings.filter((w) => /PIE/.test(w)).length, 0);
  // Con el diseño normal: otra cantidad de alternativas, pero se sabe que es PIE.
  const r1 = OMR.scanSheet(img, normal);
  assert.ok(!r1.ok);
  assert.equal(r1.decoded.pie, true);
  assert.equal(r1.decoded.numChoices, 4);
  // Una prueba normal de 4 alternativas no acepta la hoja PIE…
  const four = L.computeLayout(Object.assign({}, BASE, { numChoices: 4 }));
  const r2 = OMR.scanSheet(img, four);
  assert.ok(!r2.ok && r2.pieMismatch, r2.error);
  assert.match(r2.error, /versión PIE/);
  // …ni el diseño PIE acepta una hoja normal de 4 alternativas.
  const plain = shoot(four, { answers: marks, id: [0, 7] }, 32);
  const r3 = OMR.scanSheet(plain, pie);
  assert.ok(!r3.ok && r3.pieMismatch, r3.error);
  assert.equal(r3.decoded.pie, false);
  // Las hojas normales se leen como siempre.
  const r4 = OMR.scanSheet(plain, four);
  assert.ok(r4.ok, r4.error);
  assert.equal(r4.decoded.pie, false);
});

test('lector: hoja PIE en media hoja y en cuarto de hoja', () => {
  for (const format of ['half', 'quarter', 'ticket']) {
    const n = format === 'ticket' ? 5 : 15;
    const pie = L.computeLayout(Object.assign({}, PIE, { format, numQuestions: n }));
    const { marks, expected } = S.randomAnswers(n, 4, 40 + n);
    const res = OMR.scanSheet(shoot(pie, { answers: marks, id: [1, 2] }, 41), pie);
    assert.ok(res.ok, `${format}: ${res.error}`);
    assert.equal(res.decoded.pie, true, format);
    assert.deepEqual(res.answers.map((a) => a.marked), expected, format);
  }
});

test('varias hojas en una foto: normales y PIE juntas', () => {
  const t = L.computeLayout({ format: 'ticket', numQuestions: 5, numChoices: 4, idDigits: 2 });
  const tp = L.computeLayout({ format: 'ticket', numQuestions: 5, numChoices: 3, idDigits: 2, pie: true });
  const W = 1800;
  const H = 1400;
  const rand = S.mulberry32(3);
  const items = [];
  for (let i = 0; i < 4; i++) {
    const isPie = i === 1 || i === 2;
    const layout = isPie ? tp : t;
    const { marks } = S.randomAnswers(5, isPie ? 3 : 4, 60 + i);
    const sheet = S.rasterizeSheet(layout, 8, { answers: marks, id: [4, i] }, i);
    const w = 720;
    items.push({ layout, sheet, ppm: 8, corners: S.rectCorners(((i % 2) + 0.5) * (W / 2) + (rand() - 0.5) * 30, (Math.floor(i / 2) + 0.5) * (H / 2), w, (w * layout.height) / layout.width, (rand() - 0.5) * 0.25) });
  }
  const photo = S.photographMany(items, W, H, 7);
  const normal = OMR.scanSheets(photo, t);
  const pies = OMR.scanSheets(photo, tp);
  assert.deepEqual(normal.filter((r) => r.ok).map((r) => r.id.value).sort(), ['40', '43']);
  assert.deepEqual(pies.filter((r) => r.ok).map((r) => r.id.value).sort(), ['41', '42']);
  for (const r of pies) assert.equal(r.decoded.pie, true);
});
