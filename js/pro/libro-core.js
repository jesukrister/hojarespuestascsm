/*
 * Versión Pro · Libro de notas: cursos, estudiantes, evaluaciones y promedios.
 * Sólo lógica (sin pantalla), para poder probarla aparte.
 *
 * Libro:  { version, courses: [curso], updatedAt }
 * Curso:  { id, name, subject, year, periods (2 = semestral, 3 = trimestral),
 *           gradeMin, gradePass, gradeMax, rounding ('round' | 'trunc'),
 *           students: [{ id, n, name, rut, retired, pie?, exigencia? }],
 *           evaluations: [evaluación], createdAt, updatedAt }
 * Evaluación: { id, title, date ('aaaa-mm-dd'), period, weight, kind ('escaneada' | 'manual'),
 *           grades: { idEstudiante: { g, pts, max, pct, ans, oa, edited, orig, at } },
 *           source (resumen de la prueba), exam (configuración para volver a usarla),
 *           createdAt, updatedAt }
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LibroCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BOOK_VERSION = 1;
  const LETTERS = 'ABCDEF';

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function num(v, fallback, min, max) {
    const x = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(',', '.'));
    if (!Number.isFinite(x)) return fallback;
    return Math.min(max, Math.max(min, x));
  }

  /** Aproxima (o trunca) a un decimal, como en las actas. */
  function round1(x, mode) {
    if (x === null || x === undefined || !Number.isFinite(x)) return null;
    return mode === 'trunc' ? Math.floor(x * 10 + 1e-9) / 10 : Math.round(x * 10 + 1e-9) / 10;
  }

  /** "5,5" (formato chileno). */
  function fmtGrade(v) {
    return v === null || v === undefined || !Number.isFinite(v) ? '' : v.toFixed(1).replace('.', ',');
  }

  function todayIso(d) {
    d = d || new Date();
    const p2 = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  }

  function fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
  }

  function periodNames(periods) {
    return periods === 3 ? ['1° trimestre', '2° trimestre', '3° trimestre'] : ['1° semestre', '2° semestre'];
  }

  /** Periodo que corresponde a una fecha (año escolar de marzo a diciembre). */
  function periodForDate(iso, periods) {
    const m = parseInt(String(iso || '').slice(5, 7), 10) || new Date().getMonth() + 1;
    if (periods === 3) return m <= 5 ? 1 : m <= 8 ? 2 : 3;
    return m <= 7 ? 1 : 2;
  }

  /* ------------------------------------------------------------------ */
  /* Datos: valores por omisión y limpieza (libros guardados o respaldos) */
  /* ------------------------------------------------------------------ */

  function emptyBook() {
    return { version: BOOK_VERSION, courses: [], updatedAt: 0 };
  }

  function newCourse(fields) {
    const now = Date.now();
    return sanitizeCourse(
      Object.assign(
        { id: uid(), name: '', subject: '', year: new Date().getFullYear(), periods: 2, students: [], evaluations: [], createdAt: now, updatedAt: now },
        fields || {}
      )
    );
  }

  function str(v, max) {
    return typeof v === 'string' ? v.slice(0, max || 200) : '';
  }

  function sanitizeEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const g = typeof raw.g === 'number' && Number.isFinite(raw.g) ? raw.g : null;
    if (g === null) return null;
    const e = { g };
    for (const k of ['pts', 'max', 'pct', 'orig', 'at']) if (typeof raw[k] === 'number' && Number.isFinite(raw[k])) e[k] = raw[k];
    if (typeof raw.ans === 'string') e.ans = raw.ans.slice(0, 200);
    if (raw.oa && typeof raw.oa === 'object') {
      e.oa = {};
      for (const [k, v] of Object.entries(raw.oa)) if (typeof v === 'number' && Number.isFinite(v)) e.oa[k.slice(0, 80)] = v;
    }
    if (raw.edited === true) e.edited = true;
    return e;
  }

  function sanitizeEvaluation(raw, course) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
    const now = Date.now();
    const ev = {
      id: raw.id,
      title: str(raw.title, 120) || 'Evaluación',
      date: /^\d{4}-\d{2}-\d{2}$/.test(raw.date || '') ? raw.date : todayIso(),
      period: 1,
      weight: num(raw.weight, 1, 0, 1000),
      kind: raw.kind === 'escaneada' ? 'escaneada' : 'manual',
      grades: {},
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
    };
    const p = parseInt(raw.period, 10);
    ev.period = p >= 1 && p <= course.periods ? p : periodForDate(ev.date, course.periods);
    if (raw.grades && typeof raw.grades === 'object') {
      for (const [sid, e] of Object.entries(raw.grades)) {
        const clean = sanitizeEntry(e);
        if (clean) ev.grades[sid] = clean;
      }
    }
    if (raw.source && typeof raw.source === 'object') ev.source = JSON.parse(JSON.stringify(raw.source));
    if (raw.exam && typeof raw.exam === 'object') ev.exam = JSON.parse(JSON.stringify(raw.exam));
    if (typeof raw.savedAt === 'number') ev.savedAt = raw.savedAt;
    return ev;
  }

  function sanitizeCourse(raw) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
    const now = Date.now();
    const c = {
      id: raw.id,
      name: str(raw.name, 80),
      subject: str(raw.subject, 80),
      year: Math.round(num(raw.year, new Date().getFullYear(), 2000, 2200)),
      periods: raw.periods === 3 || raw.periods === '3' ? 3 : 2,
      gradeMin: num(raw.gradeMin, 1, 0, 100),
      gradePass: 4,
      gradeMax: 7,
      rounding: raw.rounding === 'trunc' ? 'trunc' : 'round',
      students: [],
      evaluations: [],
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
    };
    c.gradeMax = num(raw.gradeMax, 7, c.gradeMin + 0.1, 100);
    c.gradePass = num(raw.gradePass, 4, c.gradeMin, c.gradeMax);
    const ids = new Set();
    for (const s of Array.isArray(raw.students) ? raw.students : []) {
      if (!s || typeof s !== 'object' || typeof s.id !== 'string' || ids.has(s.id)) continue;
      const n = parseInt(s.n, 10);
      if (!(n >= 1 && n <= 999)) continue;
      ids.add(s.id);
      const st = { id: s.id, n, name: str(s.name, 120), rut: str(s.rut, 20), retired: s.retired === true };
      // Estudiante PIE (Decreto 83), con su propia exigencia si la tiene.
      if (s.pie === true) {
        st.pie = true;
        const ex = Math.round(num(s.exigencia, 0, 0, 99));
        if (ex >= 1) st.exigencia = ex;
      }
      c.students.push(st);
    }
    c.students.sort((a, b) => a.n - b.n);
    const evIds = new Set();
    for (const e of Array.isArray(raw.evaluations) ? raw.evaluations : []) {
      const ev = sanitizeEvaluation(e, c);
      if (!ev || evIds.has(ev.id)) continue;
      evIds.add(ev.id);
      c.evaluations.push(ev);
    }
    return c;
  }

  function sanitizeBook(raw) {
    const book = emptyBook();
    if (!raw || typeof raw !== 'object') return book;
    const ids = new Set();
    for (const c of Array.isArray(raw.courses) ? raw.courses : []) {
      const clean = sanitizeCourse(c);
      if (!clean || ids.has(clean.id)) continue;
      ids.add(clean.id);
      book.courses.push(clean);
    }
    book.updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : 0;
    return book;
  }

  function courseLabel(c) {
    return [c.name || 'Curso sin nombre', c.subject].filter(Boolean).join(' · ') + (c.year && c.year !== new Date().getFullYear() ? ` (${c.year})` : '');
  }

  /* ------------------------------------------------------------------ */
  /* Lista del curso                                                     */
  /* ------------------------------------------------------------------ */

  /** Dígito verificador de un RUT (módulo 11). */
  function rutDv(body) {
    let sum = 0;
    let mul = 2;
    for (let i = body.length - 1; i >= 0; i--) {
      sum += parseInt(body[i], 10) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    const r = 11 - (sum % 11);
    return r === 11 ? '0' : r === 10 ? 'K' : String(r);
  }

  const RUT_RE = /^(\d{1,2})\.?(\d{3})\.?(\d{3})\s*-?\s*([\dkK])$/;

  /** "12345678-5" → { rut: "12.345.678-5", valid }; null si no parece un RUT. */
  function normalizeRut(text) {
    const m = RUT_RE.exec(String(text || '').trim());
    if (!m) return null;
    const body = m[1] + m[2] + m[3];
    const dv = m[4].toUpperCase();
    return { rut: `${m[1]}.${m[2]}.${m[3]}-${dv}`, valid: rutDv(body) === dv };
  }

  const HEADER_WORDS = /^(n[°º.o]?|n[uú]mero|nro\.?|#|nombres?|apellidos?|estudiantes?|alumn[oa]s?|rut|run|lista|curso)$/i;

  /**
   * Lista pegada (un estudiante por línea): "Ana Aravena", "1. Ana Aravena",
   * o columnas copiadas de Excel (N°, nombre, RUT…, separadas por tabulación o ";").
   * @returns { students: [{ n, name, rut, explicit (el N° venía escrito) }], warnings: [] }
   */
  function parseRosterText(text) {
    const rows = [];
    const warnings = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line) return;
        let cols = line.indexOf('\t') >= 0 ? line.split('\t') : line.indexOf(';') >= 0 ? line.split(';') : [line];
        cols = cols.map((c) => c.trim()).filter(Boolean);
        // Encabezado ("N°  Nombre  RUT", "Nombre completo"…).
        if (cols.every((c) => HEADER_WORDS.test(c.replace(/[:]/g, '')))) return;
        if (!rows.length && !/\d/.test(line) && /\b(nombres?|apellidos?|estudiantes?|alumn[oa]s?)\b/.test(normName(line))) return;
        let n = null;
        let rut = null;
        const names = [];
        for (let c of cols) {
          if (n === null && !names.length && /^\d{1,3}\s*[.)°º-]?$/.test(c)) {
            n = parseInt(c, 10);
            continue;
          }
          if (!rut) {
            const r = normalizeRut(c);
            if (r) {
              rut = r;
              continue;
            }
          }
          if (cols.length === 1) {
            // "1. Ana Aravena 12.345.678-5"
            const m = /^(\d{1,3})\s*[.)°º-]?\s+(.+)$/.exec(c);
            if (m && n === null) {
              n = parseInt(m[1], 10);
              c = m[2];
            }
            const t = /\s+(\d{1,2}\.?\d{3}\.?\d{3}\s*-?\s*[\dkK])$/.exec(c);
            if (t && !rut) {
              const r = normalizeRut(t[1]);
              if (r) {
                rut = r;
                c = c.slice(0, t.index).trim();
              }
            }
          }
          names.push(c);
        }
        const name = names.join(' ').replace(/\s+/g, ' ').trim();
        if (!name) return;
        if (rut && !rut.valid) warnings.push(`Línea ${i + 1} (${name}): el RUT ${rut.rut} tiene el dígito verificador incorrecto.`);
        rows.push({ n, name, rut: rut ? rut.rut : '', explicit: n !== null });
      });
    // Numeración: la escrita en la lista, o seguida.
    let next = 1;
    const seen = new Map();
    for (const r of rows) {
      if (!(r.n >= 1 && r.n <= 999)) r.n = next;
      next = r.n + 1;
      if (seen.has(r.n)) warnings.push(`El N° ${r.n} está repetido (${seen.get(r.n)} y ${r.name}).`);
      else seen.set(r.n, r.name);
    }
    return { students: rows, warnings };
  }

  /** Lista para la prueba: línea N = estudiante con N° de lista N (vacía si no hay). */
  function rosterText(course) {
    const lines = [];
    for (const s of course.students) {
      while (lines.length < s.n) lines.push('');
      lines[s.n - 1] = s.name;
    }
    return lines.join('\n');
  }

  function studentByN(course, n) {
    return course.students.find((s) => s.n === n) || null;
  }

  function normName(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /* ------------------------------------------------------------------ */
  /* Notas y promedios                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Nota escrita a mano: "5,5", "5.5" o "55" (= 5,5).
   * @returns { value } (null si está vacía) o { error }
   */
  function parseGrade(text, course) {
    const t = String(text == null ? '' : text).trim().replace(',', '.');
    if (t === '') return { value: null };
    if (!/^\d{1,3}(\.\d+)?$/.test(t)) return { error: 'Escribe la nota con números, por ejemplo 5,5.' };
    let v = parseFloat(t);
    if (v > course.gradeMax && /^\d{2}$/.test(t) && v / 10 <= course.gradeMax) v = v / 10;
    if (v < course.gradeMin || v > course.gradeMax) {
      return { error: `La nota debe estar entre ${fmtGrade(course.gradeMin)} y ${fmtGrade(course.gradeMax)}.` };
    }
    return { value: Math.round(v * 10 + 1e-9) / 10 };
  }

  /** Peso de una evaluación en su periodo (0 = no se promedia, p. ej. formativa). */
  function weightOf(ev) {
    return Number.isFinite(ev.weight) && ev.weight >= 0 ? ev.weight : 1;
  }

  function sortEvaluations(list) {
    return list.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
  }

  function periodEvaluations(course, period) {
    return sortEvaluations(course.evaluations.filter((e) => e.period === period));
  }

  /** % que pesa cada evaluación dentro de su periodo. */
  function weightPercents(course, period) {
    const evs = periodEvaluations(course, period);
    const total = evs.reduce((s, e) => s + weightOf(e), 0);
    const out = {};
    for (const e of evs) out[e.id] = total > 0 ? (weightOf(e) / total) * 100 : 0;
    return out;
  }

  /** Promedio ponderado de un estudiante en un periodo (las notas que faltan no se cuentan). */
  function periodAverage(course, studentId, period) {
    let sum = 0;
    let wsum = 0;
    let count = 0;
    let pending = 0;
    for (const ev of course.evaluations) {
      if (ev.period !== period) continue;
      const w = weightOf(ev);
      const e = ev.grades[studentId];
      if (!e) {
        if (w > 0) pending++;
        continue;
      }
      if (w === 0) continue;
      sum += e.g * w;
      wsum += w;
      count++;
    }
    if (!(wsum > 0)) return { value: null, raw: null, count: 0, pending };
    const raw = sum / wsum;
    return { value: round1(raw, course.rounding), raw, count, pending };
  }

  /** Promedio final: promedio de los promedios de cada periodo (ya aproximados). */
  function finalAverage(course, studentId) {
    const vals = [];
    let pending = 0;
    for (let p = 1; p <= course.periods; p++) {
      const a = periodAverage(course, studentId, p);
      pending += a.pending;
      if (a.value !== null) vals.push(a.value);
    }
    if (!vals.length) return { value: null, raw: null, count: 0, pending };
    const raw = vals.reduce((s, v) => s + v, 0) / vals.length;
    return { value: round1(raw, course.rounding), raw, count: vals.length, pending };
  }

  /** 'limitrofe' (una décima bajo la aprobación, p. ej. 3,9), 'reprobado', 'aprobado' o null. */
  function situation(course, value) {
    if (value === null || value === undefined) return null;
    if (value >= course.gradePass - 1e-9) return 'aprobado';
    if (Math.abs(value - round1(course.gradePass - 0.1)) < 1e-9) return 'limitrofe';
    return 'reprobado';
  }

  function activeStudents(course) {
    return course.students.filter((s) => !s.retired);
  }

  /** Resumen del curso en un periodo (o 'anual'). */
  function courseSummary(course, period) {
    const out = { students: 0, average: null, below: 0, borderline: 0, pending: 0, withAverage: 0 };
    const vals = [];
    for (const s of activeStudents(course)) {
      out.students++;
      const a = period === 'anual' ? finalAverage(course, s.id) : periodAverage(course, s.id, period);
      out.pending += a.pending;
      if (a.value === null) continue;
      vals.push(a.value);
      const sit = situation(course, a.value);
      if (sit === 'limitrofe') out.borderline++;
      if (sit === 'reprobado' || sit === 'limitrofe') out.below++;
    }
    out.withAverage = vals.length;
    out.average = vals.length ? round1(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
    return out;
  }

  /** Promedio y aprobación de una evaluación. */
  function evaluationSummary(course, ev) {
    const vals = [];
    for (const s of course.students) {
      const e = ev.grades[s.id];
      if (e) vals.push(e.g);
    }
    const passed = vals.filter((v) => v >= course.gradePass - 1e-9).length;
    return {
      count: vals.length,
      average: vals.length ? round1(vals.reduce((s, v) => s + v, 0) / vals.length) : null,
      passPct: vals.length ? Math.round((passed / vals.length) * 100) : null,
    };
  }

  /** Columna para pegar en el libro digital: una nota por línea, en orden de lista. */
  function columnText(course, valueOf) {
    const maxN = course.students.reduce((m, s) => Math.max(m, s.n), 0);
    const lines = [];
    for (let n = 1; n <= maxN; n++) {
      const s = studentByN(course, n);
      const v = s ? valueOf(s) : null;
      lines.push(v === null || v === undefined ? '' : fmtGrade(v));
    }
    return lines.join('\n');
  }

  /* ------------------------------------------------------------------ */
  /* Guardar las notas de una prueba escaneada                           */
  /* ------------------------------------------------------------------ */

  /** Respuestas en texto: una letra por pregunta, "-" en blanco, "*" doble marca. */
  function encodeAnswers(answers) {
    return answers.map((a) => {
      const m = (a && a.marked) || [];
      return m.length === 0 ? '-' : m.length > 1 ? '*' : LETTERS[m[0]] || '?';
    }).join('');
  }

  /**
   * Plan para guardar las notas de una prueba en una evaluación del libro.
   * entries: [{ label, code, name, g, pts, max, pct, ans, oa, review }]
   * @returns { rows: [{ student, entry, before, status }], problems: [{ label, reason }], review }
   *   status: 'nueva' | 'cambia' | 'igual' | 'editada' (nota cambiada a mano en el libro: no se toca)
   */
  function planSave(course, ev, entries) {
    const problems = [];
    const byStudent = new Map();
    const byName = new Map();
    for (const s of course.students) {
      const k = normName(s.name);
      if (k) byName.set(k, byName.has(k) ? null : s); // nombres repetidos: no se usan
    }
    let review = 0;
    for (const en of entries) {
      let student = null;
      const code = String(en.code || '');
      if (/^\d+$/.test(code)) {
        student = studentByN(course, parseInt(code, 10));
        if (!student) {
          problems.push({ label: en.label, reason: `no hay ningún estudiante con el N° de lista ${parseInt(code, 10)} en el curso.` });
          continue;
        }
      } else if (en.name && byName.get(normName(en.name))) {
        student = byName.get(normName(en.name));
      } else {
        problems.push({
          label: en.label,
          reason: code ? `el N° de lista está incompleto (${code}): corrígelo en Resultados.` : 'la hoja no tiene N° de lista: escríbelo en Resultados.',
        });
        continue;
      }
      if (en.g === null || en.g === undefined) {
        problems.push({ label: en.label, reason: 'no tiene nota (falta la clave de respuestas).' });
        continue;
      }
      if (byStudent.has(student.id)) {
        byStudent.get(student.id).dup.push(en.label);
        continue;
      }
      byStudent.set(student.id, { student, entry: en, dup: [] });
    }
    const rows = [];
    for (const { student, entry, dup } of byStudent.values()) {
      if (dup.length) {
        problems.push({ label: [entry.label].concat(dup).join(', '), reason: `hay ${dup.length + 1} hojas con el N° de lista ${student.n} (${student.name}): deja sólo una en Resultados.` });
        continue;
      }
      const before = ev ? ev.grades[student.id] || null : null;
      let status = 'nueva';
      if (before && before.edited) status = 'editada';
      else if (before) status = Math.abs(before.g - entry.g) < 1e-9 ? 'igual' : 'cambia';
      if (entry.review) review++;
      rows.push({ student, entry, before, status });
    }
    rows.sort((a, b) => a.student.n - b.student.n);
    return { rows, problems, review };
  }

  /** Aplica un plan (planSave) a la evaluación; las notas cambiadas a mano en el libro se conservan. */
  function applySave(ev, plan, now) {
    now = now || Date.now();
    for (const r of plan.rows) {
      if (r.status === 'editada') continue;
      const e = { g: r.entry.g, at: now };
      for (const k of ['pts', 'max', 'pct']) if (typeof r.entry[k] === 'number' && Number.isFinite(r.entry[k])) e[k] = r.entry[k];
      if (typeof r.entry.ans === 'string') e.ans = r.entry.ans;
      if (r.entry.oa) e.oa = r.entry.oa;
      ev.grades[r.student.id] = e;
    }
    ev.updatedAt = now;
    ev.savedAt = now;
    return ev;
  }

  /** Cambia (o borra, con value null) una nota a mano. Si venía de una hoja escaneada, se recuerda la original. */
  function setGrade(ev, studentId, value, now) {
    now = now || Date.now();
    const before = ev.grades[studentId];
    if (value === null) delete ev.grades[studentId];
    else if (!before) ev.grades[studentId] = { g: value, at: now, edited: ev.kind === 'escaneada' };
    else if (Math.abs(before.g - value) > 1e-9) {
      const e = Object.assign({}, before, { g: value, at: now });
      if (ev.kind === 'escaneada') {
        if (typeof before.orig !== 'number' && !before.edited) e.orig = before.g;
        e.edited = !(typeof e.orig === 'number' && Math.abs(e.orig - value) < 1e-9);
        if (!e.edited) delete e.orig;
      }
      ev.grades[studentId] = e;
    }
    ev.updatedAt = now;
  }

  /* ------------------------------------------------------------------ */
  /* Combinar libros (respaldo de otro equipo)                           */
  /* ------------------------------------------------------------------ */

  function unionById(a, b, pick) {
    const out = new Map();
    for (const x of a) out.set(x.id, x);
    for (const y of b) out.set(y.id, out.has(y.id) ? pick(out.get(y.id), y) : y);
    return Array.from(out.values());
  }

  /** Agrega lo que falta; si algo está en los dos, queda lo modificado más recientemente. */
  function mergeBooks(local, incoming) {
    const newer = (x, y) => ((y.updatedAt || 0) > (x.updatedAt || 0) ? y : x);
    const courses = unionById(local.courses, incoming.courses, (x, y) => {
      const base = newer(x, y);
      const other = base === x ? y : x;
      return Object.assign({}, base, {
        students: unionById(other.students, base.students, (o, b) => b).sort((s, t) => s.n - t.n),
        evaluations: unionById(x.evaluations, y.evaluations, newer),
        updatedAt: Math.max(x.updatedAt || 0, y.updatedAt || 0),
      });
    });
    return sanitizeBook({ version: BOOK_VERSION, courses, updatedAt: Date.now() });
  }

  return {
    BOOK_VERSION,
    uid,
    round1,
    fmtGrade,
    todayIso,
    fmtDate,
    periodNames,
    periodForDate,
    emptyBook,
    newCourse,
    sanitizeBook,
    sanitizeCourse,
    sanitizeEvaluation,
    courseLabel,
    rutDv,
    normalizeRut,
    parseRosterText,
    rosterText,
    studentByN,
    normName,
    parseGrade,
    weightOf,
    sortEvaluations,
    periodEvaluations,
    weightPercents,
    periodAverage,
    finalAverage,
    situation,
    activeStudents,
    courseSummary,
    evaluationSummary,
    columnText,
    encodeAnswers,
    planSave,
    applySave,
    setGrade,
    mergeBooks,
  };
});
