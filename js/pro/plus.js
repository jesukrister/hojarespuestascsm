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
 * (js/web.js). La app de Android no usa códigos: sigue con Google Play.
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

  function preview() {
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

  const launched = () => !!CFG.corrigeya;
  const active = () => preview() || !!play.activa || codeActive();
  /** ¿Se puede usar esa función? Antes del lanzamiento, todo menos la agenda es gratis. */
  const allows = (feature) => active() || (!launched() && feature !== 'agenda');
  const webConfig = () => (web && web.config()) || null;
  const price = () => (native ? play.precio : webConfig() && webConfig().precioTexto) || CFG.plusPrecio || '$1.990 al mes';

  const WHY = {
    excel: 'Descargar el Excel y las evidencias es parte de CorrigeYa Plus.',
    informes: 'Los informes por estudiante y para UTP son parte de CorrigeYa Plus.',
    nube: 'Guardar en la nube (y usar la app en el celular y el computador) es parte de CorrigeYa Plus.',
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
    if (!dlg.open) dlg.showModal();
  }

  /* ---------- Códigos de CorrigeYa Plus (sólo en la web) ---------- */

  const fecha = (t) => new Date(t).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
  function renderCode() {
    const box = $('#plusCodeBox');
    const info = $('#plusCodeInfo');
    if (!box || !info) return;
    const cfg = webConfig();
    box.hidden = !web || active() || (cfg && cfg.canje === false);
    info.hidden = !codeActive();
    if (codeActive()) {
      info.textContent = `Plus activo en este navegador con el código ${code.codigo || ''}${code.hasta ? `, hasta el ${fecha(code.hasta)}` : ''}.`;
    }
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
      const r = await web.pedir('/plus/canjear', { codigo: value, equipo: web.equipo() });
      code = { token: r.token, codigo: r.codigo, hasta: r.hasta, at: Date.now() };
      saveCode();
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
      play = { activa: !!r.activa, precio: r.precio || play.precio || '', at: Date.now() };
      savePlay();
      if (was !== play.activa) changed();
      else renderChip();
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
        play = Object.assign({}, play, { activa: true, at: Date.now() });
        savePlay();
        changed();
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
    ['[data-cloud="crear"], [data-cloud="entrar"]', 'nube'],
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
    }
  });

  Pro.plus = {
    launched,
    active,
    allows,
    upsell,
    refresh,
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
