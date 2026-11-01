/*
 * Versión Pro · «Mis evaluaciones»: guardar la prueba actual en carpetas y
 * abrirla de nuevo (por ejemplo, el próximo año). Se guarda en el equipo
 * (IndexedDB), va en el respaldo y, con cuenta, en la nube (nube.js).
 * La lógica está en biblioteca-core.js.
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  const B = window.BibliotecaCore;
  if (!Pro || !B) return;
  const { app, kv, $ } = Pro;
  const esc = app.esc;
  const state = app.state;
  const KEY = 'biblioteca';
  const MSG_KEY = 'lectorHojasPro.msg';

  let lib = B.empty();
  let query = '';
  const listeners = [];

  const ready = kv
    .get(KEY)
    .then((v) => {
      lib = B.sanitize(v);
    })
    .catch((e) => {
      console.error(e);
      lib = B.empty();
    });

  let writing = Promise.resolve();
  function persist() {
    const data = lib;
    writing = writing.then(() => kv.put(KEY, data)).catch((e) => {
      console.error(e);
      app.toast('No se pudo guardar «Mis evaluaciones» en este equipo.');
    });
    for (const fn of listeners) fn();
    renderCard();
    return writing;
  }

  const folderName = (id) => {
    const f = lib.folders.find((x) => x.id === id);
    return f ? f.name : '';
  };
  const linkedItem = () => {
    const id = state.exam.pro && state.exam.pro.libId;
    return id ? lib.items.find((x) => x.id === id) || null : null;
  };

  async function currentAssets() {
    const out = {};
    for (const el of (state.exam.doc && state.exam.doc.elements) || []) {
      if (!el || el.type !== 'image') continue;
      const v = await app.assetStore.get(el.id);
      if (typeof v === 'string') out[el.id] = v;
    }
    return out;
  }

  /* ---------- Tarjeta en la pestaña Prueba ---------- */

  function renderCard() {
    const count = $('#proLibCount');
    if (!count) return;
    count.textContent = String(lib.items.length);
    const it = linkedItem();
    const p = $('#proLibLinked');
    p.hidden = !it;
    if (it) {
      const f = folderName(it.folderId);
      p.innerHTML = `Esta prueba viene de <b>${esc(it.title)}</b>${f ? ` (carpeta <b>${esc(f)}</b>)` : ''}. Si le haces cambios, vuelve a guardarla para actualizarla.`;
    }
  }

  /* ---------- Guardar ---------- */

  function folderOptions(selected) {
    const sorted = [...lib.folders].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
    return (
      sorted.map((f) => `<option value="${esc(f.id)}"${f.id === selected ? ' selected' : ''}>📁 ${esc(f.name)}</option>`).join('') +
      `<option value=""${!selected ? ' selected' : ''}>Sin carpeta</option><option value="__new"${selected === '__new' ? ' selected' : ''}>＋ Nueva carpeta…</option>`
    );
  }

  async function saveCurrent() {
    await ready;
    const e = state.exam;
    const linked = linkedItem();
    const year = new Date().getFullYear();
    const html = `<p>Se guarda la prueba completa: datos, clave, objetivos, preguntas escritas en <b>Evaluación</b> (con sus imágenes), preguntas de desarrollo y rúbricas. <b>No</b> se guardan los estudiantes ni las hojas escaneadas.</p>
      ${
        linked
          ? `<div class="sub pro-lib-mode"><label><input type="radio" name="plMode" value="update" checked> Actualizar <b>${esc(linked.title)}</b> (la que abriste)</label>
             <label><input type="radio" name="plMode" value="new"> Guardar como una prueba nueva</label></div>`
          : ''
      }
      <label>Nombre
        <input id="plTitle" type="text" maxlength="120" value="${esc((linked && linked.title) || e.title || '')}" placeholder="Prueba Unidad 3 · 1° Medio">
      </label>
      <label>Carpeta
        <select id="plFolder">${folderOptions(linked ? linked.folderId : lib.folders.length ? '' : '__new')}</select>
      </label>
      <label id="plNewRow"${linked || lib.folders.length ? ' hidden' : ''}>Nombre de la carpeta nueva
        <input id="plNewFolder" type="text" maxlength="80" placeholder="1° Medio · Historia">
      </label>
      <label>Nota <span class="muted small">(opcional)</span>
        <input id="plNote" type="text" maxlength="300" value="${esc((linked && linked.note) || '')}" placeholder="Aplicada en ${year}; la pregunta 7 salió muy difícil">
      </label>`;
    const okP = Pro.confirm({ title: '💾 Guardar en Mis evaluaciones', html, ok: 'Guardar' });
    const sel = $('#plFolder');
    sel.addEventListener('change', () => {
      $('#plNewRow').hidden = sel.value !== '__new';
      if (sel.value === '__new') $('#plNewFolder').focus();
    });
    if (!(await okP)) return;
    const title = $('#plTitle').value.trim() || e.title.trim() || 'Prueba sin título';
    let folderId = $('#plFolder').value;
    if (folderId === '__new') {
      const f = B.addFolder(lib, $('#plNewFolder').value);
      folderId = f ? f.id : '';
    }
    const asNew = !linked || !!document.querySelector('input[name="plMode"][value="new"]:checked');
    const it = B.saveItem(lib, { id: asNew ? null : linked.id, exam: e, assets: await currentAssets(), title, folderId, note: $('#plNote').value });
    state.exam.pro = Object.assign({}, state.exam.pro || {}, { libId: it.id });
    app.save();
    await persist();
    const f = folderName(folderId);
    app.toast(`Guardada en Mis evaluaciones${f ? ` › ${f}` : ''}: «${it.title}».`);
  }

  /* ---------- Abrir y ordenar ---------- */

  function renderList() {
    const box = $('#plList');
    if (!box) return;
    const groups = B.grouped(lib, query);
    const total = lib.items.length;
    if (!total && !lib.folders.length) {
      box.innerHTML = '<p class="muted">Aún no tienes evaluaciones guardadas. En la pestaña <b>Prueba</b>, presiona <b>💾 Guardar en Mis evaluaciones</b>.</p>';
      return;
    }
    const linked = linkedItem();
    const html = groups
      .filter((g) => g.folder || g.items.length)
      .map((g) => {
        const head = g.folder
          ? `<summary><span class="pl-folder">📁 ${esc(g.folder.name)}</span> <span class="muted small">${g.items.length}</span>
               <span class="pl-folder-actions"><button type="button" class="link-btn small" data-pl-rename-folder="${esc(g.folder.id)}">Cambiar nombre</button>
               <button type="button" class="link-btn small danger" data-pl-del-folder="${esc(g.folder.id)}">Eliminar carpeta</button></span></summary>`
          : `<summary><span class="pl-folder">🗂️ Sin carpeta</span> <span class="muted small">${g.items.length}</span></summary>`;
        const items = g.items.length
          ? g.items
              .map(
                (it) => `<li${linked && linked.id === it.id ? ' class="current"' : ''}>
                <div class="pl-info"><b>${esc(it.title)}</b>${linked && linked.id === it.id ? ' <span class="tag">abierta</span>' : ''}<br>
                  <span class="muted small">${esc(B.describe(it))} · guardada el ${esc(app.fmtDateTime(it.updatedAt))}</span>
                  ${it.note ? `<br><span class="small">📝 ${esc(it.note)}</span>` : ''}</div>
                <div class="pl-actions">
                  <button type="button" class="btn primary small" data-pl-use="${esc(it.id)}">📂 Usar</button>
                  <select class="pl-move" data-pl-move="${esc(it.id)}" aria-label="Mover a otra carpeta">
                    <option value="" disabled selected>Mover a…</option>
                    ${[...lib.folders]
                      .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }))
                      .filter((f) => f.id !== it.folderId)
                      .map((f) => `<option value="${esc(f.id)}">📁 ${esc(f.name)}</option>`)
                      .join('')}
                    ${it.folderId ? '<option value="">Sin carpeta</option>' : ''}
                    <option value="__new">＋ Nueva carpeta…</option>
                  </select>
                  <button type="button" class="btn ghost small" data-pl-rename="${esc(it.id)}" title="Cambiar nombre o nota" aria-label="Cambiar nombre">✏️</button>
                  <button type="button" class="btn ghost small" data-pl-del="${esc(it.id)}" title="Eliminar" aria-label="Eliminar">🗑</button>
                </div>
              </li>`
              )
              .join('')
          : '<li class="muted small">Carpeta vacía.</li>';
        return `<details class="pl-group" open>${head}<ul class="pl-items">${items}</ul></details>`;
      })
      .join('');
    box.innerHTML = html || `<p class="muted">No hay evaluaciones que coincidan con «${esc(query)}».</p>`;
  }

  async function openLibrary() {
    await ready;
    query = '';
    $('#plSearch').value = '';
    renderList();
    const d = $('#proLibDialog');
    if (!d.open) d.showModal();
  }

  const hasWork = () => state.results.length > 0 || state.exam.key.some((k) => k !== null) || !!state.exam.title.trim() || !!state.exam.doc.text.trim();

  async function useItem(id) {
    const it = lib.items.find((x) => x.id === id);
    if (!it) return;
    $('#proLibDialog').close();
    if (hasWork()) {
      const linked = linkedItem();
      const n = state.results.length;
      const ok = await Pro.confirm({
        title: '📂 Usar esta evaluación',
        html: `<p>Se abrirá <b>${esc(it.title)}</b> en lugar de la prueba actual${state.exam.title.trim() ? ` («${esc(state.exam.title)}»)` : ''}.</p>
          ${n ? `<p class="alert warn">Las ${n} hoja(s) escaneada(s) de la prueba actual se quitarán. Si aún no las guardas en el libro de notas, hazlo antes desde <b>Corregir</b>.</p>` : ''}
          ${!linked && (state.exam.title.trim() || state.exam.doc.text.trim()) ? '<p class="muted small">La prueba actual no está en Mis evaluaciones: si la quieres conservar, cancela y guárdala primero.</p>' : ''}
          <p class="muted small">Antes se guarda una copia automática de cómo está todo ahora.</p>`,
        ok: 'Abrir',
      });
      if (!ok) return;
      if (Pro.safetyCopy) await Pro.safetyCopy('biblioteca');
    }
    try {
      for (const [aid, v] of Object.entries(it.assets || {})) await app.assetStore.put(aid, v);
      await app.imageStore.clear();
      localStorage.setItem(app.STORE_KEY, JSON.stringify({ exam: B.examToLoad(it), results: [] }));
      try {
        sessionStorage.setItem(MSG_KEY, `Se abrió «${it.title}». Revisa los datos (curso, fecha) antes de imprimir.`);
      } catch (e) {
        /* sin aviso */
      }
      location.reload();
    } catch (e) {
      console.error(e);
      app.toast('No se pudo abrir la evaluación: ' + e.message);
    }
  }

  async function askText(title, label, value, placeholder) {
    const ok = await Pro.confirm({
      title,
      html: `<label>${esc(label)}<input id="plAsk" type="text" maxlength="120" value="${esc(value || '')}" placeholder="${esc(placeholder || '')}"></label>`,
      ok: 'Aceptar',
    });
    return ok ? $('#plAsk').value.trim() : null;
  }

  /** Los cuadros de confirmación se abren encima: al cerrarse se vuelve a la lista. */
  async function inList(fn) {
    const d = $('#proLibDialog');
    d.close();
    try {
      await fn();
    } finally {
      renderList();
      d.showModal();
    }
  }

  async function newFolder() {
    await inList(async () => {
      const name = await askText('📁 Nueva carpeta', 'Nombre de la carpeta', '', '1° Medio · Historia');
      if (!name) return;
      B.addFolder(lib, name);
      await persist();
    });
  }

  $('#proLibSave').addEventListener('click', saveCurrent);
  $('#proLibOpen').addEventListener('click', openLibrary);
  $('#plNewFolderBtn').addEventListener('click', newFolder);
  $('#plSearch').addEventListener('input', (e) => {
    query = e.target.value;
    renderList();
  });
  $('#plList').addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-pl-move]');
    if (!sel) return;
    const it = lib.items.find((x) => x.id === sel.dataset.plMove);
    if (!it) return;
    if (sel.value === '__new') {
      await inList(async () => {
        const name = await askText('📁 Nueva carpeta', 'Nombre de la carpeta', '', '1° Medio · Historia');
        const f = name ? B.addFolder(lib, name) : null;
        if (!f) return;
        it.folderId = f.id;
        it.updatedAt = Date.now();
        await persist();
      });
      return;
    }
    it.folderId = sel.value;
    it.updatedAt = Date.now();
    await persist();
    renderList();
  });
  $('#plList').addEventListener('click', async (e) => {
    const use = e.target.closest('[data-pl-use]');
    if (use) return useItem(use.dataset.plUse);
    const ren = e.target.closest('[data-pl-rename]');
    if (ren) {
      const it = lib.items.find((x) => x.id === ren.dataset.plRename);
      if (!it) return;
      return inList(async () => {
        const ok = await Pro.confirm({
          title: '✏️ Nombre y nota',
          html: `<label>Nombre<input id="plAsk" type="text" maxlength="120" value="${esc(it.title)}"></label>
            <label>Nota <span class="muted small">(opcional)</span><input id="plAskNote" type="text" maxlength="300" value="${esc(it.note)}"></label>`,
          ok: 'Guardar',
        });
        if (!ok) return;
        it.title = $('#plAsk').value.trim().slice(0, 120) || it.title;
        it.note = $('#plAskNote').value.trim().slice(0, 300);
        it.updatedAt = Date.now();
        await persist();
      });
    }
    const del = e.target.closest('[data-pl-del]');
    if (del) {
      const it = lib.items.find((x) => x.id === del.dataset.plDel);
      if (!it) return;
      return inList(async () => {
        const ok = await Pro.confirm({
          title: 'Eliminar evaluación guardada',
          html: `<p>¿Eliminar <b>${esc(it.title)}</b> de Mis evaluaciones? La prueba abierta ahora y el libro de notas no cambian.</p>`,
          ok: 'Eliminar',
          danger: true,
        });
        if (!ok) return;
        lib.items = lib.items.filter((x) => x !== it);
        await persist();
      });
    }
    const rf = e.target.closest('[data-pl-rename-folder]');
    if (rf) {
      e.preventDefault();
      const f = lib.folders.find((x) => x.id === rf.dataset.plRenameFolder);
      if (!f) return;
      return inList(async () => {
        const name = await askText('📁 Cambiar nombre de la carpeta', 'Nombre de la carpeta', f.name);
        if (!name) return;
        f.name = name.slice(0, 80);
        f.updatedAt = Date.now();
        await persist();
      });
    }
    const df = e.target.closest('[data-pl-del-folder]');
    if (df) {
      e.preventDefault();
      const f = lib.folders.find((x) => x.id === df.dataset.plDelFolder);
      if (!f) return;
      const n = lib.items.filter((x) => x.folderId === f.id).length;
      return inList(async () => {
        const ok = await Pro.confirm({
          title: 'Eliminar carpeta',
          html: `<p>¿Eliminar la carpeta <b>${esc(f.name)}</b>?${n ? ` Sus ${n} evaluación(es) <b>no se borran</b>: quedan en «Sin carpeta».` : ''}</p>`,
          ok: 'Eliminar carpeta',
          danger: true,
        });
        if (!ok) return;
        const now = Date.now();
        for (const it of lib.items) {
          if (it.folderId === f.id) {
            it.folderId = '';
            it.updatedAt = now;
          }
        }
        lib.folders = lib.folders.filter((x) => x !== f);
        await persist();
      });
    }
  });
  app.on('save', renderCard);

  ready.then(renderCard);

  /** Para la nube y el respaldo. */
  Pro.library = {
    ready,
    get: () => lib,
    set: async (raw) => {
      lib = B.sanitize(raw);
      await persist();
      if ($('#proLibDialog').open) renderList();
    },
    onChange: (fn) => listeners.push(fn),
    open: openLibrary,
    saveCurrent,
  };
})();
