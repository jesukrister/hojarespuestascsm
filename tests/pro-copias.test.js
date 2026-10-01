const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/pro/copias-core.js');

const H = 3600000;
const D = 24 * H;
const at = (s) => new Date(s).getTime();

const state = { exam: { title: 'Prueba 1', key: [0, null], doc: { text: '', elements: [] } }, results: [{ id: 'r1' }, { id: 'r2' }] };
const book = { courses: [{ id: 'c1', students: [], evaluations: [{ grades: { a: 5, b: 6 } }, { grades: { a: 4 } }] }] };

test('copias: la huella cambia con los datos y no con el orden de guardado', () => {
  const a = C.hash(C.serialize(state, book));
  assert.equal(a, C.hash(C.serialize(JSON.parse(JSON.stringify(state)), JSON.parse(JSON.stringify(book)))));
  const b = C.hash(C.serialize({ ...state, results: [{ id: 'r1' }] }, book));
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-z]+$/);
});

test('copias: resumen y descripción', () => {
  const sum = C.summary({ state, book });
  assert.deepEqual(sum, { courses: 1, evaluations: 2, grades: 3, results: 2, title: 'Prueba 1', key: true });
  assert.equal(C.describe(sum), '1 curso · 3 notas · «Prueba 1» con 2 hojas');
  assert.ok(C.hasData(sum));
  const empty = C.summary({ state: { exam: { title: '', key: [null] }, results: [] }, book: { courses: [] } });
  assert.equal(C.hasData(empty), false);
  assert.equal(C.describe(empty), 'sin datos');
  assert.equal(C.describe(C.summary({ state: { exam: { title: '' }, results: [{}] }, book: null })), 'prueba sin título con 1 hoja');
});

test('copias: una al empezar el día, cada 2 horas con cambios y nunca si no hay cambios', () => {
  const now = at('2026-10-01T15:00:00');
  assert.equal(C.copyReason({ now, copies: [], hash: 'x' }), 'dia');
  // Misma huella que la última copia: no se copia aunque sea otro día.
  assert.equal(C.copyReason({ now, copies: [{ at: now - 3 * D, hash: 'x' }], hash: 'x' }), null);
  // Cambios, última copia de ayer: copia del día.
  assert.equal(C.copyReason({ now, copies: [{ at: at('2026-09-30T23:30:00'), hash: 'a' }], hash: 'b' }), 'dia');
  // Cambios, última copia de hoy hace 1 hora: todavía no.
  assert.equal(C.copyReason({ now, copies: [{ at: now - H, hash: 'a' }], hash: 'b' }), null);
  // Cambios, última copia de hoy hace 2 horas: sí.
  assert.equal(C.copyReason({ now, copies: [{ at: now - 3 * D, hash: 'z' }, { at: now - 2 * H, hash: 'a' }], hash: 'b' }), 'cambios');
});

test('copias: se conservan las 10 más recientes y una por día de las anteriores', () => {
  const now = at('2026-10-31T20:00:00');
  const copies = [];
  // 12 copias hoy (cada hora) y 3 por día durante los 40 días anteriores.
  for (let i = 0; i < 12; i++) copies.push({ id: 'h' + i, at: now - i * H });
  for (let d = 1; d <= 40; d++) for (let k = 0; k < 3; k++) copies.push({ id: `d${d}-${k}`, at: at('2026-10-31T12:00:00') - d * D + k * H });
  const { keep, drop } = C.prune(copies, now);
  assert.equal(keep.length, 20);
  assert.equal(keep.length + drop.length, copies.length);
  const ids = keep.map((c) => c.id);
  for (let i = 0; i < 10; i++) assert.ok(ids.includes('h' + i));
  assert.ok(!ids.includes('h10'), 'las de hoy fuera de las 10 recientes ya tienen su día');
  // Una por día (la más reciente de ese día), empezando por ayer.
  assert.ok(ids.includes('d1-2'));
  assert.ok(!ids.includes('d1-1'));
  assert.ok(ids.includes('d10-2'));
  assert.ok(!ids.includes('d11-2'), 'tope de 20 copias');
  // Pocas copias: no se borra nada.
  assert.equal(C.prune(copies.slice(0, 5), now).drop.length, 0);
  // Copias de más de 30 días no se conservan (salvo entre las 10 recientes).
  const old = [{ id: 'new', at: now }, ...Array.from({ length: 12 }, (_, i) => ({ id: 'o' + i, at: now - (40 + i) * D }))];
  const r = C.prune(old, now);
  assert.equal(r.keep.length, 10);
  assert.equal(C.latest(old).id, 'new');
});

test('copias: recordatorio de respaldo', () => {
  const now = at('2026-10-10T10:00:00');
  const base = { now, hasData: true, hash: 'b', everyDays: 7, lastBackupAt: now - 8 * D, lastBackupHash: 'a', firstDataAt: now - 30 * D };
  assert.deepEqual(C.reminder(base), { days: 8, never: false });
  assert.equal(C.reminder({ ...base, lastBackupAt: now - 3 * D }), null, 'todavía no toca');
  assert.equal(C.reminder({ ...base, lastBackupHash: 'b' }), null, 'nada nuevo desde el respaldo');
  assert.deepEqual(C.reminder({ ...base, lastBackupHash: undefined }), { days: 8, never: false }, 'respaldo antiguo sin huella');
  assert.equal(C.reminder({ ...base, everyDays: 0 }), null, 'nunca');
  assert.equal(C.reminder({ ...base, hasData: false }), null);
  assert.equal(C.reminder({ ...base, snoozeUntil: now + H }), null, 'más tarde');
  assert.deepEqual(C.reminder({ ...base, lastBackupAt: 0, lastBackupHash: '' }), { days: 30, never: true });
  assert.equal(C.reminder({ ...base, lastBackupAt: 0, firstDataAt: now - D }), null, 'recién empezó a usarla');
  assert.equal(C.reminder({ ...base, lastBackupAt: 0, firstDataAt: 0 }), null);
});

test('copias: archivo de respaldo automático', () => {
  const now = at('2026-10-10T10:00:00');
  assert.equal(C.fileDue({ now, enabled: true, hash: 'a' }), true);
  assert.equal(C.fileDue({ now, enabled: false, hash: 'a' }), false);
  assert.equal(C.fileDue({ now, enabled: true, hash: 'a', lastFileAt: now - 5 * D, lastFileHash: 'a' }), false, 'sin cambios');
  assert.equal(C.fileDue({ now, enabled: true, hash: 'b', lastFileAt: now - 10 * 60000, lastFileHash: 'a' }), false, 'hace menos de una hora');
  assert.equal(C.fileDue({ now, enabled: true, hash: 'b', lastFileAt: now - H, lastFileHash: 'a' }), true);
});
