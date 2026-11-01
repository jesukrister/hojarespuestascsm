/*
 * Panel /admin de CorrigeYa: configuración de la página, códigos de Plus y
 * estadísticas de uso de la web. Todo se guarda en el servidor de la nube
 * (nube/lector-nube.mjs); la contraseña es el secreto ADMIN_CLAVE de Cloudflare.
 */
(function () {
  'use strict';
  // El panel no se abre dentro de otra página (evita trampas de clics).
  if (window.top !== window.self) {
    document.documentElement.textContent = '';
    return;
  }

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const miles = (n) => Math.round(Number(n) || 0).toLocaleString('es-CL');
  const CFG = window.LANZAMIENTO || {};

  const SESION_KEY = 'corrigeyaAdmin.sesion';
  const SERVIDOR_KEY = 'corrigeyaAdmin.servidor';
  const VISTA_KEY = 'corrigeyaAdmin.vista';

  const leer = (store, k) => {
    try {
      return store.getItem(k);
    } catch (e) {
      return null;
    }
  };
  const escribir = (store, k, v) => {
    try {
      if (v === null) store.removeItem(k);
      else store.setItem(k, v);
    } catch (e) {
      /* sin almacenamiento */
    }
  };

  let servidor = (leer(localStorage, SERVIDOR_KEY) || CFG.servidor || 'https://lector-nube.colegiosmiqq.workers.dev').replace(/\/+$/, '');
  let sesion = null;

  /* ---------- Conexión con el servidor ---------- */

  async function api(ruta, datos) {
    const headers = {};
    if (sesion) headers.Authorization = 'Bearer ' + sesion.token;
    if (datos !== undefined) headers['Content-Type'] = 'application/json';
    let r;
    try {
      r = await fetch(servidor + ruta, { method: datos === undefined ? 'GET' : 'POST', headers, body: datos === undefined ? undefined : JSON.stringify(datos) });
    } catch (e) {
      throw new Error('No hay conexión con el servidor. Revisa tu internet o la dirección del servidor.');
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (r.status === 401 && j.salir) salir('La sesión venció. Vuelve a entrar.');
      const e = new Error(j.error || `El servidor respondió con un error (${r.status}).`);
      e.status = r.status;
      throw e;
    }
    return j;
  }

  /* ---------- Sesión ---------- */

  function guardarSesion(s, recordar) {
    sesion = s;
    escribir(sessionStorage, SESION_KEY, JSON.stringify(s));
    escribir(localStorage, SESION_KEY, recordar ? JSON.stringify(s) : null);
  }
  function sesionGuardada() {
    for (const store of [sessionStorage, localStorage]) {
      try {
        const s = JSON.parse(leer(store, SESION_KEY) || 'null');
        if (s && s.token && s.vence > Date.now()) return s;
      } catch (e) {
        /* nada */
      }
    }
    return null;
  }
  function salir(mensaje) {
    sesion = null;
    escribir(sessionStorage, SESION_KEY, null);
    escribir(localStorage, SESION_KEY, null);
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#loginError').textContent = mensaje || '';
    $('#loginClave').value = '';
    $('#loginClave').focus();
  }

  $('#loginServidor').value = servidor;
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn');
    const url = $('#loginServidor').value.trim().replace(/\/+$/, '');
    if (!/^(https:\/\/[^\s/]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$))/.test(url)) {
      $('#loginError').textContent = 'La dirección del servidor debe empezar con https://';
      return;
    }
    servidor = url;
    escribir(localStorage, SERVIDOR_KEY, url === CFG.servidor ? null : url);
    btn.disabled = true;
    $('#loginError').textContent = '';
    $('#loginAyuda').hidden = true;
    try {
      sesion = null;
      const r = await api('/admin/entrar', { clave: $('#loginClave').value });
      guardarSesion({ token: r.token, vence: r.vence }, $('#loginRecordar').checked);
      entrar();
    } catch (err) {
      $('#loginError').textContent = err.message;
      if (err.status === 503 && /ADMIN_CLAVE/.test(err.message)) $('#loginAyuda').hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
  $('#salirBtn').addEventListener('click', () => salir());

  // La sesión dura 12 horas: al vencer, se vuelve a pedir la contraseña.
  setInterval(() => {
    if (sesion && sesion.vence < Date.now()) salir('La sesión terminó (12 horas). Vuelve a entrar.');
  }, 60000);

  /* ---------- Navegación ---------- */

  const NOMBRES = { resumen: 'Resumen', uso: 'Uso de la página', codigos: 'Códigos Plus', config: 'Configuración', app: 'App Android', servidor: 'Servidor' };
  let vista = 'resumen';

  function ir(v) {
    if (!NOMBRES[v]) v = 'resumen';
    vista = v;
    escribir(localStorage, VISTA_KEY, v);
    for (const b of $$('[data-view]')) b.classList.toggle('is-active', b.dataset.view === v);
    for (const p of $$('[data-panel]')) p.hidden = p.dataset.panel !== v;
    $('#sideActual').textContent = NOMBRES[v];
    $('.side').classList.remove('is-open');
    $('#menuBtn').setAttribute('aria-expanded', 'false');
    $('#mainError').hidden = true;
    cargar(v);
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (b) ir(b.dataset.view);
    const a = e.target.closest('[data-ir]');
    if (a) {
      e.preventDefault();
      ir(a.dataset.ir);
    }
    if (e.target.closest('[data-recargar]')) cargar(vista, true);
  });
  $('#menuBtn').addEventListener('click', () => {
    const abierto = $('.side').classList.toggle('is-open');
    $('#menuBtn').setAttribute('aria-expanded', String(abierto));
  });

  function mostrarError(err) {
    if (!sesion) return;
    const p = $('#mainError');
    p.textContent = err.message || String(err);
    p.hidden = false;
  }

  function toast(texto) {
    const t = $('#toast');
    t.textContent = texto;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (t.hidden = true), 3200);
  }

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      toast('Copiado ✔');
    } catch (e) {
      prompt('Copia el texto:', texto);
    }
  }

  async function cargar(v) {
    try {
      if (v === 'resumen') await cargarResumen();
      else if (v === 'uso') await cargarUso();
      else if (v === 'codigos') await cargarCodigos();
      else if (v === 'config') await cargarConfig();
      else if (v === 'servidor') await cargarServidor();
    } catch (err) {
      mostrarError(err);
    }
  }

  /* ---------- Días y cifras de uso ---------- */

  function listaDias(desde, hasta) {
    const out = [];
    const d = new Date(desde + 'T12:00:00Z');
    const fin = new Date(hasta + 'T12:00:00Z');
    while (d <= fin && out.length < 500) {
      out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  }
  const diaCorto = (dia) => new Date(dia + 'T12:00:00Z').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const diaLargo = (dia) => new Date(dia + 'T12:00:00Z').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const fecha = (t) => new Date(t).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

  /** Junta las filas del servidor: { dias: [...], porDia: {dia: {evento: n}}, total: {evento: n} } */
  function resumirUso(st, pagina) {
    const dias = listaDias(st.desde, st.hasta);
    const porDia = Object.fromEntries(dias.map((d) => [d, {}]));
    const total = {};
    const porPagina = {};
    for (const f of st.filas) {
      porPagina[f.pagina] = porPagina[f.pagina] || {};
      porPagina[f.pagina][f.evento] = (porPagina[f.pagina][f.evento] || 0) + f.n;
      if (pagina && f.pagina !== pagina) continue;
      if (!porDia[f.dia]) continue;
      porDia[f.dia][f.evento] = (porDia[f.dia][f.evento] || 0) + f.n;
      total[f.evento] = (total[f.evento] || 0) + f.n;
    }
    // Personas por día: sin filtro, cada navegador cuenta una vez aunque abra varias páginas.
    for (const u of pagina ? st.unicosDia.filter((x) => x.pagina === pagina) : st.unicosDiaTotal || []) {
      if (porDia[u.dia]) porDia[u.dia].unicos = (porDia[u.dia].unicos || 0) + u.n;
    }
    const unicosPagina = Object.fromEntries(st.unicos.map((u) => [u.pagina, u.n]));
    return { dias, porDia, total, porPagina, unicos: pagina ? unicosPagina[pagina] || 0 : st.unicosTotal, unicosPagina };
  }

  const personas = (n) => `${miles(n)} ${n === 1 ? 'persona' : 'personas'}`;

  function tile(label, value, sub) {
    return `<div class="tile"><div class="tile__label">${esc(label)}</div><div class="tile__value">${esc(value)}</div>${sub ? `<div class="tile__sub">${esc(sub)}</div>` : ''}</div>`;
  }

  /* ---------- Gráfico de barras ---------- */

  const tip = $('#tooltip');
  function mostrarTip(html, x, y) {
    tip.innerHTML = html;
    tip.hidden = false;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) + 'px';
    tip.style.top = Math.max(8, y - h - 12) + 'px';
  }
  const ocultarTip = () => (tip.hidden = true);

  const graficos = new Map();
  let redibujo = 0;
  window.addEventListener('resize', () => {
    clearTimeout(redibujo);
    redibujo = setTimeout(() => {
      for (const [el, [datos, unidad]] of graficos) if (el.isConnected && el.offsetParent) barras(el, datos, unidad);
    }, 150);
  });

  /** Barras verticales de una serie: datos = [{ dia, n }]. */
  function barras(el, datos, unidad) {
    const max = Math.max(0, ...datos.map((d) => d.n));
    if (!datos.length || max === 0) {
      el.innerHTML = '<p class="vacio">Todavía no hay datos en este período.</p>';
      return;
    }
    // Se dibuja al ancho real (sin estirar el texto) y se redibuja al cambiar el tamaño.
    graficos.set(el, [datos, unidad]);
    const W = Math.max(280, Math.round(el.clientWidth || 720));
    const H = 220;
    const izq = 36;
    const abajo = 22;
    const arriba = 8;
    const alto = H - abajo - arriba;
    // Escala «redonda» para las líneas de guía.
    const paso = (() => {
      const bruto = max / 4;
      const p = 10 ** Math.floor(Math.log10(bruto || 1));
      return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= bruto) || p * 10;
    })();
    const tope = Math.max(paso, Math.ceil(max / paso) * paso);
    const ancho = (W - izq) / datos.length;
    const gap = Math.min(2, ancho * 0.2);
    const bw = Math.max(1, ancho - gap);
    const y = (n) => arriba + alto - (n / tope) * alto;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(unidad)} por día">`;
    for (let v = 0; v <= tope; v += paso) {
      svg += `<line class="grid-line" x1="${izq}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/>`;
      svg += `<text class="axis-text" x="${izq - 6}" y="${y(v) + 4}" text-anchor="end">${miles(v)}</text>`;
    }
    const cadaCuanto = Math.ceil(datos.length / Math.max(2, Math.floor((W - izq) / 70)));
    datos.forEach((d, i) => {
      const x = izq + i * ancho + gap / 2;
      const top = y(d.n);
      const r = Math.min(4, bw / 2, (arriba + alto - top) / 1);
      const base = arriba + alto;
      const path = d.n > 0 ? `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + bw - r}Q${x + bw},${top} ${x + bw},${top + r}V${base}Z` : '';
      svg += `<g data-i="${i}"><rect class="bar-hit" x="${izq + i * ancho}" y="${arriba}" width="${ancho}" height="${alto}"/>${path ? `<path class="bar-mark" d="${path}"/>` : ''}</g>`;
      if (i % cadaCuanto === 0) svg += `<text class="axis-text" x="${x + bw / 2}" y="${H - 5}" text-anchor="middle">${esc(diaCorto(d.dia))}</text>`;
    });
    svg += '</svg>';
    el.innerHTML = svg;
    const s = el.querySelector('svg');
    s.addEventListener('mousemove', (e) => {
      const g = e.target.closest('g[data-i]');
      for (const x of s.querySelectorAll('g.is-hover')) if (x !== g) x.classList.remove('is-hover');
      if (!g) return ocultarTip();
      g.classList.add('is-hover');
      const d = datos[Number(g.dataset.i)];
      mostrarTip(`${esc(diaLargo(d.dia))}<br><b>${miles(d.n)}</b> ${esc(unidad)}`, e.clientX, e.clientY);
    });
    s.addEventListener('mouseleave', () => {
      ocultarTip();
      for (const x of s.querySelectorAll('g.is-hover')) x.classList.remove('is-hover');
    });
    // En el celular: tocar una barra muestra su valor.
    s.addEventListener('click', (e) => {
      const g = e.target.closest('g[data-i]');
      if (!g) return;
      const d = datos[Number(g.dataset.i)];
      mostrarTip(`${esc(diaLargo(d.dia))}<br><b>${miles(d.n)}</b> ${esc(unidad)}`, e.clientX, e.clientY);
      clearTimeout(barras.t);
      barras.t = setTimeout(ocultarTip, 2500);
    });
  }

  /* ---------- Resumen ---------- */

  async function cargarResumen() {
    const [res, st] = await Promise.all([api('/admin/resumen'), api('/admin/estadisticas?dias=30')]);
    const u = resumirUso(st);
    const hoy = u.porDia[st.hasta] || {};
    $('#resTiles').innerHTML = [
      tile('Visitas hoy', miles(hoy.visita || 0), personas(hoy.unicos || 0)),
      tile('Visitas · 30 días', miles(u.total.visita || 0)),
      tile('Personas · 30 días', miles(u.unicos), 'navegadores distintos'),
      tile('Hojas corregidas · 30 días', miles(u.total.corregida || 0), 'en la web'),
      tile('Cuentas en la nube', miles(res.nube.cuentas), `+${miles(res.nube.nuevas30)} en 30 días`),
      tile('Precio de Plus', res.config.precioCorto, 'al mes, en la web'),
    ].join('');
    barras($('#resChart'), u.dias.map((dia) => ({ dia, n: u.porDia[dia].visita || 0 })), 'visitas');
    const kb = res.nube.espacio / 1024;
    $('#resNube').innerHTML = `
      <dt>Cuentas</dt><dd>${miles(res.nube.cuentas)}</dd>
      <dt>Nuevas (30 días)</dt><dd>${miles(res.nube.nuevas30)}</dd>
      <dt>Guardaron algo (7 días)</dt><dd>${miles(res.nube.activas7)}</dd>
      <dt>Guardaron algo (30 días)</dt><dd>${miles(res.nube.activas30)}</dd>
      <dt>Espacio usado</dt><dd>${kb > 1024 ? `${(kb / 1024).toLocaleString('es-CL', { maximumFractionDigits: 1 })} MB` : `${miles(kb)} KB`} de 5 GB</dd>`;
    $('#resPlus').innerHTML = `
      <dt>Códigos creados</dt><dd>${miles(res.plus.codigos)}</dd>
      <dt>Códigos en uso</dt><dd>${miles(res.plus.enUso)}</dd>
      <dt>Códigos activos (cuentas o navegadores)</dt><dd>${miles(res.plus.equiposActivos)}</dd>
      <dt>Cuentas con Plus por código</dt><dd>${miles(res.plus.cuentasCodigo)}</dd>
      <dt>Cuentas con Plus de Google Play</dt><dd>${miles(res.plus.cuentasPlay)}</dd>
      <dt>Verificación de Google Play</dt><dd>${res.plus.googleConfigurado ? '✔ Configurada' : '✖ Falta GOOGLE_CUENTA_SERVICIO (nube/GUIA.md, paso 10)'}</dd>
      <dt>La nube pide Plus</dt><dd>${res.config.nubePlus ? 'Sí' : 'No (todavía gratis)'}</dd>
      <dt>Canje de códigos</dt><dd>${res.config.canje ? 'Permitido' : 'Apagado'}</dd>
      <dt>Suscripciones en Google Play</dt><dd><a href="https://play.google.com/console" target="_blank" rel="noopener">Ver en Play Console ↗</a></dd>`;
  }

  /* ---------- Uso de la página ---------- */

  let usoActual = null;
  const PAGINAS = { pro: 'CorrigeYa / Pro', normal: 'Lector normal', corrigeya: 'Presentación' };

  async function cargarUso() {
    const dias = $('#usoDias').value;
    const st = await api('/admin/estadisticas?dias=' + encodeURIComponent(dias));
    usoActual = st;
    pintarUso();
  }
  function pintarUso() {
    const st = usoActual;
    if (!st) return;
    const pagina = $('#usoPagina').value;
    const u = resumirUso(st, pagina);
    const t = u.total;
    const disp = (t.movil || 0) + (t.computador || 0);
    $('#usoTiles').innerHTML = [
      tile('Visitas', miles(t.visita || 0)),
      tile('Personas', miles(u.unicos), 'navegadores distintos'),
      tile('Hojas corregidas', miles(t.corregida || 0)),
      tile('Hojas de respuesta impresas', miles(t.hojas || 0), 'veces que se imprimieron'),
      tile('Pruebas impresas', miles(t.prueba || 0), `${miles(t.pauta || 0)} pautas`),
      tile('Desde el celular', disp ? `${Math.round(((t.movil || 0) / disp) * 100)} %` : '—', 'de las visitas'),
    ].join('');
    barras($('#usoChartVisitas'), u.dias.map((dia) => ({ dia, n: u.porDia[dia].visita || 0 })), 'visitas');
    barras($('#usoChartCorregidas'), u.dias.map((dia) => ({ dia, n: u.porDia[dia].corregida || 0 })), 'hojas corregidas');

    const filasPag = Object.keys(PAGINAS).map((p) => {
      const x = u.porPagina[p] || {};
      return `<tr><td>${esc(PAGINAS[p])}</td><td class="num">${miles(x.visita || 0)}</td><td class="num">${miles(u.unicosPagina[p] || 0)}</td><td class="num">${miles(x.corregida || 0)}</td><td class="num">${miles(x.hojas || 0)}</td></tr>`;
    });
    $('#usoPorPagina').innerHTML = `<thead><tr><th>Página</th><th class="num">Visitas</th><th class="num">Personas</th><th class="num">Corregidas</th><th class="num">Impresas</th></tr></thead><tbody>${filasPag.join('')}</tbody>`;

    const movil = t.movil || 0;
    const comp = t.computador || 0;
    const maxD = Math.max(movil, comp, 1);
    $('#usoDispositivos').innerHTML = disp
      ? `<div class="barras-h">${[
          ['📱 Celular o tablet', movil],
          ['💻 Computador', comp],
        ]
          .map(([l, n]) => `<div class="barras-h__fila"><span>${l}</span><span class="barras-h__pista"><span class="barras-h__valor" data-w="${(n / maxD) * 100}"></span></span><span class="barras-h__num">${miles(n)}</span></div>`)
          .join('')}</div>`
      : '<p class="form__nota">Todavía no hay datos.</p>';
    for (const b of $$('.barras-h__valor')) b.style.width = b.dataset.w + '%';

    const filas = u.dias
      .slice()
      .reverse()
      .map((d) => {
        const x = u.porDia[d];
        return `<tr><td>${esc(diaLargo(d))}</td><td class="num">${miles(x.visita || 0)}</td><td class="num">${miles(x.unicos || 0)}</td><td class="num">${miles(x.corregida || 0)}</td><td class="num">${miles(x.hojas || 0)}</td><td class="num">${miles(x.prueba || 0)}</td><td class="num">${miles(x.pauta || 0)}</td></tr>`;
      });
    $('#usoTabla').innerHTML = `<thead><tr><th>Día</th><th class="num">Visitas</th><th class="num">Personas</th><th class="num">Corregidas</th><th class="num">Hojas impresas</th><th class="num">Pruebas</th><th class="num">Pautas</th></tr></thead><tbody>${filas.join('')}</tbody>`;
  }
  $('#usoDias').addEventListener('change', () => cargar('uso'));
  $('#usoPagina').addEventListener('change', pintarUso);
  $('#usoCsv').addEventListener('click', () => {
    if (!usoActual) return;
    const pagina = $('#usoPagina').value;
    const u = resumirUso(usoActual, pagina);
    const cols = ['visita', 'unicos', 'corregida', 'hojas', 'prueba', 'pauta', 'movil', 'computador'];
    const lineas = [['dia', 'visitas', 'personas', 'corregidas', 'hojas_impresas', 'pruebas_impresas', 'pautas', 'celular', 'computador'].join(';')];
    for (const d of u.dias) lineas.push([d, ...cols.map((c) => u.porDia[d][c] || 0)].join(';'));
    const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `corrigeya-uso-${pagina || 'todas'}-${usoActual.desde}-a-${usoActual.hasta}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  /* ---------- Códigos Plus ---------- */

  let codigos = [];
  let ahoraServidor = Date.now();
  const enlaceCodigo = (c) => new URL('../pro.html?codigo=' + encodeURIComponent(c), location.href).href;
  const duracion = (dias) => (dias === 0 ? 'Sin término' : dias === 1 ? '1 día' : dias % 365 === 0 ? `${dias / 365} año${dias > 365 ? 's' : ''}` : dias % 30 === 0 && dias >= 60 ? `${dias / 30} meses` : `${dias} días`);

  function estadoCodigo(c) {
    if (c.revocado) return { k: 'anulado', t: 'Anulado' };
    if (c.usos === 0) {
      if (c.caduca && c.caduca < ahoraServidor) return { k: 'terminado', t: 'Venció sin usar' };
      return { k: 'libre', t: 'Sin usar' };
    }
    if (c.hasta === 0 || (c.hasta && c.hasta > ahoraServidor)) return { k: 'activo', t: c.hasta ? `En uso · hasta ${fecha(c.hasta)}` : 'En uso · sin término' };
    return { k: 'terminado', t: 'Terminó' };
  }

  async function cargarCodigos() {
    const r = await api('/admin/codigos');
    codigos = r.codigos;
    ahoraServidor = r.ahora || Date.now();
    pintarCodigos();
  }
  function pintarCodigos() {
    const q = $('#codBuscar').value.trim().toLowerCase();
    const est = $('#codEstado').value;
    const lista = codigos.filter((c) => {
      if (q && !`${c.codigo} ${c.nota}`.toLowerCase().includes(q)) return false;
      return !est || estadoCodigo(c).k === est;
    });
    const filas = lista.map((c) => {
      const e = estadoCodigo(c);
      return `<tr data-codigo="${esc(c.codigo)}">
        <td class="mono">${esc(c.codigo)}</td>
        <td class="nota">${esc(c.nota) || '<span class="form__nota">—</span>'}</td>
        <td>${esc(duracion(c.dias))}</td>
        <td class="num">${miles(c.usos)} / ${miles(c.usosMax)}</td>
        <td><span class="estado estado--${e.k}">${esc(e.t)}</span></td>
        <td>${esc(fecha(c.creado))}${c.caduca && !c.usos ? `<br><span class="form__nota">canjear antes del ${esc(fecha(c.caduca))}</span>` : ''}</td>
        <td class="acciones">
          <button type="button" class="btn btn--ghost btn--sm" data-cod="copiar" title="Copiar el enlace para canjearlo">Copiar enlace</button>
          ${c.revocado ? '<button type="button" class="btn btn--ghost btn--sm" data-cod="reactivar">Reactivar</button>' : '<button type="button" class="btn btn--danger btn--sm" data-cod="anular">Anular</button>'}
          <button type="button" class="btn btn--danger btn--sm" data-cod="borrar" aria-label="Borrar ${esc(c.codigo)}">Borrar</button>
        </td></tr>`;
    });
    $('#codTabla').innerHTML = `<thead><tr><th>Código</th><th>Nota</th><th>Plus por</th><th class="num">Usos</th><th>Estado</th><th>Creado</th><th></th></tr></thead><tbody>${
      filas.join('') || `<tr><td colspan="7" class="vacio">${codigos.length ? 'Ningún código coincide con el filtro.' : 'Todavía no has creado códigos.'}</td></tr>`
    }</tbody>`;
  }
  $('#codBuscar').addEventListener('input', pintarCodigos);
  $('#codEstado').addEventListener('change', pintarCodigos);
  $('#codTabla').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cod]');
    if (!b) return;
    const codigo = b.closest('tr').dataset.codigo;
    const acc = b.dataset.cod;
    try {
      if (acc === 'copiar') return copiar(enlaceCodigo(codigo));
      if (acc === 'anular') {
        if (!confirm(`¿Anular ${codigo}? Quien lo usa pierde Plus en la web la próxima vez que abra la página.`)) return;
        await api('/admin/codigos/anular', { codigo, anular: true });
        toast('Código anulado');
      } else if (acc === 'reactivar') {
        await api('/admin/codigos/anular', { codigo, anular: false });
        toast('Código reactivado');
      } else if (acc === 'borrar') {
        if (!confirm(`¿Borrar ${codigo}? Desaparece de la lista y quien lo usa pierde Plus. No se puede deshacer.`)) return;
        await api('/admin/codigos/borrar', { codigo });
        toast('Código borrado');
      }
      await cargarCodigos();
    } catch (err) {
      mostrarError(err);
    }
  });

  let nuevos = [];
  $('#codForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#codCrear');
    btn.disabled = true;
    try {
      const datos = {
        cantidad: Number($('#codCantidad').value),
        dias: Number($('#codDias').value),
        usosMax: Number($('#codUsos').value),
        caducaDias: Number($('#codCaduca').value),
        nota: $('#codNota').value,
      };
      const r = await api('/admin/codigos', datos);
      nuevos = r.codigos;
      const dur = datos.dias ? `por ${duracion(datos.dias).toLowerCase()}` : 'sin fecha de término';
      const mensaje =
        nuevos.length === 1
          ? `¡Hola! Te regalo CorrigeYa Plus ${dur}. Ábrelo en este enlace y presiona «Canjear»:\n${enlaceCodigo(nuevos[0])}\n\nTu código: ${nuevos[0]}`
          : `Códigos de CorrigeYa Plus (${dur}). Cada uno se canjea en ${new URL('../pro.html', location.href).href} → ⭐ Plus:\n` + nuevos.join('\n');
      $('#codNuevosTexto').value = mensaje;
      $('#codNuevos').hidden = false;
      $('#codNota').value = '';
      toast(nuevos.length === 1 ? 'Código creado' : `${nuevos.length} códigos creados`);
      await cargarCodigos();
    } catch (err) {
      mostrarError(err);
    } finally {
      btn.disabled = false;
    }
  });
  $('#codCopiarCodigos').addEventListener('click', () => copiar(nuevos.join('\n')));
  // Con CorrigeYa lanzado ya no hay vista previa (?plus=1): para verlo como suscriptor, un código de 1 día.
  $('#codProbar').addEventListener('click', async () => {
    const ventana = window.open('about:blank', '_blank');
    try {
      const r = await api('/admin/codigos', { cantidad: 1, dias: 1, usosMax: 1, caducaDias: 1, nota: 'Prueba del panel' });
      if (ventana) ventana.location = enlaceCodigo(r.codigos[0]);
      else copiar(enlaceCodigo(r.codigos[0]));
      if (vista === 'codigos') await cargarCodigos();
    } catch (err) {
      if (ventana) ventana.close();
      mostrarError(err);
    }
  });
  $('#codCopiarMensaje').addEventListener('click', () => copiar($('#codNuevosTexto').value));

  /* ---------- Configuración ---------- */

  function vistaPrecio() {
    const n = Number($('#cfgPrecio').value);
    $('#cfgPrecioVista').textContent = Number.isFinite(n) && n >= 0 ? `$${miles(n)} al mes` : '—';
  }
  function vistaAviso() {
    const v = $('#cfgAvisoVista');
    $('span', v).textContent = $('#cfgAvisoTexto').value.trim() || 'Escribe el texto del aviso.';
    $('a', v).hidden = !/^https:\/\//i.test($('#cfgAvisoEnlace').value.trim());
    v.classList.toggle('is-off', !$('#cfgAvisoActivo').checked);
  }
  let cfgCambiada = false;
  function marcarCambio() {
    cfgCambiada = true;
    $('#cfgEstado').textContent = 'Cambios sin guardar';
  }
  async function cargarConfig() {
    const c = await api('/admin/config');
    $('#cfgPrecio').value = c.precio;
    $('#cfgCanje').checked = !!c.canje;
    $('#cfgEstadisticas').checked = !!c.estadisticas;
    $('#cfgNubePlus').checked = !!c.nubePlus;
    $('#cfgAvisoActivo').checked = !!c.aviso.activo;
    $('#cfgAvisoTexto').value = c.aviso.texto || '';
    $('#cfgAvisoEnlace').value = c.aviso.enlace || '';
    cfgCambiada = false;
    $('#cfgEstado').textContent = '';
    vistaPrecio();
    vistaAviso();
  }
  $('#cfgPrecio').addEventListener('input', vistaPrecio);
  for (const id of ['#cfgAvisoTexto', '#cfgAvisoEnlace', '#cfgAvisoActivo']) $(id).addEventListener('input', vistaAviso);
  $('#cfgForm').addEventListener('input', marcarCambio);
  $('#cfgForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const enlace = $('#cfgAvisoEnlace').value.trim();
    if (enlace && !/^https:\/\//i.test(enlace)) {
      mostrarError(new Error('El enlace del aviso debe empezar con https://'));
      return;
    }
    if ($('#cfgAvisoActivo').checked && !$('#cfgAvisoTexto').value.trim()) {
      mostrarError(new Error('Escribe el texto del aviso o desmarca «Mostrar el aviso».'));
      return;
    }
    const btn = $('#cfgGuardar');
    btn.disabled = true;
    try {
      await api('/admin/config', {
        precio: Number($('#cfgPrecio').value),
        canje: $('#cfgCanje').checked,
        estadisticas: $('#cfgEstadisticas').checked,
        nubePlus: $('#cfgNubePlus').checked,
        aviso: { activo: $('#cfgAvisoActivo').checked, texto: $('#cfgAvisoTexto').value, enlace },
      });
      $('#mainError').hidden = true;
      await cargarConfig();
      $('#cfgEstado').textContent = 'Guardado ✔ (la página lo muestra en unos minutos)';
      toast('Configuración guardada');
    } catch (err) {
      mostrarError(err);
    } finally {
      btn.disabled = false;
    }
  });
  window.addEventListener('beforeunload', (e) => {
    if (cfgCambiada && vista === 'config') {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  /* ---------- Servidor ---------- */

  async function cargarServidor() {
    const [estado, res] = await Promise.all([api('/estado'), api('/admin/resumen')]);
    const ultimo = estado.ultimoCorreo;
    $('#srvDatos').innerHTML = `
      <dt>Dirección</dt><dd><code>${esc(servidor)}</code></dd>
      <dt>Estado</dt><dd>${estado.ok ? '✔ Funcionando' : '✖ Con problemas'}</dd>
      <dt>Correos con código</dt><dd>${estado.correoConfigurado ? '✔ Configurados' : '✖ Falta CORREO_URL y CORREO_CLAVE'}</dd>
      <dt>Último correo</dt><dd>${ultimo ? `${ultimo.ok ? '✔' : '✖'} ${esc(ultimo.fecha ? new Date(ultimo.fecha).toLocaleString('es-CL') : '')}${ultimo.causa ? ` · ${esc(ultimo.causa)}` : ''}` : '—'}</dd>
      <dt>Día del servidor</dt><dd>${esc(res.servidor.hoy)} (hora de Chile)</dd>
      <dt>Tu sesión del panel</dt><dd>hasta las ${esc(new Date(sesion.vence).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }))}</dd>`;
  }

  /* ---------- Inicio ---------- */

  function entrar() {
    $('#login').hidden = true;
    $('#app').hidden = false;
    ir(leer(localStorage, VISTA_KEY) || 'resumen');
  }

  sesion = sesionGuardada();
  if (sesion) entrar();
  else $('#loginClave').focus();
})();
