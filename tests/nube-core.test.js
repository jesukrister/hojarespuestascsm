const test = require('node:test');
const assert = require('node:assert/strict');
const NC = require('../js/pro/nube-core.js');

const clone = (x) => JSON.parse(JSON.stringify(x));

test('nube: huella de la contraseña y correo', async () => {
  const a = await NC.passwordHash(' Ana@Mail.CL', 'clave');
  assert.equal(a, await NC.passwordHash('ana@mail.cl', 'clave'));
  assert.notEqual(a, await NC.passwordHash('ana@mail.cl', 'Clave'));
  assert.notEqual(a, await NC.passwordHash('otra@mail.cl', 'clave'));
  assert.equal(NC.validEmail('ana@mail.cl'), true);
  assert.equal(NC.validEmail('ana@mail'), false);
  assert.equal(NC.validEmail('ana mail.cl'), false);
});

test('nube: listas con base (agregar, borrar y cambiar en dos equipos)', () => {
  const base = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'c', v: 1 }];
  const local = [{ id: 'a', v: 2 }, { id: 'c', v: 1 }, { id: 'd', v: 1 }]; // cambia a, borra b, agrega d
  const remote = [{ id: 'a', v: 1 }, { id: 'b', v: 1 }, { id: 'e', v: 1 }]; // borra c, agrega e
  assert.deepEqual(NC.mergeList(base, local, remote), [{ id: 'a', v: 2 }, { id: 'd', v: 1 }, { id: 'e', v: 1 }]);
  // Sin base (primera vez): se juntan.
  assert.deepEqual(
    NC.mergeList(null, [{ id: 'a', v: 1 }], [{ id: 'b', v: 1 }]).map((x) => x.id),
    ['a', 'b']
  );
  // Los dos cambiaron lo mismo: el más reciente.
  assert.deepEqual(NC.mergeList([{ id: 'a', v: 0, updatedAt: 1 }], [{ id: 'a', v: 1, updatedAt: 5 }], [{ id: 'a', v: 2, updatedAt: 9 }]), [{ id: 'a', v: 2, updatedAt: 9 }]);
  // Borrado en uno pero cambiado en el otro: se conserva.
  assert.deepEqual(NC.mergeList([{ id: 'a', v: 0 }], [], [{ id: 'a', v: 1 }]), [{ id: 'a', v: 1 }]);
});

function book() {
  return {
    version: 1,
    updatedAt: 10,
    courses: [
      {
        id: 'c1',
        name: '8° A',
        updatedAt: 10,
        students: [
          { id: 's1', n: 1, name: 'Ana' },
          { id: 's2', n: 2, name: 'Beto' },
        ],
        evaluations: [{ id: 'e1', title: 'Prueba 1', updatedAt: 10, grades: { s1: { grade: 5 } } }],
      },
    ],
  };
}

test('nube: libro de notas combinado campo por campo', () => {
  const base = book();
  const local = clone(base);
  const remote = clone(base);
  local.courses[0].evaluations[0].grades.s2 = { grade: 6.1 }; // nota nueva en este equipo
  local.courses[0].evaluations[0].updatedAt = 20;
  remote.courses[0].name = '8° A (2026)'; // el otro equipo cambió el nombre
  remote.courses[0].updatedAt = 15;
  remote.courses[0].students.push({ id: 's3', n: 3, name: 'Caro' });
  remote.courses[0].evaluations[0].grades.s1 = { grade: 5.5 }; // y corrigió otra nota
  remote.courses.push({ id: 'c2', name: '8° B', updatedAt: 15, students: [], evaluations: [] });
  const m = NC.mergeBook(base, local, remote);
  assert.equal(m.courses.length, 2);
  const c = m.courses[0];
  assert.equal(c.name, '8° A (2026)');
  assert.deepEqual(c.students.map((s) => s.id), ['s1', 's2', 's3']);
  assert.deepEqual(c.evaluations[0].grades, { s1: { grade: 5.5 }, s2: { grade: 6.1 } });
  assert.equal(c.evaluations[0].updatedAt, 20);
  // Curso borrado en este equipo y sin cambios en el otro: queda borrado.
  const del = clone(base);
  del.courses = [];
  assert.equal(NC.mergeBook(base, del, clone(base)).courses.length, 0);
  // Nota borrada en un equipo.
  const noGrade = clone(base);
  delete noGrade.courses[0].evaluations[0].grades.s1;
  assert.deepEqual(NC.mergeBook(base, clone(base), noGrade).courses[0].evaluations[0].grades, {});
});

test('nube: prueba y hojas escaneadas', () => {
  const exam = { title: 'Historia', numQuestions: 10, numChoices: 4, key: [0, 1] };
  const base = { exam, results: [{ id: 'r1', answers: [0] }] };
  const local = { exam, results: [{ id: 'r1', answers: [0] }, { id: 'r2', answers: [1] }] };
  const remote = { exam: Object.assign({}, exam, { key: [0, 2] }), results: [{ id: 'r1', answers: [0] }, { id: 'r3', answers: [2] }] };
  let m = NC.mergeState(base, local, remote);
  assert.equal(m.lost, false);
  assert.deepEqual(m.state.exam.key, [0, 2]);
  assert.deepEqual(m.state.results.map((r) => r.id), ['r1', 'r2', 'r3']);
  // Otra prueba en cada equipo: queda la de este equipo, sin mezclar hojas.
  m = NC.mergeState(null, local, { exam: { title: 'Ciencias', numQuestions: 20, numChoices: 4 }, results: [{ id: 'x', answers: [] }] });
  assert.equal(m.lost, true);
  assert.equal(m.state.exam.title, 'Historia');
  assert.deepEqual(m.state.results.map((r) => r.id), ['r1', 'r2']);
  // Hoja borrada en el otro equipo.
  m = NC.mergeState(local, local, { exam, results: [{ id: 'r2', answers: [1] }] });
  assert.deepEqual(m.state.results.map((r) => r.id), ['r2']);
  assert.deepEqual(NC.mergeAssets(null, { a: '1' }, { a: '0', b: '2' }), { a: '1', b: '2' });
});

/** Servidor de mentira con versiones (como el real). */
function fakeServer() {
  const docs = {};
  return {
    docs,
    list: async () => ({ docs: Object.fromEntries(Object.entries(docs).map(([k, d]) => [k, { version: d.version }])) }),
    get: async (name) => (docs[name] ? { version: docs[name].version, text: docs[name].text } : { version: 0, text: '' }),
    put: async (name, base, text) => {
      const cur = docs[name] ? docs[name].version : 0;
      if (cur !== base) return { conflict: true, version: cur };
      docs[name] = { version: cur + 1, text };
      return { version: cur + 1 };
    },
  };
}

function device(server, initial) {
  const dev = { book: initial, meta: null, base: '', applied: 0 };
  dev.doc = {
    name: 'libro',
    read: () => JSON.stringify(dev.book),
    isEmpty: (t) => !JSON.parse(t).courses.length,
    merge: (b, l, r) => ({ value: NC.mergeBook(b, l, r), lost: false }),
    apply: (text) => {
      dev.book = JSON.parse(text);
      dev.applied++;
    },
  };
  dev.sync = async () => {
    const list = await server.list();
    const res = await NC.syncDoc(server, dev.doc, dev.meta, dev.base, (list.docs.libro || {}).version || 0);
    dev.meta = res.meta;
    dev.base = res.baseText;
    return res;
  };
  return dev;
}

test('nube: dos equipos sincronizan el libro sin perder cambios', async () => {
  const server = fakeServer();
  const a = device(server, book());
  const b = device(server, { version: 1, updatedAt: 0, courses: [] });
  let r = await a.sync();
  assert.equal(r.pushed, true);
  r = await b.sync();
  assert.equal(r.pulled, true);
  assert.deepEqual(b.book, a.book);
  // Sin cambios: no hace nada.
  r = await b.sync();
  assert.equal(r.pulled || r.pushed, false);

  // Cada uno cambia algo distinto.
  a.book.courses[0].evaluations[0].grades.s2 = { grade: 4 };
  b.book.courses[0].students = b.book.courses[0].students.filter((s) => s.id !== 's2');
  b.book.courses.push({ id: 'c2', name: '8° B', students: [], evaluations: [] });
  await a.sync();
  r = await b.sync();
  assert.equal(r.pulled, true);
  assert.equal(r.pushed, true);
  await a.sync();
  assert.deepEqual(a.book, b.book);
  assert.deepEqual(a.book.courses.map((c) => c.id), ['c1', 'c2']);
  assert.deepEqual(a.book.courses[0].students.map((s) => s.id), ['s1']);
  assert.deepEqual(a.book.courses[0].evaluations[0].grades.s2, { grade: 4 });

  // Un equipo que solo sube (prueba a mitad del trabajo) avisa que quedó atrás.
  b.book.courses.pop();
  await b.sync();
  a.doc.pushOnly = true;
  r = await a.sync();
  assert.equal(r.behind, true);
  assert.equal(a.book.courses.length, 2);

  // Conflicto al subir: otro equipo guardó entre medio.
  a.doc.pushOnly = false;
  const realPut = server.put;
  let once = true;
  server.put = async (name, base, text) => {
    if (once) {
      once = false;
      await realPut(name, server.docs.libro.version, JSON.stringify(Object.assign(JSON.parse(server.docs.libro.text), { updatedAt: 99 })));
    }
    return realPut(name, base, text);
  };
  a.book.courses[0].name = 'Cambio';
  r = await a.sync();
  assert.equal(a.book.courses[0].name, 'Cambio');
  assert.equal(JSON.parse(server.docs.libro.text).courses[0].name, 'Cambio');
  assert.equal(a.meta.version, server.docs.libro.version);
});

test('nube: equipo nuevo sin datos trae todo; con datos, junta', async () => {
  const server = fakeServer();
  const a = device(server, book());
  await a.sync();
  const other = book();
  other.courses = [{ id: 'c9', name: '1° M', students: [], evaluations: [] }];
  const c = device(server, other);
  await c.sync();
  assert.deepEqual(c.book.courses.map((x) => x.id), ['c9', 'c1']);
  await a.sync();
  assert.deepEqual(a.book.courses.map((x) => x.id).sort(), ['c1', 'c9']);
});
