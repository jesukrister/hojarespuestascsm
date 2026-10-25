const test = require('node:test');
const assert = require('node:assert/strict');
const RC = require('../js/pro/retro-core.js');
const Pdf = require('../js/pro/pdf-core.js');

const latin1 = (bytes) => Buffer.from(bytes).toString('latin1');

/** Verifica que la tabla xref apunte a cada objeto y devuelve el texto del PDF. */
function checkPdf(bytes) {
  const s = latin1(bytes);
  assert.ok(s.startsWith('%PDF-1.4'), 'encabezado');
  assert.ok(s.trimEnd().endsWith('%%EOF'), 'final');
  const start = Number(/startxref\n(\d+)\n%%EOF/.exec(s)[1]);
  assert.ok(s.slice(start).startsWith('xref'), 'startxref apunta a la tabla');
  const m = /xref\n0 (\d+)\n/.exec(s.slice(start));
  const count = Number(m[1]);
  const entries = s.slice(start + m[0].length).split('\n').slice(1, count);
  entries.forEach((line, i) => {
    const off = Number(line.slice(0, 10));
    assert.ok(s.slice(off).startsWith(`${i + 1} 0 obj`), `objeto ${i + 1} en ${off}`);
  });
  return s;
}

const hexOf = (text) => Pdf.encode(text).map((c) => c.toString(16).padStart(2, '0')).join('');

test('retro: rúbrica normalizada, por omisión y puntaje máximo', () => {
  assert.equal(RC.normalizeRubric(null), null);
  assert.equal(RC.normalizeRubric({ levels: [], criteria: [{ name: 'x' }] }), null);
  assert.equal(RC.normalizeRubric({ levels: [{ name: 'L', points: 2 }], criteria: [] }), null);
  const r = RC.normalizeRubric({ levels: [{ name: ' Logrado ', points: '3' }, { name: 'Por lograr', points: -2 }], criteria: [{ name: 'Idea', descs: ['ok'] }] });
  assert.deepEqual(r, { levels: [{ name: 'Logrado', points: 3 }, { name: 'Por lograr', points: 0 }], criteria: [{ name: 'Idea', descs: ['ok', ''] }] });
  assert.equal(RC.rubricMax(r), 3);
  const d = RC.defaultRubric(4);
  assert.deepEqual(d.levels.map((l) => l.points), [4, 2, 0]);
  assert.equal(RC.rubricMax(RC.normalizeRubric(d)), 4);
});

test('retro: puntaje de la rúbrica y conversión a la escala de la pregunta', () => {
  const rub = RC.normalizeRubric({
    levels: [{ name: 'L', points: 3 }, { name: 'ML', points: 2 }, { name: 'PL', points: 1 }],
    criteria: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
  });
  // 3 + 2 + 3 = 8 de 9 → 5,33 de 6 → 5
  assert.deepEqual(RC.rubricScore(rub, [0, 1, 0], 6), { raw: 8, total: 9, complete: true, chosen: 3, points: 5, converted: true });
  // 6 de 9 → 4 de 6
  assert.equal(RC.rubricScore(rub, [1, 1, 1], 6).points, 4);
  // 7,5 de 9 → 5 de 6 (redondeo hacia arriba desde ,5)
  assert.equal(RC.rubricScore({ levels: [{ name: '', points: 7.5 }, { name: '', points: 9 }], criteria: [{ name: '' }] }, [0], 6).points, 5);
  // Misma escala: sin conversión.
  assert.deepEqual(RC.rubricScore(rub, [0, 0, 2], 9), { raw: 7, total: 9, complete: true, chosen: 3, points: 7, converted: false });
  // Incompleta.
  const inc = RC.rubricScore(rub, [0, null], 6);
  assert.equal(inc.complete, false);
  assert.equal(inc.chosen, 1);
  assert.equal(RC.rubricSummary(rub, [0, null, 2]), 'a: L (3) · b: sin evaluar · c: PL (1)');
});

test('retro: rúbrica pegada desde Excel, Word o Google Docs', () => {
  const r = RC.parseRubricTable(
    'Criterio\tLogrado (3)\tMedianamente logrado (2 pts)\tPor lograr: 1\r\nArgumentación\tDos argumentos\tUno\tNinguno\r\nOrtografía\tSin errores\t\tMuchos errores\r\n\r\n'
  );
  assert.deepEqual(r.levels, [
    { name: 'Logrado', points: 3 },
    { name: 'Medianamente logrado', points: 2 },
    { name: 'Por lograr', points: 1 },
  ]);
  assert.deepEqual(r.criteria, [
    { name: 'Argumentación', descs: ['Dos argumentos', 'Uno', 'Ninguno'] },
    { name: 'Ortografía', descs: ['Sin errores', '', 'Muchos errores'] },
  ]);
  // Sin puntajes: de mayor a menor.
  const s = RC.parseRubricTable('Criterio\tExcelente\tBien\tInsuficiente\nOrden\tx\ty\tz');
  assert.deepEqual(s.levels.map((l) => [l.name, l.points]), [['Excelente', 2], ['Bien', 1], ['Insuficiente', 0]]);
  // Puntaje con coma decimal.
  assert.equal(RC.parseRubricTable('C\tLogrado 1,5 ptos\nX\ty').levels[0].points, 1.5);
  assert.equal(RC.parseRubricTable('una sola línea'), null);
  assert.equal(RC.parseRubricTable('a\nb'), null);
});

test('retro: comentarios guardados en el resultado', () => {
  assert.deepEqual(RC.normalizeFeedback(undefined, 2), { general: '', dev: [{ comment: '', picks: [] }, { comment: '', picks: [] }] });
  const f = RC.normalizeFeedback({ general: 'Bien', dev: [{ comment: 'x', picks: [0, 'a', 2, null] }] }, 1);
  assert.deepEqual(f, { general: 'Bien', dev: [{ comment: 'x', picks: [0, null, 2, null] }] });
});

test('retro: fórmulas como texto simple', () => {
  assert.equal(RC.plainMath('Si $\\frac{3}{4}$ y $\\frac{x+1}{2}$'), 'Si 3/4 y (x+1)/2');
  assert.equal(RC.plainMath('$\\sqrt{16} \\cdot 2 \\le 9$'), 'raíz de (16) · 2 <= 9');
  assert.equal(RC.plainMath('Sin fórmulas'), 'Sin fórmulas');
});

test('retro: preguntas en el orden y con las letras de la hoja del estudiante (fila B)', () => {
  const mc = [
    { stem: 'P1', options: ['uno', 'dos', 'tres'] },
    { stem: 'P2', options: ['rojo', 'verde', 'azul'] },
  ];
  // Fila B: primero la pregunta 2 de la fila A, con las alternativas en otro orden.
  const map = { order: [1, 0], perms: [[2, 0, 1], [0, 1, 2]] };
  // Clave fila A: P1 = B (dos), P2 = C (azul). En la hoja B, la pregunta 1 (= P2 de A) tiene azul en la A.
  const items = [
    { status: 'wrong', marked: [1], key: 0 },
    { status: 'correct', marked: [1], key: 1 },
  ];
  const qs = RC.reportQuestions(items, map, mc, [{ name: 'OA 2', questions: [1] }]);
  assert.equal(qs[0].n, 1);
  assert.equal(qs[0].canon, 2);
  assert.equal(qs[0].stem, 'P2');
  assert.deepEqual(qs[0].options, [{ letter: 'A', text: 'azul' }, { letter: 'B', text: 'rojo' }, { letter: 'C', text: 'verde' }]);
  assert.equal(qs[0].key, 'A');
  assert.equal(qs[0].marked, 'B');
  assert.equal(qs[0].oa, 'OA 2');
  assert.equal(qs[1].canon, 1);
  assert.equal(qs[1].oa, '');
  // Sin evaluación armada: sólo letras.
  const plain = RC.reportQuestions(items, null, null, []);
  assert.equal(plain[0].stem, null);
  assert.deepEqual(plain[0].options, []);
});

test('pdf: texto con tildes, líneas cortadas y estructura válida', () => {
  assert.deepEqual(Pdf.encode('ñá¿“€x'), [0xf1, 0xe1, 0xbf, 147, 128, 120]);
  assert.deepEqual(Pdf.encode('≈'), [63]);
  const lines = Pdf.wrap('una línea bastante larga que no cabe en tan poco espacio', 10, false, 80);
  assert.ok(lines.length > 2);
  for (const l of lines) assert.ok(Pdf.textWidth(l, 10, false) <= 80 || !l.includes(' '));
  assert.deepEqual(Pdf.wrap('a\nb', 10, false, 100), ['a', 'b']);
  // JPEG mínimo: sólo se lee su tamaño.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 20, 0, 30, 3, 1, 0x22, 0, 0xff, 0xd9]);
  assert.deepEqual(Pdf.jpegInfo(jpeg), { width: 30, height: 20, components: 3 });
  const doc = new Pdf.Doc({ info: { title: 'Prueba' } });
  const flow = new Pdf.Flow(doc);
  flow.heading('Título');
  for (let i = 0; i < 80; i++) flow.para(`Párrafo ${i}: texto de prueba con tildes y eñes, año ${2000 + i}.`);
  flow.table([{ width: 1 }, { width: 2 }], [['1', { text: 'Correcta', symbol: 'check' }]], { header: ['N°', 'Resultado'] });
  doc.image(jpeg, 10, 10, 30, 20);
  const s = checkPdf(doc.output());
  assert.ok(doc.pages.length >= 2, 'salto de página');
  assert.match(s, new RegExp(`/Count ${doc.pages.length}`));
  assert.ok(s.includes(hexOf('Párrafo 79')));
  assert.match(s, /\/Filter \/DCTDecode/);
});

test('retro: informe PDF del estudiante', () => {
  const rub = RC.parseRubricTable('Criterio\tLogrado (2)\tPor lograr (0)\nIdea\tClara\tConfusa\nEjemplos\tDos\tNinguno');
  const items = [
    { status: 'correct', marked: [0], key: 0 },
    { status: 'wrong', marked: [2], key: 1 },
    { status: 'blank', marked: [], key: 3 },
  ];
  const mc = [
    { stem: '¿Cuál es la capital de Chile?', options: ['Santiago', 'Lima', 'Quito', 'Bogotá'] },
    { stem: 'La soberanía reside en:', options: ['El Presidente', 'La Nación', 'El Congreso', 'Los jueces'] },
    { stem: 'Pregunta sin responder', options: ['a', 'b', 'c', 'd'] },
  ];
  const bytes = RC.buildStudentPdf({
    title: 'Evaluación de Historia',
    subtitle: '8° A',
    date: '22-10-2026',
    student: { name: 'Ana Pérez Ñúñez', code: '07', form: null, pie: false },
    summary: { grade: 3.4, failed: true, score: 4, maxScore: 7, percent: 57, correct: 1, wrong: 1, blank: 1, multiple: 0 },
    oa: [{ name: 'OA 1', percent: 33.3, level: 'NL', levelLabel: 'No logrado' }],
    questions: RC.reportQuestions(items, null, mc, [{ name: 'OA 1', questions: [0, 1, 2] }]),
    dev: [{ label: 'D1', max: 4, points: 3, scored: true, rubric: rub, picks: [0, 1], comment: 'Faltan ejemplos.' }],
    general: 'Repasa la unidad 2.',
    sheetJpeg: null,
  });
  const s = checkPdf(bytes);
  for (const t of ['Ana Pérez Ñúñez', 'Evaluación de Historia', 'La soberanía reside en:', 'B) La Nación — respuesta correcta', 'C) El Congreso — tu respuesta', 'Comentario: Faltan ejemplos.', 'Repasa la unidad 2.', 'Rúbrica: 2 de 4 puntos.', 'No respondiste esta pregunta.']) {
    assert.ok(s.includes(hexOf(t)), `falta «${t}»`);
  }
  // La pregunta correcta no aparece entre las que hay que revisar.
  assert.ok(!s.includes(hexOf('¿Cuál es la capital de Chile?')));
});
