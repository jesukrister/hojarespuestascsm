/* ==========================================================
   Nube del Lector de Hojas de Respuesta (versión Pro)
   Servidor gratuito en Cloudflare (Worker + base de datos D1) que guarda los datos de cada docente
   con su cuenta (correo y contraseña), para no tener que descargar respaldos a mano.
   - Crear cuenta y «Olvidé mi contraseña»: se envía un código de 6 dígitos al correo (con el script
     de Google nube/correo.gs) y con él se elige la contraseña.
   - La contraseña nunca viaja ni se guarda en texto: la app manda una huella (PBKDF2) y aquí se
     guarda otra huella de esa huella, con sal propia.
   - Cada documento («libro», «prueba», «recursos») tiene un número de versión: si otro equipo lo
     cambió antes, el servidor responde 409 y la app combina los cambios antes de volver a guardar.
   - Página para borrar la cuenta desde la web (lo pide Google Play): /borrar-cuenta
   Se pega en el panel de Cloudflare (ver nube/GUIA.md). Necesita:
     DB            enlace a la base de datos D1
     CLAVE_SESION  secreto largo inventado (firma las sesiones)
     CORREO_URL    dirección /exec del script de Google
     CORREO_CLAVE  la misma CLAVE escrita en el script de Google
   ========================================================== */

const DURACION_SESION = 365 * 864e5;
const VIGENCIA_CODIGO = 15 * 60000;
const ITERACIONES = 10000; // la app ya hizo 100.000 vueltas: aquí bastan pocas (el plan gratis da 10 ms de CPU)
const MAX_DOC = 12 * 1048576; // caracteres por documento
const MAX_CUENTA = 40 * 1048576; // total por cuenta
const MAX_DOCS = 12;
const PARTE = 500000; // caracteres por fila (D1 acepta filas de hasta 2 MB)
const CLAVE_DOC = /^[a-z0-9_-]{1,40}$/;
const CORREO = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const texto = (s) => new TextEncoder().encode(s);
const hexDe = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const azar = (n) => hexDe(crypto.getRandomValues(new Uint8Array(n)));
const limpiarCorreo = (c) => String(c || "").trim().toLowerCase().slice(0, 200);

class Problema extends Error {
  constructor(mensaje, estado, extra) {
    super(mensaje);
    this.estado = estado || 400;
    this.extra = extra || {};
  }
}

/* ---------- Base de datos ---------- */
let tablasListas = false;
async function prepararTablas(db) {
  if (tablasListas) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS cuentas (id TEXT PRIMARY KEY, correo TEXT UNIQUE NOT NULL, sal TEXT NOT NULL, hash TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, creado INTEGER NOT NULL, ultimo INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS docs (cuenta TEXT NOT NULL, clave TEXT NOT NULL, version INTEGER NOT NULL, escritura TEXT NOT NULL, actualizado INTEGER NOT NULL, tamano INTEGER NOT NULL, equipo TEXT, PRIMARY KEY (cuenta, clave))"),
    db.prepare("CREATE TABLE IF NOT EXISTS partes (cuenta TEXT NOT NULL, clave TEXT NOT NULL, version INTEGER NOT NULL, n INTEGER NOT NULL, datos TEXT NOT NULL, PRIMARY KEY (cuenta, clave, version, n))"),
    db.prepare("CREATE TABLE IF NOT EXISTS codigos (llave TEXT PRIMARY KEY, hash TEXT NOT NULL, vence INTEGER NOT NULL, intentos INTEGER NOT NULL DEFAULT 0)"),
    db.prepare("CREATE TABLE IF NOT EXISTS envios (ip TEXT NOT NULL, correo TEXT NOT NULL, t INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS intentos (llave TEXT PRIMARY KEY, fallos INTEGER NOT NULL, hasta INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS estado (k TEXT PRIMARY KEY, v TEXT NOT NULL)"),
  ]);
  tablasListas = true;
}

/* ---------- Contraseñas y sesiones ---------- */
async function huella(clave, sal) {
  const k = await crypto.subtle.importKey("raw", texto(clave), "PBKDF2", false, ["deriveBits"]);
  return hexDe(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: texto(sal), iterations: ITERACIONES }, k, 256));
}
// Compara sin revelar por el tiempo de respuesta cuántas letras coinciden
async function mismaClave(a, b) {
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", texto(String(s)))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let dif = 0;
  for (let i = 0; i < u.length; i++) dif |= u[i] ^ v[i];
  return dif === 0;
}
// La app manda la huella de la contraseña: 64 letras hexadecimales
function claveValida(c) {
  if (!/^[0-9a-f]{64}$/.test(String(c || ""))) throw new Problema("Falta la contraseña.", 400);
  return c;
}

const llaveSesion = (env) => crypto.subtle.importKey("raw", texto("lector|" + env.CLAVE_SESION), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
async function crearSesion(env, cuenta) {
  const datos = b64url(texto(JSON.stringify({ u: cuenta.id, v: cuenta.version, e: Date.now() + DURACION_SESION })));
  return datos + "." + b64url(await crypto.subtle.sign("HMAC", await llaveSesion(env), texto(datos)));
}
// Cuenta de la sesión (se corta al cambiar la contraseña o borrar la cuenta)
async function cuentaDeSesion(db, env, req) {
  const m = /^Bearer ([A-Za-z0-9_-]{10,400})\.([A-Za-z0-9_-]{20,})$/.exec(req.headers.get("Authorization") || "");
  const fuera = () => new Problema("La sesión venció. Vuelve a entrar con tu correo y contraseña.", 401, { salir: true });
  if (!m || !(await crypto.subtle.verify("HMAC", await llaveSesion(env), deB64url(m[2]), texto(m[1])))) throw fuera();
  let d;
  try { d = JSON.parse(new TextDecoder().decode(deB64url(m[1]))); } catch (e) { throw fuera(); }
  if (!d || d.e < Date.now()) throw fuera();
  const c = await db.prepare("SELECT id, correo, version FROM cuentas WHERE id = ?").bind(d.u).first();
  if (!c || c.version !== d.v) throw fuera();
  return c;
}

/* ---------- Intentos fallidos ---------- */
// Tras 5 fallos con un mismo correo (o 20 desde una misma conexión), espera cada vez más larga
async function revisarEspera(db, llaves) {
  const ahora = Date.now();
  for (const llave of llaves) {
    const reg = await db.prepare("SELECT hasta FROM intentos WHERE llave = ?").bind(llave).first();
    if (reg && reg.hasta > ahora) throw new Problema(`Demasiados intentos. Espera ${Math.ceil((reg.hasta - ahora) / 60000)} minutos e inténtalo de nuevo.`, 429);
  }
}
async function anotarFallo(db, llave, limite) {
  const reg = await db.prepare("SELECT fallos FROM intentos WHERE llave = ?").bind(llave).first();
  const fallos = (reg ? reg.fallos : 0) + 1;
  const hasta = fallos >= limite ? Date.now() + Math.min(15 * 60000 * 2 ** (fallos - limite), 864e5) : 0;
  await db.prepare("INSERT INTO intentos (llave, fallos, hasta) VALUES (?1, ?2, ?3) ON CONFLICT(llave) DO UPDATE SET fallos = ?2, hasta = ?3").bind(llave, fallos, hasta).run();
  return fallos >= limite;
}

/* ---------- Correos con código ---------- */
async function guardarEstado(db, k, v) {
  await db.prepare("INSERT INTO estado (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = ?2").bind(k, JSON.stringify(v)).run();
}

// Pide al script de Google (nube/correo.gs) que envíe el correo. Si falla, la causa queda en /estado.
async function llamarCorreo(db, env, datos) {
  const r = await fetch(env.CORREO_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave: env.CORREO_CLAVE, ...datos }) })
    .catch((e) => ({ ok: false, status: 0, text: async () => String((e && e.message) || e) }));
  const resp = await r.text().catch(() => "");
  if (r.ok && /^\s*ok\s*$/i.test(resp)) {
    await guardarEstado(db, "correo", { ok: true, fecha: new Date().toISOString() });
    return true;
  }
  await guardarEstado(db, "correo", {
    ok: false, fecha: new Date().toISOString(), estado: r.status,
    respuesta: resp.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160),
    causa: /^\s*no\s*$/i.test(resp) ? "El script respondió «no»: CORREO_CLAVE no es igual a la CLAVE del script, o el script publicado es una versión antigua (Implementar → Gestionar implementaciones → Nueva versión)."
      : r.status === 401 || r.status === 403 || /iniciar sesi|sign in|accounts\.google/i.test(resp) ? "Google pidió iniciar sesión: el acceso de la implementación debe ser «Cualquier usuario»."
      : !r.ok ? "La dirección CORREO_URL no respondió bien: revisa que sea la URL de la aplicación web y termine en /exec."
      : "El script respondió algo inesperado.",
  });
  return false;
}

// Máximo 1 código por minuto y 6 al día por correo; 30 al día desde una misma conexión
async function puedeEnviar(db, ip, correo) {
  const ahora = Date.now();
  await db.prepare("DELETE FROM envios WHERE t < ?").bind(ahora - 864e5).run();
  const porCorreo = await db.prepare("SELECT COUNT(*) AS n, MAX(t) AS ultimo FROM envios WHERE correo = ?").bind(correo).first();
  const porIp = await db.prepare("SELECT COUNT(*) AS n FROM envios WHERE ip = ?").bind(ip).first();
  if (porCorreo && porCorreo.ultimo && ahora - porCorreo.ultimo < 60000) throw new Problema("Ya te enviamos un código hace menos de un minuto. Revisa tu correo (también en «Spam» o «Promociones»).", 429);
  if ((porCorreo && porCorreo.n >= 6) || (porIp && porIp.n >= 30)) throw new Problema("Se pidieron demasiados códigos hoy. Inténtalo de nuevo mañana.", 429);
}

const MOTIVOS = ["crear", "recuperar", "borrar"];
async function pedirCodigo(db, env, ip, d) {
  const correo = limpiarCorreo(d.correo);
  const motivo = MOTIVOS.includes(d.motivo) ? d.motivo : "";
  if (!CORREO.test(correo)) throw new Problema("Escribe un correo válido, por ejemplo nombre@gmail.com.", 400);
  if (!motivo) throw new Problema("Solicitud incompleta.", 400);
  if (!env.CORREO_URL || !env.CORREO_CLAVE) throw new Problema("El envío de códigos por correo aún no está activado en el servidor.", 503);
  const existe = await db.prepare("SELECT id FROM cuentas WHERE correo = ?").bind(correo).first();
  if (motivo === "crear" && existe) throw new Problema("Ya existe una cuenta con este correo. Entra con tu contraseña o usa «Olvidé mi contraseña».", 409, { existe: true });
  if (motivo !== "crear" && !existe) throw new Problema("No hay ninguna cuenta con este correo. Revisa que esté bien escrito.", 404, { noExiste: true });
  await puedeEnviar(db, ip, correo);
  const codigo = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  const llave = motivo + "|" + correo;
  const hash = hexDe(await crypto.subtle.digest("SHA-256", texto(llave + "|" + codigo)));
  if (!(await llamarCorreo(db, env, { tipo: "codigo", para: correo, codigo, motivo }))) {
    throw new Problema("No se pudo enviar el correo con el código. Inténtalo de nuevo en unos minutos.", 502);
  }
  await db.batch([
    db.prepare("INSERT INTO codigos (llave, hash, vence, intentos) VALUES (?1, ?2, ?3, 0) ON CONFLICT(llave) DO UPDATE SET hash = ?2, vence = ?3, intentos = 0").bind(llave, hash, Date.now() + VIGENCIA_CODIGO),
    db.prepare("INSERT INTO envios (ip, correo, t) VALUES (?, ?, ?)").bind(ip, correo, Date.now()),
  ]);
  return { ok: true };
}

// Revisa el código escrito (y lo borra si es correcto). 5 intentos y hay que pedir otro.
async function comprobarCodigo(db, motivo, correo, codigo) {
  const llave = motivo + "|" + correo;
  codigo = String(codigo || "").replace(/\D/g, "");
  const reg = await db.prepare("SELECT hash, vence, intentos FROM codigos WHERE llave = ?").bind(llave).first();
  if (!reg || reg.vence < Date.now() || reg.intentos >= 5) throw new Problema("El código venció. Pide uno nuevo.", 401);
  const hash = hexDe(await crypto.subtle.digest("SHA-256", texto(llave + "|" + codigo)));
  if (!(await mismaClave(hash, reg.hash))) {
    await db.prepare("UPDATE codigos SET intentos = intentos + 1 WHERE llave = ?").bind(llave).run();
    throw new Problema(reg.intentos >= 4 ? "Código incorrecto. Pide uno nuevo." : "Código incorrecto. Revísalo e inténtalo otra vez.", 401);
  }
  await db.prepare("DELETE FROM codigos WHERE llave = ?").bind(llave).run();
}

/* ---------- Cuenta ---------- */
// Con el código del correo: crea la cuenta o cambia la contraseña (cierra la sesión en los demás equipos)
async function elegirClave(db, env, d) {
  const correo = limpiarCorreo(d.correo);
  const motivo = d.motivo === "recuperar" ? "recuperar" : "crear";
  const clave = claveValida(d.clave);
  await revisarEspera(db, ["c|" + correo]);
  await comprobarCodigo(db, motivo, correo, d.codigo);
  const sal = azar(16);
  const hash = await huella(clave, sal);
  const ahora = Date.now();
  let cuenta = await db.prepare("SELECT id, version FROM cuentas WHERE correo = ?").bind(correo).first();
  if (cuenta) {
    await db.prepare("UPDATE cuentas SET sal = ?, hash = ?, version = version + 1, ultimo = ? WHERE id = ?").bind(sal, hash, ahora, cuenta.id).run();
    cuenta = { id: cuenta.id, version: cuenta.version + 1 };
  } else {
    if (motivo !== "crear") throw new Problema("No hay ninguna cuenta con este correo.", 404);
    cuenta = { id: azar(16), version: 1 };
    await db.prepare("INSERT INTO cuentas (id, correo, sal, hash, version, creado, ultimo) VALUES (?, ?, ?, ?, 1, ?, ?)").bind(cuenta.id, correo, sal, hash, ahora, ahora).run();
  }
  await db.prepare("DELETE FROM intentos WHERE llave = ?").bind("c|" + correo).run();
  return { sesion: await crearSesion(env, cuenta), correo, nueva: motivo === "crear" };
}

async function entrar(db, env, ip, d) {
  const correo = limpiarCorreo(d.correo);
  const clave = claveValida(d.clave);
  await revisarEspera(db, ["c|" + correo, "ip|" + ip]);
  const c = await db.prepare("SELECT id, sal, hash, version FROM cuentas WHERE correo = ?").bind(correo).first();
  const h = await huella(clave, c ? c.sal : "sin-cuenta");
  if (c && (await mismaClave(h, c.hash))) {
    await db.batch([
      db.prepare("DELETE FROM intentos WHERE llave = ?").bind("c|" + correo),
      db.prepare("UPDATE cuentas SET ultimo = ? WHERE id = ?").bind(Date.now(), c.id),
    ]);
    return { sesion: await crearSesion(env, c), correo };
  }
  const bloqueado = await anotarFallo(db, "c|" + correo, 5);
  await anotarFallo(db, "ip|" + ip, 20);
  if (!c) throw new Problema("No hay ninguna cuenta con este correo. Revisa que esté bien escrito o crea una cuenta.", 401, { noExiste: true });
  throw new Problema(bloqueado ? "Contraseña incorrecta. Por seguridad, espera 15 minutos antes de volver a intentar o usa «Olvidé mi contraseña»." : "Contraseña incorrecta.", 401);
}

async function borrarTodo(db, id) {
  await db.batch([
    db.prepare("DELETE FROM partes WHERE cuenta = ?").bind(id),
    db.prepare("DELETE FROM docs WHERE cuenta = ?").bind(id),
    db.prepare("DELETE FROM cuentas WHERE id = ?").bind(id),
  ]);
}

// Desde la app (sesión + contraseña) o desde la página web (correo + código)
async function borrarCuenta(db, env, req, ip, d) {
  if (d.codigo !== undefined) {
    const correo = limpiarCorreo(d.correo);
    await revisarEspera(db, ["c|" + correo]);
    await comprobarCodigo(db, "borrar", correo, d.codigo);
    const c = await db.prepare("SELECT id FROM cuentas WHERE correo = ?").bind(correo).first();
    if (c) await borrarTodo(db, c.id);
    return { ok: true };
  }
  const c = await cuentaDeSesion(db, env, req);
  const reg = await db.prepare("SELECT sal, hash FROM cuentas WHERE id = ?").bind(c.id).first();
  await revisarEspera(db, ["c|" + c.correo]);
  if (!(await mismaClave(await huella(claveValida(d.clave), reg.sal), reg.hash))) {
    await anotarFallo(db, "c|" + c.correo, 5);
    throw new Problema("Contraseña incorrecta.", 401);
  }
  await borrarTodo(db, c.id);
  return { ok: true };
}

/* ---------- Datos ---------- */
async function listar(db, c) {
  const { results } = await db.prepare("SELECT clave, version, actualizado, tamano, equipo FROM docs WHERE cuenta = ?").bind(c.id).all();
  const docs = {};
  let uso = 0;
  for (const r of results || []) {
    docs[r.clave] = { version: r.version, actualizado: r.actualizado, tamano: r.tamano, equipo: r.equipo || "" };
    uso += r.tamano;
  }
  return { correo: c.correo, docs, uso, limite: MAX_CUENTA };
}

async function leerDoc(db, c, clave) {
  const doc = await db.prepare("SELECT version, actualizado FROM docs WHERE cuenta = ? AND clave = ?").bind(c.id, clave).first();
  if (!doc) return { version: 0, actualizado: 0, datos: "" };
  const { results } = await db.prepare("SELECT datos FROM partes WHERE cuenta = ? AND clave = ? AND version = ? ORDER BY n").bind(c.id, clave, doc.version).all();
  return { version: doc.version, actualizado: doc.actualizado, datos: (results || []).map((r) => r.datos).join("") };
}

// Guarda solo si nadie lo cambió desde la versión «base» que tiene la app (si no, 409)
async function guardarDoc(db, c, clave, base, datos, equipo) {
  if (datos.length > MAX_DOC) throw new Problema("Hay demasiados datos para guardarlos en la nube de una vez.", 413);
  const otros = await db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(tamano), 0) AS uso FROM docs WHERE cuenta = ? AND clave <> ?").bind(c.id, clave).first();
  if (otros.n >= MAX_DOCS) throw new Problema("Demasiados documentos.", 400);
  if (otros.uso + datos.length > MAX_CUENTA) throw new Problema("Tu cuenta llegó al límite de espacio en la nube.", 413);
  const nueva = base + 1;
  const escritura = azar(8);
  const ahora = Date.now();
  const cambio = base === 0
    ? db.prepare("INSERT INTO docs (cuenta, clave, version, escritura, actualizado, tamano, equipo) VALUES (?, ?, 1, ?, ?, ?, ?) ON CONFLICT(cuenta, clave) DO NOTHING")
      .bind(c.id, clave, escritura, ahora, datos.length, equipo)
    : db.prepare("UPDATE docs SET version = ?, escritura = ?, actualizado = ?, tamano = ?, equipo = ? WHERE cuenta = ? AND clave = ? AND version = ?")
      .bind(nueva, escritura, ahora, datos.length, equipo, c.id, clave, base);
  // Las partes solo se escriben si el cambio de versión fue de esta escritura (todo va en una transacción)
  const mia = "EXISTS (SELECT 1 FROM docs WHERE cuenta = ?1 AND clave = ?2 AND version = ?3 AND escritura = ?4)";
  const sentencias = [cambio];
  for (let i = 0, n = 0; i < Math.max(datos.length, 1); i += PARTE, n++) {
    sentencias.push(db.prepare(`INSERT INTO partes (cuenta, clave, version, n, datos) SELECT ?1, ?2, ?3, ?5, ?6 WHERE ${mia}`)
      .bind(c.id, clave, nueva, escritura, n, datos.slice(i, i + PARTE)));
  }
  sentencias.push(db.prepare(`DELETE FROM partes WHERE cuenta = ?1 AND clave = ?2 AND version <> ?3 AND ${mia}`).bind(c.id, clave, nueva, escritura));
  const res = await db.batch(sentencias);
  if (!res[0].meta || res[0].meta.changes !== 1) {
    const actual = await db.prepare("SELECT version FROM docs WHERE cuenta = ? AND clave = ?").bind(c.id, clave).first();
    throw new Problema("Otro equipo guardó cambios recién.", 409, { version: actual ? actual.version : 0 });
  }
  return { version: nueva, actualizado: ahora };
}

/* ---------- Página para borrar la cuenta ---------- */
const PAGINA_BORRAR = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Borrar mi cuenta · Lector de Hojas de Respuesta</title>
<style>
:root{color-scheme:light dark;--fondo:#f4f6f9;--caja:#fff;--texto:#1d2733;--suave:#5b6776;--borde:#cfd6df;--azul:#1f4e79;--rojo:#b3261e}
@media (prefers-color-scheme:dark){:root{--fondo:#11161c;--caja:#1b232c;--texto:#e6ebf0;--suave:#9aa6b2;--borde:#33404d;--azul:#7fb2e5;--rojo:#ff8a80}}
*{box-sizing:border-box}body{margin:0;background:var(--fondo);color:var(--texto);font:17px/1.5 system-ui,sans-serif;padding:24px 16px}
main{max-width:520px;margin:0 auto;background:var(--caja);border:1px solid var(--borde);border-radius:14px;padding:22px}
h1{font-size:1.35rem;margin:0 0 8px;color:var(--azul)}p{margin:.6em 0}.suave{color:var(--suave);font-size:.95rem}
label{display:block;font-weight:600;margin-top:14px}input{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--borde);border-radius:10px;background:transparent;color:inherit;margin-top:4px}
button{font:inherit;font-weight:600;border:0;border-radius:10px;padding:11px 18px;margin-top:16px;cursor:pointer;background:var(--azul);color:var(--caja)}
button.peligro{background:var(--rojo);color:var(--caja)}button:disabled{opacity:.6}#msg{min-height:1.5em;font-weight:600}#msg.error{color:var(--rojo)}
</style></head><body><main>
<h1>Borrar mi cuenta de la nube</h1>
<p>Lector de Hojas de Respuesta (versión Pro). Al borrar la cuenta se eliminan del servidor tu correo, tu contraseña y todos los datos guardados en la nube (cursos, notas, pruebas y resultados). Los datos que estén en tus equipos no se borran.</p>
<p class="suave">También puedes hacerlo desde la app: pestaña <b>Cursos</b> → <b>Guardar en la nube</b> → <b>Borrar mi cuenta</b>.</p>
<form id="f1"><label for="correo">Tu correo</label><input id="correo" type="email" autocomplete="email" required>
<button type="submit">Enviarme un código</button></form>
<form id="f2" hidden><p>Te enviamos un código de 6 dígitos a <b id="a"></b>. Revisa también «Spam» o «Promociones».</p>
<label for="codigo">Código</label><input id="codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
<button type="submit" class="peligro">Borrar mi cuenta y mis datos</button></form>
<p id="msg" role="status"></p>
</main><script>
const $=(s)=>document.querySelector(s),msg=(t,e)=>{$("#msg").textContent=t;$("#msg").className=e?"error":""};
async function api(ruta,datos){const r=await fetch(ruta,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(datos)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"No se pudo conectar.");return j}
$("#f1").onsubmit=async(e)=>{e.preventDefault();const b=e.submitter;b.disabled=true;msg("Enviando…");
try{await api("codigo",{correo:$("#correo").value,motivo:"borrar"});$("#a").textContent=$("#correo").value;$("#f1").hidden=true;$("#f2").hidden=false;msg("");$("#codigo").focus()}catch(x){msg(x.message,1)}b.disabled=false};
$("#f2").onsubmit=async(e)=>{e.preventDefault();if(!confirm("¿Borrar la cuenta y todos sus datos de la nube? No se puede deshacer."))return;const b=e.submitter;b.disabled=true;msg("Borrando…");
try{await api("borrar-cuenta",{correo:$("#correo").value,codigo:$("#codigo").value});$("#f2").hidden=true;msg("Listo: tu cuenta y tus datos en la nube fueron borrados.")}catch(x){msg(x.message,1);b.disabled=false}};
</script></body></html>`;

/* ---------- Respuestas ---------- */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Equipo",
  "Access-Control-Expose-Headers": "X-Version, X-Actualizado",
  "Access-Control-Max-Age": "86400",
};
function respuesta(datos, estado = 200, extra = {}) {
  return new Response(JSON.stringify(datos), { status: estado, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS, ...extra } });
}
async function cuerpo(req) {
  try { return await req.json(); } catch (e) { throw new Problema("Solicitud incompleta.", 400); }
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const ruta = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (ruta === "/" && req.method === "GET") return respuesta({ ok: true, servicio: "Nube del Lector de Hojas de Respuesta" });
      if (ruta === "/borrar-cuenta" && req.method === "GET") {
        return new Response(PAGINA_BORRAR, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      }
      if (!env.DB) throw new Problema("Falta unir el servidor con la base de datos (enlace D1 llamado DB).", 503);
      if (!env.CLAVE_SESION || String(env.CLAVE_SESION).length < 20) throw new Problema("Falta el secreto CLAVE_SESION en el servidor (al menos 20 letras).", 503);
      const db = env.DB;
      await prepararTablas(db);
      const ip = req.headers.get("CF-Connecting-IP") || "local";

      if (ruta === "/estado" && req.method === "GET") {
        const fila = await db.prepare("SELECT v FROM estado WHERE k = 'correo'").first();
        const n = await db.prepare("SELECT COUNT(*) AS n FROM cuentas").first();
        return respuesta({ ok: true, correoConfigurado: !!(env.CORREO_URL && env.CORREO_CLAVE), ultimoCorreo: fila ? JSON.parse(fila.v) : null, cuentas: n.n });
      }
      if (req.method === "POST" && ruta === "/codigo") return respuesta(await pedirCodigo(db, env, ip, await cuerpo(req)));
      if (req.method === "POST" && ruta === "/clave") return respuesta(await elegirClave(db, env, await cuerpo(req)));
      if (req.method === "POST" && ruta === "/entrar") return respuesta(await entrar(db, env, ip, await cuerpo(req)));
      if (req.method === "POST" && ruta === "/borrar-cuenta") return respuesta(await borrarCuenta(db, env, req, ip, await cuerpo(req)));

      if (ruta === "/datos" && req.method === "GET") return respuesta(await listar(db, await cuentaDeSesion(db, env, req)));
      const m = /^\/datos\/([^/]+)$/.exec(ruta);
      if (m) {
        const clave = decodeURIComponent(m[1]);
        if (!CLAVE_DOC.test(clave)) throw new Problema("Documento no válido.", 400);
        const c = await cuentaDeSesion(db, env, req);
        if (req.method === "GET") {
          const doc = await leerDoc(db, c, clave);
          return new Response(doc.datos, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...CORS, "X-Version": String(doc.version), "X-Actualizado": String(doc.actualizado) } });
        }
        if (req.method === "PUT") {
          const base = url.searchParams.has("base") ? Number(url.searchParams.get("base")) : NaN;
          if (!Number.isInteger(base) || base < 0) throw new Problema("Falta la versión.", 400);
          const largo = Number(req.headers.get("Content-Length") || 0);
          if (largo > MAX_DOC * 3) throw new Problema("Hay demasiados datos para guardarlos en la nube de una vez.", 413);
          const datos = await req.text();
          const equipo = String(req.headers.get("X-Equipo") || "").slice(0, 60);
          return respuesta(await guardarDoc(db, c, clave, base, datos, equipo));
        }
      }
      return respuesta({ error: "No encontrado" }, 404);
    } catch (e) {
      if (e instanceof Problema) return respuesta({ error: e.message, ...e.extra }, e.estado);
      return respuesta({ error: String((e && e.message) || e) }, 500);
    }
  },
};
