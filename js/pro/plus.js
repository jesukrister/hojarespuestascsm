/*
 * CorrigeYa Plus: las funciones de pago.
 *
 * Antes del lanzamiento (js/lanzamiento.js con corrigeya: false) todo sigue
 * gratis y sólo la agenda y el horario necesitan Plus, que se ve con la vista
 * previa: abrir la app con «?plus=1» (se quita con «?plus=0»).
 *
 * Con el lanzamiento encendido, la app se llama CorrigeYa y Excel, informes,
 * nube, modo simple y agenda piden Plus. En la app de Android, Plus se paga
 * con Google Play (SuscripcionPlugin.java); en la web, por ahora se indica
 * cómo contratarlo desde la app.
 *
 * En la web también se activa con un código de CorrigeYa Plus (CY-XXXX-XXXX-XXXX)
 * creado en el panel /admin, y el precio que se muestra es el del panel
 * (js/web.js). La app de Android no canjea códigos: se paga con Google Play.
 *
 * Plus en la cuenta: con la sesión de la nube abierta, el código o la compra de
 * Google Play quedan en la cuenta (el servidor confirma la compra con Google), y
 * Plus se activa en todos los equipos donde se entre con esa cuenta. Guardar en
 * la nube lo revisa el servidor (si en /admin se encendió «La nube pide Plus»).
 * La vista previa (?plus=1) sólo funciona antes del lanzamiento.
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  if (!Pro) return;
  const { app, $, $$ } = Pro;
  const CFG = window.LANZAMIENTO || {};
  const KEY = 'lectorHojasPro.plus';
  const PLAY_KEY = 'lectorHojasPro.plusPlay';
  const CODE_KEY = 'lectorHojasPro.plusCodigo';
  const ACCOUNT_KEY = 'lectorHojasPro.plusCuenta';
  const REF_KEY = 'lectorHojas.ref'; // código de quien invitó (lo guarda js/web.js)
  const TRIAL_KEY = 'lectorHojasPro.quierePrueba'; // pidió la prueba gratis antes de tener cuenta
  const web = window.LectorWeb && !window.LectorWeb.enApp && window.LectorWeb.activo ? window.LectorWeb : null;
  const cap = window.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform() && cap.isPluginAvailable && cap.isPluginAvailable('Suscripcion'));

  // Vista previa: ?plus=1 la enciende en este equipo y ?plus=0 la apaga.
  try {
    const url = new URL(location.href);
    const q = url.searchParams.get('plus');
    if (q === '1') localStorage.setItem(KEY, 'vista-previa');
    else if (q === '0') localStorage.removeItem(KEY);
    if (q !== null) {
      url.searchParams.delete('plus');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  } catch (e) {
    /* sin almacenamiento: sin vista previa */
  }

  // Con CorrigeYa lanzado ya no hay vista previa (para probar: un código desde /admin).
  function preview() {
    if (CFG.corrigeya) return false;
    try {
      return localStorage.getItem(KEY) === 'vista-previa';
    } catch (e) {
      return false;
    }
  }

  // Última respuesta de Google Play (para saberlo al abrir, aun sin internet).
  let play = {};
  try {
    play = JSON.parse(localStorage.getItem(PLAY_KEY) || '{}') || {};
  } catch (e) {
    play = {};
  }
  function savePlay() {
    try {
      localStorage.setItem(PLAY_KEY, JSON.stringify(play));
    } catch (e) {
      /* sin almacenamiento */
    }
  }

  // Código de Plus canjeado en este navegador: { token, codigo, hasta (0: sin término), at }.
  let code = null;
  try {
    code = JSON.parse(localStorage.getItem(CODE_KEY) || 'null');
  } catch (e) {
    code = null;
  }
  function saveCode() {
    try {
      if (code) localStorage.setItem(CODE_KEY, JSON.stringify(code));
      else localStorage.removeItem(CODE_KEY);
    } catch (e) {
      /* sin almacenamiento */
    }
  }
  const codeActive = () => !native && !!(code && code.token) && (code.hasta === 0 || code.hasta > Date.now());

  // Plus de la cuenta de la nube (último dato del servidor): { correo, activa, hasta, origen, at }.
  let account = null;
  try {
    account = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null');
  } catch (e) {
    account = null;
  }
  function saveAccount() {
    try {
      if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
      else localStorage.removeItem(ACCOUNT_KEY);
    } catch (e) {
      /* sin almacenamiento */
    }
  }
  /** Sesión de la nube: { token, correo, url }, null sin sesión, undefined si aún no se sabe. */
  const session = () => (Pro.cloud && Pro.cloud.session ? Pro.cloud.session() : undefined);
  function accountActive() {
    if (!account || !account.activa) return false;
    const s = session();
    if (s === null || (s && s.correo !== account.correo)) return false;
    // Sin internet se confía en lo último que dijo el servidor (hasta 30 días).
    return (account.hasta === 0 || account.hasta > Date.now()) && Date.now() - (account.at || 0) < 30 * 864e5;
  }

  const launched = () => !!CFG.corrigeya;
  const active = () => preview() || !!play.activa || codeActive() || accountActive();
  /** ¿Se puede usar esa función? Antes del lanzamiento, todo menos la agenda es gratis. */
  const allows = (feature) => active() || (!launched() && feature !== 'agenda');
  const webConfig = () => (web && web.config()) || null;
  const price = () => (native ? play.precio : webConfig() && webConfig().precioTexto) || CFG.plusPrecio || '$1.990 al mes';

  const WHY = {
    excel: 'Descargar el Excel y las evidencias es parte de CorrigeYa Plus.',
    informes: 'Los informes por estudiante y para UTP son parte de CorrigeYa Plus.',
    nube: 'Guardar en la nube (y usar CorrigeYa en el celular y el computador) es parte de CorrigeYa Plus. Si ya tienes Plus en tu cuenta, se activa solo al entrar.',
    simple: 'El modo simple es parte de CorrigeYa Plus.',
    agenda: 'La agenda y el horario son parte de CorrigeYa Plus.',
  };

  /* ---------- Nombre y marca ---------- */

  const LOGO =
    '<svg class="logo-cy" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#1f4e79"/><rect x="12" y="9" width="36" height="44" rx="5" fill="#fff"/><g fill="none" stroke="#1f4e79" stroke-width="2.6"><circle cx="21" cy="19" r="4.4"/><circle cx="30" cy="19" r="4.4"/><circle cx="39" cy="19" r="4.4"/><circle cx="21" cy="31" r="4.4"/><circle cx="30" cy="31" r="4.4"/><circle cx="39" cy="31" r="4.4"/><circle cx="21" cy="43" r="4.4"/><circle cx="30" cy="43" r="4.4"/></g><circle cx="30" cy="19" r="4.4" fill="#1f4e79"/><circle cx="21" cy="31" r="4.4" fill="#1f4e79"/><circle cx="30" cy="43" r="4.4" fill="#1f4e79"/><circle cx="46" cy="47" r="12" fill="#2fa84f" stroke="#1f4e79" stroke-width="3"/><path d="M40 47.3l4.2 4.2 7.8-8.2" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function brand() {
    if (!launched()) return;
    document.title = 'CorrigeYa';
    const svg = $('.brand svg');
    if (svg && !svg.classList.contains('logo-cy')) svg.outerHTML = LOGO;
    const h1 = $('.brand h1');
    if (h1) h1.innerHTML = `CorrigeYa${active() ? '<span class="plus-badge">PLUS</span>' : ''}`;
  }

  /* ---------- Estado en pantalla ---------- */

  const listeners = [];
  function changed() {
    const root = document.documentElement;
    if (active()) root.dataset.plus = '1';
    else delete root.dataset.plus;
    // Botones de funciones Plus marcados con ⭐ cuando no se tiene.
    if (launched() && !active()) root.dataset.plusGate = '1';
    else delete root.dataset.plusGate;
    brand();
    renderChip();
    for (const fn of listeners) fn();
  }

  function renderChip() {
    const chip = $('#plusChip');
    if (!chip) return;
    chip.hidden = !launched() && !active();
    chip.textContent = active() ? '⭐ Plus activo' : '⭐ Hazte Plus';
    chip.classList.toggle('on', active());
  }

  /* ---------- Cuadro «CorrigeYa Plus» ---------- */

  function upsell(feature) {
    for (const m of $$('details.menu[open]')) m.open = false;
    const dlg = $('#plusDialog');
    $('#plusWhy').textContent = active()
      ? '¡Gracias por apoyar CorrigeYa! Tienes todas las funciones de Plus.'
      : WHY[feature] || 'Todo tu trabajo docente, ordenado y al día.';
    $('#plusPrice').textContent = price();
    $('#plusBuy').hidden = active();
    $('#plusBuy').textContent = `⭐ Suscribirme · ${price()}`;
    $('#plusRestore').hidden = active() || !native;
    $('#plusManage').hidden = !active() || !native;
    $('#plusWebNote').hidden = native || active();
    $('#plusPlayLink').href = CFG.appPlay || '#';
    $('#plusMsg').textContent = '';
    if ($('#plusCodeGo')) $('#plusCodeGo').classList.remove('primary');
    renderCode();
    renderOffers();
    if (!dlg.open) dlg.showModal();
  }

  /* ---------- Prueba gratis y referidos ---------- */

  const sitio = () => String(CFG.sitio || 'https://corrigeya.cl/').replace(/\/?$/, '/');
  const storeGet = (k) => {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  };
  const storeSet = (k, v) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (e) {
      /* sin almacenamiento */
    }
  };

  function renderOffers() {
    const trial = $('#plusTrial');
    const ref = $('#plusRef');
    if (!trial || !ref) return;
    const s = session();
    const info = account && s && account.correo === s.correo ? account : null;
    const prueba = info && info.prueba;
    // Antes del lanzamiento todo es gratis: no se ofrece nada de esto.
    trial.hidden = !launched() || active() || (prueba && !prueba.disponible);
    const dias = (prueba && prueba.dias) || 7;
    $('#plusTrialGo').textContent = `🎁 Probar Plus gratis ${dias} días`;
    $('#plusTrialNote').textContent = s ? 'Sin tarjeta y sin compromiso.' : 'Sin tarjeta. Sólo crea tu cuenta gratis de la nube, con tu correo.';
    const refs = info && info.referidos;
    ref.hidden = !launched() || (refs && refs.activos === false);
    if (ref.hidden) return;
    $('#plusRefWhy').innerHTML = `Por cada colega que cree su cuenta con tu enlace, ganas <b>${(refs && refs.dias) || 15} días</b> de Plus gratis.`;
    $('#plusRefLogin').hidden = !!s;
    $('#plusRefRow').hidden = true;
    $('#plusRefWa').hidden = true;
    $('#plusRefStats').textContent = '';
    if (s) loadReferrals(s);
  }

  async function loadReferrals(s) {
    try {
      const r = await accountCall(s, 'GET', '/referidos');
      const link = `${sitio()}?ref=${r.codigo}`;
      $('#plusRefLink').value = link;
      $('#plusRefRow').hidden = false;
      const text = `Uso CorrigeYa para corregir las pruebas con una foto del celular: la nota sale al tiro y me ahorra el fin de semana. Pruébala gratis: ${link}`;
      $('#plusRefWa').href = 'https://wa.me/?text=' + encodeURIComponent(text);
      $('#plusRefWa').hidden = false;
      const partes = [];
      if (r.invitados) partes.push(`Has invitado a ${r.invitados} ${r.invitados === 1 ? 'colega' : 'colegas'}`);
      if (r.diasGanados) partes.push(`ganaste ${r.diasGanados} días de Plus`);
      if (r.invitados && !r.restantesAnio) partes.push('llegaste al máximo de premios de este año');
      $('#plusRefStats').textContent = partes.length ? partes.join(' · ') + '.' : 'Todavía no has invitado a nadie.';
    } catch (e) {
      $('#plusRefStats').textContent = e.message;
    }
  }

  async function startTrial() {
    const s = session();
    if (!s) {
      // Primero la cuenta (para que la prueba sea una por correo); al entrar, empieza sola.
      storeSet(TRIAL_KEY, String(Date.now()));
      $('#plusDialog').close();
      const b = document.querySelector('[data-cloud="crear"]');
      if (b) b.click();
      return;
    }
    const btn = $('#plusTrialGo');
    btn.disabled = true;
    $('#plusMsg').textContent = 'Activando tu prueba gratis…';
    try {
      const r = await accountCall(s, 'POST', '/plus/prueba');
      storeSet(TRIAL_KEY, null);
      setAccount(s, r);
      $('#plusDialog').close();
      app.toast(`🎁 ¡Listo! Tienes CorrigeYa Plus gratis hasta el ${fecha(r.hasta)}.`);
    } catch (e) {
      $('#plusMsg').textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------- Códigos de CorrigeYa Plus (sólo en la web) ---------- */

  const fecha = (t) => new Date(t).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  function renderCode() {
    const box = $('#plusCodeBox');
    const info = $('#plusCodeInfo');
    if (!box || !info) return;
    const cfg = webConfig();
    box.hidden = !web || active() || (cfg && cfg.canje === false);
    info.hidden = !codeActive() && !accountActive();
    if (accountActive()) {
      const how = { play: ' (Google Play)', codigo: ' (código)', prueba: ' (prueba gratis)', referido: ' (por invitar colegas)' }[account.origen] || '';
      info.textContent = `Plus activo en tu cuenta ${account.correo}${how}${account.hasta ? `, hasta el ${fecha(account.hasta)}` : ''}. Funciona en todos los equipos donde entres a la nube.`;
    } else if (codeActive()) {
      info.textContent = `Plus activo en este navegador con el código ${code.codigo || ''}${code.hasta ? `, hasta el ${fecha(code.hasta)}` : ''}. Entra a la nube para tenerlo también en tus otros equipos.`;
    }
  }

  /* ---------- Plus de la cuenta ---------- */

  async function accountCall(s, method, path, data) {
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ctl ? setTimeout(() => ctl.abort(), 12000) : 0;
    try {
      const headers = { Authorization: 'Bearer ' + s.token };
      if (data !== undefined) headers['Content-Type'] = 'application/json';
      const r = await fetch(s.url.replace(/\/+$/, '') + path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data), cache: 'no-store', signal: ctl ? ctl.signal : undefined });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const e = new Error(j.error || `El servidor respondió con un error (${r.status}).`);
        e.status = r.status;
        throw e;
      }
      return j;
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error('El servidor no respondió. Revisa tu internet.');
      if (e instanceof TypeError) throw new Error('No hay conexión con el servidor. Revisa tu internet.');
      throw e;
    } finally {
      clearTimeout(t);
    }
  }
  function setAccount(s, r) {
    const was = active();
    const prev = account && account.correo === s.correo ? account : {};
    account = {
      correo: s.correo,
      activa: !!r.activa,
      hasta: r.hasta === undefined ? null : r.hasta,
      origen: r.origen || null,
      prueba: r.prueba || prev.prueba || null,
      referidos: r.referidos || prev.referidos || null,
      at: Date.now(),
    };
    saveAccount();
    if (was !== active()) changed();
    else renderChip();
  }

  /**
   * Pregunta al servidor si la cuenta de la nube tiene Plus. Antes, une a la
   * cuenta el código canjeado en este navegador o la compra de Google Play.
   * La llama nube.js al abrir, al entrar y al salir de la nube.
   */
  let accountSync = null;
  function syncAccount() {
    const s = session();
    if (s === undefined) return Promise.resolve();
    if (!s) {
      if (account) {
        const was = active();
        account = null;
        saveAccount();
        if (was !== active()) changed();
      }
      return Promise.resolve();
    }
    if (accountSync) return accountSync;
    accountSync = (async () => {
      try {
        let r = null;
        if (web && code && code.token) {
          try {
            r = await accountCall(s, 'POST', '/plus/vincular', { token: code.token });
            code = null;
            saveCode();
          } catch (e) {
            if (e.status === 400) {
              code = null;
              saveCode();
            }
          }
        }
        const unida = play.token ? play.token + '|' + s.correo : '';
        if (native && play.activa && play.token && play.unida !== unida) {
          try {
            r = await accountCall(s, 'POST', '/plus/play', { token: play.token, producto: CFG.plusProducto || 'corrigeya_plus' });
            play.unida = unida;
            savePlay();
          } catch (e) {
            console.warn(e);
          }
        }
        // Llegó con el enlace de un colega y ya tiene cuenta: el colega gana sus días.
        let ref = null;
        try {
          ref = JSON.parse(storeGet(REF_KEY) || 'null');
        } catch (e) {
          ref = null;
        }
        if (ref && ref.codigo && Date.now() - (ref.at || 0) < 60 * 864e5) {
          try {
            await accountCall(s, 'POST', '/referidos/usar', { codigo: ref.codigo });
            storeSet(REF_KEY, null);
          } catch (e) {
            if (e.status === 400) storeSet(REF_KEY, null);
          }
        } else if (ref) storeSet(REF_KEY, null);
        // Pidió la prueba gratis antes de crear la cuenta: empieza ahora.
        const wants = Number(storeGet(TRIAL_KEY)) || 0;
        if (wants && Date.now() - wants < 864e5) {
          try {
            const t = await accountCall(s, 'POST', '/plus/prueba');
            app.toast(`🎁 ¡Listo! Tienes CorrigeYa Plus gratis hasta el ${fecha(t.hasta)}.`);
          } catch (e) {
            if (e.status === 409 || e.status === 403) app.toast(e.message);
          }
          storeSet(TRIAL_KEY, null);
        } else if (wants) storeSet(TRIAL_KEY, null);
        r = await accountCall(s, 'GET', '/plus');
        setAccount(s, r);
      } catch (e) {
        /* sin internet o sesión vencida: queda lo último que se supo */
      } finally {
        accountSync = null;
      }
    })();
    return accountSync;
  }

  async function redeem() {
    const input = $('#plusCode');
    const value = input.value.trim();
    if (!value) {
      $('#plusMsg').textContent = 'Escribe el código (empieza con CY-).';
      input.focus();
      return;
    }
    const btn = $('#plusCodeGo');
    btn.disabled = true;
    $('#plusMsg').textContent = 'Revisando el código…';
    try {
      const s = session();
      let r;
      if (s) {
        // Con la nube abierta, el código queda en la cuenta (Plus en todos sus equipos).
        r = await accountCall(s, 'POST', '/plus/canjear', { codigo: value });
        setAccount(s, r);
      } else {
        r = await web.pedir('/plus/canjear', { codigo: value, equipo: web.equipo() });
        code = { token: r.token, codigo: r.codigo, hasta: r.hasta, at: Date.now() };
        saveCode();
      }
      web.contar('canje');
      input.value = '';
      changed();
      $('#plusDialog').close();
      app.toast(`¡Listo! CorrigeYa Plus está activo${r.hasta ? ` hasta el ${fecha(r.hasta)}` : ''}. 💚`);
    } catch (e) {
      $('#plusMsg').textContent = e.message;
    } finally {
      btn.disabled = false;
    }
  }

  // Revisa el código guardado (si lo anularon o terminó) cada 6 horas, con internet.
  async function checkCode() {
    if (!web || !code || !code.token) return;
    if (code.hasta && code.hasta < Date.now()) {
      code = null;
      saveCode();
      changed();
      app.toast('Tu CorrigeYa Plus con código terminó.');
      return;
    }
    if (Date.now() - (code.checked || 0) < 6 * 3600000) return;
    try {
      const r = await web.pedir('/plus/verificar', { token: code.token });
      if (r.activa) {
        code = Object.assign({}, code, { hasta: r.hasta, checked: Date.now() });
        saveCode();
      } else {
        code = null;
        saveCode();
        changed();
        app.toast(r.motivo || 'Tu código de CorrigeYa Plus ya no está activo.');
      }
    } catch (e) {
      /* sin internet: se revisa después */
    }
  }

  const call = (method) => cap.nativePromise('Suscripcion', method, { producto: CFG.plusProducto || 'corrigeya_plus' });

  /** Pregunta a Google Play si hay una suscripción activa (y su precio). */
  async function refresh() {
    if (!native) return;
    try {
      const r = await call('estado');
      const was = !!play.activa;
      play = { activa: !!r.activa, precio: r.precio || play.precio || '', token: r.token || '', unida: r.token && play.token === r.token ? play.unida : '', at: Date.now() };
      savePlay();
      if (was !== play.activa) changed();
      else renderChip();
      if (play.activa && play.token) syncAccount();
    } catch (e) {
      console.error(e);
    }
  }

  async function buy() {
    if (!native) {
      $('#plusWebNote').hidden = false;
      $('#plusMsg').textContent = 'En la web todavía no se puede pagar: contrata Plus desde la app CorrigeYa de Android.';
      return;
    }
    $('#plusMsg').textContent = 'Abriendo Google Play…';
    try {
      const r = await call('comprar');
      if (r.activa) {
        play = Object.assign({}, play, { activa: true, token: r.token || play.token || '', at: Date.now() });
        savePlay();
        changed();
        syncAccount();
        $('#plusDialog').close();
        app.toast('¡Listo! CorrigeYa Plus está activo. Gracias 💚');
      } else {
        $('#plusMsg').textContent = r.error || '';
      }
    } catch (e) {
      $('#plusMsg').textContent = e && e.message ? e.message : 'No se pudo abrir el pago de Google Play.';
    }
  }

  async function restore() {
    $('#plusMsg').textContent = 'Revisando tu suscripción en Google Play…';
    await refresh();
    if (active()) {
      $('#plusDialog').close();
      app.toast('Tu suscripción a CorrigeYa Plus está activa. 💚');
    } else {
      $('#plusMsg').textContent = 'No encontramos una suscripción activa con la cuenta de Google de este teléfono.';
    }
  }

  /* ---------- Funciones que piden Plus ---------- */

  // Se intercepta el clic antes de que llegue al botón: así cada función no
  // necesita saber de Plus.
  const GATES = [
    ['#btnExportZip, #btnExportFolder, #btnExportCsv, #proExcel', 'excel'],
    ['#proReportTest, #proReportCourse, .pro-fb [data-fb-pdf]', 'informes'],
    // La nube no se bloquea aquí: se puede entrar a la cuenta (para traer el Plus
    // que ya tenga) y el servidor decide si guarda.
  ];
  document.addEventListener(
    'click',
    (e) => {
      if (!launched()) return;
      for (const [sel, feature] of GATES) {
        if (!e.target.closest(sel) || allows(feature)) continue;
        e.preventDefault();
        e.stopImmediatePropagation();
        upsell(feature);
        return;
      }
    },
    true
  );

  document.addEventListener('click', (e) => {
    if (e.target.closest('#plusChip')) upsell(null);
  });
  $('#plusBuy').addEventListener('click', buy);
  $('#plusRestore').addEventListener('click', restore);
  $('#plusManage').addEventListener('click', () => call('gestionar').catch(() => {}));
  $('#plusTrialGo').addEventListener('click', startTrial);
  $('#plusRefLogin').addEventListener('click', () => {
    $('#plusDialog').close();
    const b = document.querySelector('[data-cloud="crear"]');
    if (b) b.click();
  });
  $('#plusRefCopy').addEventListener('click', async () => {
    const input = $('#plusRefLink');
    try {
      await navigator.clipboard.writeText(input.value);
    } catch (e) {
      input.select();
      document.execCommand('copy');
    }
    app.toast('Enlace copiado. Pégalo en WhatsApp o en un correo para tus colegas.');
  });
  if ($('#plusCodeGo')) {
    $('#plusCodeGo').addEventListener('click', redeem);
    $('#plusCode').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        redeem();
      }
    });
  }
  // Precio y canje que se cambian en /admin.
  if (web) {
    web.onConfig(() => {
      if ($('#plusDialog').open) {
        $('#plusPrice').textContent = price();
        $('#plusBuy').textContent = `⭐ Suscribirme · ${price()}`;
        renderCode();
      }
    });
  }

  // Al volver a la app (por ejemplo, después de pagar o cancelar en Google Play).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refresh();
      checkCode();
      if (!account || Date.now() - (account.at || 0) > 3600000) syncAccount();
    }
  });

  Pro.plus = {
    launched,
    active,
    allows,
    upsell,
    refresh,
    syncAccount,
    account: () => (accountActive() ? account : null),
    onChange: (fn) => listeners.push(fn),
  };

  // Enlace con código (?codigo=CY-…), el que se copia en /admin: abre el cuadro
  // de Plus con el código ya escrito.
  if (web) {
    try {
      const url = new URL(location.href);
      const given = url.searchParams.get('codigo');
      if (given !== null) {
        url.searchParams.delete('codigo');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
        setTimeout(() => {
          upsell(null);
          if (!active() && $('#plusCode') && !$('#plusCodeBox').hidden) {
            // Viene con un código: lo importante es canjearlo, no pagar.
            $('#plusCode').value = given.slice(0, 24);
            $('#plusWebNote').hidden = true;
            $('#plusBuy').hidden = true;
            $('#plusCodeGo').classList.add('primary');
            $('#plusCodeGo').focus();
          }
        }, 400);
      }
    } catch (e) {
      /* sin enlace */
    }
  }

  changed();
  refresh();
  checkCode();
})();
