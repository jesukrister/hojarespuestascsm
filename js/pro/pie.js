/*
 * Versión Pro · Estudiantes PIE (Decreto 83):
 *  - exigencia propia para los estudiantes PIE (la de la prueba o la de cada estudiante);
 *  - versión adecuada de la prueba: letra más grande y una alternativa incorrecta
 *    menos en cada pregunta (el docente elige cuál), con su propia hoja de
 *    respuestas, que el lector reconoce y corrige con su clave.
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  if (!Pro) return;
  const { app, L, $ } = Pro;
  const esc = app.esc;
  const state = app.state;
  const SheetLayout = window.SheetLayout;
  const SheetRenderer = window.SheetRenderer;
  const LETTERS = 'ABCDEF';
  const TAG = 'Versión adecuada';

  function pie() {
    if (!state.exam.pie) state.exam.pie = app.sanitizePie(null, state.exam.numQuestions, state.exam.numChoices);
    return state.exam.pie;
  }

  function linkedCourse() {
    const p = state.exam.pro;
    return p && p.courseId ? Pro.course(p.courseId) : null;
  }

  function pieStudents(course) {
    return course ? L.activeStudents(course).filter((s) => s.pie) : [];
  }

  /* ---------- Exigencia de los estudiantes PIE ---------- */

  function studentOf(r) {
    const c = linkedCourse();
    if (!c || !r.code || !/^\d+$/.test(r.code)) return null;
    const n = parseInt(r.code, 10);
    return c.students.find((s) => s.n === n) || null;
  }

  app.setStudentRule((r) => {
    const s = studentOf(r);
    const base = pie().exigencia;
    if (s && s.pie) {
      const ex = s.exigencia || base;
      return { exigencia: ex, tag: 'PIE', title: `Estudiante PIE · exigencia ${ex}%${r.pie ? ' · versión adecuada' : ''}` };
    }
    if (r.pie) return { exigencia: base, tag: 'PIE', title: `Hoja de la versión PIE · exigencia ${base}%` };
    return null;
  });

  function renderScale() {
    const input = $('#pieExigencia');
    if (input && document.activeElement !== input) input.value = pie().exigencia;
  }

  $('#pieExigencia').addEventListener('change', (e) => {
    const v = Math.round(parseFloat(String(e.target.value).replace(',', '.')));
    if (!(v >= 1 && v <= 99)) {
      e.target.value = pie().exigencia;
      return app.toast('La exigencia debe ser un porcentaje entre 1 y 99.');
    }
    pie().exigencia = v;
    app.save();
    app.renderResultsBadge();
  });

  /* ---------- Versión adecuada: alternativa que se quita en cada pregunta ---------- */

  /** Preguntas de la evaluación que calzan con la hoja (null si no hay o no coinciden). */
  function docQuestions(mcs) {
    mcs = mcs || app.docMcQuestions();
    return mcs.length === state.exam.numQuestions ? mcs : null;
  }

  function short(text, max) {
    const t = String(text || '')
      .replace(/\$\$?[^$]*\$\$?/g, '[fórmula]')
      .replace(/\s+/g, ' ')
      .trim();
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
  }

  /** Alternativas que se pueden quitar en la pregunta q: [{ value, label }]. */
  function choicesFor(q, docQs) {
    const c = state.exam.numChoices;
    const key = state.exam.key[q];
    const real = docQs ? docQs[q].options.length : c;
    const out = [];
    for (let j = 0; j < Math.min(real, c); j++) {
      if (j === key) continue;
      const text = docQs ? short(docQs[q].options[j], 38) : '';
      out.push({ value: j, label: `${LETTERS[j]}${text ? ') ' + text : ''}` });
    }
    // Pregunta con menos alternativas que la hoja: se quita una casilla que no usa.
    if (real < c) out.push({ value: c - 1, label: `Ninguna (tiene ${real} alternativas)` });
    return out;
  }

  /** Elección al azar entre las alternativas incorrectas (sin clave no se elige). */
  function randomFor(q, docQs) {
    const c = state.exam.numChoices;
    const key = state.exam.key[q];
    if (key === null) return null;
    const real = docQs ? Math.min(docQs[q].options.length, c) : c;
    if (real < 3) return real < c ? c - 1 : null;
    const opts = [];
    for (let j = 0; j < real; j++) if (j !== key) opts.push(j);
    return opts[Math.floor(Math.random() * opts.length)];
  }

  function pieResults() {
    return state.results.filter((r) => r.pie).length;
  }

  let changedWarned = false;
  function changed() {
    app.save();
    render();
    const n = pieResults();
    if (n && !changedWarned) {
      changedWarned = true;
      app.toast(`Las ${n} hoja(s) PIE ya corregidas mantienen la versión con que se imprimieron. Vuelve a imprimir la versión PIE.`);
    }
  }

  function render() {
    const card = $('#proPieCard');
    if (!card) return;
    const p = pie();
    const n = state.exam.numQuestions;
    const c = state.exam.numChoices;
    const mcs = app.docMcQuestions();
    const docQs = docQuestions(mcs);
    const enough = c >= 3;
    const missing = p.remove.filter((v) => v === null).length;
    const conflicts = p.remove.map((v, q) => (v !== null && v === state.exam.key[q] ? q + 1 : null)).filter(Boolean);
    const noKey = state.exam.key.filter((k) => k === null).length;

    $('#piFont').value = String(p.fontSize);
    $('#piOneCol').checked = p.oneColumn;
    $('#piLabel').checked = p.label;
    $('#piSummary').textContent = !enough
      ? 'necesita 3 alternativas o más'
      : missing
        ? `${n - missing} de ${n} preguntas listas`
        : '✓ lista';

    const notes = [];
    if (!enough) notes.push('La versión PIE quita una alternativa en cada pregunta: la prueba necesita al menos 3 alternativas (pestaña Prueba).');
    else {
      if (conflicts.length) notes.push(`En la(s) pregunta(s) ${conflicts.join(', ')} se quita la alternativa correcta (la clave cambió): elige otra.`);
      if (noKey) notes.push(`${noKey} pregunta(s) no tienen clave: complétala en la pestaña Prueba antes de elegir al azar.`);
      if (!docQs) {
        notes.push(
          mcs.length
            ? `La evaluación de esta pestaña tiene ${mcs.length} pregunta(s) de alternativas y la hoja ${n}: para imprimir la prueba PIE deben coincidir (usa «Usar estas preguntas en la hoja de respuestas»). Igual puedes imprimir las hojas de respuesta PIE.`
            : 'Si escribes la evaluación en esta pestaña, se imprime también la prueba PIE. Si no, imprime sólo las hojas de respuesta PIE y adecua tu prueba quitando las alternativas elegidas.'
        );
      }
    }
    $('#piNote').hidden = !notes.length;
    $('#piNote').innerHTML = notes.map((t) => `<span>${esc(t)}</span>`).join('<br>');

    const rows = [];
    if (enough) {
      for (let q = 0; q < n; q++) {
        const key = state.exam.key[q];
        const opts = choicesFor(q, docQs);
        const v = p.remove[q];
        const known = opts.some((o) => o.value === v);
        const sel =
          `<select data-pi="${q}" aria-label="Alternativa que se quita en la pregunta ${q + 1}"${v === null || v === key ? ' class="unset"' : ''}>` +
          `<option value="">— elegir —</option>` +
          opts.map((o) => `<option value="${o.value}"${o.value === v ? ' selected' : ''}>Quitar ${esc(o.label)}</option>`).join('') +
          (v !== null && !known ? `<option value="${v}" selected>Quitar ${LETTERS[v]}${v === key ? ' (¡es la clave!)' : ''}</option>` : '') +
          '</select>';
        const stem = docQs ? `<td class="pi-stem">${esc(short(docQs[q].stem, 70)) || '<span class="muted">(sin enunciado)</span>'}</td>` : '';
        rows.push(`<tr><td class="num">${q + 1}</td>${stem}<td class="center">${key === null ? '<span class="muted">–</span>' : `<b>${LETTERS[key]}</b>`}</td><td>${sel}</td></tr>`);
      }
    }
    $('#piTable').innerHTML = enough
      ? `<thead><tr><th class="num">N°</th>${docQs ? '<th>Pregunta</th>' : ''}<th class="center">Clave</th><th>Alternativa que se quita</th></tr></thead><tbody>${rows.join('')}</tbody>`
      : '';

    const course = linkedCourse();
    const ps = pieStudents(course);
    $('#piStudents').innerHTML = course
      ? ps.length
        ? `Estudiantes PIE de ${esc(L.courseLabel(course))}: <b>${ps.map((s) => esc(s.name || 'N° ' + s.n)).join(', ')}</b>. En la pestaña Hoja, las hojas con nombre les imprimen la hoja PIE.`
        : `No hay estudiantes marcados PIE en ${esc(L.courseLabel(course))}: márcalos en Cursos → Estudiantes para usar su exigencia y darles su hoja PIE.`
      : 'Vincula la prueba a un curso (pestaña Prueba) para marcar a los estudiantes PIE y darles su exigencia.';

    const ready = app.pieReady() && !conflicts.length;
    $('#piRandom').disabled = !enough || !missing;
    $('#piClear').disabled = !enough || missing === n;
    $('#piPrintSheet').disabled = !ready;
    $('#piPrintTest').disabled = !ready || !docQs;
    $('#piPreviewBtn').disabled = !ready || !docQs;
    if (!$('#piPreview').hidden) renderPreview();
  }

  /* ---------- Impresión ---------- */

  function alterQuestion(q, i) {
    const rm = pie().remove[i];
    if (rm === null || rm === undefined || rm >= q.options.length) return q;
    const out = Object.assign({}, q);
    out.options = q.options.filter((_, j) => j !== rm);
    out.correct = q.correct === null || q.correct === rm ? null : q.correct > rm ? q.correct - 1 : q.correct;
    return out;
  }

  function formatOver() {
    const p = pie();
    const f = { fontSize: p.fontSize, columns: 1 };
    if (p.oneColumn) f.optionsLayout = 'list';
    return f;
  }

  function renderPreview() {
    const html = app.docVariantHTML(alterQuestion, formatOver(), pie().label ? TAG : '');
    const box = $('#piPreviewDoc');
    const paper = SheetLayout.PAPERS[state.exam.doc.format.paper] || SheetLayout.PAPERS.carta;
    box.style.width = paper.width + 'mm';
    box.innerHTML = html || '<p class="muted doc-empty">Escribe la evaluación arriba para ver la versión PIE.</p>';
  }

  function checkReady() {
    const p = pie();
    const conflicts = p.remove.filter((v, q) => v !== null && v === state.exam.key[q]).length;
    if (!app.pieReady()) {
      app.toast('Falta elegir la alternativa que se quita en algunas preguntas (o usa «Elegir al azar las que faltan»).');
      return false;
    }
    if (conflicts) {
      app.toast('En alguna pregunta se quita la alternativa correcta: elige otra.');
      return false;
    }
    return true;
  }

  /** Opciones de la hoja PIE (con «Versión adecuada» bajo el título si se pidió). */
  Pro.pieSheetOptions = (fill) => {
    const o = app.sheetOptions(fill);
    if (pie().label) o.subtitle = [o.subtitle, TAG].filter(Boolean).join(' · ');
    return o;
  };

  function printSheets() {
    if (!checkReady()) return;
    const layout = app.pieLayout();
    if (!layout) return app.toast('No se pudo preparar la hoja PIE.');
    const page = SheetRenderer.renderPageSVG(layout, Pro.pieSheetOptions());
    app.setPageStyle(`@page { size: ${page.width}mm ${page.height}mm; margin: 0; }`);
    const area = $('#printArea');
    area.className = 'print-area';
    area.innerHTML = `<div class="print-page">${page.svg}</div>`;
    window.print();
  }

  async function printTest() {
    if (!checkReady()) return;
    if (!docQuestions()) return app.toast('La evaluación no coincide con la hoja de respuestas.');
    await app.printDocVariant(alterQuestion, formatOver(), pie().label ? TAG : '');
  }

  /* ---------- Eventos ---------- */

  $('#piTable').addEventListener('change', (e) => {
    const sel = e.target.closest('select[data-pi]');
    if (!sel) return;
    const q = Number(sel.dataset.pi);
    pie().remove[q] = sel.value === '' ? null : Number(sel.value);
    changed();
  });
  $('#piRandom').addEventListener('click', () => {
    const p = pie();
    const docQs = docQuestions();
    let filled = 0;
    let skipped = 0;
    p.remove.forEach((v, q) => {
      if (v !== null && v !== state.exam.key[q]) return;
      const r = randomFor(q, docQs);
      if (r === null) skipped++;
      else {
        p.remove[q] = r;
        filled++;
      }
    });
    changed();
    app.toast(`Se eligieron ${filled} pregunta(s) al azar${skipped ? `; ${skipped} sin clave quedaron sin elegir` : ''}. Revísalas antes de imprimir.`);
  });
  $('#piClear').addEventListener('click', async () => {
    const ok = await Pro.confirm({ title: 'Limpiar la versión PIE', html: '<p>¿Borrar la alternativa elegida en todas las preguntas?</p>', ok: 'Limpiar', danger: true });
    if (!ok) return;
    pie().remove = pie().remove.map(() => null);
    changed();
  });
  $('#piFont').addEventListener('change', (e) => {
    pie().fontSize = Number(e.target.value) || 14;
    app.save();
    render();
  });
  $('#piOneCol').addEventListener('change', (e) => {
    pie().oneColumn = e.target.checked;
    app.save();
    render();
  });
  $('#piLabel').addEventListener('change', (e) => {
    pie().label = e.target.checked;
    app.save();
    render();
  });
  $('#piPrintSheet').addEventListener('click', printSheets);
  $('#piPrintTest').addEventListener('click', printTest);
  $('#piPreviewBtn').addEventListener('click', () => {
    const box = $('#piPreview');
    box.hidden = !box.hidden;
    $('#piPreviewBtn').textContent = box.hidden ? '👁 Vista previa' : '👁 Ocultar vista previa';
    if (!box.hidden) renderPreview();
  });

  app.on('tab', (name) => {
    if (name === 'evaluacion') render();
    if (name === 'prueba') renderScale();
  });
  app.on('examForm', () => {
    renderScale();
    if (!$('#tab-evaluacion').hidden) render();
  });
  // Con el libro cargado se conoce qué estudiantes son PIE: se recalculan las notas.
  Pro.ready.then(() => {
    renderScale();
    if (!$('#tab-resultados').hidden) app.renderResults();
    if (!$('#tab-evaluacion').hidden) render();
  });

  Pro.pie = { render, pieStudents, linkedCourse, studentOf };
})();
