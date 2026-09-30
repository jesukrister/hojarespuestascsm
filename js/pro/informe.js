/*
 * Versión Pro · Informe para UTP (para imprimir o guardar en PDF):
 *  - de una prueba (pestaña Resultados): resumen, distribución de notas, logro
 *    por OA y por pregunta, estudiantes que requieren apoyo, PIE y sugerencias;
 *  - de un curso en un periodo (pestaña Cursos): promedios por evaluación,
 *    distribución de promedios, logro por OA acumulado, estudiantes en riesgo.
 * Los cálculos y gráficos están en informe-core.js.
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  const R = window.InformeCore;
  const AC = window.AnalisisCore;
  const Grading = window.Grading;
  if (!Pro || !R) return;
  const { app, L, $ } = Pro;
  const esc = app.esc;
  const state = app.state;
  const dec = R.dec;
  const LEVEL_ICON = { L: '✓', ML: '◐', NL: '✗' };

  let current = null; // { type: 'test' } | { type: 'course', courseId }

  function linkedCourse() {
    const p = state.exam.pro;
    return p && p.courseId ? Pro.course(p.courseId) : null;
  }

  function pct(v) {
    return v === null || v === undefined ? '–' : `${Math.round(v)}%`;
  }

  function levelPill(level) {
    if (!level) return '<span class="muted">–</span>';
    return `<span class="rep-lvl rep-lvl-${level}"><i aria-hidden="true">${LEVEL_ICON[level]}</i>${esc(R.LEVEL_NAMES[level])}</span>`;
  }

  function kpi(value, label, note) {
    return `<div class="rep-kpi"><b>${value}</b><span>${esc(label)}</span>${note ? `<small>${esc(note)}</small>` : ''}</div>`;
  }

  function section(title, body, extra) {
    return `<section class="rep-sec${extra ? ' ' + extra : ''}"><h2>${esc(title)}</h2>${body}</section>`;
  }

  function metaGrid(items) {
    return `<dl class="rep-meta">${items
      .filter((x) => x[1] !== '' && x[1] !== null && x[1] !== undefined)
      .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
      .join('')}</dl>`;
  }

  /** Tabla de logro por OA con una barra por objetivo (y su nivel). */
  function oaTable(oa, levels, withQuestions) {
    const rows = oa
      .map((o) => {
        const w = o.average === null ? 0 : Math.max(0, Math.min(100, o.average));
        const c = o.counts || { L: 0, ML: 0, NL: 0 };
        return `<tr>
          <td class="rep-oa-name">${esc(o.name)}${withQuestions && o.questions ? `<small>Preguntas ${esc(Grading.formatRanges(o.questions))}</small>` : ''}${o.evaluations ? `<small>${o.evaluations} evaluación(es)</small>` : ''}</td>
          <td class="rep-bar-cell"><span class="rep-track"><i style="width:${w}%"></i><em style="left:${levels.partial}%"></em><em style="left:${levels.achieved}%"></em></span><b>${pct(o.average)}</b></td>
          <td>${levelPill(o.level)}</td>
          <td class="num">${c.L}</td><td class="num">${c.ML}</td><td class="num">${c.NL}</td>
        </tr>`;
      })
      .join('');
    return `<table class="rep-table rep-oa">
      <thead><tr><th>Objetivo</th><th>Logro promedio</th><th>Nivel del curso</th><th class="num" title="Estudiantes en nivel Logrado">L</th><th class="num" title="Medianamente logrado">ML</th><th class="num" title="No logrado">NL</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <p class="rep-note">Niveles: Logrado desde ${levels.achieved}% · Medianamente logrado desde ${levels.partial}% · No logrado bajo ${levels.partial}%. Las marcas en cada barra señalan esos límites. L, ML y NL: cantidad de estudiantes en cada nivel.</p>`;
  }

  function signatures() {
    return `<div class="rep-sign"><div><span></span>Docente</div><div><span></span>Unidad Técnico-Pedagógica</div></div>`;
  }

  function notesBlock(text) {
    const t = String(text || '').trim();
    return section(
      'Observaciones y acciones remediales',
      t ? `<p class="rep-notes">${esc(t).replace(/\n/g, '<br>')}</p>` : '<div class="rep-lines"><i></i><i></i><i></i></div>'
    );
  }

  function recsBlock(recs) {
    return recs.length ? section('Sugerencias', `<ul class="rep-recs">${recs.map((t) => `<li>${esc(t)}</li>`).join('')}</ul><p class="rep-note">Sugerencias generadas a partir de los resultados; complétalas con tu conocimiento del curso.</p>`) : '';
  }

  /* ------------------------------------------------------------------ */
  /* Informe de una prueba                                               */
  /* ------------------------------------------------------------------ */

  function testReport(notes) {
    const exam = state.exam;
    const sc = exam.scoring;
    const f = exam.doc.format || {};
    const rows = app.sortedResults();
    const course = linkedCourse();
    const st = R.stats(rows.map((x) => x.g.grade), sc.gradePass);
    const pctSt = R.stats(rows.map((x) => x.g.percent));
    const levels = Object.assign({}, Grading.DEFAULT_LEVELS, exam.levels || {});
    const pass = sc.gradePass;

    // Fecha: la de la evaluación en el libro (si la prueba ya se guardó), si no, hoy.
    const evLink = course && exam.pro && exam.pro.evalId ? course.evaluations.find((e) => e.id === exam.pro.evalId) : null;
    const date = L.fmtDate(evLink ? evLink.date : L.todayIso());

    // Estudiantes del curso sin hoja (ausentes).
    let absent = [];
    if (course) {
      const codes = new Set(rows.map(({ r }) => (/^\d+$/.test(r.code || '') ? parseInt(r.code, 10) : null)).filter((n) => n !== null));
      absent = L.activeStudents(course).filter((s) => !codes.has(s.n));
    }

    // Logro por OA.
    const objectives = app.currentObjectives().objectives;
    const per = rows.map((x) => app.oaResults(x.g));
    const oa = objectives.length
      ? Grading.objectiveSummary(per, objectives).map((o) => Object.assign({}, o, { level: Grading.levelFor(o.average, levels) }))
      : [];

    // Preguntas (como en el análisis: sin las hojas PIE ni las de fila sin leer).
    const used = rows.filter(({ r }) => !r.pie && !app.formUnknown(r));
    const an = AC && used.length ? AC.analyze(used.map(({ r }) => app.canonAnswers(r)), exam.key, exam.numChoices) : null;
    const changes = Pro.quality ? Pro.quality.keyChanges() : {};
    const oaOf = (q) => objectives.filter((o) => o.questions.indexOf(q) >= 0).map((o) => o.name).join(', ');

    // Estudiantes bajo la nota de aprobación, con su OA más descendido.
    const who = (r) => app.displayName(r) || (r.code ? `N° ${r.code}` : r.fileName);
    const pieOf = (r) => {
      const rule = app.ruleFor(r);
      return !!(r.pie || (rule && rule.tag === 'PIE'));
    };
    const below = rows
      .filter((x) => x.g.grade !== null && x.g.grade < pass - 1e-9)
      .sort((a, b) => a.g.grade - b.g.grade)
      .map(({ r, g }) => {
        const worst = app
          .oaResults(g)
          .filter((o) => o.percent !== null)
          .sort((a, b) => a.percent - b.percent)[0];
        return { r, g, worst };
      });
    const pieRows = rows.filter(({ r }) => pieOf(r));
    const pieSt = R.stats(pieRows.map((x) => x.g.grade), pass);

    const out = [];
    out.push(`<header class="rep-head">
      <div>${f.school ? `<div class="rep-school">${esc(f.school)}</div>` : ''}<div class="rep-kind">Informe de resultados para UTP</div></div>
      <div class="rep-date">${esc(date)}</div>
    </header>`);
    out.push(`<h1 class="rep-title">${esc(exam.title || f.title || 'Prueba')}</h1>`);
    out.push(
      metaGrid([
        ['Curso', course ? L.courseLabel(course) : f.course || exam.subtitle || ''],
        ['Asignatura', (course && course.subject) || f.subject || ''],
        ['Docente', f.teacher || ''],
        ['Hojas corregidas', `${rows.length}${absent.length ? ` · ${absent.length} sin rendir` : ''}`],
        ['Preguntas', `${exam.numQuestions} de alternativas${exam.dev.length ? ` y ${exam.dev.length} de desarrollo` : ''}`],
        ['Escala', `exigencia ${sc.exigencia}%${pieRows.length ? ` (PIE ${exam.pie ? exam.pie.exigencia : 50}%)` : ''} · aprobación ${dec(pass)}`],
      ])
    );
    out.push(
      `<div class="rep-kpis">` +
        kpi(dec(st.mean), 'Nota promedio') +
        kpi(st.passRate === null ? '–' : pct(st.passRate * 100), 'Aprobación', `${st.passed} de ${st.n}`) +
        kpi(pct(pctSt.mean), 'Logro promedio') +
        kpi(`${dec(st.max)} / ${dec(st.min)}`, 'Nota más alta / más baja') +
        kpi(String(below.length), `Bajo ${dec(pass)}`) +
        `</div>`
    );

    const bands = R.gradeBands(rows.map((x) => x.g.grade), sc.gradeMin, sc.gradeMax);
    out.push(
      section(
        'Distribución de notas',
        `<figure class="rep-fig">${R.distributionChart(bands, pass, 'Distribución de notas')}<figcaption>Cantidad de estudiantes en cada tramo de notas. La línea marca la nota de aprobación.</figcaption></figure>`
      )
    );

    if (oa.length) out.push(section('Logro por objetivo de aprendizaje', oaTable(oa, levels, true)));

    if (an && an.n) {
      const weakest = an.items
        .filter((it) => it.p !== null)
        .sort((a, b) => a.p - b.p || a.question - b.question)
        .slice(0, Math.min(6, an.items.length));
      const wrongTop = (it) => {
        const opts = it.options.filter((o) => !o.isKey).sort((a, b) => b.pct - a.pct);
        return opts[0] && opts[0].count ? `${opts[0].letter} (${pct(opts[0].pct * 100)})` : '–';
      };
      const table = `<table class="rep-table">
        <thead><tr><th class="num">N°</th>${objectives.length ? '<th>OA</th>' : ''}<th>Clave</th><th class="num">Acierto</th><th>Respuesta incorrecta más elegida</th></tr></thead>
        <tbody>${weakest
          .map(
            (it) =>
              `<tr><td class="num">${it.question}</td>${objectives.length ? `<td>${esc(oaOf(it.question - 1) || '–')}</td>` : ''}<td>${'ABCDEF'[it.key]}</td><td class="num">${pct(it.p * 100)}</td><td>${wrongTop(it)}</td></tr>`
          )
          .join('')}</tbody></table>`;
      out.push(
        section(
          'Logro por pregunta',
          `<figure class="rep-fig">${R.questionsChart(an.items, levels, 'Porcentaje de acierto por pregunta')}<figcaption>Porcentaje de acierto de cada pregunta. En azul, las que quedaron bajo ${levels.partial}% (medianamente logrado); las líneas marcan los niveles.${used.length < rows.length ? ` No incluye ${rows.length - used.length} hoja(s) PIE o con la fila sin leer.` : ''}</figcaption></figure>` +
            `<h3>Preguntas con más bajo logro</h3>${table}`
        )
      );
    }

    out.push(
      section(
        `Estudiantes que requieren apoyo (nota bajo ${dec(pass)})`,
        (below.length
          ? `<table class="rep-table"><thead><tr><th class="num">N°</th><th>Estudiante</th><th class="num">Nota</th><th class="num">Logro</th>${objectives.length ? '<th>OA más descendido</th>' : ''}<th>PIE</th></tr></thead><tbody>${below
              .map(
                ({ r, g, worst }) =>
                  `<tr><td class="num">${esc(r.code || '–')}</td><td>${esc(who(r))}</td><td class="num rep-fail">${dec(g.grade)}</td><td class="num">${pct(g.percent)}</td>${
                    objectives.length ? `<td>${worst ? `${esc(worst.name)} (${pct(worst.percent)})` : '–'}</td>` : ''
                  }<td>${pieOf(r) ? 'Sí' : ''}</td></tr>`
              )
              .join('')}</tbody></table>`
          : `<p>Ningún estudiante quedó bajo la nota ${dec(pass)}.</p>`) +
          (absent.length ? `<p class="rep-note"><b>Sin rendir (${absent.length}):</b> ${absent.map((s) => `${s.n}. ${esc(s.name)}`).join(' · ')}.</p>` : '')
      )
    );

    if (pieRows.length) {
      out.push(
        section(
          'Estudiantes PIE (Decreto 83)',
          `<table class="rep-table"><thead><tr><th class="num">N°</th><th>Estudiante</th><th class="num">Nota</th><th class="num">Logro</th><th class="num">Exigencia</th><th>Versión</th></tr></thead><tbody>${pieRows
            .map(
              ({ r, g }) =>
                `<tr><td class="num">${esc(r.code || '–')}</td><td>${esc(who(r))}</td><td class="num${g.grade !== null && g.grade < pass ? ' rep-fail' : ''}">${dec(g.grade)}</td><td class="num">${pct(g.percent)}</td><td class="num">${app.scoringFor(r).exigencia}%</td><td>${r.pie ? 'Adecuada (una alternativa menos)' : 'Normal'}</td></tr>`
            )
            .join('')}</tbody></table><p class="rep-note">Promedio de los estudiantes PIE: ${dec(pieSt.mean)} · aprobación ${pieSt.passRate === null ? '–' : pct(pieSt.passRate * 100)}.</p>`
        )
      );
    }

    if (an && an.enough) {
      const annulled = Object.keys(changes).filter((q) => exam.key[q] === null).map((q) => Number(q) + 1);
      const rekeyed = Object.keys(changes).filter((q) => exam.key[q] !== null).map((q) => Number(q) + 1);
      const review = an.items.filter((it) => it.level === 'revisar').map((it) => it.question);
      out.push(
        section(
          'Calidad del instrumento',
          `<ul class="rep-list">
            <li>Confiabilidad (KR-20): <b>${an.kr20 === null ? '–' : dec(an.kr20, 2)}</b>${an.reliability ? ` (${esc(an.reliability)})` : ''}. En pruebas de aula es habitual entre 0,60 y 0,80.</li>
            <li>Preguntas para revisar: ${review.length ? review.join(', ') : 'ninguna'}.</li>
            ${annulled.length ? `<li>Preguntas anuladas (no cuentan en el puntaje): ${annulled.join(', ')}.</li>` : ''}
            ${rekeyed.length ? `<li>Preguntas con la clave corregida: ${rekeyed.join(', ')}.</li>` : ''}
          </ul>`
        )
      );
    }

    const recs = R.testRecommendations({
      stats: st,
      pass,
      oa,
      review: an && an.enough ? an.items.filter((it) => it.level === 'revisar').map((it) => it.question) : [],
      kr20: an ? an.kr20 : null,
      enough: !!(an && an.enough),
      below: below.length,
      pie: pieRows.length ? { count: pieRows.length, mean: pieSt.mean } : null,
    });
    out.push(recsBlock(recs));
    out.push(notesBlock(notes));
    out.push(signatures());
    return out.join('');
  }

  /* ------------------------------------------------------------------ */
  /* Informe de un curso                                                 */
  /* ------------------------------------------------------------------ */

  function courseLevels(course) {
    const withLevels = L.sortEvaluations(course.evaluations)
      .reverse()
      .find((e) => e.exam && e.exam.levels);
    return Object.assign({}, Grading.DEFAULT_LEVELS, withLevels ? withLevels.exam.levels : {});
  }

  function periodLabel(course, period) {
    return period === 'anual' ? 'Anual' : L.periodNames(course.periods)[period - 1];
  }

  function courseReport(course, period, notes) {
    const levels = courseLevels(course);
    const d = R.courseData(L, course, period, levels);
    const pass = course.gradePass;
    const sit = { reprobado: 'Bajo la aprobación', limitrofe: 'Limítrofe', aprobado: 'Aprobado' };
    const out = [];
    out.push(`<header class="rep-head">
      <div><div class="rep-kind">Informe del curso para UTP</div></div>
      <div class="rep-date">${esc(L.fmtDate(L.todayIso()))}</div>
    </header>`);
    out.push(`<h1 class="rep-title">${esc(L.courseLabel(course))} · ${esc(periodLabel(course, period))}</h1>`);
    const summative = d.evaluations.filter((e) => e.weight > 0).length;
    out.push(
      metaGrid([
        ['Curso', course.name || ''],
        ['Asignatura', course.subject || ''],
        ['Año', String(course.year || '')],
        ['Periodo', periodLabel(course, period)],
        ['Evaluaciones', `${summative} sumativa(s)${d.formative ? ` y ${d.formative} formativa(s)` : ''}`],
        ['Escala', `aprobación ${dec(pass)} · promedios ${course.rounding === 'trunc' ? 'truncados' : 'aproximados'} a un decimal`],
      ])
    );
    out.push(
      `<div class="rep-kpis">` +
        kpi(String(d.students.length), 'Estudiantes') +
        kpi(dec(d.stats.mean), 'Promedio del curso') +
        kpi(d.stats.passRate === null ? '–' : pct(d.stats.passRate * 100), 'Con promedio aprobado', `${d.stats.passed} de ${d.stats.n}`) +
        kpi(String(d.below.length), `Promedio bajo ${dec(pass)}`, d.borderline ? `${d.borderline} limítrofe(s)` : '') +
        kpi(String(d.pie.length), 'Estudiantes PIE') +
        `</div>`
    );
    if (!d.evaluations.length) {
      out.push('<p class="rep-note">Este periodo aún no tiene evaluaciones en el libro de notas.</p>');
    } else {
      const evs = d.evaluations.map((e) => Object.assign({}, e, { dateText: L.fmtDate(e.date) }));
      out.push(
        section(
          'Promedio del curso en cada evaluación',
          `<figure class="rep-fig">${R.evaluationsChart(evs, course, 'Promedio del curso en cada evaluación')}<figcaption>Promedio de las notas de cada evaluación, en orden de fecha. La línea marca la nota de aprobación.</figcaption></figure>` +
            `<table class="rep-table"><thead><tr><th>Fecha</th><th>Evaluación</th><th class="num">Ponderación</th><th class="num">Notas</th><th class="num">Promedio</th><th class="num">Aprobación</th></tr></thead><tbody>${evs
              .map(
                (e) =>
                  `<tr><td>${esc(e.dateText)}</td><td>${esc(e.title)}${e.weight === 0 ? ' <small class="muted">(formativa)</small>' : ''}</td><td class="num">${e.weight === 0 ? '0' : esc(String(Math.round(e.weight * 100) / 100))}</td><td class="num">${e.count}</td><td class="num${e.average !== null && e.average < pass ? ' rep-fail' : ''}">${dec(e.average)}</td><td class="num">${e.passPct === null ? '–' : e.passPct + '%'}</td></tr>`
              )
              .join('')}</tbody></table>`
        )
      );
      if (d.stats.n) {
        out.push(
          section(
            'Distribución de promedios',
            `<figure class="rep-fig">${R.distributionChart(d.bands, pass, 'Distribución de promedios')}<figcaption>Cantidad de estudiantes según su promedio ${period === 'anual' ? 'final' : 'del periodo'}.</figcaption></figure>`
          )
        );
      }
    }
    if (d.oa.length) out.push(section('Logro por objetivo de aprendizaje', oaTable(d.oa.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true })), levels, false) + '<p class="rep-note">Promedio del logro de cada estudiante en las evaluaciones escaneadas que midieron ese OA.</p>'));
    out.push(
      section(
        'Estudiantes en riesgo',
        d.below.length
          ? `<table class="rep-table"><thead><tr><th class="num">N°</th><th>Estudiante</th><th class="num">Promedio</th><th>Situación</th><th class="num">Notas bajo ${dec(pass)}</th><th class="num">Nota más baja</th><th>PIE</th></tr></thead><tbody>${d.below
              .sort((a, b) => a.average - b.average)
              .map(
                (s) =>
                  `<tr><td class="num">${s.n}</td><td>${esc(s.name)}</td><td class="num rep-fail">${dec(s.average)}</td><td>${sit[s.situation] || ''}</td><td class="num">${s.failing} de ${s.grades}</td><td class="num">${dec(s.lowest)}</td><td>${s.pie ? 'Sí' : ''}</td></tr>`
              )
              .join('')}</tbody></table>`
          : `<p>Ningún estudiante tiene promedio bajo ${dec(pass)} en este periodo.</p>`
      )
    );
    if (d.pie.length) {
      out.push(
        section(
          'Estudiantes PIE (Decreto 83)',
          `<table class="rep-table"><thead><tr><th class="num">N°</th><th>Estudiante</th><th class="num">Promedio</th><th class="num">Exigencia propia</th><th class="num">Notas</th></tr></thead><tbody>${d.pie
            .map(
              (s) =>
                `<tr><td class="num">${s.n}</td><td>${esc(s.name)}</td><td class="num${s.average !== null && s.average < pass ? ' rep-fail' : ''}">${dec(s.average)}</td><td class="num">${s.exigencia ? s.exigencia + '%' : 'la de cada prueba'}</td><td class="num">${s.grades}</td></tr>`
            )
            .join('')}</tbody></table>`
        )
      );
    }
    out.push(recsBlock(R.courseRecommendations(d, course)));
    out.push(notesBlock(notes));
    out.push(signatures());
    return out.join('');
  }

  /* ------------------------------------------------------------------ */
  /* Diálogo                                                             */
  /* ------------------------------------------------------------------ */

  function notesKey() {
    if (!current) return '';
    if (current.type === 'course') return `curso:${current.courseId}:${$('#rpPeriod').value}`;
    return `prueba:${state.exam.title || ''}:${(state.exam.pro && state.exam.pro.evalId) || ''}`;
  }

  function loadNotes() {
    const all = Pro.ui.reportNotes || {};
    $('#rpNotes').value = all[notesKey()] || '';
  }

  function saveNotes() {
    const all = Object.assign({}, Pro.ui.reportNotes || {});
    const t = $('#rpNotes').value;
    if (t.trim()) all[notesKey()] = t;
    else delete all[notesKey()];
    Pro.ui.reportNotes = all;
    Pro.saveUi();
  }

  function html() {
    const notes = $('#rpNotes').value;
    if (!current) return '';
    if (current.type === 'course') {
      const c = Pro.course(current.courseId);
      if (!c) return '';
      const v = $('#rpPeriod').value;
      return courseReport(c, v === 'anual' ? 'anual' : Number(v), notes);
    }
    return testReport(notes);
  }

  function render() {
    $('#rpPaper').innerHTML = html();
  }

  function open(which) {
    current = which;
    const isCourse = which.type === 'course';
    $('#proReportTitle').textContent = isCourse ? '📄 Informe del curso para UTP' : '📄 Informe de la prueba para UTP';
    $('#rpPeriodWrap').hidden = !isCourse;
    if (isCourse) {
      const c = Pro.course(which.courseId);
      const names = L.periodNames(c.periods);
      $('#rpPeriod').innerHTML = names.map((n, i) => `<option value="${i + 1}">${esc(n)}</option>`).join('') + '<option value="anual">Anual</option>';
      const p = Pro.ui.period;
      $('#rpPeriod').value = p === 'anual' || (Number.isInteger(p) && p >= 1 && p <= c.periods) ? String(p) : String(L.periodForDate(L.todayIso(), c.periods));
    }
    loadNotes();
    render();
    const dlg = $('#proReportDialog');
    if (!dlg.open) dlg.showModal();
  }

  function print() {
    saveNotes();
    const paper = window.SheetLayout.PAPERS[state.exam.paper] || window.SheetLayout.PAPERS.carta;
    app.setPageStyle(
      `@page { size: ${paper.width}mm ${paper.height}mm; margin: 12mm 12mm 14mm; ` +
        `@bottom-right { content: "Página " counter(page) " de " counter(pages); font: 8pt Arial, sans-serif; color: #666; } }`
    );
    const area = $('#printArea');
    area.className = 'print-area print-report';
    area.innerHTML = `<article class="rep-paper">${html()}</article>`;
    window.print();
  }

  $('#rpPeriod').addEventListener('change', () => {
    loadNotes();
    render();
  });
  let typing = null;
  $('#rpNotes').addEventListener('input', () => {
    clearTimeout(typing);
    typing = setTimeout(() => {
      saveNotes();
      render();
    }, 400);
  });
  $('#rpPrint').addEventListener('click', print);
  $('#proReportDialog').addEventListener('close', saveNotes);
  $('#proReportTest').addEventListener('click', () => {
    if (!state.results.length) return app.toast('Aún no hay hojas escaneadas.');
    open({ type: 'test' });
  });
  $('#proReportCourse').addEventListener('click', () => {
    const id = Pro.ui.courseId || (Pro.book.courses[0] && Pro.book.courses[0].id);
    if (!Pro.course(id)) return app.toast('Primero crea un curso.');
    open({ type: 'course', courseId: id });
  });

  Pro.report = { open, testReport, courseReport };
})();
