'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SheetLayout = require('../js/layout.js');
const OMR = require('../js/omr.js');
const { rasterizeSheet, photograph, randomAnswers } = require('./helpers/synth.js');

const SHEET_PPM = 8;

function markedList(result) {
  return result.answers.map((a) => a.marked);
}

function scan(cfg, marks, photoOpts, scanOpts) {
  const layout = SheetLayout.computeLayout(cfg);
  const sheet = rasterizeSheet(layout, SHEET_PPM, marks, 11);
  const photo = photograph(sheet, SHEET_PPM, layout, photoOpts);
  return OMR.scanSheet(photo, layout, scanOpts);
}

test('lee una hoja fotografiada de frente', () => {
  const cfg = { paper: 'carta', numQuestions: 30, numChoices: 5, idDigits: 0 };
  const { marks, expected } = randomAnswers(30, 5, 1);
  const r = scan(cfg, { answers: marks }, {
    width: 1200,
    height: 1600,
    corners: [{ x: 90, y: 110 }, { x: 1110, y: 100 }, { x: 1120, y: 1420 }, { x: 80, y: 1430 }],
  });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(markedList(r), expected);
  assert.equal(r.codeVerified, true);
  assert.equal(r.rotation, 0);
});

test('tolera perspectiva, hoja invertida (180°), iluminación desigual y desenfoque', () => {
  const cfg = { paper: 'carta', numQuestions: 45, numChoices: 5, idDigits: 2 };
  const { marks, expected } = randomAnswers(45, 5, 2);
  const r = scan(cfg, { answers: marks, id: [1, 4] }, {
    width: 1500,
    height: 2000,
    seed: 5,
    // Esquinas TL, TR, BR, BL del papel: aparecen rotadas ~180° y en perspectiva.
    corners: [{ x: 1320, y: 1880 }, { x: 170, y: 1920 }, { x: 280, y: 130 }, { x: 1230, y: 70 }],
    light: (x, y) => 0.6 + 0.35 * x + 0.1 * y,
    blur: true,
  });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(markedList(r), expected);
  assert.equal(r.id.value, '14');
  assert.equal(r.id.complete, true);
});

test('detecta una foto horizontal (hoja girada 90°) en A4 con 6 alternativas', () => {
  const cfg = { paper: 'a4', numQuestions: 60, numChoices: 6, idDigits: 3 };
  const { marks, expected } = randomAnswers(60, 6, 3);
  const r = scan(cfg, { answers: marks, id: [0, 9, 5] }, {
    width: 2000,
    height: 1500,
    seed: 9,
    corners: [{ x: 1900, y: 90 }, { x: 1910, y: 1400 }, { x: 60, y: 1420 }, { x: 80, y: 60 }],
    light: (x) => 0.8 + 0.2 * Math.sin(x * 3),
  });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(markedList(r), expected);
  assert.equal(r.id.value, '095');
});

test('lee la hoja más densa (120 preguntas, 6 alternativas, 10 dígitos) en carta', () => {
  const cfg = { paper: 'carta', numQuestions: 120, numChoices: 6, idDigits: 10 };
  const { marks, expected } = randomAnswers(120, 6, 4);
  const id = [2, 0, 2, 6, 0, 9, 2, 2, 7, 1];
  const r = scan(cfg, { answers: marks, id }, {
    width: 1500,
    height: 2000,
    seed: 12,
    corners: [{ x: 110, y: 80 }, { x: 1400, y: 120 }, { x: 1450, y: 1930 }, { x: 60, y: 1900 }],
    light: (x, y) => 1 - 0.3 * y,
    blur: true,
  });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(markedList(r), expected);
  assert.equal(r.id.value, id.join(''));
});

test('corrige una hoja curvada usando las marcas laterales', () => {
  const cfg = { paper: 'carta', numQuestions: 60, numChoices: 5, idDigits: 2 };
  const { marks, expected } = randomAnswers(60, 5, 6);
  const r = scan(cfg, { answers: marks, id: [3, 1] }, {
    width: 1500,
    height: 2000,
    corners: [{ x: 120, y: 90 }, { x: 1390, y: 110 }, { x: 1420, y: 1920 }, { x: 90, y: 1900 }],
    bend: 9,
  });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(markedList(r), expected);
  assert.equal(r.id.value, '31');
});

test('rechaza (en vez de leer mal) una hoja muy curvada sin marcas laterales', () => {
  const cfg = { paper: 'carta', numQuestions: 60, numChoices: 5, idDigits: 0 };
  const { marks } = randomAnswers(60, 5, 7);
  const r = scan(cfg, { answers: marks, hideSideMarks: true }, {
    width: 1500,
    height: 2000,
    corners: [{ x: 120, y: 90 }, { x: 1390, y: 110 }, { x: 1420, y: 1920 }, { x: 90, y: 1900 }],
    bend: 9,
  });
  assert.equal(r.ok, false);
  assert.match(r.error, /alineadas/);
});

test('reconoce marcas tenues y descarta borrones claros', () => {
  const cfg = { paper: 'oficio', numQuestions: 10, numChoices: 4, idDigits: 0 };
  const answers = [
    [{ choice: 0 }],
    [{ choice: 1, value: 125 }], // lápiz suave
    [{ choice: 2, radius: 0.7 }], // relleno incompleto
    [{ choice: 3 }, { choice: 0, value: 215, holes: 0.4 }], // marca borrada en A
    [],
    [{ choice: 1 }, { choice: 2 }], // doble marca
    [{ choice: 0 }],
    [{ choice: 1 }],
    [{ choice: 2 }],
    [{ choice: 3 }],
  ];
  const r = scan(cfg, { answers }, {
    width: 1300,
    height: 1900,
    corners: [{ x: 120, y: 90 }, { x: 1190, y: 130 }, { x: 1230, y: 1800 }, { x: 70, y: 1780 }],
  });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(markedList(r), [[0], [1], [2], [3], [], [1, 2], [0], [1], [2], [3]]);
});

test('una hoja en blanco no produce marcas falsas', () => {
  const cfg = { paper: 'carta', numQuestions: 20, numChoices: 5, idDigits: 2 };
  const r = scan(cfg, { answers: [] }, {
    width: 1200,
    height: 1600,
    corners: [{ x: 100, y: 100 }, { x: 1100, y: 100 }, { x: 1100, y: 1400 }, { x: 100, y: 1400 }],
  });
  assert.equal(r.ok, true, r.error);
  assert.ok(r.answers.every((a) => a.marked.length === 0));
  assert.equal(r.id.complete, false);
});

test('rechaza una hoja de otra prueba usando el código impreso', () => {
  const printed = { paper: 'carta', numQuestions: 30, numChoices: 5, idDigits: 0 };
  const expectedCfg = { paper: 'carta', numQuestions: 40, numChoices: 5, idDigits: 0 };
  const sheetLayout = SheetLayout.computeLayout(printed);
  const sheet = rasterizeSheet(sheetLayout, SHEET_PPM, { answers: [] }, 4);
  const photo = photograph(sheet, SHEET_PPM, sheetLayout, {
    width: 1200,
    height: 1600,
    corners: [{ x: 100, y: 100 }, { x: 1100, y: 100 }, { x: 1100, y: 1400 }, { x: 100, y: 1400 }],
  });
  const r = OMR.scanSheet(photo, SheetLayout.computeLayout(expectedCfg));
  assert.equal(r.ok, false);
  assert.match(r.error, /30 preguntas/);
});

test('informa un error claro cuando no hay hoja en la imagen', () => {
  const layout = SheetLayout.computeLayout({ numQuestions: 10 });
  const w = 400, h = 300;
  const data = new Float32Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = 120 + ((i * 7919) % 50);
  const r = OMR.scanSheet({ width: w, height: h, data }, layout);
  assert.equal(r.ok, false);
  assert.match(r.error, /marcas negras/);
});

test('respeta un umbral manual', () => {
  const cfg = { paper: 'carta', numQuestions: 5, numChoices: 4, idDigits: 0 };
  const answers = [[{ choice: 0, value: 150 }], [{ choice: 1 }], [], [], []];
  const photoOpts = {
    width: 1200,
    height: 1600,
    corners: [{ x: 100, y: 100 }, { x: 1100, y: 100 }, { x: 1100, y: 1400 }, { x: 100, y: 1400 }],
  };
  const strict = scan(cfg, { answers }, photoOpts, { threshold: 0.6 });
  assert.equal(strict.ok, true, strict.error);
  assert.equal(strict.thresholdMode, 'manual');
  assert.deepEqual(strict.answers[0].marked, []);
  assert.deepEqual(strict.answers[1].marked, [1]);
});
