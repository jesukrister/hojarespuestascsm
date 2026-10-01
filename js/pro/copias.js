/*
 * Versión Pro · Respaldo más seguro:
 *  - copias automáticas en el equipo (al empezar el día, cada 2 horas mientras
 *    se trabaja y antes de borrar o reemplazar datos), para deshacer errores;
 *  - recordatorio cuando hace días que no se respalda;
 *  - respaldo automático: en la app, un archivo en Descargas/LectorHojas (sin
 *    imágenes); en el computador, en una carpeta elegida (por ejemplo la de
 *    Google Drive), con todo.
 * Las reglas (cuándo copiar, qué conservar, cuándo recordar) están en copias-core.js.
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  const C = window.CopiasCore;
  const R = window.RespaldoCore;
  if (!Pro || !C || !R || !Pro.backup) return;
  const { app, kv, $ } = Pro;
  const esc = app.esc;
  const state = app.state;

  const INDEX_KEY = 'copias';
  const COPY_KEY = (id) => 'copia:' + id;
  const FOLDER_KEY = 'carpetaRespaldo';
  const AUTO_NAME = 'respaldo-automatico-lector-hojas-pro.zip';
  const SNOOZE = 2 * C.DAY;
  const inApp = () => !!window.NativeApp;
  const canFolder = () => !inApp() && typeof window.showDirectoryPicker === 'function';

  let index = []; // [{ id, at, reason, hash, sum }]
  let indexLoaded = null;
  let queue = Promise.resolve(); // las copias se guardan de a una
  let folder = null; // carpeta del respaldo automático (computador)
  let folderNeedsPermission = false;

  /** Datos de este momento como texto, con su huella. */
  function current() {
    const text = C.serialize(state, Pro.book);
    return { text, hash: C.hash(text), sum: C.summary({ state, book: Pro.book }) };
  }

  function loadIndex() {
    if (!indexLoaded) {
      indexLoaded = kv
        .get(INDEX_KEY)
        .then((v) => {
          index = Array.isArray(v) ? v.filter((c) => c && typeof c.id === 'string' && typeof c.at === 'number') : [];
        })
        .catch((e) => {
          console.error(e);
          index = [];
        });
    }
    return indexLoaded;
  }

  /* ---------- Copias automáticas ---------- */

  /** Guarda una copia con los datos ya tomados (text) si es distinta de la última. */
  function storeCopy(text, hash, sum, reason) {
    const at = Date.now();
    const run = queue.then(async () => {
      await loadIndex();
      const last = C.latest(index);
      if ((last && last.hash === hash) || !C.hasData(sum)) return false;
      const id = 'c' + at.toString(36) + Math.random().toString(36).slice(2, 6);
      await kv.put(COPY_KEY(id), text);
      index.push({ id, at, reason, hash, sum });
      const { keep, drop } = C.prune(index, Date.now());
      index = keep;
      await kv.put(INDEX_KEY, index);
      for (const c of drop) await kv.del(COPY_KEY(c.id)).catch(() => {});
      renderCopies();
      return true;
    });
    queue = run.catch((e) => {
      console.error(e);
      return false;
    });
    return queue;
  }

  /**
   * Copia de seguridad antes de una acción que borra o reemplaza datos.
   * Los datos se toman en el momento de llamar (antes de que cambien).
   */
  Pro.safetyCopy = (reasonKey) => {
    const { text, hash, sum } = current();
    return storeCopy(text, hash, sum, C.REASONS[reasonKey] || String(reasonKey || 'Copia'));
  };

  /* ---------- Revisión periódica ---------- */

  let timer = null;
  let checking = false;
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(check, ms);
  }

  async function check() {
    if (checking) return schedule(5000);
    checking = true;
    try {
      await Pro.ready;
      await loadIndex();
      const { text, hash, sum } = current();
      const has = C.hasData(sum);
      const now = Date.now();
      const s = Pro.settings;
      if (has && !s.firstDataAt) {
        s.firstDataAt = now;
        await Pro.saveSettings();
      }
      const reason = has ? C.copyReason({ now, copies: index, hash }) : null;
      if (reason) await storeCopy(text, hash, sum, C.REASONS[reason]);
      if (has) await autoFile(hash, now);
      renderReminder();
    } catch (e) {
      console.error(e);
    } finally {
      checking = false;
    }
  }

  const changed = () => schedule(20000);

  /* ---------- Respaldo automático (archivo) ---------- */

  async function autoFile(hash, now) {
    const s = Pro.settings;
    if (inApp()) {
      const enabled = s.autoFile !== false && typeof window.NativeApp.saveQuiet === 'function';
      if (!C.fileDue({ now, enabled, hash, lastFileAt: s.lastFileAt, lastFileHash: s.lastFileHash })) return;
      const { bytes, date, hash: h } = await Pro.backup.build({ withImages: false });
      const res = await window.NativeApp.saveQuiet(AUTO_NAME, new Blob([bytes], { type: 'application/zip' }), true);
      s.lastFileAt = date.getTime();
      if (res) {
        s.lastFileHash = h;
        s.lastFileError = false;
      } else {
        s.lastFileError = true;
      }
      await Pro.saveSettings();
      renderOptions();
      return;
    }
    if (!folder) return;
    if (!C.fileDue({ now, enabled: true, hash, lastFileAt: s.folderAt, lastFileHash: s.folderHash })) return;
    let perm = 'granted';
    try {
      perm = await folder.queryPermission({ mode: 'readwrite' });
    } catch (e) {
      perm = 'denied';
    }
    folderNeedsPermission = perm !== 'granted';
    if (!folderNeedsPermission) await writeFolder();
  }

  /** Escribe el respaldo completo en la carpeta elegida (cuenta como respaldo). */
  async function writeFolder(withProgress) {
    const s = Pro.settings;
    try {
      const { bytes, date, hash } = await Pro.backup.build({ withImages: true, onProgress: withProgress ? Pro.backup.progress : null });
      const fh = await folder.getFileHandle(AUTO_NAME, { create: true });
      const w = await fh.createWritable();
      await w.write(bytes);
      await w.close();
      s.folderAt = date.getTime();
      s.folderHash = hash;
      s.folderError = false;
      folderNeedsPermission = false;
      await Pro.backup.markBackedUp(date, hash);
      return true;
    } catch (e) {
      console.error(e);
      s.folderError = true;
      await Pro.saveSettings();
      return false;
    } finally {
      if (withProgress) Pro.backup.progress('');
      renderOptions();
    }
  }

  async function pickFolder() {
    let handle;
    try {
      handle = await window.showDirectoryPicker({ id: 'respaldo-lector-hojas', mode: 'readwrite' });
    } catch (e) {
      if (e && e.name !== 'AbortError') app.toast('No se pudo usar esa carpeta: ' + e.message);
      return;
    }
    folder = handle;
    try {
      await kv.put(FOLDER_KEY, handle);
    } catch (e) {
      console.error(e); // se usa igual mientras la página esté abierta
    }
    Pro.backup.progress('Guardando el respaldo en la carpeta…');
    if (await writeFolder(true)) app.toast(`Listo: el respaldo se guardará solo en la carpeta «${handle.name}».`);
    else app.toast('No se pudo guardar el respaldo en esa carpeta.');
  }

  async function stopFolder() {
    folder = null;
    folderNeedsPermission = false;
    await kv.del(FOLDER_KEY).catch(() => {});
    Object.assign(Pro.settings, { folderAt: 0, folderHash: '', folderError: false });
    await Pro.saveSettings();
    renderOptions();
    renderReminder();
  }

  async function allowFolder() {
    if (!folder) return;
    let perm = 'denied';
    try {
      perm = await folder.requestPermission({ mode: 'readwrite' });
    } catch (e) {
      console.error(e);
    }
    if (perm !== 'granted') return app.toast('Sin permiso no se puede guardar el respaldo en la carpeta.');
    Pro.backup.progress('Guardando el respaldo en la carpeta…');
    if (await writeFolder(true)) app.toast(`Respaldo guardado en «${folder.name}».`);
    renderReminder();
  }

  /* ---------- Recordatorio ---------- */

  const remindDays = () => (typeof Pro.settings.remindDays === 'number' ? Pro.settings.remindDays : 7);

  function renderReminder() {
    const box = $('#proBackupReminder');
    if (!box) return;
    const { hash, sum } = current();
    const has = C.hasData(sum);
    const s = Pro.settings;
    const now = Date.now();
    const r = C.reminder({
      now,
      hasData: has,
      hash,
      everyDays: remindDays(),
      lastBackupAt: s.lastBackupAt,
      lastBackupHash: s.lastBackupHash,
      firstDataAt: s.firstDataAt,
      snoozeUntil: s.snoozeUntil,
    });
    const needPerm = !!folder && folderNeedsPermission && has && s.folderHash !== hash && !(s.snoozeUntil > now);
    box.hidden = !r && !needPerm;
    if (box.hidden) return;
    $('#proRemindText').textContent = needPerm
      ? `Para seguir respaldando solo en la carpeta «${folder.name}», el navegador necesita tu permiso.`
      : r.never
        ? 'Aún no has respaldado tus cursos y notas.'
        : `Hace ${r.days} días que no respaldas tus cursos y notas.`;
    $('#proRemindFolder').hidden = !needPerm;
  }

  /* ---------- Pantalla: opciones y lista de copias ---------- */

  function renderOptions() {
    const s = Pro.settings;
    const sel = $('#proRemindDays');
    sel.value = String(remindDays());
    if (sel.value !== String(remindDays())) sel.value = '7';

    const fileRow = $('#proAutoFileRow');
    fileRow.hidden = !inApp();
    if (inApp()) {
      $('#proAutoFile').checked = s.autoFile !== false;
      $('#proAutoFileInfo').textContent =
        s.autoFile === false
          ? ''
          : s.lastFileError
            ? 'No se pudo guardar la última vez: se volverá a intentar.'
            : s.lastFileAt
              ? `Última vez: ${app.fmtDateTime(s.lastFileAt)}.`
              : 'Se guardará con el próximo cambio.';
    }

    const folderRow = $('#proFolderRow');
    folderRow.hidden = !canFolder();
    if (canFolder()) {
      $('#proFolderPick').textContent = folder ? '📁 Cambiar carpeta…' : '📁 Respaldo automático en una carpeta…';
      $('#proFolderStop').hidden = !folder;
      $('#proFolderInfo').textContent = folder
        ? `Se guarda solo en «${folder.name}»${s.folderError ? ' (no se pudo la última vez)' : s.folderAt ? `, última vez: ${app.fmtDateTime(s.folderAt)}` : ''}.`
        : 'Elige la carpeta de Google Drive de tu computador (Drive para escritorio) y el respaldo quedará en Drive automáticamente.';
    }
  }

  function renderCopies() {
    const list = $('#proCopiesList');
    if (!list) return;
    $('#proCopiesCount').textContent = String(index.length);
    const sorted = [...index].sort((a, b) => b.at - a.at);
    list.innerHTML = sorted.length
      ? sorted
          .map(
            (c) => `<li>
          <div class="pc-info"><b>${esc(app.fmtDateTime(c.at))}</b> · ${esc(c.reason || 'Copia')}<br><span class="muted small">${esc(C.describe(c.sum || {}))}</span></div>
          <div class="pc-actions">
            <button type="button" class="btn ghost small" data-copy-restore="${esc(c.id)}">↩ Volver a esta copia</button>
            <button type="button" class="btn ghost small" data-copy-download="${esc(c.id)}" title="Descargar esta copia como archivo de respaldo" aria-label="Descargar esta copia">⬇</button>
          </div>
        </li>`
          )
          .join('')
      : '<li class="muted small">Aún no hay copias: se crean solas mientras usas la plataforma.</li>';
  }

  async function readCopy(id) {
    const c = index.find((x) => x.id === id);
    const text = c ? await kv.get(COPY_KEY(id)) : null;
    if (!text) {
      app.toast('No se encontró esa copia.');
      return null;
    }
    return { c, snap: JSON.parse(text) };
  }

  async function restoreCopy(id) {
    const got = await readCopy(id);
    if (!got) return;
    const { c, snap } = got;
    await Pro.backup.restoreData(
      { created: new Date(c.at).toISOString(), state: snap.state && snap.state.exam ? snap.state : null, images: [], assets: {}, book: snap.book, fromCopy: true },
      { title: 'Volver a una copia automática', safety: 'copia' }
    );
  }

  async function downloadCopy(id) {
    const got = await readCopy(id);
    if (!got) return;
    const { c, snap } = got;
    const d = new Date(c.at);
    const bytes = R.buildBackup({ state: snap.state, images: [], assets: {}, book: snap.book, edition: 'pro', date: d });
    const p2 = (n) => String(n).padStart(2, '0');
    app.download(`copia-lector-hojas-pro_${Pro.L.todayIso(d)}_${p2(d.getHours())}${p2(d.getMinutes())}.zip`, new Blob([bytes], { type: 'application/zip' }));
  }

  /* ---------- Eventos ---------- */

  // Copia antes de acciones que borran datos (se registra antes que la acción).
  const before = (sel, key, cond) => {
    const el = $(sel);
    if (el) el.addEventListener('click', () => (!cond || cond()) && Pro.safetyCopy(key), true);
  };
  before('#btnClearResults', 'resultados', () => state.results.length > 0);
  before('#pcDelete', 'curso');
  before('#peDelete', 'evaluacion');

  app.on('save', changed);
  app.on('results', changed);
  app.on('resultsCleared', changed);
  const saveBook = Pro.saveBook;
  Pro.saveBook = (...args) => {
    changed();
    return saveBook(...args);
  };
  Pro.backupChanged = () => {
    renderReminder();
    renderOptions();
  };
  // Al salir de la app o cambiar de pestaña del navegador, se revisa al tiro.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(timer);
      check();
    }
  });

  $('#proRemindDays').addEventListener('change', async (e) => {
    Pro.settings.remindDays = Number(e.target.value) || 0;
    await Pro.saveSettings();
    renderReminder();
  });
  $('#proAutoFile').addEventListener('change', async (e) => {
    Pro.settings.autoFile = e.target.checked;
    if (e.target.checked) Pro.settings.lastFileHash = '';
    await Pro.saveSettings();
    renderOptions();
    if (e.target.checked) schedule(500);
  });
  $('#proFolderPick').addEventListener('click', pickFolder);
  $('#proFolderStop').addEventListener('click', stopFolder);
  $('#proRemindFolder').addEventListener('click', allowFolder);
  $('#proRemindLater').addEventListener('click', () => {
    Pro.settings.snoozeUntil = Date.now() + SNOOZE;
    renderReminder();
    Pro.saveSettings();
  });
  $('#proCopiesList').addEventListener('click', (e) => {
    const r = e.target.closest('[data-copy-restore]');
    if (r) return restoreCopy(r.dataset.copyRestore);
    const d = e.target.closest('[data-copy-download]');
    if (d) downloadCopy(d.dataset.copyDownload);
  });
  app.on('tab', (name) => {
    if (name === 'cursos') {
      renderOptions();
      renderCopies();
    }
  });

  Pro.ready.then(async () => {
    if (canFolder()) {
      try {
        const h = await kv.get(FOLDER_KEY);
        if (h && typeof h.queryPermission === 'function') folder = h;
      } catch (e) {
        folder = null;
      }
    }
    await loadIndex();
    renderOptions();
    renderCopies();
    renderReminder();
    schedule(3000);
  });

  Pro.copies = { check, current, storeCopy, list: () => index.slice() };
})();
