/*
 * Versión Pro · Inicio: «Mis cursos» (promedio anual de cada curso) y el
 * acceso «Usar una prueba guardada» (Mis evaluaciones).
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  if (!Pro) return;
  const { app, L, $ } = Pro;
  const esc = app.esc;

  /** «8° Básico A» → «8A» (para el ícono del curso). */
  function initials(c) {
    const name = String(c.name || '').trim();
    const num = (name.match(/\d+/) || [''])[0];
    const letter = (name.match(/\b([A-ZÑ])\s*$/) || ['', ''])[1];
    return (num + letter).slice(0, 3) || name.slice(0, 2).toUpperCase() || '—';
  }

  function render() {
    const list = $('#proHomeCourseList');
    if (!list) return;
    const courses = Pro.book.courses;
    if (!courses.length) {
      list.innerHTML = '<li class="muted small home-course-empty">Aún no tienes cursos. Crea uno con la lista de tus estudiantes: ahí se guardan las notas de cada prueba.</li>';
      return;
    }
    list.innerHTML = courses
      .map((c) => {
        const sum = L.courseSummary(c, 'anual');
        const avg = sum.average;
        const cls = avg === null ? '' : avg >= c.gradePass - 1e-9 ? 'ok' : 'bad';
        const evs = c.evaluations.length;
        return `<li><button type="button" data-home-course="${esc(c.id)}">
          <span class="hcc-av" aria-hidden="true">${esc(initials(c))}</span>
          <span class="hcc-t"><b>${esc(L.courseLabel(c))}</b><small>${sum.students} estudiante${sum.students === 1 ? '' : 's'} · ${evs} evaluaci${evs === 1 ? 'ón' : 'ones'}</small></span>
          ${avg === null ? '<span class="hcc-g muted small">sin notas</span>' : `<span class="hcc-g ${cls}" title="Promedio anual del curso">${esc(L.fmtGrade(avg))}</span>`}
        </button></li>`;
      })
      .join('');
  }

  function renderOpenTile() {
    const t = $('#homeOpenTitle');
    if (!t || !Pro.library) return;
    const n = Pro.library.get().items.length;
    t.textContent = 'Usar una prueba guardada';
    $('#homeOpenSub').textContent = `Mis evaluaciones · ${n} prueba${n === 1 ? '' : 's'}`;
  }

  $('#proHomeCourseList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-home-course]');
    if (!b) return;
    Pro.ui.courseId = b.dataset.homeCourse;
    Pro.saveUi();
    app.showTab('cursos');
    window.scrollTo(0, 0);
  });

  app.on('home', () => {
    render();
    renderOpenTile();
  });
  Pro.ready.then(render);
  if (Pro.library) {
    Pro.library.ready.then(renderOpenTile);
    Pro.library.onChange(renderOpenTile);
  }
  const saveBook = Pro.saveBook;
  Pro.saveBook = (...args) => {
    const out = saveBook(...args);
    if (document.documentElement.dataset.tab === 'inicio') render();
    return out;
  };
})();
