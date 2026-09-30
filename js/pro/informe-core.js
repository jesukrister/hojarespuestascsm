/*
 * Versión Pro · Informe para UTP: cálculos y gráficos (SVG), sin pantalla.
 *  - distribución de notas en tramos (1,0–1,9 … 6,0–7,0),
 *  - estadísticas (promedio, aprobación, mínimo, máximo),
 *  - logro por OA a partir de las notas guardadas en el libro,
 *  - datos del informe de un curso en un periodo,
 *  - sugerencias (reforzar un OA, evaluación remedial, revisar preguntas…),
 *  - gráficos de columnas y de preguntas (un solo tono, marcas delgadas,
 *    líneas de referencia y etiquetas de valor, para imprimir).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.InformeCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Colores del gráfico (paleta validada: un tono para las barras, tinta y trazos neutros).
  const C = {
    bar: '#2a78d6',
    muted: '#c3c2b7', // barras que no son el foco (con etiqueta o tabla al lado)
    ink: '#0b0b0b',
    ink2: '#52514e',
    ink3: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    ref: '#52514e',
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const r1 = (v) => Math.round(v * 10) / 10;
  const n1 = (v) => Math.round(v * 10) / 10;

  /** 5.25 → "5,3" · 72 → "72" */
  function dec(v, d) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '–';
    return v.toFixed(d === undefined ? 1 : d).replace('.', ',');
  }

  function mean(a) {
    return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  }

  /** Promedio, desviación, mínimo, máximo y aprobación de una lista de notas. */
  function stats(values, pass) {
    const v = values.filter((x) => x !== null && x !== undefined && Number.isFinite(x));
    if (!v.length) return { n: 0, mean: null, sd: null, min: null, max: null, passed: 0, passRate: null };
    const m = mean(v);
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / v.length);
    const passed = pass === undefined ? 0 : v.filter((x) => x >= pass - 1e-9).length;
    return { n: v.length, mean: m, sd, min: Math.min(...v), max: Math.max(...v), passed, passRate: pass === undefined ? null : passed / v.length };
  }

  /** Tramos de una unidad: 1,0–1,9 · 2,0–2,9 · … · 6,0–7,0 (el último incluye la nota máxima). */
  function gradeBands(values, gradeMin, gradeMax) {
    const lo = Math.floor(gradeMin === undefined ? 1 : gradeMin);
    const hi = Math.ceil(gradeMax === undefined ? 7 : gradeMax);
    const bands = [];
    for (let b = lo; b < hi; b++) {
      const last = b === hi - 1;
      bands.push({ from: b, to: last ? hi : b + 0.9, label: `${dec(b)}–${dec(last ? hi : b + 0.9)}`, count: 0 });
    }
    for (const v of values) {
      if (v === null || v === undefined || !Number.isFinite(v)) continue;
      const i = Math.min(bands.length - 1, Math.max(0, Math.floor(v + 1e-9) - lo));
      if (bands[i]) bands[i].count++;
    }
    return bands;
  }

  function levelFor(pct, levels) {
    if (pct === null || pct === undefined) return null;
    if (pct >= levels.achieved) return 'L';
    if (pct >= levels.partial) return 'ML';
    return 'NL';
  }

  /* ------------------------------------------------------------------ */
  /* Informe del curso (libro de notas)                                  */
  /* ------------------------------------------------------------------ */

  /**
   * Logro por OA en varias evaluaciones: promedio de los % de cada estudiante
   * en cada evaluación que midió ese OA (guardados al pasar la prueba al libro).
   */
  function aggregateOa(evaluations, studentIds, levels) {
    const byName = new Map();
    for (const ev of evaluations) {
      for (const sid of studentIds) {
        const e = ev.grades[sid];
        if (!e || !e.oa) continue;
        for (const [name, pct] of Object.entries(e.oa)) {
          const key = name.trim().toLowerCase();
          if (!byName.has(key)) byName.set(key, { name: name.trim(), values: [], evals: new Set(), perStudent: new Map() });
          const o = byName.get(key);
          o.values.push(pct);
          o.evals.add(ev.id);
          if (!o.perStudent.has(sid)) o.perStudent.set(sid, []);
          o.perStudent.get(sid).push(pct);
        }
      }
    }
    return Array.from(byName.values()).map((o) => {
      const avg = n1(mean(o.values));
      const counts = { L: 0, ML: 0, NL: 0 };
      for (const vals of o.perStudent.values()) counts[levelFor(mean(vals), levels)]++;
      return { name: o.name, average: avg, level: levelFor(avg, levels), evaluations: o.evals.size, students: o.perStudent.size, counts };
    });
  }

  /**
   * Datos del informe de un curso.
   * @param L       LibroCore
   * @param period  número de periodo o 'anual'
   * @param levels  niveles de logro { achieved, partial }
   */
  function courseData(L, course, period, levels) {
    const evs = L.sortEvaluations(course.evaluations.filter((e) => period === 'anual' || e.period === period));
    const students = L.activeStudents(course);
    const pass = course.gradePass;
    const rows = students.map((s) => {
      const avg = period === 'anual' ? L.finalAverage(course, s.id) : L.periodAverage(course, s.id, period);
      const grades = evs.map((e) => (e.grades[s.id] ? e.grades[s.id].g : null)).filter((g) => g !== null);
      return {
        id: s.id,
        n: s.n,
        name: s.name,
        pie: !!s.pie,
        exigencia: s.exigencia || null,
        average: avg.value,
        situation: L.situation(course, avg.value),
        grades: grades.length,
        failing: grades.filter((g) => g < pass - 1e-9).length,
        lowest: grades.length ? Math.min(...grades) : null,
        pending: avg.pending,
      };
    });
    const evaluations = evs.map((e) => Object.assign({ id: e.id, title: e.title, date: e.date, weight: L.weightOf(e), kind: e.kind, period: e.period }, L.evaluationSummary(course, e)));
    const averages = rows.map((r) => r.average).filter((v) => v !== null);
    const st = stats(averages, pass);
    return {
      period,
      evaluations,
      students: rows,
      stats: st,
      bands: gradeBands(averages, course.gradeMin, course.gradeMax),
      below: rows.filter((r) => r.situation === 'reprobado' || r.situation === 'limitrofe'),
      borderline: rows.filter((r) => r.situation === 'limitrofe').length,
      pending: rows.reduce((s, r) => s + r.pending, 0),
      pie: rows.filter((r) => r.pie),
      oa: aggregateOa(evs, students.map((s) => s.id), levels),
      formative: evs.filter((e) => L.weightOf(e) === 0).length,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Sugerencias                                                         */
  /* ------------------------------------------------------------------ */

  const LEVEL_NAMES = { L: 'Logrado', ML: 'Medianamente logrado', NL: 'No logrado' };

  /**
   * Sugerencias para el informe de una prueba.
   * @param d { stats, pass, oa: [{ name, average, level, counts }], review: [n° pregunta], kr20, enough, below: n, pie, levels }
   */
  function testRecommendations(d) {
    const out = [];
    const nl = d.oa.filter((o) => o.level === 'NL').sort((a, b) => a.average - b.average);
    const ml = d.oa.filter((o) => o.level === 'ML').sort((a, b) => a.average - b.average);
    for (const o of nl) {
      out.push(`Reforzar ${o.name}: logro promedio de ${dec(o.average, 0)}% (No logrado)${o.counts && o.counts.NL ? `, con ${o.counts.NL} estudiante(s) en nivel No logrado` : ''}. Conviene retomarlo con otra estrategia antes de avanzar.`);
    }
    if (ml.length) out.push(`Retroalimentar ${ml.map((o) => `${o.name} (${dec(o.average, 0)}%)`).join(', ')}: medianamente logrado${ml.length > 1 ? 's' : ''}.`);
    if (d.stats.n && d.stats.passRate !== null && d.stats.passRate < 0.6) {
      out.push(`La aprobación fue de ${dec(d.stats.passRate * 100, 0)}%: considerar una retroalimentación general y una evaluación remedial para quienes no alcanzaron la nota ${dec(d.pass)}.`);
    }
    if (d.below) out.push(`Acompañar a los ${d.below} estudiante(s) con nota bajo ${dec(d.pass)} (ver la lista): reforzar su OA más descendido y monitorear su avance.`);
    if (d.review && d.review.length) {
      out.push(`Revisar la${d.review.length > 1 ? 's' : ''} pregunta${d.review.length > 1 ? 's' : ''} ${d.review.join(', ')} antes de volver a usar la prueba (posible error de clave, redacción ambigua o contenido no tratado).`);
    }
    if (d.enough && d.kr20 !== null && d.kr20 < 0.6) {
      out.push(`La confiabilidad de la prueba es baja (KR-20 = ${dec(d.kr20, 2)}): sus resultados deben complementarse con otras evidencias.`);
    }
    if (d.pie && d.pie.count) {
      out.push(`Compartir con el equipo PIE los resultados de sus ${d.pie.count} estudiante(s) (promedio ${dec(d.pie.mean)}) para ajustar los apoyos.`);
    }
    if (!out.length && d.stats.n) out.push('Los resultados son adecuados: mantener las estrategias y seguir monitoreando los OA en las próximas evaluaciones.');
    return out;
  }

  /** Sugerencias para el informe de un curso. */
  function courseRecommendations(d, course) {
    const out = [];
    const pass = course.gradePass;
    const reprob = d.below.filter((r) => r.situation === 'reprobado');
    if (reprob.length) out.push(`${reprob.length} estudiante(s) con promedio bajo ${dec(pass)}: definir con UTP un plan de apoyo e informar a sus apoderados.`);
    if (d.borderline) out.push(`${d.borderline} estudiante(s) con promedio limítrofe (${dec(pass - 0.1)}): una evaluación o trabajo adicional puede definir su situación.`);
    for (const o of d.oa.filter((x) => x.level === 'NL').sort((a, b) => a.average - b.average)) {
      out.push(`Reforzar ${o.name}: logro promedio de ${dec(o.average, 0)}% en ${o.evaluations} evaluación(es) (No logrado).`);
    }
    for (const e of d.evaluations) {
      if (e.weight > 0 && e.average !== null && e.average < pass) {
        out.push(`La evaluación «${e.title}» tuvo promedio ${dec(e.average)} y ${e.passPct}% de aprobación: considerar retroalimentación y una instancia remedial.`);
      }
    }
    if (d.pending) out.push(`Faltan ${d.pending} nota(s) por registrar en este periodo (estudiantes sin nota en alguna evaluación).`);
    if (d.pie.length) out.push(`Revisar con el equipo PIE el avance de sus ${d.pie.length} estudiante(s).`);
    if (!out.length && d.stats.n) out.push('El curso no presenta estudiantes en riesgo en este periodo: mantener el monitoreo.');
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Gráficos SVG                                                        */
  /* ------------------------------------------------------------------ */

  /** Barra vertical: extremo de datos redondeado (4), base recta. */
  function colPath(x, y, w, h, r) {
    if (h <= 0) return '';
    const rr = Math.min(r, w / 2, h);
    return `M${n1(x)},${n1(y + h)}V${n1(y + rr)}Q${n1(x)},${n1(y)} ${n1(x + rr)},${n1(y)}H${n1(x + w - rr)}Q${n1(x + w)},${n1(y)} ${n1(x + w)},${n1(y + rr)}V${n1(y + h)}Z`;
  }

  function niceMax(v) {
    if (v <= 5) return 5;
    const step = v <= 10 ? 2 : v <= 25 ? 5 : v <= 50 ? 10 : 20;
    return Math.ceil(v / step) * step;
  }

  function ticksFor(max) {
    const step = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : 20;
    const out = [];
    for (let t = 0; t <= max + 1e-9; t += step) out.push(t);
    return out;
  }

  /** Corta un texto a un largo aproximado (en caracteres). */
  function clip(s, max) {
    s = String(s || '');
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  /**
   * Columnas con etiqueta de valor sobre cada una.
   * opts: { labels, sub (segunda línea), values, yMin, yMax, ticks, fmt, ref: { value | between, label }, title }
   */
  function columnChart(opts) {
    const W = 640;
    const H = opts.height || 230;
    const m = { l: 34, r: 14, t: 22, b: opts.sub ? 42 : 30 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const nBars = opts.values.length;
    const yMin = opts.yMin || 0;
    const yMax = opts.yMax;
    const y = (v) => m.t + ph - ((v - yMin) / (yMax - yMin)) * ph;
    const slot = pw / Math.max(1, nBars);
    const bw = Math.min(24, slot * 0.5);
    const out = [];
    out.push(`<svg class="rep-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title || '')}" xmlns="http://www.w3.org/2000/svg">`);
    // Grilla y eje.
    for (const t of opts.ticks) {
      const ty = n1(y(t));
      out.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${ty}" y2="${ty}" stroke="${t === yMin ? C.axis : C.grid}" stroke-width="1"/>`);
      out.push(`<text x="${m.l - 6}" y="${ty + 3.5}" text-anchor="end" class="rep-tick">${esc(opts.tickFmt ? opts.tickFmt(t) : t)}</text>`);
    }
    // Barras con su valor.
    opts.values.forEach((v, i) => {
      const cx = m.l + slot * (i + 0.5);
      if (v !== null && v !== undefined) {
        const top = y(Math.max(yMin, v));
        if (y(yMin) - top > 0.5) out.push(`<path d="${colPath(cx - bw / 2, top, bw, y(yMin) - top, 4)}" fill="${(opts.colors && opts.colors[i]) || C.bar}"/>`);
        out.push(`<text x="${n1(cx)}" y="${n1(top - 5)}" text-anchor="middle" class="rep-val">${esc(opts.fmt ? opts.fmt(v) : v)}</text>`);
      }
      out.push(`<text x="${n1(cx)}" y="${n1(H - m.b + 15)}" text-anchor="middle" class="rep-xl">${esc(clip(opts.labels[i], opts.labelMax || 16))}</text>`);
      if (opts.sub) out.push(`<text x="${n1(cx)}" y="${n1(H - m.b + 28)}" text-anchor="middle" class="rep-xs">${esc(clip(opts.sub[i], opts.labelMax || 16))}</text>`);
    });
    // Línea de referencia (p. ej. la nota de aprobación).
    if (opts.ref) {
      if (opts.ref.between !== undefined) {
        const rx = n1(m.l + slot * opts.ref.between);
        out.push(`<line x1="${rx}" x2="${rx}" y1="${m.t - 8}" y2="${n1(y(yMin))}" stroke="${C.ref}" stroke-width="1.5"/>`);
        out.push(`<text x="${rx + 5}" y="${m.t - 2}" class="rep-ref">${esc(opts.ref.label)}</text>`);
      } else {
        const ry = n1(y(opts.ref.value));
        out.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${ry}" y2="${ry}" stroke="${C.ref}" stroke-width="1.5"/>`);
        out.push(`<text x="${W - m.r}" y="${ry - 5}" text-anchor="end" class="rep-ref">${esc(opts.ref.label)}</text>`);
      }
    }
    out.push('</svg>');
    return out.join('');
  }

  /** Distribución de notas por tramo (columnas) con la nota de aprobación marcada. */
  function distributionChart(bands, pass, title) {
    const maxCount = Math.max(1, ...bands.map((b) => b.count));
    const yMax = niceMax(maxCount);
    const between = bands.findIndex((b) => b.from >= pass - 1e-9);
    return columnChart({
      title,
      labels: bands.map((b) => b.label),
      values: bands.map((b) => b.count),
      yMin: 0,
      yMax,
      ticks: ticksFor(yMax),
      ref: between > 0 ? { between, label: `Aprobación ${dec(pass)}` } : null,
    });
  }

  /** Promedio del curso en cada evaluación (columnas desde la nota mínima). */
  function evaluationsChart(evaluations, course, title) {
    const lo = Math.floor(course.gradeMin);
    const hi = Math.ceil(course.gradeMax);
    const ticks = [];
    for (let t = lo; t <= hi; t++) ticks.push(t);
    return columnChart({
      title,
      labels: evaluations.map((e) => e.title),
      sub: evaluations.map((e) => e.dateText || ''),
      values: evaluations.map((e) => e.average),
      yMin: lo,
      yMax: hi,
      ticks,
      tickFmt: (t) => dec(t),
      fmt: (v) => dec(v),
      labelMax: Math.max(8, Math.min(34, Math.floor(592 / Math.max(1, evaluations.length) / 7))),
      ref: { value: course.gradePass, label: `Aprobación ${dec(course.gradePass)}` },
    });
  }

  /**
   * % de acierto por pregunta: en azul las que quedaron bajo el nivel
   * «medianamente logrado» (el foco), las demás en gris; líneas de referencia en los niveles.
   */
  function questionsChart(items, levels, title) {
    const W = 640;
    const H = 200;
    const m = { l: 34, r: 14, t: 16, b: 26 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const nq = items.length;
    const slot = pw / Math.max(1, nq);
    const bw = Math.max(2, Math.min(24, slot * 0.62));
    const y = (v) => m.t + ph - (v / 100) * ph;
    const out = [];
    out.push(`<svg class="rep-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title || '')}" xmlns="http://www.w3.org/2000/svg">`);
    for (const t of [0, 25, 50, 75, 100]) {
      const ty = n1(y(t));
      out.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${ty}" y2="${ty}" stroke="${t === 0 ? C.axis : C.grid}" stroke-width="1"/>`);
      out.push(`<text x="${m.l - 6}" y="${ty + 3.5}" text-anchor="end" class="rep-tick">${t}%</text>`);
    }
    const every = nq <= 30 ? 1 : nq <= 60 ? 5 : 10;
    items.forEach((it, i) => {
      const cx = m.l + slot * (i + 0.5);
      if (it.p !== null && it.p !== undefined && it.p > 0) {
        const pct = it.p * 100;
        const top = y(pct);
        const focus = pct < levels.partial;
        out.push(`<path d="${colPath(cx - bw / 2, top, bw, y(0) - top, Math.min(4, bw / 2))}" fill="${focus ? C.bar : C.muted}"><title>Pregunta ${it.question}: ${Math.round(pct)}%</title></path>`);
      }
      if ((i + 1) % every === 0 || i === 0) out.push(`<text x="${n1(cx)}" y="${H - m.b + 15}" text-anchor="middle" class="rep-xs">${it.question}</text>`);
    });
    for (const [v, lab] of [
      [levels.achieved, `L ${levels.achieved}%`],
      [levels.partial, `ML ${levels.partial}%`],
    ]) {
      const ry = n1(y(v));
      out.push(`<line x1="${m.l}" x2="${W - m.r}" y1="${ry}" y2="${ry}" stroke="${C.ref}" stroke-width="1"/>`);
      out.push(`<text x="${W - m.r}" y="${ry - 4}" text-anchor="end" class="rep-ref">${esc(lab)}</text>`);
    }
    out.push('</svg>');
    return out.join('');
  }

  return {
    COLORS: C,
    LEVEL_NAMES,
    dec,
    stats,
    gradeBands,
    levelFor,
    aggregateOa,
    courseData,
    testRecommendations,
    courseRecommendations,
    columnChart,
    distributionChart,
    evaluationsChart,
    questionsChart,
    r1,
  };
});
