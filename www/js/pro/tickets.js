/*
 * Versión Pro · Tickets de salida (mini controles de 3 a 10 preguntas, 8 por
 * página), escaneo de PDF y de varias hojas por foto, y la lista "Para
 * reforzar" por objetivo de aprendizaje.
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  if (!Pro) return;
  const { app, L, $, $$ } = Pro;
  const esc = app.esc;
  const state = app.state;
  const LETTERS = 'ABCDEF';

  /* ---------- Escanear: PDF y varias hojas por foto ---------- */
  const files = $('#filesInput');
  if (files) files.accept = 'image/*,application/pdf,.pdf';
  const filesLabel = document.querySelector('label[for="filesInput"]');
  if (filesLabel) filesLabel.textContent = '🖼️ Subir imágenes o PDF';

  /* ---------- Ticket de salida ---------- */

  function p2(n) {
    return String(n).padStart(2, '0');
  }

  function parseKey(text, n, c) {
    const out = [];
    for (const ch of String(text || '').toUpperCase()) {
      if (out.length >= n) break;
      const i = LETTERS.indexOf(ch);
      if (i >= 0) out.push(i < c ? i : null);
      else if ('-_?'.indexOf(ch) >= 0) out.push(null);
    }
    while (out.length < n) out.push(null);
    return out;
  }

  function updateTicketInfo() {
    const n = Math.min(10, Math.max(1, parseInt($('#ptQuestions').value, 10) || 5));
    const c = parseInt($('#ptChoices').value, 10) || 4;
    const key = parseKey($('#ptKey').value, n, c);
    const set = key.filter((k) => k !== null).length;
    $('#ptKeyInfo').textContent = `${set} de ${n} preguntas con clave (${LETTERS.slice(0, c).split('').join(', ')}; "-" = sin clave).`;
    const course = Pro.course($('#ptCourse').value);
    $('#ptNames').disabled = !course;
    if (!course) $('#ptNames').checked = false;
  }

  function openTicketDialog() {
    const d = new Date();
    $('#ptTitle').value = `Ticket de salida ${p2(d.getDate())}-${p2(d.getMonth() + 1)}`;
    $('#ptQuestions').value = '5';
    $('#ptChoices').value = '4';
    $('#ptKey').value = '';
    $('#ptOa').value = '';
    const link = state.exam.pro && state.exam.pro.courseId;
    $('#ptCourse').innerHTML =
      '<option value="">— Sin curso —</option>' +
      Pro.book.courses.map((c) => `<option value="${esc(c.id)}"${c.id === link ? ' selected' : ''}>${esc(L.courseLabel(c))}</option>`).join('');
    $('#ptNames').checked = !!Pro.course($('#ptCourse').value);
    $('#ptWarn').hidden = true;
    updateTicketInfo();
    $('#proTicketDialog').showModal();
    setTimeout(() => $('#ptKey').focus(), 30);
  }

  async function createTicket() {
    const n = Math.min(10, Math.max(1, parseInt($('#ptQuestions').value, 10) || 5));
    const c = parseInt($('#ptChoices').value, 10) || 4;
    const key = parseKey($('#ptKey').value, n, c);
    const course = Pro.course($('#ptCourse').value);
    const oa = $('#ptOa').value.trim().replace(/[:=]/g, ' ').trim();
    const warn = $('#ptWarn');
    if (!key.some((k) => k !== null)) {
      warn.hidden = false;
      warn.textContent = 'Escribe la clave de respuestas (por ejemplo ABCDA) para poder corregir los tickets.';
      return;
    }
    const cur = state.exam;
    const busy = state.results.length || cur.key.some((k) => k !== null) || cur.title.trim();
    if (busy) {
      $('#proTicketDialog').close();
      const ok = await Pro.confirm({
        title: 'Crear ticket de salida',
        html: `<p>El ticket reemplaza la prueba actual${cur.title ? ` («${esc(cur.title)}»)` : ''}.</p>${
          state.results.length
            ? `<p class="alert warn">Sus ${state.results.length} hoja(s) escaneada(s) se borrarán. Si las necesitas, guárdalas antes en el libro de notas o descarga las evidencias.</p>`
            : ''
        }`,
        ok: 'Crear ticket',
      });
      if (!ok) return;
    }
    app.replaceExam({
      title: $('#ptTitle').value.trim() || 'Ticket de salida',
      subtitle: course ? L.courseLabel(course) : '',
      paper: cur.paper,
      numQuestions: n,
      numChoices: c,
      idDigits: 2,
      format: 'ticket',
      key,
      scoring: Object.assign({}, cur.scoring),
      levels: Object.assign({}, cur.levels),
      oaText: oa ? `${oa}: 1-${n}` : '',
      sheetFields: { curso: false, fecha: false, rut: false },
      roster: course ? L.rosterText(course) : '',
      pro: { courseId: course ? course.id : null, evalId: null },
    });
    if ($('#proTicketDialog').open) $('#proTicketDialog').close();
    Pro.renderAll();
    app.showTab('hoja');
    if (course && $('#ptNames').checked && Pro.showNamesFor) {
      Pro.showNamesFor(course.id);
      app.toast('Ticket creado: imprime los tickets con el nombre de cada estudiante (8 por página).');
    } else {
      app.toast('Ticket creado: imprímelo aquí (8 por página) y recorta por las líneas.');
    }
  }

  $('#proNewTicket').addEventListener('click', openTicketDialog);
  for (const id of ['#ptQuestions', '#ptChoices', '#ptKey', '#ptCourse']) $(id).addEventListener('input', updateTicketInfo);
  $('#ptCourse').addEventListener('change', () => {
    $('#ptNames').checked = !!Pro.course($('#ptCourse').value);
    updateTicketInfo();
  });
  $('#ptCreate').addEventListener('click', createTicket);

  // Aviso mientras la prueba actual es un ticket, con el botón para volver a
  // una prueba normal (1 hoja por página).
  function renderTicketNotice() {
    $('#proTicketActive').hidden = state.exam.format !== 'ticket';
  }
  $('#proTicketExit').addEventListener('click', () => app.useFormat('full'));
  app.on('save', renderTicketNotice);
  renderTicketNotice();

  /* ---------- Para reforzar (por objetivo de aprendizaje) ---------- */

  let reinforceText = '';
  function renderReinforce() {
    const card = $('#proReinforce');
    if (!card) return;
    const objectives = app.currentObjectives().objectives;
    const rows = state.results.length && objectives.length ? app.sortedResults() : [];
    card.hidden = !rows.length;
    if (!rows.length) return;
    const per = rows.map((x) => ({ r: x.r, oa: app.oaResults(x.g) }));
    const who = (r) => {
      const name = app.displayName(r);
      return (r.code ? `N° ${r.code}` : '') + (name ? (r.code ? ' · ' : '') + name : r.code ? '' : r.fileName);
    };
    const lines = [];
    const html = objectives
      .map((o, i) => {
        const vals = per.map((p) => ({ r: p.r, o: p.oa[i] })).filter((x) => x.o && x.o.percent !== null);
        const avg = vals.length ? vals.reduce((s, x) => s + x.o.percent, 0) / vals.length : null;
        const nl = vals.filter((x) => x.o.level === 'NL');
        const ml = vals.filter((x) => x.o.level === 'ML');
        lines.push(`${o.name} (logro del curso ${avg === null ? '–' : Math.round(avg) + '%'})`);
        lines.push(`  No logrado: ${nl.length ? nl.map((x) => who(x.r)).join(', ') : 'nadie'}`);
        lines.push(`  Medianamente logrado: ${ml.length ? ml.map((x) => who(x.r)).join(', ') : 'nadie'}`);
        const chips = (list, cls) =>
          list.length ? list.map((x) => `<span class="pro-chip ${cls}" title="${esc(Math.round(x.o.percent) + '%')}">${esc(who(x.r))}</span>`).join('') : '<span class="muted small">nadie</span>';
        return `<div class="pro-reinforce-oa">
          <h3>${esc(o.name)} <span class="muted small">logro del curso ${avg === null ? '–' : Math.round(avg) + '%'} · ${vals.length} estudiante(s)</span></h3>
          <p><b class="grade-fail">No logrado (${nl.length}):</b> ${chips(nl, 'nl')}</p>
          <p><b class="pro-ml">Medianamente logrado (${ml.length}):</b> ${chips(ml, 'ml')}</p>
        </div>`;
      })
      .join('');
    reinforceText = `${state.exam.title || 'Prueba'} · para reforzar\n` + lines.join('\n');
    $('#proReinforceBody').innerHTML = html;
  }
  $('#proReinforceCopy').addEventListener('click', async () => {
    if (await Pro.copyText(reinforceText)) app.toast('Lista copiada.');
    else app.toast('No se pudo copiar la lista.');
  });
  app.on('results', renderReinforce);
})();
