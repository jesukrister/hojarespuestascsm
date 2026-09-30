const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/pro/informe-core.js');
const L = require('../js/pro/libro-core.js');

const LEVELS = { achieved: 75, partial: 50 };

test('tramos de notas y estadísticas', () => {
  const bands = R.gradeBands([1.0, 1.9, 2.0, 3.9, 4.0, 5.5, 6.9, 7.0, null], 1, 7);
  assert.deepEqual(bands.map((b) => b.label), ['1,0–1,9', '2,0–2,9', '3,0–3,9', '4,0–4,9', '5,0–5,9', '6,0–7,0']);
  assert.deepEqual(bands.map((b) => b.count), [2, 1, 1, 1, 1, 2]);
  const st = R.stats([3.5, 4.0, 5.5, 7.0], 4);
  assert.equal(st.n, 4);
  assert.equal(st.mean, 5);
  assert.equal(st.passed, 3);
  assert.equal(st.passRate, 0.75);
  assert.equal(st.min, 3.5);
  assert.equal(R.stats([], 4).mean, null);
  assert.equal(R.dec(5.25), '5,3');
  assert.equal(R.dec(72, 0), '72');
});

function course() {
  const c = L.newCourse({ name: '8° A', subject: 'Ciencias', periods: 2 });
  c.students = [
    { id: 'a', n: 1, name: 'Ana', rut: '', retired: false, pie: true },
    { id: 'b', n: 2, name: 'Beto', rut: '', retired: false },
    { id: 'c', n: 3, name: 'Carla', rut: '', retired: false },
    { id: 'd', n: 4, name: 'Dani', rut: '', retired: true },
  ];
  const ev = (id, date, period, grades, weight) => ({ id, title: 'Prueba ' + id, date, period, weight: weight === undefined ? 1 : weight, kind: 'escaneada', grades, createdAt: 1, updatedAt: 1 });
  c.evaluations = [
    ev('p1', '2026-04-10', 1, { a: { g: 3.2, oa: { 'OA 1': 40, 'OA 2': 60 } }, b: { g: 5.5, oa: { 'OA 1': 80, 'OA 2': 90 } }, c: { g: 4.5, oa: { 'OA 1': 50 } } }),
    ev('p2', '2026-05-20', 1, { a: { g: 4.6, oa: { 'OA 1': 60 } }, b: { g: 6.0 }, c: { g: 3.1, oa: { 'OA 1': 20 } } }),
    ev('t1', '2026-05-21', 1, { a: { g: 2.0 }, b: { g: 7.0 } }, 0),
    ev('p3', '2026-08-20', 2, { a: { g: 5.0 } }),
  ];
  return c;
}

test('logro por OA acumulado en el libro', () => {
  const c = course();
  const oa = R.aggregateOa(c.evaluations.filter((e) => e.period === 1), ['a', 'b', 'c'], LEVELS);
  const oa1 = oa.find((o) => o.name === 'OA 1');
  assert.equal(oa1.average, 50); // (40 + 80 + 50 + 60 + 20) / 5
  assert.equal(oa1.level, 'ML');
  assert.equal(oa1.evaluations, 2);
  assert.equal(oa1.students, 3);
  // Por estudiante: Ana 50 (ML), Beto 80 (L), Carla 35 (NL).
  assert.deepEqual(oa1.counts, { L: 1, ML: 1, NL: 1 });
  assert.equal(oa.find((o) => o.name === 'OA 2').average, 75);
});

test('datos del informe de un curso', () => {
  const c = course();
  const d = R.courseData(L, c, 1, LEVELS);
  assert.equal(d.students.length, 3); // sin el retirado
  assert.equal(d.evaluations.length, 3);
  assert.equal(d.formative, 1);
  const ana = d.students.find((s) => s.name === 'Ana');
  assert.equal(ana.average, 3.9); // (3,2 + 4,6) / 2; la formativa no pesa
  assert.equal(ana.situation, 'limitrofe');
  assert.equal(ana.pie, true);
  assert.equal(ana.failing, 2); // 3,2 y la formativa 2,0
  assert.equal(d.students.find((s) => s.name === 'Carla').situation, 'reprobado'); // 3,8
  assert.equal(d.borderline, 1);
  assert.equal(d.below.length, 2);
  assert.equal(d.pie.length, 1);
  assert.equal(d.stats.n, 3);
  assert.deepEqual(d.bands.map((b) => b.count), [0, 0, 2, 0, 1, 0]);
  assert.equal(d.evaluations[0].average, 4.4);
  const anual = R.courseData(L, c, 'anual', LEVELS);
  assert.equal(anual.evaluations.length, 4);
  const recs = R.courseRecommendations(d, c);
  assert.ok(recs.some((t) => /limítrofe/.test(t)));
  assert.ok(recs.some((t) => /^1 estudiante\(s\) con promedio bajo 4,0/.test(t)));
  assert.ok(recs.some((t) => /PIE/.test(t)));
});

test('sugerencias del informe de una prueba', () => {
  const recs = R.testRecommendations({
    stats: R.stats([3.0, 3.5, 4.5, 3.8], 4),
    pass: 4,
    oa: [
      { name: 'OA 3', average: 38, level: 'NL', counts: { L: 0, ML: 1, NL: 3 } },
      { name: 'OA 4', average: 62, level: 'ML', counts: { L: 1, ML: 2, NL: 1 } },
      { name: 'OA 5', average: 90, level: 'L', counts: { L: 4, ML: 0, NL: 0 } },
    ],
    review: [4, 10],
    kr20: 0.45,
    enough: true,
    below: 3,
    pie: { count: 1, mean: 4.2 },
  });
  assert.match(recs[0], /^Reforzar OA 3: logro promedio de 38%/);
  assert.ok(recs.some((t) => /OA 4 \(62%\)/.test(t)));
  assert.ok(recs.some((t) => /aprobación fue de 25%/.test(t)));
  assert.ok(recs.some((t) => /preguntas 4, 10/.test(t)));
  assert.ok(recs.some((t) => /KR-20 = 0,45/.test(t)));
  assert.ok(!recs.some((t) => /OA 5/.test(t)));
  const good = R.testRecommendations({ stats: R.stats([6, 6.5], 4), pass: 4, oa: [], review: [], kr20: null, enough: false, below: 0 });
  assert.equal(good.length, 1);
});

test('gráficos: columnas con su valor y la aprobación marcada', () => {
  const bands = R.gradeBands([1.5, 3.2, 4.1, 4.4, 5.0, 6.8], 1, 7);
  const svg = R.distributionChart(bands, 4, 'Distribución');
  assert.equal((svg.match(/<path /g) || []).length, 5); // un tramo vacío no dibuja barra
  assert.match(svg, /Aprobación 4,0/);
  assert.match(svg, /aria-label="Distribución"/);
  const c = course();
  const evs = R.courseData(L, c, 1, LEVELS).evaluations;
  const svg2 = R.evaluationsChart(evs, c, 'Promedios');
  assert.equal((svg2.match(/<path /g) || []).length, 3);
  assert.match(svg2, />4,4</);
  const items = [0.9, 0.3, null, 0.6, 0.45].map((p, i) => ({ question: i + 1, p }));
  const svg3 = R.questionsChart(items, LEVELS, 'Preguntas');
  assert.equal((svg3.match(/<path /g) || []).length, 4);
  assert.equal((svg3.match(new RegExp(R.COLORS.bar, 'g')) || []).length, 2); // bajo 50%: en el color del foco
  assert.match(svg3, /ML 50%/);
});
