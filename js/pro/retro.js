/*
 * Versión Pro · Retroalimentación para los estudiantes:
 *  - rúbrica opcional de cada pregunta de desarrollo (pestaña Prueba);
 *  - en el detalle de cada estudiante: niveles de la rúbrica (calculan el
 *    puntaje), comentario por pregunta de desarrollo y comentario general;
 *  - informe PDF por estudiante (botón en el detalle y en el .zip de evidencias);
 *  - en el Excel de evidencias: la evaluación con sus alternativas, las
 *    respuestas de cada estudiante con la correcta y la retroalimentación.
 * La lógica (rúbricas, preguntas, PDF) está en retro-core.js.
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  const RC = window.RetroCore;
  if (!Pro || !RC || !window.PdfCore) return;
  const { app, $ } = Pro;
  const esc = app.esc;
  const state = app.state;
  const LEVEL_LABELS = (window.Grading && window.Grading.LEVEL_LABELS) || { L: 'Logrado', ML: 'Medianamente logrado', NL: 'No logrado' };

  /* ---------- Datos ---------- */

  const devList = () => state.exam.dev || [];

  /** Rúbricas de la prueba, en el mismo orden que las preguntas de desarrollo. */
  function rubrics() {
    if (!state.exam.pro || typeof state.exam.pro !== 'object') state.exam.pro = {};
    if (!Array.isArray(state.exam.pro.rubrics)) state.exam.pro.rubrics = [];
    return state.exam.pro.rubrics;
  }
  const rubricOf = (i) => RC.normalizeRubric(rubrics()[i]);

  const feedbackOf = (r) => RC.normalizeFeedback(r.feedback, devList().length);

  /** Preguntas de alternativas de la evaluación, sólo si calzan con la hoja. */
  function mcQuestions() {
    try {
      const mc = app.docMcQuestions();
      return mc.length && mc.length === state.exam.numQuestions ? mc : null;
    } catch (e) {
      return null;
    }
  }

  // Al quitar o reemplazar preguntas de desarrollo (desarrollo.js) se ajustan
  // las rúbricas y los comentarios para que sigan con su pregunta.
  Pro.onDevSplice = (k) => {
    rubrics().splice(k, 1);
    for (const r of state.results) if (r.feedback && Array.isArray(r.feedback.dev)) r.feedback.dev.splice(k, 1);
  };
  Pro.onDevReset = () => {
    state.exam.pro.rubrics = [];
    for (const r of state.results) if (r.feedback) r.feedback.dev = [];
  };
  Pro.rubricButtonLabel = (i) => {
    const rub = rubricOf(i);
    return rub ? `✓ Rúbrica (${rub.criteria.length} criterio${rub.criteria.length === 1 ? '' : 's'})` : '＋ Rúbrica';
  };

  /* ---------- Editor de rúbrica (pestaña Prueba) ---------- */

  let edit = null; // { i, rub }

  function openEditor(i) {
    const d = devList()[i];
    if (!d) return;
    edit = { i, rub: JSON.parse(JSON.stringify(rubricOf(i) || RC.defaultRubric(d.max))) };
    $('#prbLabel').textContent = d.label;
    $('#prbRemove').hidden = !rubricOf(i);
    $('#prbPaste').value = '';
    $('#prbPasteBox').open = false;
    renderEditor();
    $('#proRubricDialog').showModal();
  }

  function renderEditor() {
    const rub = edit.rub;
    const d = devList()[edit.i];
    const head = rub.levels
      .map(
        (l, k) => `<th>
          <input type="text" data-lv-name="${k}" value="${esc(l.name)}" maxlength="60" aria-label="Nombre del nivel ${k + 1}" placeholder="Nivel">
          <span class="prb-pts"><input type="number" data-lv-pts="${k}" value="${l.points}" min="0" max="100" step="0.5" aria-label="Puntaje del nivel ${k + 1}"> pts</span>
          ${rub.levels.length > 2 ? `<button type="button" class="link-btn danger" data-lv-del="${k}">✕ Quitar nivel</button>` : ''}
        </th>`
      )
      .join('');
    const body = rub.criteria
      .map(
        (c, i) => `<tr>
          <td class="prb-crit">
            <textarea data-cr-name="${i}" rows="2" maxlength="200" placeholder="Criterio (ej.: Argumentación)" aria-label="Criterio ${i + 1}">${esc(c.name)}</textarea>
            ${rub.criteria.length > 1 ? `<button type="button" class="link-btn danger" data-cr-del="${i}">✕ Quitar criterio</button>` : ''}
          </td>
          ${rub.levels.map((_, k) => `<td><textarea data-cr-desc="${i},${k}" rows="3" maxlength="600" placeholder="Qué debe lograr el estudiante en este nivel">${esc(c.descs[k] || '')}</textarea></td>`).join('')}
        </tr>`
      )
      .join('');
    $('#prbTable').innerHTML = `<thead><tr><th class="prb-crit">Criterio</th>${head}</tr></thead><tbody>${body}</tbody>`;
    $('#prbAddLevel').disabled = rub.levels.length >= 6;
    $('#prbAddCrit').disabled = rub.criteria.length >= 12;
    renderTotal(d);
  }

  function renderTotal(d) {
    const rub = edit.rub;
    const top = Math.max(0, ...rub.levels.map((l) => Number(l.points) || 0));
    const total = top * rub.criteria.length;
    const max = d ? d.max : 0;
    $('#prbTotal').innerHTML =
      `Puntaje máximo de la rúbrica: <b>${RC.fmtNum(total)} pts</b> (${rub.criteria.length} criterio${rub.criteria.length === 1 ? '' : 's'} × ${RC.fmtNum(top)} pts). ` +
      (total === max
        ? `Coincide con los ${max} pts de la pregunta.`
        : `La pregunta vale <b>${max} pts</b>: al corregir, el puntaje de la rúbrica se lleva a esa escala (por ejemplo, ${RC.fmtNum(Math.round(total * 0.75 * 10) / 10)} de ${RC.fmtNum(total)} → ${RC.rubricScore({ levels: [{ name: '', points: total * 0.75 }, { name: '', points: total }], criteria: [{ name: '', descs: [] }] }, [0], max).points} de ${max}).`);
  }

  $('#prbTable').addEventListener('input', (e) => {
    const t = e.target;
    const rub = edit.rub;
    if (t.dataset.lvName !== undefined) rub.levels[Number(t.dataset.lvName)].name = t.value;
    else if (t.dataset.lvPts !== undefined) {
      rub.levels[Number(t.dataset.lvPts)].points = Math.max(0, Number(String(t.value).replace(',', '.')) || 0);
      renderTotal(devList()[edit.i]);
    } else if (t.dataset.crName !== undefined) rub.criteria[Number(t.dataset.crName)].name = t.value;
    else if (t.dataset.crDesc !== undefined) {
      const [i, k] = t.dataset.crDesc.split(',').map(Number);
      rub.criteria[i].descs[k] = t.value;
    }
  });
  $('#prbTable').addEventListener('click', (e) => {
    const rub = edit.rub;
    const lv = e.target.closest('[data-lv-del]');
    const cr = e.target.closest('[data-cr-del]');
    if (lv) {
      const k = Number(lv.dataset.lvDel);
      rub.levels.splice(k, 1);
      rub.criteria.forEach((c) => c.descs.splice(k, 1));
    } else if (cr) {
      rub.criteria.splice(Number(cr.dataset.crDel), 1);
    } else return;
    renderEditor();
  });
  $('#prbAddCrit').addEventListener('click', () => {
    edit.rub.criteria.push({ name: '', descs: edit.rub.levels.map(() => '') });
    renderEditor();
    const boxes = document.querySelectorAll('#prbTable [data-cr-name]');
    if (boxes.length) boxes[boxes.length - 1].focus();
  });
  $('#prbAddLevel').addEventListener('click', () => {
    edit.rub.levels.push({ name: 'Nivel', points: 0 });
    edit.rub.criteria.forEach((c) => c.descs.push(''));
    renderEditor();
  });
  $('#prbPasteApply').addEventListener('click', () => {
    const rub = RC.parseRubricTable($('#prbPaste').value);
    if (!rub) {
      app.toast('No se reconoció la tabla: copia desde Excel, Word o Google Docs la tabla completa, con la fila de los niveles arriba y los criterios a la izquierda.');
      return;
    }
    edit.rub = rub;
    $('#prbPasteBox').open = false;
    renderEditor();
    app.toast(`Rúbrica pegada: ${rub.criteria.length} criterio(s) y ${rub.levels.length} nivel(es). Revisa los puntajes.`);
  });
  $('#prbSave').addEventListener('click', () => {
    const rub = RC.normalizeRubric(edit.rub);
    if (!rub) return app.toast('La rúbrica necesita al menos un criterio y un nivel.');
    rubrics()[edit.i] = rub;
    app.save();
    $('#proRubricDialog').close();
    afterRubricChange();
    app.toast('Rúbrica guardada. Al revisar cada estudiante en Resultados, marca el nivel de cada criterio.');
  });
  $('#prbRemove').addEventListener('click', () => {
    if (!confirm('¿Quitar la rúbrica de esta pregunta? Los niveles marcados a los estudiantes se pierden (sus puntajes se mantienen).')) return;
    rubrics()[edit.i] = null;
    for (const r of state.results) if (r.feedback && r.feedback.dev && r.feedback.dev[edit.i]) r.feedback.dev[edit.i].picks = [];
    app.save();
    $('#proRubricDialog').close();
    afterRubricChange();
  });

  function afterRubricChange() {
    if (Pro.devRender) Pro.devRender();
    app.renderResults();
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rub]');
    if (b) openEditor(Number(b.dataset.rub));
  });

  /* ---------- Retroalimentación en el detalle del estudiante ---------- */

  function feedbackHTML(r, g) {
    const fb = feedbackOf(r);
    const devHTML = devList()
      .map((d, i) => {
        const gd = (g.dev || [])[i] || {};
        const rub = rubricOf(i);
        const picks = fb.dev[i].picks;
        let rubHTML = '';
        if (rub) {
          const sc = RC.rubricScore(rub, picks, d.max);
          rubHTML = `<div class="table-wrap"><table class="pro-rub-pick">
            <thead><tr><th>Criterio</th>${rub.levels.map((l) => `<th>${esc(l.name || 'Nivel')} <span class="muted">(${RC.fmtNum(l.points)})</span></th>`).join('')}</tr></thead>
            <tbody>${rub.criteria
              .map(
                (c, ci) => `<tr><th scope="row">${esc(c.name || `Criterio ${ci + 1}`)}</th>${rub.levels
                  .map((l, k) => {
                    const sel = picks[ci] === k;
                    return `<td><button type="button" class="pro-rub-cell${sel ? ' sel' : ''}" data-pick="${i},${ci},${k}" data-level="${esc(`${l.name || 'Nivel'} (${RC.fmtNum(l.points)})`)}" aria-pressed="${sel}">${sel ? '✓ ' : ''}${esc(c.descs[k] || l.name || '·')}</button></td>`;
                  })
                  .join('')}</tr>`
              )
              .join('')}</tbody></table></div>
            <p class="muted small">${
              sc.chosen === 0
                ? 'Toca un nivel en cada criterio: el puntaje se calcula solo.'
                : sc.complete
                  ? `Rúbrica: ${RC.fmtNum(sc.raw)} de ${RC.fmtNum(sc.total)} pts${sc.converted ? ` → ${sc.points} de ${d.max} en esta pregunta` : ''}.`
                  : `Faltan ${rub.criteria.length - sc.chosen} criterio(s) por evaluar.`
            }</p>`;
        }
        return `<div class="pro-fb-dev">
          <div class="pro-fb-head"><b>${esc(d.label)}</b><span class="muted small">${gd.status === 'scored' ? `${RC.fmtNum(gd.points)} de ${d.max} pts` : `sin puntaje · máximo ${d.max}`}</span>
            ${rub ? '' : `<button type="button" class="link-btn small" data-rub="${i}">＋ Usar una rúbrica</button>`}</div>
          ${rubHTML}
          <textarea data-fb-dev="${i}" rows="2" maxlength="4000" placeholder="Comentario para el estudiante: por qué obtuvo este puntaje y qué puede mejorar…" aria-label="Comentario de ${esc(d.label)}">${esc(fb.dev[i].comment)}</textarea>
        </div>`;
      })
      .join('');
    return `<h3>💬 Retroalimentación para el estudiante</h3>
      ${devHTML}
      <label class="pro-fb-general">Comentario general <span class="muted small">(opcional)</span>
        <textarea data-fb-general rows="2" maxlength="4000" placeholder="Por ejemplo: qué hizo bien y qué repasar para la próxima evaluación">${esc(fb.general)}</textarea>
      </label>
      <div class="actions">
        <button type="button" class="btn secondary small" data-fb-pdf>📄 Informe PDF de este estudiante</button>
        <span class="muted small">El informe también va, para cada estudiante, en «Descargar evidencias (ZIP)».</span>
      </div>`;
  }

  app.on('detail', ({ card, r, g }) => {
    if (!card) return;
    const sec = document.createElement('div');
    sec.className = 'pro-fb';
    sec.dataset.id = r.id;
    sec.innerHTML = feedbackHTML(r, g);
    card.appendChild(sec);
  });

  const resultOf = (el) => {
    const sec = el.closest('.pro-fb');
    return sec ? state.results.find((x) => x.id === sec.dataset.id) || null : null;
  };

  let saveTimer = null;
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t.matches('.pro-fb textarea')) return;
    const r = resultOf(t);
    if (!r) return;
    const fb = feedbackOf(r);
    if (t.dataset.fbDev !== undefined) fb.dev[Number(t.dataset.fbDev)].comment = t.value;
    else if (t.dataset.fbGeneral !== undefined) fb.general = t.value;
    r.feedback = fb;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => app.save(), 400);
  });

  document.addEventListener('click', async (e) => {
    const pick = e.target.closest('.pro-fb [data-pick]');
    if (pick) {
      const r = resultOf(pick);
      if (!r) return;
      const [i, ci, k] = pick.dataset.pick.split(',').map(Number);
      const fb = feedbackOf(r);
      const picks = fb.dev[i].picks;
      picks[ci] = picks[ci] === k ? null : k;
      r.feedback = fb;
      const rub = rubricOf(i);
      const sc = RC.rubricScore(rub, picks, devList()[i].max);
      const card = pick.closest('.detail');
      const sel = card && card.querySelector(`select[data-dev="${i}"]`);
      if (sc.complete && sel) {
        // Mismo camino que elegir el puntaje en la lista: guarda y recalcula la nota.
        sel.value = String(sc.points);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        app.save();
        const sec = pick.closest('.pro-fb');
        sec.innerHTML = feedbackHTML(r, app.grade(r));
      }
      return;
    }
    const pdfBtn = e.target.closest('.pro-fb [data-fb-pdf]');
    if (pdfBtn) {
      const r = resultOf(pdfBtn);
      if (!r) return;
      pdfBtn.disabled = true;
      try {
        const rows = app.sortedResults();
        const idx = Math.max(0, rows.findIndex((x) => x.r.id === r.id));
        const jpeg = await app.evidenceJpeg(r, 1400, 0.82);
        const bytes = RC.buildStudentPdf(reportData(r, jpeg));
        app.download(`informe_${app.evidenceBaseName(r, idx)}.pdf`, new Blob([bytes], { type: 'application/pdf' }));
      } catch (err) {
        console.error(err);
        app.toast('No se pudo crear el informe: ' + err.message);
      } finally {
        pdfBtn.disabled = false;
      }
    }
  });

  /* ---------- Informe del estudiante ---------- */

  const pad2 = (n) => String(n).padStart(2, '0');
  const today = () => {
    const d = new Date();
    return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
  };

  /** Datos del informe PDF de un estudiante (sheetJpeg: imagen de su hoja corregida o null). */
  function reportData(r, sheetJpeg) {
    const exam = state.exam;
    const g = app.grade(r);
    const objectives = app.currentObjectives().objectives;
    const fb = feedbackOf(r);
    const fmt = exam.doc && exam.doc.format ? exam.doc.format : {};
    const pass = exam.scoring.gradePass;
    return {
      title: exam.title || 'Prueba',
      subtitle: exam.subtitle || '',
      school: fmt.school || '',
      teacher: fmt.teacher || '',
      date: today(),
      student: {
        name: app.displayName(r) || '',
        code: r.code && r.code.indexOf('?') < 0 ? r.code : '',
        form: exam.forms && !r.pie && Number.isInteger(r.form) ? app.formLetter(r.form) : null,
        pie: !!r.pie,
      },
      summary: {
        grade: g.grade,
        failed: g.grade !== null && g.grade < pass,
        score: g.score,
        maxScore: g.maxScore,
        percent: g.percent,
        correct: g.correct,
        wrong: g.wrong,
        blank: g.blank,
        multiple: g.multiple,
      },
      oa: app.oaResults(app.gradeCanon(r)).map((o) => ({ name: o.name, percent: o.percent, level: o.level, levelLabel: LEVEL_LABELS[o.level] || '' })),
      questions: RC.reportQuestions(g.items, app.formMap(r), mcQuestions(), objectives),
      dev: devList().map((d, i) => {
        const gd = (g.dev || [])[i] || {};
        return { label: d.label, max: d.max, points: gd.points, scored: gd.status === 'scored', rubric: rubricOf(i), picks: fb.dev[i].picks, comment: fb.dev[i].comment.trim() };
      }),
      general: fb.general.trim(),
      sheetJpeg,
    };
  }

  /* ---------- Evidencias: informes PDF y hojas del Excel ---------- */

  /** Achica un JPEG (para que los informes no pesen tanto). */
  async function shrinkJpeg(bytes, maxSide) {
    try {
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
      const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      if (k >= 1) return bytes;
      const cv = document.createElement('canvas');
      cv.width = Math.round(bmp.width * k);
      cv.height = Math.round(bmp.height * k);
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await app.canvasToBlob(cv, 'image/jpeg', 0.82);
      return new Uint8Array(await blob.arrayBuffer());
    } catch (e) {
      return bytes;
    }
  }

  app.addEvidenceHook({
    async files(rows, links, files, onProgress) {
      const out = [];
      for (let i = 0; i < rows.length; i++) {
        const { r } = rows[i];
        const link = links[i] || {};
        const sheetFile = link.sheet ? files.find((f) => f.path === link.sheet) : null;
        const jpeg = sheetFile ? await shrinkJpeg(sheetFile.data, 1400) : null;
        const path = `informes/${link.base || `estudiante_${i + 1}`}.pdf`;
        out.push({ path, data: RC.buildStudentPdf(reportData(r, jpeg)) });
        link.report = path;
        if (onProgress) onProgress(i + 1, rows.length);
        await app.nextFrame();
      }
      return out;
    },
    readme: () => [
      'informes/           Informe PDF de cada estudiante: nota, sus respuestas con la',
      '                    correcta, las preguntas a revisar (con enunciado y',
      '                    alternativas), desarrollo con rúbrica y comentarios.',
      '                    Listo para enviárselo.',
    ],
    sheets(rows, links) {
      const sheets = [];
      const exam = state.exam;
      const mc = mcQuestions();
      const objectives = app.currentObjectives().objectives;
      const c = exam.numChoices;
      const L = RC.LETTERS;
      const oaOf = (q) => objectives.filter((o) => o.questions.indexOf(q) >= 0).map((o) => o.name).join(', ');

      // 1) La evaluación: enunciado y alternativas (orden de la fila A).
      if (mc) {
        const eRows = [[{ v: 'Evaluación', s: 'title' }]];
        eRows.push([{ v: exam.forms ? 'Preguntas en el orden de la fila A (las otras filas tienen las mismas preguntas en otro orden).' : 'Preguntas de alternativas de la evaluación, en el orden de la hoja de respuestas.', s: 'muted' }]);
        eRows.push(['N°', 'OA', 'Enunciado'].concat(L.slice(0, c), ['Clave']).map((h) => ({ v: h, s: 'header' })));
        mc.forEach((q, i) => {
          const k = exam.key[i];
          eRows.push(
            [i + 1, oaOf(i), { v: RC.plainMath(q.stem), s: 'wrap' }]
              .concat(L.slice(0, c).map((_, j) => (q.options[j] != null ? { v: RC.plainMath(q.options[j]), s: j === k ? 'okWrap' : 'wrap' } : '')))
              .concat([k === null ? '–' : { v: L[k], s: 'bold' }])
          );
        });
        sheets.push({ name: 'Evaluación', rows: eRows, cols: [5, 12, 55].concat(new Array(c).fill(26), [7]), freeze: { row: 3 } });
      }

      // 2) Respuestas de cada estudiante, con la correcta.
      const withForms = !!exam.forms || rows.some(({ r }) => r.pie);
      const head = ['N°', 'Código', 'Nombre']
        .concat(withForms ? ['Fila', 'Pregunta (su hoja)', 'Pregunta (fila A)'] : ['Pregunta'])
        .concat(['OA', 'Marcó', 'Correcta', 'Resultado'])
        .concat(mc ? ['Enunciado', 'Alternativa que marcó', 'Alternativa correcta'] : []);
      const aRows = [[{ v: 'Respuestas por estudiante', s: 'title' }]];
      aRows.push([{ v: 'Una fila por pregunta de cada estudiante. Usa el filtro de la fila de títulos para ver un estudiante o sólo las respuestas incorrectas.', s: 'muted' }]);
      aRows.push(head.map((h) => ({ v: h, s: 'header' })));
      rows.forEach(({ r }, i) => {
        const g = app.grade(r);
        const qs = RC.reportQuestions(g.items, app.formMap(r), mc, objectives);
        const formTxt = r.pie ? 'PIE' : exam.forms && Number.isInteger(r.form) ? app.formLetter(r.form) : exam.forms ? '?' : 'A';
        for (const q of qs) {
          const bad = q.status === 'wrong' || q.status === 'multiple';
          const optText = (letter) => {
            const o = q.options.find((x) => x.letter === letter);
            return o ? `${letter}) ${o.text}` : '';
          };
          aRows.push(
            [i + 1, r.code || '', app.displayName(r)]
              .concat(withForms ? [formTxt, q.n, q.canon] : [q.n])
              .concat([
                q.oa,
                q.marked ? { v: q.marked, s: bad ? 'bad' : q.status === 'correct' ? 'ok' : 'normal' } : '—',
                q.key || '–',
                { v: RC.STATUS_TEXT[q.status] || '', s: q.status === 'correct' ? 'ok' : bad ? 'bad' : 'normal' },
              ])
              .concat(
                mc
                  ? [
                      { v: q.stem || '', s: 'wrap' },
                      q.marked && q.marked.indexOf('+') < 0 ? { v: optText(q.marked), s: bad ? 'badWrap' : 'wrap' } : q.marked ? { v: 'Marcó más de una', s: 'bad' } : '',
                      q.key ? { v: optText(q.key), s: 'okWrap' } : '',
                    ]
                  : []
              )
          );
        }
      });
      const lastCol = window.Xlsx ? window.Xlsx.colName(head.length - 1) : 'Z';
      sheets.push({
        name: 'Respuestas por estudiante',
        rows: aRows,
        cols: [5, 9, 26].concat(withForms ? [6, 10, 10] : [9], [12, 8, 9, 12], mc ? [45, 32, 32] : []),
        freeze: { row: 3, col: 3 },
        autoFilter: `A3:${lastCol}${3 + aRows.length - 3}`,
      });

      // 3) Retroalimentación e informes.
      const devs = devList();
      const fHead = ['N°', 'Código', 'Nombre', 'Nota', 'Informe (PDF)'];
      devs.forEach((d, i) => {
        fHead.push(`${d.label} puntaje (máx ${d.max})`);
        if (rubricOf(i)) fHead.push(`${d.label} rúbrica`);
        fHead.push(`${d.label} comentario`);
      });
      fHead.push('Comentario general');
      const fRows = [[{ v: 'Retroalimentación e informes', s: 'title' }]];
      fRows.push([{ v: 'El enlace «Ver informe» abre el PDF de cada estudiante (carpeta informes).', s: 'muted' }]);
      fRows.push(fHead.map((h) => ({ v: h, s: 'header' })));
      rows.forEach(({ r }, i) => {
        const g = app.grade(r);
        const fb = feedbackOf(r);
        const link = links[i] || {};
        const row = [
          i + 1,
          r.code || '',
          app.displayName(r),
          g.grade === null ? '' : { v: g.grade, s: g.grade >= exam.scoring.gradePass ? 'ok' : 'bad' },
          link.report ? { v: 'Ver informe', link: link.report, tooltip: link.report } : { v: 'sin informe', s: 'muted' },
        ];
        devs.forEach((d, k) => {
          const gd = (g.dev || [])[k] || {};
          row.push(gd.status === 'scored' ? gd.points : { v: 'sin puntaje', s: 'bad' });
          const rub = rubricOf(k);
          if (rub) row.push(fb.dev[k].picks.some((x) => x !== null) ? { v: RC.rubricSummary(rub, fb.dev[k].picks), s: 'wrap' } : '');
          row.push({ v: fb.dev[k].comment, s: 'wrap' });
        });
        row.push({ v: fb.general, s: 'wrap' });
        fRows.push(row);
      });
      const fCols = [5, 9, 26, 7, 13];
      devs.forEach((_, i) => {
        fCols.push(12);
        if (rubricOf(i)) fCols.push(40);
        fCols.push(40);
      });
      fCols.push(45);
      sheets.push({ name: 'Retroalimentación', rows: fRows, cols: fCols, freeze: { row: 3, col: 3 } });
      return sheets;
    },
  });

  Pro.retro = { reportData, openEditor, mcQuestions };
  // La tabla de desarrollo ya se dibujó: ahora muestra el estado de cada rúbrica.
  if (Pro.devRender) Pro.devRender();
})();
