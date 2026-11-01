/*
 * Versión Pro · Dos formas de usar la app:
 *  - Simple: crear la hoja de respuestas y corregir con el escáner (lo esencial).
 *  - Avanzada: además cursos y libro de notas, preguntas, PIE, análisis, informes y nube.
 * La elección se guarda en este equipo y se cambia en Inicio. El modo sólo
 * esconde partes de la pantalla: los datos son los mismos en ambos.
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  if (!Pro) return;
  const { app, $, $$ } = Pro;
  const KEY = 'lectorHojasPro.modo';

  function stored() {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'simple' || v === 'avanzado' ? v : null;
    } catch (e) {
      return null;
    }
  }

  function current() {
    return document.documentElement.dataset.modo === 'simple' ? 'simple' : 'avanzado';
  }

  function render() {
    for (const b of $$('[data-modo-set]')) b.setAttribute('aria-checked', String(b.dataset.modoSet === current()));
    const info = $('#proModeInfo');
    if (info) {
      info.textContent =
        current() === 'simple'
          ? 'Sólo lo esencial: la hoja de respuestas y el escáner. Cursos, preguntas, PIE e informes están en el modo avanzado.'
          : 'Todo: cursos y libro de notas, escribir las preguntas, PIE, análisis, informes y nube.';
    }
  }

  function apply(mode) {
    document.documentElement.dataset.modo = mode;
    // Si estaba en una pestaña que el modo simple no tiene, se vuelve a una que sí.
    app.showTab(document.documentElement.dataset.tab || 'inicio');
    app.renderSubSteps();
    app.renderKey();
    if (document.documentElement.dataset.tab === 'inicio') app.renderHome();
    render();
  }

  /** Con CorrigeYa lanzado, el modo simple es parte de Plus. */
  const simpleAllowed = () => !Pro.plus || Pro.plus.allows('simple');

  function set(mode, quiet) {
    if (mode === 'simple' && !simpleAllowed()) {
      render();
      Pro.plus.upsell('simple');
      return;
    }
    try {
      localStorage.setItem(KEY, mode);
    } catch (e) {
      /* sin almacenamiento: dura hasta cerrar */
    }
    if (mode === current()) return render();
    apply(mode);
    if (!quiet) app.toast(mode === 'simple' ? 'Modo simple: sólo la hoja de respuestas y el escáner.' : 'Modo avanzado: cursos, preguntas, PIE, informes y más.');
  }
  Pro.setMode = set;

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-modo-set]');
    if (!b) return;
    const dlg = b.closest('#proModeDialog');
    set(b.dataset.modoSet, !!dlg);
    if (dlg) {
      dlg.close();
      // La primera vez, después de elegir, se ofrece el tutorial.
      if (window.LectorTutorial && !window.LectorTutorial.active()) {
        let seen = true;
        try {
          seen = !!localStorage.getItem('lectorHojasPro.tutorial');
        } catch (err) {
          /* sin almacenamiento */
        }
        if (!seen) setTimeout(() => window.LectorTutorial.open(true), 300);
      }
    }
  });

  // La primera vez se pregunta cómo usar la app (quien ya tiene cursos o notas ve marcada la avanzada).
  const start = stored() || current();
  apply(start === 'simple' && !simpleAllowed() ? 'avanzado' : start);
  // Si se activa Plus y había elegido el modo simple, vuelve a él.
  if (Pro.plus) Pro.plus.onChange(() => {
    if (stored() === 'simple' && simpleAllowed() && current() !== 'simple') apply('simple');
  });
  Pro.ready.then(() => {
    if (stored()) return;
    // Quien llega a corrigeya.cl desde la dirección antigua ve primero el aviso para traer sus
    // datos (que ya traen el modo que eligió): la pregunta queda para la próxima vez.
    if (window.LectorWeb && window.LectorWeb.ofreceMudanza && document.getElementById('webMudanza')) return;
    const busy = Pro.book.courses.length > 0 || app.state.results.length > 0;
    $('#proModeDialog').dataset.busy = busy ? '1' : '';
    const rec = busy ? 'avanzado' : 'simple';
    for (const b of $$('#proModeDialog [data-modo-set]')) b.classList.toggle('rec', b.dataset.modoSet === rec);
    setTimeout(() => {
      if (stored() || document.querySelector('dialog[open]') || (window.LectorTutorial && window.LectorTutorial.active())) return;
      $('#proModeDialog').showModal();
    }, 400);
  });
})();
