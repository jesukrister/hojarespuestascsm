/*
 * Integración con la app Android (Capacitor). En un navegador normal no hace
 * nada. Dentro de la app:
 *  - las descargas se guardan en Descargas/LectorHojas (con opción de compartir);
 *  - window.print() usa el servicio de impresión de Android (también "Guardar como PDF");
 *  - el botón Atrás cierra cuadros de diálogo y vuelve a la pestaña anterior.
 */
(function () {
  'use strict';
  const cap = window.Capacitor;
  if (!cap || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform() || typeof cap.nativePromise !== 'function') return;

  document.documentElement.classList.add('native-app');
  const call = (method, options) => cap.nativePromise('Archivos', method, options || {});

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  /* ---------- Aviso con botón "Compartir" ---------- */
  let notice = null;
  let noticeTimer = null;
  function showNotice(text, action) {
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'native-notice';
      notice.setAttribute('role', 'status');
      document.body.appendChild(notice);
    }
    notice.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = text;
    notice.appendChild(span);
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', () => {
        hideNotice();
        action.run();
      });
      notice.appendChild(b);
    }
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'close';
    x.setAttribute('aria-label', 'Cerrar');
    x.textContent = '✕';
    x.addEventListener('click', hideNotice);
    notice.appendChild(x);
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(hideNotice, 9000);
  }
  function hideNotice() {
    if (notice) notice.hidden = true;
  }

  async function share(name, blob) {
    try {
      await call('compartir', { nombre: name, mime: blob.type || 'application/octet-stream', datos: await blobToBase64(blob) });
    } catch (e) {
      showNotice(e && e.message ? e.message : 'No se pudo compartir el archivo.');
    }
  }

  window.NativeApp = {
    /** Guarda un archivo (en lugar de descargarlo) y ofrece compartirlo. */
    async saveBlob(name, blob) {
      try {
        const res = await call('guardar', { nombre: name, mime: blob.type || 'application/octet-stream', datos: await blobToBase64(blob) });
        showNotice(`Guardado en ${res.ubicacion}: ${res.nombre || name}`, { label: 'Compartir', run: () => share(name, blob) });
        return res;
      } catch (e) {
        showNotice(e && e.message ? e.message : 'No se pudo guardar el archivo.', { label: 'Compartir', run: () => share(name, blob) });
        return null;
      }
    },
    share,
  };

  /* ---------- Imprimir ---------- */
  window.print = function () {
    // Tamaño de página definido por la app (@page { size: 216mm 279mm }).
    const css = (document.getElementById('pageStyle') || {}).textContent || '';
    const m = css.match(/size:\s*([\d.]+)mm\s+([\d.]+)mm/);
    const opts = { titulo: document.title || 'Lector de Hojas' };
    if (m) {
      opts.ancho = Number(m[1]);
      opts.alto = Number(m[2]);
    }
    // Se deja que el navegador aplique los estilos de impresión antes de imprimir.
    setTimeout(() => {
      call('imprimir', opts).catch((e) => showNotice(e && e.message ? e.message : 'No se pudo imprimir.'));
    }, 300);
  };

  /* ---------- Botón Atrás ---------- */
  const visited = [];
  let goingBack = false;
  function currentTab() {
    const b = document.querySelector('.tabs button[aria-selected="true"]');
    return b ? b.dataset.tab : null;
  }
  function track() {
    const t = currentTab();
    if (!t || goingBack) return;
    if (visited[visited.length - 1] !== t) visited.push(t);
    if (visited.length > 30) visited.shift();
  }
  document.addEventListener('DOMContentLoaded', () => {
    const tabs = document.querySelector('.tabs');
    if (tabs) new MutationObserver(track).observe(tabs, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
    track();
  });
  if (typeof cap.addListener === 'function') {
    cap.addListener('App', 'backButton', () => {
      const dialog = document.querySelector('dialog[open]');
      if (dialog) {
        dialog.close();
        return;
      }
      if (notice && !notice.hidden) {
        hideNotice();
        return;
      }
      if (visited.length > 1) {
        visited.pop();
        const prev = visited[visited.length - 1];
        const b = document.querySelector(`.tabs button[data-tab="${prev}"]`);
        if (b) {
          goingBack = true;
          b.click();
          goingBack = false;
          window.scrollTo(0, 0);
          return;
        }
      }
      cap.nativePromise('App', 'exitApp', {}).catch(() => {});
    });
  }
})();
