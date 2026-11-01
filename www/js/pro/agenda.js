/*
 * CorrigeYa Plus · Agenda y horario docente:
 *  - en Inicio, la tarjeta «Hoy»: qué curso hay ahora y cuál sigue, lo de hoy y
 *    mañana, y los recordatorios (notas pendientes, cierre del periodo);
 *  - la pestaña Agenda: próximos días, horario semanal y exportar al calendario.
 * Se guarda en el equipo (IndexedDB), va en el respaldo y, con cuenta, en la
 * nube (nube.js). La lógica está en agenda-core.js; sólo se ve con Plus (plus.js).
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  const A = window.AgendaCore;
  if (!Pro || !A) return;
  const { app, L, kv, $, $$ } = Pro;
  const esc = app.esc;
  const KEY = 'agenda';

  let data = A.empty();
  let horizon = 30; // días que se ven en «Próximos días»
  const listeners = [];

  const ready = kv
    .get(KEY)
    .then((v) => {
      data = A.sanitize(v);
    })
    .catch((e) => {
      console.error(e);
      data = A.empty();
    });

  let writing = Promise.resolve();
  function persist() {
    const d = data;
    writing = writing.then(() => kv.put(KEY, d)).catch((e) => {
      console.error(e);
      app.toast('No se pudo guardar la agenda en este equipo.');
    });
    for (const fn of listeners) fn();
    renderAll();
    return writing;
  }

  Pro.agenda = {
    ready,
    get: () => data,
    set: async (v) => {
      data = A.sanitize(v);
      await persist();
    },
    onChange: (fn) => listeners.push(fn),
  };

  const on = () => !!(Pro.plus && Pro.plus.active()) && !app.simpleMode();
  const today = () => A.isoOf(new Date());
  const courseName = (id) => {
    const c = Pro.course(id);
    return c ? c.name || L.courseLabel(c) : '';
  };
  const courseOptions = (sel) =>
    '<option value="">— Sin curso —</option>' +
    Pro.book.courses.map((c) => `<option value="${esc(c.id)}"${c.id === sel ? ' selected' : ''}>${esc(L.courseLabel(c))}</option>`).join('');
  const blockText = (b) => [courseName(b.courseId), b.label].filter(Boolean).join(' · ') || 'Clase';

  /* ---------- Listas ---------- */

  function eventRow(e) {
    const k = A.KINDS[e.kind] || A.KINDS.otro;
    const course = courseName(e.courseId);
    const sub = [course, e.fromBook ? 'libro de notas' : ''].filter(Boolean).join(' · ');
    return `<li class="ag-ev${e.done ? ' done' : ''}" data-ag-ev="${esc(e.id)}" tabindex="0">
      <span class="ag-time">${e.time ? esc(e.time) : ''}</span>
      <span class="ag-ic" aria-hidden="true">${k.icon}</span>
      <span class="ag-t"><b>${esc(e.title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
      ${e.fromBook ? '' : `<button type="button" class="ag-check" data-ag-done="${esc(e.id)}" aria-pressed="${e.done}" title="${e.done ? 'Marcar como pendiente' : 'Marcar como hecho'}">${e.done ? '✔' : ''}</button>`}
    </li>`;
  }

  function dayList(from, to, showDone) {
    return A.days(data, Pro.book, from, to)
      .map((d) => ({ date: d.date, events: d.events.filter((e) => showDone || !e.done) }))
      .filter((d) => d.events.length);
  }

  function daysHtml(list, emptyText) {
    const t = today();
    return list.length
      ? list.map((d) => `<div class="ag-day"><h3>${esc(A.dayLabel(d.date, t))}</h3><ul>${d.events.map(eventRow).join('')}</ul></div>`).join('')
      : `<p class="muted small">${emptyText}</p>`;
  }

  function remindersHtml(list) {
    if (!list.length) return '';
    return `<ul class="ag-rems">${list
      .map(
        (r) =>
          `<li class="ag-rem ${r.kind}"${r.courseId ? ` data-ag-course="${esc(r.courseId)}" tabindex="0"` : ''}><span aria-hidden="true">${r.kind === 'cierre' ? '📌' : '⚠️'}</span><span>${
            r.courseId ? `<b>${esc(courseName(r.courseId))}</b> · ` : ''
          }${esc(r.text)}</span></li>`
      )
      .join('')}</ul>`;
  }

  /** Horario: qué curso hay ahora y cuál sigue. */
  function nowHtml() {
    if (!data.blocks.length) return '<p class="muted small">Agrega tu horario en la agenda y aquí verás qué curso tienes ahora y cuál sigue.</p>';
    const x = A.nowAndNext(data, new Date());
    let html = '';
    if (x.now) {
      html += `<div class="ag-now-card"><span>Ahora</span><b>${esc(blockText(x.now))}</b><small>${x.now.room ? `${esc(x.now.room)} · ` : ''}hasta las ${x.now.end}</small>${
        x.now.courseId ? `<button type="button" class="btn secondary small" data-ag-course="${esc(x.now.courseId)}">👥 Ver el curso</button>` : ''
      }</div>`;
    }
    if (x.next) html += `<p class="ag-next"><span>Sigue</span> <b>${esc(blockText(x.next))}</b> a las ${x.next.start}${x.next.room ? ` · ${esc(x.next.room)}` : ''}</p>`;
    if (!x.now && !x.next) html += `<p class="muted small">${x.today.length ? 'Terminaron tus clases de hoy. 🙌' : 'Hoy no tienes clases en el horario.'}</p>`;
    return html;
  }

  /* ---------- Inicio: tarjeta «Hoy» ---------- */

  function renderHome() {
    const card = $('#agHome');
    if (!card) return;
    card.hidden = !on();
    if (card.hidden) return;
    const t = today();
    $('#agHomeTitle').textContent = `Hoy, ${A.longDate(t)}`;
    $('#agHomeNow').innerHTML = nowHtml();
    const list = dayList(t, A.addDays(t, 1), false);
    $('#agHomeList').innerHTML =
      (list.length ? daysHtml(list, '') : '<p class="muted small">Nada agendado para hoy ni mañana.</p>') + remindersHtml(A.reminders(Pro.book, t).slice(0, 3));
  }

  /* ---------- Pestaña Agenda ---------- */

  function renderWeek() {
    const days = [1, 2, 3, 4, 5].concat(data.blocks.some((b) => b.day === 6) ? [6] : []);
    $('#agWeek').innerHTML = days
      .map((d) => {
        const list = A.blocksOf(data, d);
        return `<div class="ag-wday"><h3>${A.DAYS[d]}</h3>${
          list.length
            ? list
                .map(
                  (b) =>
                    `<button type="button" class="ag-block" data-ag-block="${esc(b.id)}"><span>${b.start}–${b.end}</span><b>${esc(blockText(b))}</b>${b.room ? `<small>${esc(b.room)}</small>` : ''}</button>`
                )
                .join('')
            : '<p class="muted small">Sin clases</p>'
        }</div>`;
      })
      .join('');
  }

  function renderTab() {
    if ($('#tab-agenda').hidden) return;
    const t = today();
    const showDone = $('#agShowDone').checked;
    $('#agDays').innerHTML = daysHtml(dayList(t, A.addDays(t, horizon), showDone), `No hay nada agendado en los próximos ${horizon} días. Toca «＋ Agregar».`);
    $('#agPast').innerHTML = daysHtml(dayList(A.addDays(t, -30), A.addDays(t, -1), true).reverse(), 'Nada en los últimos 30 días.');
    $('#agReminders').innerHTML = remindersHtml(A.reminders(Pro.book, t).slice(0, 8));
    renderWeek();
  }

  function renderAll() {
    renderHome();
    renderTab();
  }

  /* ---------- Evento: agregar o editar ---------- */

  let editing = null;
  let kind = 'prueba';

  function renderKinds() {
    $('#agKind').innerHTML = Object.entries(A.KINDS)
      .map(([k, v]) => `<button type="button" role="radio" aria-checked="${k === kind}" data-ag-kind="${k}">${v.icon} ${v.label}</button>`)
      .join('');
  }

  function openEvent(id) {
    const e = id ? data.events.find((x) => x.id === id) : null;
    editing = e ? e.id : null;
    kind = e ? e.kind : 'prueba';
    renderKinds();
    $('#agEventTitle').textContent = e ? 'Editar' : 'Agregar a la agenda';
    $('#agTitle').value = e ? e.title : '';
    $('#agDate').value = e ? e.date : today();
    $('#agTime').value = e ? e.time : '';
    $('#agCourse').innerHTML = courseOptions(e ? e.courseId : '');
    $('#agRemind').value = e ? (e.remind === null ? '' : String(e.remind)) : '1440';
    $('#agNotes').value = e ? e.notes : '';
    $('#agDone').checked = !!(e && e.done);
    $('#agDoneWrap').hidden = !e;
    $('#agDelete').hidden = !e;
    $('#agEventDialog').showModal();
    setTimeout(() => $('#agTitle').focus(), 50);
  }

  function readEvent() {
    const remind = $('#agRemind').value;
    return A.sanitizeEvent({
      id: editing || A.uid(),
      kind,
      title: $('#agTitle').value,
      date: $('#agDate').value,
      time: $('#agTime').value,
      courseId: $('#agCourse').value,
      remind: remind === '' ? null : Number(remind),
      notes: $('#agNotes').value,
      done: $('#agDone').checked,
      updatedAt: Date.now(),
    });
  }

  function eventProblem() {
    if (!$('#agTitle').value.trim()) return 'Escribe qué es (por ejemplo, «Prueba Unidad 3»).';
    if (!$('#agDate').value) return 'Elige la fecha.';
    return 'Revisa la fecha y la hora.';
  }

  function saveEvent() {
    const ev = readEvent();
    if (!ev) return app.toast(eventProblem());
    data.events = data.events.filter((x) => x.id !== ev.id).concat([ev]);
    persist();
    $('#agEventDialog').close();
    app.toast(editing ? 'Cambios guardados.' : `Agregado a la agenda: ${A.dayLabel(ev.date, today()).toLowerCase()}.`);
  }

  async function deleteEvent() {
    const e = data.events.find((x) => x.id === editing);
    if (!e) return;
    const ok = await Pro.confirm({ title: 'Eliminar de la agenda', html: `<p>¿Eliminar «${esc(e.title)}»?</p>`, ok: 'Eliminar', danger: true });
    if (!ok) return;
    data.events = data.events.filter((x) => x.id !== e.id);
    persist();
    $('#agEventDialog').close();
  }

  /** Descarga un calendario (.ics): se abre con Google Calendar o el calendario del teléfono. */
  function downloadIcs(name, events, blocks) {
    const text = A.toIcs({ events, blocks, courseName });
    app.download(name, new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    app.toast('Abre el archivo descargado para agregarlo a tu calendario, con sus avisos.');
  }

  function oneIcs() {
    const ev = readEvent();
    if (!ev) return app.toast(eventProblem());
    downloadIcs(`${app.slug ? app.slug(ev.title) : 'evento'}.ics`, [ev], []);
  }

  function allIcs() {
    const t = today();
    const events = data.events.filter((e) => !e.done && e.date >= t).concat(A.bookEvents(Pro.book).filter((e) => e.date >= t));
    if (!events.length && !data.blocks.length) return app.toast('La agenda está vacía: agrega algo primero.');
    downloadIcs('agenda-docente.ics', events, data.blocks);
  }

  /* ---------- Horario: bloques ---------- */

  let editingBlock = null;

  function openBlock(id) {
    const b = id ? data.blocks.find((x) => x.id === id) : null;
    editingBlock = b ? b.id : null;
    $('#agBlockTitle').textContent = b ? 'Editar bloque' : 'Bloque del horario';
    $('#agBlockDays').innerHTML = [1, 2, 3, 4, 5, 6]
      .map((d) => `<label class="check"><input type="checkbox" value="${d}"${b && b.day === d ? ' checked' : ''}> ${A.DAYS[d]}</label>`)
      .join('');
    const last = data.blocks[data.blocks.length - 1];
    $('#agBlockStart').value = b ? b.start : last ? last.end : '08:00';
    $('#agBlockEnd').value = b ? b.end : '';
    if (!b) {
      const [h, m] = $('#agBlockStart').value.split(':').map(Number);
      const end = h * 60 + m + 90;
      $('#agBlockEnd').value = `${String(Math.min(23, Math.floor(end / 60))).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
    }
    $('#agBlockCourse').innerHTML = courseOptions(b ? b.courseId : '');
    $('#agBlockLabel').value = b ? b.label : '';
    $('#agBlockRoom').value = b ? b.room : '';
    $('#agBlockDelete').hidden = !b;
    $('#agBlockDialog').showModal();
  }

  function saveBlock() {
    const days = $$('#agBlockDays input:checked').map((x) => Number(x.value));
    if (!days.length) return app.toast('Elige al menos un día.');
    const start = $('#agBlockStart').value;
    const end = $('#agBlockEnd').value;
    if (!start || !end || end <= start) return app.toast('Revisa las horas: «Hasta» debe ser después de «Desde».');
    const base = { start, end, courseId: $('#agBlockCourse').value, label: $('#agBlockLabel').value, room: $('#agBlockRoom').value, updatedAt: Date.now() };
    if (!base.courseId && !base.label.trim()) return app.toast('Elige un curso o escribe la asignatura.');
    const made = days.map((day, i) => A.sanitizeBlock(Object.assign({ id: i === 0 && editingBlock ? editingBlock : A.uid(), day }, base))).filter(Boolean);
    data.blocks = data.blocks.filter((x) => !made.some((m) => m.id === x.id)).concat(made);
    persist();
    $('#agBlockDialog').close();
    app.toast(made.length > 1 ? `Agregado en ${made.length} días del horario.` : 'Horario guardado.');
  }

  async function deleteBlock() {
    const b = data.blocks.find((x) => x.id === editingBlock);
    if (!b) return;
    const ok = await Pro.confirm({ title: 'Eliminar del horario', html: `<p>¿Eliminar ${esc(blockText(b))} del ${A.DAYS[b.day].toLowerCase()} (${b.start}–${b.end})?</p>`, ok: 'Eliminar', danger: true });
    if (!ok) return;
    data.blocks = data.blocks.filter((x) => x.id !== b.id);
    persist();
    $('#agBlockDialog').close();
  }

  /* ---------- Eventos de la pantalla ---------- */

  function openCourse(id) {
    if (!Pro.course(id)) return;
    Pro.ui.courseId = id;
    Pro.ui.view = 'notas';
    Pro.saveUi();
    app.showTab('cursos');
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-ag-open]')) {
      app.showTab('agenda');
      window.scrollTo(0, 0);
      return;
    }
    if (t.closest('[data-ag-add]')) return openEvent(null);
    const done = t.closest('[data-ag-done]');
    if (done) {
      const ev = data.events.find((x) => x.id === done.dataset.agDone);
      if (ev) {
        ev.done = !ev.done;
        ev.updatedAt = Date.now();
        persist();
      }
      return;
    }
    const row = t.closest('[data-ag-ev]');
    if (row) {
      const id = row.dataset.agEv;
      if (id.startsWith('libro:')) return openCourse(id.split(':')[1]);
      return openEvent(id);
    }
    const course = t.closest('[data-ag-course]');
    if (course && (course.closest('#agHome') || course.closest('#tab-agenda'))) return openCourse(course.dataset.agCourse);
    const block = t.closest('[data-ag-block]');
    if (block) return openBlock(block.dataset.agBlock);
    const k = t.closest('[data-ag-kind]');
    if (k) {
      kind = k.dataset.agKind;
      renderKinds();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const el = e.target.closest('[data-ag-ev], .ag-rem[data-ag-course]');
    if (el && el === e.target) el.click();
  });
  $('#agSave').addEventListener('click', saveEvent);
  $('#agDelete').addEventListener('click', deleteEvent);
  $('#agOneIcs').addEventListener('click', oneIcs);
  $('#agIcs').addEventListener('click', allIcs);
  $('#agAddBlock').addEventListener('click', () => openBlock(null));
  $('#agBlockSave').addEventListener('click', saveBlock);
  $('#agBlockDelete').addEventListener('click', deleteBlock);
  $('#agShowDone').addEventListener('change', renderTab);
  $('#agMore').addEventListener('click', () => {
    horizon += 30;
    renderTab();
  });
  $('#agTitle').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveEvent();
  });

  app.on('home', renderHome);
  app.on('tab', (name) => {
    if (name !== 'agenda') return;
    if (!on()) return app.showTab('inicio');
    renderTab();
  });
  // El libro de notas cambió (evaluaciones nuevas o notas): se actualizan los recordatorios.
  const saveBook = Pro.saveBook;
  Pro.saveBook = (...args) => {
    const out = saveBook(...args);
    renderAll();
    return out;
  };
  // «Ahora» y «Sigue» cambian con la hora.
  setInterval(() => {
    if (document.documentElement.dataset.tab === 'inicio') renderHome();
  }, 60000);

  Promise.all([Pro.ready, ready]).then(() => {
    renderAll();
    if (document.documentElement.dataset.tab === 'agenda' && !on()) app.showTab('inicio');
  });
})();
