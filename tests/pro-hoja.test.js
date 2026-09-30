/*
 * Versión Pro: casillas de desarrollo, ticket de salida (8 por página),
 * varias hojas en una misma foto y hojas distintas en una misma página.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/layout.js');
const OMR = require('../js/omr.js');
const G = require('../js/grading.js');
const SheetRenderer = require('../js/sheet.js');
const S = require('./helpers/synth.js');

const DEV = [{ label: 'D1', max: 4 }, { label: 'D2', max: 6 }, { label: 'P23', max: 3 }];

function shoot(layout, marks, seed) {
  const ppm = 6;
  const sheet = S.rasterizeSheet(layout, ppm, marks, seed);
  const W = 1300;
  const w = W * 0.82;
  const h = (w * layout.height) / layout.width;
  return S.photographMany([{ layout, sheet, ppm, corners: S.rectCorners(W / 2, h / 2 + 90, w, h, 0.03) }], W, Math.round(h + 180), seed);
}

test('casillas de desarrollo: diseño bajo la grilla y código extra', () => {
  const plain = L.computeLayout({ numQuestions: 30, numChoices: 5, idDigits: 2 });
  const withDev = L.computeLayout({ numQuestions: 30, numChoices: 5, idDigits: 2, dev: DEV });
  // Con espacio de sobra, las preguntas quedan exactamente igual que sin casillas.
  assert.deepEqual(withDev.questions, plain.questions);
  assert.equal(withDev.devRows.length, 3);
  assert.deepEqual(withDev.devRows.map((r) => r.bubbles.length), [5, 7, 4]);
  const lastRow = Math.max(...withDev.questions.map((q) => q.y));
  assert.ok(withDev.devRows[0].y - lastRow > 2 * withDev.grid.pitch, 'separación bajo la última pregunta');
  assert.ok(withDev.dev.bottom <= withDev.grid.bottom);
  assert.deepEqual(plain.extCells.map((c) => c.bit), [0, 0, 0, 0]);
  assert.equal(L.decodeExt(withDev.extCells.map((c) => c.bit)), 3);
  assert.equal(L.decodeExt([1, 0, 0, 0]), null); // paridad
  assert.equal(L.normalizeDev(new Array(12).fill({ max: 99 })).length, L.LIMITS.maxDev);
  assert.equal(L.normalizeDev([{ label: '  Ortografía ', max: 0 }])[0].label, 'Ortog');
  assert.equal(L.normalizeDev([{ max: 0 }])[0].max, 1);
  // Si no caben, se prueba con más columnas o menor espaciado (o se avisa).
  const tight = L.computeLayout({ format: 'half', numQuestions: 30, numChoices: 5, idDigits: 2, dev: DEV });
  assert.ok(tight.dev.bottom <= tight.grid.bottom);
  assert.throws(() => L.computeLayout({ format: 'quarter', numQuestions: 30, numChoices: 5, idDigits: 2, dev: DEV }), /casilla\(s\) de desarrollo/);
});

test('nota con puntos de desarrollo', () => {
  const answers = [{ marked: [0] }, { marked: [1] }, { marked: [] }];
  const plain = G.gradeAnswers(answers, [0, 0, 0]);
  assert.equal(plain.dev, undefined);
  const g = G.gradeAnswers(answers, [0, 0, 0], undefined, { items: [{ label: 'D1', max: 4 }, { label: 'D2', max: 2 }, { label: 'D3', max: 3 }], marks: [{ marked: [3] }, null, { marked: [1, 2] }] });
  assert.equal(g.score, 4);
  assert.equal(g.maxScore, 12);
  assert.equal(g.devPoints, 3);
  assert.deepEqual(g.dev.map((d) => d.status), ['scored', 'blank', 'multiple']);
});

test('lector: puntajes de desarrollo y hojas con otra cantidad de casillas', () => {
  const layout = L.computeLayout({ numQuestions: 25, numChoices: 4, idDigits: 2, dev: DEV });
  const { marks, expected } = S.randomAnswers(25, 4, 21);
  const pts = [3, null, 2];
  const img = shoot(layout, { answers: marks, id: [1, 4], dev: pts }, 21);
  const res = OMR.scanSheet(img, layout);
  assert.ok(res.ok, res.error);
  assert.equal(res.id.value, '14');
  assert.deepEqual(res.answers.map((a) => a.marked), expected);
  assert.deepEqual(res.dev.map((d) => d.marked), [[3], [], [2]]);
  assert.equal(res.decoded.devCount, 3);

  const noDev = L.computeLayout({ numQuestions: 25, numChoices: 4, idDigits: 2 });
  const r1 = OMR.scanSheet(img, noDev);
  assert.ok(!r1.ok && r1.devMismatch);
  assert.match(r1.error, /3 casilla\(s\) de desarrollo, pero la prueba configurada no tiene/);
  const old = shoot(noDev, {}, 22);
  const r2 = OMR.scanSheet(old, layout);
  assert.ok(!r2.ok && r2.devMismatch && r2.decoded.devCount === 0);
  // Configuración con un máximo distinto al impreso: se rechaza (nunca se lee corrido).
  const other = L.computeLayout({ numQuestions: 25, numChoices: 4, idDigits: 2, dev: DEV.map((d, i) => (i === 1 ? { label: 'D2', max: 8 } : d)) });
  const r3 = OMR.scanSheet(img, other);
  assert.ok(!r3.ok);
  assert.match(r3.error, /casillas de desarrollo de la hoja no calzan/);
});

test('ticket de salida: 8 por página, apaisado y legible', () => {
  const t = L.computeLayout({ format: 'ticket', numQuestions: 5, numChoices: 4, idDigits: 2 });
  assert.ok(t.width > t.height);
  assert.equal(L.pageTiling('carta', 'ticket').pieces.length, 8);
  assert.equal(L.decodeConfig(L.encodeConfig({ format: 'ticket', numQuestions: 5, numChoices: 4, idDigits: 2 })).format, 'ticket');
  const { marks, expected } = S.randomAnswers(5, 4, 5);
  const res = OMR.scanSheet(shoot(t, { answers: marks, id: [2, 7] }, 5), t);
  assert.ok(res.ok, res.error);
  assert.equal(res.id.value, '27');
  assert.deepEqual(res.answers.map((a) => a.marked), expected);
});

test('varias hojas en una misma foto: se leen todas', () => {
  const t = L.computeLayout({ format: 'ticket', numQuestions: 5, numChoices: 4, idDigits: 2 });
  const W = 1800, H = 1400;
  const rand = S.mulberry32(9);
  const items = [];
  const expect = {};
  for (let i = 0; i < 4; i++) {
    const code = String(31 + i);
    const { marks, expected } = S.randomAnswers(5, 4, 50 + i);
    expect[code] = expected;
    const sheet = S.rasterizeSheet(t, 8, { answers: marks, id: [3, 1 + i] }, i);
    const w = 720;
    items.push({ layout: t, sheet, ppm: 8, corners: S.rectCorners(((i % 2) + 0.5) * (W / 2) + (rand() - 0.5) * 30, (Math.floor(i / 2) + 0.5) * (H / 2), w, (w * t.height) / t.width, (rand() - 0.5) * 0.25) });
  }
  const results = OMR.scanSheets(S.photographMany(items, W, H, 4), t);
  assert.equal(results.length, 4);
  for (const r of results) {
    assert.ok(r.ok, r.error);
    assert.deepEqual(r.answers.map((a) => a.marked), expect[r.id.value]);
  }
  assert.deepEqual(results.map((r) => r.id.value).sort(), ['31', '32', '33', '34']);
  // Una foto con una sola hoja da un solo resultado.
  assert.equal(OMR.scanSheets(S.photographMany(items.slice(0, 1), 1000, 800, 5), t).length, 1);
});

test('página con una hoja distinta por recorte (hojas con nombre)', () => {
  const t = L.computeLayout({ format: 'ticket', numQuestions: 5, numChoices: 4, idDigits: 2 });
  const pieces = ['Ana', 'Beto', 'Carla'].map((name, i) => ({ layout: t, opts: { title: 'Ticket', fill: { id: [0, i + 1], fields: { Nombre: name } } } }));
  const page = SheetRenderer.renderPageSVG(t, { title: 'Ticket' }, pieces, true);
  assert.equal((page.svg.match(/<g transform=/g) || []).length, 3); // los otros 5 recortes quedan en blanco
  assert.match(page.svg, /Beto/);
  const repeated = SheetRenderer.renderPageSVG(t, { title: 'Ticket' }, pieces);
  assert.equal((repeated.svg.match(/<g transform=/g) || []).length, 8);
});
