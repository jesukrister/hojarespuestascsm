const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const P = require('../scripts/play-upload.js');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });

/** Servidor que imita la API de publicación de Google Play. */
function mockPlay(apps) {
  const calls = [];
  let edits = 0;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, 'http://x');
      const send = (code, data) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(data === undefined ? '' : JSON.stringify(data));
      };
      const fail = (code, message) => send(code, { error: { code, message } });
      if (url.pathname === '/token') {
        const form = new URLSearchParams(body.toString());
        const [h, c, s] = form.get('assertion').split('.');
        const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${c}`), publicKey, Buffer.from(s, 'base64url'));
        const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
        calls.push({ token: true, ok, claims });
        return ok ? send(200, { access_token: 'tok', expires_in: 3600 }) : send(400, { error: 'invalid_grant' });
      }
      if (req.headers.authorization !== 'Bearer tok') return fail(401, 'sin token');
      const m = url.pathname.match(/^\/(upload\/)?androidpublisher\/v3\/applications\/([^/]+)\/edits(?:\/([^/:]+))?(?:\/(bundles|tracks)(?:\/([^/]+))?)?(:commit)?$/);
      if (!m) return fail(404, 'ruta desconocida ' + url.pathname);
      const [, upload, pkg, edit, kind, track, commit] = m;
      const app = apps[decodeURIComponent(pkg)];
      calls.push({ method: req.method, pkg: decodeURIComponent(pkg), kind: commit ? 'commit' : kind || (edit ? 'edit' : 'insert'), track: track && decodeURIComponent(track), query: url.search, size: body.length, body: req.headers['content-type'] === 'application/json' && body.length ? JSON.parse(body) : null });
      if (!app) return fail(404, `Package not found: ${decodeURIComponent(pkg)}.`);
      if (req.method === 'POST' && !edit) return send(200, { id: 'e' + ++edits });
      if (req.method === 'DELETE') return send(204);
      if (upload && kind === 'bundles') {
        if (app.usedCode) return fail(403, 'APK specifies a version code that has already been used.');
        return send(200, { versionCode: app.code || 15, sha1: 'x' });
      }
      if (kind === 'tracks' && req.method === 'GET') return send(200, { kind: 'androidpublisher#tracksListResponse', tracks: app.tracks || [] });
      if (kind === 'tracks' && req.method === 'PUT') {
        app.pending = JSON.parse(body);
        if (app.badNotes && app.pending.releases[0].releaseNotes) return fail(400, 'Release notes language es-419 is not supported.');
        return send(200, app.pending);
      }
      if (commit) {
        const rel = app.pending.releases[0];
        if (app.draft && rel.status !== 'draft') return fail(400, 'Only releases with status draft may be created on draft app.');
        if (app.needsNotForReview && !url.search.includes('changesNotSentForReview=true')) {
          return fail(400, 'Changes cannot be sent for review automatically. Please set the query parameter changesNotSentForReview to true.');
        }
        app.committed = app.pending;
        return send(200, { id: edit });
      }
      return fail(400, 'no esperado');
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, calls, root: `http://127.0.0.1:${server.address().port}` })));
}

function tmp(name, content) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'play-')), name);
  fs.writeFileSync(f, content);
  return f;
}

test('play: elige la prueba cerrada en uso', () => {
  const tracks = [
    { track: 'production', releases: [{ versionCodes: ['3'] }] },
    { track: 'internal', releases: [{ versionCodes: ['9'] }] },
    { track: 'alpha' },
    { track: 'Colegas', releases: [{ versionCodes: ['7'], status: 'completed' }] },
    { track: 'wear:production', releases: [{ versionCodes: ['99'] }] },
  ];
  assert.equal(P.chooseTrack(tracks, ''), 'Colegas');
  assert.equal(P.chooseTrack(tracks, 'cerrada'), 'Colegas');
  assert.equal(P.chooseTrack(tracks, 'internal'), 'internal');
  assert.equal(P.chooseTrack([{ track: 'internal', releases: [{ versionCodes: ['7'] }] }], ''), 'alpha');
  assert.equal(P.chooseTrack(undefined, ''), 'alpha');
  assert.deepEqual(P.parseArgs(['a.b=x.aab,n.txt', 'c.d=y.aab']), [
    { pkg: 'a.b', file: 'x.aab', notesFile: 'n.txt' },
    { pkg: 'c.d', file: 'y.aab', notesFile: '' },
  ]);
  assert.throws(() => P.parseArgs(['sin-igual']));
});

test('play: sube, elige la pista y maneja borradores, revisión y apps que faltan', async () => {
  const apps = {
    'cl.ok': { tracks: [{ track: 'internal', releases: [{ versionCodes: ['7'] }] }, { track: 'Colegas', releases: [{ versionCodes: ['7'], status: 'completed' }] }] },
    'cl.borrador': { draft: true },
    'cl.revision': { needsNotForReview: true, tracks: [{ track: 'alpha', releases: [{ versionCodes: ['7'] }] }] },
    'cl.notas': { badNotes: true },
    'cl.repetida': { usedCode: true },
  };
  const { server, calls, root } = await mockPlay(apps);
  try {
    const aab = tmp('app.aab', Buffer.alloc(2048, 7));
    const notes = tmp('novedades.txt', 'Respaldo en Google Drive.\n' + 'x'.repeat(600));
    const summaryFile = tmp('summary.md', '');
    const logs = [];
    const env = {
      PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account', client_email: 'publicador@proyecto.iam.gserviceaccount.com', private_key: PEM, token_uri: root + '/token' }),
      PLAY_API_ROOT: root,
      PLAY_RELEASE_NAME: '1.0.15',
      PLAY_VERSION_CODE: '15',
      GITHUB_STEP_SUMMARY: summaryFile,
    };
    const args = ['cl.ok', 'cl.borrador', 'cl.revision', 'cl.notas', 'cl.repetida', 'cl.falta'].map((p) => `${p}=${aab},${notes}`);
    const code = await P.main(args, env, (l) => logs.push(l));
    assert.equal(code, 0, logs.join('\n'));

    const tok = calls.find((c) => c.token);
    assert.ok(tok.ok, 'JWT firmado con la llave de la cuenta de servicio');
    assert.equal(tok.claims.scope, 'https://www.googleapis.com/auth/androidpublisher');
    assert.equal(tok.claims.iss, 'publicador@proyecto.iam.gserviceaccount.com');

    // Normal: a la prueba cerrada en uso, con nombre y novedades (máx. 500).
    const ok = apps['cl.ok'].committed;
    assert.equal(ok.track, 'Colegas');
    assert.deepEqual(ok.releases[0].versionCodes, ['15']);
    assert.equal(ok.releases[0].status, 'completed');
    assert.equal(ok.releases[0].name, '1.0.15');
    assert.equal(ok.releases[0].releaseNotes[0].language, 'es-419');
    assert.equal(ok.releases[0].releaseNotes[0].text.length, 500);
    assert.equal(calls.find((c) => c.pkg === 'cl.ok' && c.kind === 'bundles').size, 2048);

    // App nunca publicada: queda como borrador.
    assert.equal(apps['cl.borrador'].committed.releases[0].status, 'draft');
    assert.equal(apps['cl.borrador'].committed.track, 'alpha');
    // Google pide no enviarla a revisión automáticamente.
    assert.ok(apps['cl.revision'].committed);
    assert.ok(calls.some((c) => c.pkg === 'cl.revision' && c.kind === 'commit' && c.query.includes('changesNotSentForReview=true')));
    // Idioma de las novedades rechazado: se publica sin novedades.
    assert.equal(apps['cl.notas'].committed.releases[0].releaseNotes, undefined);
    // Misma compilación ejecutada de nuevo: usa el código conocido.
    assert.deepEqual(apps['cl.repetida'].committed.releases[0].versionCodes, ['15']);
    // Las ediciones fallidas se descartan.
    assert.ok(calls.filter((c) => c.method === 'DELETE').length >= 3);

    const text = logs.join('\n');
    assert.match(text, /::notice::cl\.ok: versión 1\.0\.15 \(código 15\) en prueba cerrada «Colegas», enviada a revisión/);
    assert.match(text, /::warning::cl\.borrador: .*BORRADOR/);
    assert.match(text, /::warning::cl\.revision: .*Enviar cambios a revisión/);
    assert.match(text, /::warning::cl\.falta: Play Console no encontró la app/);
    assert.match(fs.readFileSync(summaryFile, 'utf8'), /### Google Play[\s\S]*cl\.ok: versión 1\.0\.15/);
  } finally {
    server.close();
  }
});

test('play: sin secreto o con "ninguno" no publica; errores claros', async () => {
  const logs = [];
  assert.equal(await P.main(['a=b.aab'], {}, (l) => logs.push(l)), 0);
  assert.match(logs.pop(), /Google Play no está configurado/);
  assert.equal(await P.main(['a=b.aab'], { PLAY_TRACK: 'ninguno', PLAY_SERVICE_ACCOUNT_JSON: '{}' }, (l) => logs.push(l)), 0);
  assert.match(logs.pop(), /no se publica/);
  assert.equal(await P.main(['a=b.aab'], { PLAY_SERVICE_ACCOUNT_JSON: 'no es json' }, (l) => logs.push(l)), 1);
  assert.match(logs.pop(), /no es un JSON válido/);
  assert.equal(await P.main(['a=b.aab'], { PLAY_SERVICE_ACCOUNT_JSON: '{"type":"service_account"}' }, (l) => logs.push(l)), 1);
  assert.match(logs.pop(), /no es de una cuenta de servicio/);

  // Sin permiso en Play Console.
  const { server, root } = await mockPlay({});
  try {
    const aab = tmp('app.aab', 'x');
    const env = { PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'otro@x.iam.gserviceaccount.com', private_key: PEM, token_uri: root + '/token' }), PLAY_API_ROOT: root, PLAY_TRACK: 'internal' };
    // Token rechazado: firma con otra llave.
    const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
    const bad = Object.assign({}, env, { PLAY_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'x@y', private_key: other, token_uri: root + '/token' }) });
    assert.equal(await P.main([`cl.x=${aab}`], bad, (l) => logs.push(l)), 1);
    assert.match(logs.pop(), /Google no aceptó la cuenta de servicio/);
    // Falta el archivo .aab.
    assert.equal(await P.main(['cl.x=/no/existe.aab'], env, (l) => logs.push(l)), 1);
    assert.match(logs.pop(), /no se encontró/);
  } finally {
    server.close();
  }
});

test('play: sin claves, con el token que entrega GitHub (Workload Identity Federation)', async () => {
  const apps = { 'cl.wif': { tracks: [{ track: 'alpha', releases: [{ versionCodes: ['9'] }] }] } };
  const { server, calls, root } = await mockPlay(apps);
  try {
    const aab = tmp('app.aab', Buffer.alloc(100, 1));
    const logs = [];
    const env = { PLAY_ACCESS_TOKEN: 'tok', PLAY_SERVICE_ACCOUNT: 'pub@p.iam.gserviceaccount.com', PLAY_API_ROOT: root, PLAY_RELEASE_NAME: '1.0.11' };
    assert.equal(await P.main([`cl.wif=${aab}`, `cl.otra=${aab}`], env, (l) => logs.push(l)), 0, logs.join('\n'));
    assert.ok(!calls.some((c) => c.token), 'no pide token: usa el de GitHub');
    assert.equal(apps['cl.wif'].committed.track, 'alpha');
    assert.match(logs.join('\n'), /cl\.otra: .*\(pub@p\.iam\.gserviceaccount\.com\)/);
    // Token inválido: error claro con la cuenta.
    const bad = Object.assign({}, env, { PLAY_ACCESS_TOKEN: 'otro' });
    assert.equal(await P.main([`cl.wif=${aab}`], bad, (l) => logs.push(l)), 1);
    assert.match(logs.pop(), /La cuenta de servicio pub@p\.iam\.gserviceaccount\.com no tiene permiso/);
  } finally {
    server.close();
  }
});

