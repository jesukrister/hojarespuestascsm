/*
 * Versión Pro · utilidades comunes: datos propios (libro de notas y ajustes,
 * en IndexedDB, aparte de la prueba), cuadros de confirmación y portapapeles.
 * Los demás módulos las usan a través de window.LectorPro.
 */
(function () {
  'use strict';
  const app = window.LectorApp;
  const L = window.LibroCore;
  if (!app || !L) return;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------- Datos de la versión Pro ---------- */
  const DB_NAME = 'lectorHojasPro.datos';
  let dbPromise = null;
  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB no disponible'));
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      dbPromise.catch(() => (dbPromise = null));
    }
    return dbPromise;
  }
  function run(mode, fn) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction('kv', mode);
          const req = fn(tx.objectStore('kv'));
          tx.oncomplete = () => resolve(req ? req.result : undefined);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        })
    );
  }
  const kv = {
    get: (key) => run('readonly', (st) => st.get(key)),
    put: (key, value) => run('readwrite', (st) => st.put(value, key)),
  };

  // Preferencias de pantalla (curso elegido, vista…): sólo comodidad, en este navegador.
  const UI_KEY = 'lectorHojasPro.ui';
  let ui = {};
  try {
    ui = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {};
  } catch (e) {
    ui = {};
  }

  const Pro = {
    app,
    L,
    $,
    $$,
    kv,
    ui,
    book: L.emptyBook(),
    settings: {},
    ready: null,
  };

  Pro.saveUi = () => {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify(Pro.ui));
    } catch (e) {
      /* sin almacenamiento: no importa */
    }
  };

  Pro.course = (id) => (id ? Pro.book.courses.find((c) => c.id === id) || null : null);

  // Las escrituras se hacen en orden: la última siempre queda guardada.
  let writing = Promise.resolve();
  let warned = false;
  Pro.saveBook = () => {
    Pro.book.updatedAt = Date.now();
    const book = Pro.book;
    writing = writing
      .then(() => kv.put('libro', book))
      .catch((e) => {
        console.error(e);
        if (!warned) {
          warned = true;
          app.toast('No se pudo guardar el libro de notas en este equipo: crea un respaldo o descarga el Excel del curso.');
        }
      });
    return writing;
  };
  Pro.saveSettings = () => kv.put('ajustes', Pro.settings).catch((e) => console.error(e));

  Pro.ready = Promise.all([kv.get('libro'), kv.get('ajustes')])
    .then(([book, settings]) => {
      Pro.book = L.sanitizeBook(book);
      Pro.settings = settings && typeof settings === 'object' ? settings : {};
    })
    .catch((e) => {
      console.error(e);
      app.toast('No se pudo abrir el libro de notas guardado en este equipo.');
    });

  // Pide al navegador no borrar estos datos cuando falte espacio.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  /* ---------- Cuadros de diálogo ---------- */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pro-close]');
    if (b && b.closest('dialog')) b.closest('dialog').close();
  });

  /**
   * Confirmación con contenido HTML. Resuelve true si se acepta.
   * Después de aceptar, los campos del contenido siguen en #proConfirmBody.
   */
  Pro.confirm = ({ title, html, ok, cancel, danger }) =>
    new Promise((resolve) => {
      const dlg = $('#proConfirmDialog');
      const okBtn = $('#proConfirmOk');
      $('#proConfirmTitle').textContent = title || '';
      $('#proConfirmBody').innerHTML = html || '';
      okBtn.textContent = ok || 'Aceptar';
      okBtn.classList.toggle('danger-fill', !!danger);
      $('#proConfirmCancel').hidden = cancel === null;
      $('#proConfirmCancel').textContent = cancel || 'Cancelar';
      let accepted = false;
      const onOk = () => {
        accepted = true;
        dlg.close();
      };
      okBtn.addEventListener('click', onOk);
      dlg.addEventListener(
        'close',
        () => {
          okBtn.removeEventListener('click', onOk);
          resolve(accepted);
        },
        { once: true }
      );
      dlg.showModal();
      setTimeout(() => okBtn.focus(), 30);
    });

  /* ---------- Portapapeles ---------- */
  Pro.copyText = async (text) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      /* se intenta de la otra forma */
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    (document.querySelector('dialog[open]') || document.body).appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    ta.remove();
    return ok;
  };

  window.LectorPro = Pro;
})();
