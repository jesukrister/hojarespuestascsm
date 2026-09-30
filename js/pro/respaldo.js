/*
 * Versión Pro · Respaldo completo (crear y restaurar) y traer la prueba desde
 * la versión normal (en el navegador, la primera vez).
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  const R = window.RespaldoCore;
  if (!Pro || !R) return;
  const { app, L, $ } = Pro;
  const esc = app.esc;
  const state = app.state;
  const NORMAL_KEY = 'lectorHojas.v1';
  const NORMAL_DB = 'lectorHojas';
  const MSG_KEY = 'lectorHojasPro.msg';
  const inApp = () => !!window.NativeApp || document.documentElement.classList.contains('native-app');

  function progress(text) {
    const p = $('#proBackupProgress');
    p.hidden = !text;
    p.textContent = text || '';
  }

  const toBytes = (blob) => blob.arrayBuffer().then((b) => new Uint8Array(b));

  /** Recarga la página y muestra un aviso al volver (la prueba se lee al abrir la página). */
  function reloadWith(message) {
    try {
      sessionStorage.setItem(MSG_KEY, message);
    } catch (e) {
      /* sin aviso */
    }
    location.reload();
  }

  function renderBackupInfo() {
    const last = Pro.settings.lastBackupAt;
    const el = $('#proBackupLast');
    if (!last) {
      el.textContent = 'Aún no has creado un respaldo en este equipo.';
      el.className = 'muted small';
    } else {
      const days = Math.floor((Date.now() - last) / 86400000);
      const changed = (Pro.book.updatedAt || 0) > last;
      el.textContent = `Último respaldo: ${app.fmtDateTime(last)}${days >= 1 ? ` (hace ${days} día${days === 1 ? '' : 's'})` : ''}.${
        changed ? ' Hay cambios en el libro de notas después de ese respaldo.' : ''
      }`;
      el.className = changed && days >= 7 ? 'alert warn' : 'muted small';
    }
    const show = !inApp() && normalHasData();
    $('#proImportNormal').hidden = !show;
    $('#proImportBanner').hidden = !show || !proIsEmpty() || !!Pro.ui.importDismissed;
  }

  /* ---------- Crear ---------- */

  async function createBackup() {
    const btn = $('#proBackupCreate');
    btn.disabled = true;
    try {
      progress('Preparando el respaldo…');
      await Pro.ready;
      const images = [];
      for (const r of state.results) {
        const rec = await app.imageStore.get(r.id);
        if (!rec || !rec.sheet) continue;
        images.push({ id: r.id, sheet: await toBytes(rec.sheet), photo: rec.photo ? await toBytes(rec.photo) : null, scale: rec.scale, overlay: rec.overlay });
        progress(`Preparando el respaldo… (${images.length} de ${state.results.length} hojas)`);
      }
      const assets = {};
      for (const el of state.exam.doc.elements) {
        if (el.type !== 'image') continue;
        const v = await app.assetStore.get(el.id);
        if (typeof v === 'string') assets[el.id] = v;
      }
      const now = new Date();
      const bytes = R.buildBackup({
        state: JSON.parse(JSON.stringify({ exam: state.exam, results: state.results })),
        images,
        assets,
        book: Pro.book,
        edition: 'pro',
        date: now,
      });
      const p2 = (n) => String(n).padStart(2, '0');
      const name = `respaldo-lector-hojas-pro_${L.todayIso(now)}_${p2(now.getHours())}${p2(now.getMinutes())}.zip`;
      app.download(name, new Blob([bytes], { type: 'application/zip' }));
      Pro.settings.lastBackupAt = now.getTime();
      await Pro.saveSettings();
      renderBackupInfo();
      const mb = bytes.length / 1048576;
      app.toast(`Respaldo creado (${mb < 1 ? '< 1' : mb.toFixed(1)} MB). Guárdalo en un lugar seguro.`);
    } catch (e) {
      console.error(e);
      app.toast('No se pudo crear el respaldo: ' + e.message);
    } finally {
      btn.disabled = false;
      progress('');
    }
  }

  /* ---------- Restaurar ---------- */

  function proIsEmpty() {
    const e = state.exam;
    return !state.results.length && !e.key.some((k) => k !== null) && !e.title.trim() && !e.doc.text.trim();
  }

  async function restoreBackup(file) {
    let data;
    try {
      progress('Leyendo el respaldo…');
      data = await R.parseBackup(new Uint8Array(await file.arrayBuffer()));
    } catch (e) {
      progress('');
      await Pro.confirm({ title: 'No se pudo restaurar', html: `<p>${esc(e.message)}</p>`, ok: 'Entendido', cancel: null });
      return;
    }
    progress('');
    await Pro.ready;
    const book = data.book ? L.sanitizeBook(data.book) : null;
    const nEvals = book ? book.courses.reduce((s, c) => s + c.evaluations.length, 0) : 0;
    const exam = data.state ? data.state.exam : null;
    const nResults = data.state ? data.state.results.length : 0;
    const created = data.created ? app.fmtDateTime(Date.parse(data.created)) : 'fecha desconocida';
    let html = `<p>Respaldo creado el <b>${esc(created)}</b>. Elige qué traer a este equipo:</p>`;
    if (book && book.courses.length) {
      html += `<label class="choice"><input type="checkbox" id="rsBook" checked><span><b>Cursos y libro de notas</b>: ${book.courses.length} curso(s), ${nEvals} evaluación(es).</span></label>
        <div class="sub">
          <label><input type="radio" name="rsMode" value="merge" checked> Combinar con los de este equipo (si algo está en los dos, queda lo más reciente)</label>
          <label><input type="radio" name="rsMode" value="replace"> Reemplazar los de este equipo</label>
        </div>`;
    }
    if (exam) {
      const cur = state.results.length;
      html += `<label class="choice"><input type="checkbox" id="rsExam"${proIsEmpty() ? ' checked' : ''}><span><b>Prueba y hojas escaneadas</b>: «${esc(
        exam.title || 'Prueba sin título'
      )}», ${nResults} hoja(s). Reemplaza la prueba de este equipo${cur ? ` y sus ${cur} hoja(s) escaneada(s)` : ''}.</span></label>`;
    }
    if (!(book && book.courses.length) && !exam) {
      await Pro.confirm({ title: 'Restaurar respaldo', html: '<p>El respaldo está vacío.</p>', ok: 'Entendido', cancel: null });
      return;
    }
    const ok = await Pro.confirm({ title: 'Restaurar respaldo', html, ok: 'Restaurar' });
    if (!ok) return;
    const doBook = !!($('#rsBook') && $('#rsBook').checked);
    const replace = !!document.querySelector('input[name="rsMode"][value="replace"]:checked');
    const doExam = !!($('#rsExam') && $('#rsExam').checked);
    if (!doBook && !doExam) return app.toast('No elegiste nada para restaurar.');
    try {
      progress('Restaurando…');
      if (doBook) {
        Pro.book = replace ? book : L.mergeBooks(Pro.book, book);
        await Pro.saveBook();
      }
      if (doExam) {
        await app.imageStore.clear();
        for (const im of data.images) {
          await app.imageStore.put(im.id, {
            sheet: new Blob([im.sheet], { type: 'image/jpeg' }),
            photo: im.photo ? new Blob([im.photo], { type: 'image/jpeg' }) : null,
            scale: im.scale,
            overlay: im.overlay,
          });
        }
        for (const [id, v] of Object.entries(data.assets)) {
          if (typeof v === 'string' && v.startsWith('data:image/')) await app.assetStore.put(id, v);
        }
        localStorage.setItem(app.STORE_KEY, JSON.stringify({ exam: data.state.exam, results: data.state.results }));
        reloadWith(`Respaldo restaurado: ${doBook ? 'cursos, libro de notas, ' : ''}prueba y ${nResults} hoja(s).`);
        return;
      }
      progress('');
      Pro.renderAll();
      renderBackupInfo();
      app.toast('Cursos y libro de notas restaurados.');
    } catch (e) {
      console.error(e);
      progress('');
      app.toast('No se pudo restaurar el respaldo: ' + e.message);
    }
  }

  /* ---------- Traer desde la versión normal (mismo navegador) ---------- */

  function normalData() {
    try {
      const d = JSON.parse(localStorage.getItem(NORMAL_KEY) || 'null');
      return d && d.exam && typeof d.exam === 'object' ? d : null;
    } catch (e) {
      return null;
    }
  }

  function normalHasData() {
    const d = normalData();
    if (!d) return false;
    const e = d.exam;
    return (
      (Array.isArray(d.results) && d.results.length > 0) ||
      (Array.isArray(e.key) && e.key.some((k) => k !== null && k !== undefined)) ||
      !!String(e.title || '').trim()
    );
  }

  function readNormalImages(ids, assetIds) {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve({ images: {}, assets: {} });
      const req = indexedDB.open(NORMAL_DB, 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets');
      };
      req.onerror = () => resolve({ images: {}, assets: {} });
      req.onsuccess = () => {
        const db = req.result;
        const out = { images: {}, assets: {} };
        const tx = db.transaction(['images', 'assets'], 'readonly');
        for (const id of ids) {
          const g = tx.objectStore('images').get(id);
          g.onsuccess = () => {
            if (g.result) out.images[id] = g.result;
          };
        }
        for (const id of assetIds) {
          const g = tx.objectStore('assets').get(id);
          g.onsuccess = () => {
            if (g.result) out.assets[id] = g.result;
          };
        }
        tx.oncomplete = () => {
          db.close();
          resolve(out);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          resolve(out);
        };
      };
    });
  }

  async function importFromNormal() {
    const d = normalData();
    if (!d) return app.toast('No hay datos de la versión normal en este navegador.');
    const results = Array.isArray(d.results) ? d.results : [];
    const title = String(d.exam.title || '').trim() || 'Prueba sin título';
    if (!proIsEmpty()) {
      const ok = await Pro.confirm({
        title: 'Traer desde la versión normal',
        html: `<p>Se traerá la prueba <b>${esc(title)}</b> con ${results.length} hoja(s) escaneada(s).</p><p class="alert warn">La prueba y las hojas escaneadas que tienes ahora en la versión Pro se reemplazarán. Los cursos y el libro de notas no cambian.</p>`,
        ok: 'Traer',
      });
      if (!ok) return;
    }
    try {
      progress('Copiando la prueba de la versión normal…');
      const elements = d.exam.doc && Array.isArray(d.exam.doc.elements) ? d.exam.doc.elements : [];
      const { images, assets } = await readNormalImages(
        results.map((r) => r.id),
        elements.filter((e) => e && e.type === 'image').map((e) => e.id)
      );
      await app.imageStore.clear();
      for (const [id, rec] of Object.entries(images)) await app.imageStore.put(id, rec);
      for (const [id, v] of Object.entries(assets)) await app.assetStore.put(id, v);
      localStorage.setItem(app.STORE_KEY, JSON.stringify({ exam: d.exam, results }));
      Pro.ui.importDismissed = true;
      Pro.saveUi();
      reloadWith(`Se trajo la prueba «${title}» con ${results.length} hoja(s) desde la versión normal.`);
    } catch (e) {
      console.error(e);
      progress('');
      app.toast('No se pudo traer la prueba: ' + e.message);
    }
  }

  /* ---------- Eventos ---------- */

  $('#proBackupCreate').addEventListener('click', createBackup);
  $('#proBackupInput').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) restoreBackup(f);
  });
  for (const b of document.querySelectorAll('[data-pro-import-normal]')) b.addEventListener('click', importFromNormal);
  $('#proImportDismiss').addEventListener('click', () => {
    Pro.ui.importDismissed = true;
    Pro.saveUi();
    $('#proImportBanner').hidden = true;
  });
  app.on('tab', (name) => {
    if (name === 'cursos') renderBackupInfo();
  });
  app.on('save', () => {
    if (!$('#proImportBanner').hidden && !proIsEmpty()) $('#proImportBanner').hidden = true;
  });

  Pro.ready.then(renderBackupInfo);
  try {
    const msg = sessionStorage.getItem(MSG_KEY);
    if (msg) {
      sessionStorage.removeItem(MSG_KEY);
      setTimeout(() => app.toast(msg), 300);
    }
  } catch (e) {
    /* sin aviso */
  }
})();
