'use strict';

/*
 * Tipos de ítem nuevos (términos pareados, completación, ordenar) y filas
 * A–D: mezcla reproducible, claves por fila y lectura de la fila en la hoja.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const TestDoc = require('../js/testdoc.js');
const SheetLayout = require('../js/layout.js');
const OMR = require('../js/omr.js');
const { rasterizeSheet, photograph, randomAnswers } = require('./helpers/synth.js');

const SAMPLE = `I. Selección múltiple
1. ¿Qué es el sol?
a) Planeta b) Estrella c) Satélite d) Cometa
2. El sol está en
a) La Vía Láctea b) Andrómeda c) Ninguna de las anteriores
3. Capital de Chile
a) Santiago b) Lima c) Quito d) Bogotá
4. Capital de Perú
a) Santiago b) Lima c) Quito d) A y B son correctas
5. ¿Cuánto es 2+2?
a) 3 b) 4 c) 5 d) 6
II. Verdadero o falso
1. El agua hierve a 100 °C. (V)
2. La Tierra es plana. (F)
3. Chile está en Sudamérica. (V)
III. Términos pareados
Fotosíntesis = Proceso por el cual las plantas producen su alimento
Mitocondria = Organelo que produce energía
Núcleo - Contiene el material genético
Célula → Unidad básica de la vida
IV. Completación
Banco de palabras: nitrógeno
1. La capital de Chile es [Santiago].
2. El agua se compone de [hidrógeno] y [oxígeno].
V. Ordenar secuencia
1. Ordena cronológicamente:
a) Descubrimiento de América
b) Independencia de Chile
c) Guerra del Pacífico
VI. Respuesta breve
1. ¿Qué es un ecosistema?
Clave: 1b 2a 3a 4b 5b`;

test('reconoce términos pareados, completación, ordenar y respuesta breve', () => {
  const r = TestDoc.parseQuestions(SAMPLE);
  assert.deepEqual(r.questions.map((q) => q.type), ['mc', 'mc', 'mc', 'mc', 'mc', 'tf', 'tf', 'tf', 'match', 'fill', 'fill', 'order', 'open']);
  const m = r.questions[8];
  assert.deepEqual(m.terms, ['Fotosíntesis', 'Mitocondria', 'Núcleo', 'Célula']);
  assert.equal(m.defs[2], 'Contiene el material genético');
  assert.deepEqual(m.matches, [0, 1, 2, 3]);
  assert.equal(m.given, false);
  assert.deepEqual(TestDoc.blanksOf(r.questions[10].stem), ['hidrógeno', 'oxígeno']);
  assert.deepEqual(r.sections[3].bank, ['nitrógeno']);
  assert.deepEqual(r.questions[11].options, ['Descubrimiento de América', 'Independencia de Chile', 'Guerra del Pacífico']);
  assert.equal(r.questions[12].space, 2);
  assert.deepEqual(r.warnings, ['Pregunta 2: tiene 3 alternativas y la mayoría tiene 4.']);
});

test('términos pareados en columnas separadas, con respuestas y distractor', () => {
  const r = TestDoc.parseQuestions(`III. Términos pareados
Columna A
1. Fotosíntesis (b)
2. Mitocondria
3. Núcleo
4. Ribosoma
Columna B
a) Organelo que produce energía
b) Proceso de las plantas
c) Contiene el ADN
Clave: 2a 3c`);
  const m = r.questions[0];
  assert.equal(m.type, 'match');
  assert.deepEqual(m.terms, ['Fotosíntesis', 'Mitocondria', 'Núcleo', 'Ribosoma']);
  assert.deepEqual(m.matches, [1, 0, 2]);
  assert.equal(m.given, true);
});

test('una tabla pegada (tabulaciones) sirve para términos pareados', () => {
  const r = TestDoc.parseQuestions('Términos pareados\nOxígeno\tO\nHidrógeno\tH\nSodio\tNa');
  assert.deepEqual(r.questions[0].terms, ['Oxígeno', 'Hidrógeno', 'Sodio']);
  assert.deepEqual(r.questions[0].defs, ['O', 'H', 'Na']);
});

test('sin encabezado: "____" en medio del enunciado es completación y "Ordena…" con alternativas es ordenar', () => {
  const r = TestDoc.parseQuestions('1. El agua hierve a ____ grados.\n2. Ordena de menor a mayor:\na) 5 b) 1 c) 3\n3. ¿Capital?\na) X b) Y');
  assert.deepEqual(r.questions.map((q) => q.type), ['fill', 'order', 'mc']);
});

test('la evaluación muestra el banco de palabras, las columnas y los recuadros para ordenar', () => {
  const r = TestDoc.parseQuestions(SAMPLE);
  const html = TestDoc.renderTestHTML(r.questions, {}, { sections: r.sections });
  assert.match(html, /class="td-bank"><span>hidrógeno<\/span><span>nitrógeno<\/span><span>oxígeno<\/span><span>Santiago<\/span>/);
  assert.equal((html.match(/class="td-blank"/g) || []).length, 3);
  assert.match(html, /Columna A/);
  assert.equal((html.match(/class="td-orderbox"/g) || []).length, 3);
  assert.doesNotMatch(html, /\[Santiago\]/);
});

test('filas: A conserva el orden; B–D mezclan preguntas y alternativas y la clave sigue a cada pregunta', () => {
  const r = TestDoc.parseQuestions(SAMPLE);
  const forms = TestDoc.buildForms(r.questions, r.sections, { forms: 4, formSeed: 11 });
  assert.equal(forms.length, 4);
  assert.deepEqual(forms[0].source, r.questions.map((_, i) => i));
  forms[0].questions.forEach((q, i) => {
    if (q.type === 'mc') assert.deepEqual(q.options, r.questions[i].options);
  });
  const orders = forms.map((f) => f.source.slice(0, 5).join());
  assert.equal(new Set(orders).size, 4, 'cada fila tiene otro orden de preguntas');
  for (const f of forms) {
    // Los ítems no se mezclan entre sí, y el desarrollo no se mueve.
    assert.deepEqual(f.source.slice(0, 5).sort(), [0, 1, 2, 3, 4]);
    assert.deepEqual(f.source.slice(5, 8).sort(), [5, 6, 7]);
    assert.equal(f.source[12], 12);
    f.questions.forEach((q, pos) => {
      const orig = r.questions[f.source[pos]];
      if (q.type !== 'mc') return;
      assert.equal(q.options[q.correct], orig.options[orig.correct], 'la respuesta correcta es la misma alternativa');
      q.optionPerm.forEach((o, k) => assert.equal(q.options[k], orig.options[o]));
      if (/anteriores/.test(orig.options[2])) assert.equal(q.options[2], orig.options[2]);
      if (orig.options.some((o) => /A y B/.test(o))) assert.deepEqual(q.options, orig.options);
    });
  }
  // Misma semilla, mismas filas.
  assert.deepEqual(TestDoc.buildForms(r.questions, r.sections, { forms: 4, formSeed: 11 }).map((f) => f.source), forms.map((f) => f.source));
});

test('pauta de respuestas por fila', () => {
  const r = TestDoc.parseQuestions(SAMPLE);
  const forms = TestDoc.buildForms(r.questions, r.sections, { forms: 2, formSeed: 3 });
  for (const f of forms) {
    const m = f.questions.find((q) => q.type === 'match');
    // Cada línea de la columna B lleva el número de su término en la columna A.
    m.defOrder.forEach((d, row) => {
      const txt = TestDoc.answerText(m, TestDoc.DEFAULT_FORMAT).split(' · ')[row];
      assert.equal(txt, `${'abcd'[row]}) ${m.termOrder.indexOf(m.matches[d]) + 1}`);
    });
    const o = f.questions.find((q) => q.type === 'order');
    assert.notDeepEqual(o.itemOrder, [0, 1, 2], 'la secuencia se imprime desordenada');
  }
  const html = TestDoc.renderAnswerKeyHTML(forms, {}, { sections: r.sections });
  assert.match(html, /Fila A/);
  assert.match(html, /Fila B/);
  assert.match(html, /hidrógeno \/ oxígeno/);
});

test('preguntas sobre un mismo texto ("responde las preguntas 1 a 2") no se separan', () => {
  const text = `Selección múltiple
Lee el texto y responde las preguntas 1 a 2.
1. P1
a) x b) y c) z
2. P2
a) x b) y c) z
3. P3
a) x b) y c) z
4. P4
a) x b) y c) z
5. P5
a) x b) y c) z`;
  const r = TestDoc.parseQuestions(text);
  for (let seed = 1; seed < 6; seed++) {
    const forms = TestDoc.buildForms(r.questions, r.sections, { forms: 3, formSeed: seed });
    for (const f of forms) assert.deepEqual(f.source.slice(0, 2), [0, 1]);
  }
});

test('código de fila: paridad par, la fila A no imprime nada', () => {
  assert.equal(SheetLayout.decodeForm([0, 0, 0]), 0);
  assert.equal(SheetLayout.decodeForm([1, 1, 0]), 3);
  for (const bad of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 1]]) assert.equal(SheetLayout.decodeForm(bad), null);
  const plain = SheetLayout.computeLayout({ numQuestions: 20 });
  const a = SheetLayout.computeLayout({ numQuestions: 20, form: 0 });
  assert.ok(plain.formCells.every((c) => !c.bit));
  assert.ok(a.formCells.every((c) => !c.bit));
  assert.deepEqual(plain.questions, SheetLayout.computeLayout({ numQuestions: 20, form: 2 }).questions);
});

test('el lector reconoce la fila impresa en la hoja', () => {
  for (const [format, form] of [['full', 1], ['half', 2], ['quarter', 3], ['full', 0]]) {
    const cfg = { numQuestions: 12, numChoices: 4, idDigits: 1, format };
    const printed = SheetLayout.computeLayout(Object.assign({ form }, cfg));
    const { marks } = randomAnswers(12, 4, 5);
    const sheet = rasterizeSheet(printed, 7, { answers: marks }, 5);
    const W = 1500;
    const H = 1900;
    const photo = photograph(sheet, 7, printed, {
      width: W,
      height: H,
      corners: [{ x: 90, y: 110 }, { x: W - 70, y: 95 }, { x: W - 95, y: H - 80 }, { x: 80, y: H - 100 }],
      seed: 5,
    });
    const res = OMR.scanSheet(photo, SheetLayout.computeLayout(cfg));
    assert.ok(res.ok, res.error);
    assert.equal(res.form.index, form, `${format} fila ${form}: ${res.form.values}`);
  }
});
