/*
 * Traer los datos de la dirección antigua (jesukrister.github.io) a corrigeya.cl.
 *
 * El navegador guarda los datos por sitio: lo que el Lector guardó en
 * jesukrister.github.io no se ve en corrigeya.cl. Esta página (traer.html) abre
 * la dirección antigua, jesukrister.github.io/hojarespuestascsm/ (mudanza/index.html),
 * que lee esos datos y se los manda SÓLO a corrigeya.cl con postMessage. Aquí se
 * guardan tal cual: el almacenamiento local (claves lectorHojas…) y las bases
 * de datos del navegador (fotos de las hojas, cursos, libro de notas…).
 * Nada pasa por un servidor. Ver docs/mudanza.md.
 */
(function () {
  'use strict';
  const CFG = window.LANZAMIENTO || {};
  const $ = (s) => document.querySelector(s);
  const PREFIJO = 'lectorHojas';
  // Lo que es de cada equipo (estadísticas, avisos, la propia mudanza) no se trae.
  const PROPIAS = ['lectorHojas.visitante', 'lectorHojas.config', 'lectorHojas.equipoPlus', 'lectorHojas.avisoCerrado', 'lectorHojas.lanzamiento', 'lectorHojas.mudanzaUrl', 'lectorHojas.mudanzaVista', 'lectorHojas.mudanzaHecha'];

  let url = '';
  try {
    url = localStorage.getItem('lectorHojas.mudanzaUrl') || ''; // para probar con otra dirección
  } catch (e) {
    url = '';
  }
  url = url || CFG.mudanza || 'https://jesukrister.github.io/hojarespuestascsm/';
  const ORIGEN = new URL(url).origin;

  let ventana = null;
  let hola = 0;
  let espera = 0;
  let resumen = null;

  const mensaje = (t, error) => {
    const p = $('#mensaje');
    p.textContent = t || '';
    p.className = error ? 'error' : 'muted';
  };
  const paso = (n) => {
    for (const i of [1, 2, 3]) $('#paso' + i).hidden = i !== n;
  };
  const hayDatosAqui = () => {
    try {
      return !!(localStorage.getItem('lectorHojas.v1') || localStorage.getItem('lectorHojasPro.v1'));
    } catch (e) {
      return false;
    }
  };
  function terminar() {
    clearInterval(hola);
    clearTimeout(espera);
  }

  $('#buscar').addEventListener('click', () => {
    mensaje('Abriendo la dirección antigua…');
    ventana = window.open(url, 'lectorMudanza');
    if (!ventana) {
      mensaje('El navegador bloqueó la otra pestaña. Permite las ventanas emergentes para corrigeya.cl y vuelve a presionar «Buscar mis datos».', true);
      return;
    }
    terminar();
    // Avisa a la otra pestaña que estamos listos (por si ya había leído todo antes).
    hola = setInterval(() => {
      try {
        ventana.postMessage({ tipo: 'lector-mudanza:hola' }, ORIGEN);
      } catch (e) {
        /* aún cargando */
      }
    }, 800);
    espera = setTimeout(() => {
      terminar();
      mensaje('La dirección antigua no respondió. Revisa tu internet y vuelve a intentarlo.', true);
    }, 30000);
  });

  $('#traer').addEventListener('click', () => {
    if (!ventana || ventana.closed) {
      mensaje('Se cerró la otra pestaña. Presiona otra vez «Buscar mis datos».', true);
      paso(1);
      return;
    }
    $('#traer').disabled = true;
    mensaje('Trayendo tus datos…');
    ventana.postMessage({ tipo: 'lector-mudanza:pedir' }, ORIGEN);
    espera = setTimeout(() => {
      $('#traer').disabled = false;
      mensaje('La otra pestaña no envió los datos. Vuelve a intentarlo.', true);
    }, 60000);
  });

  window.addEventListener('message', async (e) => {
    if (e.origin !== ORIGEN || !ventana || e.source !== ventana || !e.data || typeof e.data.tipo !== 'string') return;
    if (e.data.tipo === 'lector-mudanza:lista') {
      terminar();
      resumen = e.data.resumen || {};
      if (resumen.vacio || !Array.isArray(resumen.lineas)) {
        mensaje('');
        paso(1);
        mensaje('No encontramos datos del Lector de Hojas en este navegador. Si lo usabas en otro equipo o navegador, abre corrigeya.cl/traer.html ahí.', true);
        try {
          ventana.close();
        } catch (err) {
          /* nada */
        }
        return;
      }
      $('#lista').textContent = '';
      for (const l of resumen.lineas) {
        const li = document.createElement('li');
        li.textContent = l;
        $('#lista').appendChild(li);
      }
      $('#reemplazo').hidden = !hayDatosAqui();
      mensaje('');
      paso(2);
      window.focus();
    } else if (e.data.tipo === 'lector-mudanza:datos') {
      clearTimeout(espera);
      try {
        await importar(e.data.datos);
        ventana.postMessage({ tipo: 'lector-mudanza:recibido' }, ORIGEN);
        const d = e.data.datos;
        $('#abrirNormal').hidden = !(d.local && d.local['lectorHojas.v1']);
        mensaje('');
        paso(3);
        window.focus();
      } catch (err) {
        console.error(err);
        $('#traer').disabled = false;
        mensaje(err.message || 'No se pudieron guardar los datos.', true);
      }
    }
  });

  /* ---------- Guardar lo que llegó ---------- */

  const pedido = (r) =>
    new Promise((ok, mal) => {
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });

  function borrarBase(nombre) {
    return new Promise((ok, mal) => {
      const r = indexedDB.deleteDatabase(nombre);
      r.onsuccess = () => ok();
      r.onerror = () => mal(r.error);
      r.onblocked = () => mensaje('Cierra las otras pestañas de CorrigeYa o del Lector de Hojas para terminar…', true);
    });
  }

  async function crearBase(b) {
    await borrarBase(b.name);
    const db = await new Promise((ok, mal) => {
      const r = indexedDB.open(b.name, Math.max(1, Number(b.version) || 1));
      r.onupgradeneeded = () => {
        for (const s of b.stores) {
          const st = r.result.createObjectStore(s.name, { keyPath: s.keyPath === undefined ? null : s.keyPath, autoIncrement: !!s.autoIncrement });
          for (const i of s.indexes || []) st.createIndex(i.name, i.keyPath, { unique: !!i.unique, multiEntry: !!i.multiEntry });
        }
      };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
      r.onblocked = () => mensaje('Cierra las otras pestañas de CorrigeYa o del Lector de Hojas para terminar…', true);
    });
    try {
      for (const s of b.stores) {
        if (!s.values.length) continue;
        const tx = db.transaction(s.name, 'readwrite');
        const st = tx.objectStore(s.name);
        s.values.forEach((v, i) => (st.keyPath === null ? st.put(v, s.keys[i]) : st.put(v)));
        await new Promise((ok, mal) => {
          tx.oncomplete = ok;
          tx.onerror = () => mal(tx.error);
          tx.onabort = () => mal(tx.error || new Error('No se pudo guardar.'));
        });
      }
    } finally {
      db.close();
    }
  }

  function validar(d) {
    const ok =
      d &&
      d.v === 1 &&
      d.local &&
      typeof d.local === 'object' &&
      Object.keys(d.local).every((k) => k.indexOf(PREFIJO) === 0 && typeof d.local[k] === 'string') &&
      Array.isArray(d.bases) &&
      d.bases.every(
        (b) =>
          b && typeof b.name === 'string' && b.name.indexOf(PREFIJO) === 0 && Array.isArray(b.stores) &&
          b.stores.every((s) => s && typeof s.name === 'string' && Array.isArray(s.values) && Array.isArray(s.keys) && s.keys.length === s.values.length)
      );
    if (!ok) throw new Error('Los datos que llegaron no tienen el formato esperado. No se cambió nada.');
  }

  async function importar(d) {
    validar(d);
    if (!window.indexedDB) throw new Error('Este navegador no permite guardar los datos (¿ventana de incógnito?).');
    for (const b of d.bases) await crearBase(b);
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    for (const k of keys) if (k && k.indexOf(PREFIJO) === 0 && PROPIAS.indexOf(k) < 0) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(d.local)) if (PROPIAS.indexOf(k) < 0) localStorage.setItem(k, v);
    localStorage.setItem('lectorHojas.mudanzaHecha', String(Date.now()));
  }

  // Desde el aviso de la app: empieza a buscar sin otro clic no se puede (el navegador
  // bloquea abrir pestañas sin un toque), así que sólo se deja listo el botón.
  if (/[?&]desde=app/.test(location.search)) $('#buscar').focus();
})();
