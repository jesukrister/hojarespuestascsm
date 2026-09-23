'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const TestDoc = require('../js/testdoc.js');

const simple = (r) => r.questions.map((q) => [q.stem, q.options, q.correct]);

test('ordena preguntas con distintos estilos de numeración y alternativas', () => {
  const text = `
1. ¿Cuál es la capital de Chile?
a) Santiago
b) Valparaíso
c) Concepción
d) Temuco

2) ¿Qué océano baña las costas de Chile?
A. Atlántico
B. Pacífico
C. Índico
D. Ártico

Pregunta 3: ¿En qué año se firmó el Acta de Independencia?
(a) 1810 (b) 1818 (c) 1823 (d) 1891
4.- El desierto más árido del mundo es: a) Sahara b) Atacama c) Gobi d) Kalahari`;
  const r = TestDoc.parseQuestions(text);
  assert.deepEqual(simple(r), [
    ['¿Cuál es la capital de Chile?', ['Santiago', 'Valparaíso', 'Concepción', 'Temuco'], null],
    ['¿Qué océano baña las costas de Chile?', ['Atlántico', 'Pacífico', 'Índico', 'Ártico'], null],
    ['¿En qué año se firmó el Acta de Independencia?', ['1810', '1818', '1823', '1891'], null],
    ['El desierto más árido del mundo es:', ['Sahara', 'Atacama', 'Gobi', 'Kalahari'], null],
  ]);
  assert.deepEqual(r.warnings, []);
});

test('une líneas cortadas, respeta listas I/II/III y reconoce la alternativa correcta', () => {
  const text = `1. Considera las siguientes afirmaciones sobre la
fotosíntesis que realizan las plantas:
I. Ocurre en los cloroplastos.
II. Libera oxígeno.
III. Consume oxígeno.
¿Cuál(es) es (son) correcta(s)?
a) Solo I
*b) Solo I y II
c) Solo II y III
d) I, II y III
2. La unidad de la vida es la
a) molécula
b) célula (correcta)
c) tejido
d) órgano que cumple una función
específica en el organismo`;
  const r = TestDoc.parseQuestions(text);
  assert.equal(r.questions.length, 2);
  assert.equal(
    r.questions[0].stem,
    'Considera las siguientes afirmaciones sobre la fotosíntesis que realizan las plantas:\nI. Ocurre en los cloroplastos.\nII. Libera oxígeno.\nIII. Consume oxígeno.\n¿Cuál(es) es (son) correcta(s)?'
  );
  assert.equal(r.questions[0].correct, 1);
  assert.equal(r.questions[0].options[1], 'Solo I y II');
  assert.equal(r.questions[1].correct, 1);
  assert.equal(r.questions[1].options[1], 'célula');
  assert.equal(r.questions[1].options[3], 'órgano que cumple una función específica en el organismo');
});

test('ordena por número, detecta lecturas, OA y clave al final', () => {
  const text = `OA12
3. Tercera pregunta
a) x b) y c) z

1. Primera pregunta
a) uno
b) dos
c) tres

Lee el siguiente texto y responde la pregunta 2.
La ballena azul es el animal más grande del planeta.

2. ¿Cuál es el animal más grande?
a) Elefante
b) Ballena azul
c) Jirafa

Clave: 1B 2-b 3c`;
  const r = TestDoc.parseQuestions(text);
  assert.deepEqual(r.questions.map((q) => q.stem), ['Primera pregunta', '¿Cuál es el animal más grande?', 'Tercera pregunta']);
  assert.deepEqual(r.questions.map((q) => q.correct), [1, 1, 2]);
  assert.equal(r.questions[1].preamble, 'Lee el siguiente texto y responde la pregunta 2.\nLa ballena azul es el animal más grande del planeta.');
  assert.deepEqual(r.questions.map((q) => q.oa), ['OA12', 'OA12', 'OA12']);
  const withIntro = TestDoc.parseQuestions('PRUEBA DE HISTORIA\n\n2. Segunda\na) x\nb) y\n1. Primera\na) x\nb) y');
  assert.equal(withIntro.intro, 'PRUEBA DE HISTORIA');
  assert.deepEqual(withIntro.questions.map((q) => [q.stem, q.preamble]), [['Primera', ''], ['Segunda', '']]);
  const kept = TestDoc.parseQuestions(text, { sortByNumber: false });
  assert.equal(kept.questions[0].stem, 'Tercera pregunta');
});

test('acepta preguntas sin número y alternativas desordenadas', () => {
  const text = `¿Cuánto es 2 + 2?
c) 5
a) 4
b) 3

¿Cuál es el color del cielo despejado?
a) Verde
b) Azul
c) Rojo`;
  const r = TestDoc.parseQuestions(text);
  assert.deepEqual(simple(r), [
    ['¿Cuánto es 2 + 2?', ['4', '3', '5'], null],
    ['¿Cuál es el color del cielo despejado?', ['Verde', 'Azul', 'Rojo'], null],
  ]);
});

test('no confunde números decimales ni oraciones con alternativas', () => {
  const text = `1. Un lado mide
3.5 cm y el otro el doble. ¿Cuál es el perímetro si es un rectángulo? Considere la vitamina A. Luego responda.
a) 7 cm
b) 10,5 cm
c) 21 cm
d) 14 cm`;
  const r = TestDoc.parseQuestions(text);
  assert.equal(r.questions.length, 1);
  assert.match(r.questions[0].stem, /^Un lado mide 3\.5 cm y el otro/);
  assert.equal(r.questions[0].options.length, 4);
});

test('advierte preguntas con alternativas faltantes o números repetidos', () => {
  const text = `1. Pregunta uno
a) x
b) y
c) z
2. Pregunta dos
a) x
3. Pregunta tres
a) x
b) y
c) z
3. Otra tres
a) x
b) y
c) z`;
  const r = TestDoc.parseQuestions(text);
  assert.ok(r.warnings.some((w) => /Pregunta 2.*1 alternativa/.test(w)));
  assert.ok(r.warnings.some((w) => /repetidos: 3/.test(w)));
});

test('la evaluación impresa incluye membrete, campos elegidos y alternativas', () => {
  const { questions } = TestDoc.parseQuestions('1. ¿Hola?\na) sí\nb) no');
  const html = TestDoc.renderTestHTML(
    questions,
    { school: 'Colegio <San Martín>', title: 'Prueba 1', fields: { rut: false, nota: true }, letterStyle: 'A)', fontSize: 11 },
    { maxScore: 1 }
  );
  assert.match(html, /Colegio &lt;San Martín&gt;/);
  assert.match(html, /font-size:11pt/);
  assert.doesNotMatch(html, />RUT:/);
  assert.match(html, />Nota:/);
  assert.match(html, /<span class="td-letter">B\)<\/span><span>no<\/span>/);
});

test('texto con líneas en blanco entre cada párrafo (copiado de Google Docs)', () => {
  const text = [
    '1. Primera pregunta',
    'a) uno',
    'b) dos',
    'c) tres',
    '¿Pregunta sin número?',
    'a) sí',
    'b) no',
    'OA13',
    '3. Tercera pregunta con',
    'enunciado largo',
    'a) x',
    'b) y',
  ].join('\n\n');
  const r = TestDoc.parseQuestions(text);
  assert.deepEqual(r.questions.map((q) => [q.stem, q.options.length, q.oa]), [
    ['Primera pregunta', 3, null],
    ['¿Pregunta sin número?', 2, null],
    ['Tercera pregunta con\n\nenunciado largo', 2, 'OA13'],
  ]);
});

const MIXED = `I. Selección múltiple
Marca la alternativa correcta.
2. ¿Capital de Chile?
a) Lima b) Santiago c) Quito
1. ¿Océano de Chile?
a) Pacífico b) Atlántico c) Índico

II. Verdadero o falso: Escribe V o F. Justifica las falsas.
1. ____ El sol es una estrella. (V)
2. ____ La Luna tiene luz propia.
3. ( ) Chile limita con Brasil.

III. Desarrollo (10 puntos)
1. Explica las causas de la independencia de Chile. [8 líneas]
2. Dibuja un mapa de tu región. [recuadro 12]
3. Responde:
a) ¿Qué es un cabildo?
b) ¿Quién fue O'Higgins?

Clave: 1A 2B 2F 3F`;

test('reconoce ítems de selección múltiple, verdadero o falso y desarrollo', () => {
  const r = TestDoc.parseQuestions(MIXED);
  assert.deepEqual(
    r.sections.map((s) => [s.title, s.type, s.instructions]),
    [
      ['I. Selección múltiple', 'mc', 'Marca la alternativa correcta.'],
      ['II. Verdadero o falso', 'tf', 'Escribe V o F. Justifica las falsas.'],
      ['III. Desarrollo (10 puntos)', 'open', ''],
    ]
  );
  assert.deepEqual(
    r.questions.map((q) => [q.section, q.type, q.stem]),
    [
      [0, 'mc', '¿Océano de Chile?'],
      [0, 'mc', '¿Capital de Chile?'],
      [1, 'tf', 'El sol es una estrella.'],
      [1, 'tf', 'La Luna tiene luz propia.'],
      [1, 'tf', 'Chile limita con Brasil.'],
      [2, 'open', 'Explica las causas de la independencia de Chile.'],
      [2, 'open', 'Dibuja un mapa de tu región.'],
      [2, 'open', 'Responde:'],
    ]
  );
  // Clave: la 1 y 2 de selección múltiple, la 2 y 3 de verdadero o falso; la 1 de V/F viene marcada con (V).
  assert.deepEqual(r.questions.slice(0, 2).map((q) => q.correct), [0, 1]);
  assert.deepEqual(r.questions.slice(2, 5).map((q) => q.tfAnswer), ['V', 'F', 'F']);
  assert.deepEqual(r.questions.slice(5).map((q) => [q.space, q.spaceStyle]), [[8, 'lines'], [12, 'box'], [null, null]]);
  assert.deepEqual(r.questions[7].options, ["¿Qué es un cabildo?", "¿Quién fue O'Higgins?"]);
  assert.deepEqual(r.warnings, []);
});

test('sin encabezados: pregunta sin alternativas es de desarrollo y "Verdadero/Falso" como alternativas es V/F', () => {
  const r = TestDoc.parseQuestions(`1. ¿Capital de Chile?
a) Lima
b) Santiago
2. El agua hierve a 100 °C a nivel del mar.
a) Verdadero
b) Falso
3. Explica el ciclo del agua.`);
  assert.deepEqual(r.questions.map((q) => q.type), ['mc', 'tf', 'open']);
  assert.deepEqual(r.questions[1].options, []);
  assert.ok(r.warnings.some((w) => /Pregunta 3: no tiene alternativas, se tratará como pregunta de desarrollo/.test(w)));
});

test('la prueba impresa arma ítems, numeración por ítem o continua, espacios y objetivos', () => {
  const r = TestDoc.parseQuestions(MIXED);
  const html = TestDoc.renderTestHTML(r.questions, { objectives: 'OA 5: Explicar la independencia\nOA 6: Analizar fuentes', tfJustifyLines: 2 }, { sections: r.sections });
  assert.match(html, /<div class="td-oabox"><strong>Objetivos de Aprendizaje:<\/strong><ul><li>OA 5: Explicar la independencia<\/li><li>OA 6: Analizar fuentes<\/li><\/ul><\/div>/);
  assert.ok(html.indexOf('td-oabox') < html.indexOf('td-instr'), 'los objetivos van antes de las instrucciones');
  assert.equal((html.match(/<div class="td-section"><h2>/g) || []).length, 3);
  assert.equal((html.match(/class="td-tfblank"/g) || []).length, 3);
  assert.match(html, /<div class="td-space td-box" style="height:96mm"><\/div>/); // recuadro de 12 líneas
  // 8 líneas (pregunta 1) + 3 por subpregunta × 2 (la mitad de las 6 por defecto) + 2 para justificar × 3 afirmaciones.
  assert.equal((html.match(/class="td-line"/g) || []).length, 8 + 3 * 2 + 2 * 3);
  const nums = (h) => [...h.matchAll(/<span class="td-num">(\d+)\.<\/span>/g)].map((m) => Number(m[1]));
  assert.deepEqual(nums(html), [1, 2, 1, 2, 3, 1, 2, 3]);
  const cont = TestDoc.renderTestHTML(r.questions, { numbering: 'continuous' }, { sections: r.sections });
  assert.deepEqual(nums(cont), [1, 2, 3, 4, 5, 6, 7, 8]);
  // Un solo objetivo: en singular.
  assert.match(TestDoc.renderTestHTML([], { objectives: 'OA 3' }), /Objetivo de Aprendizaje:<\/strong> OA 3/);
});

test('sin encabezados pero con tipos mezclados se forman ítems automáticamente', () => {
  const r = TestDoc.parseQuestions('1. ¿A?\na) x\nb) y\n2. ¿B?\na) x\nb) y\n3. Explica C.');
  const plan = TestDoc.planSections(r.questions, r.sections, {});
  assert.deepEqual(plan.blocks.map((b) => [b.title, b.items]), [['Ítem I. Selección múltiple', [0, 1]], ['Ítem II. Desarrollo', [2]]]);
  assert.deepEqual(plan.numbers, [1, 2, 1]);
});

test('avisa si hay texto después de la clave', () => {
  const r = TestDoc.parseQuestions('1. ¿A?\na) x\nb) y\nClave: 1A\n2. ¿B?\na) x\nb) y');
  assert.equal(r.questions.length, 1);
  assert.ok(r.warnings.some((w) => /después de la clave/.test(w)));
});
