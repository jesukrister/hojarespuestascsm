/*
 * Versión Pro · Reglas de la nube (sin pantalla, para probarlas aparte):
 *  - huella de la contraseña (la contraseña nunca sale del equipo);
 *  - conexión con el servidor (nube/lector-nube.mjs);
 *  - combinar los cambios de dos equipos comparando con la última versión
 *    que ambos tenían (lo que se borró en un equipo se borra en el otro);
 *  - sincronizar cada documento («libro», «recursos», «prueba»).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NubeCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ITERATIONS = 100000;
  const subtle = () => (typeof crypto !== 'undefined' && crypto.subtle) || null;
  const normEmail = (e) => String(e || '').trim().toLowerCase();
  const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(normEmail(e));

  /** Huella de la contraseña (PBKDF2-SHA256, sal = correo): es lo único que viaja al servidor. */
  async function passwordHash(email, password) {
    const s = subtle();
    if (!s) throw new Error('Este navegador no permite usar la nube (falta el cifrado seguro).');
    const enc = new TextEncoder();
    const key = await s.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
    const bits = await s.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('lector-hojas-pro|' + normEmail(email)), iterations: ITERATIONS }, key, 256);
    return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  /** Huella corta de un texto (FNV-1a de 32 bits + largo), para saber si cambió. */
  function hash(text) {
    const s = String(text);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0') + '-' + s.length.toString(36);
  }

  /* ---------- Conexión con el servidor ---------- */

  class CloudError extends Error {
    constructor(message, status, data) {
      super(message);
      this.status = status || 0;
      this.data = data || {};
    }
  }

  function Api(baseUrl, { fetch: f, token, device } = {}) {
    const doFetch = f || ((...a) => fetch(...a));
    const url = String(baseUrl || '').replace(/\/+$/, '');
    const api = { token: token || '', url };
    async function call(method, path, { json, text } = {}) {
      const headers = {};
      if (api.token) headers.Authorization = 'Bearer ' + api.token;
      if (device) headers['X-Equipo'] = device;
      let body;
      if (json !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(json);
      } else if (text !== undefined) {
        headers['Content-Type'] = 'text/plain;charset=utf-8';
        body = text;
      }
      let res;
      try {
        res = await doFetch(url + path, { method, headers, body, cache: 'no-store' });
      } catch (e) {
        const online = typeof navigator === 'undefined' || navigator.onLine !== false;
        throw new CloudError(
          online ? `No se pudo conectar con el servidor de la nube (${url}). Revisa tu internet; si sigue igual, puede que esta red bloquee esa dirección.` : 'Sin conexión a internet. Se guardará cuando vuelva la conexión.',
          0,
          { offline: true }
        );
      }
      return res;
    }
    async function json(method, path, data) {
      const res = await call(method, path, { json: data });
      let out = {};
      try {
        out = await res.json();
      } catch (e) {
        out = {};
      }
      if (!res.ok) throw new CloudError(out.error || `La nube respondió con un error (${res.status}).`, res.status, out);
      return out;
    }
    api.requestCode = (email, reason) => json('POST', '/codigo', { correo: normEmail(email), motivo: reason });
    api.setPassword = async (email, reason, code, password) =>
      json('POST', '/clave', { correo: normEmail(email), motivo: reason, codigo: String(code || '').replace(/\D/g, ''), clave: await passwordHash(email, password) });
    api.login = async (email, password) => json('POST', '/entrar', { correo: normEmail(email), clave: await passwordHash(email, password) });
    api.deleteAccount = async (email, password) => json('POST', '/borrar-cuenta', { clave: await passwordHash(email, password) });
    api.list = () => json('GET', '/datos');
    api.get = async (name) => {
      const res = await call('GET', '/datos/' + encodeURIComponent(name));
      if (!res.ok) {
        let out = {};
        try {
          out = await res.json();
        } catch (e) {
          out = {};
        }
        throw new CloudError(out.error || `La nube respondió con un error (${res.status}).`, res.status, out);
      }
      return { version: Number(res.headers.get('X-Version')) || 0, text: await res.text() };
    };
    api.put = async (name, base, text) => {
      const res = await call('PUT', `/datos/${encodeURIComponent(name)}?base=${base}`, { text });
      let out = {};
      try {
        out = await res.json();
      } catch (e) {
        out = {};
      }
      if (res.status === 409) return { conflict: true, version: out.version || 0 };
      if (!res.ok) throw new CloudError(out.error || `La nube respondió con un error (${res.status}).`, res.status, out);
      return { version: out.version };
    };
    return api;
  }

  /* ---------- Combinar cambios de dos equipos ---------- */

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const stamp = (x) => (x && (x.updatedAt || x.scannedAt || x.createdAt)) || 0;
  const newer = (l, r) => (stamp(r) > stamp(l) ? r : l);

  /**
   * Combina dos listas con id comparando con la base (la última versión común):
   * lo agregado en cualquiera queda, lo borrado en uno (sin cambios en el otro) se borra,
   * y si los dos cambiaron lo mismo se usa mergeItem (o lo más reciente).
   */
  function mergeList(base, local, remote, mergeItem) {
    const idx = (list) => new Map((Array.isArray(list) ? list : []).filter((x) => x && x.id !== undefined).map((x) => [x.id, x]));
    const b = idx(base);
    const l = idx(local);
    const r = idx(remote);
    const out = [];
    for (const [id, x] of l) {
      const y = r.get(id);
      const z = b.get(id);
      if (y === undefined) {
        if (z !== undefined && same(z, x)) continue; // se borró en el otro equipo
        out.push(x);
      } else if (same(x, y) || (z !== undefined && same(z, y))) out.push(x);
      else if (z !== undefined && same(z, x)) out.push(y);
      else out.push(mergeItem ? mergeItem(z === undefined ? null : z, x, y) : newer(x, y));
    }
    for (const [id, y] of r) {
      if (l.has(id)) continue;
      const z = b.get(id);
      if (z !== undefined && same(z, y)) continue; // se borró en este equipo
      out.push(y);
    }
    return out;
  }

  /** Objeto campo por campo: gana el que cambió; si cambiaron los dos, el más reciente. */
  function mergeObject(base, local, remote, special) {
    const b = base || {};
    const pickRemote = stamp(remote) > stamp(local);
    const out = {};
    const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);
    for (const k of keys) {
      if (special && special[k]) {
        out[k] = special[k](base ? b[k] : null, local[k], remote[k]);
        continue;
      }
      const lv = local[k];
      const rv = remote[k];
      let v;
      if (same(lv, rv)) v = lv;
      else if (base && same(b[k], lv)) v = rv;
      else if (base && same(b[k], rv)) v = lv;
      else v = pickRemote ? rv : lv;
      if (v !== undefined) out[k] = v;
    }
    if (typeof local.updatedAt === 'number' || typeof remote.updatedAt === 'number') out.updatedAt = Math.max(local.updatedAt || 0, remote.updatedAt || 0);
    return out;
  }

  /** Notas por estudiante: { idEstudiante: nota }. */
  function mergeMap(base, local, remote) {
    const b = base || {};
    const l = local || {};
    const r = remote || {};
    const out = {};
    for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
      const inL = Object.prototype.hasOwnProperty.call(l, k);
      const inR = Object.prototype.hasOwnProperty.call(r, k);
      const inB = Object.prototype.hasOwnProperty.call(b, k);
      if (inL && inR) out[k] = same(l[k], r[k]) || (inB && same(b[k], r[k])) ? l[k] : inB && same(b[k], l[k]) ? r[k] : newer(l[k], r[k]);
      else if (inL) {
        if (!(inB && same(b[k], l[k]))) out[k] = l[k];
      } else if (!(inB && same(b[k], r[k]))) out[k] = r[k];
    }
    return out;
  }

  const mergeEvaluation = (b, l, r) => mergeObject(b, l, r, { grades: mergeMap });
  const mergeCourse = (b, l, r) => {
    const out = mergeObject(b, l, r, {
      students: (bs, ls, rs) => mergeList(bs, ls, rs).sort((s, t) => s.n - t.n),
      evaluations: (be, le, re) => mergeList(be, le, re, mergeEvaluation),
    });
    return out;
  };

  /** Libro de notas: cursos, estudiantes, evaluaciones y notas. */
  function mergeBook(base, local, remote) {
    const l = local || { courses: [] };
    const r = remote || { courses: [] };
    return Object.assign({}, l, {
      courses: mergeList(base && base.courses, l.courses, r.courses, mergeCourse),
      updatedAt: Math.max(l.updatedAt || 0, r.updatedAt || 0),
    });
  }

  /** ¿Es la misma prueba? (para juntar las hojas escaneadas en dos equipos) */
  const sameTest = (a, b) =>
    !!a && !!b && String(a.title || '').trim() === String(b.title || '').trim() && a.numQuestions === b.numQuestions && a.numChoices === b.numChoices;

  /**
   * Prueba y hojas escaneadas. Si los dos equipos cambiaron la prueba, queda la de este
   * equipo; si además es otra prueba, las hojas del otro equipo no se mezclan y
   * lost = true (quien llama guarda lo del otro equipo en una copia automática).
   */
  function mergeState(base, local, remote) {
    const b = base || null;
    const l = local || { exam: null, results: [] };
    const r = remote || { exam: null, results: [] };
    let exam;
    let lost = false;
    if (same(l.exam, r.exam) || (b && same(b.exam, r.exam))) exam = l.exam;
    else if (b && same(b.exam, l.exam)) exam = r.exam;
    else {
      exam = l.exam;
      lost = true;
      if (!sameTest(l.exam, r.exam)) return { state: { exam: l.exam, results: l.results || [] }, lost: true };
    }
    const results = mergeList(b && b.results, l.results, r.results);
    if (!lost && (r.results || []).some((x) => !results.some((y) => same(x, y)) && !(b && (b.results || []).some((z) => same(z, x))))) lost = true;
    return { state: { exam, results }, lost };
  }

  /** Imágenes de las preguntas ({ id: dataURL }): se juntan, nunca se borran. */
  const mergeAssets = (base, local, remote) => Object.assign({}, remote || {}, local || {});

  /* ---------- Sincronizar ---------- */

  const parse = (text) => {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  };

  /**
   * Sincroniza un documento.
   *  doc: { name, read() → texto local, isEmpty(texto), merge(base, local, remoto, { firstTime }) → { value, lost } (o promesa),
   *         apply(texto, { lost, remoteText }) (guarda en el equipo; puede devolver el texto local
 *         resultante), pushOnly (sólo subir: si el otro equipo cambió algo, devuelve behind) }
   *  meta: { version, hash } de la última sincronización; baseText: el texto de esa vez.
   * Devuelve { meta, baseText, pulled, pushed, behind, lost }.
   */
  async function syncDoc(api, doc, meta, baseText, remoteVersion) {
    const out = { pulled: false, pushed: false, behind: false, lost: false };
    let m = { version: (meta && meta.version) || 0, hash: (meta && meta.hash) || '' };
    let base = baseText || '';
    let rv = remoteVersion || 0;
    for (let round = 0; round < 4; round++) {
      const localText = doc.read();
      const localHash = hash(localText);
      // Un equipo sin datos que nunca se sincronizó no tiene nada que combinar.
      const unchanged = localHash === m.hash || (m.version === 0 && doc.isEmpty(localText));
      if (rv === m.version) {
        if (localHash === m.hash || (rv === 0 && doc.isEmpty(localText))) return Object.assign(out, { meta: m, baseText: base });
        const res = await api.put(doc.name, rv, localText);
        if (res.conflict) {
          rv = res.version;
          continue;
        }
        m = { version: res.version, hash: localHash };
        return Object.assign(out, { meta: m, baseText: localText, pushed: true });
      }
      if (doc.pushOnly) return Object.assign(out, { meta: m, baseText: base, behind: true });
      const remote = await api.get(doc.name);
      rv = remote.version;
      if (rv === m.version) continue; // volvió a la misma versión
      let text = remote.text;
      if (!unchanged) {
        const merged = await doc.merge(parse(base), parse(localText), parse(remote.text), { firstTime: !m.version });
        text = JSON.stringify(merged.value);
        if (merged.lost) out.lost = true;
      }
      // apply puede devolver cómo quedó el texto en el equipo (ya revisado), para no subirlo de nuevo.
      let appliedText = text;
      if (text !== localText) {
        const back = await doc.apply(text, { lost: out.lost, remoteText: remote.text });
        if (typeof back === 'string') appliedText = back;
        out.pulled = true;
      }
      if (text === remote.text) {
        m = { version: rv, hash: hash(appliedText) };
        return Object.assign(out, { meta: m, baseText: text });
      }
      const res = await api.put(doc.name, rv, text);
      if (res.conflict) {
        // Lo combinado ya quedó en el equipo: la base sigue siendo la versión remota leída.
        m = { version: rv, hash: hash(remote.text) };
        base = remote.text;
        rv = res.version;
        continue;
      }
      m = { version: res.version, hash: hash(text) };
      return Object.assign(out, { meta: m, baseText: text, pushed: true });
    }
    return Object.assign(out, { meta: m, baseText: base, busy: true });
  }

  return {
    ITERATIONS,
    normEmail,
    validEmail,
    passwordHash,
    hash,
    Api,
    CloudError,
    mergeList,
    mergeObject,
    mergeMap,
    mergeBook,
    mergeState,
    mergeAssets,
    sameTest,
    syncDoc,
  };
});
