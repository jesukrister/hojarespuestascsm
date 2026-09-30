const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/pro/analisis-core.js');

const ans = (...marks) => marks.map((m) => ({ marked: m === null ? [] : Array.isArray(m) ? m : [m] }));
const [Aa, B, C, D] = [0, 1, 2, 3];

/**
 * 20 estudiantes (0 = el de menor rendimiento). La pregunta 1 es la que se
 * prueba; las otras 38 ordenan a los estudiantes por rendimiento (de a 2
 * puntos, así la pregunta 1 no cambia el orden). Clave: A en todas.
 */
function classroom(item) {
  const out = [];
  for (let i = 0; i < 20; i++) {
    const anchors = [];
    for (let t = 1; t <= 19; t++) {
      const m = i >= t ? Aa : [B, C, D][(i + t) % 3];
      anchors.push(m, m);
    }
    out.push(ans(item(i), ...anchors));
  }
  return out;
}
const KEY = new Array(39).fill(Aa);
const first = (item, key) => A.analyze(classroom(item), key || KEY, 4).items[0];

test('buena pregunta', () => {
  const q = first((i) => (i >= 8 ? Aa : [B, C, D][i % 3]));
  assert.equal(q.p, 0.6);
  assert.equal(q.d, 1);
  assert.equal(q.difficulty, 'adecuada');
  assert.equal(q.discrimination, 'muy buena');
  assert.ok(q.rpb > 0.5);
  assert.equal(q.level, 'ok');
  assert.equal(q.suggestion, 'Buena pregunta.');
});

test('clave dudosa: los mejores eligen otra alternativa', () => {
  const q = first((i) => (i >= 15 ? B : i % 2 ? Aa : i % 4 ? C : D));
  assert.equal(q.level, 'revisar');
  assert.deepEqual(q.flags, ['clave']);
  assert.equal(q.rival, 'B');
  assert.equal(q.altKey, B);
  assert.match(q.suggestion, /^Revisar la clave: los estudiantes con mejor puntaje eligieron más la B que la A/);
  const b = q.options[B];
  assert.equal(b.upper, 1);
  assert.equal(b.lower, 0);
  assert.equal(q.options.reduce((s, o) => s + o.count, 0), 20);
});

test('discriminación negativa', () => {
  const q = first((i) => (i < 5 ? Aa : i >= 15 ? [Aa, Aa, B, C, D][i - 15] : i % 2 ? Aa : D));
  assert.equal(q.d, -0.6);
  assert.equal(q.discrimination, 'negativa');
  assert.equal(q.level, 'revisar');
  assert.deepEqual(q.flags, ['negativa']);
  assert.equal(q.rival, null);
});

test('pregunta para anular: casi nadie acierta y no distingue', () => {
  const q = first((i) => (i === 12 ? Aa : [B, C, D][i % 3]));
  assert.equal(q.p, 0.05);
  assert.equal(q.d, 0);
  assert.equal(q.difficulty, 'muy difícil');
  assert.equal(q.popular, null);
  assert.equal(q.level, 'revisar');
  assert.deepEqual(q.flags, ['anular']);
  assert.match(q.suggestion, /Considerar anularla/);
});

test('distractores que nadie eligió', () => {
  const q = first((i) => (i >= 7 ? Aa : B));
  assert.deepEqual(q.unused, ['C', 'D']);
  assert.equal(q.level, 'mejorar');
  assert.deepEqual(q.flags, ['distractor']);
  assert.equal(q.suggestion, 'Buena pregunta. Cambiar las alternativas C, D: nadie las eligió.');
});

test('error frecuente o clave equivocada: la mayoría elige el mismo distractor', () => {
  const q = first((i) => (i >= 16 ? Aa : i % 4 ? C : B));
  assert.equal(q.popular, 'C');
  assert.equal(q.altKey, C);
  assert.equal(q.level, 'revisar');
  assert.match(q.suggestion, /más estudiantes eligieron la C \(60%\) que la A \(20%\)/);
});

test('preguntas sin clave o anuladas no cuentan', () => {
  const key = KEY.slice();
  key[0] = null;
  const r = A.analyze(classroom((i) => (i >= 15 ? B : Aa)), key, 4);
  const q = r.items[0];
  assert.equal(q.level, 'sinclave');
  assert.equal(q.key, null);
  assert.equal(q.p, null);
  assert.equal(q.d, null);
  assert.equal(q.suggestion, '');
  // El puntaje total (y los grupos) no la consideran: los grupos no cambian.
  assert.equal(r.items[1].d, A.analyze(classroom(() => Aa), KEY, 4).items[1].d);
});

test('confiabilidad KR-20', () => {
  const r = A.analyze(classroom((i) => (i >= 8 ? Aa : B)), KEY, 4);
  assert.ok(r.kr20 > 0.9, `kr20 = ${r.kr20}`);
  assert.equal(r.reliability, 'alta');
  // Respuestas al azar: confiabilidad baja.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const noise = [];
  for (let i = 0; i < 30; i++) noise.push(ans(...Array.from({ length: 20 }, () => Math.floor(rnd() * 4))));
  const z = A.analyze(noise, new Array(20).fill(Aa), 4);
  assert.ok(z.kr20 < 0.5, `kr20 = ${z.kr20}`);
  assert.equal(z.meanP > 0.1 && z.meanP < 0.4, true);
});

test('con pocas hojas sólo se revisa la clave', () => {
  const few = [ans(B, Aa, null), ans(B, B, Aa), ans(B, Aa, Aa), ans(Aa, C, Aa), ans(C, Aa, Aa)];
  const r = A.analyze(few, [Aa, Aa, Aa], 3);
  assert.equal(r.enough, false);
  assert.equal(r.items[0].level, 'revisar');
  assert.equal(r.items[0].popular, 'B');
  assert.match(r.items[0].suggestion, /error frecuente/);
  assert.equal(r.items[1].level, 'ok');
  assert.equal(r.items[1].suggestion, '');
  assert.equal(r.items[2].flags.length, 0);
});

test('preguntas que muchos omiten', () => {
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push(ans(i < 5 ? null : Aa, i % 2 ? Aa : B));
  const r = A.analyze(rows, [Aa, Aa], 4);
  assert.ok(r.items[0].flags.includes('omitida'));
  assert.match(r.items[0].suggestion, /omitió el 42%/);
  assert.equal(r.items[0].blank, 5 / 12);
});

test('correlación de Pearson', () => {
  assert.equal(A.pearson([1, 2, 3], [2, 4, 6]), 1);
  assert.equal(A.pearson([1, 2, 3], [3, 2, 1]), -1);
  assert.equal(A.pearson([1, 1, 1], [1, 2, 3]), null);
  assert.equal(A.pearson([1, 2], [1, 2]), null);
});

test('etiquetas', () => {
  assert.equal(A.difficultyLabel(0.95), 'muy fácil');
  assert.equal(A.difficultyLabel(0.5), 'adecuada');
  assert.equal(A.difficultyLabel(0.1), 'muy difícil');
  assert.equal(A.discriminationLabel(0.45), 'muy buena');
  assert.equal(A.discriminationLabel(-0.1), 'negativa');
  assert.equal(A.reliabilityLabel(0.75), 'aceptable');
  assert.equal(A.reliabilityLabel(null), null);
});
