/*
 * Tutorial guiado con burbujas: oscurece la pantalla, destaca un botón o
 * campo a la vez y explica en palabras simples para qué sirve. Se abre con el
 * botón «🧭 Tutorial» (arriba y en el Manual) y se ofrece solo la primera vez.
 * Funciona en la versión normal y en la Pro (que agrega sus propios pasos).
 */
(function () {
  'use strict';
  const PRO = document.documentElement.dataset.edition === 'pro';
  const SEEN_KEY = PRO ? 'lectorHojasPro.tutorial' : 'lectorHojas.tutorial';
  const $ = (s) => document.querySelector(s);

  /* ---------- Pasos ---------- */
  // tab: pestaña que se abre; target: elemento(s) a destacar (el primero visible);
  // open: <details> que se abre; pro: sólo en la versión Pro.
  const CHAPTERS = [
    {
      id: 'inicio',
      label: 'Cómo está ordenada la app',
      steps: [
        {
          target: '.tabs',
          title: 'Las pestañas',
          text: 'Arriba están las pestañas. Se usan en orden, de izquierda a derecha: <b>1 Prueba</b> → <b>3 Hoja</b> → <b>4 Escanear</b> → <b>5 Resultados</b>. La <b>2 Evaluación</b> es opcional.',
        },
        {
          target: '.tabs button[data-tab="manual"]',
          title: 'El Manual',
          text: 'Si tienes una duda, aquí está el <b>Manual</b>, con todo explicado en detalle.',
        },
      ],
    },
    {
      id: 'prueba',
      label: 'Paso 1 · Configurar la prueba',
      steps: [
        { tab: 'prueba', target: '#exTitle', title: 'Nombre de la prueba', text: 'Escribe el nombre de tu prueba. Por ejemplo: <i>Prueba de Historia – Unidad 1</i>.' },
        { tab: 'prueba', target: '#exQuestions', title: '¿Cuántas preguntas?', text: 'Escribe cuántas preguntas de alternativas tiene tu prueba.' },
        { tab: 'prueba', target: '#exChoices', title: '¿Cuántas alternativas?', text: 'Elige cuántas alternativas tiene cada pregunta. Por ejemplo, 4 son A, B, C y D.' },
        {
          tab: 'prueba',
          target: '#exIdDigits',
          title: 'Número de lista',
          text: 'Con <b>2</b>, cada estudiante pinta su número de lista (01, 02, 03…) y la app sabe de quién es la hoja. <b>Si no estás segura, déjalo en 2.</b>',
        },
        {
          tab: 'prueba',
          target: '#keyText',
          title: 'Las respuestas correctas',
          text: 'Aquí va la <b>clave</b>: las respuestas correctas, una letra por pregunta y seguidas. Por ejemplo: <b>ABCDA</b>. También puedes tocar las letras que aparecen más abajo.',
        },
        {
          tab: 'prueba',
          target: 'label[for="keyPhotoInput"]',
          title: 'Otra forma: con una foto',
          text: 'Si prefieres, rellena una hoja de respuestas con las respuestas correctas y sácale una foto con este botón. La app copia la clave sola.',
        },
        {
          tab: 'prueba',
          target: '#scExigencia',
          title: 'La nota se calcula sola',
          text: 'La nota se calcula sola, con escala de 1,0 a 7,0 y <b>60 % de exigencia</b>. Normalmente <b>no hay que cambiar nada aquí</b>.',
        },
        {
          tab: 'prueba',
          target: '#roster',
          open: '#roster',
          title: 'Lista del curso (opcional)',
          text: 'Si pegas aquí los nombres de tus estudiantes, uno por línea y en orden de lista, los resultados mostrarán el nombre de cada uno.',
        },
        {
          pro: true,
          tab: 'prueba',
          target: '#proExamCourse',
          title: 'Curso de esta prueba',
          text: 'En la Pro, en vez de pegar la lista, eliges el curso: los nombres se toman solos y después las notas se guardan en su libro.',
        },
      ],
    },
    {
      id: 'evaluacion',
      label: 'Paso 2 · Armar la prueba (opcional)',
      steps: [
        {
          tab: 'evaluacion',
          target: '#docText',
          title: 'Armar la prueba (opcional)',
          text: 'Si quieres, pega aquí las preguntas y la app arma la prueba lista para imprimir. <b>Es opcional</b>: puedes seguir usando tu prueba de siempre en papel.',
        },
        { tab: 'evaluacion', target: '#docPrint', title: 'Imprimir la prueba', text: 'Cuando esté lista, este botón imprime la prueba.' },
      ],
    },
    {
      id: 'hoja',
      label: 'Paso 3 · Imprimir las hojas',
      steps: [
        {
          tab: 'hoja',
          target: '#sheetPreview',
          title: 'La hoja de respuestas',
          text: 'Esta es la hoja que reciben tus estudiantes: pintan un círculo por pregunta. Los <b>cuadrados negros de las esquinas</b> sirven para que la app encuentre la hoja: <b>no los tapes ni los cortes</b>.',
        },
        {
          tab: 'hoja',
          target: '#exFormat',
          title: '¿Cuántas por página?',
          text: 'Puedes imprimir 1, 2 o 4 hojas de respuesta por página. Con 2 o 4 ahorras papel: después las recortas por la línea punteada.',
        },
        { tab: 'hoja', target: '#btnPrint', title: 'Imprimir', text: 'Toca <b>Imprimir</b> y saca una copia para cada estudiante.' },
      ],
    },
    {
      id: 'escanear',
      label: 'Paso 4 · Corregir con el celular',
      steps: [
        {
          tab: 'escanear',
          target: 'label[for="cameraInput"]',
          title: 'Sacar la foto',
          text: 'Cuando tus estudiantes terminen, toca <b>Tomar foto</b> y fotografía cada hoja. La app la corrige al instante.',
        },
        {
          tab: 'escanear',
          target: 'label[for="cameraInput"]',
          title: 'Para que salga bien',
          text: '✔ Hoja plana sobre la mesa.<br>✔ Que se vean las <b>4 esquinas negras</b>.<br>✔ Buena luz y sin la sombra del celular.<br>Si sale un poco chueca, no importa.',
        },
        {
          tab: 'escanear',
          target: 'label[for="filesInput"]',
          title: 'Fotos que ya tienes',
          text: 'Si ya sacaste las fotos con la cámara del celular, súbelas aquí. Puedes elegir varias a la vez.',
        },
        {
          pro: true,
          tab: 'escanear',
          target: '#proLiveScan',
          title: 'Escaneo continuo',
          text: 'Con este botón la cámara queda abierta: vas pasando las hojas una tras otra y suena un <b>pitido</b> por cada hoja corregida.',
        },
        {
          tab: 'escanear',
          target: '#btnTranscribe',
          title: 'Si una hoja está rota',
          text: 'Si una hoja está rota o muy arrugada y la app no la puede leer, aquí copias sus respuestas a mano.',
        },
      ],
    },
    {
      id: 'resultados',
      label: 'Paso 5 · Ver las notas',
      steps: [
        {
          tab: 'resultados',
          target: ['#resultsTable', '#resultsEmpty'],
          title: 'Las notas',
          text: 'Cuando escanees las hojas, aquí aparecen las notas de todo el curso. Toca a un estudiante para ver su hoja corregida. Si la app leyó mal una respuesta, puedes cambiarla ahí mismo y la nota se recalcula.',
        },
        {
          tab: 'resultados',
          target: '#btnExportZip',
          optional: true,
          title: 'Descargar todo',
          text: 'Con <b>Descargar evidencias</b> obtienes un Excel con todas las notas y la foto de cada hoja corregida, por si un apoderado pregunta.',
        },
        {
          pro: true,
          optional: true,
          tab: 'resultados',
          target: '#proBookSave',
          title: 'Al libro de notas',
          text: 'En la Pro, este botón guarda las notas de esta prueba en el libro de notas del curso.',
        },
      ],
    },
    {
      id: 'cursos',
      label: 'Cursos, libro de notas y respaldo',
      pro: true,
      steps: [
        {
          tab: 'cursos',
          target: ['#proCourseSel', '[data-pro-new-course]'],
          title: 'Tus cursos',
          text: 'Aquí creas tus cursos pegando la lista de estudiantes. Cada curso tiene su <b>libro de notas</b> con los promedios calculados.',
        },
        {
          tab: 'cursos',
          target: '#proBackupCard [data-pro-backup-drive]',
          title: 'No pierdas tu trabajo',
          text: 'Toca <b>Guardar en Google Drive</b> de vez en cuando. Así, si se pierde o cambias el celular, recuperas todos tus cursos y notas.',
        },
      ],
    },
  ];

  const usable = (list) => list.filter((x) => PRO || !x.pro);
  const chapters = () => usable(CHAPTERS).map((c) => Object.assign({}, c, { steps: usable(c.steps) }));

  /* ---------- Pantalla ---------- */

  let ui = null;
  let steps = [];
  let index = 0;
  let current = null; // elemento destacado
  let startTab = null;
  let raf = 0;
  let dir = 1; // sentido del último avance (para saltar pasos sin elemento)

  function build() {
    if (ui) return ui;
    const shade = document.createElement('div');
    shade.className = 'tour-shade';
    const spot = document.createElement('div');
    spot.className = 'tour-spot';
    const bubble = document.createElement('div');
    bubble.className = 'tour-bubble';
    bubble.setAttribute('role', 'dialog');
    bubble.setAttribute('aria-modal', 'true');
    bubble.setAttribute('aria-labelledby', 'tourTitle');
    bubble.innerHTML = `
      <button type="button" class="tour-close" aria-label="Salir del tutorial">✕</button>
      <p class="tour-count" id="tourCount"></p>
      <h2 class="tour-title" id="tourTitle"></h2>
      <div class="tour-text" id="tourText"></div>
      <div class="tour-actions">
        <button type="button" class="btn ghost big tour-back">◀ Atrás</button>
        <button type="button" class="btn primary big tour-next">Siguiente ▶</button>
      </div>`;
    shade.hidden = spot.hidden = bubble.hidden = true;
    document.body.append(shade, spot, bubble);
    shade.addEventListener('click', () => bubble.querySelector('.tour-next').focus());
    bubble.querySelector('.tour-close').addEventListener('click', close);
    bubble.querySelector('.tour-back').addEventListener('click', back);
    bubble.querySelector('.tour-next').addEventListener('click', next);
    ui = { shade, spot, bubble };
    return ui;
  }

  function visible(el) {
    return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  function findTarget(step) {
    const sels = Array.isArray(step.target) ? step.target : step.target ? [step.target] : [];
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        // Si está dentro de un <details> cerrado, se abre (y el <summary> queda visible).
        const det = el.closest('details');
        if (det && !det.open && step.open) det.open = true;
        if (visible(el)) return el;
      }
    }
    return null;
  }

  function showTab(tab) {
    if (!tab) return;
    const b = document.querySelector(`.tabs button[data-tab="${tab}"]`);
    if (b && b.getAttribute('aria-selected') !== 'true') b.click();
  }

  function render() {
    const step = steps[index];
    const { bubble } = ui;
    showTab(step.tab);
    current = step.center ? null : findTarget(step);
    bubble.querySelector('#tourCount').textContent = step.count === false ? '' : `Paso ${index + 1} de ${steps.length}`;
    bubble.querySelector('#tourTitle').textContent = step.title || '';
    const text = bubble.querySelector('#tourText');
    text.innerHTML = step.html || `<p>${step.text}</p>`;
    if (step.bind) step.bind(text);
    const backBtn = bubble.querySelector('.tour-back');
    const nextBtn = bubble.querySelector('.tour-next');
    backBtn.hidden = index === 0 || !!step.noNav;
    nextBtn.hidden = !!step.noNav;
    nextBtn.textContent = index === steps.length - 1 ? 'Terminar ✔' : 'Siguiente ▶';
    if (!current && step.optional && !step.center) {
      // El botón todavía no existe (por ejemplo, sin hojas escaneadas): se salta el paso.
      const to = index + dir;
      if (to >= 0 && to < steps.length) {
        index = to;
        return render();
      }
    }
    bubble.style.width = bubbleWidth() + 'px';
    if (current) scrollToTarget(current, bubble.offsetHeight);
    place();
    (step.noNav ? bubble.querySelector('.tour-pick') || bubble.querySelector('.tour-close') : nextBtn).focus({ preventScroll: true });
  }

  const MARGIN = 12;
  const bubbleWidth = () => Math.min(440, window.innerWidth - 2 * MARGIN);

  /** Alto de la barra de pestañas (queda fija arriba y tapa lo que pasa por debajo). */
  function topReserve(el) {
    const tabs = document.querySelector('.tabs');
    if (!tabs || tabs.contains(el)) return 0;
    const r = tabs.getBoundingClientRect();
    return r.top <= 1 ? r.bottom : 0;
  }

  /**
   * Desplaza la página para que el elemento quede bajo las pestañas, con espacio
   * para la burbuja debajo (o arriba). Si es muy alto, queda arriba de todo.
   */
  function scrollToTarget(el, h) {
    if (el.closest('.tabs')) return;
    const vh = window.innerHeight;
    const r = el.getBoundingClientRect();
    const reserve = topReserve(el) + 8;
    const avail = vh - reserve - MARGIN;
    const need = r.height + 14 + 6 + h;
    const desired = need <= avail ? reserve + Math.max(6, (avail - need) / 2) + 6 : reserve + 6;
    const delta = r.top - desired;
    if (Math.abs(delta) > 2) window.scrollBy({ top: delta, left: 0, behavior: 'instant' });
  }

  /** Ubica el foco y la burbuja (debajo del elemento si cabe; si no, arriba). */
  function place() {
    if (!ui) return;
    const { spot, bubble } = ui;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = MARGIN;
    const width = bubbleWidth();
    bubble.style.width = width + 'px';
    if (!current || !visible(current)) {
      spot.style.display = 'none';
      ui.shade.classList.add('dark');
      bubble.classList.add('center');
      bubble.style.left = Math.round((vw - width) / 2) + 'px';
      bubble.style.top = Math.max(margin, Math.round((vh - bubble.offsetHeight) / 2)) + 'px';
      bubble.dataset.arrow = '';
      return;
    }
    ui.shade.classList.remove('dark');
    bubble.classList.remove('center');
    const r = current.getBoundingClientRect();
    const pad = 6;
    const top = Math.max(4, r.top - pad);
    let bottom = Math.min(vh - 4, r.bottom + pad);
    const h = bubble.offsetHeight;
    let y;
    let arrow;
    if (bottom + 14 + h <= vh - margin) {
      y = bottom + 14;
      arrow = 'up';
    } else if (top - 14 - h >= margin) {
      y = top - 14 - h;
      arrow = 'down';
    } else {
      // Elemento muy alto: la burbuja va abajo y el destacado llega hasta ella.
      y = vh - h - margin;
      bottom = Math.max(top + 24, y - 14);
      arrow = 'up';
    }
    spot.style.display = 'block';
    spot.style.left = r.left - pad + 'px';
    spot.style.top = top + 'px';
    spot.style.width = r.width + 2 * pad + 'px';
    spot.style.height = Math.max(0, bottom - top) + 'px';
    const cx = r.left + r.width / 2;
    const x = Math.min(vw - width - margin, Math.max(margin, cx - width / 2));
    bubble.style.left = Math.round(x) + 'px';
    bubble.style.top = Math.round(Math.max(margin, y)) + 'px';
    bubble.dataset.arrow = arrow;
    bubble.style.setProperty('--arrow-x', Math.round(Math.min(width - 28, Math.max(28, cx - x))) + 'px');
  }

  function onMove() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(place);
  }

  function onKey(e) {
    if (!ui || !ui.bubble.isConnected || ui.bubble.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowRight' && !steps[index].noNav) {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft' && index > 0 && !steps[index].noNav) {
      e.preventDefault();
      back();
    } else if (e.key === 'Tab') {
      // El foco no sale de la burbuja.
      const items = Array.from(ui.bubble.querySelectorAll('button:not([hidden])'));
      const i = items.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (!e.shiftKey && i === items.length - 1) {
        e.preventDefault();
        items[0].focus();
      }
    }
  }

  function next() {
    dir = 1;
    if (index < steps.length - 1) {
      index++;
      render();
    } else close(true);
  }

  function back() {
    dir = -1;
    if (index > 0) {
      index--;
      render();
    }
  }

  function remember() {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch (e) {
      /* sin almacenamiento */
    }
  }

  function open(list) {
    build();
    if (!active()) startTab = (document.querySelector('.tabs button[aria-selected="true"]') || {}).dataset?.tab || 'prueba';
    for (const dlg of document.querySelectorAll('dialog[open]')) dlg.close();
    steps = list;
    index = 0;
    dir = 1;
    document.documentElement.classList.add('tour-on');
    ui.shade.hidden = ui.spot.hidden = ui.bubble.hidden = false;
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    document.addEventListener('keydown', onKey, true);
    render();
  }

  function close(finished) {
    if (!active()) return;
    remember();
    ui.shade.hidden = ui.spot.hidden = ui.bubble.hidden = true;
    document.documentElement.classList.remove('tour-on');
    window.removeEventListener('resize', onMove);
    window.removeEventListener('scroll', onMove, true);
    document.removeEventListener('keydown', onKey, true);
    if (finished === true && startTab) showTab(startTab);
    current = null;
    const btn = $('#btnTutorial');
    if (btn) btn.focus({ preventScroll: true });
  }

  function active() {
    return !!ui && !ui.bubble.hidden;
  }

  /* ---------- Menú inicial y recorridos ---------- */

  const END = {
    center: true,
    title: '¡Listo! 🎉',
    text: 'Eso es todo. Puedes repetir este tutorial cuando quieras con el botón <b>🧭 Tutorial</b> de arriba. Si tienes dudas, revisa el <b>Manual</b>.',
  };

  function chapterSteps(ch) {
    return ch.steps.map((s) => Object.assign({ chapter: ch.label }, s));
  }

  function startAll() {
    const all = [];
    for (const ch of chapters()) all.push(...chapterSteps(ch));
    open(all.concat([END]));
  }

  function startChapter(id) {
    const ch = chapters().find((c) => c.id === id);
    if (ch) open(chapterSteps(ch).concat([END]));
  }

  /** Primera burbuja: elegir qué aprender. */
  function menu(first) {
    const items = chapters()
      .filter((c) => c.id !== 'inicio')
      .map((c) => `<button type="button" class="btn secondary tour-pick" data-chapter="${c.id}">${c.label}</button>`)
      .join('');
    open([
      {
        center: true,
        count: false,
        noNav: true,
        title: first ? '¡Hola! 👋 ¿Te muestro cómo se usa?' : '🧭 Tutorial',
        html: `<p>Te voy a mostrar la app <b>paso a paso</b>, con burbujas como esta. Toca <b>Siguiente</b> para avanzar y la <b>✕</b> para salir cuando quieras.</p>
          <div class="tour-menu">
            <button type="button" class="btn primary big tour-pick" data-chapter="todo">▶ Ver todo, paso a paso <small>(recomendado)</small></button>
            <p class="tour-or">o elige sólo una parte:</p>
            ${items}
            ${first ? '<button type="button" class="btn ghost tour-later">Ahora no, gracias</button>' : ''}
          </div>`,
        bind(root) {
          for (const b of root.querySelectorAll('.tour-pick')) {
            b.addEventListener('click', () => (b.dataset.chapter === 'todo' ? startAll() : startChapter(b.dataset.chapter)));
          }
          const later = root.querySelector('.tour-later');
          if (later) later.addEventListener('click', () => close());
        },
      },
    ]);
  }

  /* ---------- Botones y primera vez ---------- */

  function hasWork() {
    try {
      const raw = localStorage.getItem(PRO ? 'lectorHojasPro.v1' : 'lectorHojas.v1');
      const d = raw ? JSON.parse(raw) : null;
      if (!d || !d.exam) return false;
      return (d.results && d.results.length > 0) || String(d.exam.title || '').trim() !== '' || (d.exam.key || []).some((k) => k !== null);
    } catch (e) {
      return false;
    }
  }

  function seen() {
    try {
      return !!localStorage.getItem(SEEN_KEY);
    } catch (e) {
      return true;
    }
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-tutorial]')) menu(false);
  });

  // La primera vez (sin trabajo guardado) se ofrece el tutorial.
  if (!seen() && !hasWork() && !/[?&]sintutorial\b/.test(location.search)) {
    setTimeout(() => {
      if (!active() && !document.querySelector('dialog[open]')) menu(true);
    }, 900);
  }

  window.LectorTutorial = { open: menu, start: startAll, chapter: startChapter, close, active, chapters };
})();
