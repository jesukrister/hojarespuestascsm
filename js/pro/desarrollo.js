/*
 * Versión Pro · Casillas de puntaje para preguntas de desarrollo (pestaña
 * Prueba). La hoja trae una fila por pregunta (0, 1, 2… puntos); el docente
 * marca el puntaje obtenido y el lector lo suma a la nota.
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  if (!Pro) return;
  const { app, $ } = Pro;
  const esc = app.esc;
  const state = app.state;
  const LIMITS = window.SheetLayout.LIMITS;

  function list() {
    return state.exam.dev || [];
  }

  /** Guarda la lista (normalizada) y actualiza la hoja, la nota y los resultados. */
  function setDev(items, note) {
    state.exam.dev = window.SheetLayout.normalizeDev(items);
    app.save();
    app.refreshStructure();
    render();
    const n = $('#proDevNote');
    n.hidden = !note;
    n.textContent = note || '';
  }

  function printedNote() {
    return state.results.length
      ? 'Las hojas que ya imprimiste no tienen estos cambios: vuelve a imprimirlas. Las hojas ya escaneadas conservan sus respuestas; completa los puntajes de desarrollo en Resultados.'
      : 'Recuerda imprimir la hoja de respuestas después de configurar las casillas.';
  }

  function render() {
    const items = list();
    const sc = state.exam.scoring;
    const mc = state.exam.key.filter((k) => k !== null).length * sc.pointsCorrect;
    const devMax = items.reduce((s, d) => s + d.max, 0);
    $('#proDevSummary').textContent = items.length
      ? `${items.length} pregunta(s) · ${devMax} pts de desarrollo + ${app.fmt(mc, mc % 1 ? 1 : 0)} de alternativas = ${app.fmt(mc + devMax, (mc + devMax) % 1 ? 1 : 0)} pts`
      : 'Sin casillas de desarrollo';
    const rows = items
      .map((d, i) => {
        const opts = [];
        for (let v = 1; v <= LIMITS.maxDevPoints; v++) opts.push(`<option value="${v}"${v === d.max ? ' selected' : ''}>${v}</option>`);
        return `<tr data-i="${i}">
          <td><input type="text" maxlength="5" value="${esc(d.label)}" data-f="label" aria-label="Rótulo" class="dev-label"></td>
          <td><select data-f="max" aria-label="Puntaje máximo">${opts.join('')}</select></td>
          <td class="muted small">casillas ${Array.from({ length: d.max + 1 }, (_, v) => v).join(' · ')}</td>
          <td><button type="button" class="btn ghost small danger" data-del aria-label="Quitar">✕</button></td>
        </tr>`;
      })
      .join('');
    $('#proDevTable').innerHTML = items.length
      ? `<thead><tr><th>Rótulo</th><th>Puntaje máximo</th><th>En la hoja</th><th></th></tr></thead><tbody>${rows}</tbody>`
      : '';
    $('#proDevAdd').disabled = items.length >= LIMITS.maxDev;
    const cands = app.docDevCandidates();
    const btn = $('#proDevFromDoc');
    btn.hidden = !cands.length;
    btn.textContent = `Crear desde la evaluación (${cands.length} pregunta${cands.length === 1 ? '' : 's'} de desarrollo)`;
    if (items.length && !$('#proDevCard').open) $('#proDevCard').open = true;
  }

  $('#proDevAdd').addEventListener('click', () => {
    const items = list().slice();
    if (items.length >= LIMITS.maxDev) return;
    items.push({ label: `D${items.length + 1}`, max: 4 });
    setDev(items, printedNote());
  });
  $('#proDevFromDoc').addEventListener('click', () => {
    const cands = app.docDevCandidates().slice(0, LIMITS.maxDev);
    if (!cands.length) return;
    if (list().length && !confirm('Se reemplazarán las casillas de desarrollo actuales por las preguntas de desarrollo de la evaluación. ¿Continuar?')) return;
    const prev = list();
    setDev(
      cands.map((c, i) => ({ label: `P${c.number}`, max: prev[i] ? prev[i].max : 4 })),
      `Se crearon ${cands.length} casilla(s), una por pregunta de desarrollo, con 4 puntos como máximo: ajusta el puntaje de cada una. ` + printedNote()
    );
  });
  $('#proDevTable').addEventListener('change', (e) => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    const items = list().map((d) => Object.assign({}, d));
    const d = items[Number(tr.dataset.i)];
    if (e.target.dataset.f === 'label') d.label = e.target.value;
    if (e.target.dataset.f === 'max') d.max = Number(e.target.value);
    setDev(items, printedNote());
  });
  $('#proDevTable').addEventListener('click', (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const items = list().slice();
    items.splice(Number(b.closest('tr').dataset.i), 1);
    setDev(items, printedNote());
  });
  // La lista cambia al importar o cargar otra prueba.
  app.on('examForm', render);
  app.on('tab', (name) => {
    if (name === 'prueba') render();
  });
  render();
})();
