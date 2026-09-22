'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SheetLayout = require('../js/layout.js');
const Grading = require('../js/grading.js');
const SheetRenderer = require('../js/sheet.js');

test('el código de configuración se codifica y decodifica', () => {
  for (const paper of SheetLayout.PAPER_IDS)
    for (const numQuestions of [1, 37, 120])
      for (const numChoices of [2, 5, 6])
        for (const idDigits of [0, 4, 10]) {
          const cfg = { paper, numQuestions, numChoices, idDigits };
          assert.deepEqual(SheetLayout.decodeConfig(SheetLayout.encodeConfig(cfg)), cfg);
        }
  assert.equal(SheetLayout.decodeConfig(new Array(20).fill(0)), null);
  assert.equal(SheetLayout.decodeConfig(new Array(20).fill(1)), null);
});

test('las burbujas quedan dentro del papel y sin superponerse', () => {
  const configs = [
    { paper: 'carta', numQuestions: 120, numChoices: 5, idDigits: 0 },
    { paper: 'carta', numQuestions: 100, numChoices: 5, idDigits: 8 },
    { paper: 'a4', numQuestions: 80, numChoices: 6, idDigits: 10 },
    { paper: 'oficio', numQuestions: 120, numChoices: 6, idDigits: 10 },
    { paper: 'carta', numQuestions: 1, numChoices: 2, idDigits: 0 },
  ];
  for (const cfg of configs) {
    const L = SheetLayout.computeLayout(cfg);
    const all = [].concat(...L.questions.map((q) => q.bubbles), ...L.idRows.map((r) => r.bubbles));
    for (const b of all) {
      assert.ok(b.x - b.r > 10 && b.x + b.r < L.width - 10, `x fuera de rango en ${JSON.stringify(cfg)}`);
      assert.ok(b.y - b.r > 22 && b.y + b.r < L.height - 22, `y fuera de rango en ${JSON.stringify(cfg)}`);
    }
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y);
        assert.ok(d > all[i].r + all[j].r + 0.5, `burbujas superpuestas en ${JSON.stringify(cfg)}`);
      }
  }
});

test('la configuración más densa permitida cabe con burbujas legibles', () => {
  for (const paper of SheetLayout.PAPER_IDS) {
    const L = SheetLayout.computeLayout({
      paper,
      numQuestions: SheetLayout.LIMITS.maxQuestions,
      numChoices: SheetLayout.LIMITS.maxChoices,
      idDigits: SheetLayout.LIMITS.maxIdDigits,
    });
    assert.ok(L.grid.r >= 1.6, `burbujas muy pequeñas en ${paper}`);
  }
});

test('el SVG generado contiene las marcas y todas las burbujas', () => {
  const L = SheetLayout.computeLayout({ numQuestions: 12, numChoices: 4, idDigits: 2 });
  const svg = SheetRenderer.renderSVG(L, { title: 'Prueba <1>' });
  assert.match(svg, /^<svg/);
  assert.match(svg, /Prueba &lt;1&gt;/);
  const circles = (svg.match(/<circle /g) || []).length;
  assert.ok(circles >= 12 * 4 + 2 * 10);
});

test('nota con escala de exigencia 60 %', () => {
  assert.equal(Grading.computeGrade(0, 50), 1.0);
  assert.equal(Grading.computeGrade(30, 50), 4.0);
  assert.equal(Grading.computeGrade(50, 50), 7.0);
  assert.equal(Grading.computeGrade(15, 50), 2.5);
  assert.equal(Grading.computeGrade(40, 50), 5.5);
  assert.equal(Grading.computeGrade(35, 50, { exigencia: 70 }), 4.0);
});

test('corrección con omitidas, dobles marcas, preguntas anuladas y descuento', () => {
  const answers = [[0], [1], [], [2, 3], [2], [1]].map((m) => ({ marked: m }));
  const key = [0, 2, 1, 3, 2, null];
  const r = Grading.gradeAnswers(answers, key, { pointsCorrect: 2, penaltyWrong: 0.5 });
  assert.deepEqual(
    r.items.map((i) => i.status),
    ['correct', 'wrong', 'blank', 'multiple', 'correct', 'excluded']
  );
  assert.equal(r.correct, 2);
  assert.equal(r.maxScore, 10);
  assert.equal(r.score, 3); // 2·2 − (1 incorrecta + 1 doble)·0,5
  assert.equal(r.percent, 30);
});

test('análisis por pregunta', () => {
  const sheets = [
    [{ marked: [0] }, { marked: [1] }],
    [{ marked: [0] }, { marked: [] }],
    [{ marked: [2] }, { marked: [1, 2] }],
    [{ marked: [0] }, { marked: [1] }],
  ];
  const stats = Grading.itemAnalysis(sheets, [0, 1], 3);
  assert.equal(stats[0].correctPct, 75);
  assert.deepEqual(stats[0].counts, [3, 0, 1]);
  assert.equal(stats[1].blank, 1);
  assert.equal(stats[1].multiple, 1);
  assert.equal(stats[1].correctPct, 50);
});
