/*
 * Interfaz de la aplicación: configuración de la prueba, generación de la
 * hoja, escaneo de fotos y resultados. Todo se guarda en el navegador.
 */
(function () {
  'use strict';

  const { computeLayout, PAPERS, PAPER_IDS, sameStructure, normalizeConfig, CHOICE_LABELS, LIMITS } = window.SheetLayout;
  const OMR = window.OMR;
  const Grading = window.Grading;
  const SheetRenderer = window.SheetRenderer;

  const STORE_KEY = 'lectorHojas.v1';
  const MAX_IMAGE_SIDE = 2000;
  const PREVIEW_WIDTH = 1000;
  const TABS = ['prueba', 'hoja', 'escanear', 'resultados'];

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
    };
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
  const images = new Map(); // id de resultado → vista de la hoja enderezada (sólo en esta sesión)
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
      return computeLayout(state.exam);
    } catch (e) {
      layoutError = e.message;
      return null;
    }
  }

  function updateLayoutError() {
    getLayout();
    const el = $('#layoutError');
    el.textContent = layoutError;
    el.hidden = !layoutError;
  }

  /* ------------------------------------------------------------------ */
  /* Pestañas                                                            */
  /* ------------------------------------------------------------------ */

  function showTab(name) {
    if (TABS.indexOf(name) < 0) name = 'prueba';
    for (const b of $$('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
    for (const t of TABS) $('#tab-' + t).hidden = t !== name;
    if (name === 'hoja') renderSheetPreview();
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
        `Cambiar el número de preguntas, alternativas, dígitos o el papel hace incompatibles los ${state.results.length} resultados guardados, que serán eliminados. ¿Continuar?`
      );
      if (!ok) return false;
      state.results = [];
      images.clear();
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
    };
    applyStructure(next);
    fillExamForm();
    save();
    renderKey();
    updateLayoutError();
    renderResultsBadge();
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

  function sheetSvg(fill) {
    const layout = getLayout();
    if (!layout) return null;
    return SheetRenderer.renderSVG(layout, {
      title: state.exam.title || 'Hoja de respuestas',
      subtitle: state.exam.subtitle,
      fill,
    });
  }

  function renderSheetPreview() {
    const svg = sheetSvg();
    $('#sheetPreview').innerHTML = svg || `<p class="alert error">${esc(layoutError)}</p>`;
  }

  function printSheet() {
    const svg = sheetSvg();
    if (!svg) return toast(layoutError);
    const paper = PAPERS[state.exam.paper];
    let style = $('#pageStyle');
    if (!style) {
      style = document.createElement('style');
      style.id = 'pageStyle';
      document.head.appendChild(style);
    }
    style.textContent = `@page { size: ${paper.width}mm ${paper.height}mm; margin: 0; }`;
    $('#printArea').innerHTML = svg;
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
    const svg = sheetSvg(sampleFill());
    if (!svg) return toast(layoutError);
    const paper = PAPERS[state.exam.paper];
    const ppm = 6; // ~150 ppp
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const sw = Math.round(paper.width * ppm);
    const sh = Math.round(paper.height * ppm);
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
    return OMR.toGray(ctx.getImageData(0, 0, w, h).data, w, h);
  }

  function scanOptions() {
    return { threshold: state.exam.threshold };
  }

  /** Guarda una versión reducida de la hoja enderezada para mostrarla con los resultados. */
  function makePreview(res) {
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
    return { url: cv.toDataURL('image/jpeg', 0.85), scale, overlay: res.overlay, image: null };
  }

  function createResult(res, fileName) {
    return {
      id: uid(),
      fileName,
      createdAt: Date.now(),
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
        const gray = await fileToGray(file);
        const res = OMR.scanSheet(gray, layout, scanOptions());
        if (!res.ok) {
          item.error(`${file.name || 'foto'}: ${res.error}`);
          continue;
        }
        const record = createResult(res, file.name || 'foto');
        state.results.push(record);
        images.set(record.id, makePreview(res));
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
      const res = OMR.scanSheet(await fileToGray(file), layout, scanOptions());
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
                   </div>`
                : '<p class="muted small">La imagen de la hoja sólo está disponible durante la sesión en que se escaneó. Las respuestas sí quedan guardadas.</p>'
            }
          </div>
          <div class="answers-list">${rows}</div>
        </div>
      </div>`;
    const list = $('.answers-list', container);
    if (list) list.scrollTop = prevScroll;
    if (view) drawOverlay($('canvas', container), r, g, view);
  }

  function loadPreviewImage(view) {
    if (view.image) return Promise.resolve(view.image);
    const img = new Image();
    img.src = view.url;
    return img.decode().then(() => (view.image = img));
  }

  function drawOverlay(canvas, r, g, view) {
    loadPreviewImage(view).then((img) => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const s = view.scale;
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
          ctx.lineWidth = width || 2;
          ctx.stroke();
        }
      };
      g.items.forEach((it, q) => {
        const bubbles = view.overlay.questions[q];
        if (!bubbles) return;
        const color = STATUS[it.status].color;
        for (const m of it.marked) circle(bubbles[m], bubbles[m].r * 1.15, color + '55', color, null, 2.5);
        if (it.key !== null && it.status !== 'correct' && bubbles[it.key]) {
          circle(bubbles[it.key], bubbles[it.key].r * 1.45, null, '#1565c0', [4, 3], 2);
        }
        const a = r.answers[q];
        if (a.uncertain && !a.edited) {
          const first = bubbles[0];
          const last = bubbles[bubbles.length - 1];
          const pad = first.r * 1.7;
          ctx.setLineDash([5, 3]);
          ctx.strokeStyle = '#e0a800';
          ctx.lineWidth = 2;
          ctx.strokeRect((first.x - pad) * s, (first.y - pad) * s, (last.x - first.x + 2 * pad) * s, 2 * pad * s);
        }
      });
      (r.idMarks || []).forEach((marked, row) => {
        const bubbles = view.overlay.id[row];
        if (!bubbles) return;
        for (const m of marked) circle(bubbles[m], bubbles[m].r * 1.2, '#6a1b9a44', '#6a1b9a', null, 2);
      });
      ctx.setLineDash([]);
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
      r.answers[q] = { marked: v === '' ? [] : [Number(v)], uncertain: false, edited: true };
    } else if (e.type === 'change' && e.target.matches('input[data-field]')) {
      const field = e.target.dataset.field;
      r[field] = e.target.value.trim();
      if (field === 'code') r.idUncertain = false;
    } else if (e.type === 'click' && e.target.closest('[data-act="delete"]')) {
      if (!confirm('¿Eliminar este resultado?')) return;
      state.results = state.results.filter((x) => x.id !== r.id);
      images.delete(r.id);
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
        .concat(qCols)
        .map(cell)
        .join(sep)
    );
    lines.push(
      ['', '', 'CLAVE', '', '', '', '', '', '', '', '', '']
        .concat(state.exam.key.map((k) => (k === null ? '' : CHOICE_LABELS[k])))
        .map(cell)
        .join(sep)
    );
    sortedResults().forEach(({ r, g }, i) => {
      lines.push(
        [i + 1, r.code || '', displayName(r), r.fileName, g.correct, g.wrong, g.blank, g.multiple, dec(g.score, 2), dec(g.maxScore, 2), dec(g.percent, 1), dec(g.grade, 1)]
          .concat(r.answers.map((a) => letters(a.marked)))
          .map(cell)
          .join(sep)
      );
    });
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    download(`${slug(state.exam.title)}-resultados.csv`, blob);
  }

  function exportExam() {
    const data = { app: 'lector-hojas-respuesta', version: 1, exam: state.exam };
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
      save();
      fillExamForm();
      renderKey();
      updateLayoutError();
      renderResultsBadge();
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
    for (const id of ['#exQuestions', '#exChoices', '#exIdDigits', '#exPaper']) $(id).addEventListener('change', onStructureInput);
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
      const svg = sheetSvg();
      if (!svg) return toast(layoutError);
      download(`${slug(state.exam.title)}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
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
    $('#btnClearResults').addEventListener('click', () => {
      if (!confirm(`¿Eliminar los ${state.results.length} resultados? Esta acción no se puede deshacer.`)) return;
      state.results = [];
      images.clear();
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
  updateLayoutError();
  renderResultsBadge();
  showTab(location.hash.slice(1) || 'prueba');
})();
