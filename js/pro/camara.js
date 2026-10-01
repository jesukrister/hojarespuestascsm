/*
 * Versión Pro · Escaneo continuo con la cámara: se apunta el celular a las
 * hojas, una tras otra, y cada hoja se lee y se guarda sola (con un sonido),
 * sin tomar fotos. Una hoja se guarda cuando dos cuadros seguidos dan la misma
 * lectura, y la misma hoja no se guarda dos veces en la sesión.
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  if (!Pro) return;
  const { app, $ } = Pro;
  const esc = app.esc;

  const READ_SIDE = 1600; // lado mayor del cuadro que se lee (rapidez vs. detalle)
  const PAUSE_MS = 120; // descanso entre lecturas (la lectura misma toma más)

  let stream = null;
  let running = false;
  let wakeLock = null;
  let torchOn = false;
  let pending = { sig: null, count: 0 };
  const seen = new Map(); // firma de la lectura → texto de la hoja guardada
  let saved = 0;
  let lastNoSheet = 0;
  let lastSaved = null;
  const frame = document.createElement('canvas');
  let audio = null;

  function setStatus(text, kind) {
    const el = $('#lvStatus');
    el.textContent = text;
    el.className = 'lv-status' + (kind ? ' ' + kind : '');
  }

  function beep() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.18, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.2);
    } catch (e) {
      /* sin sonido */
    }
    if (navigator.vibrate) navigator.vibrate(80);
    const box = $('#lvFrame');
    box.classList.remove('ok');
    void box.offsetWidth;
    box.classList.add('ok');
  }

  /** Firma de una lectura: código, respuestas y puntajes de desarrollo. */
  function signature(res, layout) {
    const ans = res.answers.map((a) => a.marked.join('+') || '-').join(',');
    const dev = (res.dev || []).map((d) => d.marked.join('+') || '-').join(',');
    return `${layout && layout.pie ? 'pie' : 'n'}|${res.id.value || ''}|${ans}|${dev}`;
  }

  function friendlyError(res) {
    const e = res.error || '';
    if (/cuatro marcas negras/.test(e)) return 'Buscando la hoja… que se vean sus cuatro esquinas negras.';
    if (/otra prueba|versión PIE|casilla/.test(e)) return '⚠️ ' + e;
    if (/alineadas|doblada/.test(e)) return 'Hoja curvada o movida: déjala plana y quieta.';
    return 'Ajusta la hoja: completa, plana, bien iluminada y quieta.';
  }

  async function tick() {
    if (!running) return;
    const video = $('#lvVideo');
    try {
      if (video.readyState >= 2 && video.videoWidth) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        const s = Math.min(1, READ_SIDE / Math.max(w, h));
        frame.width = Math.round(w * s);
        frame.height = Math.round(h * s);
        frame.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, frame.width, frame.height);
        const { res, layout } = app.readFrame(frame);
        await handle(res, layout);
      }
    } catch (e) {
      console.error(e);
    }
    if (running) setTimeout(tick, PAUSE_MS);
  }

  async function handle(res, layout) {
    if (!res.ok) {
      pending = { sig: null, count: 0 };
      lastSaved = null;
      if (!/cuatro marcas negras/.test(res.error || '') || Date.now() - lastNoSheet > 1500) {
        setStatus(friendlyError(res), /otra prueba|PIE|casilla/.test(res.error || '') ? 'warn' : '');
      }
      if (/cuatro marcas negras/.test(res.error || '')) lastNoSheet = Date.now();
      return;
    }
    const sig = signature(res, layout);
    if (seen.has(sig)) {
      if (sig === lastSaved) return; // sigue delante la hoja recién guardada: se mantiene el ✓
      setStatus(`Esta hoja ya se guardó (${seen.get(sig)}). Pon la siguiente.`, 'done');
      return;
    }
    if (pending.sig !== sig) {
      pending = { sig, count: 1 };
      setStatus('Leyendo… mantén la hoja quieta.', 'reading');
      return;
    }
    pending.count++;
    if (pending.count < 2) return;
    // Dos lecturas iguales seguidas: se guarda (con una copia del cuadro como foto).
    const copy = document.createElement('canvas');
    copy.width = frame.width;
    copy.height = frame.height;
    copy.getContext('2d').drawImage(frame, 0, 0);
    saved++;
    const record = await app.addFrameResult(res, layout, copy, `Cámara · hoja ${saved}`);
    const g = app.grade(record);
    const who = [record.code ? `N° ${record.code}` : '', app.displayName(record)].filter(Boolean).join(' · ') || `hoja ${saved}`;
    seen.set(sig, who);
    lastSaved = sig;
    pending = { sig: null, count: 0 };
    beep();
    const review = app.needsReview(record) ? ' (revisar)' : '';
    setStatus(`✓ ${who}${record.pie ? ' (PIE)' : ''} · nota ${app.fmt(g.grade, 1)}${review}. Pon la siguiente.`, 'done');
    $('#lvCount').textContent = String(saved);
    const li = document.createElement('li');
    li.innerHTML = `<b>${esc(who)}</b> · ${g.correct}/${g.items.length - g.excluded} · nota ${esc(app.fmt(g.grade, 1))}${review ? ' <span class="tag warn">revisar</span>' : ''}`;
    $('#lvList').prepend(li);
  }

  async function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return app.toast('Este navegador no permite usar la cámara en vivo: usa «Tomar foto».');
    }
    if (!app.getLayout()) return app.toast('Revisa la configuración de la prueba (pestaña Prueba).');
    const dlg = $('#proLiveDialog');
    saved = 0;
    seen.clear();
    lastSaved = null;
    pending = { sig: null, count: 0 };
    $('#lvCount').textContent = '0';
    $('#lvList').innerHTML = '';
    setStatus('Abriendo la cámara…');
    dlg.showModal();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
    } catch (e) {
      console.error(e);
      setStatus(
        e && e.name === 'NotAllowedError'
          ? 'No hay permiso para usar la cámara: permítelo en el navegador (o en los ajustes de la app) y vuelve a intentarlo.'
          : 'No se pudo abrir la cámara: ' + ((e && e.message) || e),
        'warn'
      );
      return;
    }
    const video = $('#lvVideo');
    video.srcObject = stream;
    // El recuadro guía queda sobre la imagen (no sobre las franjas negras).
    video.onloadedmetadata = () => fitBox();
    try {
      await video.play();
    } catch (e) {
      /* algunos navegadores reproducen solos */
    }
    const track = stream.getVideoTracks()[0];
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    $('#lvTorch').hidden = !caps.torch;
    torchOn = false;
    try {
      if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {
      wakeLock = null;
    }
    if (!app.state.exam.key.some((k) => k !== null)) app.toast('Aún no hay clave de respuestas: se leerán las marcas, pero no se podrá calificar.');
    setStatus('Pon una hoja frente a la cámara, completa y plana.');
    running = true;
    tick();
  }

  function fitBox() {
    const video = $('#lvVideo');
    const box = $('#lvBox');
    const stage = box.parentElement;
    if (!video.videoWidth) return;
    box.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    // Más ancha que el espacio disponible: se ajusta al ancho; si no, al alto.
    box.classList.toggle('wide', video.videoWidth / video.videoHeight > stage.clientWidth / Math.max(1, stage.clientHeight));
  }
  window.addEventListener('resize', () => {
    if (running) fitBox();
  });

  function stop() {
    running = false;
    if (stream) for (const t of stream.getTracks()) t.stop();
    stream = null;
    $('#lvVideo').srcObject = null;
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
    if (saved) {
      app.toast(`${saved} hoja(s) leída(s) con la cámara.`);
      app.renderResultsBadge();
    }
  }

  $('#proLiveScan').addEventListener('click', start);
  $('#lvDone').addEventListener('click', () => $('#proLiveDialog').close());
  $('#proLiveDialog').addEventListener('close', stop);
  $('#lvTorch').addEventListener('click', async () => {
    const track = stream && stream.getVideoTracks()[0];
    if (!track) return;
    try {
      torchOn = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: torchOn }] });
      $('#lvTorch').setAttribute('aria-pressed', String(torchOn));
    } catch (e) {
      app.toast('No se pudo encender la linterna.');
    }
  });

  Pro.live = { start, stop, signature };
})();
