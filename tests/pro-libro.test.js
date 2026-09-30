const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/pro/libro-core.js');

function course(fields) {
  const c = L.newCourse(Object.assign({ name: '8° Básico A', subject: 'Matemática' }, fields || {}));
  c.students = [
    { id: 's1', n: 1, name: 'Ana Aravena', rut: '', retired: false },
    { id: 's2', n: 2, name: 'Benjamín Bustos', rut: '', retired: false },
    { id: 's3', n: 3, name: 'Camila Castro', rut: '', retired: false },
  ];
  return c;
}

function ev(id, period, weight, grades, fields) {
  const g = {};
  for (const [k, v] of Object.entries(grades)) g[k] = { g: v };
  return Object.assign({ id, title: id, date: '2026-04-10', period, weight, kind: 'manual', grades: g, createdAt: 1, updatedAt: 1 }, fields || {});
}

test('aproximación y truncado a un decimal', () => {
  assert.equal(L.round1(3.95), 4);
  assert.equal(L.round1(3.949999), 3.9);
  assert.equal(L.round1(3.85), 3.9);
  assert.equal(L.round1(4.45), 4.5);
  assert.equal(L.round1(3.99, 'trunc'), 3.9);
  assert.equal(L.round1(4.0, 'trunc'), 4);
  assert.equal(L.fmtGrade(5.5), '5,5');
  assert.equal(L.fmtGrade(7), '7,0');
});

test('notas escritas a mano', () => {
  const c = course();
  assert.deepEqual(L.parseGrade('5,5', c), { value: 5.5 });
  assert.deepEqual(L.parseGrade('5.5', c), { value: 5.5 });
  assert.deepEqual(L.parseGrade('55', c), { value: 5.5 });
  assert.deepEqual(L.parseGrade('70', c), { value: 7 });
  assert.deepEqual(L.parseGrade('4', c), { value: 4 });
  assert.deepEqual(L.parseGrade('', c), { value: null });
  assert.ok(L.parseGrade('8', c).error);
  assert.ok(L.parseGrade('0,5', c).error);
  assert.ok(L.parseGrade('abc', c).error);
});

test('promedio ponderado, formativas y notas pendientes', () => {
  const c = course();
  c.evaluations = [ev('e1', 1, 30, { s1: 7.0, s2: 4.0 }), ev('e2', 1, 70, { s1: 4.0 }), ev('e3', 1, 0, { s1: 1.0, s2: 1.0 })];
  const a1 = L.periodAverage(c, 's1', 1);
  assert.equal(a1.value, 4.9); // 7*0,3 + 4*0,7
  assert.equal(a1.count, 2);
  const a2 = L.periodAverage(c, 's2', 1);
  assert.equal(a2.value, 4); // sólo la nota que tiene
  assert.equal(a2.pending, 1);
  const a3 = L.periodAverage(c, 's3', 1);
  assert.equal(a3.value, null);
  assert.equal(a3.pending, 2); // la formativa (peso 0) no queda pendiente
  const pct = L.weightPercents(c, 1);
  assert.equal(Math.round(pct.e1), 30);
  assert.equal(Math.round(pct.e2), 70);
  assert.equal(pct.e3, 0);
});

test('promedio final con promedios de periodo aproximados y limítrofes', () => {
  const c = course();
  c.evaluations = [
    ev('a', 1, 1, { s1: 4.0, s2: 6.0, s3: 3.0 }),
    ev('b', 1, 1, { s1: 3.8, s2: 6.5, s3: 3.0 }),
    ev('c', 2, 1, { s1: 3.9, s2: 5.0 }, { date: '2026-09-01' }),
  ];
  assert.equal(L.periodAverage(c, 's1', 1).value, 3.9);
  assert.equal(L.situation(c, 3.9), 'limitrofe');
  assert.equal(L.situation(c, 3.8), 'reprobado');
  assert.equal(L.situation(c, 4.0), 'aprobado');
  // (3,9 + 3,9) / 2
  assert.equal(L.finalAverage(c, 's1').value, 3.9);
  // (6,3 + 5,0) / 2 = 5,65 → 5,7
  assert.equal(L.periodAverage(c, 's2', 1).value, 6.3);
  assert.equal(L.finalAverage(c, 's2').value, 5.7);
  const sum = L.courseSummary(c, 1);
  assert.equal(sum.students, 3);
  assert.equal(sum.borderline, 1);
  assert.equal(sum.below, 2);
  const annual = L.courseSummary(c, 'anual');
  assert.equal(annual.withAverage, 3);
  assert.equal(annual.pending, 1); // s3 no tiene la evaluación del 2° semestre
});

test('periodo según la fecha', () => {
  assert.equal(L.periodForDate('2026-04-10', 2), 1);
  assert.equal(L.periodForDate('2026-08-10', 2), 2);
  assert.equal(L.periodForDate('2026-05-31', 3), 1);
  assert.equal(L.periodForDate('2026-07-15', 3), 2);
  assert.equal(L.periodForDate('2026-11-02', 3), 3);
});

test('lista del curso pegada de distintas formas', () => {
  let r = L.parseRosterText('Ana Aravena\nBenjamín Bustos\n\nCamila Castro');
  assert.deepEqual(r.students.map((s) => [s.n, s.name]), [[1, 'Ana Aravena'], [2, 'Benjamín Bustos'], [3, 'Camila Castro']]);

  r = L.parseRosterText('N°\tNombre\tRUT\n1\tAravena Soto, Ana\t12.345.678-5\n2\tBustos Díaz, Benjamín\t9876543-3\n4\tCastro, Camila\t');
  assert.deepEqual(
    r.students.map((s) => [s.n, s.name, s.rut]),
    [[1, 'Aravena Soto, Ana', '12.345.678-5'], [2, 'Bustos Díaz, Benjamín', '9.876.543-3'], [4, 'Castro, Camila', '']]
  );
  assert.deepEqual(r.warnings, []);

  r = L.parseRosterText('Nombre completo\n1. Ana Aravena 12.345.678-5\n2) Benjamín Bustos\n3 Camila Castro');
  assert.deepEqual(r.students.map((s) => [s.n, s.name, s.rut]), [[1, 'Ana Aravena', '12.345.678-5'], [2, 'Benjamín Bustos', ''], [3, 'Camila Castro', '']]);

  r = L.parseRosterText('ARAVENA\tSOTO\tANA\t12345678-0');
  assert.equal(r.students[0].name, 'ARAVENA SOTO ANA');
  assert.match(r.warnings[0], /dígito verificador/);

  r = L.parseRosterText('1\tAna\n1\tBeto');
  assert.match(r.warnings[0], /repetido/);
});

test('RUT: dígito verificador', () => {
  assert.equal(L.rutDv('12345678'), '5');
  assert.equal(L.rutDv('9876543'), '3');
  assert.deepEqual(L.normalizeRut('12345678-5'), { rut: '12.345.678-5', valid: true });
  assert.equal(L.normalizeRut('hola'), null);
});

test('lista para la prueba y columna para el libro digital (orden de lista)', () => {
  const c = course();
  c.students.push({ id: 's5', n: 5, name: 'Eva Estay', rut: '', retired: true });
  assert.equal(L.rosterText(c), 'Ana Aravena\nBenjamín Bustos\nCamila Castro\n\nEva Estay');
  const e = ev('e1', 1, 1, { s1: 5.5, s3: 3.2 });
  const text = L.columnText(c, (s) => (e.grades[s.id] ? e.grades[s.id].g : null));
  assert.equal(text, '5,5\n\n3,2\n\n');
});

test('guardar notas escaneadas: códigos, nombres, repetidas y notas editadas a mano', () => {
  const c = course();
  const e = ev('e1', 1, 1, { s2: 6.0, s3: 3.0 }, { kind: 'escaneada' });
  e.grades.s3.edited = true;
  const entries = [
    { label: 'Código 01', code: '01', g: 5.5, pts: 11, max: 20, pct: 55, ans: 'AB-*' },
    { label: 'Código 02', code: '02', g: 6.0 },
    { label: 'Código 03', code: '03', g: 4.0 },
    { label: 'Hoja 4', code: '0?', name: '', g: 4.0 },
    { label: 'Código 09', code: '09', g: 4.0 },
    { label: 'Hoja sin código', code: '', name: 'ana aravena', g: 2.0 },
  ];
  const plan = L.planSave(c, e, entries);
  const byName = Object.fromEntries(plan.rows.map((r) => [r.student.name, r.status]));
  assert.deepEqual(byName, { 'Benjamín Bustos': 'igual', 'Camila Castro': 'editada' });
  // Ana aparece dos veces (código 01 y por nombre): no se guarda hasta que quede una sola hoja.
  const reasons = plan.problems.map((p) => p.reason).join(' | ');
  assert.match(reasons, /incompleto \(0\?\)/);
  assert.match(reasons, /N° de lista 9/);
  assert.match(reasons, /2 hojas con el N° de lista 1/);

  const plan2 = L.planSave(c, e, entries.filter((x) => x.label !== 'Hoja sin código'));
  const ana = plan2.rows.find((r) => r.student.id === 's1');
  assert.equal(ana.status, 'nueva');
  L.applySave(e, plan2, 1000);
  assert.equal(e.grades.s1.g, 5.5);
  assert.equal(e.grades.s1.ans, 'AB-*');
  assert.equal(e.grades.s3.g, 3.0); // editada a mano: se conserva
  assert.equal(e.savedAt, 1000);
});

test('cambiar notas a mano recuerda la nota de la hoja', () => {
  const e = ev('e1', 1, 1, { s1: 5.0 }, { kind: 'escaneada' });
  L.setGrade(e, 's1', 5.5);
  assert.equal(e.grades.s1.edited, true);
  assert.equal(e.grades.s1.orig, 5.0);
  L.setGrade(e, 's1', 5.0);
  assert.ok(!e.grades.s1.edited);
  assert.equal(e.grades.s1.orig, undefined);
  L.setGrade(e, 's1', null);
  assert.equal(e.grades.s1, undefined);
  const m = ev('m', 1, 1, {});
  L.setGrade(m, 's2', 6.1);
  assert.equal(m.grades.s2.g, 6.1);
  assert.ok(!m.grades.s2.edited);
});

test('libro guardado con datos inválidos se limpia', () => {
  const book = L.sanitizeBook({
    courses: [
      { id: 'c1', name: 'X', periods: 3, students: [{ id: 'a', n: 2, name: 'B' }, { id: 'b', n: 0 }, { id: 'a', n: 3 }], evaluations: [{ id: 'e', title: '', grades: { a: { g: 5 }, b: { g: 'x' } }, period: 9, date: '2026-10-01' }] },
      { name: 'sin id' },
      'basura',
    ],
  });
  assert.equal(book.courses.length, 1);
  const c = book.courses[0];
  assert.equal(c.periods, 3);
  assert.deepEqual(c.students.map((s) => s.id), ['a']);
  assert.equal(c.evaluations[0].title, 'Evaluación');
  assert.equal(c.evaluations[0].period, 3); // periodo inválido: según la fecha
  assert.deepEqual(Object.keys(c.evaluations[0].grades), ['a']);
});

test('combinar libros de dos equipos', () => {
  const local = L.sanitizeBook({
    courses: [
      { id: 'c1', name: 'A', updatedAt: 10, students: [{ id: 's1', n: 1, name: 'Ana' }], evaluations: [{ id: 'e1', title: 'P1', updatedAt: 5, grades: { s1: { g: 4 } } }, { id: 'e2', title: 'Sólo local', updatedAt: 5 }] },
    ],
  });
  const incoming = L.sanitizeBook({
    courses: [
      { id: 'c1', name: 'A (renombrado)', updatedAt: 20, students: [{ id: 's1', n: 1, name: 'Ana María' }, { id: 's2', n: 2, name: 'Beto' }], evaluations: [{ id: 'e1', title: 'P1', updatedAt: 9, grades: { s1: { g: 6 } } }] },
      { id: 'c2', name: 'B', updatedAt: 1 },
    ],
  });
  const m = L.mergeBooks(local, incoming);
  assert.equal(m.courses.length, 2);
  const c1 = m.courses.find((c) => c.id === 'c1');
  assert.equal(c1.name, 'A (renombrado)');
  assert.deepEqual(c1.students.map((s) => s.name), ['Ana María', 'Beto']);
  assert.equal(c1.evaluations.find((e) => e.id === 'e1').grades.s1.g, 6);
  assert.ok(c1.evaluations.find((e) => e.id === 'e2'));
});

test('respuestas en texto', () => {
  assert.equal(L.encodeAnswers([{ marked: [0] }, { marked: [] }, { marked: [1, 2] }, { marked: [3] }]), 'A-*D');
});
