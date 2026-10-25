/*
 * Versión Pro · Nube (opcional): cuenta con correo y contraseña para que los
 * cursos, el libro de notas y la prueba con sus resultados se guarden solos en
 * internet y aparezcan en otro equipo al entrar con la misma cuenta.
 *  - Crear cuenta y «Olvidé mi contraseña»: llega un código al correo.
 *  - Se sincroniza al abrir, unos segundos después de cada cambio, al salir de
 *    la app y cada 5 minutos. Los cambios de dos equipos se combinan (nube-core.js).
 *  - La prueba se lee al abrir la página: si cambió en otro equipo mientras se
 *    trabaja, aparece un aviso para actualizar (no se recarga sola).
 *  - Las imágenes de las hojas escaneadas no se suben: quedan en cada equipo.
 * El servidor es nube/lector-nube.mjs (Cloudflare); ver nube/GUIA.md.
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  const N = window.NubeCore;
  const C = window.CopiasCore;
  if (!Pro || !N || !C) return;
  const { app, L, kv, $ } = Pro;
  const esc = app.esc;
  const state = app.state;

  // Dirección del servidor. Cuando haya dominio propio, se cambia aquí.
  const DEFAULT_URL = 'https://lector-nube.colegiosmiqq.workers.dev';
  const serverUrl = () => {
    try {
      return localStorage.getItem('lectorHojasPro.nubeUrl') || DEFAULT_URL;
    } catch (e) {
      return DEFAULT_URL;
    }
  };
  const META_KEY = 'nube';
  const BASE_KEY = (name) => 'nube:base:' + name;
  const MSG_KEY = 'lectorHojasPro.msg';
  const APPLIED_KEY = 'lectorHojasPro.nubeAplicada';
  const PUSH_DELAY = 8000;
  const POLL_EVERY = 5 * 60000;
  const inApp = () => !!window.NativeApp || document.documentElement.classList.contains('native-app');
  const device = () => (inApp() ? 'App Android' : /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Navegador del celular' : 'Computador');

  let meta = null; // { correo, sesion, docs: { libro: { version, hash } }, at, error }
  const bases = {};
  let assets = {}; // imágenes de las preguntas de la prueba actual
  let syncing = null;
  let again = false;
  let timer = null;
  let behind = false; // la prueba cambió en otro equipo
  let offline = false;
  let firstDone = false;
  let reloadMsg = '';
  let pendingState = null; // prueba ya escrita para leerla al recargar
  let bannerLater = false;
  let reloading = false;

  const api = () => N.Api(serverUrl(), { token: meta && meta.sesion, device: device() });
  const signedIn = () => !!(meta && meta.sesion);

  async function saveMeta() {
    try {
      if (meta) await kv.put(META_KEY, meta);
      else await kv.del(META_KEY);
    } catch (e) {
      console.error(e);
    }
  }

  /* ---------- Documentos ---------- */

  const stateText = () => JSON.stringify({ exam: state.exam, results: state.results });
  const parse = (t) => {
    try {
      return JSON.parse(t);
    } catch (e) {
      return null;
    }
  };
  function sortedJson(obj) {
    const out = {};
    for (const k of Object.keys(obj).sort()) out[k] = obj[k];
    return JSON.stringify(out);
  }
  async function loadAssets() {
    const out = {};
    for (const el of (state.exam.doc && state.exam.doc.elements) || []) {
      if (!el || el.type !== 'image') continue;
      const v = await app.assetStore.get(el.id);
      if (typeof v === 'string') out[el.id] = v;
    }
    assets = out;
  }

  function stateEmpty(text) {
    const d = parse(text);
    if (!d || !d.exam) return true;
    const e = d.exam;
    return !(d.results || []).length && !(e.key || []).some((k) => k !== null && k !== undefined) && !String(e.title || '').trim() && !String((e.doc && e.doc.text) || '').trim();
  }

  /** Pregunta qué prueba usar cuando este equipo y la nube tienen pruebas distintas. */
  async function choosePrueba(local, remote) {
    const desc = (s) => `«${esc(String((s.exam && s.exam.title) || '').trim() || 'Prueba sin título')}» con ${(s.results || []).length} hoja(s) escaneada(s)`;
    const cloud = await Pro.confirm({
      title: 'Hay otra prueba en la nube',
      html: `<p>En la nube está la prueba ${desc(remote)}, guardada desde otro equipo.</p><p>En este equipo tienes ${desc(local)}.</p><p>¿Cuál quieres usar? La otra no se pierde: queda en <b>Cursos → 🕘 Copias automáticas</b>.</p>`,
      ok: 'Usar la de la nube',
      cancel: 'Dejar la de este equipo',
    });
    return cloud ? 'remote' : 'local';
  }

  async function keepCopyOf(st, reason) {
    if (!Pro.copies) return;
    const text = C.serialize(st, Pro.book);
    const sum = C.summary({ state: st, book: Pro.book });
    if (C.hasData(sum)) await Pro.copies.storeCopy(text, C.hash(text), sum, C.REASONS[reason] || reason);
  }

  function docs({ pruebaPushOnly }) {
    return [
      {
        name: 'libro',
        read: () => JSON.stringify(Pro.book),
        isEmpty: (t) => !((parse(t) || {}).courses || []).length,
        merge: (b, l, r) => ({ value: L.sanitizeBook(N.mergeBook(b, l, r)), lost: false }),
        apply: async (text) => {
          if (Pro.book.courses.length && Pro.safetyCopy) await Pro.safetyCopy('nube');
          Pro.book = L.sanitizeBook(parse(text));
          await Pro.saveBook();
          Pro.renderAll();
          return JSON.stringify(Pro.book);
        },
      },
      {
        name: 'recursos',
        read: () => sortedJson(assets),
        isEmpty: (t) => !Object.keys(parse(t) || {}).length,
        merge: (b, l, r) => ({ value: N.mergeAssets(b, l, r), lost: false }),
        apply: async (text) => {
          for (const [id, v] of Object.entries(parse(text) || {})) {
            if (typeof v === 'string' && v.startsWith('data:image/') && !assets[id]) await app.assetStore.put(id, v);
          }
          return sortedJson(assets);
        },
      },
      {
        name: 'prueba',
        pushOnly: pruebaPushOnly,
        read: () => pendingState || stateText(),
        isEmpty: stateEmpty,
        merge: async (b, l, r) => {
          const m = N.mergeState(b, l, r);
          if (!m.lost) return { value: m.state, lost: false };
          if (!N.sameTest(l.exam, r.exam) && !stateEmpty(JSON.stringify(r))) {
            if ((await choosePrueba(l, r)) === 'remote') return { value: { exam: r.exam, results: r.results || [] }, lost: false };
            await keepCopyOf(r, 'nubeOtra');
            return { value: m.state, lost: false };
          }
          // Misma prueba cambiada en los dos equipos: queda la de este equipo y la otra en una copia.
          await keepCopyOf(r, 'nubeOtra');
          return { value: m.state, lost: false };
        },
        apply: async (text) => {
          if (!stateEmpty(stateText()) && Pro.safetyCopy) await Pro.safetyCopy('nube');
          localStorage.setItem(app.STORE_KEY, text);
          pendingState = text;
          try {
            sessionStorage.setItem(APPLIED_KEY, '1');
          } catch (e) {
            /* sin aviso */
          }
          reloadMsg = 'Se trajo la prueba más reciente desde la nube.';
        },
      },
    ];
  }

  /* ---------- Sincronizar ---------- */

  async function runSync({ pruebaPushOnly }) {
    await Pro.ready;
    await loadAssets();
    const a = api();
    const list = await a.list();
    if (list.correo && meta.correo !== list.correo) meta.correo = list.correo;
    meta.docs = meta.docs || {};
    let changedPrueba = false;
    behind = false;
    for (const doc of docs({ pruebaPushOnly })) {
      if (bases[doc.name] === undefined) bases[doc.name] = (await kv.get(BASE_KEY(doc.name)).catch(() => '')) || '';
      const remote = (list.docs || {})[doc.name];
      const res = await N.syncDoc(a, doc, meta.docs[doc.name], bases[doc.name], remote ? remote.version : 0);
      meta.docs[doc.name] = res.meta;
      if (res.baseText !== bases[doc.name]) {
        bases[doc.name] = res.baseText;
        await kv.put(BASE_KEY(doc.name), res.baseText).catch((e) => console.error(e));
      }
      if (res.behind) behind = true;
      if (doc.name === 'prueba' && res.pulled) changedPrueba = true;
      await saveMeta();
    }
    meta.at = Date.now();
    meta.error = '';
    await saveMeta();
    return { changedPrueba };
  }

  async function sync({ pruebaPushOnly = true, quiet = true } = {}) {
    if (!signedIn() || reloading) return;
    if (syncing) {
      again = true;
      return syncing;
    }
    clearTimeout(timer);
    render('busy');
    syncing = (async () => {
      try {
        const { changedPrueba } = await runSync({ pruebaPushOnly });
        offline = false;
        if (changedPrueba) {
          try {
            sessionStorage.setItem(MSG_KEY, reloadMsg || 'Se trajeron los cambios de la nube.');
          } catch (e) {
            /* sin aviso */
          }
          reloading = true;
          location.reload();
          return;
        }
        if (!behind) await countAsBackup();
        if (!quiet) app.toast(behind ? 'Tus cambios están guardados. La prueba cambió en otro equipo: presiona «Actualizar la prueba».' : 'Listo: todo está guardado en la nube.');
      } catch (e) {
        if (!(e instanceof N.CloudError)) console.error(e);
        offline = !!(e.data && e.data.offline);
        if (e.data && e.data.salir) {
          meta = { correo: meta.correo, sesion: '', docs: {}, expired: true };
          await saveMeta();
        } else if (meta && !offline) {
          meta.error = e.message;
          await saveMeta();
        }
        if (!quiet || (e.data && e.data.salir)) app.toast(e.message);
      } finally {
        syncing = null;
        firstDone = true;
        render();
        renderBanner();
        if (again) {
          again = false;
          schedule(1000);
        } else schedule(POLL_EVERY);
      }
    })();
    return syncing;
  }

  function schedule(ms) {
    clearTimeout(timer);
    if (signedIn()) timer = setTimeout(() => sync(), ms);
  }

  /** Con todo guardado en la nube, cuenta como respaldo (no aparece el recordatorio). */
  async function countAsBackup() {
    const h = C.hash(C.serialize(state, Pro.book));
    if (Pro.settings.lastBackupHash === h || !Pro.backup) return;
    await Pro.backup.markBackedUp(new Date(), h);
  }

  /** Actualiza la prueba con la de la nube (combina con los cambios de este equipo y recarga). */
  async function updateNow() {
    render('busy');
    await sync({ pruebaPushOnly: false, quiet: false });
  }

  /* ---------- Pantalla ---------- */

  function ago(ts) {
    const min = Math.round((Date.now() - ts) / 60000);
    if (min < 1) return 'recién';
    if (min < 60) return `hace ${min} min`;
    return app.fmtDateTime(ts);
  }

  function render(mode) {
    const out = $('#proCloudOut');
    if (!out) return;
    const on = signedIn();
    out.hidden = on;
    $('#proCloudIn').hidden = !on;
    $('#proCloudExpired').hidden = !(meta && meta.expired && !on);
    if (!on) return;
    $('#proCloudEmail').textContent = meta.correo || '';
    const st = $('#proCloudStatus');
    let text;
    let cls = 'pro-cloud-status';
    if (mode === 'busy' || syncing) text = '🔄 Guardando en la nube…';
    else if (offline) {
      text = '⚠️ Sin conexión a internet: los cambios se guardan en este equipo y se subirán a la nube cuando vuelva la conexión.';
      cls += ' warn';
    } else if (meta.error) {
      text = '⚠️ ' + meta.error;
      cls += ' warn';
    } else if (behind) {
      text = '⚠️ La prueba cambió en otro equipo: presiona «Actualizar la prueba» para traer esos cambios.';
      cls += ' warn';
    } else if (meta.at) text = `✔️ Todo guardado en la nube (${ago(meta.at)}).`;
    else text = 'Conectando…';
    st.textContent = text;
    st.className = cls;
    $('#proCloudUpdate').hidden = !behind;
  }

  function renderBanner() {
    const b = $('#proCloudBanner');
    if (b) b.hidden = !(signedIn() && behind) || bannerLater;
  }

  /* ---------- Cuenta: crear, entrar, olvidé mi contraseña ---------- */

  const dlg = () => $('#proCloudDialog');
  let flow = { step: 'entrar', email: '', reason: 'crear' };

  function pwFields(label) {
    return `<label>${label}
        <input id="pcl-pass" type="password" autocomplete="new-password" minlength="6" maxlength="200" required>
      </label>
      <label>Repite la contraseña
        <input id="pcl-pass2" type="password" autocomplete="new-password" minlength="6" maxlength="200" required>
      </label>
      <label class="choice pcl-show"><input type="checkbox" id="pcl-showpw"><span>Mostrar la contraseña</span></label>
      <p class="muted small">Al menos 6 letras o números. Anótala en un lugar seguro.</p>`;
  }

  function renderDialog(error) {
    const body = $('#proCloudBody');
    const f = flow;
    const title = { crear: 'Crear cuenta en la nube', entrar: 'Entrar a la nube', recuperar: 'Olvidé mi contraseña', borrar: 'Borrar mi cuenta' };
    $('#proCloudTitle').textContent = title[f.step === 'codigo' ? f.reason : f.step];
    let html = '';
    let ok = 'Continuar';
    let danger = false;
    if (f.step === 'crear' || f.step === 'recuperar') {
      html = `${
        f.step === 'crear'
          ? '<p>Con una cuenta, tus cursos, notas y pruebas se guardan solos en internet. Si cambias o pierdes el equipo, entras con tu correo y contraseña y aparece todo.</p>'
          : '<p>Te enviaremos un código a tu correo para que elijas una contraseña nueva.</p>'
      }
        <label>Tu correo
          <input id="pcl-email" type="email" autocomplete="email" inputmode="email" maxlength="200" required value="${esc(f.email)}" placeholder="nombre@gmail.com">
        </label>
        <p class="muted small">Te llegará un correo con un código de 6 números.</p>`;
      ok = 'Enviarme el código';
    } else if (f.step === 'codigo') {
      html = `<p>Te enviamos un código de 6 números a <b>${esc(f.email)}</b>. Si no aparece en unos minutos, revisa la carpeta <i>Spam</i> o <i>Promociones</i>.</p>
        <label>Código
          <input id="pcl-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="7" required placeholder="123456">
        </label>
        ${pwFields(f.reason === 'crear' ? 'Elige una contraseña' : 'Contraseña nueva')}
        <p><button type="button" class="link-btn" data-cl="resend">Enviar otro código</button></p>`;
      ok = f.reason === 'crear' ? 'Crear cuenta' : 'Guardar la contraseña';
    } else if (f.step === 'entrar') {
      html = `<label>Tu correo
          <input id="pcl-email" type="email" autocomplete="email" inputmode="email" maxlength="200" required value="${esc(f.email)}" placeholder="nombre@gmail.com">
        </label>
        <label>Contraseña
          <input id="pcl-pass" type="password" autocomplete="current-password" maxlength="200" required>
        </label>
        <label class="choice pcl-show"><input type="checkbox" id="pcl-showpw"><span>Mostrar la contraseña</span></label>
        <p><button type="button" class="link-btn" data-cl="forgot">Olvidé mi contraseña</button> · <button type="button" class="link-btn" data-cl="create">Crear una cuenta</button></p>`;
      ok = 'Entrar';
    } else if (f.step === 'borrar') {
      html = `<p>Se borrarán de la nube tu cuenta (<b>${esc(f.email)}</b>) y todos los datos guardados ahí. <b>Los datos de este equipo no se borran.</b> En tus otros equipos se cerrará la sesión.</p>
        <label>Escribe tu contraseña para confirmar
          <input id="pcl-pass" type="password" autocomplete="current-password" maxlength="200" required>
        </label>
        <p class="muted small">¿No recuerdas la contraseña? Puedes borrarla con un código en <a href="${esc(serverUrl())}/borrar-cuenta" target="_blank" rel="noopener">esta página</a>.</p>`;
      ok = 'Borrar mi cuenta';
      danger = true;
    }
    body.innerHTML = html + `<p class="alert warn pcl-error"${error ? '' : ' hidden'}>${esc(error || '')}</p>`;
    const okBtn = $('#proCloudOk');
    okBtn.textContent = ok;
    okBtn.disabled = false;
    okBtn.classList.toggle('danger-fill', danger);
    setTimeout(() => {
      const first = body.querySelector('input:not([type=checkbox])');
      if (first && !first.value) first.focus();
      else if (body.querySelectorAll('input:not([type=checkbox])')[1]) body.querySelectorAll('input:not([type=checkbox])')[1].focus();
    }, 30);
  }

  function openDialog(step) {
    flow = { step, email: (meta && meta.correo) || '', reason: step === 'recuperar' ? 'recuperar' : 'crear' };
    renderDialog();
    if (!dlg().open) dlg().showModal();
  }

  const val = (id) => {
    const el = $('#' + id);
    return el ? el.value : '';
  };

  function readPasswords() {
    const p = val('pcl-pass');
    if (p.length < 6) throw new Error('La contraseña debe tener al menos 6 letras o números.');
    if (p !== val('pcl-pass2')) throw new Error('Las dos contraseñas no son iguales. Escríbelas de nuevo.');
    return p;
  }

  async function signedInWith(res) {
    meta = { correo: res.correo, sesion: res.sesion, docs: {}, at: 0 };
    for (const name of Object.keys(bases)) delete bases[name];
    for (const name of ['libro', 'recursos', 'prueba']) await kv.del(BASE_KEY(name)).catch(() => {});
    await saveMeta();
    dlg().close();
    render('busy');
    app.toast(res.nueva ? 'Cuenta creada. Tus datos se están guardando en la nube.' : 'Listo: entraste a la nube.');
    await sync({ pruebaPushOnly: false, quiet: true });
  }

  async function submit() {
    const f = flow;
    const okBtn = $('#proCloudOk');
    okBtn.disabled = true;
    try {
      const a = N.Api(serverUrl(), { device: device() });
      if (f.step === 'crear' || f.step === 'recuperar') {
        const email = N.normEmail(val('pcl-email'));
        if (!N.validEmail(email)) throw new Error('Escribe tu correo completo, por ejemplo nombre@gmail.com.');
        f.email = email;
        f.reason = f.step;
        await a.requestCode(email, f.step);
        f.step = 'codigo';
        renderDialog();
      } else if (f.step === 'codigo') {
        const code = val('pcl-code').replace(/\D/g, '');
        if (code.length !== 6) throw new Error('El código tiene 6 números. Revisa el correo.');
        const pw = readPasswords();
        await signedInWith(await a.setPassword(f.email, f.reason, code, pw));
      } else if (f.step === 'entrar') {
        const email = N.normEmail(val('pcl-email'));
        if (!N.validEmail(email)) throw new Error('Escribe tu correo completo, por ejemplo nombre@gmail.com.');
        f.email = email;
        const pw = val('pcl-pass');
        if (!pw) throw new Error('Escribe tu contraseña.');
        await signedInWith(await a.login(email, pw));
      } else if (f.step === 'borrar') {
        const pw = val('pcl-pass');
        if (!pw) throw new Error('Escribe tu contraseña.');
        await N.Api(serverUrl(), { token: meta.sesion }).deleteAccount(meta.correo, pw);
        await forget();
        dlg().close();
        app.toast('Tu cuenta y tus datos en la nube fueron borrados. Los datos de este equipo siguen aquí.');
      }
    } catch (e) {
      if (!(e instanceof N.CloudError) && !/contraseña|correo|código/i.test(e.message)) console.error(e);
      if (e.data && e.data.existe && f.step === 'crear') {
        f.step = 'entrar';
        renderDialog(e.message);
        return;
      }
      const err = $('.pcl-error', dlg());
      if (err) {
        err.textContent = e.message;
        err.hidden = false;
      }
      okBtn.disabled = false;
    }
  }

  /** Cierra la sesión en este equipo (los datos quedan aquí). */
  async function forget(keepEmail) {
    clearTimeout(timer);
    meta = keepEmail && meta ? { correo: meta.correo, sesion: '', docs: {} } : null;
    behind = false;
    for (const name of Object.keys(bases)) delete bases[name];
    for (const name of ['libro', 'recursos', 'prueba']) await kv.del(BASE_KEY(name)).catch(() => {});
    await saveMeta();
    render();
    renderBanner();
  }

  async function signOut() {
    const ok = await Pro.confirm({
      title: 'Cerrar sesión de la nube',
      html: '<p>Los datos de este equipo no se borran, pero los cambios que hagas aquí ya no se guardarán en la nube.</p><p>Los datos que están en la nube siguen ahí: vuelve a entrar cuando quieras.</p>',
      ok: 'Cerrar sesión',
    });
    if (!ok) return;
    if (syncing) await syncing;
    await forget(true);
    app.toast('Sesión cerrada. Los datos siguen en este equipo.');
  }

  /* ---------- Eventos ---------- */

  const changed = () => {
    if (signedIn() && firstDone) schedule(PUSH_DELAY);
  };
  app.on('save', changed);
  app.on('results', changed);
  app.on('resultsCleared', changed);
  const saveBook = Pro.saveBook;
  Pro.saveBook = (...args) => {
    changed();
    return saveBook(...args);
  };
  document.addEventListener('visibilitychange', () => {
    if (!signedIn() || !firstDone) return;
    if (document.visibilityState === 'hidden') sync();
    else if (!meta.at || Date.now() - meta.at > 60000) sync();
  });
  window.addEventListener('online', () => {
    if (signedIn() && firstDone) sync();
  });

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cloud]');
    if (b) {
      const what = b.dataset.cloud;
      if (what === 'crear' || what === 'entrar') openDialog(what);
      else if (what === 'sync') sync({ quiet: false });
      else if (what === 'update') updateNow();
      else if (what === 'salir') signOut();
      else if (what === 'borrar') openDialog('borrar');
      else if (what === 'later') {
        bannerLater = true;
        renderBanner();
      }
      return;
    }
    const c = e.target.closest('[data-cl]');
    if (!c || !c.closest('#proCloudDialog')) return;
    const email = val('pcl-email') || flow.email;
    if (c.dataset.cl === 'forgot') flow = { step: 'recuperar', email, reason: 'recuperar' };
    else if (c.dataset.cl === 'create') flow = { step: 'crear', email, reason: 'crear' };
    else if (c.dataset.cl === 'resend') flow = { step: flow.reason, email: flow.email, reason: flow.reason };
    renderDialog();
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'pcl-showpw') return;
    for (const id of ['pcl-pass', 'pcl-pass2']) {
      const el = $('#' + id);
      if (el) el.type = e.target.checked ? 'text' : 'password';
    }
  });
  $('#proCloudOk').addEventListener('click', submit);
  $('#proCloudBody').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
      e.preventDefault();
      submit();
    }
  });
  app.on('tab', (name) => {
    if (name === 'cursos') render();
  });

  Pro.ready.then(async () => {
    try {
      meta = (await kv.get(META_KEY)) || null;
    } catch (e) {
      meta = null;
    }
    render();
    if (!signedIn()) {
      firstDone = true;
      return;
    }
    // Recién traída la prueba de la nube: así quedó al abrirla (no es un cambio de este equipo).
    let applied = false;
    try {
      applied = sessionStorage.getItem(APPLIED_KEY) === '1';
      sessionStorage.removeItem(APPLIED_KEY);
    } catch (e) {
      applied = false;
    }
    if (applied && meta.docs && meta.docs.prueba) {
      meta.docs.prueba.hash = N.hash(stateText());
      await saveMeta();
    }
    // Al abrir se trae todo (también la prueba, porque aún no se ha trabajado en ella).
    await sync({ pruebaPushOnly: applied, quiet: true });
  });

  Pro.cloud = { sync, signedIn, status: () => ({ meta, behind, offline }) };
})();
