'use strict';

/*
 * Prueba aleatoria (con semillas fijas): configuraciones, perspectivas,
 * rotaciones, curvaturas e iluminación variadas. La regla que nunca debe
 * romperse: el lector entrega la lectura correcta o rechaza la foto, pero
 * jamás entrega una corrección equivocada sin avisar.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const SheetLayout = require('../js/layout.js');
const OMR = require('../js/omr.js');
const { rasterizeSheet, photograph, randomAnswers, mulberry32 } = require('./helpers/synth.js');

function randomCase(seed, format) {
  const rand = mulberry32(seed);
  const cfg = {
    paper: SheetLayout.PAPER_IDS[Math.floor(rand() * 3)],
    numQuestions: 5 + Math.floor(rand() * 116),
    numChoices: 2 + Math.floor(rand() * 5),
    idDigits: Math.floor(rand() * 5),
  };
  if (format) {
    cfg.format = format;
    cfg.numQuestions = format === 'quarter' ? 5 + (cfg.numQuestions % 25) : 5 + (cfg.numQuestions % 70);
  }
  const layout = SheetLayout.computeLayout(cfg);
  const { marks, expected } = randomAnswers(cfg.numQuestions, cfg.numChoices, seed);
  const id = Array.from({ length: cfg.idDigits }, () => Math.floor(rand() * 10));
  const hideSideMarks = rand() < 0.3;
  const sheet = rasterizeSheet(layout, 7, { answers: marks, id, hideSideMarks }, seed);
  const W = 1400 + Math.floor(rand() * 600);
  const H = 1800 + Math.floor(rand() * 400);
  const j = () => (rand() - 0.5) * 0.16;
  let corners = [
    { x: W * (0.06 + j()), y: H * (0.05 + j()) },
    { x: W * (0.94 + j()), y: H * (0.05 + j()) },
    { x: W * (0.94 + j()), y: H * (0.95 + j()) },
    { x: W * (0.06 + j()), y: H * (0.95 + j()) },
  ].map((c) => ({ x: Math.min(W - 5, Math.max(5, c.x)), y: Math.min(H - 5, Math.max(5, c.y)) }));
  // Rotación de la foto completa.
  const rot = Math.floor(rand() * 4);
  let PW = W, PH = H;
  if (rot === 1) { corners = corners.map((c) => ({ x: H - c.y, y: c.x })); PW = H; PH = W; }
  if (rot === 2) corners = corners.map((c) => ({ x: W - c.x, y: H - c.y }));
  if (rot === 3) { corners = corners.map((c) => ({ x: c.y, y: W - c.x })); PW = H; PH = W; }
  const bend = (rand() < 0.5 ? rand() * 12 : 0) * (format === 'quarter' ? 0.5 : format === 'half' ? 0.75 : 1);
  const lightA = 0.55 + rand() * 0.4;
  const photo = photograph(sheet, 7, layout, {
    width: PW,
    height: PH,
    corners,
    bend,
    seed,
    noise: 3 + rand() * 8,
    blur: rand() < 0.5,
    light: (x, y) => lightA + (1 - lightA) * x * (0.5 + y),
  });
  return { layout, photo, expected, id: id.join(''), bend, hideSideMarks };
}

// Incluye semillas que en el pasado produjeron lecturas corridas una fila o una alternativa.
const SEEDS = [5029, 320, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

test('nunca entrega una lectura equivocada: correcta o rechazada', () => {
  let correct = 0;
  for (const seed of SEEDS) {
    const c = randomCase(seed);
    const r = OMR.scanSheet(c.photo, c.layout);
    if (!r.ok) {
      // Sólo se aceptan rechazos en hojas con curvatura fuerte.
      assert.ok(c.bend > 5, `semilla ${seed}: rechazo inesperado de una hoja plana: ${r.error}`);
      continue;
    }
    assert.deepEqual(r.answers.map((a) => a.marked), c.expected, `semilla ${seed}: respuestas`);
    if (c.layout.config.idDigits) assert.equal(r.id.value, c.id, `semilla ${seed}: código`);
    correct++;
  }
  assert.ok(correct >= SEEDS.length / 2, `demasiados rechazos (${correct} lecturas correctas)`);
});

test('media hoja y cuarto de hoja: correcta o rechazada, nunca equivocada', () => {
  let correct = 0;
  const cases = [];
  for (const seed of [11, 12, 13, 14, 15, 16]) cases.push([seed, seed % 2 ? 'half' : 'quarter']);
  for (const [seed, format] of cases) {
    const c = randomCase(seed, format);
    const r = OMR.scanSheet(c.photo, c.layout);
    if (!r.ok) {
      assert.ok(c.bend > 3, `semilla ${seed} (${format}): rechazo inesperado de una hoja plana: ${r.error}`);
      continue;
    }
    assert.deepEqual(r.answers.map((a) => a.marked), c.expected, `semilla ${seed} (${format}): respuestas`);
    if (c.layout.config.idDigits) assert.equal(r.id.value, c.id, `semilla ${seed} (${format}): código`);
    correct++;
  }
  assert.ok(correct >= cases.length / 2, `demasiados rechazos (${correct} lecturas correctas)`);
});
