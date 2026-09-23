/*
 * Interfaz de la aplicación: configuración de la prueba, generación de la
 * hoja, escaneo de fotos y resultados. Todo se guarda en el navegador.
 */
(function () {
  'use strict';

  const { computeLayout, PAPERS, PAPER_IDS, FORMATS, FORMAT_IDS, sameStructure, normalizeConfig, CHOICE_LABELS, LIMITS } =
    window.SheetLayout;
  const TestDoc = window.TestDoc;
  const Charts = window.Charts;
  const SheetLayout = window.SheetLayout;
  const OMR = window.OMR;
  const Grading = window.Grading;
  const SheetRenderer = window.SheetRenderer;
  const ZipWriter = window.ZipWriter;
  const Xlsx = window.Xlsx;

  const STORE_KEY = 'lectorHojas.v1';
  const MAX_IMAGE_SIDE = 2000;
  const PREVIEW_WIDTH = 1200;
  const PHOTO_MAX_SIDE = 1600;
  const TABS = ['prueba', 'evaluacion', 'hoja', 'escanear', 'resultados'];

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ------------------------------------------------------------------ */
  /* Estado y persistencia                                               */
  /* ------------------------------------------------------------------ */

  function defaultExam() {
    return {
      title: '',
      subtitle: '',
      paper: 'carta',
      numQuestions: 30,
      numChoices: 5,
      idDigits: 2,
      key: new Array(30).fill(null),
      scoring: Object.assign({}, Grading.DEFAULT_SCORING),
      roster: '',
      threshold: null,
      format: 'full',
      sheetFields: { curso: true, fecha: true, rut: true },
      oaText: '',
      levels: Object.assign({}, Grading.DEFAULT_LEVELS),
      doc: defaultDoc(),
    };
  }

  function defaultDoc() {
    const f = JSON.parse(JSON.stringify(TestDoc.DEFAULT_FORMAT));
    f.title = '';
    return { text: '', sortByNumber: true, format: f, elements: [], qsettings: {} };
  }

  function sanitizeDoc(raw) {
    const d = defaultDoc();
    if (!raw || typeof raw !== 'object') return d;
    if (typeof raw.text === 'string') d.text = raw.text;
    d.sortByNumber = raw.sortByNumber !== false;
    // Ajustes por pregunta (tipo y espacio), por clave de enunciado.
    if (raw.qsettings && typeof raw.qsettings === 'object') {
      for (const [k, v] of Object.entries(raw.qsettings)) {
        if (v && typeof v === 'object' && (!v.type || TestDoc.TYPE_LABELS[v.type])) d.qsettings[k] = v;
      }
    }
    d.elements = Array.isArray(raw.elements)
      ? raw.elements.filter((e) => e && typeof e.id === 'string' && TestDoc.ELEMENT_TYPES[e.type])
      : [];
    const f = raw.format || {};
    for (const k of Object.keys(d.format)) {
      if (k === 'fields') continue;
      if (f[k] !== undefined && typeof f[k] === typeof d.format[k]) d.format[k] = f[k];
    }
    for (const k of Object.keys(d.format.fields)) {
      if (f.fields && typeof f.fields[k] === 'boolean') d.format.fields[k] = f.fields[k];
    }
    return d;
  }

  function sanitizeExam(raw) {
    const base = defaultExam();
    if (!raw || typeof raw !== 'object') return base;
    const structure = normalizeConfig(raw);
    const exam = Object.assign(base, structure);
    exam.title = typeof raw.title === 'string' ? raw.title : '';
    exam.subtitle = typeof raw.subtitle === 'string' ? raw.subtitle : '';
    exam.roster = typeof raw.roster === 'string' ? raw.roster : '';
    exam.threshold = typeof raw.threshold === 'number' ? raw.threshold : null;
    const sc = raw.scoring || {};
    for (const k of Object.keys(exam.scoring)) {
      if (typeof sc[k] === 'number' && Number.isFinite(sc[k])) exam.scoring[k] = sc[k];
    }
    exam.key = fitKey(Array.isArray(raw.key) ? raw.key : [], exam.numQuestions, exam.numChoices);
    exam.sheetFields = SheetLayout.normalizeFields(raw.sheetFields);
    exam.oaText = typeof raw.oaText === 'string' ? raw.oaText : '';
    const lv = raw.levels || {};
    for (const k of Object.keys(exam.levels)) {
      if (typeof lv[k] === 'number' && Number.isFinite(lv[k])) exam.levels[k] = lv[k];
    }
    exam.doc = sanitizeDoc(raw.doc);
    return exam;
  }

  function fitKey(key, n, c) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = key[i];
      out.push(Number.isInteger(v) && v >= 0 && v < c ? v : null);
    }
    return out;
  }

  function load() {
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    } catch (e) {
      data = null;
    }
    const exam = sanitizeExam(data && data.exam);
    const results = data && Array.isArray(data.results) ? data.results.filter((r) => r && Array.isArray(r.answers)) : [];
    return { exam, results };
  }

  const state = load();
  const images = new Map(); // id de resultado → vista de la hoja enderezada (caché en memoria)

  /**
   * Imágenes de cada resultado (hoja enderezada y foto original) guardadas en
   * IndexedDB, para que sigan disponibles al recargar la página.
   */
  let dbPromise = null;
  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB no disponible'));
        const req = indexedDB.open('lectorHojas', 2);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
          if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      dbPromise.catch(() => (dbPromise = null));
    }
    return dbPromise;
  }

  function makeStore(name) {
    function run(mode, fn) {
      return openDb().then(
        (db) =>
          new Promise((resolve, reject) => {
            const tx = db.transaction(name, mode);
            const req = fn(tx.objectStore(name));
            tx.oncomplete = () => resolve(req ? req.result : undefined);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          })
      );
    }
    return {
      put: (id, value) => run('readwrite', (st) => st.put(value, id)),
      get: (id) => run('readonly', (st) => st.get(id)).catch(() => null),
      remove: (id) => run('readwrite', (st) => st.delete(id)).catch(() => {}),
      clear: () => run('readwrite', (st) => st.clear()).catch(() => {}),
    };
  }

  // Imágenes de las hojas escaneadas (hoja enderezada y foto original).
  const imageStore = makeStore('images');
  // Imágenes agregadas a las preguntas de la evaluación (data URL por id de elemento).
  const assetStore = makeStore('assets');
  const assetCache = new Map();

  function forgetImage(id) {
    const v = images.get(id);
    if (v && v.url) URL.revokeObjectURL(v.url);
    images.delete(id);
    imageStore.remove(id);
  }

  function forgetAllImages() {
    for (const v of images.values()) if (v.url) URL.revokeObjectURL(v.url);
    images.clear();
    imageStore.clear();
  }

  async function getView(id) {
    if (images.has(id)) return images.get(id);
    const rec = await imageStore.get(id);
    if (!rec || !rec.sheet) return null;
    if (images.has(id)) return images.get(id);
    const view = {
      url: URL.createObjectURL(rec.sheet),
      sheetBlob: rec.sheet,
      photoBlob: rec.photo || null,
      scale: rec.scale,
      overlay: rec.overlay,
      image: null,
    };
    images.set(id, view);
    return view;
  }
  let selectedResultId = null;

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('No se pudo guardar en este navegador (almacenamiento lleno o bloqueado).');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function fmt(n, decimals) {
    if (n == null || !Number.isFinite(n)) return '–';
    return n.toLocaleString('es-CL', { minimumFractionDigits: decimals || 0, maximumFractionDigits: decimals || 0 });
  }

  function fmtScore(n) {
    return Number.isInteger(n) ? String(n) : fmt(n, 2);
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3800);
  }

  function slug(s) {
    return (
      String(s || 'hoja-respuestas')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'hoja-respuestas'
    );
  }

  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function letters(marked) {
    return marked.map((i) => CHOICE_LABELS[i]).join('+');
  }

  /* ------------------------------------------------------------------ */
  /* Layout actual                                                       */
  /* ------------------------------------------------------------------ */

  let layoutError = '';
  function getLayout() {
    try {
      layoutError = '';
      return computeLayout(Object.assign({}, state.exam, { fields: state.exam.sheetFields }));
    } catch (e) {
      layoutError = e.message;
      return null;
    }
  }

  function updateLayoutError() {
    getLayout();
    for (const id of ['#layoutError', '#formatError']) {
      const el = $(id);
      el.textContent = layoutError;
      el.hidden = !layoutError;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pestañas                                                            */
  /* ------------------------------------------------------------------ */

  function showTab(name) {
    if (TABS.indexOf(name) < 0) name = 'prueba';
    for (const b of $$('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const t of TABS) $('#tab-' + t).hidden = t !== name;
    if (name === 'hoja') renderSheetPreview();
    if (name === 'evaluacion') renderDoc();
    if (name === 'resultados') renderResults();
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  }

  /* ------------------------------------------------------------------ */
  /* 1. Prueba                                                           */
  /* ------------------------------------------------------------------ */

  function fillExamForm() {
    const e = state.exam;
    $('#exTitle').value = e.title;
    $('#exSubtitle').value = e.subtitle;
    $('#exQuestions').value = e.numQuestions;
    $('#exChoices').value = String(e.numChoices);
    $('#exIdDigits').value = e.idDigits;
    $('#exPaper').value = e.paper;
    $('#exFormat').value = e.format;
    $('#sheetSchool').value = e.doc.format.school;
    for (const cb of $$('[data-sheetfield]')) cb.checked = e.sheetFields[cb.dataset.sheetfield];
    $('#oaText').value = e.oaText;
    $('#lvlAchieved').value = e.levels.achieved;
    $('#lvlPartial').value = e.levels.partial;
    fillDocForm();
    $('#scPoints').value = e.scoring.pointsCorrect;
    $('#scPenalty').value = e.scoring.penaltyWrong;
    $('#scExigencia').value = e.scoring.exigencia;
    $('#scMin').value = e.scoring.gradeMin;
    $('#scPass').value = e.scoring.gradePass;
    $('#scMax').value = e.scoring.gradeMax;
    $('#roster').value = e.roster;
    $('#thrAuto').checked = e.threshold === null;
    $('#thrRange').disabled = e.threshold === null;
    $('#thrRange').value = e.threshold === null ? 0.35 : e.threshold;
    $('#thrValue').textContent = e.threshold === null ? 'auto' : e.threshold.toFixed(2);
  }

  function applyStructure(next) {
    const cur = state.exam;
    if (!sameStructure(next, cur) && state.results.length) {
      const ok = confirm(
        `Cambiar el número de preguntas, alternativas, dígitos, el papel o las hojas por página hace incompatibles los ${state.results.length} resultados guardados, que serán eliminados. ¿Continuar?`
      );
      if (!ok) return false;
      state.results = [];
      forgetAllImages();
      selectedResultId = null;
    }
    Object.assign(cur, normalizeConfig(next));
    cur.key = fitKey(cur.key, cur.numQuestions, cur.numChoices);
    return true;
  }

  function onStructureInput() {
    const next = {
      paper: $('#exPaper').value,
      numQuestions: $('#exQuestions').value,
      numChoices: $('#exChoices').value,
      idDigits: $('#exIdDigits').value,
      format: $('#exFormat').value,
    };
    applyStructure(next);
    fillExamForm();
    save();
    renderKey();
    renderObjectives();
    updateLayoutError();
    renderResultsBadge();
    if (!$('#tab-hoja').hidden) renderSheetPreview();
  }

  function onScoringInput() {
    const sc = state.exam.scoring;
    const num = (id, fallback, min, max) => {
      const v = parseFloat(String($(id).value).replace(',', '.'));
      if (!Number.isFinite(v)) return fallback;
      return Math.min(max, Math.max(min, v));
    };
    sc.pointsCorrect = num('#scPoints', 1, 0.01, 1000);
    sc.penaltyWrong = num('#scPenalty', 0, 0, 1000);
    sc.exigencia = num('#scExigencia', 60, 1, 99);
    sc.gradeMin = num('#scMin', 1, 0, 100);
    sc.gradeMax = num('#scMax', 7, sc.gradeMin + 0.1, 100);
    sc.gradePass = num('#scPass', 4, sc.gradeMin, sc.gradeMax);
    save();
  }

  function keyToText(key) {
    const chars = key.map((k) => (k === null ? '-' : CHOICE_LABELS[k]));
    const groups = [];
    for (let i = 0; i < chars.length; i += 5) groups.push(chars.slice(i, i + 5).join(''));
    return groups.join(' ');
  }

  function parseKeyText(text, n, c) {
    const out = [];
    for (const ch of text.toUpperCase()) {
      if (out.length >= n) break;
      const code = ch.charCodeAt(0) - 65;
      if (code >= 0 && code < 6) out.push(code < c ? code : null);
      else if ('-*_?X.'.indexOf(ch) >= 0) out.push(null);
    }
    while (out.length < n) out.push(null);
    return out;
  }

  function renderKey(skipText) {
    const { numQuestions: n, numChoices: c, key } = state.exam;
    const html = [];
    for (let q = 0; q < n; q++) {
      html.push(`<div class="key-row${key[q] === null ? ' unset' : ''}"><span class="qn">${q + 1}</span>`);
      for (let k = 0; k < c; k++) {
        html.push(
          `<button type="button" class="bubble-btn" data-q="${q}" data-c="${k}" aria-pressed="${key[q] === k}" ` +
            `aria-label="Pregunta ${q + 1}, alternativa ${CHOICE_LABELS[k]}">${CHOICE_LABELS[k]}</button>`
        );
      }
      html.push('</div>');
    }
    $('#keyGrid').innerHTML = html.join('');
    if (!skipText) $('#keyText').value = keyToText(key);
    const set = key.filter((k) => k !== null).length;
    $('#keyStatus').textContent = set === n ? `✓ ${n} preguntas con clave` : `${set} de ${n} preguntas con clave`;
  }

  /* ------------------------------------------------------------------ */
  /* 2. Hoja                                                             */
  /* ------------------------------------------------------------------ */

  function sheetOptions(fill) {
    return {
      title: state.exam.title || 'Hoja de respuestas',
      subtitle: state.exam.subtitle,
      school: state.exam.doc.format.school,
      fill,
    };
  }

  /** Una hoja de respuestas (del tamaño del formato elegido). */
  function sheetSvg(fill) {
    const layout = getLayout();
    if (!layout) return null;
    return SheetRenderer.renderSVG(layout, sheetOptions(fill));
  }

  /** Página para imprimir, con 1, 2 o 4 hojas de respuestas. */
  function sheetPage() {
    const layout = getLayout();
    if (!layout) return null;
    return SheetRenderer.renderPageSVG(layout, sheetOptions());
  }

  function renderSheetPreview() {
    const page = sheetPage();
    const preview = $('#sheetPreview');
    preview.innerHTML = page ? page.svg : `<p class="alert error">${esc(layoutError)}</p>`;
    preview.classList.toggle('landscape', !!(page && page.landscape));
    $('#cutTip').hidden = state.exam.format === 'full';
  }

  function setPageStyle(css) {
    let style = $('#pageStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'pageStyle';
      document.head.appendChild(style);
    }
    style.textContent = css;
  }

  function printSheet() {
    const page = sheetPage();
    if (!page) return toast(layoutError);
    setPageStyle(`@page { size: ${page.width}mm ${page.height}mm; margin: 0; }`);
    $('#printArea').className = 'print-area';
    $('#printArea').innerHTML = page.svg;
    window.print();
  }

  function sampleFill() {
    const { numQuestions: n, numChoices: c, key, idDigits } = state.exam;
    const answers = [];
    for (let q = 0; q < n; q++) {
      const k = key[q] === null ? (q * 7 + 3) % c : key[q];
      if (q % 11 === 5) answers.push([]);
      else if (q % 7 === 3) answers.push([(k + 1) % c]);
      else answers.push([k]);
    }
    const id = [];
    for (let i = 0; i < idDigits; i++) id.push(i === idDigits - 1 ? 7 : 0);
    return { answers, id };
  }

  async function downloadSample() {
    const layout = getLayout();
    const svg = sheetSvg(sampleFill());
    if (!svg) return toast(layoutError);
    const ppm = layout.format.id === 'full' ? 6 : 8; // ~150–200 ppp
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const sw = Math.round(layout.width * ppm);
    const sh = Math.round(layout.height * ppm);
    const pad = Math.round(sw * 0.1);
    const cv = document.createElement('canvas');
    cv.width = sw + 2 * pad;
    cv.height = sh + 2 * pad;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#5b6470';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.translate(cv.width / 2, cv.height / 2);
    ctx.rotate((3 * Math.PI) / 180); // leve giro, como una foto real
    ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
    cv.toBlob((blob) => download(`${slug(state.exam.title)}-ejemplo.png`, blob), 'image/png');
  }

  /* ------------------------------------------------------------------ */
  /* Objetivos de aprendizaje                                            */
  /* ------------------------------------------------------------------ */

  function currentObjectives() {
    return Grading.parseObjectives(state.exam.oaText, state.exam.numQuestions);
  }

  function renderObjectives() {
    const parsed = currentObjectives();
    const box = $('#oaSummary');
    const status = $('#oaStatus');
    if (!state.exam.oaText.trim()) {
      box.innerHTML = '';
      status.textContent = '';
      return;
    }
    const rows = parsed.objectives
      .map((o) => `<tr><td><strong>${esc(o.name)}</strong></td><td>${esc(Grading.formatRanges(o.questions))}</td><td class="num">${o.questions.length}</td></tr>`)
      .join('');
    const notes = [];
    for (const e of parsed.errors) notes.push(`<li class="bad">${esc(e)}</li>`);
    if (parsed.unassigned.length) {
      notes.push(`<li>Preguntas sin objetivo (no se consideran en el análisis por OA): ${esc(Grading.formatRanges(parsed.unassigned))}.</li>`);
    }
    if (parsed.repeated.length) {
      notes.push(`<li>Preguntas asignadas a más de un objetivo: ${esc(Grading.formatRanges(parsed.repeated))}.</li>`);
    }
    box.innerHTML =
      (rows ? `<table class="oa-table"><thead><tr><th>Objetivo</th><th>Preguntas</th><th class="num">N°</th></tr></thead><tbody>${rows}</tbody></table>` : '') +
      (notes.length ? `<ul class="warn-list">${notes.join('')}</ul>` : '');
    status.textContent = parsed.objectives.length ? `${parsed.objectives.length} objetivo(s)` : '';
  }

  /* ------------------------------------------------------------------ */
  /* 2. Evaluación (generador de la prueba)                              */
  /* ------------------------------------------------------------------ */

  let docParsed = { questions: [], warnings: [] };

  function fillDocForm() {
    const d = state.exam.doc;
    const f = d.format;
    $('#docText').value = d.text;
    $('#docSort').checked = d.sortByNumber;
    $('#docSchool').value = f.school;
    $('#docTitle').value = f.title;
    $('#docSubject').value = f.subject;
    $('#docTeacher').value = f.teacher;
    $('#docCourse').value = f.course;
    $('#docPaper').value = f.paper;
    $('#docInstructions').value = f.instructions;
    $('#docObjectives').value = f.objectives;
    $('#docNumbering').value = f.numbering;
    $('#docOpenLines').value = String(f.openLines);
    $('#docOpenStyle').value = f.openStyle;
    $('#docTfJustify').value = String(f.tfJustifyLines);
    $('#docTotalPoints').value = f.totalPoints;
    $('#docFont').value = f.fontFamily;
    $('#docFontSize').value = String(f.fontSize);
    $('#docColumns').value = String(f.columns);
    $('#docLetters').value = f.letterStyle;
    $('#docOptLayout').value = f.optionsLayout;
    $('#docShowOA').checked = f.showOA;
    for (const cb of $$('[data-docfield]')) cb.checked = !!f.fields[cb.dataset.docfield];
    $('#docLogoPreview').hidden = !f.logo;
    $('#docLogoRemove').hidden = !f.logo;
    if (f.logo) $('#docLogoPreview').src = f.logo;
    else $('#docLogoPreview').removeAttribute('src');
  }

  function docFormat() {
    const f = Object.assign({}, state.exam.doc.format);
    f.title = f.title || state.exam.title || 'Evaluación';
    return f;
  }

  function docMaxScore() {
    const total = String(state.exam.doc.format.totalPoints || '').trim();
    if (total) return total;
    const qs = docQuestions;
    // Sólo se calcula solo si todas las preguntas son de alternativas.
    if (!qs.length || qs.some((q) => q.type !== 'mc')) return '';
    return Math.round(qs.length * state.exam.scoring.pointsCorrect * 100) / 100;
  }

  let docQuestions = [];

  /** Preguntas con los ajustes hechos en la vista previa (tipo y espacio). */
  function effectiveQuestions(parsed) {
    const qset = state.exam.doc.qsettings;
    return parsed.map((q) => {
      const o = qset[stemKey(q)];
      if (!o) return q;
      const c = Object.assign({}, q);
      if (o.type) c.type = o.type;
      if (o.space) c.space = o.space;
      if (o.spaceStyle) c.spaceStyle = o.spaceStyle;
      return c;
    });
  }

  function renderDoc() {
    const d = state.exam.doc;
    docParsed = TestDoc.parseQuestions(d.text, { sortByNumber: d.sortByNumber });
    docQuestions = effectiveQuestions(docParsed.questions);
    const qs = docQuestions;
    const mc = qs.filter((q) => q.type === 'mc');
    const tf = qs.filter((q) => q.type === 'tf').length;
    const open = qs.filter((q) => q.type === 'open').length;
    const maxOpts = mc.reduce((m, q) => Math.max(m, q.options.length), 0);
    const withKey = mc.filter((q) => q.correct !== null).length;
    const oas = Array.from(new Set(qs.map((q) => q.oa).filter(Boolean)));
    const parts = [];
    if (mc.length) parts.push(`${mc.length} de selección múltiple (hasta ${maxOpts} alternativas)`);
    if (tf) parts.push(`${tf} de verdadero o falso`);
    if (open) parts.push(`${open} de desarrollo`);
    $('#docSummary').textContent = qs.length
      ? `${qs.length} pregunta(s): ${parts.join(', ')}` +
        (withKey ? ` · ${withKey} con respuesta correcta` : '') +
        (oas.length ? ` · ${oas.length} OA` : '')
      : '';
    const warn = $('#docWarnings');
    warn.innerHTML = docParsed.warnings.map((w) => `<li>${esc(w)}</li>`).join('');
    warn.hidden = !docParsed.warnings.length;
    $('#docApply').disabled = !qs.length;
    $('#docPrint').disabled = !qs.length;
    const preview = $('#docPreview');
    const paper = PAPERS[d.format.paper] || PAPERS.carta;
    preview.style.width = paper.width + 'mm';
    const { byQuestion, orphans } = matchElements(qs);
    preview.innerHTML = qs.length
      ? TestDoc.renderTestHTML(qs, docFormat(), { maxScore: docMaxScore(), intro: docParsed.intro, elements: byQuestion, sections: docParsed.sections })
      : '<p class="muted doc-empty">Pega las preguntas arriba para ver la evaluación.</p>';
    // Herramientas de cada pregunta (sólo en pantalla, no se imprimen):
    // tipo de pregunta, espacio para responder y "Añadir elemento".
    const f = d.format;
    for (const sec of $$('.td-q', preview)) {
      const i = Number(sec.dataset.q);
      const q = qs[i];
      const typeOpts = Object.entries(TestDoc.TYPE_LABELS)
        .map(([k, v]) => `<option value="${k}"${q.type === k ? ' selected' : ''}>${esc(v)}</option>`)
        .join('');
      let spaceCtl = '';
      if (q.type === 'open') {
        const lines = q.space || Number(f.openLines) || 6;
        const style = q.spaceStyle || f.openStyle;
        spaceCtl =
          `<select data-qspace="${i}" title="Espacio para responder">${SPACE_CHOICES.map((n) => `<option value="${n}"${n === lines ? ' selected' : ''}>${n} líneas</option>`).join('')}</select>` +
          `<select data-qstyle="${i}" title="Tipo de espacio">${Object.entries(SPACE_STYLES)
            .map(([k, v]) => `<option value="${k}"${k === style ? ' selected' : ''}>${v}</option>`)
            .join('')}</select>`;
      }
      const tools = document.createElement('div');
      tools.className = 'td-tools';
      tools.innerHTML =
        `<select data-qtype="${i}" title="Tipo de pregunta">${typeOpts}</select>${spaceCtl}` +
        `<button type="button" class="td-add" data-add="${i}">＋ Añadir elemento</button>`;
      sec.prepend(tools);
    }
    renderOrphans(orphans, qs);
  }

  const SPACE_CHOICES = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30];
  const SPACE_STYLES = { lines: 'Con líneas', box: 'Recuadro', blank: 'En blanco' };

  /** Guarda el ajuste de una pregunta hecho en la vista previa. */
  function setQuestionSetting(i, key, value) {
    const q = docParsed.questions[i];
    if (!q) return;
    const k = stemKey(q);
    const cur = Object.assign({}, state.exam.doc.qsettings[k] || {});
    cur[key] = value;
    // Si coincide con lo detectado en el texto, no hace falta guardarlo.
    if (key === 'type' && value === q.type) delete cur.type;
    if (Object.keys(cur).length) state.exam.doc.qsettings[k] = cur;
    else delete state.exam.doc.qsettings[k];
    save();
    renderDoc();
  }

  /* ---------- Elementos (imagen, tabla, gráfico, texto) por pregunta ---------- */

  /** Clave estable de una pregunta: su enunciado normalizado (sobrevive a reordenar o renumerar). */
  function stemKey(q) {
    return String((q && q.stem) || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '')
      .slice(0, 80);
  }

  function withSrc(el) {
    return el.type === 'image' ? Object.assign({}, el, { src: assetCache.get(el.id) || '' }) : el;
  }

  /** Asigna cada elemento a su pregunta actual; los que no calzan quedan "huérfanos". */
  function matchElements(qs) {
    const keys = qs.map(stemKey);
    const byQuestion = qs.map(() => []);
    const orphans = [];
    for (const el of state.exam.doc.elements) {
      let idx = keys[el.qIndex] === el.qKey ? el.qIndex : keys.indexOf(el.qKey);
      if (idx < 0 || !el.qKey) {
        orphans.push(el);
        continue;
      }
      el.qIndex = idx;
      byQuestion[idx].push(withSrc(el));
    }
    return { byQuestion, orphans };
  }

  function renderOrphans(orphans, qs) {
    const box = $('#docOrphans');
    if (!orphans.length) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const opts = qs.map((q, i) => `<option value="${i}">Pregunta ${i + 1}: ${esc(q.stem.slice(0, 50))}</option>`).join('');
    box.hidden = false;
    box.innerHTML =
      `<strong>Hay ${orphans.length} elemento(s) cuya pregunta ya no se encuentra</strong> (el enunciado cambió o se borró). Asígnalos a una pregunta o elimínalos:` +
      '<ul>' +
      orphans
        .map(
          (el) =>
            `<li>${esc(TestDoc.ELEMENT_TYPES[el.type])}${el.caption ? ` “${esc(el.caption)}”` : el.data && el.data.title ? ` “${esc(el.data.title)}”` : ''} ` +
            `<select data-reassign="${esc(el.id)}"><option value="">Asignar a…</option>${opts}</select> ` +
            `<button type="button" class="btn ghost small" data-remove-el="${esc(el.id)}">Eliminar</button></li>`
        )
        .join('') +
      '</ul>';
  }

  const EDITOR = { qIndex: 0, id: null, type: 'image', image: '' };

  function openElementEditor(qIndex, id) {
    const q = docParsed.questions[qIndex];
    const el = id ? state.exam.doc.elements.find((e) => e.id === id) : null;
    EDITOR.qIndex = qIndex;
    EDITOR.id = el ? el.id : null;
    EDITOR.type = el ? el.type : EDITOR.type || 'image';
    EDITOR.image = el && el.type === 'image' ? assetCache.get(el.id) || '' : '';
    const d = (el && el.data) || {};
    $('#elDialogTitle').textContent = `${el ? 'Editar' : 'Añadir'} elemento · pregunta ${qIndex + 1}${q ? `: ${q.stem.slice(0, 60)}${q.stem.length > 60 ? '…' : ''}` : ''}`;
    $('#elTableText').value = el && el.type === 'table' ? d.text || '' : '';
    $('#elTableHeader').checked = !(el && el.type === 'table' && d.header === false);
    $('#elChartType').value = el && el.type === 'chart' ? d.type : 'column';
    $('#elChartTitle').value = el && el.type === 'chart' ? d.title || '' : '';
    $('#elChartX').value = el && el.type === 'chart' ? d.xLabel || '' : '';
    $('#elChartY').value = el && el.type === 'chart' ? d.yLabel || '' : '';
    $('#elChartData').value = el && el.type === 'chart' ? d.dataText || '' : '';
    $('#elChartValues').checked = !(el && el.type === 'chart' && d.showValues === false);
    $('#elChartBW').checked = !(el && el.type === 'chart' && d.bw === false);
    $('#elText').value = el && el.type === 'text' ? d.text || '' : '';
    $('#elTextBoxed').checked = !!(el && el.type === 'text' && d.boxed);
    $('#elPosition').value = el ? el.position || 'after' : 'after';
    $('#elWidth').value = String(el ? el.width || 70 : 70);
    $('#elCaption').value = el ? el.caption || '' : '';
    $('#elDelete').hidden = !el;
    setEditorType(EDITOR.type);
    const dlg = $('#elDialog');
    if (!dlg.open) dlg.showModal();
  }

  function setEditorType(type) {
    EDITOR.type = type;
    for (const b of $$('[data-eltype]')) b.setAttribute('aria-selected', String(b.dataset.eltype === type));
    for (const p of $$('[data-elpanel]')) p.hidden = p.dataset.elpanel !== type;
    for (const l of $$('[data-elnottext]')) l.hidden = type === 'text';
    renderEditorPreview();
  }

  /** Elemento según lo que hay en el editor (sin guardar). */
  function readEditor() {
    const type = EDITOR.type;
    const el = {
      id: EDITOR.id || 'el' + uid(),
      type,
      position: $('#elPosition').value,
      width: Number($('#elWidth').value) || 70,
      caption: type === 'text' ? '' : $('#elCaption').value.trim(),
      data: {},
    };
    if (type === 'table') el.data = { text: $('#elTableText').value, header: $('#elTableHeader').checked };
    if (type === 'text') el.data = { text: $('#elText').value, boxed: $('#elTextBoxed').checked };
    if (type === 'chart') {
      const dataText = $('#elChartData').value;
      el.data = {
        type: $('#elChartType').value,
        title: $('#elChartTitle').value.trim(),
        xLabel: $('#elChartX').value.trim(),
        yLabel: $('#elChartY').value.trim(),
        dataText,
        data: Charts.parseChartData(dataText),
        showValues: $('#elChartValues').checked,
        bw: $('#elChartBW').checked,
      };
    }
    return el;
  }

  function renderEditorPreview() {
    const el = readEditor();
    const errs = $('#elChartErrors');
    if (el.type === 'chart') {
      const e = el.data.data.errors;
      errs.innerHTML = e.slice(0, 5).map((x) => `<li>${esc(x)}</li>`).join('');
      errs.hidden = !e.length;
    }
    const prev = Object.assign({}, el, { id: '', src: EDITOR.image });
    $('#elPreview').innerHTML = TestDoc.renderElement(prev);
  }

  function editorIsEmpty(el) {
    if (el.type === 'image') return !EDITOR.image;
    if (el.type === 'table') return !TestDoc.parseTable(el.data.text).length;
    if (el.type === 'chart') return !el.data.data.labels.length;
    return !el.data.text.trim();
  }

  function saveElement() {
    const el = readEditor();
    if (editorIsEmpty(el)) {
      toast(el.type === 'image' ? 'Primero elige o pega una imagen.' : 'El elemento está vacío.');
      return;
    }
    const q = docParsed.questions[EDITOR.qIndex];
    el.qIndex = EDITOR.qIndex;
    el.qKey = stemKey(q);
    const list = state.exam.doc.elements;
    const i = list.findIndex((e) => e.id === el.id);
    if (i >= 0) list[i] = el;
    else list.push(el);
    if (el.type === 'image') {
      assetCache.set(el.id, EDITOR.image);
      assetStore.put(el.id, EDITOR.image).catch(() => toast('No se pudo guardar la imagen en este navegador; se mantendrá sólo mientras la página esté abierta.'));
    } else if (assetCache.has(el.id)) {
      assetCache.delete(el.id);
      assetStore.remove(el.id);
    }
    save();
    $('#elDialog').close();
    renderDoc();
  }

  function removeElement(id) {
    state.exam.doc.elements = state.exam.doc.elements.filter((e) => e.id !== id);
    assetCache.delete(id);
    assetStore.remove(id);
    save();
    renderDoc();
  }

  /** Reduce la imagen (máx. 1600 px) y la guarda como data URL; PNG para diagramas, JPG para fotos. */
  async function loadElementImage(file) {
    try {
      const bmp = await loadBitmap(file);
      const w0 = bmp.naturalWidth || bmp.width;
      const h0 = bmp.naturalHeight || bmp.height;
      const sc = Math.min(1, 1600 / Math.max(w0, h0));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w0 * sc));
      cv.height = Math.max(1, Math.round(h0 * sc));
      const ctx = cv.getContext('2d');
      const png = /png|gif|svg|bmp/.test(file.type || '');
      if (!png) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cv.width, cv.height);
      }
      ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
      if (bmp.close) bmp.close();
      EDITOR.image = png ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.9);
      if (EDITOR.type !== 'image') setEditorType('image');
      else renderEditorPreview();
    } catch (e) {
      toast('No se pudo leer la imagen.');
    }
  }

  /** Carga en memoria las imágenes guardadas de los elementos. */
  async function loadAssets() {
    const imgs = state.exam.doc.elements.filter((e) => e.type === 'image' && !assetCache.has(e.id));
    for (const el of imgs) {
      const v = await assetStore.get(el.id);
      if (v) assetCache.set(el.id, v);
    }
    if (imgs.length && !$('#tab-evaluacion').hidden) renderDoc();
  }

  let docTimer = null;
  function scheduleDocRender() {
    clearTimeout(docTimer);
    docTimer = setTimeout(renderDoc, 250);
  }

  function readDocForm() {
    const f = state.exam.doc.format;
    f.school = $('#docSchool').value;
    f.title = $('#docTitle').value;
    f.subject = $('#docSubject').value;
    f.teacher = $('#docTeacher').value;
    f.course = $('#docCourse').value;
    f.paper = $('#docPaper').value;
    f.instructions = $('#docInstructions').value;
    f.objectives = $('#docObjectives').value;
    f.numbering = $('#docNumbering').value;
    f.openLines = Number($('#docOpenLines').value) || 6;
    f.openStyle = $('#docOpenStyle').value;
    f.tfJustifyLines = Number($('#docTfJustify').value) || 0;
    f.totalPoints = $('#docTotalPoints').value.trim();
    f.fontFamily = $('#docFont').value;
    f.fontSize = Number($('#docFontSize').value) || 12;
    f.columns = Number($('#docColumns').value) || 1;
    f.letterStyle = $('#docLetters').value;
    f.optionsLayout = $('#docOptLayout').value;
    f.showOA = $('#docShowOA').checked;
    for (const cb of $$('[data-docfield]')) f.fields[cb.dataset.docfield] = cb.checked;
    state.exam.doc.text = $('#docText').value;
    state.exam.doc.sortByNumber = $('#docSort').checked;
    $('#sheetSchool').value = f.school;
    save();
    scheduleDocRender();
  }

  async function loadLogo(file) {
    try {
      const bmp = await loadBitmap(file);
      const w0 = bmp.naturalWidth || bmp.width;
      const h0 = bmp.naturalHeight || bmp.height;
      const sc = Math.min(1, 400 / Math.max(w0, h0));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w0 * sc));
      cv.height = Math.max(1, Math.round(h0 * sc));
      cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
      if (bmp.close) bmp.close();
      state.exam.doc.format.logo = cv.toDataURL('image/png');
      save();
      fillDocForm();
      renderDoc();
    } catch (e) {
      toast('No se pudo leer la imagen del logo.');
    }
  }

  function printDoc() {
    renderDoc();
    if (!docQuestions.length) return;
    const paper = PAPERS[state.exam.doc.format.paper] || PAPERS.carta;
    setPageStyle(
      `@page { size: ${paper.width}mm ${paper.height}mm; margin: 15mm 15mm 18mm; ` +
        `@bottom-right { content: "Página " counter(page) " de " counter(pages); font: 9pt Arial, sans-serif; color: #555; } }`
    );
    $('#printArea').className = 'print-area print-doc';
    $('#printArea').innerHTML = TestDoc.renderTestHTML(docQuestions, docFormat(), {
      maxScore: docMaxScore(),
      intro: docParsed.intro,
      elements: matchElements(docQuestions).byQuestion,
      sections: docParsed.sections,
    });
    window.print();
  }

  function injectDocStyles() {
    const st = document.createElement('style');
    st.textContent = TestDoc.TEST_CSS;
    document.head.appendChild(st);
  }

  /** Traspasa las preguntas de la evaluación a la hoja de respuestas: cantidad, alternativas, clave y OA. */
  function applyDocToSheet() {
    renderDoc();
    const all = docQuestions;
    if (!all.length) return;
    // Sólo las preguntas de selección múltiple van a la hoja de respuestas;
    // verdadero o falso y desarrollo se responden en la misma prueba.
    const mcIdx = all.map((q, i) => (q.type === 'mc' ? i : -1)).filter((i) => i >= 0);
    if (!mcIdx.length) {
      toast('La evaluación no tiene preguntas de selección múltiple para la hoja de respuestas.');
      return;
    }
    const qs = mcIdx.map((i) => all[i]);
    const n = Math.min(qs.length, LIMITS.maxQuestions);
    const c = Math.min(LIMITS.maxChoices, Math.max(LIMITS.minChoices, qs.reduce((m, q) => Math.max(m, q.options.length), 0)));
    const withKey = qs.filter((q) => q.correct !== null).length;
    const oaMap = new Map();
    qs.slice(0, n).forEach((q, i) => {
      if (!q.oa) return;
      if (!oaMap.has(q.oa)) oaMap.set(q.oa, []);
      oaMap.get(q.oa).push(i);
    });
    const changes = [`${n} pregunta${n === 1 ? '' : 's'} con ${c} alternativas (${CHOICE_LABELS[0]}–${CHOICE_LABELS[c - 1]})`];
    if (withKey) changes.push(`la clave de ${withKey} pregunta(s)`);
    if (oaMap.size) changes.push(`${oaMap.size} objetivo(s) de aprendizaje`);
    if (qs.length > LIMITS.maxQuestions) changes.push(`(sólo se usan las primeras ${LIMITS.maxQuestions} preguntas)`);
    const notes = [];
    const others = all.length - qs.length;
    if (others) notes.push(`Las ${others} pregunta(s) de verdadero o falso y de desarrollo se responden en la misma prueba y no van a la hoja.`);
    // ¿Coincide la numeración impresa con la de la hoja (1, 2, 3…)?
    const plan = TestDoc.planSections(all, docParsed.sections, state.exam.doc.format);
    const printed = mcIdx.slice(0, n).map((i) => plan.numbers[i]);
    if (printed.some((num, k) => num !== k + 1)) {
      notes.push(
        (n === 1
          ? `Atención: en la prueba esta pregunta lleva el número ${printed[0]}, pero en la hoja de respuestas será la 1. `
          : `Atención: en la prueba estas preguntas llevan los números ${printed[0]}–${printed[printed.length - 1]}, pero en la hoja de respuestas serán 1–${n}. `) +
          'Para que coincidan, pon el ítem de selección múltiple primero o usa “Reiniciar en cada ítem”.'
      );
    }
    if (!confirm(`Se configurará la hoja de respuestas con: ${changes.join(', ')}.${notes.length ? '\n\n' + notes.join('\n\n') : ''}\n\n¿Continuar?`)) return;
    if (!applyStructure(Object.assign({}, state.exam, { numQuestions: n, numChoices: c }))) return;
    if (withKey) state.exam.key = fitKey(qs.slice(0, n).map((q) => q.correct), n, c);
    if (oaMap.size) {
      state.exam.oaText = Array.from(oaMap.entries())
        .map(([name, idx]) => `${name}: ${Grading.formatRanges(idx)}`)
        .join('\n');
    }
    if (!state.exam.title && state.exam.doc.format.title) state.exam.title = state.exam.doc.format.title;
    save();
    fillExamForm();
    renderKey();
    renderObjectives();
    updateLayoutError();
    renderResultsBadge();
    toast('Hoja de respuestas configurada con las preguntas de selección múltiple de la evaluación.');
  }


  /* ------------------------------------------------------------------ */
  /* 3. Escaneo                                                          */
  /* ------------------------------------------------------------------ */

  function loadBitmap(file) {
    const viaImg = () =>
      new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error('Formato de imagen no soportado.'));
        };
        img.src = url;
      });
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(viaImg);
    }
    return viaImg();
  }

  async function fileToGray(file) {
    const bmp = await loadBitmap(file);
    const w0 = bmp.naturalWidth || bmp.width;
    const h0 = bmp.naturalHeight || bmp.height;
    const s = Math.min(1, MAX_IMAGE_SIDE / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * s));
    const h = Math.max(1, Math.round(h0 * s));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    return { gray: OMR.toGray(ctx.getImageData(0, 0, w, h).data, w, h), canvas: cv };
  }

  function canvasToBlob(cv, type, quality) {
    return new Promise((resolve, reject) =>
      cv.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen.'))), type, quality)
    );
  }

  function scanOptions() {
    return { threshold: state.exam.threshold };
  }

  /**
   * Prepara las imágenes que se conservan de cada hoja: la hoja enderezada
   * (sobre la que se dibuja la corrección) y la foto original, como evidencia.
   */
  async function makeView(res, photoCanvas) {
    const rect = res.rectified;
    const full = document.createElement('canvas');
    full.width = rect.width;
    full.height = rect.height;
    const fctx = full.getContext('2d');
    const imgData = fctx.createImageData(rect.width, rect.height);
    for (let i = 0, j = 0; i < rect.data.length; i++, j += 4) {
      const v = rect.data[i];
      imgData.data[j] = imgData.data[j + 1] = imgData.data[j + 2] = v;
      imgData.data[j + 3] = 255;
    }
    fctx.putImageData(imgData, 0, 0);
    const scale = Math.min(1, PREVIEW_WIDTH / rect.width);
    const cv = document.createElement('canvas');
    cv.width = Math.round(rect.width * scale);
    cv.height = Math.round(rect.height * scale);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(full, 0, 0, cv.width, cv.height);
    const sheetBlob = await canvasToBlob(cv, 'image/jpeg', 0.88);

    let pc = photoCanvas;
    const ps = Math.min(1, PHOTO_MAX_SIDE / Math.max(pc.width, pc.height));
    if (ps < 1) {
      pc = document.createElement('canvas');
      pc.width = Math.round(photoCanvas.width * ps);
      pc.height = Math.round(photoCanvas.height * ps);
      const pctx = pc.getContext('2d');
      pctx.imageSmoothingQuality = 'high';
      pctx.drawImage(photoCanvas, 0, 0, pc.width, pc.height);
    }
    const photoBlob = await canvasToBlob(pc, 'image/jpeg', 0.85);
    return { url: URL.createObjectURL(sheetBlob), sheetBlob, photoBlob, scale, overlay: res.overlay, image: null };
  }

  let storageWarned = false;
  function persistView(id, view) {
    imageStore
      .put(id, { sheet: view.sheetBlob, photo: view.photoBlob, scale: view.scale, overlay: view.overlay })
      .catch(() => {
        if (storageWarned) return;
        storageWarned = true;
        toast('No se pudieron guardar las imágenes en este navegador: descarga las evidencias antes de cerrar la página.');
      });
  }

  function createResult(res, fileName) {
    return {
      id: uid(),
      fileName,
      createdAt: Date.now(),
      scannedAt: Date.now(),
      code: res.id.value,
      name: '',
      answers: res.answers.map((a) => ({ marked: a.marked, uncertain: a.uncertain })),
      idMarks: res.id.digits.map((d) => d.marked),
      idUncertain: res.id.digits.some((d) => d.uncertain),
      threshold: res.threshold,
      warnings: res.warnings,
    };
  }

  function queueItem(name) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="spinner"></span><span class="name"></span>`;
    li.querySelector('.name').textContent = `${name} — procesando…`;
    $('#scanQueue').prepend(li);
    return {
      ok(text, id) {
        li.className = 'ok';
        li.innerHTML = `<span>✓</span><span class="name"></span><button type="button" class="btn small ghost" data-view="${esc(id)}">Ver</button>`;
        li.querySelector('.name').textContent = text;
      },
      error(text) {
        li.className = 'error';
        li.innerHTML = `<span>✗</span><span class="name"></span>`;
        li.querySelector('.name').textContent = text;
        li.querySelector('.name').style.whiteSpace = 'normal';
      },
    };
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter((f) => !f.type || f.type.startsWith('image/'));
    if (!files.length) return;
    const layout = getLayout();
    if (!layout) return toast(layoutError);
    if (!state.exam.key.some((k) => k !== null)) toast('Aún no hay clave de respuestas: se leerán las marcas, pero no se podrá calificar.');
    for (const file of files) {
      const item = queueItem(file.name || 'foto');
      await nextFrame();
      try {
        const { gray, canvas } = await fileToGray(file);
        const res = OMR.scanSheet(gray, layout, scanOptions());
        if (!res.ok) {
          item.error(`${file.name || 'foto'}: ${res.error}`);
          continue;
        }
        const record = createResult(res, file.name || 'foto');
        const view = await makeView(res, canvas);
        state.results.push(record);
        images.set(record.id, view);
        persistView(record.id, view);
        save();
        const g = grade(record);
        const who = record.code ? `Código ${record.code}` : file.name || 'Hoja';
        item.ok(`${who} · ${g.correct}/${g.items.length - g.excluded} correctas · nota ${fmt(g.grade, 1)}`, record.id);
        renderDetail($('#scanDetail'), record.id);
      } catch (e) {
        console.error(e);
        item.error(`${file.name || 'foto'}: no se pudo procesar la imagen (${e.message}).`);
      }
    }
    renderResultsBadge();
  }

  async function readKeyFromPhoto(file) {
    const msg = $('#keyPhotoMsg');
    const layout = getLayout();
    if (!layout) return toast(layoutError);
    msg.hidden = false;
    msg.className = 'alert';
    msg.textContent = 'Leyendo la hoja…';
    await nextFrame();
    try {
      const res = OMR.scanSheet((await fileToGray(file)).gray, layout, scanOptions());
      if (!res.ok) {
        msg.className = 'alert error';
        msg.textContent = res.error;
        return;
      }
      state.exam.key = res.answers.map((a) => (a.marked.length === 1 ? a.marked[0] : null));
      save();
      renderKey();
      const missing = state.exam.key.filter((k) => k === null).length;
      msg.className = missing ? 'alert warn' : 'alert ok';
      msg.textContent = missing
        ? `Clave cargada. ${missing} pregunta(s) quedaron sin clave porque estaban en blanco o con más de una marca: revísalas abajo.`
        : 'Clave cargada correctamente. Revísala antes de corregir.';
    } catch (e) {
      msg.className = 'alert error';
      msg.textContent = 'No se pudo procesar la imagen: ' + e.message;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Corrección y detalle de un resultado                                */
  /* ------------------------------------------------------------------ */

  function grade(r) {
    return Grading.gradeAnswers(r.answers, state.exam.key, state.exam.scoring);
  }

  /** Logro del estudiante en cada OA definido (lista vacía si no hay OA). */
  function oaResults(g) {
    const objectives = currentObjectives().objectives;
    return objectives.length ? Grading.objectiveResults(g.items, objectives, state.exam.levels) : [];
  }

  const LEVEL_CLASS = { L: 'lvl-L', ML: 'lvl-ML', NL: 'lvl-NL' };

  function rosterName(code) {
    if (!code || !/^\d+$/.test(code)) return '';
    const lines = state.exam.roster.split(/\r?\n/);
    const n = parseInt(code, 10);
    return n >= 1 && n <= lines.length ? lines[n - 1].trim() : '';
  }

  function displayName(r) {
    return r.name || rosterName(r.code);
  }

  function needsReview(r) {
    const incompleteId = state.exam.idDigits > 0 && (!r.code || r.code.indexOf('?') >= 0);
    return incompleteId || r.idUncertain || r.answers.some((a) => a.uncertain && !a.edited);
  }

  const STATUS = {
    correct: { icon: '✓', label: 'Correcta', color: '#1e8e3e' },
    wrong: { icon: '✗', label: 'Incorrecta', color: '#c62828' },
    multiple: { icon: '‼', label: 'Doble marca', color: '#c62828' },
    blank: { icon: '○', label: 'Omitida', color: '#b26a00' },
    excluded: { icon: '·', label: 'Sin clave', color: '#6b7280' },
  };

  function renderDetail(container, id) {
    const r = state.results.find((x) => x.id === id);
    if (!r) {
      container.innerHTML = '';
      return;
    }
    const prevList = $('.answers-list', container);
    const prevScroll = prevList ? prevList.scrollTop : 0;
    const g = grade(r);
    const sc = state.exam.scoring;
    const c = state.exam.numChoices;
    const failed = g.grade !== null && g.grade < sc.gradePass;
    const view = images.get(r.id);
    const name = displayName(r);

    const rows = g.items
      .map((it, q) => {
        const a = r.answers[q];
        const opts = ['<option value="">—</option>'];
        for (let k = 0; k < c; k++) {
          opts.push(`<option value="${k}"${it.marked.length === 1 && it.marked[0] === k ? ' selected' : ''}>${CHOICE_LABELS[k]}</option>`);
        }
        if (it.marked.length > 1) opts.push(`<option value="multi" selected>${letters(it.marked)}</option>`);
        const st = STATUS[it.status];
        const keyTxt = it.key === null ? 'sin clave' : `clave ${CHOICE_LABELS[it.key]}`;
        const unc = a.uncertain && !a.edited;
        return (
          `<div class="ans ${it.status}${unc ? ' uncertain' : ''}" title="${esc(st.label + (unc ? ' · marca dudosa, revisar' : ''))}">` +
          `<span class="qn">${q + 1}</span>` +
          `<select data-q="${q}" aria-label="Respuesta de la pregunta ${q + 1}">${opts.join('')}</select>` +
          `<span class="icon" style="color:${st.color}">${st.icon}</span><span class="k">${keyTxt}</span></div>`
        );
      })
      .join('');

    const alerts = [];
    if (state.exam.idDigits > 0 && (!r.code || r.code.indexOf('?') >= 0)) {
      alerts.push('No se pudo leer completo el código del estudiante: complétalo manualmente.');
    }
    const unc = r.answers.filter((a) => a.uncertain && !a.edited).length;
    if (unc) alerts.push(`${unc} pregunta(s) con marcas dudosas (recuadro amarillo): revísalas y corrige si es necesario.`);
    for (const w of r.warnings || []) alerts.push(w);

    container.innerHTML = `
      <div class="card detail" data-id="${esc(r.id)}">
        <div class="card-head">
          <h2>${esc(name || (r.code ? 'Código ' + r.code : r.fileName))}</h2>
          <div class="actions">
            <span class="muted small">${esc(r.fileName)}</span>
            ${view ? '<button type="button" class="btn secondary small" data-act="evidence">⬇ Hoja corregida (JPG)</button>' : ''}
            <button type="button" class="btn ghost small danger" data-act="delete">Eliminar</button>
          </div>
        </div>
        <div class="detail-head">
          <div class="who">
            <label class="code">Código<input type="text" data-field="code" value="${esc(r.code || '')}" inputmode="numeric" autocomplete="off"></label>
            <label>Nombre<input type="text" data-field="name" value="${esc(r.name || '')}" placeholder="${esc(rosterName(r.code) || 'Nombre del estudiante')}" autocomplete="off"></label>
          </div>
        </div>
        <div class="score-row">
          <div class="pill ok"><b>${g.correct}</b><span>Correctas</span></div>
          <div class="pill bad"><b>${g.wrong + g.multiple}</b><span>Incorrectas</span></div>
          <div class="pill"><b>${g.blank}</b><span>Omitidas</span></div>
          <div class="pill"><b>${fmtScore(g.score)}/${fmtScore(g.maxScore)}</b><span>Puntaje</span></div>
          <div class="pill"><b>${fmt(g.percent, 0)}%</b><span>Logro</span></div>
          <div class="pill grade${failed ? ' fail' : ''}"><b>${fmt(g.grade, 1)}</b><span>Nota</span></div>
        </div>
        ${renderOaChips(g)}
        ${alerts.map((a) => `<p class="alert warn">${esc(a)}</p>`).join('')}
        <div class="detail-body" style="margin-top:14px">
          <div class="sheet-view">
            ${
              view
                ? `<canvas aria-label="Hoja escaneada con la corrección"></canvas>
                   <div class="legend">
                     <span><i style="background:#1e8e3e"></i>Correcta</span>
                     <span><i style="background:#c62828"></i>Incorrecta / doble</span>
                     <span><i style="border:2px dashed #1565c0"></i>Respuesta correcta</span>
                     <span><i style="border:2px dashed #e0a800;border-radius:2px"></i>Dudosa</span>
                     <span><i style="background:#6a1b9a;border-radius:0;clip-path:polygon(100% 0,0 50%,100% 100%)"></i>Corregida por el docente</span>
                   </div>`
                : '<p class="muted small" data-img-status>Cargando imagen…</p>'
            }
          </div>
          <div class="answers-list">${rows}</div>
        </div>
      </div>`;
    const list = $('.answers-list', container);
    if (list) list.scrollTop = prevScroll;
    if (view) {
      drawOverlay($('canvas', container), r, g, view);
    } else {
      getView(r.id).then((v) => {
        const still = $(`.detail[data-id="${r.id}"]`, container);
        if (!still) return;
        if (v) renderDetail(container, r.id);
        else {
          const st = $('[data-img-status]', container);
          if (st) st.textContent = 'No hay imagen guardada para esta hoja. Las respuestas sí quedan guardadas.';
        }
      });
    }
  }

  function renderOaChips(g) {
    const res = oaResults(g);
    if (!res.length) return '';
    const chips = res
      .map(
        (o) =>
          `<span class="oa-chip ${LEVEL_CLASS[o.level] || ''}" title="${esc(`${o.name}: ${o.correct} de ${o.total} correctas (preguntas ${Grading.formatRanges(o.questions)})`)}">` +
          `<b>${esc(o.name)}</b> ${o.percent === null ? '–' : fmt(o.percent, 0) + '%'} ${o.level ? `<em>${o.level}</em>` : ''}</span>`
      )
      .join('');
    return `<div class="oa-chips">${chips}</div>`;
  }

  function loadPreviewImage(view) {
    if (view.image) return Promise.resolve(view.image);
    const img = new Image();
    img.src = view.url;
    return img.decode().then(() => (view.image = img));
  }

  /** Dibuja la corrección (colores por respuesta) sobre la hoja enderezada. */
  function paintCorrection(ctx, img, r, g, view) {
    ctx.drawImage(img, 0, 0);
    const s = view.scale;
    const lw = Math.max(2, img.width / 450);
    const circle = (b, rad, fill, stroke, dash, width) => {
      ctx.beginPath();
      ctx.arc(b.x * s, b.y * s, rad * s, 0, Math.PI * 2);
      ctx.setLineDash(dash || []);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width || lw;
        ctx.stroke();
      }
    };
    g.items.forEach((it, q) => {
      const bubbles = view.overlay.questions[q];
      if (!bubbles) return;
      const color = STATUS[it.status].color;
      for (const m of it.marked) if (bubbles[m]) circle(bubbles[m], bubbles[m].r * 1.15, color + '55', color, null, lw * 1.25);
      if (it.key !== null && it.status !== 'correct' && bubbles[it.key]) {
        circle(bubbles[it.key], bubbles[it.key].r * 1.45, null, '#1565c0', [lw * 2, lw * 1.5], lw);
      }
      const a = r.answers[q];
      if (a.uncertain && !a.edited) {
        const first = bubbles[0];
        const last = bubbles[bubbles.length - 1];
        const pad = first.r * 1.7;
        ctx.setLineDash([lw * 2.5, lw * 1.5]);
        ctx.strokeStyle = '#e0a800';
        ctx.lineWidth = lw;
        ctx.strokeRect((first.x - pad) * s, (first.y - pad) * s, (last.x - first.x + 2 * pad) * s, 2 * pad * s);
      }
      if (a.edited) {
        // Marca de corrección manual: triángulo a la derecha de la fila, apuntando a ella.
        const last = bubbles[bubbles.length - 1];
        const t = last.r * 0.7 * s;
        const x = (last.x + last.r * 1.6) * s + t;
        const y = last.y * s;
        ctx.setLineDash([]);
        ctx.fillStyle = '#6a1b9a';
        ctx.beginPath();
        ctx.moveTo(x + t, y - t);
        ctx.lineTo(x - t * 0.6, y);
        ctx.lineTo(x + t, y + t);
        ctx.closePath();
        ctx.fill();
      }
    });
    (r.idMarks || []).forEach((marked, row) => {
      const bubbles = view.overlay.id[row];
      if (!bubbles) return;
      for (const m of marked) if (bubbles[m]) circle(bubbles[m], bubbles[m].r * 1.2, '#6a1b9a44', '#6a1b9a', null, lw);
    });
    ctx.setLineDash([]);
  }

  function drawOverlay(canvas, r, g, view) {
    loadPreviewImage(view).then((img) => {
      canvas.width = img.width;
      canvas.height = img.height;
      paintCorrection(canvas.getContext('2d'), img, r, g, view);
    });
  }

  function onDetailEvent(container, e) {
    const card = e.target.closest('.detail');
    if (!card) return;
    const r = state.results.find((x) => x.id === card.dataset.id);
    if (!r) return;
    if (e.type === 'change' && e.target.matches('select[data-q]')) {
      const q = Number(e.target.dataset.q);
      const v = e.target.value;
      if (v === 'multi') return;
      const prev = r.answers[q];
      const original = prev.edited ? prev.original : prev.marked;
      r.answers[q] = { marked: v === '' ? [] : [Number(v)], uncertain: false, edited: true, original };
    } else if (e.type === 'change' && e.target.matches('input[data-field]')) {
      const field = e.target.dataset.field;
      r[field] = e.target.value.trim();
      if (field === 'code') r.idUncertain = false;
    } else if (e.type === 'click' && e.target.closest('[data-act="evidence"]')) {
      downloadSingleEvidence(r);
      return;
    } else if (e.type === 'click' && e.target.closest('[data-act="delete"]')) {
      if (!confirm('¿Eliminar este resultado?')) return;
      state.results = state.results.filter((x) => x.id !== r.id);
      forgetImage(r.id);
      save();
      container.innerHTML = '';
      if (selectedResultId === r.id) selectedResultId = null;
      renderResultsBadge();
      if (!$('#tab-resultados').hidden) renderResults();
      return;
    } else {
      return;
    }
    save();
    renderDetail(container, r.id);
    renderResultsBadge();
    if (!$('#tab-resultados').hidden) renderResultsTable();
  }

  /* ------------------------------------------------------------------ */
  /* 4. Resultados                                                       */
  /* ------------------------------------------------------------------ */

  function renderResultsBadge() {
    const b = $('#resultsBadge');
    const n = state.results.length;
    b.textContent = n;
    b.hidden = n === 0;
    b.style.background = state.results.some(needsReview) ? '' : 'var(--ok)';
  }

  function sortedResults() {
    return state.results
      .map((r) => ({ r, g: grade(r) }))
      .sort((a, b) => {
        const ca = /^\d+$/.test(a.r.code || '') ? parseInt(a.r.code, 10) : Infinity;
        const cb = /^\d+$/.test(b.r.code || '') ? parseInt(b.r.code, 10) : Infinity;
        return ca - cb || a.r.createdAt - b.r.createdAt;
      });
  }

  function renderResults() {
    const has = state.results.length > 0;
    $('#resultsEmpty').hidden = has;
    $('#resultsContent').hidden = !has;
    if (!has) return;
    renderResultsTable();
    if (selectedResultId) renderDetail($('#resultDetail'), selectedResultId);
    else $('#resultDetail').innerHTML = '';
  }

  function renderResultsTable() {
    const rows = sortedResults();
    const sc = state.exam.scoring;
    const grades = rows.map((x) => x.g.grade).filter((g) => g !== null);
    const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
    const passed = grades.filter((g) => g >= sc.gradePass).length;
    const review = rows.filter((x) => needsReview(x.r)).length;
    $('#statsCards').innerHTML = `
      <div class="stat"><b>${rows.length}</b><span>Hojas corregidas</span></div>
      <div class="stat"><b>${fmt(avg(grades), 1)}</b><span>Nota promedio</span></div>
      <div class="stat"><b>${fmt(avg(rows.map((x) => x.g.percent)), 0)}%</b><span>Logro promedio</span></div>
      <div class="stat"><b>${grades.length ? fmt((passed / grades.length) * 100, 0) + '%' : '–'}</b><span>Aprobación (${passed}/${grades.length})</span></div>
      <div class="stat"><b>${review}</b><span>Por revisar</span></div>`;

    const codeCount = {};
    for (const x of rows) if (x.r.code) codeCount[x.r.code] = (codeCount[x.r.code] || 0) + 1;

    const body = rows
      .map((x, i) => {
        const { r, g } = x;
        const tags = [];
        if (needsReview(r)) tags.push('<span class="tag warn">revisar</span>');
        if (r.code && codeCount[r.code] > 1) tags.push('<span class="tag bad">código repetido</span>');
        const gradeCls = g.grade === null ? '' : g.grade >= sc.gradePass ? 'grade-pass' : 'grade-fail';
        return `<tr data-id="${esc(r.id)}"${r.id === selectedResultId ? ' class="selected"' : ''}>
          <td class="num">${i + 1}</td>
          <td>${esc(r.code || '–')}</td>
          <td>${esc(displayName(r) || '')}${tags.join('')}</td>
          <td class="num">${g.correct}</td>
          <td class="num">${g.wrong + g.multiple}</td>
          <td class="num">${g.blank}</td>
          <td class="num">${fmtScore(g.score)}</td>
          <td class="num">${fmt(g.percent, 0)}%</td>
          <td class="num ${gradeCls}">${fmt(g.grade, 1)}</td>
        </tr>`;
      })
      .join('');
    $('#resultsTable').innerHTML = `
      <thead><tr>
        <th class="num">#</th><th>Código</th><th>Nombre</th><th class="num">Correctas</th><th class="num">Incorrectas</th>
        <th class="num">Omitidas</th><th class="num">Puntaje</th><th class="num">Logro</th><th class="num">Nota</th>
      </tr></thead><tbody>${body}</tbody>`;

    renderItemAnalysis(rows);
    renderOaResults(rows);
  }

  function renderItemAnalysis(rows) {
    const c = state.exam.numChoices;
    const stats = Grading.itemAnalysis(rows.map((x) => x.r.answers), state.exam.key, c);
    const head = `<thead><tr><th class="num">N°</th><th>Clave</th><th>% de acierto</th><th>Respuestas (${CHOICE_LABELS.slice(0, c).join(' · ')})</th><th class="num">Omitidas</th><th class="num">Dobles</th></tr></thead>`;
    const body = stats
      .map((s) => {
        const pct = s.correctPct;
        const cls = pct === null ? '' : pct < 40 ? 'low' : pct < 65 ? 'mid' : '';
        const bar = pct === null ? '<span class="muted">sin clave</span>' : `<span class="bar ${cls}"><i style="width:${pct}%"></i></span>${fmt(pct, 0)}%`;
        const dist = s.counts
          .map((n, k) => `<span class="${k === s.key ? 'is-key' : ''}">${CHOICE_LABELS[k]}: ${n}</span>`)
          .join(' ');
        return `<tr><td class="num">${s.question}</td><td>${s.key === null ? '–' : CHOICE_LABELS[s.key]}</td><td>${bar}</td><td class="dist">${dist}</td><td class="num">${s.blank}</td><td class="num">${s.multiple}</td></tr>`;
      })
      .join('');
    $('#itemTable').innerHTML = head + '<tbody>' + body + '</tbody>';
  }

  function renderOaResults(rows) {
    const card = $('#oaResultsCard');
    const objectives = currentObjectives().objectives;
    card.hidden = !objectives.length;
    if (!objectives.length) return;
    const lv = state.exam.levels;
    const per = rows.map((x) => oaResults(x.g));
    const summary = Grading.objectiveSummary(per, objectives);
    const bar = (pct) => {
      if (pct === null) return '–';
      const cls = Grading.levelFor(pct, lv) === 'NL' ? 'low' : Grading.levelFor(pct, lv) === 'ML' ? 'mid' : '';
      return `<span class="bar ${cls}"><i style="width:${pct}%"></i></span>${fmt(pct, 0)}%`;
    };
    $('#oaTable').innerHTML =
      `<thead><tr><th>Objetivo</th><th>Preguntas</th><th>Logro promedio</th>` +
      `<th class="num" title="${lv.achieved}% o más">L (≥${lv.achieved}%)</th><th class="num">ML (${lv.partial}–&lt;${lv.achieved}%)</th><th class="num">NL (&lt;${lv.partial}%)</th></tr></thead><tbody>` +
      summary
        .map(
          (o) =>
            `<tr><td><strong>${esc(o.name)}</strong></td><td>${esc(Grading.formatRanges(o.questions))}</td><td>${bar(o.average)}</td>` +
            `<td class="num">${o.counts.L}</td><td class="num">${o.counts.ML}</td><td class="num">${o.counts.NL}</td></tr>`
        )
        .join('') +
      '</tbody>';
    $('#oaMatrix').innerHTML =
      `<thead><tr><th>Código</th><th>Nombre</th>${objectives.map((o) => `<th class="num">${esc(o.name)}</th>`).join('')}</tr></thead><tbody>` +
      rows
        .map(
          (x, i) =>
            `<tr><td>${esc(x.r.code || '–')}</td><td>${esc(displayName(x.r))}</td>` +
            per[i].map((o) => `<td class="num ${LEVEL_CLASS[o.level] || ''}">${o.percent === null ? '–' : fmt(o.percent, 0) + '%'}</td>`).join('') +
            '</tr>'
        )
        .join('') +
      '</tbody>';
  }

  function exportCsv() {
    const sep = ';';
    const n = state.exam.numQuestions;
    const cell = (v) => {
      const s = String(v == null ? '' : v);
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const dec = (v, d) => (v == null ? '' : v.toFixed(d).replace('.', ','));
    const qCols = [];
    for (let q = 1; q <= n; q++) qCols.push('P' + q);
    const lines = [];
    lines.push(
      ['N°', 'Código', 'Nombre', 'Archivo', 'Correctas', 'Incorrectas', 'Omitidas', 'Dobles marcas', 'Puntaje', 'Puntaje máximo', '% logro', 'Nota']
        .concat(currentObjectives().objectives.map((o) => `% ${o.name}`))
        .concat(qCols)
        .map(cell)
        .join(sep)
    );
    lines.push(
      ['', '', 'CLAVE', '', '', '', '', '', '', '', '', '']
        .concat(currentObjectives().objectives.map(() => ''))
        .concat(state.exam.key.map((k) => (k === null ? '' : CHOICE_LABELS[k])))
        .map(cell)
        .join(sep)
    );
    sortedResults().forEach(({ r, g }, i) => {
      lines.push(
        [i + 1, r.code || '', displayName(r), r.fileName, g.correct, g.wrong, g.blank, g.multiple, dec(g.score, 2), dec(g.maxScore, 2), dec(g.percent, 1), dec(g.grade, 1)]
          .concat(oaResults(g).map((o) => dec(o.percent, 1)))
          .concat(r.answers.map((a) => letters(a.marked)))
          .map(cell)
          .join(sep)
      );
    });
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    download(`${slug(state.exam.title)}-resultados.csv`, blob);
  }

  /* ------------------------------------------------------------------ */
  /* Evidencias: hojas corregidas, fotos originales y planilla Excel      */
  /* ------------------------------------------------------------------ */

  function dateStamp(d) {
    const p2 = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  }

  function fmtDateTime(ts) {
    if (!ts) return '–';
    const d = new Date(ts);
    const p2 = (n) => String(n).padStart(2, '0');
    return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }

  function slugPart(s, fallback) {
    const v = String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40);
    return v || fallback;
  }

  /** Nombre de archivo de la evidencia: 01_07_ana-aravena */
  function evidenceBaseName(r, index) {
    const n = String(index + 1).padStart(2, '0');
    const code = r.code && r.code.indexOf('?') < 0 ? r.code : 'sin-codigo';
    return `${n}_${slugPart(code, 'sin-codigo')}_${slugPart(displayName(r), 'sin-nombre')}`;
  }

  function manualEdits(r) {
    const out = [];
    r.answers.forEach((a, q) => {
      if (a.edited) out.push(`P${q + 1}: ${letters(a.original || []) || '—'} → ${letters(a.marked) || '—'}`);
    });
    return out;
  }

  function wrapText(ctx, text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  /**
   * Imagen de evidencia: encabezado con los datos del estudiante y la
   * corrección, la hoja escaneada con las respuestas marcadas en colores y
   * una leyenda.
   */
  async function renderEvidenceCanvas(r, view) {
    const img = await loadPreviewImage(view);
    const g = grade(r);
    const sc = state.exam.scoring;
    const W = img.width;
    const f = W / 1200;
    const pad = Math.round(36 * f);
    const font = (size, weight) => `${weight || 400} ${Math.round(size * f)}px Arial, Helvetica, sans-serif`;
    const measure = document.createElement('canvas').getContext('2d');

    // Contenido del encabezado.
    const lines = [];
    lines.push({ text: state.exam.title || 'Prueba', font: font(34, 700), color: '#1c2430' });
    if (state.exam.subtitle) lines.push({ text: state.exam.subtitle, font: font(22), color: '#5d6877' });
    lines.push({
      text: `Estudiante: ${displayName(r) || '—'}     Código: ${r.code || '—'}`,
      font: font(24, 700),
      color: '#1c2430',
      gapBefore: 10,
    });
    const failed = g.grade !== null && g.grade < sc.gradePass;
    lines.push({
      parts: [
        { text: `Correctas: ${g.correct}   Incorrectas: ${g.wrong + g.multiple}   Omitidas: ${g.blank}   ` },
        { text: `Puntaje: ${fmtScore(g.score)}/${fmtScore(g.maxScore)}   Logro: ${fmt(g.percent, 0)}%   ` },
        { text: `Nota: ${fmt(g.grade, 1)}`, color: failed ? '#c62828' : '#1e8e3e', bold: true },
      ],
      font: font(24),
      color: '#1c2430',
    });
    lines.push({
      text: `Escaneada: ${fmtDateTime(r.scannedAt || r.createdAt)}   ·   Archivo: ${r.fileName}   ·   Evidencia generada: ${fmtDateTime(Date.now())}`,
      font: font(18),
      color: '#5d6877',
      gapBefore: 6,
    });
    const oaRes = oaResults(g);
    if (oaRes.length) {
      measure.font = font(19);
      const txt = 'Logro por objetivo: ' + oaRes.map((o) => `${o.name} ${o.percent === null ? '–' : fmt(o.percent, 0) + '%'}${o.level ? ` (${o.level})` : ''}`).join('   ');
      for (const l of wrapText(measure, txt, W - 2 * pad)) lines.push({ text: l, font: font(19), color: '#1c2430' });
    }
    const edits = manualEdits(r);
    if (edits.length) {
      measure.font = font(19, 700);
      for (const l of wrapText(measure, `Correcciones manuales del docente: ${edits.join(', ')}`, W - 2 * pad)) {
        lines.push({ text: l, font: font(19, 700), color: '#6a1b9a' });
      }
    }
    if (needsReview(r)) {
      lines.push({ text: 'Atención: la hoja tiene marcas dudosas sin revisar (recuadros amarillos).', font: font(19, 700), color: '#b26a00' });
    }

    let headerH = pad;
    for (const l of lines) {
      headerH += (l.gapBefore || 0) * f + parseInt(l.font.split(' ')[1], 10) * 1.35;
    }
    headerH = Math.round(headerH + pad * 0.6);
    const legendH = Math.round(56 * f);

    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = headerH + img.height + legendH;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cv.width, cv.height);

    let y = pad;
    ctx.textBaseline = 'top';
    for (const l of lines) {
      y += (l.gapBefore || 0) * f;
      const size = parseInt(l.font.split(' ')[1], 10);
      if (l.parts) {
        let x = pad;
        for (const part of l.parts) {
          ctx.font = part.bold ? l.font.replace(/^\d+/, '700') : l.font;
          ctx.fillStyle = part.color || l.color;
          ctx.fillText(part.text, x, y);
          x += ctx.measureText(part.text).width;
        }
      } else {
        ctx.font = l.font;
        ctx.fillStyle = l.color;
        ctx.fillText(l.text, pad, y);
      }
      y += size * 1.35;
    }
    ctx.fillStyle = '#1f4e79';
    ctx.fillRect(0, headerH - Math.round(4 * f), W, Math.round(4 * f));

    ctx.save();
    ctx.translate(0, headerH);
    paintCorrection(ctx, img, r, g, view);
    ctx.restore();

    // Leyenda.
    const ly = headerH + img.height + legendH / 2;
    const items = [
      { color: '#1e8e3e', label: 'Correcta', fill: true },
      { color: '#c62828', label: 'Incorrecta / doble marca', fill: true },
      { color: '#1565c0', label: 'Respuesta correcta', dash: true },
      { color: '#e0a800', label: 'Dudosa', square: true },
      { color: '#6a1b9a', label: 'Corregida por el docente', tri: true },
    ];
    ctx.font = font(18);
    ctx.textBaseline = 'middle';
    let x = pad;
    const rr = 9 * f;
    for (const it of items) {
      ctx.beginPath();
      ctx.setLineDash(it.dash ? [4 * f, 3 * f] : []);
      ctx.lineWidth = 2.5 * f;
      if (it.square) {
        ctx.strokeStyle = it.color;
        ctx.strokeRect(x, ly - rr, rr * 2, rr * 2);
      } else if (it.tri) {
        ctx.fillStyle = it.color;
        ctx.moveTo(x + rr * 1.8, ly - rr);
        ctx.lineTo(x + rr * 0.3, ly);
        ctx.lineTo(x + rr * 1.8, ly + rr);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.arc(x + rr, ly, rr, 0, Math.PI * 2);
        if (it.fill) {
          ctx.fillStyle = it.color + '55';
          ctx.fill();
        }
        ctx.strokeStyle = it.color;
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = '#1c2430';
      ctx.fillText(it.label, x + rr * 2 + 8 * f, ly);
      x += rr * 2 + 8 * f + ctx.measureText(it.label).width + 26 * f;
    }
    return cv;
  }

  async function downloadSingleEvidence(r) {
    const view = await getView(r.id);
    if (!view) return toast('No hay imagen guardada para esta hoja.');
    const idx = sortedResults().findIndex((x) => x.r.id === r.id);
    const cv = await renderEvidenceCanvas(r, view);
    download(`${evidenceBaseName(r, Math.max(0, idx))}.jpg`, await canvasToBlob(cv, 'image/jpeg', 0.9));
  }

  /** Planilla Excel con los resultados, hipervínculos a las imágenes y análisis por pregunta. */
  function buildWorkbook(rows, links) {
    const exam = state.exam;
    const sc = exam.scoring;
    const n = exam.numQuestions;
    const L = (k) => (k === null || k === undefined ? '' : CHOICE_LABELS[k]);
    const head = [
      'N°', 'Código', 'Nombre', 'Correctas', 'Incorrectas', 'Omitidas', 'Dobles marcas', 'Puntaje',
      'Puntaje máximo', '% logro', 'Nota',
    ];
    const objectives = currentObjectives().objectives;
    for (const o of objectives) head.push(`% ${o.name}`);
    head.push('Estado', 'Hoja corregida', 'Foto original', 'Archivo');
    const firstQ = head.length;
    for (let q = 1; q <= n; q++) head.push('P' + q);

    const sheetRows = [];
    sheetRows.push([{ v: exam.title || 'Resultados', s: 'title' }]);
    const info = [
      exam.subtitle,
      `Exportado: ${fmtDateTime(Date.now())}`,
      `Exigencia: ${sc.exigencia}%`,
      `Puntos por correcta: ${sc.pointsCorrect}`,
      sc.penaltyWrong ? `Descuento por incorrecta: ${sc.penaltyWrong}` : null,
    ].filter(Boolean);
    sheetRows.push([{ v: info.join('   ·   '), s: 'muted' }]);
    sheetRows.push([{ v: 'Los hipervínculos abren las imágenes guardadas junto a este archivo (carpetas hojas_corregidas y fotos_originales).', s: 'muted' }]);
    sheetRows.push(head.map((h) => ({ v: h, s: 'header' })));
    const keyRow = new Array(head.length).fill(null);
    keyRow[2] = { v: 'CLAVE', s: 'bold' };
    exam.key.forEach((k, q) => (keyRow[firstQ + q] = { v: L(k) || '–', s: 'bold' }));
    sheetRows.push(keyRow);

    rows.forEach(({ r, g }, i) => {
      const edits = manualEdits(r);
      const status = needsReview(r) ? 'Revisar' : edits.length ? `Corregida manualmente (${edits.length})` : 'OK';
      const link = links[i] || {};
      const row = [
        i + 1,
        r.code || '',
        displayName(r),
        g.correct,
        g.wrong,
        g.blank,
        g.multiple,
        { v: g.score, s: 'dec1' },
        g.maxScore,
        { v: g.percent, s: 'dec1' },
        g.grade === null ? '' : { v: g.grade, s: g.grade >= sc.gradePass ? 'ok' : 'bad' },
        ...oaResults(g).map((o) => (o.percent === null ? '' : { v: o.percent, s: 'lvl' + o.level })),
        status,
        link.sheet ? { v: 'Ver hoja corregida', link: link.sheet, tooltip: link.sheet } : { v: 'sin imagen', s: 'muted' },
        link.photo ? { v: 'Ver foto original', link: link.photo, tooltip: link.photo } : { v: 'sin imagen', s: 'muted' },
        r.fileName,
      ];
      g.items.forEach((it) => {
        const txt = letters(it.marked);
        row.push(txt ? { v: txt, s: it.status === 'wrong' || it.status === 'multiple' ? 'bad' : 'normal' } : '');
      });
      sheetRows.push(row);
    });

    const headerRow = 4;
    const lastCol = Xlsx.colName(head.length - 1);
    const cols = [5, 10, 28, 10, 11, 10, 9, 9, 10, 9, 7]
      .concat(objectives.map((o) => Math.max(9, Math.min(24, o.name.length + 4))))
      .concat([16, 20, 18, 22])
      .concat(new Array(n).fill(5));

    // Hoja de análisis por pregunta.
    const c = exam.numChoices;
    const stats = Grading.itemAnalysis(rows.map((x) => x.r.answers), exam.key, c);
    const oaOf = (q) => objectives.filter((o) => o.questions.indexOf(q) >= 0).map((o) => o.name).join(', ');
    const aRows = [[{ v: 'Análisis por pregunta', s: 'title' }], []];
    aRows.push(['N°', 'OA', 'Clave', '% de acierto'].concat(CHOICE_LABELS.slice(0, c), ['Omitidas', 'Dobles marcas']).map((h) => ({ v: h, s: 'header' })));
    for (const st of stats) {
      aRows.push(
        [st.question, oaOf(st.question - 1), L(st.key) || '–', st.correctPct === null ? '' : { v: st.correctPct, s: 'dec1' }].concat(st.counts, [st.blank, st.multiple])
      );
    }

    // Hoja de logro por objetivo de aprendizaje.
    const sheets = [];
    if (objectives.length) {
      const lv = exam.levels;
      const per = rows.map((x) => oaResults(x.g));
      const summary = Grading.objectiveSummary(per, objectives);
      const oRows = [[{ v: 'Logro por objetivo de aprendizaje', s: 'title' }]];
      oRows.push([{ v: `Niveles: L = Logrado (≥ ${lv.achieved}%) · ML = Medianamente logrado (≥ ${lv.partial}% y < ${lv.achieved}%) · NL = No logrado (< ${lv.partial}%)`, s: 'muted' }]);
      oRows.push([]);
      oRows.push(['Objetivo', 'Preguntas', 'N° preguntas', '% logro promedio', 'Nivel del curso', 'Estudiantes L', 'Estudiantes ML', 'Estudiantes NL'].map((h) => ({ v: h, s: 'header' })));
      for (const o of summary) {
        const level = Grading.levelFor(o.average, lv);
        oRows.push([
          { v: o.name, s: 'bold' },
          Grading.formatRanges(o.questions),
          o.questions.length,
          o.average === null ? '' : { v: o.average, s: level ? 'lvl' + level : 'dec1' },
          level ? Grading.LEVEL_LABELS[level] : '',
          o.counts.L,
          o.counts.ML,
          o.counts.NL,
        ]);
      }
      oRows.push([]);
      oRows.push([{ v: 'Logro de cada estudiante (%)', s: 'bold' }]);
      const matrixHeader = oRows.length + 1;
      oRows.push(['N°', 'Código', 'Nombre'].concat(objectives.map((o) => o.name), ['Nota']).map((h) => ({ v: h, s: 'header' })));
      rows.forEach((x, i) => {
        oRows.push(
          [i + 1, x.r.code || '', displayName(x.r)]
            .concat(per[i].map((o) => (o.percent === null ? '' : { v: o.percent, s: 'lvl' + o.level })))
            .concat([x.g.grade === null ? '' : { v: x.g.grade, s: x.g.grade >= sc.gradePass ? 'ok' : 'bad' }])
        );
      });
      sheets.push({
        name: 'Logro por OA',
        rows: oRows,
        cols: [Math.max(12, Math.min(40, Math.max(...objectives.map((o) => o.name.length)) + 2)), 16, 12, 15, 22, 13, 14, 14],
        autoFilter: `A${matrixHeader}:${Xlsx.colName(3 + objectives.length)}${matrixHeader + rows.length}`,
      });
    }

    return Xlsx.build(
      [
        { name: 'Resultados', rows: sheetRows, cols, freeze: { row: headerRow + 1, col: 3 }, autoFilter: `A${headerRow}:${lastCol}${headerRow + 1 + rows.length}` },
        ...sheets,
        { name: 'Análisis por pregunta', rows: aRows, cols: [6, 14, 8, 13].concat(new Array(c).fill(7), [10, 13]), freeze: { row: 3 } },
      ],
      { title: exam.title }
    );
  }

  /**
   * Arma el paquete de evidencias: planilla + hojas corregidas + fotos originales.
   * Devuelve { folder, files: [{ path, data: Uint8Array }], missing }.
   */
  async function buildEvidencePackage(onProgress) {
    const rows = sortedResults();
    const folder = `${slugPart(state.exam.title, 'prueba')}_${dateStamp(new Date())}`;
    const files = [];
    const links = [];
    let missing = 0;
    for (let i = 0; i < rows.length; i++) {
      const { r } = rows[i];
      const base = evidenceBaseName(r, i);
      const view = await getView(r.id);
      const link = {};
      if (view) {
        const cv = await renderEvidenceCanvas(r, view);
        const blob = await canvasToBlob(cv, 'image/jpeg', 0.9);
        link.sheet = `hojas_corregidas/${base}.jpg`;
        files.push({ path: link.sheet, data: new Uint8Array(await blob.arrayBuffer()) });
        if (view.photoBlob) {
          link.photo = `fotos_originales/${base}.jpg`;
          files.push({ path: link.photo, data: new Uint8Array(await view.photoBlob.arrayBuffer()) });
        }
      } else {
        missing++;
      }
      links.push(link);
      if (onProgress) onProgress(i + 1, rows.length);
      await nextFrame();
    }
    files.unshift({ path: 'resultados.xlsx', data: buildWorkbook(rows, links) });
    files.push({
      path: 'LEEME.txt',
      data: new TextEncoder().encode(
        [
          `Evidencias: ${state.exam.title || 'Prueba'}`,
          `Generado: ${fmtDateTime(Date.now())}`,
          '',
          'resultados.xlsx     Planilla con puntajes, notas y respuestas. Las columnas',
          '                    "Hoja corregida" y "Foto original" tienen hipervínculos',
          '                    que abren la imagen de cada estudiante.',
          'hojas_corregidas/   Hoja escaneada de cada estudiante con la corrección.',
          'fotos_originales/   Foto tal como fue tomada, sin procesar.',
          '',
          'Importante: si descargaste un ZIP, primero extrae todo su contenido',
          '(clic derecho > "Extraer todo") y abre el Excel desde la carpeta extraída.',
          'Los hipervínculos funcionan mientras el Excel y las carpetas de imágenes',
          'se mantengan juntos (se puede mover o copiar la carpeta completa).',
          '',
        ].join('\r\n')
      ),
    });
    return { folder, files, missing };
  }

  async function withExportButtons(fn) {
    const btns = [$('#btnExportZip'), $('#btnExportFolder')];
    btns.forEach((b) => b && (b.disabled = true));
    const label = $('#exportProgress');
    try {
      await fn((i, total) => {
        label.hidden = false;
        label.textContent = `Preparando evidencias… ${i}/${total}`;
      });
    } finally {
      btns.forEach((b) => b && (b.disabled = false));
      label.hidden = true;
    }
  }

  function reportMissing(missing) {
    if (missing) toast(`${missing} hoja(s) no tienen imagen guardada: aparecen en la planilla sin enlace.`);
  }

  function downloadEvidenceZip() {
    if (!state.results.length) return;
    return withExportButtons(async (progress) => {
      const pkg = await buildEvidencePackage(progress);
      const bytes = ZipWriter.create(pkg.files.map((f) => ({ name: `${pkg.folder}/${f.path}`, data: f.data })));
      download(`${pkg.folder}.zip`, new Blob([bytes], { type: 'application/zip' }));
      toast('ZIP descargado. Extrae todo su contenido antes de abrir el Excel.');
      reportMissing(pkg.missing);
    }).catch((e) => toast('No se pudieron exportar las evidencias: ' + e.message));
  }

  async function saveEvidenceToFolder() {
    if (!state.results.length || typeof window.showDirectoryPicker !== 'function') return;
    let dir;
    try {
      dir = await window.showDirectoryPicker({ id: 'evidencias', mode: 'readwrite' });
    } catch (e) {
      return; // el usuario canceló
    }
    return withExportButtons(async (progress) => {
      const pkg = await buildEvidencePackage(progress);
      const root = await dir.getDirectoryHandle(pkg.folder, { create: true });
      for (const f of pkg.files) {
        const parts = f.path.split('/');
        let d = root;
        for (const part of parts.slice(0, -1)) d = await d.getDirectoryHandle(part, { create: true });
        const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
        const w = await fh.createWritable();
        await w.write(f.data);
        await w.close();
      }
      toast(`Evidencias guardadas en la carpeta "${pkg.folder}".`);
      reportMissing(pkg.missing);
    }).catch((e) => toast('No se pudieron guardar las evidencias: ' + e.message));
  }

  async function exportExam() {
    // Incluye las imágenes de los elementos para llevar la evaluación completa a otro equipo.
    const assets = {};
    for (const el of state.exam.doc.elements) {
      if (el.type !== 'image') continue;
      const v = assetCache.get(el.id) || (await assetStore.get(el.id));
      if (v) assets[el.id] = v;
    }
    const data = { app: 'lector-hojas-respuesta', version: 2, exam: state.exam, assets };
    download(`${slug(state.exam.title)}-configuracion.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  }

  async function importExam(file) {
    try {
      const data = JSON.parse(await file.text());
      const exam = sanitizeExam(data && data.exam ? data.exam : data);
      if (!applyStructure(exam)) return;
      const results = state.results;
      state.exam = exam;
      state.results = results;
      const assets = (data && data.assets) || {};
      for (const [id, v] of Object.entries(assets)) {
        if (typeof v !== 'string' || !v.startsWith('data:image/')) continue;
        assetCache.set(id, v);
        assetStore.put(id, v).catch(() => {});
      }
      save();
      fillExamForm();
      renderKey();
      renderObjectives();
      updateLayoutError();
      renderResultsBadge();
      renderDoc();
      toast('Configuración importada.');
    } catch (e) {
      toast('El archivo no es una configuración válida.');
    }
  }


  /* ------------------------------------------------------------------ */
  /* Eventos                                                             */
  /* ------------------------------------------------------------------ */

  function bind() {
    const paperSel = $('#exPaper');
    paperSel.innerHTML = PAPER_IDS.map((id) => `<option value="${id}">${esc(PAPERS[id].label)}</option>`).join('');
    $('#docPaper').innerHTML = paperSel.innerHTML;
    $('#exFormat').innerHTML = FORMAT_IDS.map((id) => `<option value="${id}">${esc(FORMATS[id].label)}</option>`).join('');
    $('#docFont').innerHTML = Object.keys(TestDoc.FONTS).map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join('');
    $('#exQuestions').max = LIMITS.maxQuestions;
    $('#exIdDigits').max = LIMITS.maxIdDigits;

    for (const b of $$('.tabs button')) b.addEventListener('click', () => showTab(b.dataset.tab));
    document.addEventListener('click', (e) => {
      const go = e.target.closest('[data-goto]');
      if (go) {
        showTab(go.dataset.goto);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    $('#exTitle').addEventListener('input', (e) => {
      state.exam.title = e.target.value;
      save();
    });
    $('#exSubtitle').addEventListener('input', (e) => {
      state.exam.subtitle = e.target.value;
      save();
    });
    for (const id of ['#exQuestions', '#exChoices', '#exIdDigits', '#exPaper', '#exFormat']) $(id).addEventListener('change', onStructureInput);

    // Hoja de respuestas: campos del encabezado y nombre del establecimiento.
    for (const cb of $$('[data-sheetfield]')) {
      cb.addEventListener('change', () => {
        state.exam.sheetFields[cb.dataset.sheetfield] = cb.checked;
        save();
        renderSheetPreview();
      });
    }
    $('#sheetSchool').addEventListener('input', (e) => {
      state.exam.doc.format.school = e.target.value;
      $('#docSchool').value = e.target.value;
      save();
      renderSheetPreview();
    });

    // Objetivos de aprendizaje.
    $('#oaText').addEventListener('input', (e) => {
      state.exam.oaText = e.target.value;
      save();
      renderObjectives();
    });
    for (const id of ['#lvlAchieved', '#lvlPartial']) {
      $(id).addEventListener('change', () => {
        const a = Math.min(100, Math.max(1, parseFloat($('#lvlAchieved').value) || Grading.DEFAULT_LEVELS.achieved));
        const pl = Math.min(a - 1, Math.max(0, parseFloat($('#lvlPartial').value) || 0));
        state.exam.levels = { achieved: a, partial: pl };
        $('#lvlAchieved').value = a;
        $('#lvlPartial').value = pl;
        save();
      });
    }

    // Evaluación.
    for (const el of $$('#tab-evaluacion input:not([type=file]), #tab-evaluacion select, #tab-evaluacion textarea')) {
      el.addEventListener(el.matches('input[type=checkbox], select') ? 'change' : 'input', readDocForm);
    }
    $('#docLogoInput').addEventListener('change', (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) loadLogo(f);
    });
    $('#docLogoRemove').addEventListener('click', () => {
      state.exam.doc.format.logo = '';
      save();
      fillDocForm();
      renderDoc();
    });
    $('#docApply').addEventListener('click', applyDocToSheet);
    $('#docOpenLines').innerHTML = SPACE_CHOICES.map((n) => `<option value="${n}">${n} líneas</option>`).join('');
    $('#docOpenLines').value = String(state.exam.doc.format.openLines);
    $('#docPreview').addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.qtype !== undefined) setQuestionSetting(Number(t.dataset.qtype), 'type', t.value);
      else if (t.dataset.qspace !== undefined) setQuestionSetting(Number(t.dataset.qspace), 'space', Number(t.value));
      else if (t.dataset.qstyle !== undefined) setQuestionSetting(Number(t.dataset.qstyle), 'spaceStyle', t.value);
    });
    $('#docObjectivesFromExam').addEventListener('click', () => {
      const objs = currentObjectives().objectives;
      if (!objs.length) return toast('No hay objetivos definidos en la pestaña Prueba (sección “Objetivos de aprendizaje”).');
      const cur = $('#docObjectives').value.trim();
      if (cur && !confirm('¿Reemplazar los objetivos escritos por los definidos en la prueba?')) return;
      $('#docObjectives').value = objs.map((o) => o.name).join('\n');
      readDocForm();
    });

    // Elementos de las preguntas.
    $('#elChartType').innerHTML = Object.entries(Charts.CHART_TYPES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    $('#docPreview').addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      if (add) return openElementEditor(Number(add.dataset.add));
      const elNode = e.target.closest('[data-el]');
      if (elNode) {
        const el = state.exam.doc.elements.find((x) => x.id === elNode.dataset.el);
        if (el) openElementEditor(el.qIndex, el.id);
      }
    });
    $('#docOrphans').addEventListener('change', (e) => {
      const sel = e.target.closest('[data-reassign]');
      if (!sel || sel.value === '') return;
      const el = state.exam.doc.elements.find((x) => x.id === sel.dataset.reassign);
      const q = docParsed.questions[Number(sel.value)];
      if (el && q) {
        el.qIndex = Number(sel.value);
        el.qKey = stemKey(q);
        save();
        renderDoc();
      }
    });
    $('#docOrphans').addEventListener('click', (e) => {
      const b = e.target.closest('[data-remove-el]');
      if (b && confirm('¿Eliminar este elemento?')) removeElement(b.dataset.removeEl);
    });
    for (const b of $$('[data-eltype]')) b.addEventListener('click', () => setEditorType(b.dataset.eltype));
    for (const el of $$('#elDialog input:not([type=file]), #elDialog select, #elDialog textarea')) {
      el.addEventListener(el.matches('input[type=checkbox], select') ? 'change' : 'input', renderEditorPreview);
    }
    for (const b of $$('[data-el-close]')) b.addEventListener('click', () => $('#elDialog').close());
    $('#elSave').addEventListener('click', saveElement);
    $('#elDelete').addEventListener('click', () => {
      if (!EDITOR.id || !confirm('¿Eliminar este elemento?')) return;
      $('#elDialog').close();
      removeElement(EDITOR.id);
    });
    $('#elImageInput').addEventListener('change', (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) loadElementImage(f);
    });
    const zone = $('#elImageZone');
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      zone.classList.remove('over');
      const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith('image/'));
      if (f) loadElementImage(f);
    });
    // Pegar una imagen copiada (Word, navegador, recorte de pantalla) con Ctrl+V.
    document.addEventListener('paste', (e) => {
      if (!$('#elDialog').open || !e.clipboardData) return;
      const item = Array.from(e.clipboardData.items || []).find((it) => it.kind === 'file' && it.type.startsWith('image/'));
      if (!item) return;
      e.preventDefault();
      loadElementImage(item.getAsFile());
    });
    $('#docPrint').addEventListener('click', printDoc);
    for (const id of ['#scPoints', '#scPenalty', '#scExigencia', '#scMin', '#scPass', '#scMax']) $(id).addEventListener('change', onScoringInput);
    $('#roster').addEventListener('input', (e) => {
      state.exam.roster = e.target.value;
      save();
    });

    $('#keyGrid').addEventListener('click', (e) => {
      const btn = e.target.closest('.bubble-btn');
      if (!btn) return;
      const q = Number(btn.dataset.q);
      const c = Number(btn.dataset.c);
      state.exam.key[q] = state.exam.key[q] === c ? null : c;
      save();
      renderKey();
    });
    $('#keyText').addEventListener('input', (e) => {
      state.exam.key = parseKeyText(e.target.value, state.exam.numQuestions, state.exam.numChoices);
      save();
      renderKey(true);
    });
    $('#keyText').addEventListener('blur', () => renderKey());
    $('#btnClearKey').addEventListener('click', () => {
      if (state.exam.key.some((k) => k !== null) && !confirm('¿Borrar toda la clave de respuestas?')) return;
      state.exam.key = state.exam.key.map(() => null);
      save();
      renderKey();
    });
    $('#keyPhotoInput').addEventListener('change', (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) readKeyFromPhoto(f);
    });

    $('#btnPrint').addEventListener('click', printSheet);
    $('#btnDownloadSvg').addEventListener('click', () => {
      const page = sheetPage();
      if (!page) return toast(layoutError);
      download(`${slug(state.exam.title)}.svg`, new Blob([page.svg], { type: 'image/svg+xml' }));
    });
    $('#btnDownloadSample').addEventListener('click', () => downloadSample().catch((e) => toast('No se pudo generar el ejemplo: ' + e.message)));

    for (const id of ['#cameraInput', '#filesInput']) {
      $(id).addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        e.target.value = '';
        handleFiles(files);
      });
    }
    $('#scanQueue').addEventListener('click', (e) => {
      const b = e.target.closest('[data-view]');
      if (b) renderDetail($('#scanDetail'), b.dataset.view);
    });
    $('#thrAuto').addEventListener('change', (e) => {
      state.exam.threshold = e.target.checked ? null : parseFloat($('#thrRange').value);
      save();
      fillExamForm();
    });
    $('#thrRange').addEventListener('input', (e) => {
      state.exam.threshold = parseFloat(e.target.value);
      $('#thrValue').textContent = state.exam.threshold.toFixed(2);
      save();
    });

    // Arrastrar y soltar imágenes.
    let dragDepth = 0;
    const hint = $('#dropHint');
    document.addEventListener('dragenter', (e) => {
      if ($('#elDialog').open) return;
      if (!e.dataTransfer || Array.from(e.dataTransfer.types).indexOf('Files') < 0) return;
      dragDepth++;
      hint.hidden = false;
    });
    document.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) hint.hidden = true;
    });
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      if ($('#elDialog').open) return;
      dragDepth = 0;
      hint.hidden = true;
      if (e.dataTransfer && e.dataTransfer.files.length) {
        showTab('escanear');
        handleFiles(e.dataTransfer.files);
      }
    });

    for (const container of [$('#scanDetail'), $('#resultDetail')]) {
      container.addEventListener('change', (e) => onDetailEvent(container, e));
      container.addEventListener('click', (e) => onDetailEvent(container, e));
    }

    $('#resultsTable').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      selectedResultId = tr.dataset.id;
      renderResultsTable();
      renderDetail($('#resultDetail'), selectedResultId);
      $('#resultDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#btnExportCsv').addEventListener('click', exportCsv);
    $('#btnExportZip').addEventListener('click', downloadEvidenceZip);
    const folderBtn = $('#btnExportFolder');
    if (typeof window.showDirectoryPicker === 'function') {
      folderBtn.hidden = false;
      folderBtn.addEventListener('click', saveEvidenceToFolder);
    }
    $('#btnClearResults').addEventListener('click', () => {
      if (!confirm(`¿Eliminar los ${state.results.length} resultados? Esta acción no se puede deshacer.`)) return;
      state.results = [];
      forgetAllImages();
      selectedResultId = null;
      save();
      $('#scanDetail').innerHTML = '';
      $('#scanQueue').innerHTML = '';
      renderResults();
      renderResultsBadge();
    });
    $('#btnExportExam').addEventListener('click', exportExam);
    $('#importExamInput').addEventListener('change', (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) importExam(f);
    });

    window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
  }

  bind();
  fillExamForm();
  renderKey();
  renderObjectives();
  updateLayoutError();
  renderResultsBadge();
  injectDocStyles();
  showTab(location.hash.slice(1) || 'prueba');
  loadAssets();
})();
