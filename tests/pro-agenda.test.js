const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/pro/agenda-core.js');

const book = () => ({
  courses: [
    {
      id: 'c1',
      name: '8° Básico A',
      periods: 2,
      students: [{ id: 's1', n: 1, name: 'Ana' }, { id: 's2', n: 2, name: 'Beto' }, { id: 's3', n: 3, name: 'Caro', retired: true }],
      evaluations: [
        { id: 'e1', title: 'Prueba Unidad 1', date: '2026-10-20', grades: { s1: { g: 6 } } },
        { id: 'e2', title: 'Prueba Unidad 2', date: '2026-11-05', grades: {} },
        { id: 'e3', title: 'Control', date: '2026-10-28', grades: { s1: { g: 5 }, s2: { g: 4 } } },
      ],
    },
  ],
});

test('agenda: limpia eventos y bloques inválidos', () => {
  const a = A.sanitize({
    events: [
      { id: 'x', kind: 'prueba', title: ' Prueba ', date: '2026-11-03', time: '10:30', remind: 1440 },
      { title: 'Sin fecha' },
      { title: '', date: '2026-11-03' },
      { kind: 'raro', title: 'Algo', date: '2026-11-04', time: '25:00' },
    ],
    blocks: [
      { day: 1, start: '08:00', end: '09:30', courseId: 'c1', room: '12' },
      { day: 7, start: '08:00', end: '09:00', label: 'Domingo no' },
      { day: 2, start: '10:00', end: '09:00', label: 'Al revés' },
      { day: 3, start: '10:00', end: '11:00' },
    ],
  });
  assert.equal(a.events.length, 2);
  assert.equal(a.events[0].title, 'Prueba');
  assert.equal(a.events[0].remind, 1440);
  assert.equal(a.events[1].kind, 'otro');
  assert.equal(a.events[1].time, '');
  assert.equal(a.blocks.length, 1);
});

test('agenda: días con eventos propios y del libro de notas', () => {
  const a = A.sanitize({ events: [{ id: 'r', kind: 'reunion', title: 'Consejo de profesores', date: '2026-11-05', time: '16:00' }] });
  const list = A.days(a, book(), '2026-11-01', '2026-11-30');
  assert.equal(list.length, 1);
  assert.equal(list[0].date, '2026-11-05');
  assert.deepEqual(list[0].events.map((e) => e.title), ['Consejo de profesores', 'Prueba Unidad 2']);
  assert.ok(list[0].events[1].fromBook);
});

test('agenda: nombres de los días', () => {
  assert.equal(A.dayLabel('2026-11-02', '2026-11-02'), 'Hoy');
  assert.equal(A.dayLabel('2026-11-03', '2026-11-02'), 'Mañana');
  assert.equal(A.dayLabel('2026-11-05', '2026-11-02'), 'Jueves 5 de noviembre');
});

test('agenda: notas pendientes (sin contar retirados) y cierre del semestre', () => {
  const r = A.reminders(book(), '2026-11-01');
  const pend = r.filter((x) => x.kind === 'pendiente');
  assert.equal(pend.length, 1, 'la del 5 de noviembre aún no pasa; el control está completo');
  assert.match(pend[0].text, /Prueba Unidad 1: falta 1 nota/);
  assert.ok(!r.some((x) => x.kind === 'cierre'), 'faltan más de 21 días');
  const dec = A.reminders(book(), '2026-12-20');
  assert.equal(dec[0].kind, 'cierre');
  assert.equal(dec[0].text, 'Cierre del 2° semestre en 11 días');
  assert.equal(A.periodEnd('2026-04-10', 3), '2026-05-31');
  assert.equal(A.periodEnd('2026-07-31', 2), '2026-07-31');
});

test('agenda: horario, bloque actual y siguiente', () => {
  const a = A.sanitize({
    blocks: [
      { id: 'b1', day: 1, start: '08:00', end: '09:30', courseId: 'c1', room: '12' },
      { id: 'b2', day: 1, start: '10:00', end: '11:30', label: 'Historia 7°B' },
      { id: 'b3', day: 2, start: '08:00', end: '09:30', label: 'Otro día' },
    ],
  });
  const monday = (h, m) => new Date(2026, 10, 2, h, m); // lunes 2 de noviembre de 2026
  let x = A.nowAndNext(a, monday(8, 15));
  assert.equal(x.now.id, 'b1');
  assert.equal(x.next.id, 'b2');
  x = A.nowAndNext(a, monday(9, 45));
  assert.equal(x.now, null);
  assert.equal(x.next.id, 'b2');
  x = A.nowAndNext(a, new Date(2026, 10, 1, 10, 0)); // domingo
  assert.equal(x.today.length, 0);
});

test('agenda: calendario .ics con aviso y horario semanal', () => {
  const a = A.sanitize({
    events: [
      { id: 'p1', kind: 'prueba', title: 'Prueba, Unidad 2', date: '2026-11-05', time: '10:30', courseId: 'c1', remind: 1440, notes: 'Llevar\nhojas' },
      { id: 'p2', kind: 'entrega', title: 'Notas a UTP', date: '2026-11-10' },
    ],
    blocks: [{ id: 'b1', day: 1, start: '08:00', end: '09:30', courseId: 'c1', room: 'Sala 12' }],
  });
  const ics = A.toIcs({ events: a.events, blocks: a.blocks, courseName: (id) => (id === 'c1' ? '8° Básico A' : ''), now: new Date(2026, 10, 1, 12, 0) });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261105T103000\r\nDTEND:20261105T113000/);
  assert.match(ics, /SUMMARY:📝 Prueba\\, Unidad 2 · 8° Básico A/);
  assert.match(ics, /DESCRIPTION:Llevar\\nhojas/);
  assert.match(ics, /TRIGGER:-P1D/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261111/);
  assert.match(ics, /DTSTART:20261102T080000\r\nDTEND:20261102T093000\r\nRRULE:FREQ=WEEKLY;UNTIL=20261231T235959/);
  assert.match(ics, /LOCATION:Sala 12/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
});
