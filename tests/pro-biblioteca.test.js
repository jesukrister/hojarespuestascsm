const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/pro/biblioteca-core.js');
const R = require('../js/pro/respaldo-core.js');

const exam = () => ({
  title: 'Historia · Unidad 3',
  subtitle: '1° Medio A',
  numQuestions: 3,
  numChoices: 4,
  key: [0, 2, null],
  roster: 'Ana\nBeto',
  dev: [{ label: 'D1', max: 4 }],
  doc: { text: '1. ¿Pregunta?', elements: [{ id: 'img1', type: 'image' }, { id: 't', type: 'text' }] },
  pro: { courseId: 'c1', evalId: 'e1', keyChanges: { 2: 1 }, rubrics: [{ levels: [], criteria: [] }] },
});

test('biblioteca: guardar sin estudiantes ni enlaces al libro', () => {
  const lib = B.empty();
  const f = B.addFolder(lib, ' 1° Medio ');
  assert.equal(f.name, '1° Medio');
  assert.equal(B.addFolder(lib, '1° medio'), f, 'no repite carpetas');
  assert.equal(B.addFolder(lib, '  '), null);
  const it = B.saveItem(lib, { exam: exam(), assets: { img1: 'data:image/png;base64,AA', otra: 'data:image/png;base64,BB' }, title: '', folderId: f.id });
  assert.equal(it.title, 'Historia · Unidad 3');
  assert.equal(it.exam.roster, '');
  assert.deepEqual(it.exam.pro, { rubrics: [{ levels: [], criteria: [] }] });
  assert.deepEqual(Object.keys(it.assets), ['img1']);
  assert.match(B.describe(it), /3 preguntas · 1 de desarrollo · con clave · con preguntas escritas · con rúbrica/);
  // Actualizar la misma.
  const e2 = exam();
  e2.key = [1, 1, 1];
  const again = B.saveItem(lib, { id: it.id, exam: e2, assets: {}, title: 'Nueva', folderId: f.id, note: 'difícil' });
  assert.equal(again, it);
  assert.equal(lib.items.length, 1);
  assert.deepEqual(it.exam.key, [1, 1, 1]);
  assert.equal(it.note, 'difícil');
  // Al cargarla queda enlazada.
  const load = B.examToLoad(it);
  assert.equal(load.pro.libId, it.id);
  assert.equal(it.exam.pro.libId, undefined);
});

test('biblioteca: carpetas, búsqueda sin tildes y datos dañados', () => {
  const lib = B.empty();
  const a = B.addFolder(lib, '2° Medio');
  const b = B.addFolder(lib, '1° Medio');
  B.saveItem(lib, { exam: { title: 'Revolución Francesa', numQuestions: 10 }, folderId: a.id });
  B.saveItem(lib, { exam: { title: 'Unidad 3', numQuestions: 5 }, folderId: b.id, note: 'Geografía' });
  B.saveItem(lib, { exam: { title: 'Suelta', numQuestions: 5 } });
  const g = B.grouped(lib, '');
  assert.deepEqual(g.map((x) => (x.folder ? x.folder.name : '—')), ['1° Medio', '2° Medio', '—']);
  assert.deepEqual(B.grouped(lib, 'revolucion').map((x) => x.items.map((i) => i.title)), [['Revolución Francesa']]);
  assert.deepEqual(B.grouped(lib, 'geografia')[0].items.map((i) => i.title), ['Unidad 3']);
  assert.equal(B.grouped(lib, '1° med')[0].folder.name, '1° Medio');

  const s = B.sanitize({ folders: [{ id: 'f', name: '' }, null, { id: 'f', name: 'dup' }], items: [{ id: 'x', folderId: 'nada', exam: { title: 'T' }, assets: { a: 'javascript:1' } }, { id: 'y' }] });
  assert.equal(s.folders.length, 1);
  assert.equal(s.folders[0].name, 'Carpeta');
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].folderId, '');
  assert.deepEqual(s.items[0].assets, {});
  assert.deepEqual(B.sanitize(null), B.empty());
});

test('biblioteca: va en el respaldo', async () => {
  const lib = B.empty();
  B.saveItem(lib, { exam: exam(), folderId: B.addFolder(lib, 'X').id });
  const bytes = R.buildBackup({ state: { exam: exam(), results: [] }, book: null, library: lib });
  const back = await R.parseBackup(bytes);
  assert.equal(back.library.items.length, 1);
  assert.equal(back.library.folders[0].name, 'X');
  const old = await R.parseBackup(R.buildBackup({ state: null }));
  assert.equal(old.library, null);
});
