/*
 * Versión Pro · Hojas de respuesta (o tickets) con el nombre de cada
 * estudiante y su N° de lista ya marcado, más la lista de reparto de filas.
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  if (!Pro) return;
  const { app, L, $, $$ } = Pro;
  const esc = app.esc;
  const state = app.state;
  const SheetLayout = window.SheetLayout;
  const SheetRenderer = window.SheetRenderer;
  const EXAM_LIST = '__exam';
  const picked = new Set();

  /** Estudiantes de la lista elegida: [{ key, n, name }]. */
  function students() {
    const src = $('#pnSource').value;
    const c = Pro.course(src);
    if (c) return L.activeStudents(c).map((s) => ({ key: s.id, n: s.n, name: s.name }));
    return state.exam.roster
      .split(/\r?\n/)
      .map((name, i) => ({ key: 'n' + (i + 1), n: i + 1, name: name.trim() }))
      .filter((s) => s.name);
  }

  function chosen() {
    const all = students();
    return $('#pnWho').value === 'pick' ? all.filter((s) => picked.has(s.key)) : all;
  }

  function courseName() {
    const c = Pro.course($('#pnSource').value);
    return c ? c.name : '';
  }

  function formsCount() {
    return state.exam.forms ? state.exam.forms.maps.length : 0;
  }

  /** Fila de cada estudiante: alternada según el N° de lista o una fija. */
  function formOf(s) {
    const count = formsCount();
    if (!count) return null;
    const mode = $('#pnForms').value;
    return mode === 'alt' ? (s.n - 1) % count : Number(mode) || 0;
  }

  function idDigitsOf(n) {
    const d = state.exam.idDigits;
    if (!d || n >= Math.pow(10, d)) return [];
    return String(n)
      .padStart(d, '0')
      .split('')
      .map(Number);
  }

  function renderSources() {
    const sel = $('#pnSource');
    const prev = sel.value;
    const link = state.exam.pro && state.exam.pro.courseId;
    const opts = Pro.book.courses.map((c) => `<option value="${esc(c.id)}">${esc(L.courseLabel(c))}</option>`);
    if (state.exam.roster.trim()) opts.push(`<option value="${EXAM_LIST}">Lista de la prueba (pestaña Prueba)</option>`);
    sel.innerHTML = opts.join('') || '<option value="">— Sin lista: crea un curso o escribe la lista en Prueba —</option>';
    const values = Array.from(sel.options).map((o) => o.value);
    sel.value = values.indexOf(prev) >= 0 ? prev : values.indexOf(link) >= 0 ? link : values[0];
  }

  function render() {
    const card = $('#proNamesCard');
    if (!card) return;
    renderSources();
    const count = formsCount();
    $('#pnFormWrap').hidden = !count;
    $('#pnList').hidden = !count;
    if (count) {
      const prev = $('#pnForms').value;
      const letters = state.exam.forms.maps.map((_, i) => SheetLayout.FORM_LETTERS[i]);
      $('#pnForms').innerHTML =
        `<option value="alt">Alternar filas ${letters.join(', ')} según el N° de lista</option>` +
        letters.map((l, i) => `<option value="${i}">Todos fila ${l}</option>`).join('');
      $('#pnForms').value = prev && $(`#pnForms option[value="${prev}"]`) ? prev : 'alt';
    }
    const all = students();
    const pick = $('#pnWho').value === 'pick';
    $('#pnPick').hidden = !pick;
    if (pick) {
      $('#pnPick').innerHTML = all
        .map(
          (s) =>
            `<label class="check"><input type="checkbox" data-key="${esc(s.key)}"${picked.has(s.key) ? ' checked' : ''}> ${s.n}. ${esc(s.name)}</label>`
        )
        .join('');
    }
    const list = chosen();
    const fmt = SheetLayout.FORMATS[state.exam.format];
    const pages = Math.ceil(list.length / fmt.perPage);
    $('#pnInfo').textContent = list.length
      ? `${list.length} hoja(s) con nombre · ${pages} página(s) (${fmt.label.toLowerCase()}).`
      : 'Elige una lista de estudiantes.';
    const warns = [];
    if (!state.exam.idDigits) warns.push('La hoja no tiene dígitos de identificación: configura 2 dígitos en la pestaña Prueba para que el lector reconozca a cada estudiante (si no, sólo se imprime el nombre).');
    const tooBig = list.filter((s) => state.exam.idDigits && s.n >= Math.pow(10, state.exam.idDigits));
    if (tooBig.length) warns.push(`${tooBig.length} estudiante(s) tienen un N° de lista que no cabe en ${state.exam.idDigits} dígito(s): su número no se marcará.`);
    $('#pnWarn').hidden = !warns.length;
    $('#pnWarn').textContent = warns.join(' ');
    $('#pnPrint').disabled = !list.length || !app.getLayout();
  }

  function buildPages() {
    const list = chosen();
    const perPage = SheetLayout.FORMATS[state.exam.format].perPage;
    const curso = courseName();
    const pieces = list.map((s) => ({
      layout: app.layoutForForm(formOf(s)),
      opts: app.sheetOptions({ id: idDigitsOf(s.n), fields: { Nombre: s.name, Curso: curso } }),
    }));
    const pages = [];
    for (let i = 0; i < pieces.length; i += perPage) {
      const chunk = pieces.slice(i, i + perPage);
      pages.push(SheetRenderer.renderPageSVG(chunk[0].layout, chunk[0].opts, chunk, true));
    }
    return pages;
  }

  function repartoHtml() {
    const rows = chosen()
      .map((s) => `<tr><td>${s.n}</td><td>${esc(s.name)}</td><td><b>${SheetLayout.FORM_LETTERS[formOf(s)]}</b></td></tr>`)
      .join('');
    return `<div class="print-page print-reparto">
      <h2>Reparto de filas · ${esc(state.exam.title || 'Prueba')}</h2>
      <p>${esc(courseName() || '')}</p>
      <table><thead><tr><th>N°</th><th>Estudiante</th><th>Fila</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  }

  function print(withSheets) {
    const pages = withSheets ? buildPages() : [];
    if (withSheets && !pages.length) return app.toast('No hay estudiantes para imprimir.');
    const tiling = SheetLayout.pageTiling(state.exam.paper, state.exam.format);
    app.setPageStyle(`@page { size: ${tiling.width}mm ${tiling.height}mm; margin: 0; }`);
    const area = $('#printArea');
    area.className = 'print-area';
    area.innerHTML = pages.map((p) => `<div class="print-page">${p.svg}</div>`).join('') + (formsCount() ? repartoHtml() : '');
    window.print();
  }

  /** Desde "Crear ticket de salida": deja lista la impresión con el curso elegido. */
  Pro.showNamesFor = (courseId) => {
    render();
    if (Pro.course(courseId)) $('#pnSource').value = courseId;
    $('#pnWho').value = 'all';
    render();
    const card = $('#proNamesCard');
    card.classList.add('pro-flash');
    setTimeout(() => card.classList.remove('pro-flash'), 2000);
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  $('#pnSource').addEventListener('change', () => {
    picked.clear();
    render();
  });
  $('#pnWho').addEventListener('change', () => {
    if ($('#pnWho').value === 'pick' && !picked.size) for (const s of students()) picked.add(s.key);
    render();
  });
  $('#pnForms').addEventListener('change', render);
  $('#pnPick').addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-key]');
    if (!cb) return;
    if (cb.checked) picked.add(cb.dataset.key);
    else picked.delete(cb.dataset.key);
    render();
  });
  $('#pnPrint').addEventListener('click', () => print(true));
  $('#pnList').addEventListener('click', () => print(false));
  app.on('tab', (name) => {
    if (name === 'hoja') render();
  });
  app.on('examForm', () => {
    if (!$('#tab-hoja').hidden) render();
  });
  Pro.ready.then(render);
})();
