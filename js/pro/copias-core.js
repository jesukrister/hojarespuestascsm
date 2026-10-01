/*
 * Versión Pro · Reglas del respaldo más seguro (sin pantalla, para probarlas aparte):
 *  - copias automáticas en el equipo (cuándo hacer una y cuáles conservar);
 *  - cuándo recordar que hay que respaldar;
 *  - cuándo actualizar el archivo de respaldo automático.
 * Para saber si hubo cambios se compara una "huella" de los datos, así abrir
 * la página o guardar sin cambios no cuenta como cambio.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CopiasCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const HOUR = 3600000;
  const DAY = 24 * HOUR;
  const COPY_EVERY = 2 * HOUR; // mientras se trabaja, una copia cada 2 horas como máximo
  const FILE_EVERY = HOUR; // archivo de respaldo automático: una vez por hora como máximo
  const RECENT = 10; // copias más recientes que siempre se conservan
  const MAX_COPIES = 20; // además, una por día de las anteriores, hasta este total
  const KEEP_DAYS = 30;

  /** Huella corta de un texto (FNV-1a de 32 bits + largo). */
  function hash(text) {
    const s = String(text);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0') + '-' + s.length.toString(36);
  }

  /** Copia de los datos como texto: { v, state: { exam, results }, book }. */
  function serialize(state, book) {
    return JSON.stringify({ v: 1, state: { exam: state.exam, results: state.results }, book: book || null });
  }

  function summary(snap) {
    const book = (snap && snap.book) || {};
    const courses = Array.isArray(book.courses) ? book.courses : [];
    let evaluations = 0;
    let grades = 0;
    for (const c of courses) {
      for (const e of (c && c.evaluations) || []) {
        evaluations++;
        grades += Object.keys((e && e.grades) || {}).length;
      }
    }
    const st = (snap && snap.state) || {};
    const exam = st.exam || {};
    return {
      courses: courses.length,
      evaluations,
      grades,
      results: Array.isArray(st.results) ? st.results.length : 0,
      title: String(exam.title || '').trim(),
      key: Array.isArray(exam.key) && exam.key.some((k) => k !== null && k !== undefined),
    };
  }

  /** ¿Hay algo que valga la pena respaldar? */
  function hasData(sum) {
    return !!sum && (sum.courses > 0 || sum.results > 0 || sum.key || !!sum.title);
  }

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /** "2 cursos · 120 notas · «Prueba 1» con 30 hojas" */
  function describe(sum) {
    const parts = [];
    if (sum.courses) {
      parts.push(plural(sum.courses, 'curso', 'cursos'));
      parts.push(plural(sum.grades, 'nota', 'notas'));
    }
    if (sum.title || sum.results) parts.push(`${sum.title ? `«${sum.title}»` : 'prueba sin título'} con ${plural(sum.results, 'hoja', 'hojas')}`);
    return parts.join(' · ') || 'sin datos';
  }

  function dayKey(t) {
    const d = new Date(t);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  /**
   * ¿Corresponde una copia automática ahora?
   * copies: índice de copias (cualquier orden) [{ at, hash }]. Devuelve el motivo o null.
   */
  function copyReason({ now, copies, hash: h }) {
    const last = latest(copies);
    if (!last) return 'dia';
    if (last.hash === h) return null; // nada cambió desde la última copia
    if (dayKey(last.at) !== dayKey(now)) return 'dia';
    return now - last.at >= COPY_EVERY ? 'cambios' : null;
  }

  function latest(copies) {
    let best = null;
    for (const c of copies || []) if (!best || c.at > best.at) best = c;
    return best;
  }

  /**
   * Qué copias conservar: las RECENT más recientes y, de las anteriores, la
   * última de cada día (de los últimos KEEP_DAYS días), hasta MAX_COPIES.
   */
  function prune(copies, now) {
    const sorted = [...(copies || [])].sort((a, b) => b.at - a.at);
    const keep = sorted.slice(0, RECENT);
    const days = new Set(keep.map((c) => dayKey(c.at)));
    for (const c of sorted.slice(RECENT)) {
      if (keep.length >= MAX_COPIES) break;
      if (now - c.at > KEEP_DAYS * DAY) continue;
      const k = dayKey(c.at);
      if (days.has(k)) continue;
      days.add(k);
      keep.push(c);
    }
    const ids = new Set(keep.map((c) => c.id));
    return { keep, drop: sorted.filter((c) => !ids.has(c.id)) };
  }

  /**
   * ¿Hay que recordar el respaldo? Devuelve null o { days, never }.
   *  everyDays: cada cuántos días (0 = nunca); lastBackupAt/lastBackupHash: último
   *  respaldo fuera del equipo; firstDataAt: desde cuándo hay datos sin respaldar.
   */
  function reminder({ now, hasData: has, hash: h, everyDays, lastBackupAt, lastBackupHash, firstDataAt, snoozeUntil }) {
    if (!has || !everyDays || everyDays <= 0) return null;
    if (snoozeUntil && snoozeUntil > now) return null;
    if (lastBackupAt && lastBackupHash && lastBackupHash === h) return null; // nada nuevo desde el respaldo
    const since = lastBackupAt || firstDataAt || now;
    if (now - since < everyDays * DAY) return null;
    return { days: Math.floor((now - since) / DAY), never: !lastBackupAt };
  }

  /** ¿Toca actualizar el archivo de respaldo automático? */
  function fileDue({ now, enabled, hash: h, lastFileAt, lastFileHash }) {
    if (!enabled) return false;
    if (lastFileHash === h) return false;
    return !lastFileAt || now - lastFileAt >= FILE_EVERY;
  }

  const REASONS = {
    dia: 'Copia del día',
    cambios: 'Mientras trabajabas',
    resultados: 'Antes de borrar los resultados',
    curso: 'Antes de eliminar un curso',
    evaluacion: 'Antes de eliminar una evaluación',
    restaurar: 'Antes de restaurar un respaldo',
    normal: 'Antes de traer la prueba de la versión normal',
    copia: 'Antes de volver a una copia',
  };

  return { hash, serialize, summary, hasData, describe, copyReason, prune, reminder, fileDue, latest, dayKey, REASONS, COPY_EVERY, FILE_EVERY, DAY };
});
