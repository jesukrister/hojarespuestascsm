/*
 * Versión Pro · Cursos y libro de notas:
 *  - pestaña Cursos (notas, evaluaciones y estudiantes de cada curso);
 *  - curso de la prueba (pestaña Prueba): la lista de estudiantes sale del curso;
 *  - "Guardar en el libro de notas" (pestaña Resultados).
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  if (!Pro) return;
  const { app, L, $, $$ } = Pro;
  const esc = app.esc;
  const state = app.state;
  const NEW = '__new';

  /* ------------------------------------------------------------------ */
  /* Ayudas                                                              */
  /* ------------------------------------------------------------------ */

  function currentCourse() {
    return Pro.course(Pro.ui.courseId) || Pro.book.courses[0] || null;
  }

  function examLink() {
    return state.exam.pro && typeof state.exam.pro === 'object' ? state.exam.pro : {};
  }

  function linkedCourse() {
    return Pro.course(examLink().courseId);
  }

  function setExamLink(courseId, evalId) {
    state.exam.pro = Object.assign({}, examLink(), { courseId: courseId || null, evalId: evalId || null });
    app.save();
  }

  function courseOptions(selected) {
    return Pro.book.courses
      .map((c) => `<option value="${esc(c.id)}"${c.id === selected ? ' selected' : ''}>${esc(L.courseLabel(c))}</option>`)
      .join('');
  }

  function periodOptions(course, selected) {
    return L.periodNames(course.periods)
      .map((n, i) => `<option value="${i + 1}"${i + 1 === selected ? ' selected' : ''}>${n}</option>`)
      .join('');
  }

  function parseWeight(text) {
    const v = parseFloat(String(text).replace(',', '.'));
    return Number.isFinite(v) && v >= 0 ? v : 1;
  }

  function fmtPct(p) {
    return `${Math.round(p)}%`;
  }

  function studentsWithGrades(course, studentId) {
    return course.evaluations.filter((e) => e.grades[studentId]).length;
  }

  /** La lista de la prueba vinculada sigue a la del curso. */
  function syncRosterFromCourse() {
    const c = linkedCourse();
    if (!c) return;
    const text = L.rosterText(c);
    if (state.exam.roster !== text) {
      state.exam.roster = text;
      app.save();
      $('#roster').value = text;
      if (!$('#tab-resultados').hidden) app.renderResults();
    }
  }

  function renderAll() {
    renderExamLink();
    renderBookBox();
    if (!$('#tab-cursos').hidden) renderCursos();
  }
  Pro.renderAll = renderAll;

  /* ------------------------------------------------------------------ */
  /* Pestaña Prueba: curso de la prueba                                  */
  /* ------------------------------------------------------------------ */

  function renderExamLink() {
    const sel = $('#proExamCourse');
    if (!sel) return;
    const c = linkedCourse();
    sel.innerHTML =
      `<option value="">— Sin curso —</option>` + courseOptions(c ? c.id : '') + `<option value="${NEW}">＋ Crear un curso nuevo…</option>`;
    sel.value = c ? c.id : '';
    $('#proExamCourseInfo').textContent = c
      ? `La lista de estudiantes se toma de este curso (${L.activeStudents(c).length}). En Resultados podrás guardar las notas en su libro.`
      : Pro.book.courses.length
        ? 'Elige el curso para usar su lista de estudiantes y guardar las notas en su libro.'
        : 'Crea el curso con la lista de tus estudiantes para guardar las notas de esta prueba en su libro.';
    const note = $('#proRosterNote');
    const ta = $('#roster');
    if (c) {
      note.hidden = false;
      note.textContent = `📚 Esta lista viene del curso ${L.courseLabel(c)}. Para cambiarla, ve a Cursos → Estudiantes.`;
      ta.readOnly = true;
    } else {
      note.hidden = true;
      ta.readOnly = false;
    }
  }

  function onExamCourseChange(e) {
    const v = e.target.value;
    if (v === NEW) {
      const c = linkedCourse();
      e.target.value = c ? c.id : '';
      openCourseDialog(null, { linkExam: true });
      return;
    }
    const link = examLink();
    setExamLink(v || null, link.courseId === v ? link.evalId : null);
    boxState.courseId = null;
    boxState.evalId = null;
    syncRosterFromCourse();
    renderExamLink();
    renderBookBox();
  }

  /* ------------------------------------------------------------------ */
  /* Pestaña Resultados: guardar en el libro de notas                    */
  /* ------------------------------------------------------------------ */

  // Lo elegido en el recuadro (se guarda en la prueba al guardar las notas).
  const boxState = { courseId: null, evalId: null, fieldsFor: '' };

  function resultEntries() {
    return app.sortedResults().map(({ r, g }) => {
      const name = app.displayName(r);
      const label = (r.code ? `N° ${r.code}` : 'Hoja sin N° de lista') + (name ? ` · ${name}` : r.code ? '' : ` (${r.fileName || 'foto'})`);
      const oa = {};
      for (const o of app.oaResults(g)) if (o.percent !== null) oa[o.name] = o.percent;
      return {
        label,
        code: r.code || '',
        name,
        g: g.grade,
        pts: g.score,
        max: g.maxScore,
        pct: g.percent,
        ans: L.encodeAnswers(app.canonAnswers(r)),
        oa: Object.keys(oa).length ? oa : undefined,
        review: app.needsReview(r),
      };
    });
  }

  function boxCourse() {
    const courses = Pro.book.courses;
    return Pro.course(boxState.courseId) || linkedCourse() || Pro.course(Pro.ui.courseId) || courses[0] || null;
  }

  function renderBookBox() {
    const box = $('#proBookBox');
    if (!box) return;
    const course = boxCourse();
    $('#proBookNoCourse').hidden = !!course;
    $('#proBookForm').hidden = !course;
    $('#proBookActions').hidden = !course;
    if (!course) {
      $('#proBookStatus').textContent = 'Guarda estas notas en el libro de notas de un curso.';
      return;
    }
    boxState.courseId = course.id;
    $('#proBookCourse').innerHTML = courseOptions(course.id);
    $('#proBookCourse').value = course.id;

    const link = examLink();
    let evalId = boxState.evalId;
    if (!evalId) evalId = link.courseId === course.id && course.evaluations.some((e) => e.id === link.evalId) ? link.evalId : NEW;
    if (evalId !== NEW && !course.evaluations.some((e) => e.id === evalId)) evalId = NEW;
    boxState.evalId = evalId;
    const evs = L.sortEvaluations(course.evaluations).reverse();
    $('#proBookEval').innerHTML =
      `<option value="${NEW}">➕ Nueva evaluación</option>` +
      evs.map((e) => `<option value="${esc(e.id)}">${esc(e.title)} · ${esc(L.fmtDate(e.date))}</option>`).join('');
    $('#proBookEval').value = evalId;

    const isNew = evalId === NEW;
    for (const f of $$('.pro-new-field', box)) f.hidden = !isNew;
    // Valores sugeridos para una evaluación nueva (sin pisar lo que el docente ya escribió).
    const key = course.id + '|' + (state.exam.title || '');
    if (isNew && boxState.fieldsFor !== key) {
      boxState.fieldsFor = key;
      const today = L.todayIso();
      $('#proBookTitle').value = state.exam.title || 'Prueba';
      $('#proBookDate').value = today;
      $('#proBookPeriod').innerHTML = periodOptions(course, L.periodForDate(today, course.periods));
      $('#proBookWeight').value = '1';
    } else if (isNew && $('#proBookPeriod').options.length !== course.periods) {
      $('#proBookPeriod').innerHTML = periodOptions(course, L.periodForDate($('#proBookDate').value, course.periods));
    }

    const ev = isNew ? null : course.evaluations.find((e) => e.id === evalId);
    const plan = L.planSave(course, ev, resultEntries());
    const pending = plan.rows.filter((r) => r.status === 'nueva' || r.status === 'cambia').length;
    let status;
    if (!state.exam.key.some((k) => k !== null)) status = '⚠️ Falta la clave de respuestas: sin clave no hay notas que guardar.';
    else if (isNew) status = `${plan.rows.length} nota(s) lista(s) para guardar en ${L.courseLabel(course)}.`;
    else if (!pending) status = `✓ Las notas ya están guardadas en «${ev.title}».`;
    else status = `${pending} nota(s) nueva(s) o distinta(s) sin guardar en «${ev.title}».`;
    if (plan.problems.length) status += ` ${plan.problems.length} hoja(s) no se pueden guardar todavía (revísalas al guardar).`;
    $('#proBookStatus').textContent = status;
    $('#proBookSave').textContent = isNew ? '📚 Guardar notas en el libro' : '📚 Actualizar notas en el libro';
  }

  function listItems(items, max) {
    const shown = items.slice(0, max || 12).map((t) => `<li>${t}</li>`);
    if (items.length > shown.length) shown.push(`<li>… y ${items.length - shown.length} más.</li>`);
    return `<ul>${shown.join('')}</ul>`;
  }

  async function saveToBook() {
    const course = Pro.course(boxState.courseId);
    if (!course) return;
    if (!state.exam.key.some((k) => k !== null)) return app.toast('Falta la clave de respuestas: sin clave no hay notas que guardar.');
    let ev = boxState.evalId !== NEW ? course.evaluations.find((e) => e.id === boxState.evalId) || null : null;
    const plan = L.planSave(course, ev, resultEntries());
    const by = (s) => plan.rows.filter((r) => r.status === s);
    const nuevas = by('nueva');
    const cambian = by('cambia');
    const iguales = by('igual');
    const editadas = by('editada');
    const title = ev ? ev.title : $('#proBookTitle').value.trim() || state.exam.title || 'Prueba';

    let html = `<p>Curso: <b>${esc(L.courseLabel(course))}</b><br>Evaluación: <b>${esc(title)}</b>${ev ? '' : ' (nueva)'}</p><ul>`;
    if (nuevas.length) html += `<li><b>${nuevas.length}</b> nota(s) nueva(s).</li>`;
    if (cambian.length) {
      html += `<li><b>${cambian.length}</b> nota(s) cambian:${listItems(
        cambian.map((r) => `${esc(r.student.name || 'N° ' + r.student.n)}: ${L.fmtGrade(r.before.g)} → ${L.fmtGrade(r.entry.g)}`),
        8
      )}</li>`;
    }
    if (iguales.length) html += `<li>${iguales.length} nota(s) ya estaban guardadas.</li>`;
    if (editadas.length) {
      html += `<li>${editadas.length} nota(s) cambiada(s) a mano en el libro no se tocan: ${editadas
        .map((r) => esc(r.student.name || 'N° ' + r.student.n))
        .join(', ')}.</li>`;
    }
    html += '</ul>';
    if (plan.problems.length) {
      html += `<div class="alert warn"><b>${plan.problems.length} hoja(s) no se pueden guardar:</b>${listItems(
        plan.problems.map((p) => `${esc(p.label)}: ${esc(p.reason)}`)
      )}</div>`;
    }
    if (plan.review) {
      html += `<p class="alert">${plan.review} hoja(s) tienen marcas por revisar. Se guardan igual; si después las corriges, vuelve a guardar las notas.</p>`;
    }
    const toSave = nuevas.length + cambian.length;
    if (!toSave && ev) {
      await Pro.confirm({ title: 'Libro de notas', html: html + '<p>No hay notas nuevas ni cambios que guardar.</p>', ok: 'Entendido', cancel: null });
      return;
    }
    if (!toSave) {
      await Pro.confirm({ title: 'Libro de notas', html: html + '<p>No hay notas que se puedan guardar.</p>', ok: 'Entendido', cancel: null });
      return;
    }
    const ok = await Pro.confirm({ title: 'Guardar en el libro de notas', html, ok: `Guardar ${toSave} nota(s)` });
    if (!ok) return;

    const now = Date.now();
    if (!ev) {
      const date = $('#proBookDate').value || L.todayIso();
      const period = parseInt($('#proBookPeriod').value, 10) || L.periodForDate(date, course.periods);
      ev = {
        id: L.uid(),
        title,
        date,
        period: Math.min(course.periods, Math.max(1, period)),
        weight: parseWeight($('#proBookWeight').value),
        kind: 'escaneada',
        grades: {},
        createdAt: now,
        updatedAt: now,
      };
      course.evaluations.push(ev);
    }
    const e = state.exam;
    ev.source = {
      title: e.title,
      numQuestions: e.numQuestions,
      numChoices: e.numChoices,
      key: e.key.map((k) => (k === null ? '-' : 'ABCDEF'[k])).join(''),
      objectives: app.currentObjectives().objectives.map((o) => ({ name: o.name, questions: o.questions })),
      scoring: Object.assign({}, e.scoring),
    };
    ev.exam = JSON.parse(JSON.stringify(e));
    delete ev.exam.pro;
    L.applySave(ev, plan, now);
    course.updatedAt = now;
    await Pro.saveBook();
    setExamLink(course.id, ev.id);
    boxState.evalId = ev.id;
    Pro.ui.courseId = course.id;
    Pro.saveUi();
    renderBookBox();
    app.toast(`Notas guardadas en el libro de ${L.courseLabel(course)} (${toSave}).`);
  }

  /* ------------------------------------------------------------------ */
  /* Pestaña Cursos                                                      */
  /* ------------------------------------------------------------------ */

  function currentPeriod(course) {
    const p = Pro.ui.period;
    if (p === 'anual' || (Number.isInteger(p) && p >= 1 && p <= course.periods)) return p;
    return L.periodForDate(L.todayIso(), course.periods);
  }

  function renderCursos() {
    const courses = Pro.book.courses;
    $('#proNoCourses').hidden = courses.length > 0;
    $('#proCourseArea').hidden = !courses.length;
    if (!courses.length) return;
    const c = currentCourse();
    Pro.ui.courseId = c.id;
    $('#proCourseSel').innerHTML = courseOptions(c.id);
    $('#proCourseSel').value = c.id;
    const view = ['notas', 'evaluaciones', 'estudiantes'].indexOf(Pro.ui.view) >= 0 ? Pro.ui.view : 'notas';
    for (const b of $$('[data-pro-view]')) b.setAttribute('aria-selected', String(b.dataset.proView === view));
    $('#proViewNotas').hidden = view !== 'notas';
    $('#proViewEvaluaciones').hidden = view !== 'evaluaciones';
    $('#proViewEstudiantes').hidden = view !== 'estudiantes';
    if (view === 'notas') renderNotas(c);
    else if (view === 'evaluaciones') renderEvals(c);
    else renderStudents(c);
  }

  /* ---------- Notas ---------- */

  function sitClass(course, value) {
    const s = L.situation(course, value);
    return s === 'limitrofe' ? ' limitrofe' : s === 'reprobado' ? ' reprobado' : '';
  }

  function renderNotas(c) {
    const period = currentPeriod(c);
    const names = L.periodNames(c.periods);
    $('#proPeriods').innerHTML =
      names.map((n, i) => `<button type="button" data-period="${i + 1}" aria-pressed="${period === i + 1}">${n}</button>`).join('') +
      `<button type="button" data-period="anual" aria-pressed="${period === 'anual'}">Anual</button>`;

    const sum = L.courseSummary(c, period);
    const pass = L.fmtGrade(c.gradePass);
    const limit = L.fmtGrade(L.round1(c.gradePass - 0.1));
    $('#proStats').innerHTML = `
      <div class="stat"><b>${sum.students}</b><span>Estudiantes</span></div>
      <div class="stat"><b>${sum.average === null ? '–' : L.fmtGrade(sum.average)}</b><span>Promedio del curso</span></div>
      <div class="stat${sum.below ? ' bad' : ''}"><b>${sum.below}</b><span>Promedio bajo ${pass}</span></div>
      <div class="stat${sum.borderline ? ' warn' : ''}"><b>${sum.borderline}</b><span>Limítrofes (${limit})</span></div>
      <div class="stat"><b>${sum.pending}</b><span>Notas pendientes</span></div>`;

    const empty = $('#proGridEmpty');
    if (!c.students.length) {
      empty.hidden = false;
      empty.innerHTML = 'El curso no tiene estudiantes. Agrégalos en la vista <b>Estudiantes</b>.';
      $('#proGrid').innerHTML = '';
      return;
    }
    let head = '<th class="c-n">N°</th><th class="c-name">Estudiante</th>';
    let body = '';
    let foot = '';
    if (period === 'anual') {
      empty.hidden = !!c.evaluations.length;
      empty.textContent = 'Aún no hay notas en el libro de este curso.';
      head += names.map((n) => `<th class="avg">${n}</th>`).join('') + '<th class="avg final">Promedio final</th>';
      body = c.students
        .map((s) => {
          const cells = names
            .map((_, i) => {
              const a = L.periodAverage(c, s.id, i + 1);
              return `<td class="avg${sitClass(c, a.value)}">${a.value === null ? '–' : L.fmtGrade(a.value)}</td>`;
            })
            .join('');
          const f = L.finalAverage(c, s.id);
          const sit = L.situation(c, f.value);
          return `<tr${s.retired ? ' class="retired"' : ''}><td class="c-n">${s.n}</td><td class="c-name" title="${esc(s.name)}">${esc(s.name) || '<i>sin nombre</i>'}${
            sit === 'limitrofe' ? '<span class="tag limit">limítrofe</span>' : ''
          }</td>${cells}<td class="avg final${sitClass(c, f.value)}">${f.value === null ? '–' : L.fmtGrade(f.value)}</td></tr>`;
        })
        .join('');
      const avgs = names.map((_, i) => L.courseSummary(c, i + 1).average);
      foot = `<tr><td class="c-n"></td><td class="c-name">Promedio del curso</td>${avgs
        .map((v) => `<td>${v === null ? '–' : L.fmtGrade(v)}</td>`)
        .join('')}<td>${sum.average === null ? '–' : L.fmtGrade(sum.average)}</td></tr>`;
    } else {
      const evs = L.periodEvaluations(c, period);
      const pct = L.weightPercents(c, period);
      empty.hidden = evs.length > 0;
      empty.innerHTML = `Aún no hay notas en el ${esc(names[period - 1])}. Guarda una prueba desde <b>Resultados</b> o agrega una <b>nota manual</b>.`;
      head += evs
        .map((e, i) => {
          const w = L.weightOf(e) === 0 ? 'formativa' : fmtPct(pct[e.id]);
          return `<th class="ev" data-ev="${esc(e.id)}" title="${esc(e.title)} · ${esc(L.fmtDate(e.date))} · ${w}"><b>N${i + 1}</b><span>${esc(e.title)}</span><small>${esc(
            L.fmtDate(e.date).slice(0, 5)
          )} · ${w}</small></th>`;
        })
        .join('');
      head += '<th class="avg">Promedio</th>';
      body = c.students
        .map((s) => {
          const cells = evs
            .map((e) => {
              const en = e.grades[s.id];
              if (!en) return `<td class="g empty" data-s="${esc(s.id)}" data-e="${esc(e.id)}" tabindex="0">–</td>`;
              const cls = 'g' + (en.g < c.gradePass - 1e-9 ? ' fail' : '') + (en.edited ? ' edited' : '');
              const title = en.edited && typeof en.orig === 'number' ? ` title="Cambiada a mano (en la hoja: ${L.fmtGrade(en.orig)})"` : en.edited ? ' title="Escrita a mano"' : '';
              return `<td class="${cls}" data-s="${esc(s.id)}" data-e="${esc(e.id)}" tabindex="0"${title}>${L.fmtGrade(en.g)}</td>`;
            })
            .join('');
          const a = L.periodAverage(c, s.id, period);
          const sit = L.situation(c, a.value);
          const pend = a.pending ? ` title="${a.pending} nota(s) pendiente(s)"` : '';
          return `<tr${s.retired ? ' class="retired"' : ''}><td class="c-n">${s.n}</td><td class="c-name" title="${esc(s.name)}">${esc(s.name) || '<i>sin nombre</i>'}${
            s.retired ? '<span class="tag">retirado</span>' : ''
          }${sit === 'limitrofe' ? '<span class="tag limit">limítrofe</span>' : ''}</td>${cells}<td class="avg${sitClass(c, a.value)}"${pend}>${
            a.value === null ? '–' : L.fmtGrade(a.value)
          }</td></tr>`;
        })
        .join('');
      foot = `<tr><td class="c-n"></td><td class="c-name">Promedio</td>${evs
        .map((e) => {
          const s = L.evaluationSummary(c, e);
          return `<td>${s.average === null ? '–' : L.fmtGrade(s.average)}</td>`;
        })
        .join('')}<td>${sum.average === null ? '–' : L.fmtGrade(sum.average)}</td></tr>`;
    }
    $('#proGrid').innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot>${foot}</tfoot>`;
    $('#proGridHelp').hidden = period === 'anual';
  }

  // Edición de una nota en la grilla.
  function startEdit(td) {
    const c = currentCourse();
    const ev = c && c.evaluations.find((e) => e.id === td.dataset.e);
    if (!ev) return;
    const sid = td.dataset.s;
    const en = ev.grades[sid];
    td.innerHTML = `<input type="text" inputmode="decimal" autocomplete="off" aria-label="Nota" value="${en ? L.fmtGrade(en.g) : ''}">`;
    const input = td.querySelector('input');
    input.focus();
    input.select();
    let done = false;
    const finish = (commit, move) => {
      if (done) return;
      if (commit) {
        const r = L.parseGrade(input.value, c);
        if (r.error) {
          app.toast(r.error);
          if (move) {
            input.focus();
            input.select();
            return;
          }
        } else if ((en ? en.g : null) !== r.value) {
          L.setGrade(ev, sid, r.value);
          c.updatedAt = Date.now();
          Pro.saveBook();
        }
      }
      done = true;
      renderNotas(c);
      if (move) {
        const order = c.students.map((s) => s.id);
        const evs = L.periodEvaluations(c, ev.period).map((e) => e.id);
        let si = order.indexOf(sid);
        let ei = evs.indexOf(ev.id);
        if (move === 'down') si++;
        else if (move === 'up') si--;
        else if (move === 'right') ei++;
        else if (move === 'left') ei--;
        const next = si >= 0 && si < order.length && ei >= 0 && ei < evs.length ? $(`#proGrid td.g[data-s="${order[si]}"][data-e="${evs[ei]}"]`) : null;
        if (next) startEdit(next);
      }
    };
    input.addEventListener('keydown', (k) => {
      if (k.key === 'Enter') {
        k.preventDefault();
        finish(true, 'down');
      } else if (k.key === 'Escape') {
        k.preventDefault();
        finish(false);
      } else if (k.key === 'Tab') {
        k.preventDefault();
        finish(true, k.shiftKey ? 'left' : 'right');
      } else if (k.key === 'ArrowDown' || k.key === 'ArrowUp') {
        k.preventDefault();
        finish(true, k.key === 'ArrowDown' ? 'down' : 'up');
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  async function copyAverages() {
    const c = currentCourse();
    if (!c) return;
    const period = currentPeriod(c);
    const valueOf = (s) => (period === 'anual' ? L.finalAverage(c, s.id) : L.periodAverage(c, s.id, period)).value;
    const text = L.columnText(c, valueOf);
    const label = period === 'anual' ? 'promedios finales' : `promedios del ${L.periodNames(c.periods)[period - 1]}`;
    if (await Pro.copyText(text)) app.toast(`Se copiaron los ${label} en orden de lista. Pégalos en el libro digital, en la casilla del N° 1.`);
    else app.toast('No se pudo copiar: usa el Excel del curso.');
  }

  /* ---------- Excel del curso ---------- */

  function exportExcel() {
    const c = currentCourse();
    if (!c || !window.Xlsx) return;
    const names = L.periodNames(c.periods);
    const gradeCell = (v) => (v === null || v === undefined ? null : { v, s: v < c.gradePass - 1e-9 ? 'bad' : 'dec1' });
    const avgCell = (v) => {
      if (v === null || v === undefined) return null;
      const s = L.situation(c, v);
      return { v, s: s === 'limitrofe' ? 'lvlML' : s === 'reprobado' ? 'lvlNL' : 'dec1' };
    };
    const header = ['N°', 'Estudiante', 'RUT'];
    const cols = [6, 34, 14];
    const perPeriod = [];
    for (let p = 1; p <= c.periods; p++) {
      const evs = L.periodEvaluations(c, p);
      const pct = L.weightPercents(c, p);
      perPeriod.push(evs);
      for (const e of evs) {
        header.push(`${e.title} (${L.fmtDate(e.date)}${L.weightOf(e) === 0 ? ', formativa' : `, ${fmtPct(pct[e.id])}`})`);
        cols.push(14);
      }
      header.push(`Promedio ${names[p - 1]}`);
      cols.push(14);
    }
    header.push('Promedio final', 'Situación');
    cols.push(14, 14);
    const SIT = { aprobado: 'Aprobado', limitrofe: 'Limítrofe', reprobado: 'Reprobado' };
    const rows = [
      [{ v: `Libro de notas · ${L.courseLabel(c)} · ${c.year}`, s: 'title' }],
      [{ v: `Exportado el ${L.fmtDate(L.todayIso())}. Promedios ${c.rounding === 'trunc' ? 'truncados' : 'aproximados'} a un decimal.`, s: 'muted' }],
      [],
      header.map((h) => ({ v: h, s: 'header' })),
    ];
    for (const s of c.students) {
      const row = [s.n, s.name + (s.retired ? ' (retirado)' : ''), s.rut || null];
      perPeriod.forEach((evs, i) => {
        for (const e of evs) row.push(gradeCell(e.grades[s.id] ? e.grades[s.id].g : null));
        row.push(avgCell(L.periodAverage(c, s.id, i + 1).value));
      });
      const f = L.finalAverage(c, s.id).value;
      row.push(avgCell(f), f === null ? 'Sin notas' : SIT[L.situation(c, f)]);
      rows.push(row);
    }
    const foot = [null, { v: 'Promedio del curso', s: 'bold' }, null];
    perPeriod.forEach((evs, i) => {
      for (const e of evs) foot.push(gradeCell(L.evaluationSummary(c, e).average));
      foot.push(avgCell(L.courseSummary(c, i + 1).average));
    });
    foot.push(avgCell(L.courseSummary(c, 'anual').average));
    rows.push(foot);

    const evRows = [
      ['N°', 'Evaluación', 'Tipo', 'Fecha', 'Periodo', 'Ponderación', '% del periodo', 'Notas', 'Promedio', '% aprobación'].map((h) => ({ v: h, s: 'header' })),
    ];
    perPeriod.forEach((evs, i) => {
      const pct = L.weightPercents(c, i + 1);
      evs.forEach((e, j) => {
        const s = L.evaluationSummary(c, e);
        evRows.push([
          `N${j + 1}`,
          e.title,
          e.kind === 'escaneada' ? 'Prueba escaneada' : 'Nota manual',
          L.fmtDate(e.date),
          names[i],
          e.weight,
          L.weightOf(e) === 0 ? 'formativa' : Math.round(pct[e.id] * 10) / 10,
          s.count,
          gradeCell(s.average),
          s.passPct,
        ]);
      });
    });
    const bytes = window.Xlsx.build([
      { name: 'Notas', rows, cols, freeze: { row: 4, col: 2 } },
      { name: 'Evaluaciones', rows: evRows, cols: [6, 34, 18, 12, 14, 12, 13, 8, 10, 13], freeze: { row: 1 } },
    ]);
    app.download(
      `libro-de-notas_${app.slug(L.courseLabel(c))}_${L.todayIso()}.xlsx`,
      new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    );
  }

  /* ---------- Evaluaciones ---------- */

  function renderEvals(c) {
    const names = L.periodNames(c.periods);
    let html = '<thead><tr><th>N°</th><th>Evaluación</th><th>Fecha</th><th>Ponderación</th><th class="num">% del periodo</th><th class="num">Notas</th><th class="num">Promedio</th><th></th></tr></thead><tbody>';
    for (let p = 1; p <= c.periods; p++) {
      const evs = L.periodEvaluations(c, p);
      const pct = L.weightPercents(c, p);
      html += `<tr class="group"><th colspan="8">${names[p - 1]}</th></tr>`;
      if (!evs.length) html += '<tr><td colspan="8" class="muted small">Sin evaluaciones.</td></tr>';
      evs.forEach((e, i) => {
        const s = L.evaluationSummary(c, e);
        html += `<tr data-ev="${esc(e.id)}">
          <td><b>N${i + 1}</b></td>
          <td class="ev-title">${esc(e.title)}<div class="kind">${e.kind === 'escaneada' ? '📷 Prueba escaneada' : '✍️ Nota manual'}</div></td>
          <td>${esc(L.fmtDate(e.date))}</td>
          <td><input type="number" min="0" step="any" inputmode="decimal" data-weight value="${e.weight}" aria-label="Ponderación de ${esc(e.title)}"></td>
          <td class="num">${L.weightOf(e) === 0 ? 'formativa' : fmtPct(pct[e.id])}</td>
          <td class="num">${s.count}</td>
          <td class="num">${s.average === null ? '–' : L.fmtGrade(s.average)}</td>
          <td><button type="button" class="btn ghost small" data-open-ev>Abrir</button></td>
        </tr>`;
      });
    }
    html += '</tbody>';
    $('#proEvals').innerHTML = html;
  }

  /* ---------- Estudiantes ---------- */

  function renderStudents(c) {
    const rows = c.students
      .map(
        (s) => `<tr data-s="${esc(s.id)}"${s.retired ? ' class="retired"' : ''}>
        <td><input class="n" type="number" min="1" max="999" step="1" value="${s.n}" data-f="n" aria-label="N° de lista"></td>
        <td><input class="name" type="text" maxlength="120" value="${esc(s.name)}" data-f="name" aria-label="Nombre"></td>
        <td><input class="rut" type="text" maxlength="14" value="${esc(s.rut)}" data-f="rut" placeholder="12.345.678-9" aria-label="RUT"></td>
        <td class="center"><input type="checkbox" data-f="retired"${s.retired ? ' checked' : ''} aria-label="Retirado"></td>
        <td><button type="button" class="btn ghost small danger" data-del title="Eliminar de la lista" aria-label="Eliminar">✕</button></td>
      </tr>`
      )
      .join('');
    $('#proStudents').innerHTML = `<thead><tr><th>N°</th><th>Nombre</th><th>RUT (opcional)</th><th class="center">Retirado</th><th></th></tr></thead><tbody>${
      rows || '<tr><td colspan="5" class="muted small">Sin estudiantes: agrega uno o pega la lista.</td></tr>'
    }</tbody>`;
  }

  function studentsChanged(c) {
    c.students.sort((a, b) => a.n - b.n);
    c.updatedAt = Date.now();
    Pro.saveBook();
    syncRosterFromCourse();
    renderExamLink();
  }

  function onStudentChange(e) {
    const c = currentCourse();
    const tr = e.target.closest('tr[data-s]');
    if (!c || !tr) return;
    const s = c.students.find((x) => x.id === tr.dataset.s);
    if (!s) return;
    const f = e.target.dataset.f;
    if (f === 'n') {
      const n = parseInt(e.target.value, 10);
      if (!(n >= 1 && n <= 999)) {
        e.target.value = s.n;
        return app.toast('El N° de lista debe ser un número entre 1 y 999.');
      }
      const other = c.students.find((x) => x.n === n && x.id !== s.id);
      if (other) {
        e.target.value = s.n;
        return app.toast(`Ya hay un estudiante con el N° ${n} (${other.name}).`);
      }
      s.n = n;
      studentsChanged(c);
      renderStudents(c);
    } else if (f === 'name') {
      s.name = e.target.value.trim();
      studentsChanged(c);
    } else if (f === 'rut') {
      const t = e.target.value.trim();
      const r = t ? L.normalizeRut(t) : null;
      if (t && !r) app.toast('El RUT no tiene el formato 12.345.678-9: se guardó tal como está.');
      else if (r && !r.valid) app.toast(`Revisa el RUT ${r.rut}: el dígito verificador no coincide.`);
      s.rut = r ? r.rut : t;
      e.target.value = s.rut;
      studentsChanged(c);
    } else if (f === 'retired') {
      s.retired = e.target.checked;
      tr.classList.toggle('retired', s.retired);
      studentsChanged(c);
    }
  }

  async function deleteStudent(id) {
    const c = currentCourse();
    const s = c && c.students.find((x) => x.id === id);
    if (!s) return;
    const n = studentsWithGrades(c, s.id);
    const ok = await Pro.confirm({
      title: 'Eliminar estudiante',
      html: n
        ? `<p><b>${esc(s.name || 'N° ' + s.n)}</b> tiene ${n} nota(s) en el libro, que también se borrarán.</p><p>Si se retiró del curso, es mejor marcarlo como <b>retirado</b>: conserva sus notas y la numeración.</p>`
        : `<p>¿Eliminar a <b>${esc(s.name || 'N° ' + s.n)}</b> de la lista?</p>`,
      ok: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    c.students = c.students.filter((x) => x.id !== id);
    for (const ev of c.evaluations) delete ev.grades[id];
    studentsChanged(c);
    renderStudents(c);
  }

  function addStudent() {
    const c = currentCourse();
    if (!c) return;
    const n = c.students.reduce((m, s) => Math.max(m, s.n), 0) + 1;
    const s = { id: L.uid(), n, name: '', rut: '', retired: false };
    c.students.push(s);
    studentsChanged(c);
    renderStudents(c);
    const input = $(`#proStudents tr[data-s="${s.id}"] input.name`);
    if (input) input.focus();
  }

  /** Agrega estudiantes pegados; los N° escritos se respetan si están libres. */
  function addParsedStudents(c, parsed) {
    let added = 0;
    const skipped = [];
    let next = c.students.reduce((m, s) => Math.max(m, s.n), 0) + 1;
    for (const p of parsed) {
      const same = c.students.find((s) => L.normName(s.name) === L.normName(p.name));
      if (same) {
        if (p.rut && !same.rut) same.rut = p.rut;
        skipped.push(p.name);
        continue;
      }
      let n = p.explicit && !c.students.some((s) => s.n === p.n) ? p.n : next;
      if (n >= next) next = n + 1;
      c.students.push({ id: L.uid(), n, name: p.name, rut: p.rut || '', retired: false });
      added++;
    }
    return { added, skipped };
  }

  /* ------------------------------------------------------------------ */
  /* Diálogo: curso                                                      */
  /* ------------------------------------------------------------------ */

  let courseDlg = { id: null, linkExam: false };

  function openCourseDialog(courseId, opts) {
    const c = Pro.course(courseId);
    courseDlg = { id: c ? c.id : null, linkExam: !!(opts && opts.linkExam) };
    const sc = state.exam.scoring;
    $('#proCourseTitle').textContent = c ? 'Datos del curso' : 'Nuevo curso';
    $('#pcName').value = c ? c.name : '';
    $('#pcSubject').value = c ? c.subject : '';
    $('#pcYear').value = c ? c.year : new Date().getFullYear();
    $('#pcPeriods').value = String(c ? c.periods : 2);
    $('#pcMin').value = c ? c.gradeMin : sc.gradeMin;
    $('#pcPass').value = c ? c.gradePass : sc.gradePass;
    $('#pcMax').value = c ? c.gradeMax : sc.gradeMax;
    $('#pcRounding').value = c ? c.rounding : 'round';
    $('#pcListWrap').hidden = !!c;
    $('#pcEditNote').hidden = !c;
    $('#pcDelete').hidden = !c;
    const roster = state.exam.roster.trim();
    $('#pcList').value = !c && courseDlg.linkExam && roster ? state.exam.roster : '';
    $('#pcUseExamRoster').hidden = !!c || !roster || !!$('#pcList').value;
    updateCourseListInfo();
    const dlg = $('#proCourseDialog');
    if (!dlg.open) dlg.showModal();
    setTimeout(() => $('#pcName').focus(), 30);
  }

  function updateCourseListInfo() {
    const text = $('#pcList').value;
    const info = $('#pcListInfo');
    if (!text.trim()) {
      info.textContent = 'También puedes agregar la lista después, en la vista Estudiantes.';
      return;
    }
    const r = L.parseRosterText(text);
    const first = r.students.slice(0, 3).map((s) => `${s.n}. ${s.name}`).join(' · ');
    info.innerHTML = `${r.students.length} estudiante(s): ${esc(first)}${r.students.length > 3 ? ' …' : ''}${
      r.warnings.length ? `<br><span class="grade-fail">${r.warnings.map(esc).join('<br>')}</span>` : ''
    }`;
  }

  function readScale() {
    const n = (id, def) => {
      const v = parseFloat(String($(id).value).replace(',', '.'));
      return Number.isFinite(v) ? v : def;
    };
    const min = n('#pcMin', 1);
    const pass = n('#pcPass', 4);
    const max = n('#pcMax', 7);
    if (!(min < pass && pass <= max)) return null;
    return { gradeMin: min, gradePass: pass, gradeMax: max };
  }

  async function saveCourseDialog() {
    const name = $('#pcName').value.trim();
    if (!name) {
      app.toast('Escribe el nombre del curso (por ejemplo 8° Básico A).');
      return $('#pcName').focus();
    }
    const scale = readScale();
    if (!scale) return app.toast('Revisa la escala: la nota mínima debe ser menor que la de aprobación, y ésta no mayor que la máxima.');
    const fields = Object.assign(
      {
        name,
        subject: $('#pcSubject').value.trim(),
        year: parseInt($('#pcYear').value, 10) || new Date().getFullYear(),
        periods: $('#pcPeriods').value === '3' ? 3 : 2,
        rounding: $('#pcRounding').value === 'trunc' ? 'trunc' : 'round',
      },
      scale
    );
    let c = Pro.course(courseDlg.id);
    if (c) {
      const moved = c.evaluations.filter((e) => e.period > fields.periods);
      Object.assign(c, fields);
      for (const e of moved) e.period = fields.periods;
      c.updatedAt = Date.now();
      if (moved.length) app.toast(`${moved.length} evaluación(es) del 3° trimestre pasaron al 2° semestre.`);
    } else {
      c = L.newCourse(fields);
      const parsed = L.parseRosterText($('#pcList').value).students;
      addParsedStudents(c, parsed);
      c.students.sort((a, b) => a.n - b.n);
      Pro.book.courses.push(c);
      Pro.ui.courseId = c.id;
      Pro.saveUi();
      if (courseDlg.linkExam) {
        setExamLink(c.id, null);
        boxState.courseId = c.id;
        boxState.evalId = null;
      }
    }
    await Pro.saveBook();
    $('#proCourseDialog').close();
    syncRosterFromCourse();
    renderAll();
    app.toast(courseDlg.id ? 'Datos del curso guardados.' : `Curso ${L.courseLabel(c)} creado con ${c.students.length} estudiante(s).`);
  }

  async function deleteCourse() {
    const c = Pro.course(courseDlg.id);
    if (!c) return;
    const nGrades = c.evaluations.reduce((s, e) => s + Object.keys(e.grades).length, 0);
    const ok = await Pro.confirm({
      title: 'Eliminar curso',
      html: `<p>¿Eliminar <b>${esc(L.courseLabel(c))}</b> con sus ${c.students.length} estudiante(s), ${c.evaluations.length} evaluación(es) y ${nGrades} nota(s)?</p><p>No se puede deshacer (salvo que tengas un respaldo).</p>`,
      ok: 'Eliminar el curso',
      danger: true,
    });
    if (!ok) return;
    Pro.book.courses = Pro.book.courses.filter((x) => x.id !== c.id);
    if (examLink().courseId === c.id) setExamLink(null, null);
    if (Pro.ui.courseId === c.id) Pro.ui.courseId = null;
    Pro.saveUi();
    await Pro.saveBook();
    $('#proCourseDialog').close();
    renderAll();
    app.toast('Curso eliminado.');
  }

  /* ------------------------------------------------------------------ */
  /* Diálogo: evaluación (nota manual o datos de una prueba)             */
  /* ------------------------------------------------------------------ */

  let evalDlg = { courseId: null, evalId: null };

  function openEvalDialog(evalId) {
    const c = currentCourse();
    if (!c) return;
    const ev = evalId ? c.evaluations.find((e) => e.id === evalId) : null;
    if (!ev && !c.students.length) {
      app.toast('Primero agrega la lista de estudiantes del curso.');
      Pro.ui.view = 'estudiantes';
      Pro.saveUi();
      return renderCursos();
    }
    evalDlg = { courseId: c.id, evalId: ev ? ev.id : null };
    $('#proEvalTitle').textContent = ev ? (ev.kind === 'escaneada' ? 'Prueba escaneada' : 'Evaluación') : 'Nueva nota manual';
    $('#peTitle').value = ev ? ev.title : '';
    const date = ev ? ev.date : L.todayIso();
    $('#peDate').value = date;
    const p = Pro.ui.period;
    const period = ev ? ev.period : Number.isInteger(p) && p <= c.periods ? p : L.periodForDate(date, c.periods);
    $('#pePeriod').innerHTML = periodOptions(c, period);
    $('#peWeight').value = ev ? ev.weight : 1;
    const info = $('#peInfo');
    if (ev && ev.kind === 'escaneada') {
      const s = L.evaluationSummary(c, ev);
      info.hidden = false;
      info.textContent = `Guardada desde Resultados${ev.source ? ` · ${ev.source.numQuestions} preguntas` : ''} · ${s.count} nota(s) · promedio ${
        s.average === null ? '–' : L.fmtGrade(s.average)
      }${ev.savedAt ? ` · última vez: ${app.fmtDateTime(ev.savedAt)}` : ''}.`;
    } else info.hidden = true;
    $('#peReuse').hidden = !(ev && ev.exam);
    $('#peDelete').hidden = !ev;
    $('#peCopy').hidden = !ev;
    $('#pePasteBox').hidden = true;
    $('#pePaste').value = '';
    $('#peError').hidden = true;
    $('#peGrades').innerHTML = `<thead><tr><th class="num">N°</th><th>Estudiante</th><th>Nota</th></tr></thead><tbody>${c.students
      .map((s) => {
        const en = ev ? ev.grades[s.id] : null;
        const orig = en && en.edited && typeof en.orig === 'number' ? `<span class="orig">hoja: ${L.fmtGrade(en.orig)}</span>` : '';
        return `<tr${s.retired ? ' class="retired"' : ''}><td class="num">${s.n}</td><td>${esc(s.name)}</td><td><input type="text" inputmode="decimal" autocomplete="off" data-s="${esc(
          s.id
        )}" value="${en ? L.fmtGrade(en.g) : ''}" aria-label="Nota de ${esc(s.name)}">${orig}</td></tr>`;
      })
      .join('')}</tbody>`;
    updateWeightInfo();
    const dlg = $('#proEvalDialog');
    if (!dlg.open) dlg.showModal();
    setTimeout(() => (ev ? $('#peWeight') : $('#peTitle')).focus(), 30);
  }

  function updateWeightInfo() {
    const c = Pro.course(evalDlg.courseId);
    if (!c) return;
    const w = parseWeight($('#peWeight').value);
    const period = parseInt($('#pePeriod').value, 10);
    const others = c.evaluations.filter((e) => e.period === period && e.id !== evalDlg.evalId).reduce((s, e) => s + L.weightOf(e), 0);
    $('#peWeightInfo').textContent =
      w === 0 ? 'No se promedia (formativa).' : `Pesa el ${fmtPct((w / (w + others)) * 100)} del promedio del ${L.periodNames(c.periods)[period - 1]}.`;
  }

  function validateGradeInput(input, c) {
    const r = L.parseGrade(input.value, c);
    input.classList.toggle('bad', !!r.error);
    input.title = r.error || '';
    return r;
  }

  function applyPastedGrades() {
    const c = Pro.course(evalDlg.courseId);
    if (!c) return;
    const lines = $('#pePaste').value.replace(/\s+$/, '').split(/\r?\n/);
    let filled = 0;
    lines.forEach((line, i) => {
      const s = L.studentByN(c, i + 1);
      if (!s) return;
      // Si se pegan varias columnas (nombre y nota), se toma el último número de la línea.
      const m = line.match(/(\d+(?:[.,]\d+)?)\s*$/);
      const input = $(`#peGrades input[data-s="${s.id}"]`);
      if (!input) return;
      input.value = m ? m[1].replace('.', ',') : '';
      validateGradeInput(input, c);
      if (m) filled++;
    });
    $('#pePasteBox').hidden = true;
    app.toast(`Se pusieron ${filled} nota(s) (la línea 1 es el N° de lista 1). Revísalas y presiona Guardar.`);
  }

  async function saveEvalDialog() {
    const c = Pro.course(evalDlg.courseId);
    if (!c) return;
    let bad = 0;
    const values = [];
    for (const input of $$('#peGrades input[data-s]')) {
      const r = validateGradeInput(input, c);
      if (r.error) bad++;
      else values.push([input.dataset.s, r.value]);
    }
    if (bad) {
      $('#peError').hidden = false;
      $('#peError').textContent = `Revisa las ${bad} nota(s) marcadas en rojo (deben estar entre ${L.fmtGrade(c.gradeMin)} y ${L.fmtGrade(c.gradeMax)}).`;
      return;
    }
    const now = Date.now();
    let ev = c.evaluations.find((e) => e.id === evalDlg.evalId);
    if (!ev) {
      ev = { id: L.uid(), title: '', date: L.todayIso(), period: 1, weight: 1, kind: 'manual', grades: {}, createdAt: now, updatedAt: now };
      c.evaluations.push(ev);
    }
    ev.title = $('#peTitle').value.trim() || (ev.kind === 'manual' ? 'Nota manual' : ev.title || 'Prueba');
    ev.date = $('#peDate').value || ev.date;
    ev.period = Math.min(c.periods, Math.max(1, parseInt($('#pePeriod').value, 10) || 1));
    ev.weight = parseWeight($('#peWeight').value);
    for (const [sid, v] of values) {
      const before = ev.grades[sid] ? ev.grades[sid].g : null;
      if (before !== v) L.setGrade(ev, sid, v, now);
    }
    ev.updatedAt = now;
    c.updatedAt = now;
    await Pro.saveBook();
    $('#proEvalDialog').close();
    Pro.ui.period = ev.period;
    Pro.saveUi();
    renderAll();
    app.toast(`«${ev.title}» guardada.`);
  }

  async function deleteEval() {
    const c = Pro.course(evalDlg.courseId);
    const ev = c && c.evaluations.find((e) => e.id === evalDlg.evalId);
    if (!ev) return;
    const n = Object.keys(ev.grades).length;
    const ok = await Pro.confirm({
      title: 'Eliminar evaluación',
      html: `<p>¿Eliminar <b>${esc(ev.title)}</b> y sus ${n} nota(s) del libro?</p>`,
      ok: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    c.evaluations = c.evaluations.filter((e) => e.id !== ev.id);
    c.updatedAt = Date.now();
    if (examLink().evalId === ev.id) setExamLink(examLink().courseId, null);
    if (boxState.evalId === ev.id) boxState.evalId = null;
    await Pro.saveBook();
    $('#proEvalDialog').close();
    renderAll();
    app.toast('Evaluación eliminada.');
  }

  async function copyEvalGrades() {
    const c = Pro.course(evalDlg.courseId);
    const ev = c && c.evaluations.find((e) => e.id === evalDlg.evalId);
    if (!ev) return;
    const text = L.columnText(c, (s) => (ev.grades[s.id] ? ev.grades[s.id].g : null));
    if (await Pro.copyText(text)) app.toast('Notas copiadas en orden de lista. Pégalas en el libro digital, en la casilla del N° 1.');
    else app.toast('No se pudo copiar: usa el Excel del curso.');
  }

  async function reuseExam() {
    const c = Pro.course(evalDlg.courseId);
    const ev = c && c.evaluations.find((e) => e.id === evalDlg.evalId);
    if (!ev || !ev.exam) return;
    $('#proEvalDialog').close();
    const n = state.results.length;
    const ok = await Pro.confirm({
      title: 'Usar esta prueba de nuevo',
      html: `<p>Se cargará la prueba <b>${esc(ev.title)}</b> (su clave y configuración) para escanear hojas atrasadas. Al guardarlas en el libro se agregan a esta misma evaluación.</p>${
        n ? `<p class="alert warn">La prueba actual y sus ${n} hoja(s) escaneada(s) se reemplazarán. Si las necesitas, descarga antes las evidencias.</p>` : ''
      }`,
      ok: 'Cargar la prueba',
    });
    if (!ok) return;
    app.replaceExam(Object.assign({}, ev.exam, { pro: { courseId: c.id, evalId: ev.id } }));
    boxState.courseId = c.id;
    boxState.evalId = ev.id;
    syncRosterFromCourse();
    renderAll();
    app.showTab('escanear');
    app.toast(`Prueba «${ev.title}» cargada: escanea las hojas y guárdalas en el libro desde Resultados.`);
  }

  /* ------------------------------------------------------------------ */
  /* Diálogo: pegar lista                                                */
  /* ------------------------------------------------------------------ */

  function updatePasteInfo() {
    const r = L.parseRosterText($('#ppText').value);
    $('#ppInfo').innerHTML = r.students.length
      ? `${r.students.length} estudiante(s): ${esc(
          r.students
            .slice(0, 4)
            .map((s) => `${s.n}. ${s.name}`)
            .join(' · ')
        )}${r.students.length > 4 ? ' …' : ''}${r.warnings.length ? `<br><span class="grade-fail">${r.warnings.map(esc).join('<br>')}</span>` : ''}`
      : '';
  }

  async function applyPaste() {
    const c = currentCourse();
    if (!c) return;
    const parsed = L.parseRosterText($('#ppText').value).students;
    if (!parsed.length) return app.toast('Pega al menos un nombre.');
    const { added, skipped } = addParsedStudents(c, parsed);
    studentsChanged(c);
    $('#proPasteDialog').close();
    renderStudents(c);
    app.toast(`${added} estudiante(s) agregado(s)${skipped.length ? `; ${skipped.length} ya estaban en la lista` : ''}.`);
  }

  /* ------------------------------------------------------------------ */
  /* Eventos                                                             */
  /* ------------------------------------------------------------------ */

  function bind() {
    // Pestaña Prueba.
    $('#proExamCourse').addEventListener('change', onExamCourseChange);

    // Resultados.
    $('#proBookCourse').addEventListener('change', (e) => {
      boxState.courseId = e.target.value;
      boxState.evalId = null;
      boxState.fieldsFor = '';
      renderBookBox();
    });
    $('#proBookEval').addEventListener('change', (e) => {
      boxState.evalId = e.target.value;
      renderBookBox();
    });
    $('#proBookDate').addEventListener('change', () => {
      const c = Pro.course(boxState.courseId);
      if (c) $('#proBookPeriod').value = String(L.periodForDate($('#proBookDate').value, c.periods));
    });
    $('#proBookSave').addEventListener('click', saveToBook);
    $('#proBookOpen').addEventListener('click', () => {
      const c = Pro.course(boxState.courseId);
      if (c) Pro.ui.courseId = c.id;
      Pro.ui.view = 'notas';
      Pro.saveUi();
      app.showTab('cursos');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('#proBookCreateCourse').addEventListener('click', () => openCourseDialog(null, { linkExam: true }));

    // Pestaña Cursos.
    for (const b of $$('[data-pro-new-course]')) b.addEventListener('click', () => openCourseDialog(null, { linkExam: !linkedCourse() }));
    $('#proCourseSel').addEventListener('change', (e) => {
      Pro.ui.courseId = e.target.value;
      Pro.saveUi();
      renderCursos();
    });
    $('#proEditCourse').addEventListener('click', () => {
      const c = currentCourse();
      if (c) openCourseDialog(c.id);
    });
    for (const b of $$('[data-pro-view]')) {
      b.addEventListener('click', () => {
        Pro.ui.view = b.dataset.proView;
        Pro.saveUi();
        renderCursos();
      });
    }
    $('#proPeriods').addEventListener('click', (e) => {
      const b = e.target.closest('[data-period]');
      if (!b) return;
      Pro.ui.period = b.dataset.period === 'anual' ? 'anual' : parseInt(b.dataset.period, 10);
      Pro.saveUi();
      renderNotas(currentCourse());
    });
    $('#proGrid').addEventListener('click', (e) => {
      const th = e.target.closest('th.ev');
      if (th) return openEvalDialog(th.dataset.ev);
      const td = e.target.closest('td.g');
      if (td && !td.querySelector('input')) startEdit(td);
    });
    $('#proGrid').addEventListener('keydown', (e) => {
      const td = e.target.closest('td.g');
      if (td && e.target === td && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        startEdit(td);
      }
    });
    $('#proAddManual').addEventListener('click', () => openEvalDialog(null));
    for (const b of $$('[data-pro-add-manual]')) b.addEventListener('click', () => openEvalDialog(null));
    $('#proCopyAverages').addEventListener('click', copyAverages);
    $('#proExcel').addEventListener('click', exportExcel);

    $('#proEvals').addEventListener('change', (e) => {
      if (!e.target.matches('[data-weight]')) return;
      const c = currentCourse();
      const ev = c && c.evaluations.find((x) => x.id === e.target.closest('tr').dataset.ev);
      if (!ev) return;
      ev.weight = parseWeight(e.target.value);
      ev.updatedAt = c.updatedAt = Date.now();
      Pro.saveBook();
      renderEvals(c);
    });
    $('#proEvals').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-ev]');
      if (!tr || e.target.closest('input')) return;
      openEvalDialog(tr.dataset.ev);
    });

    $('#proStudents').addEventListener('change', onStudentChange);
    $('#proStudents').addEventListener('click', (e) => {
      const b = e.target.closest('[data-del]');
      if (b) deleteStudent(b.closest('tr').dataset.s);
    });
    $('#proAddStudent').addEventListener('click', addStudent);
    $('#proPasteStudents').addEventListener('click', () => {
      $('#ppText').value = '';
      updatePasteInfo();
      $('#proPasteDialog').showModal();
      setTimeout(() => $('#ppText').focus(), 30);
    });
    $('#ppText').addEventListener('input', updatePasteInfo);
    $('#ppApply').addEventListener('click', applyPaste);

    // Diálogo del curso.
    $('#pcList').addEventListener('input', () => {
      updateCourseListInfo();
      $('#pcUseExamRoster').hidden = true;
    });
    $('#pcUseExamRoster').addEventListener('click', () => {
      $('#pcList').value = state.exam.roster;
      $('#pcUseExamRoster').hidden = true;
      updateCourseListInfo();
    });
    $('#pcSave').addEventListener('click', saveCourseDialog);
    $('#pcDelete').addEventListener('click', deleteCourse);

    // Diálogo de la evaluación.
    $('#peWeight').addEventListener('input', updateWeightInfo);
    $('#pePeriod').addEventListener('change', updateWeightInfo);
    $('#peDate').addEventListener('change', () => {
      const c = Pro.course(evalDlg.courseId);
      if (c && !evalDlg.evalId) {
        $('#pePeriod').value = String(L.periodForDate($('#peDate').value, c.periods));
        updateWeightInfo();
      }
    });
    $('#peGrades').addEventListener('input', (e) => {
      const c = Pro.course(evalDlg.courseId);
      if (c && e.target.matches('input[data-s]')) validateGradeInput(e.target, c);
    });
    $('#peGrades').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.matches('input[data-s]')) return;
      e.preventDefault();
      const all = $$('#peGrades input[data-s]');
      const next = all[all.indexOf(e.target) + 1];
      if (next) {
        next.focus();
        next.select();
      } else $('#peSave').focus();
    });
    $('#pePasteToggle').addEventListener('click', () => {
      $('#pePasteBox').hidden = !$('#pePasteBox').hidden;
      if (!$('#pePasteBox').hidden) $('#pePaste').focus();
    });
    $('#pePasteApply').addEventListener('click', applyPastedGrades);
    $('#peSave').addEventListener('click', saveEvalDialog);
    $('#peDelete').addEventListener('click', deleteEval);
    $('#peCopy').addEventListener('click', copyEvalGrades);
    $('#peReuse').addEventListener('click', reuseExam);

    // Avisos de la aplicación.
    app.on('results', renderBookBox);
    app.on('examForm', renderExamLink);
    app.on('tab', (name) => {
      if (name === 'cursos') renderCursos();
    });
    app.on('resultsCleared', () => {
      // Resultados borrados: la próxima vez se guarda como una evaluación nueva.
      if (state.exam.pro) state.exam.pro.evalId = null;
      boxState.evalId = null;
    });
  }

  bind();
  Pro.ready.then(() => {
    if (Pro.ui.courseId && !Pro.course(Pro.ui.courseId)) Pro.ui.courseId = null;
    syncRosterFromCourse();
    renderAll();
  });
})();
