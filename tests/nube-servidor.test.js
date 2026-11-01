const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let sqlite = null;
try {
  sqlite = require('node:sqlite');
} catch (e) {
  sqlite = null;
}

/** Base de datos D1 de mentira sobre SQLite en memoria (lo que usa el servidor). */
function fakeD1() {
  const raw = new sqlite.DatabaseSync(':memory:');
  const exec = (sql, args) => {
    const st = raw.prepare(sql);
    if (/^\s*(SELECT|WITH)/i.test(sql)) return { results: st.all(...args), meta: { changes: 0 } };
    const r = st.run(...args);
    return { results: [], meta: { changes: Number(r.changes) } };
  };
  const stmt = (sql, args = []) => ({
    sql,
    args,
    bind: (...a) => stmt(sql, a),
    first: async () => exec(sql, args).results[0] || null,
    all: async () => exec(sql, args),
    run: async () => exec(sql, args),
  });
  return {
    raw,
    prepare: (sql) => stmt(sql),
    batch: async (list) => {
      raw.exec('BEGIN');
      try {
        const out = list.map((s) => exec(s.sql, s.args));
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

const NC = require('../js/pro/nube-core.js');

let loads = 0;
async function setup() {
  const mod = await import(pathToFileURL(path.join(__dirname, '..', 'nube', 'lector-nube.mjs')).href + '?n=' + ++loads); // cada prueba con su propia base
  const env = { DB: fakeD1(), CLAVE_SESION: 'secreto-de-prueba-bastante-largo', CORREO_URL: 'https://correo.example/exec', CORREO_CLAVE: 'clave' };
  const mails = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, env.CORREO_URL);
    const d = JSON.parse(init.body);
    assert.equal(d.clave, 'clave');
    mails.push(d);
    return new Response('ok');
  };
  let ip = 1;
  const call = async (method, route, { body, token, raw, headers } = {}) => {
    const h = { 'CF-Connecting-IP': '10.0.0.' + ip, ...(headers || {}) };
    if (token) h.Authorization = 'Bearer ' + token;
    let payload;
    if (raw !== undefined) payload = raw;
    else if (body !== undefined) {
      payload = JSON.stringify(body);
      h['Content-Type'] = 'application/json';
    }
    const res = await mod.default.fetch(new Request('https://nube.example' + route, { method, headers: h, body: payload }), env);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (e) {
      json = null;
    }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { env, mails, call, newIp: () => ip++, restore: () => (globalThis.fetch = realFetch) };
}

const opts = { skip: !sqlite && 'node:sqlite no disponible' };

test('nube servidor: crear cuenta, entrar, olvidar la contraseña y borrar', opts, async () => {
  const s = await setup();
  try {
    const clave = await NC.passwordHash('Profe@Gmail.com ', 'mi clave 123');
    assert.match(clave, /^[0-9a-f]{64}$/);
    assert.equal(clave, await NC.passwordHash('profe@gmail.com', 'mi clave 123'));

    assert.equal((await s.call('POST', '/codigo', { body: { correo: 'no-es-correo', motivo: 'crear' } })).status, 400);
    assert.equal((await s.call('POST', '/codigo', { body: { correo: 'profe@gmail.com', motivo: 'recuperar' } })).status, 404);
    let r = await s.call('POST', '/codigo', { body: { correo: 'Profe@gmail.com', motivo: 'crear' } });
    assert.equal(r.status, 200, r.text);
    assert.equal(s.mails.length, 1);
    assert.equal(s.mails[0].para, 'profe@gmail.com');
    assert.equal(s.mails[0].motivo, 'crear');
    // Otro código antes de un minuto: espera.
    assert.equal((await s.call('POST', '/codigo', { body: { correo: 'profe@gmail.com', motivo: 'crear' } })).status, 429);

    const code = s.mails[0].codigo;
    const wrong = code === '111111' ? '222222' : '111111';
    r = await s.call('POST', '/clave', { body: { correo: 'profe@gmail.com', motivo: 'crear', codigo: wrong, clave } });
    assert.equal(r.status, 401);
    r = await s.call('POST', '/clave', { body: { correo: 'profe@gmail.com', motivo: 'crear', codigo: code, clave } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.nueva, true);
    const token = r.json.sesion;
    // El código no sirve dos veces.
    assert.equal((await s.call('POST', '/clave', { body: { correo: 'profe@gmail.com', motivo: 'crear', codigo: code, clave } })).status, 401);
    // Ya existe.
    assert.equal((await s.call('POST', '/codigo', { body: { correo: 'profe@gmail.com', motivo: 'crear' } })).status, 409);

    r = await s.call('GET', '/datos', { token });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.docs, {});
    assert.equal((await s.call('GET', '/datos')).status, 401);
    assert.equal((await s.call('GET', '/datos', { token: token.slice(0, -2) + 'xx' })).status, 401);

    // Entrar.
    const otra = await NC.passwordHash('profe@gmail.com', 'otra');
    r = await s.call('POST', '/entrar', { body: { correo: 'profe@gmail.com', clave: otra } });
    assert.equal(r.status, 401);
    assert.match(r.json.error, /Contraseña incorrecta/);
    r = await s.call('POST', '/entrar', { body: { correo: 'nadie@gmail.com', clave } });
    assert.equal(r.status, 401);
    assert.equal(r.json.noExiste, true);
    r = await s.call('POST', '/entrar', { body: { correo: 'profe@gmail.com', clave } });
    assert.equal(r.status, 200);
    const token2 = r.json.sesion;

    // Olvidé mi contraseña: cambia y cierra las sesiones anteriores.
    s.newIp();
    s.env.DB.raw.exec('UPDATE envios SET t = t - 120000');
    r = await s.call('POST', '/codigo', { body: { correo: 'profe@gmail.com', motivo: 'recuperar' } });
    assert.equal(r.status, 200, r.text);
    const nueva = await NC.passwordHash('profe@gmail.com', 'nueva clave');
    r = await s.call('POST', '/clave', { body: { correo: 'profe@gmail.com', motivo: 'recuperar', codigo: s.mails.at(-1).codigo, clave: nueva } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.nueva, false);
    const token3 = r.json.sesion;
    assert.equal((await s.call('GET', '/datos', { token: token2 })).status, 401);
    assert.equal((await s.call('GET', '/datos', { token: token3 })).status, 200);
    assert.equal((await s.call('POST', '/entrar', { body: { correo: 'profe@gmail.com', clave } })).status, 401);

    // Borrar desde la app: pide la contraseña.
    await s.call('PUT', '/datos/libro?base=0', { token: token3, raw: '{"a":1}' });
    assert.equal((await s.call('POST', '/borrar-cuenta', { token: token3, body: { clave } })).status, 401);
    r = await s.call('POST', '/borrar-cuenta', { token: token3, body: { clave: nueva } });
    assert.equal(r.status, 200);
    assert.equal((await s.call('GET', '/datos', { token: token3 })).status, 401);
    assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM partes').get().n, 0);
  } finally {
    s.restore();
  }
});

test('nube servidor: bloqueo tras varias contraseñas equivocadas', opts, async () => {
  const s = await setup();
  try {
    await s.call('POST', '/codigo', { body: { correo: 'a@b.cl', motivo: 'crear' } });
    const clave = await NC.passwordHash('a@b.cl', 'x');
    await s.call('POST', '/clave', { body: { correo: 'a@b.cl', motivo: 'crear', codigo: s.mails[0].codigo, clave } });
    const mala = await NC.passwordHash('a@b.cl', 'y');
    for (let i = 0; i < 5; i++) assert.equal((await s.call('POST', '/entrar', { body: { correo: 'a@b.cl', clave: mala } })).status, 401);
    const r = await s.call('POST', '/entrar', { body: { correo: 'a@b.cl', clave } });
    assert.equal(r.status, 429);
    assert.match(r.json.error, /Demasiados intentos/);
  } finally {
    s.restore();
  }
});

test('nube servidor: documentos con versión, partes grandes y conflictos', opts, async () => {
  const s = await setup();
  try {
    await s.call('POST', '/codigo', { body: { correo: 'a@b.cl', motivo: 'crear' } });
    const clave = await NC.passwordHash('a@b.cl', 'x');
    const token = (await s.call('POST', '/clave', { body: { correo: 'a@b.cl', motivo: 'crear', codigo: s.mails[0].codigo, clave } })).json.sesion;

    let r = await s.call('GET', '/datos/libro', { token });
    assert.equal(r.headers.get('X-Version'), '0');
    assert.equal(r.text, '');

    const big = JSON.stringify({ texto: 'ñandú '.repeat(200000) }); // > 1 millón de letras: varias partes
    r = await s.call('PUT', '/datos/libro?base=0', { token, raw: big, headers: { 'X-Equipo': 'Android' } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.version, 1);
    // Otro equipo con la versión vieja: conflicto.
    r = await s.call('PUT', '/datos/libro?base=0', { token, raw: '{}' });
    assert.equal(r.status, 409);
    assert.equal(r.json.version, 1);
    r = await s.call('GET', '/datos/libro', { token });
    assert.equal(r.text, big);
    assert.equal(r.headers.get('X-Version'), '1');

    r = await s.call('PUT', '/datos/libro?base=1', { token, raw: '{"v":2}' });
    assert.equal(r.json.version, 2);
    assert.equal((await s.call('PUT', '/datos/libro?base=1', { token, raw: '{"v":"x"}' })).status, 409);
    r = await s.call('GET', '/datos/libro', { token });
    assert.equal(r.text, '{"v":2}');
    // Las partes viejas se borran.
    assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM partes').get().n, 1);

    r = await s.call('GET', '/datos', { token });
    assert.equal(r.json.docs.libro.version, 2);
    assert.equal(r.json.docs.libro.tamano, 7);
    assert.equal(r.json.uso, 7);

    assert.equal((await s.call('PUT', '/datos/LIBRO!?base=0', { token, raw: '{}' })).status, 400);
    assert.equal((await s.call('PUT', '/datos/libro', { token, raw: '{}' })).status, 400);
    // CORS para la app.
    r = await s.call('OPTIONS', '/datos/libro');
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), '*');
  } finally {
    s.restore();
  }
});

test('nube servidor: página web para borrar la cuenta con un código', opts, async () => {
  const s = await setup();
  try {
    let r = await s.call('GET', '/borrar-cuenta');
    assert.equal(r.status, 200);
    assert.match(r.text, /Borrar mi cuenta/);
    await s.call('POST', '/codigo', { body: { correo: 'a@b.cl', motivo: 'crear' } });
    const clave = await NC.passwordHash('a@b.cl', 'x');
    await s.call('POST', '/clave', { body: { correo: 'a@b.cl', motivo: 'crear', codigo: s.mails[0].codigo, clave } });
    s.env.DB.raw.exec('UPDATE envios SET t = t - 120000');
    r = await s.call('POST', '/codigo', { body: { correo: 'a@b.cl', motivo: 'borrar' } });
    assert.equal(r.status, 200, r.text);
    assert.equal(s.mails.at(-1).motivo, 'borrar');
    r = await s.call('POST', '/borrar-cuenta', { body: { correo: 'a@b.cl', codigo: s.mails.at(-1).codigo } });
    assert.equal(r.status, 200, r.text);
    assert.equal(s.env.DB.raw.prepare('SELECT COUNT(*) AS n FROM cuentas').get().n, 0);
    r = await s.call('GET', '/estado');
    assert.equal(r.json.correoConfigurado, true);
  } finally {
    s.restore();
  }
});

test('nube servidor: panel /admin, configuración y códigos de CorrigeYa Plus', opts, async () => {
  const s = await setup();
  try {
    // Sin ADMIN_CLAVE el panel no abre.
    let r = await s.call('POST', '/admin/entrar', { body: { clave: 'lo-que-sea' } });
    assert.equal(r.status, 503);
    assert.match(r.json.error, /ADMIN_CLAVE/);
    s.env.ADMIN_CLAVE = 'clave-del-panel-larga';

    // Configuración pública por defecto.
    r = await s.call('GET', '/config');
    assert.equal(r.status, 200);
    assert.equal(r.json.precio, 1990);
    assert.equal(r.json.precioTexto, '$1.990 al mes');
    assert.equal(r.json.canje, true);

    // Contraseña equivocada, luego la correcta.
    assert.equal((await s.call('POST', '/admin/entrar', { body: { clave: 'otra' } })).status, 401);
    r = await s.call('POST', '/admin/entrar', { body: { clave: 'clave-del-panel-larga' } });
    assert.equal(r.status, 200, r.text);
    const admin = r.json.token;
    assert.equal((await s.call('GET', '/admin/resumen')).status, 401);
    assert.equal((await s.call('GET', '/admin/resumen', { token: admin.slice(0, -2) + 'xx' })).status, 401);

    r = await s.call('GET', '/admin/resumen', { token: admin });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.nube.cuentas, 0);
    assert.equal(r.json.config.precio, 1990);

    // Cambiar precio y aviso (los enlaces que no son https se descartan).
    r = await s.call('POST', '/admin/config', { token: admin, body: { precio: 2490, aviso: { activo: true, texto: ' Nueva versión ', enlace: 'javascript:alert(1)' } } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.precioTexto, '$2.490 al mes');
    assert.deepEqual(r.json.aviso, { activo: true, texto: 'Nueva versión', enlace: '' });
    assert.equal((await s.call('GET', '/config')).json.precio, 2490);
    r = await s.call('POST', '/admin/config', { token: admin, body: { precio: -5 } });
    assert.equal(r.json.precio, 1990);

    // Crear códigos: uno para un equipo, por 30 días.
    r = await s.call('POST', '/admin/codigos', { token: admin, body: { cantidad: 2, dias: 30, usosMax: 1, nota: 'Profe de prueba' } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.codigos.length, 2);
    const [codigo, otro] = r.json.codigos;
    assert.match(codigo, /^CY-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);

    const equipo = 'a'.repeat(32);
    // Se puede escribir en minúsculas y sin guiones.
    r = await s.call('POST', '/plus/canjear', { body: { codigo: codigo.toLowerCase().replace(/-/g, ' '), equipo } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.activa, true);
    assert.ok(r.json.hasta > Date.now() + 29 * 864e5);
    const plus = r.json.token;
    // El mismo equipo otra vez: no gasta otro uso.
    assert.equal((await s.call('POST', '/plus/canjear', { body: { codigo, equipo } })).status, 200);
    // Otro equipo: ya se usó.
    r = await s.call('POST', '/plus/canjear', { body: { codigo, equipo: 'b'.repeat(32) } });
    assert.equal(r.status, 403);
    assert.match(r.json.error, /ya lo usó/);
    assert.equal((await s.call('POST', '/plus/canjear', { body: { codigo: 'CY-2222-2222-2222', equipo } })).status, 404);

    assert.deepEqual((await s.call('POST', '/plus/verificar', { body: { token: plus } })).json.activa, true);
    assert.equal((await s.call('POST', '/plus/verificar', { body: { token: plus.slice(0, -2) + 'xx' } })).json.activa, false);

    r = await s.call('GET', '/admin/codigos', { token: admin });
    const fila = r.json.codigos.find((c) => c.codigo === codigo);
    assert.equal(fila.usos, 1);
    assert.equal(fila.nota, 'Profe de prueba');
    assert.ok(fila.hasta > Date.now());
    assert.equal(r.json.codigos.find((c) => c.codigo === otro).usos, 0);

    // Anular: el equipo pierde Plus al revisar.
    assert.equal((await s.call('POST', '/admin/codigos/anular', { token: admin, body: { codigo } })).status, 200);
    r = await s.call('POST', '/plus/verificar', { body: { token: plus } });
    assert.equal(r.json.activa, false);
    assert.match(r.json.motivo, /anulado/);
    assert.equal((await s.call('POST', '/plus/canjear', { body: { codigo, equipo } })).status, 403);
    r = await s.call('GET', '/admin/resumen', { token: admin });
    assert.equal(r.json.plus.codigos, 2);
    assert.equal(r.json.plus.equiposActivos, 0);

    // Borrar.
    assert.equal((await s.call('POST', '/admin/codigos/borrar', { token: admin, body: { codigo: otro } })).status, 200);
    assert.equal((await s.call('GET', '/admin/codigos', { token: admin })).json.codigos.length, 1);

    // Sin canje habilitado.
    await s.call('POST', '/admin/config', { token: admin, body: { canje: false } });
    r = await s.call('POST', '/plus/canjear', { body: { codigo: otro, equipo } });
    assert.equal(r.status, 403);

    // Cambiar ADMIN_CLAVE cierra la sesión del panel.
    s.env.ADMIN_CLAVE = 'otra-clave-del-panel';
    assert.equal((await s.call('GET', '/admin/resumen', { token: admin })).status, 401);
  } finally {
    s.restore();
  }
});

test('nube servidor: estadísticas de uso de la página web', opts, async () => {
  const s = await setup();
  try {
    s.env.ADMIN_CLAVE = 'clave-del-panel-larga';
    const admin = (await s.call('POST', '/admin/entrar', { body: { clave: 'clave-del-panel-larga' } })).json.token;
    const v1 = '1'.repeat(32);
    const v2 = '2'.repeat(32);
    let r = await s.call('POST', '/uso', { body: { pagina: 'pro', visitante: v1, eventos: ['visita', 'computador', 'corregida', 'corregida', 'inventado'] } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.guardado, true);
    await s.call('POST', '/uso', { body: { pagina: 'pro', visitante: v1, eventos: ['corregida'] } });
    await s.call('POST', '/uso', { body: { pagina: 'normal', visitante: v2, eventos: ['visita', 'movil', 'hojas'] } });
    // Texto plano (como lo manda navigator.sendBeacon).
    r = await s.call('POST', '/uso', { raw: JSON.stringify({ pagina: 'corrigeya', visitante: v2, eventos: ['visita'] }), headers: { 'Content-Type': 'text/plain' } });
    assert.equal(r.status, 200, r.text);
    assert.equal((await s.call('POST', '/uso', { body: { pagina: 'otra', eventos: ['visita'] } })).status, 400);

    r = await s.call('GET', '/admin/estadisticas?dias=7', { token: admin });
    assert.equal(r.status, 200, r.text);
    const suma = (pag, ev) => r.json.filas.filter((f) => f.pagina === pag && f.evento === ev).reduce((a, f) => a + f.n, 0);
    assert.equal(suma('pro', 'corregida'), 3);
    assert.equal(suma('pro', 'visita'), 1);
    assert.equal(suma('normal', 'hojas'), 1);
    assert.equal(suma('pro', 'inventado'), 0);
    assert.equal(r.json.unicosTotal, 2);
    // Un mismo navegador en dos páginas el mismo día es una sola persona.
    assert.equal(r.json.unicosDiaTotal[0].n, 2);
    assert.equal(r.json.unicosDia.reduce((a, u) => a + u.n, 0), 3);
    assert.equal(r.json.dias, 7);
    // No se guarda el número del navegador tal cual.
    const h = s.env.DB.raw.prepare('SELECT h FROM uso_visitantes').all().map((x) => x.h);
    assert.ok(!h.includes(v1) && !h.includes(v2));
    assert.equal((await s.call('GET', '/admin/estadisticas')).status, 401);

    // Estadísticas apagadas desde el panel: no se guarda nada.
    await s.call('POST', '/admin/config', { token: admin, body: { estadisticas: false } });
    r = await s.call('POST', '/uso', { body: { pagina: 'pro', visitante: v1, eventos: ['visita'] } });
    assert.equal(r.json.guardado, false);
  } finally {
    s.restore();
  }
});

/** Crea una cuenta en el servidor de prueba y devuelve su sesión. */
async function nuevaCuenta(s, correo) {
  const clave = await NC.passwordHash(correo, 'clave segura 123');
  s.newIp();
  let r = await s.call('POST', '/codigo', { body: { correo, motivo: 'crear' } });
  assert.equal(r.status, 200, r.text);
  const codigo = s.mails[s.mails.length - 1].codigo;
  r = await s.call('POST', '/clave', { body: { correo, motivo: 'crear', codigo, clave } });
  assert.equal(r.status, 200, r.text);
  return r.json.sesion;
}

test('nube servidor: Plus en la cuenta (códigos) y la nube que pide Plus', opts, async () => {
  const s = await setup();
  try {
    s.env.ADMIN_CLAVE = 'clave-del-panel-larga';
    const admin = (await s.call('POST', '/admin/entrar', { body: { clave: 'clave-del-panel-larga' } })).json.token;
    const sesion = await nuevaCuenta(s, 'profe@gmail.com');

    // Sin Plus y con la nube libre (antes del lanzamiento): se guarda igual.
    assert.equal((await s.call('GET', '/datos', { token: sesion })).status, 200);
    let r = await s.call('GET', '/plus', { token: sesion });
    assert.deepEqual(r.json, { activa: false, hasta: null, origen: null });

    // Encender «la nube pide Plus»: sin Plus responde 402 y no guarda.
    await s.call('POST', '/admin/config', { token: admin, body: { nubePlus: true } });
    r = await s.call('GET', '/datos', { token: sesion });
    assert.equal(r.status, 402);
    assert.match(r.json.error, /Plus/);
    assert.equal((await s.call('PUT', '/datos/libro?base=0', { token: sesion, raw: '{"a":1}' })).status, 402);

    // Canjear un código con la sesión: queda en la cuenta.
    const [c1, c2] = (await s.call('POST', '/admin/codigos', { token: admin, body: { cantidad: 2, dias: 30, usosMax: 1 } })).json.codigos;
    r = await s.call('POST', '/plus/canjear', { token: sesion, body: { codigo: c1 } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.activa, true);
    assert.equal(r.json.origen, 'codigo');
    assert.equal(r.json.token, undefined, 'con cuenta no hace falta la firma del navegador');
    assert.equal((await s.call('GET', '/datos', { token: sesion })).status, 200);
    assert.equal((await s.call('GET', '/plus', { token: sesion })).json.activa, true);
    // Otra cuenta no puede usar el mismo código.
    const otra = await nuevaCuenta(s, 'otra@gmail.com');
    assert.equal((await s.call('POST', '/plus/canjear', { token: otra, body: { codigo: c1 } })).status, 403);

    // Código canjeado antes en un navegador: al entrar pasa a la cuenta.
    r = await s.call('POST', '/plus/canjear', { body: { codigo: c2, equipo: 'e'.repeat(32) } });
    const firma = r.json.token;
    assert.equal((await s.call('GET', '/datos', { token: otra })).status, 402);
    r = await s.call('POST', '/plus/vincular', { token: otra, body: { token: firma } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.activa, true);
    assert.equal((await s.call('GET', '/datos', { token: otra })).status, 200);
    // El navegador ya no lo tiene por separado (no se usa dos veces).
    assert.equal((await s.call('POST', '/plus/verificar', { body: { token: firma } })).json.activa, false);

    // Anular el código: la cuenta pierde Plus y la nube vuelve a pedirlo.
    await s.call('POST', '/admin/codigos/anular', { token: admin, body: { codigo: c1 } });
    assert.equal((await s.call('GET', '/datos', { token: sesion })).status, 402);
    r = await s.call('GET', '/admin/resumen', { token: admin });
    assert.equal(r.json.plus.cuentasCodigo, 1);
    assert.equal(r.json.config.nubePlus, true);
    assert.equal((await s.call('GET', '/plus')).status, 401);
  } finally {
    s.restore();
  }
});

test('nube servidor: suscripción de Google Play confirmada con Google y unida a la cuenta', opts, async () => {
  const s = await setup();
  const { generateKeyPairSync } = require('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  s.env.GOOGLE_CUENTA_SERVICIO = JSON.stringify({ client_email: 'pub@p.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  s.env.GOOGLE_TOKEN_URL = 'https://google.example/token';
  s.env.PLAY_API_ROOT = 'https://play.example';
  const compras = {
    'tok-activa-1234567890': { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [{ productId: 'corrigeya_plus', expiryTime: new Date(Date.now() + 20 * 864e5).toISOString() }] },
    'tok-vencida-1234567890': { subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', lineItems: [{ productId: 'corrigeya_plus', expiryTime: new Date(Date.now() - 864e5).toISOString() }] },
  };
  const llamadas = [];
  const anterior = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    llamadas.push(String(url));
    if (url === s.env.GOOGLE_TOKEN_URL) {
      assert.match(String(init.body), /assertion=[\w-]+\.[\w-]+\.[\w-]+$/);
      return new Response(JSON.stringify({ access_token: 'acceso', expires_in: 3600 }), { status: 200 });
    }
    const m = /\/applications\/cl\.lectorhojas\.app\.pro\/purchases\/subscriptionsv2\/tokens\/(.+)$/.exec(String(url));
    if (m) {
      assert.equal(init.headers.Authorization, 'Bearer acceso');
      const c = compras[decodeURIComponent(m[1])];
      return new Response(JSON.stringify(c || { error: { message: 'not found' } }), { status: c ? 200 : 404 });
    }
    return anterior(url, init);
  };
  try {
    const sesion = await nuevaCuenta(s, 'profe@gmail.com');
    let r = await s.call('POST', '/plus/play', { token: sesion, body: { token: 'tok-activa-1234567890', producto: 'corrigeya_plus' } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.activa, true);
    assert.equal(r.json.origen, 'play');
    assert.ok(r.json.hasta > Date.now() + 19 * 864e5);
    assert.equal((await s.call('GET', '/plus', { token: sesion })).json.activa, true);

    // Vencida o inexistente: no da Plus.
    const otra = await nuevaCuenta(s, 'otra@gmail.com');
    r = await s.call('POST', '/plus/play', { token: otra, body: { token: 'tok-vencida-1234567890' } });
    assert.equal(r.json.activa, false);
    assert.equal((await s.call('POST', '/plus/play', { token: otra, body: { token: 'tok-falsa-1234567890' } })).status, 404);

    // La misma compra en otra cuenta: pasa a la última (no queda en dos).
    r = await s.call('POST', '/plus/play', { token: otra, body: { token: 'tok-activa-1234567890' } });
    assert.equal(r.json.activa, true);
    assert.equal((await s.call('GET', '/plus', { token: sesion })).json.activa, false);
    // El acceso a Google se pide una vez y se reutiliza.
    assert.equal(llamadas.filter((u) => u === s.env.GOOGLE_TOKEN_URL).length, 1);

    // Sin la llave de Google, el servidor lo dice claro.
    delete s.env.GOOGLE_CUENTA_SERVICIO;
    r = await s.call('POST', '/plus/play', { token: sesion, body: { token: 'tok-activa-1234567890' } });
    assert.equal(r.status, 503);
    assert.match(r.json.error, /GOOGLE_CUENTA_SERVICIO/);
  } finally {
    globalThis.fetch = anterior;
    s.restore();
  }
});
