/*
 * Versión Pro · «Mis evaluaciones» (sin pantalla, para probarla aparte):
 * pruebas guardadas en carpetas para volver a usarlas (por ejemplo, el año
 * siguiente). Cada una guarda la prueba completa (datos, clave, OA, preguntas,
 * desarrollo, rúbricas e imágenes de las preguntas), sin estudiantes ni resultados.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BibliotecaCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 1;
  const MAX_FOLDERS = 200;
  const MAX_ITEMS = 1000;
  const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const empty = () => ({ version: VERSION, folders: [], items: [] });

  /** Prueba lista para guardar: sin lista de curso ni enlaces al libro de notas. */
  function cleanExam(exam) {
    const e = JSON.parse(JSON.stringify(exam || {}));
    e.roster = '';
    const rubrics = e.pro && Array.isArray(e.pro.rubrics) ? e.pro.rubrics : null;
    delete e.pro;
    if (rubrics && rubrics.some(Boolean)) e.pro = { rubrics };
    return e;
  }

  /** Imágenes de las preguntas que usa la prueba ({ id: dataURL }). */
  function examAssets(exam, all) {
    const out = {};
    const els = (exam && exam.doc && Array.isArray(exam.doc.elements) && exam.doc.elements) || [];
    for (const el of els) {
      if (el && el.type === 'image' && typeof (all || {})[el.id] === 'string' && all[el.id].startsWith('data:image/')) out[el.id] = all[el.id];
    }
    return out;
  }

  function sanitizeFolder(f) {
    if (!f || typeof f.id !== 'string') return null;
    const now = Date.now();
    return {
      id: f.id,
      name: str(f.name, 80) || 'Carpeta',
      createdAt: typeof f.createdAt === 'number' ? f.createdAt : now,
      updatedAt: typeof f.updatedAt === 'number' ? f.updatedAt : now,
    };
  }

  function sanitizeItem(it, folderIds) {
    if (!it || typeof it.id !== 'string' || !it.exam || typeof it.exam !== 'object') return null;
    const now = Date.now();
    const assets = {};
    for (const [k, v] of Object.entries(it.assets && typeof it.assets === 'object' ? it.assets : {})) {
      if (typeof v === 'string' && v.startsWith('data:image/')) assets[k] = v;
    }
    return {
      id: it.id,
      folderId: typeof it.folderId === 'string' && folderIds.has(it.folderId) ? it.folderId : '',
      title: str(it.title, 120) || str(it.exam.title, 120) || 'Prueba sin título',
      note: str(it.note, 300),
      exam: it.exam,
      assets,
      createdAt: typeof it.createdAt === 'number' ? it.createdAt : now,
      updatedAt: typeof it.updatedAt === 'number' ? it.updatedAt : now,
    };
  }

  function sanitize(raw) {
    const lib = empty();
    if (!raw || typeof raw !== 'object') return lib;
    const ids = new Set();
    for (const f of Array.isArray(raw.folders) ? raw.folders : []) {
      const c = sanitizeFolder(f);
      if (c && !ids.has(c.id) && lib.folders.length < MAX_FOLDERS) {
        ids.add(c.id);
        lib.folders.push(c);
      }
    }
    const seen = new Set();
    for (const it of Array.isArray(raw.items) ? raw.items : []) {
      const c = sanitizeItem(it, ids);
      if (c && !seen.has(c.id) && lib.items.length < MAX_ITEMS) {
        seen.add(c.id);
        lib.items.push(c);
      }
    }
    return lib;
  }

  /** Datos que se muestran de cada prueba guardada. */
  function describe(it) {
    const e = it.exam || {};
    const parts = [`${e.numQuestions || 0} preguntas`];
    if (Array.isArray(e.dev) && e.dev.length) parts.push(`${e.dev.length} de desarrollo`);
    if (Array.isArray(e.key) && e.key.some((k) => k !== null && k !== undefined)) parts.push('con clave');
    else parts.push('sin clave');
    if (e.doc && String(e.doc.text || '').trim()) parts.push('con preguntas escritas');
    if (e.pro && Array.isArray(e.pro.rubrics) && e.pro.rubrics.some(Boolean)) parts.push('con rúbrica');
    if (e.forms && Array.isArray(e.forms.maps) && e.forms.maps.length > 1) parts.push(`${e.forms.maps.length} filas`);
    return parts.join(' · ');
  }

  const norm = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();

  /** Carpetas (A→Z) con sus pruebas (más recientes primero), filtradas por el texto buscado. */
  function grouped(lib, query) {
    const q = norm(query).trim();
    const folders = [...lib.folders].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
    const match = (it, folder) =>
      !q || norm(`${it.title} ${it.note} ${(it.exam && it.exam.subtitle) || ''} ${folder ? folder.name : ''}`).includes(q);
    const byDate = (a, b) => b.updatedAt - a.updatedAt;
    const out = folders.map((f) => ({ folder: f, items: lib.items.filter((it) => it.folderId === f.id && match(it, f)).sort(byDate) }));
    out.push({ folder: null, items: lib.items.filter((it) => !it.folderId && match(it, null)).sort(byDate) });
    return q ? out.filter((g) => g.items.length || (g.folder && norm(g.folder.name).includes(q))) : out;
  }

  function addFolder(lib, name) {
    const n = str(name, 80);
    if (!n) return null;
    const same = lib.folders.find((f) => norm(f.name) === norm(n));
    if (same) return same;
    const now = Date.now();
    const f = { id: uid(), name: n, createdAt: now, updatedAt: now };
    lib.folders.push(f);
    return f;
  }

  /** Guarda la prueba como nueva (o reemplaza la guardada con id). */
  function saveItem(lib, { id, exam, assets, title, folderId, note }) {
    const now = Date.now();
    const clean = cleanExam(exam);
    const data = { exam: clean, assets: examAssets(clean, assets), title: str(title, 120) || str(clean.title, 120) || 'Prueba sin título', folderId: folderId || '', note: str(note, 300), updatedAt: now };
    let it = id ? lib.items.find((x) => x.id === id) : null;
    if (it) Object.assign(it, data);
    else {
      it = Object.assign({ id: uid(), createdAt: now }, data);
      lib.items.push(it);
    }
    return it;
  }

  /** Prueba para cargar: con su enlace a la guardada (para actualizarla después). */
  function examToLoad(it) {
    const e = JSON.parse(JSON.stringify(it.exam));
    e.pro = Object.assign({}, e.pro || {}, { libId: it.id });
    return e;
  }

  return { VERSION, empty, sanitize, cleanExam, examAssets, describe, grouped, addFolder, saveItem, examToLoad, uid };
});
