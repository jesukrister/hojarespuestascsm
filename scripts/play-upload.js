/*
 * Publica los .aab en Google Play Console con la API oficial de publicación
 * de Google Play (sin dependencias: Node 20 o más nuevo). Lo usa
 * .github/workflows/android.yml después de compilar, así cada cambio que se
 * sube al repositorio llega solo a Play Console.
 *
 *   node scripts/play-upload.js paquete=archivo.aab[,novedades.txt] ...
 *
 * Variables de entorno:
 *   PLAY_ACCESS_TOKEN          token de acceso de la cuenta de servicio, obtenido en
 *                              GitHub sin claves (Workload Identity Federation);
 *   PLAY_SERVICE_ACCOUNT       su correo (sólo para los mensajes)
 *   PLAY_SERVICE_ACCOUNT_JSON  o bien: clave JSON de la cuenta de servicio con acceso a
 *                              las apps en Play Console (si falta, no se publica)
 *   PLAY_TRACK                 segmento: vacío o "cerrada" = la prueba cerrada en uso
 *                              (la que ya tenga versiones; si no, "alpha");
 *                              "internal", "alpha", "beta", "production", el nombre
 *                              de otra pista, o "ninguno" para no publicar
 *   PLAY_RELEASE_NAME          nombre de la versión (por ejemplo 1.0.15)
 *   PLAY_LANGUAGE              idioma de las novedades (por omisión es-419)
 *
 * Si la app todavía es un borrador en Play Console (nunca se ha publicado),
 * Google sólo acepta versiones en borrador: entonces se sube como borrador y
 * hay que lanzarla a mano la primera vez.
 */
'use strict';
const crypto = require('crypto');
const fs = require('fs');

const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const DEFAULT_ROOT = 'https://androidpublisher.googleapis.com';
const MAIN_TRACKS = ['production', 'beta', 'internal'];
const NOTES_MAX = 500;

class PlayError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const b64url = (data) => Buffer.from(data).toString('base64url');

/** Token de acceso de la cuenta de servicio (JWT firmado con su llave privada). */
async function getToken(key) {
  if (!key || !key.client_email || !key.private_key) throw new Error('La clave JSON no es de una cuenta de servicio (falta client_email o private_key).');
  const aud = key.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud, iat: now, exp: now + 3600 }));
  const signature = crypto.createSign('RSA-SHA256').update(`${head}.${claims}`).sign(key.private_key);
  const res = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${b64url(signature)}` }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new PlayError(res.status, `Google no aceptó la cuenta de servicio: ${data.error_description || data.error || res.status}`);
  }
  return data.access_token;
}

function client(token, root) {
  const base = `${root}/androidpublisher/v3/applications`;
  const upload = `${root}/upload/androidpublisher/v3/applications`;
  async function call(method, url, body, headers) {
    const res = await fetch(url, {
      method,
      headers: Object.assign({ Authorization: `Bearer ${token}` }, body && !headers ? { 'Content-Type': 'application/json' } : {}, headers || {}),
      body: body === undefined ? undefined : headers ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = { raw: text };
    }
    if (!res.ok) throw new PlayError(res.status, (data.error && data.error.message) || data.raw || `HTTP ${res.status}`);
    return data;
  }
  const app = (pkg) => `${base}/${encodeURIComponent(pkg)}`;
  return {
    insertEdit: (pkg) => call('POST', `${app(pkg)}/edits`, {}),
    uploadBundle: (pkg, edit, bytes) =>
      call('POST', `${upload}/${encodeURIComponent(pkg)}/edits/${edit}/bundles?uploadType=media`, bytes, { 'Content-Type': 'application/octet-stream' }),
    listTracks: (pkg, edit) => call('GET', `${app(pkg)}/edits/${edit}/tracks`),
    updateTrack: (pkg, edit, track, body) => call('PUT', `${app(pkg)}/edits/${edit}/tracks/${encodeURIComponent(track)}`, body),
    commit: (pkg, edit, notForReview) => call('POST', `${app(pkg)}/edits/${edit}:commit${notForReview ? '?changesNotSentForReview=true' : ''}`),
    deleteEdit: (pkg, edit) => call('DELETE', `${app(pkg)}/edits/${edit}`).catch(() => {}),
  };
}

/**
 * Pista de prueba cerrada en uso: la que no es producción, abierta ni interna
 * y tiene la versión más nueva; si ninguna tiene versiones, "alpha".
 */
function chooseTrack(tracks, wanted) {
  const w = String(wanted || '').trim();
  if (w && !/^(cerrada|closed)$/i.test(w)) return w;
  let best = null;
  let bestCode = -1;
  for (const t of tracks || []) {
    if (!t || !t.track || MAIN_TRACKS.includes(t.track) || t.track.includes(':')) continue;
    for (const r of t.releases || []) {
      for (const c of r.versionCodes || []) {
        if (Number(c) > bestCode) {
          bestCode = Number(c);
          best = t.track;
        }
      }
    }
  }
  return best || 'alpha';
}

const isDraftAppError = (e) => /draft app/i.test(e.message);
const needsNotForReview = (e) => /changesNotSentForReview/i.test(e.message);
const isNotesError = (e) => /release ?notes|language|idioma/i.test(e.message);
const isUsedCode = (e) => /already been used|ya se ha usado|ya se usó/i.test(e.message);
const isNotFound = (e) => e.status === 404 || /package not found|no application was found/i.test(e.message);

/** Sube un .aab y lo deja en la pista. Devuelve { track, versionCode, status, review }. */
async function publish(api, job, opts = {}) {
  const { pkg, bytes, track: wanted, name, notes, language } = job;
  const status = opts.draft ? 'draft' : 'completed';
  const edit = (await api.insertEdit(pkg)).id;
  try {
    let versionCode = opts.versionCode;
    if (!versionCode) {
      try {
        versionCode = (await api.uploadBundle(pkg, edit, bytes)).versionCode;
      } catch (e) {
        // Se volvió a ejecutar la misma compilación: el .aab ya está en Play.
        if (!isUsedCode(e) || !opts.knownVersionCode) throw e;
        versionCode = opts.knownVersionCode;
      }
    }
    const track = chooseTrack((await api.listTracks(pkg, edit)).tracks, wanted);
    const release = { versionCodes: [String(versionCode)], status };
    if (name) release.name = name;
    if (notes && !opts.noNotes) release.releaseNotes = [{ language: language || 'es-419', text: notes.slice(0, NOTES_MAX) }];
    await api.updateTrack(pkg, edit, track, { track, releases: [release] });
    await api.commit(pkg, edit, !!opts.notForReview);
    return { track, versionCode, status, review: !opts.notForReview && status === 'completed' };
  } catch (e) {
    await api.deleteEdit(pkg, edit);
    // Los reintentos parten con una edición nueva.
    if (!opts.draft && isDraftAppError(e)) return publish(api, job, Object.assign({}, opts, { draft: true }));
    if (!opts.notForReview && needsNotForReview(e)) return publish(api, job, Object.assign({}, opts, { notForReview: true }));
    if (!opts.noNotes && notes && isNotesError(e)) return publish(api, job, Object.assign({}, opts, { noNotes: true }));
    throw e;
  }
}

function parseArgs(argv) {
  return argv.map((a) => {
    const eq = a.indexOf('=');
    if (eq <= 0) throw new Error(`Argumento inválido: ${a} (se espera paquete=archivo.aab[,novedades.txt])`);
    const [file, notesFile] = a.slice(eq + 1).split(',');
    return { pkg: a.slice(0, eq), file, notesFile: notesFile || '' };
  });
}

const TRACK_NAMES = { internal: 'prueba interna', alpha: 'prueba cerrada (Alpha)', beta: 'prueba abierta', production: 'producción' };
const trackName = (t) => TRACK_NAMES[t] || `prueba cerrada «${t}»`;

async function main(argv = process.argv.slice(2), env = process.env, log = console.log) {
  const summary = [];
  const out = (line) => {
    log(line);
    summary.push(line);
  };
  const done = (code) => {
    if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `### Google Play\n\n${summary.map((l) => `- ${l.replace(/^::\w+::/, '')}`).join('\n')}\n`);
    return code;
  };
  const wanted = String(env.PLAY_TRACK || '').trim();
  if (/^(ninguno|none|no)$/i.test(wanted)) {
    out('::notice::PLAY_TRACK = ninguno: no se publica en Google Play.');
    return done(0);
  }
  // Credenciales: un token de acceso ya obtenido por GitHub con Workload
  // Identity Federation (sin claves; PLAY_ACCESS_TOKEN) o una clave JSON.
  const accessToken = String(env.PLAY_ACCESS_TOKEN || '').trim();
  const keyText = String(env.PLAY_SERVICE_ACCOUNT_JSON || '').trim();
  if (!accessToken && !keyText) {
    out('::notice::Google Play no está configurado (falta la variable PLAY_WIF_PROVIDER o el secreto PLAY_SERVICE_ACCOUNT_JSON): no se publica en Google Play (ver docs/google-play.md, sección 9).');
    return done(0);
  }
  let account = String(env.PLAY_SERVICE_ACCOUNT || '').trim();
  let api;
  if (accessToken) {
    api = client(accessToken, env.PLAY_API_ROOT || DEFAULT_ROOT);
  } else {
    let key;
    try {
      key = JSON.parse(keyText);
    } catch (e) {
      out('::error::PLAY_SERVICE_ACCOUNT_JSON no es un JSON válido: pega el contenido completo del archivo .json de la cuenta de servicio.');
      return done(1);
    }
    if (key && key.client_email) account = key.client_email;
    try {
      api = client(await getToken(key), env.PLAY_API_ROOT || DEFAULT_ROOT);
    } catch (e) {
      out(`::error::${e.message}`);
      return done(1);
    }
  }
  let failed = 0;
  for (const app of parseArgs(argv)) {
    let bytes;
    try {
      bytes = fs.readFileSync(app.file);
    } catch (e) {
      out(`::error::${app.pkg}: no se encontró ${app.file}.`);
      failed++;
      continue;
    }
    const notes = app.notesFile && fs.existsSync(app.notesFile) ? fs.readFileSync(app.notesFile, 'utf8').trim() : '';
    const knownVersionCode = Number(env.PLAY_VERSION_CODE) || 0;
    try {
      const r = await publish(api, { pkg: app.pkg, bytes, track: wanted, name: env.PLAY_RELEASE_NAME || '', notes, language: env.PLAY_LANGUAGE }, { knownVersionCode });
      const what = `${app.pkg}: versión ${env.PLAY_RELEASE_NAME || r.versionCode} (código ${r.versionCode}) en ${trackName(r.track)}`;
      if (r.status === 'draft') out(`::warning::${what} como BORRADOR: la app aún no se ha publicado nunca, así que Google sólo acepta borradores. Lánzala a mano en Play Console la primera vez.`);
      else if (!r.review) out(`::warning::${what}. Google pidió no enviarla a revisión automáticamente: entra a Play Console → Resumen de publicación → Enviar cambios a revisión.`);
      else out(`::notice::${what}, enviada a revisión de Google.`);
    } catch (e) {
      if (isNotFound(e)) {
        out(`::warning::${app.pkg}: Play Console no encontró la app. Créala y sube el primer .aab a mano, y da acceso a la cuenta de servicio${account ? ` (${account})` : ''}.`);
        continue;
      }
      const hint =
        e.status === 401 || e.status === 403
          ? ` La cuenta de servicio${account ? ` ${account}` : ''} no tiene permiso: en Play Console → Usuarios y permisos, invítala y dale «Lanzar a segmentos de prueba» (y «Lanzar a producción» si publicas ahí).`
          : '';
      out(`::error::${app.pkg}: ${e.message}${hint}`);
      failed++;
    }
  }
  return done(failed ? 1 : 0);
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.log(`::error::${e.message}`);
      process.exit(1);
    }
  );
}

module.exports = { main, publish, chooseTrack, getToken, client, parseArgs };
