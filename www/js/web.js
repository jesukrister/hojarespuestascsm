/*
 * La página web y el servidor (nube/lector-nube.mjs), manejado desde /admin:
 *  - Configuración: precio de CorrigeYa Plus, aviso arriba de la página y si se
 *    pueden canjear códigos de Plus.
 *  - Estadísticas de uso anónimas: cuántas visitas y cuántas hojas se corrigen
 *    o imprimen al día. No se manda ningún dato de la prueba, de estudiantes ni
 *    de la persona: sólo el nombre del evento y un número al azar de este
 *    navegador (para contar visitantes distintos).
 *
 * Dentro de la app de Android no hace nada: la app sigue igual.
 */
(function () {
  'use strict';
  const CFG = window.LANZAMIENTO || {};
  const cap = window.Capacitor;
  const enApp = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const CONFIG_KEY = 'lectorHojas.config';
  const VISITANTE_KEY = 'lectorHojas.visitante';
  const EQUIPO_KEY = 'lectorHojas.equipoPlus';
  const AVISO_KEY = 'lectorHojas.avisoCerrado';

  const store = {
    get(k) {
      try {
        return localStorage.getItem(k);
      } catch (e) {
        return null;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, v);
      } catch (e) {
        /* sin almacenamiento */
      }
    },
  };

  // En el computador de desarrollo (localhost) sólo se conecta si se eligió un
  // servidor de prueba (la misma opción que usa la nube de la versión Pro).
  const propio = store.get('lectorHojasPro.nubeUrl');
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';
  const servidor = String(propio || CFG.servidor || '').replace(/\/+$/, '');
  const activo = !enApp && !!servidor && (!local || !!propio);

  const pagina = window.PAGINA_USO || (document.documentElement.dataset.edition === 'pro' ? 'pro' : 'normal');

  /* ---------- Traer los datos de la dirección antigua (traer.html) ---------- */

  // En corrigeya.cl, quien llega sin datos ve un aviso para traer lo que guardó en
  // jesukrister.github.io. Se mira antes de que la app guarde nada.
  const MUDANZA_VISTA = 'lectorHojas.mudanzaVista';
  const enDominio = /(^|\.)corrigeya\.cl$/.test(location.hostname) || !!store.get('lectorHojas.mudanzaUrl');
  const sinDatos = !store.get('lectorHojas.v1') && !store.get('lectorHojasPro.v1');
  const ofrecerMudanza = !enApp && enDominio && pagina !== 'corrigeya' && sinDatos && !store.get('lectorHojas.mudanzaHecha') && !store.get(MUDANZA_VISTA);
  const urlTraer = () => new URL('traer.html', document.baseURI).href;
  function mostrarMudanza() {
    const btn = document.getElementById('btnTraer');
    if (btn && !enApp && enDominio) {
      btn.hidden = false;
      btn.addEventListener('click', () => (location.href = urlTraer()));
    }
    if (!ofrecerMudanza || document.getElementById('webMudanza')) return;
    const div = document.createElement('div');
    div.id = 'webMudanza';
    div.className = 'web-aviso web-mudanza';
    div.setAttribute('role', 'status');
    const span = document.createElement('span');
    span.textContent = '📦 ¿Usabas el Lector de Hojas en la dirección antigua? Trae tus pruebas, hojas y cursos.';
    const link = document.createElement('a');
    link.href = urlTraer();
    link.textContent = 'Traer mis datos';
    const x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('aria-label', 'Cerrar el aviso');
    x.textContent = '✕';
    x.addEventListener('click', () => {
      store.set(MUDANZA_VISTA, '1');
      div.remove();
    });
    div.append(span, link, x);
    document.body.prepend(div);
    estilosAviso();
  }

  function azar() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  function idGuardado(key) {
    let v = store.get(key);
    if (!/^[0-9a-f]{32}$/.test(v || '')) {
      v = azar();
      store.set(key, v);
    }
    return v;
  }

  async function pedir(ruta, datos) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), 12000) : 0;
    try {
      const r = await fetch(servidor + ruta, {
        method: datos === undefined ? 'GET' : 'POST',
        headers: datos === undefined ? {} : { 'Content-Type': 'application/json' },
        body: datos === undefined ? undefined : JSON.stringify(datos),
        signal: ctl ? ctl.signal : undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const e = new Error(j.error || 'No se pudo conectar con el servidor.');
        e.status = r.status;
        throw e;
      }
      return j;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('El servidor no respondió. Revisa tu internet e inténtalo de nuevo.');
      if (e instanceof TypeError) throw new Error('No hay conexión con el servidor. Revisa tu internet.');
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  /* ---------- Configuración (desde /admin) ---------- */

  let config = null;
  const listeners = [];
  try {
    const c = JSON.parse(store.get(CONFIG_KEY) || 'null');
    if (c && c.v) config = c.v;
  } catch (e) {
    config = null;
  }

  function usarConfig(c) {
    config = c;
    for (const fn of listeners) {
      try {
        fn(c);
      } catch (e) {
        console.error(e);
      }
    }
    mostrarAviso();
    if (c && c.estadisticas === false) cola.length = 0;
  }

  async function cargarConfig() {
    try {
      const c = JSON.parse(store.get(CONFIG_KEY) || 'null');
      if (c && c.v && Date.now() - c.at < 10 * 60000) return;
    } catch (e) {
      /* se vuelve a pedir */
    }
    try {
      const c = await pedir('/config');
      store.set(CONFIG_KEY, JSON.stringify({ at: Date.now(), v: c }));
      usarConfig(c);
    } catch (e) {
      /* sin internet: queda la última configuración */
    }
  }

  /* ---------- Aviso arriba de la página ---------- */

  function huellaTexto(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return String(h);
  }
  function mostrarAviso() {
    const viejo = document.getElementById('webAviso');
    const a = config && config.aviso;
    if (!a || !a.activo || !a.texto || store.get(AVISO_KEY) === huellaTexto(a.texto)) {
      if (viejo) viejo.remove();
      return;
    }
    if (!document.body) return;
    const div = viejo || document.createElement('div');
    div.id = 'webAviso';
    div.className = 'web-aviso';
    div.setAttribute('role', 'status');
    div.textContent = '';
    const span = document.createElement('span');
    span.textContent = a.texto;
    div.appendChild(span);
    if (a.enlace) {
      const link = document.createElement('a');
      link.href = a.enlace;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Ver más';
      div.appendChild(link);
    }
    const x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('aria-label', 'Cerrar el aviso');
    x.textContent = '✕';
    x.addEventListener('click', () => {
      store.set(AVISO_KEY, huellaTexto(a.texto));
      div.remove();
    });
    div.appendChild(x);
    if (!viejo) document.body.prepend(div);
    estilosAviso();
  }

  function estilosAviso() {
    if (!document.getElementById('webAvisoCss')) {
      const css = document.createElement('style');
      css.id = 'webAvisoCss';
      css.textContent =
        '.web-aviso{display:flex;gap:.75rem;align-items:center;justify-content:center;flex-wrap:wrap;padding:.6rem 2.6rem .6rem 1rem;background:#fff4c2;color:#3d3000;font:500 15px/1.4 system-ui,sans-serif;text-align:center;position:relative;border-bottom:1px solid #e6cf6a}' +
        '.web-aviso a{color:#1f4e79;font-weight:700}' +
        '.web-aviso button{position:absolute;right:.4rem;top:50%;transform:translateY(-50%);border:0;background:transparent;color:inherit;font-size:18px;cursor:pointer;padding:.3rem .5rem;border-radius:6px}' +
        '.web-aviso button:hover{background:rgba(0,0,0,.08)}' +
        'html[data-tema="oscuro"] .web-aviso{background:#3a3210;color:#fbefc0;border-color:#5c4f17}html[data-tema="oscuro"] .web-aviso a{color:#9cc8f0}' +
        '.web-mudanza{background:#e3effa;color:#163a5c;border-color:#b9d3ec}.web-mudanza a{background:#1f4e79;color:#fff!important;padding:.25rem .8rem;border-radius:999px;text-decoration:none}' +
        'html[data-tema="oscuro"] .web-mudanza{background:#16283a;color:#d6e6f5;border-color:#27425e}' +
        '@media print{.web-aviso{display:none}}';
      document.head.appendChild(css);
    }
  }

  /* ---------- Estadísticas de uso ---------- */

  const privado = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
  const midiendo = () => activo && !privado && !(config && config.estadisticas === false);
  const cola = [];
  let espera = 0;

  function enviar(alSalir) {
    clearTimeout(espera);
    espera = 0;
    if (!cola.length || !midiendo()) return;
    const datos = JSON.stringify({ pagina, visitante: idGuardado(VISITANTE_KEY), eventos: cola.splice(0, 200) });
    // sendBeacon sigue enviando aunque se cierre la pestaña (texto plano: sin consulta previa de CORS).
    if (alSalir && navigator.sendBeacon && navigator.sendBeacon(servidor + '/uso', new Blob([datos], { type: 'text/plain' }))) return;
    fetch(servidor + '/uso', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: datos, keepalive: true }).catch(() => {});
  }

  /** Cuenta un evento («corregida», «hojas», «prueba», «pauta»…). */
  function contar(evento) {
    if (!midiendo()) return;
    cola.push(String(evento));
    if (!espera) espera = setTimeout(() => enviar(false), 8000);
  }

  window.LectorWeb = {
    enApp,
    activo,
    servidor,
    pagina,
    config: () => config,
    onConfig(fn) {
      listeners.push(fn);
      if (config) fn(config);
    },
    contar,
    pedir,
    /** ¿Se muestra el aviso para traer los datos de la dirección antigua? */
    ofreceMudanza: ofrecerMudanza,
    /** Número al azar de este navegador para los códigos de Plus. */
    equipo: () => idGuardado(EQUIPO_KEY),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mostrarMudanza);
  else mostrarMudanza();

  if (!activo) return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') enviar(true);
  });
  window.addEventListener('pagehide', () => enviar(true));

  const empezar = () => {
    mostrarAviso();
    contar('visita');
    contar(window.matchMedia && matchMedia('(pointer: coarse)').matches ? 'movil' : 'computador');
    cargarConfig();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', empezar);
  else empezar();
})();
