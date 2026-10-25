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
