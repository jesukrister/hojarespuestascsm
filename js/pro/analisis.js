/*
 * Versión Pro · Calidad de las preguntas (pestaña Resultados): dificultad,
 * discriminación y distractores de cada pregunta, confiabilidad de la prueba
 * y una sugerencia por pregunta. Permite anular una pregunta o cambiar su
 * clave, y deshacerlo después (la clave original queda en exam.pro.keyChanges).
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  const AC = window.AnalisisCore;
  if (!Pro || !AC) return;
  const { app, $ } = Pro;
  const esc = app.esc;
  const state = app.state;
  const LETTERS = 'ABCDEF';
  const detailOpen = new Set();
  let current = null; // último análisis mostrado (para copiar la tabla)

  const pct = (v) => (v === null || v === undefined ? '–' : Math.round(v * 100) + '%');
  const dec = (v) => (v === null || v === undefined ? '–' : app.fmt(v, 2));

  /** Claves cambiadas desde este cuadro: { pregunta (índice, fila A): clave original }. */
  function keyChanges() {
    const pro = state.exam.pro;
    const raw = pro && pro.keyChanges && typeof pro.keyChanges === 'object' ? pro.keyChanges : {};
    const out = {};
    for (const [q, k] of Object.entries(raw)) {
      const i = Number(q);
      const ok = Number.isInteger(i) && i >= 0 && i < state.exam.numQuestions && Number.isInteger(k) && k >= 0 && k < state.exam.numChoices;
      if (ok && state.exam.key[i] !== k) out[i] = k;
    }
    return out;
  }

  function setKeyChanges(map) {
    state.exam.pro = Object.assign({}, state.exam.pro || {}, { keyChanges: map });
  }

  /** Hojas que entran al análisis: las de la versión adecuada (PIE) y las de fila sin leer quedan fuera. */
  function split() {
    const all = app.sortedResults();
    const used = all.filter(({ r }) => !r.pie && !app.formUnknown(r));
    return {
      used,
      pie: all.filter(({ r }) => r.pie).length,
      unknown: all.filter(({ r }) => !r.pie && app.formUnknown(r)).length,
    };
  }

  function linkedToBook() {
    return !!(state.exam.pro && state.exam.pro.evalId);
  }

  function applyKey(q, value) {
    const changes = keyChanges();
    const original = q in changes ? changes[q] : state.exam.key[q];
    state.exam.key[q] = value;
    if (value === original) delete changes[q];
    else if (original !== null) changes[q] = original;
    setKeyChanges(changes);
    app.save();
    app.renderKey();
    app.renderResults();
  }

  function maxScoreText(counted) {
    const sc = state.exam.scoring;
    const dev = (state.exam.dev || []).reduce((s, d) => s + d.max, 0);
    return app.fmt(Math.round((counted * sc.pointsCorrect + dev) * 100) / 100, Number.isInteger(sc.pointsCorrect) ? 0 : 2);
  }

  const bookHint = () => (linkedToBook() ? ' Si ya guardaste las notas en el libro, vuelve a guardarlas.' : '');

  async function annul(q) {
    const counted = state.exam.key.filter((k) => k !== null).length;
    const ok = await Pro.confirm({
      title: `Anular la pregunta ${q + 1}`,
      html:
        `<p>La pregunta ${q + 1} dejará de contar para todos los estudiantes: el puntaje máximo baja de ${maxScoreText(counted)} a ${maxScoreText(counted - 1)} puntos y las notas se recalculan.</p>` +
        '<p class="muted small">Puedes deshacerlo cuando quieras con «Restaurar».</p>',
      ok: 'Anular la pregunta',
    });
    if (!ok) return;
    applyKey(q, null);
    app.toast(`Pregunta ${q + 1} anulada: las notas se recalcularon.${bookHint()}`);
  }

  async function rekey(q, to) {
    const from = state.exam.key[q];
    if (from === null || !(to >= 0 && to < state.exam.numChoices)) return;
    const ok = await Pro.confirm({
      title: `Cambiar la clave de la pregunta ${q + 1}`,
      html:
        `<p>La clave pasa de <b>${LETTERS[from]}</b> a <b>${LETTERS[to]}</b> y las notas se recalculan.</p>` +
        '<p class="muted small">Hazlo sólo si revisaste la pregunta y la clave estaba equivocada. Si la clave está bien, es un error frecuente de tus estudiantes: conviene reforzarlo en vez de cambiarla. Puedes deshacerlo con «Restaurar».</p>',
      ok: `Cambiar la clave a ${LETTERS[to]}`,
    });
    if (!ok) return;
    applyKey(q, to);
    app.toast(`Pregunta ${q + 1}: la clave ahora es ${LETTERS[to]}. Las notas se recalcularon.${bookHint()}`);
  }

  function restore(q) {
    const changes = keyChanges();
    if (!(q in changes)) return;
    applyKey(q, changes[q]);
    app.toast(`Pregunta ${q + 1}: vuelve a contar con la clave ${LETTERS[state.exam.key[q]]}.${bookHint()}`);
  }

  /* ---------- Pantalla ---------- */

  function dClass(d) {
    if (d >= 0.3) return 'good';
    if (d >= 0.2) return 'fair';
    if (d >= 0) return 'poor';
    return 'neg';
  }

  function barHtml(v, cls) {
    return `<span class="bar ${cls || ''}"><i style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></i></span>`;
  }

  function groupsHtml(it, res, original) {
    const key = it.key !== null ? it.key : original;
    const rows = it.options
      .map((o) => {
        const isKey = o.index === key;
        return `<tr class="${isKey ? 'is-key' : ''}"><td><b>${o.letter}</b>${isKey ? ' <small>(clave)</small>' : ''}</td>` +
          `<td>${barHtml(o.pct)}${pct(o.pct)}</td>` +
          `<td>${barHtml(o.upper, isKey ? '' : 'mid')}${pct(o.upper)}</td>` +
          `<td>${barHtml(o.lower, isKey ? '' : 'mid')}${pct(o.lower)}</td></tr>`;
      })
      .join('');
    return (
      `<table class="pq-groups"><thead><tr><th>Alternativa</th><th>Todos (${res.n})</th>` +
      `<th>${res.groupSize} con mejor puntaje</th><th>${res.groupSize} con menor puntaje</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<p class="muted small">Omitida por el ${pct(it.blank)}${it.multiple ? ` · doble marca ${pct(it.multiple)}` : ''}. ` +
      'La clave la deberían elegir más los estudiantes de mejor puntaje; un buen distractor, los de menor puntaje.</p>'
    );
  }

  function rowHtml(it, res, changes) {
    const q = it.question - 1;
    const orig = changes[q];
    const annulled = orig !== undefined && state.exam.key[q] === null;
    const rekeyed = orig !== undefined && !annulled;
    let keyCell;
    if (annulled) keyCell = `<span class="tag bad">Anulada</span><small class="muted">clave ${LETTERS[orig]}</small>`;
    else if (it.key === null) keyCell = '<span class="muted">sin clave</span>';
    else keyCell = `<b>${LETTERS[it.key]}</b>${rekeyed ? `<small class="muted">antes ${LETTERS[orig]}</small>` : ''}`;

    let pCell = '<span class="muted">–</span>';
    if (it.p !== null) {
      const cls = it.p < 0.3 ? 'low' : it.p < 0.5 ? 'mid' : '';
      pCell = `${barHtml(it.p, cls)}${pct(it.p)}<small>${it.difficulty}</small>`;
    } else if (annulled) {
      pCell = `${pct(it.options[orig].pct)}<small>con la clave ${LETTERS[orig]}</small>`;
    }

    const dCell =
      it.d === null || !res.enough
        ? '<span class="muted">–</span>'
        : `<b class="pq-d ${dClass(it.d)}" title="Correlación punto-biserial corregida: ${dec(it.rpb)}">${dec(it.d)}</b><small>${it.discrimination}</small>`;

    const keyIndex = it.key !== null ? it.key : annulled ? orig : null;
    const opts = it.options
      .map((o) => {
        const cls = ['pq-opt'];
        let title = `${o.letter}: ${o.count} estudiante(s)`;
        if (o.index === keyIndex) {
          cls.push('key');
          title += ' · clave';
        } else if (res.enough && it.unused.indexOf(o.letter) >= 0) {
          cls.push('unused');
          title += ' · nadie la eligió';
        } else if (o.letter === it.rival || o.letter === it.popular) {
          cls.push('rival');
          title += ' · la eligieron más que la clave';
        }
        return `<span class="${cls.join(' ')}" title="${esc(title)}">${o.letter} ${pct(o.pct)}</span>`;
      })
      .join('');

    let tag = '';
    if (it.level === 'revisar') tag = '<span class="tag bad">Revisar</span>';
    else if (it.level === 'mejorar') tag = '<span class="tag warn">Mejorar</span>';
    let text = esc(it.suggestion);
    if (annulled) text = 'No cuenta en el puntaje de nadie.';
    else if (rekeyed) text = `Clave cambiada de ${LETTERS[orig]} a ${LETTERS[it.key]}. ` + text;

    const acts = [];
    if (orig !== undefined) {
      acts.push(`<button type="button" class="btn ghost small" data-pq-restore="${q}">↺ Restaurar${annulled ? '' : ' clave ' + LETTERS[orig]}</button>`);
    } else if (it.key !== null) {
      if (it.altKey !== null) acts.push(`<button type="button" class="btn secondary small" data-pq-rekey="${q}" data-to="${it.altKey}">Cambiar clave a ${LETTERS[it.altKey]}</button>`);
      acts.push(`<button type="button" class="btn ghost small" data-pq-annul="${q}">Anular</button>`);
    }
    const open = detailOpen.has(q) && res.groupSize > 0;
    if (res.groupSize > 0) {
      acts.push(`<button type="button" class="btn ghost small" data-pq-more="${q}" aria-expanded="${open}">${open ? '▾' : '▸'} Grupos</button>`);
    }
    const lvlCls = annulled ? 'annulled' : it.level;
    let html =
      `<tr class="pq-row lvl-${lvlCls}"><td class="num"><b>${it.question}</b></td><td class="pq-key">${keyCell}</td>` +
      `<td class="pq-p">${pCell}</td><td class="pq-dcell">${dCell}</td><td class="pq-opts">${opts}</td>` +
      `<td class="pq-sug">${tag}${text}<div class="pq-acts">${acts.join('')}</div></td></tr>`;
    if (open) html += `<tr class="pq-detail"><td colspan="6">${groupsHtml(it, res, orig)}</td></tr>`;
    return html;
  }

  function render() {
    const card = $('#proQuality');
    if (!card) return;
    const exam = state.exam;
    const changes = keyChanges();
    const hasKey = exam.key.some((k) => k !== null);
    card.hidden = !state.results.length || !hasKey;
    if (card.hidden) {
      current = null;
      return;
    }
    const { used, pie, unknown } = split();
    const res = AC.analyze(
      used.map(({ r }) => app.canonAnswers(r)),
      exam.key,
      exam.numChoices
    );
    current = res;
    const nChanged = Object.keys(changes).length;

    const stat = (value, label, cls, title) =>
      `<div class="stat${cls ? ' ' + cls : ''}"${title ? ` title="${esc(title)}"` : ''}><b>${value}</b><span>${label}</span></div>`;
    $('#pqSummary').innerHTML = [
      stat(
        res.kr20 === null ? '–' : dec(res.kr20),
        'Confiabilidad (KR-20)' + (res.reliability ? ': ' + res.reliability : ''),
        res.kr20 !== null && res.kr20 < 0.6 ? 'warn' : '',
        'Qué tan consistente es la prueba: 0,80 o más es alta; entre 0,60 y 0,80 es lo habitual en pruebas de aula.'
      ),
      stat(pct(res.meanP), 'Acierto promedio' + (res.meanP !== null ? ` (${AC.difficultyLabel(res.meanP)})` : '')),
      stat(res.review, 'Preguntas para revisar', res.review ? 'bad' : ''),
      stat(res.improve, 'Preguntas para mejorar', res.improve ? 'warn' : ''),
      nChanged ? stat(nChanged, 'Anuladas o con clave cambiada') : '',
    ].join('');

    const notes = [];
    if (!res.enough) {
      notes.push(
        `Con ${res.n} hoja(s) todavía no se puede medir bien la discriminación: por ahora ves el acierto y las respuestas de cada alternativa (y un aviso si muchos eligieron la misma alternativa incorrecta). Con ${AC.MIN_STUDENTS} hojas o más aparecen la discriminación y todas las sugerencias.`
      );
    }
    if (pie) notes.push(`No incluye ${pie} hoja(s) PIE (versión adecuada, con una alternativa menos).`);
    if (unknown) notes.push(`No incluye ${unknown} hoja(s) con la fila sin leer: corrígela en el detalle de la hoja.`);
    if (exam.forms) notes.push('Las preguntas se numeran como en la fila A.');
    $('#pqNote').hidden = !notes.length;
    $('#pqNote').innerHTML = notes.map(esc).join('<br>');

    const filter = $('#pqFilter').value;
    const shown = res.items.filter((it) => filter === 'all' || it.level === 'revisar' || it.level === 'mejorar' || (it.question - 1) in changes);
    const table = $('#pqTable');
    $('#pqEmpty').hidden = shown.length > 0 || !res.n;
    $('#pqEmpty').textContent =
      filter === 'all' ? '' : res.enough ? '✓ No hay preguntas que convenga revisar o mejorar.' : '✓ Por ahora no hay avisos.';
    if (!shown.length || !res.n) {
      table.innerHTML = '';
      return;
    }
    table.innerHTML =
      '<thead><tr><th class="num">N°</th><th>Clave</th><th>Acierto</th><th>Discriminación</th>' +
      `<th>Respuestas (${LETTERS.slice(0, exam.numChoices).split('').join(' · ')})</th><th>Sugerencia</th></tr></thead>` +
      `<tbody>${shown.map((it) => rowHtml(it, res, changes)).join('')}</tbody>`;
  }

  /** Tabla completa para pegar en Excel. */
  function tableText() {
    const res = current;
    if (!res) return '';
    const changes = keyChanges();
    const c = state.exam.numChoices;
    const head = ['N°', 'Clave', 'Acierto', 'Dificultad', 'Discriminación (D)', 'Calidad', 'Punto-biserial'];
    for (let k = 0; k < c; k++) head.push(`% ${LETTERS[k]}`);
    head.push('% omitida', 'Sugerencia');
    const num = (v) => (v === null || v === undefined ? '' : app.fmt(v, 2));
    const lines = res.items.map((it) => {
      const q = it.question - 1;
      const annulled = q in changes && state.exam.key[q] === null;
      const row = [
        it.question,
        annulled ? `anulada (${LETTERS[changes[q]]})` : it.key === null ? 'sin clave' : LETTERS[it.key],
        it.p === null ? '' : Math.round(it.p * 100) + '%',
        it.difficulty || '',
        res.enough ? num(it.d) : '',
        res.enough ? it.discrimination || '' : '',
        res.enough ? num(it.rpb) : '',
      ];
      for (const o of it.options) row.push(Math.round(o.pct * 100) + '%');
      row.push(Math.round(it.blank * 100) + '%', annulled ? 'Anulada' : it.suggestion);
      return row.join('\t');
    });
    const title = `${state.exam.title || 'Prueba'} · ${res.n} hojas · KR-20: ${res.kr20 === null ? '–' : app.fmt(res.kr20, 2)}`;
    return [title, head.join('\t')].concat(lines).join('\n');
  }

  $('#pqFilter').value = Pro.ui.pqFilter === 'all' ? 'all' : 'review';
  $('#pqFilter').addEventListener('change', () => {
    Pro.ui.pqFilter = $('#pqFilter').value;
    Pro.saveUi();
    render();
  });
  $('#pqCopy').addEventListener('click', async () => {
    const text = tableText();
    if (!text) return;
    app.toast((await Pro.copyText(text)) ? 'Tabla copiada: pégala en Excel o en un documento.' : 'No se pudo copiar la tabla.');
  });
  $('#pqTable').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pqAnnul !== undefined) annul(Number(b.dataset.pqAnnul));
    else if (b.dataset.pqRekey !== undefined) rekey(Number(b.dataset.pqRekey), Number(b.dataset.to));
    else if (b.dataset.pqRestore !== undefined) restore(Number(b.dataset.pqRestore));
    else if (b.dataset.pqMore !== undefined) {
      const q = Number(b.dataset.pqMore);
      if (detailOpen.has(q)) detailOpen.delete(q);
      else detailOpen.add(q);
      render();
    }
  });
  app.on('results', () => {
    if (!$('#tab-resultados').hidden) render();
  });
  app.on('resultsCleared', () => detailOpen.clear());
  // La página puede abrir directo en Resultados (antes de cargar este módulo).
  if (!$('#tab-resultados').hidden) render();

  Pro.quality = { render, keyChanges, current: () => current };
})();
