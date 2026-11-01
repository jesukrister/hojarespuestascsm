/*
 * Plus · Agenda y horario docente (sin pantalla, para probarla aparte):
 *  - eventos (prueba, clase, reunión, entrega u otro) con fecha, hora y curso;
 *  - las evaluaciones del libro de notas aparecen solas en la agenda;
 *  - recordatorios: lo de hoy y mañana, notas pendientes y cierre del periodo;
 *  - horario semanal (bloques por día): qué curso hay ahora y cuál sigue;
 *  - exportar a un calendario (.ics) con sus avisos, para el teléfono.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AgendaCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 1;
  const MAX_EVENTS = 3000;
  const MAX_BLOCKS = 200;
  const KINDS = {
    prueba: { label: 'Prueba', icon: '📝' },
    clase: { label: 'Clase', icon: '📚' },
    reunion: { label: 'Reunión', icon: '👥' },
    entrega: { label: 'Entrega', icon: '📦' },
    otro: { label: 'Otro', icon: '📌' },
  };
  // Aviso antes del evento: minutos (0 = a la hora; null = sin aviso).
  const REMINDERS = { '': null, 0: 0, 60: 60, 1440: 1440, 10080: 10080 };
  const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const isTime = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const p2 = (n) => String(n).padStart(2, '0');

  const empty = () => ({ version: VERSION, events: [], blocks: [] });

  function sanitizeEvent(e) {
    if (!e || typeof e !== 'object' || !isDate(e.date)) return null;
    const title = str(e.title, 120);
    if (!title) return null;
    const remind = e.remind === null || e.remind === undefined || e.remind === '' ? null : Number(e.remind);
    return {
      id: str(e.id, 40) || uid(),
      kind: KINDS[e.kind] ? e.kind : 'otro',
      title,
      date: e.date,
      time: isTime(e.time) ? e.time : '',
      courseId: str(e.courseId, 40),
      notes: str(e.notes, 1000),
      remind: Number.isFinite(remind) && remind >= 0 ? remind : null,
      done: e.done === true,
      updatedAt: Number(e.updatedAt) || 0,
    };
  }

  function sanitizeBlock(b) {
    if (!b || typeof b !== 'object') return null;
    const day = Number(b.day);
    if (!(day >= 1 && day <= 6) || !isTime(b.start) || !isTime(b.end) || b.end <= b.start) return null;
    const label = str(b.label, 80);
    const courseId = str(b.courseId, 40);
    if (!label && !courseId) return null;
    return { id: str(b.id, 40) || uid(), day, start: b.start, end: b.end, courseId, label, room: str(b.room, 40), updatedAt: Number(b.updatedAt) || 0 };
  }

  function sanitize(raw) {
    const out = empty();
    if (!raw || typeof raw !== 'object') return out;
    out.events = (Array.isArray(raw.events) ? raw.events : []).map(sanitizeEvent).filter(Boolean).slice(0, MAX_EVENTS);
    out.blocks = (Array.isArray(raw.blocks) ? raw.blocks : []).map(sanitizeBlock).filter(Boolean).slice(0, MAX_BLOCKS);
    return out;
  }

  /* ---------- Fechas ---------- */

  function isoOf(d) {
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  }

  function parseIso(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(iso, n) {
    const d = parseIso(iso);
    d.setDate(d.getDate() + n);
    return isoOf(d);
  }

  function daysBetween(a, b) {
    return Math.round((parseIso(b) - parseIso(a)) / 86400000);
  }

  /** «Hoy», «Mañana», «Jueves 6 de noviembre». */
  function dayLabel(iso, today) {
    const diff = daysBetween(today, iso);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Mañana';
    if (diff === -1) return 'Ayer';
    const d = parseIso(iso);
    const year = d.getFullYear() !== parseIso(today).getFullYear() ? ` de ${d.getFullYear()}` : '';
    return `${DAYS[d.getDay()]} ${d.getDate()} de ${MONTHS[d.getMonth()]}${year}`;
  }

  /** «lunes 2 de noviembre». */
  function longDate(iso) {
    const d = parseIso(iso);
    return `${DAYS[d.getDay()].toLowerCase()} ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  }

  /* ---------- Eventos (los propios y los del libro de notas) ---------- */

  /** Evaluaciones del libro de notas con fecha, como eventos de solo lectura. */
  function bookEvents(book) {
    const out = [];
    for (const c of (book && book.courses) || []) {
      for (const ev of c.evaluations || []) {
        if (!isDate(ev.date)) continue;
        out.push({ id: `libro:${c.id}:${ev.id}`, kind: 'prueba', title: ev.title || 'Evaluación', date: ev.date, time: '', courseId: c.id, notes: '', remind: null, done: false, fromBook: true, evalId: ev.id });
      }
    }
    return out;
  }

  const byWhen = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || '99') < (b.time || '99') ? -1 : (a.time || '99') > (b.time || '99') ? 1 : a.title.localeCompare(b.title));

  /** Eventos entre dos fechas (incluidas), ordenados, agrupados por día: [{ date, events }]. */
  function days(agenda, book, from, to) {
    const all = agenda.events.concat(bookEvents(book)).filter((e) => e.date >= from && e.date <= to).sort(byWhen);
    const out = [];
    for (const e of all) {
      const last = out[out.length - 1];
      if (last && last.date === e.date) last.events.push(e);
      else out.push({ date: e.date, events: [e] });
    }
    return out;
  }

  /* ---------- Recordatorios ---------- */

  /** Último día del periodo (semestre o trimestre) que contiene la fecha, como en el libro de notas. */
  function periodEnd(iso, periods) {
    const y = Number(iso.slice(0, 4));
    const m = Number(iso.slice(5, 7));
    const ends = periods === 3 ? [5, 8, 12] : [7, 12];
    const em = ends.find((x) => m <= x);
    const last = new Date(y, em, 0).getDate();
    return `${y}-${p2(em)}-${p2(last)}`;
  }

  /**
   * Avisos para la pantalla de inicio:
   *  - notas pendientes: evaluaciones ya pasadas con estudiantes sin nota;
   *  - cierre del periodo: si faltan 21 días o menos.
   */
  function reminders(book, today) {
    const out = [];
    let periods = 2;
    for (const c of (book && book.courses) || []) {
      if (c.periods === 3) periods = 3;
      const active = (c.students || []).filter((s) => !s.retired);
      if (!active.length) continue;
      for (const ev of c.evaluations || []) {
        if (!isDate(ev.date) || ev.date > today || daysBetween(ev.date, today) > 120) continue;
        const missing = active.filter((s) => !(ev.grades && ev.grades[s.id])).length;
        if (missing && missing < active.length) {
          out.push({ kind: 'pendiente', courseId: c.id, evalId: ev.id, date: ev.date, text: `${ev.title || 'Evaluación'}: falta${missing === 1 ? '' : 'n'} ${missing} nota${missing === 1 ? '' : 's'}` });
        } else if (missing === active.length) {
          out.push({ kind: 'pendiente', courseId: c.id, evalId: ev.id, date: ev.date, text: `${ev.title || 'Evaluación'}: aún sin notas` });
        }
      }
    }
    out.sort((a, b) => (a.date < b.date ? 1 : -1));
    const end = periodEnd(today, periods);
    const left = daysBetween(today, end);
    const names = periods === 3 ? ['1° trimestre', '2° trimestre', '3° trimestre'] : ['1° semestre', '2° semestre'];
    const ends = periods === 3 ? [5, 8, 12] : [7, 12];
    const idx = ends.findIndex((x) => Number(today.slice(5, 7)) <= x);
    if (left <= 21) out.unshift({ kind: 'cierre', date: end, text: left === 0 ? `Hoy cierra el ${names[idx]}` : `Cierre del ${names[idx]} en ${left} día${left === 1 ? '' : 's'}` });
    return out;
  }

  /* ---------- Horario ---------- */

  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

  /** Bloques de un día de la semana (1 = lunes … 6 = sábado), ordenados. */
  function blocksOf(agenda, day) {
    return agenda.blocks.filter((b) => b.day === day).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  }

  /** Bloque actual y el siguiente de hoy: { now, next, today: [bloques] }. */
  function nowAndNext(agenda, date) {
    const d = date || new Date();
    const day = d.getDay();
    const list = day >= 1 && day <= 6 ? blocksOf(agenda, day) : [];
    const min = d.getHours() * 60 + d.getMinutes();
    const now = list.find((b) => toMin(b.start) <= min && min < toMin(b.end)) || null;
    const next = list.find((b) => toMin(b.start) > min) || null;
    return { now, next, today: list };
  }

  /* ---------- Exportar a un calendario (.ics) ---------- */

  const icsText = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

  /** Líneas de más de 75 caracteres se cortan como pide el formato. */
  function fold(line) {
    const out = [];
    let rest = line;
    while (rest.length > 74) {
      out.push(rest.slice(0, 74));
      rest = ' ' + rest.slice(74);
    }
    out.push(rest);
    return out.join('\r\n');
  }

  const stamp = (d) => `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
  const local = (iso, time) => `${iso.replace(/-/g, '')}T${time.replace(':', '')}00`;

  /**
   * Calendario .ics con los eventos (y, si se pide, el horario semanal que se
   * repite hasta fin de año). courseName(id) da el nombre del curso.
   */
  function toIcs({ events, blocks, courseName, now, until }) {
    const n = now || new Date();
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lector de Hojas//Agenda docente//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Agenda docente'];
    const name = (id) => (id && courseName ? courseName(id) : '') || '';
    for (const e of events || []) {
      const kind = KINDS[e.kind] || KINDS.otro;
      const course = name(e.courseId);
      lines.push('BEGIN:VEVENT', `UID:${e.id}@agenda-docente`, `DTSTAMP:${stamp(n)}`);
      if (e.time) {
        const end = new Date(parseIso(e.date).getTime() + toMin(e.time) * 60000 + 60 * 60000);
        lines.push(`DTSTART:${local(e.date, e.time)}`, `DTEND:${isoOf(end).replace(/-/g, '')}T${p2(end.getHours())}${p2(end.getMinutes())}00`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${addDays(e.date, 1).replace(/-/g, '')}`);
      }
      lines.push(fold(`SUMMARY:${icsText(`${kind.icon} ${e.title}${course ? ` · ${course}` : ''}`)}`));
      if (e.notes) lines.push(fold(`DESCRIPTION:${icsText(e.notes)}`));
      if (e.remind !== null && e.remind !== undefined) {
        const trig = e.remind === 0 ? 'PT0M' : e.remind % 1440 === 0 ? `P${e.remind / 1440}D` : `PT${e.remind}M`;
        lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsText(e.title)}`), `TRIGGER:-${trig}`, 'END:VALARM');
      }
      lines.push('END:VEVENT');
    }
    if (blocks && blocks.length) {
      const today = isoOf(n);
      const last = (until || `${n.getFullYear()}-12-31`).replace(/-/g, '');
      for (const b of blocks) {
        // Primer día de la semana del bloque desde hoy.
        let first = today;
        for (let i = 0; i < 7 && parseIso(first).getDay() !== b.day; i++) first = addDays(first, 1);
        const course = name(b.courseId);
        const title = [course, b.label].filter(Boolean).join(' · ') || 'Clase';
        lines.push('BEGIN:VEVENT', `UID:${b.id}@horario-docente`, `DTSTAMP:${stamp(n)}`, `DTSTART:${local(first, b.start)}`, `DTEND:${local(first, b.end)}`, `RRULE:FREQ=WEEKLY;UNTIL=${last}T235959`);
        lines.push(fold(`SUMMARY:${icsText(`🕘 ${title}`)}`));
        if (b.room) lines.push(fold(`LOCATION:${icsText(b.room)}`));
        lines.push('END:VEVENT');
      }
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  return { VERSION, KINDS, REMINDERS, DAYS, empty, sanitize, sanitizeEvent, sanitizeBlock, isoOf, addDays, daysBetween, dayLabel, longDate, bookEvents, days, periodEnd, reminders, blocksOf, nowAndNext, toIcs, uid };
});
