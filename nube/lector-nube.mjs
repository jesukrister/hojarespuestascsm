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
   - CorrigeYa: configuración de la página (precio de Plus, aviso), códigos de CorrigeYa Plus y
     estadísticas de uso anónimas de la página web, todo manejado desde el panel /admin.
   Se pega en el panel de Cloudflare (ver nube/GUIA.md). Necesita:
     DB            enlace a la base de datos D1
     CLAVE_SESION  secreto largo inventado (firma las sesiones)
     CORREO_URL    dirección /exec del script de Google
     CORREO_CLAVE  la misma CLAVE escrita en el script de Google
     ADMIN_CLAVE   contraseña del panel /admin (al menos 12 letras; sin ella el panel no abre)
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
    db.prepare("CREATE TABLE IF NOT EXISTS plus_codigos (codigo TEXT PRIMARY KEY, nota TEXT NOT NULL DEFAULT '', dias INTEGER NOT NULL, usos_max INTEGER NOT NULL, usos INTEGER NOT NULL DEFAULT 0, creado INTEGER NOT NULL, caduca INTEGER, revocado INTEGER)"),
    db.prepare("CREATE TABLE IF NOT EXISTS plus_canjes (codigo TEXT NOT NULL, equipo TEXT NOT NULL, t INTEGER NOT NULL, hasta INTEGER NOT NULL, PRIMARY KEY (codigo, equipo))"),
    db.prepare("CREATE TABLE IF NOT EXISTS uso (dia TEXT NOT NULL, pagina TEXT NOT NULL, evento TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (dia, pagina, evento))"),
    db.prepare("CREATE TABLE IF NOT EXISTS uso_visitantes (dia TEXT NOT NULL, h TEXT NOT NULL, pagina TEXT NOT NULL, PRIMARY KEY (dia, h, pagina))"),
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

/* ---------- CorrigeYa: configuración de la página ---------- */
// Lo cambia el panel /admin. Sólo lo usa la página web: la app de Android no lo lee.
const CONFIG_BASE = { precio: 1990, canje: true, estadisticas: true, aviso: { activo: false, texto: "", enlace: "" } };
const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

function limpiarConfig(c) {
  c = c && typeof c === "object" ? c : {};
  const aviso = c.aviso && typeof c.aviso === "object" ? c.aviso : {};
  const precio = Math.round(Number(c.precio));
  const textoAviso = String(aviso.texto || "").trim().slice(0, 280);
  const enlace = String(aviso.enlace || "").trim().slice(0, 300);
  return {
    precio: c.precio !== undefined && Number.isFinite(precio) && precio >= 0 && precio <= 100000 ? precio : CONFIG_BASE.precio,
    canje: c.canje !== false,
    estadisticas: c.estadisticas !== false,
    aviso: { activo: !!aviso.activo && !!textoAviso, texto: textoAviso, enlace: /^https:\/\/[^\s"'<>]+$/i.test(enlace) ? enlace : "" },
  };
}
async function leerConfig(db) {
  const fila = await db.prepare("SELECT v FROM estado WHERE k = 'config'").first();
  let c = {};
  try { c = fila ? JSON.parse(fila.v) : {}; } catch (e) { c = {}; }
  return limpiarConfig(c);
}
// Lo que ve la página (con el precio ya escrito).
function configPublica(c) {
  return { ...c, precioTexto: `$${miles(c.precio)} al mes`, precioCorto: `$${miles(c.precio)}` };
}

/* ---------- Panel /admin ---------- */
const DURACION_ADMIN = 12 * 3600000;
// La firma incluye la contraseña del panel: al cambiarla se cierran las sesiones abiertas.
const llaveAdmin = (env) => crypto.subtle.importKey("raw", texto("admin|" + env.CLAVE_SESION + "|" + env.ADMIN_CLAVE), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
function adminListo(env) {
  if (!env.ADMIN_CLAVE || String(env.ADMIN_CLAVE).length < 12) throw new Problema("Falta el secreto ADMIN_CLAVE en el servidor (al menos 12 letras). Mira nube/GUIA.md, paso 9.", 503);
}
async function entrarAdmin(db, env, ip, d) {
  adminListo(env);
  const porIp = "admin-ip:" + ip;
  await revisarEspera(db, [porIp, "admin"]);
  if (!(await mismaClave(String((d && d.clave) || ""), String(env.ADMIN_CLAVE)))) {
    await anotarFallo(db, "admin", 50);
    const bloqueado = await anotarFallo(db, porIp, 5);
    throw new Problema(bloqueado ? "Contraseña incorrecta. Por seguridad, espera 15 minutos antes de intentarlo de nuevo." : "Contraseña incorrecta.", 401);
  }
  await db.prepare("DELETE FROM intentos WHERE llave = ?").bind(porIp).run();
  const vence = Date.now() + DURACION_ADMIN;
  const datos = b64url(texto(JSON.stringify({ a: 1, e: vence })));
  return { token: datos + "." + b64url(await crypto.subtle.sign("HMAC", await llaveAdmin(env), texto(datos))), vence };
}
async function revisarAdmin(env, req) {
  adminListo(env);
  const m = /^Bearer ([A-Za-z0-9_-]{10,200})\.([A-Za-z0-9_-]{20,})$/.exec(req.headers.get("Authorization") || "");
  const fuera = () => new Problema("La sesión del panel venció. Vuelve a entrar.", 401, { salir: true });
  if (!m || !(await crypto.subtle.verify("HMAC", await llaveAdmin(env), deB64url(m[2]), texto(m[1])))) throw fuera();
  let d;
  try { d = JSON.parse(new TextDecoder().decode(deB64url(m[1]))); } catch (e) { throw fuera(); }
  if (!d || d.a !== 1 || !(d.e > Date.now())) throw fuera();
}

async function guardarConfig(db, d) {
  const c = limpiarConfig({ ...(await leerConfig(db)), ...(d || {}) });
  await guardarEstado(db, "config", c);
  return configPublica(c);
}

async function resumenAdmin(db, env) {
  const ahora = Date.now();
  const hace = (dias) => ahora - dias * 864e5;
  const uno = (sql, ...a) => db.prepare(sql).bind(...a).first();
  const [cuentas, nuevas, activas7, activas30, espacio, codigos, enUso, plusActivos] = await Promise.all([
    uno("SELECT COUNT(*) AS n FROM cuentas"),
    uno("SELECT COUNT(*) AS n FROM cuentas WHERE creado > ?", hace(30)),
    uno("SELECT COUNT(DISTINCT cuenta) AS n FROM docs WHERE actualizado > ?", hace(7)),
    uno("SELECT COUNT(DISTINCT cuenta) AS n FROM docs WHERE actualizado > ?", hace(30)),
    uno("SELECT COALESCE(SUM(tamano), 0) AS n FROM docs"),
    uno("SELECT COUNT(*) AS n FROM plus_codigos"),
    uno("SELECT COUNT(*) AS n FROM plus_codigos WHERE usos > 0 AND revocado IS NULL"),
    uno("SELECT COUNT(*) AS n FROM plus_canjes j JOIN plus_codigos c ON c.codigo = j.codigo WHERE c.revocado IS NULL AND (j.hasta = 0 OR j.hasta > ?)", ahora),
  ]);
  const correo = await db.prepare("SELECT v FROM estado WHERE k = 'correo'").first();
  return {
    nube: { cuentas: cuentas.n, nuevas30: nuevas.n, activas7: activas7.n, activas30: activas30.n, espacio: espacio.n },
    plus: { codigos: codigos.n, enUso: enUso.n, equiposActivos: plusActivos.n },
    config: configPublica(await leerConfig(db)),
    servidor: { correoConfigurado: !!(env.CORREO_URL && env.CORREO_CLAVE), ultimoCorreo: correo ? JSON.parse(correo.v) : null, hoy: hoy() },
  };
}

/* ---------- Códigos de CorrigeYa Plus ---------- */
// CY-XXXX-XXXX-XXXX con 32 letras que no se confunden (sin 0, O, 1 ni I): 60 bits al azar.
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function nuevoCodigo() {
  const s = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => ALFABETO[b % 32]).join("");
  return `CY-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
function normalizarCodigo(c) {
  let s = String(c || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (s.length === 14 && s.startsWith("CY")) s = s.slice(2);
  if (s.length !== 12 || [...s].some((ch) => !ALFABETO.includes(ch))) return null;
  return `CY-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
const entero = (v, min, max, base) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : base;
};

async function crearCodigos(db, d) {
  d = d || {};
  const cantidad = entero(d.cantidad, 1, 100, 1);
  const dias = entero(d.dias, 0, 3650, 30); // 0: Plus sin fecha de término
  const usosMax = entero(d.usosMax, 1, 50, 1); // equipos (navegadores) que pueden usarlo
  const caducaDias = entero(d.caducaDias, 0, 3650, 0); // 0: se puede canjear cuando sea
  const nota = String(d.nota || "").trim().slice(0, 80);
  const ahora = Date.now();
  const caduca = caducaDias ? ahora + caducaDias * 864e5 : null;
  const codigos = [];
  while (codigos.length < cantidad) {
    const c = nuevoCodigo();
    if (!codigos.includes(c)) codigos.push(c);
  }
  await db.batch(codigos.map((c) => db.prepare("INSERT INTO plus_codigos (codigo, nota, dias, usos_max, usos, creado, caduca, revocado) VALUES (?, ?, ?, ?, 0, ?, ?, NULL)").bind(c, nota, dias, usosMax, ahora, caduca)));
  return { codigos };
}
async function listarCodigos(db) {
  const { results } = await db.prepare(
    "SELECT c.codigo, c.nota, c.dias, c.usos_max AS usosMax, c.usos, c.creado, c.caduca, c.revocado, MAX(j.t) AS ultimoCanje, MAX(CASE WHEN j.hasta = 0 THEN 9e15 ELSE j.hasta END) AS hasta FROM plus_codigos c LEFT JOIN plus_canjes j ON j.codigo = c.codigo GROUP BY c.codigo ORDER BY c.creado DESC, c.codigo LIMIT 1000"
  ).all();
  return { codigos: results.map((r) => ({ ...r, hasta: r.hasta === null ? null : r.hasta >= 9e15 ? 0 : r.hasta })), ahora: Date.now() };
}
async function anularCodigo(db, d) {
  const codigo = normalizarCodigo(d && d.codigo);
  if (!codigo) throw new Problema("Código no válido.", 400);
  const r = await db.prepare("UPDATE plus_codigos SET revocado = ? WHERE codigo = ?").bind(d.anular === false ? null : Date.now(), codigo).run();
  if (!r.meta.changes) throw new Problema("Ese código no existe.", 404);
  return { ok: true };
}
async function borrarCodigo(db, d) {
  const codigo = normalizarCodigo(d && d.codigo);
  if (!codigo) throw new Problema("Código no válido.", 400);
  await db.batch([db.prepare("DELETE FROM plus_canjes WHERE codigo = ?").bind(codigo), db.prepare("DELETE FROM plus_codigos WHERE codigo = ?").bind(codigo)]);
  return { ok: true };
}

// Plus canjeado en un navegador: la página guarda esta firma y la revisa de vez en cuando.
const llavePlus = (env) => crypto.subtle.importKey("raw", texto("plus|" + env.CLAVE_SESION), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
const EQUIPO = /^[0-9a-f]{32}$/;
async function firmarPlus(env, codigo, equipo) {
  const datos = b64url(texto(JSON.stringify({ c: codigo, q: equipo })));
  return datos + "." + b64url(await crypto.subtle.sign("HMAC", await llavePlus(env), texto(datos)));
}
async function canjear(db, env, ip, d) {
  d = d || {};
  if (!(await leerConfig(db)).canje) throw new Problema("Por ahora no se pueden canjear códigos.", 403);
  const porIp = "canje-ip:" + ip;
  await revisarEspera(db, [porIp]);
  const equipo = String(d.equipo || "");
  if (!EQUIPO.test(equipo)) throw new Problema("Solicitud incompleta.", 400);
  const codigo = normalizarCodigo(d.codigo);
  const fila = codigo ? await db.prepare("SELECT * FROM plus_codigos WHERE codigo = ?").bind(codigo).first() : null;
  if (!fila) {
    await anotarFallo(db, porIp, 10);
    throw new Problema("Ese código no existe. Revisa que esté bien escrito (CY- y 12 letras o números).", 404);
  }
  if (fila.revocado) throw new Problema("Ese código fue anulado.", 403);
  const ahora = Date.now();
  const previo = await db.prepare("SELECT hasta FROM plus_canjes WHERE codigo = ? AND equipo = ?").bind(codigo, equipo).first();
  let hasta;
  if (previo) {
    hasta = previo.hasta; // el mismo navegador otra vez: no gasta otro uso
  } else {
    if (fila.caduca && fila.caduca < ahora) throw new Problema("Ese código ya venció: había que canjearlo antes.", 403);
    const usado = () => new Problema(fila.usos_max === 1 ? "Ese código ya se usó en otro equipo." : `Ese código ya se usó en ${fila.usos_max} equipos.`, 403);
    if (fila.usos >= fila.usos_max) throw usado();
    const r = await db.prepare("UPDATE plus_codigos SET usos = usos + 1 WHERE codigo = ? AND usos < usos_max").bind(codigo).run();
    if (!r.meta.changes) throw usado();
    hasta = fila.dias > 0 ? ahora + fila.dias * 864e5 : 0;
    await db.prepare("INSERT INTO plus_canjes (codigo, equipo, t, hasta) VALUES (?, ?, ?, ?)").bind(codigo, equipo, ahora, hasta).run();
  }
  if (hasta && hasta < ahora) throw new Problema("El Plus de este código ya terminó.", 403);
  return { ok: true, activa: true, hasta, codigo, token: await firmarPlus(env, codigo, equipo) };
}
async function verificarPlus(db, env, d) {
  const m = /^([A-Za-z0-9_-]{10,300})\.([A-Za-z0-9_-]{20,})$/.exec(String((d && d.token) || ""));
  const no = (motivo) => ({ activa: false, motivo });
  if (!m || !(await crypto.subtle.verify("HMAC", await llavePlus(env), deB64url(m[2]), texto(m[1])))) return no("El código guardado en este equipo no es válido.");
  let t;
  try { t = JSON.parse(new TextDecoder().decode(deB64url(m[1]))); } catch (e) { return no("El código guardado en este equipo no es válido."); }
  const fila = await db.prepare("SELECT c.revocado, j.hasta FROM plus_codigos c JOIN plus_canjes j ON j.codigo = c.codigo WHERE c.codigo = ? AND j.equipo = ?").bind(t.c, t.q).first();
  if (!fila) return no("Ese código ya no existe.");
  if (fila.revocado) return no("Ese código fue anulado.");
  if (fila.hasta && fila.hasta < Date.now()) return no("El Plus de tu código terminó.");
  return { activa: true, hasta: fila.hasta };
}

/* ---------- Estadísticas de uso de la página web ---------- */
// Sólo números por día: cuántas visitas y cuántas hojas se corrigen o imprimen. Sin correos,
// nombres ni direcciones IP. Cada navegador manda un número al azar (no se guarda tal cual,
// sino una huella) para poder contar visitantes distintos.
const PAGINAS = ["normal", "pro", "corrigeya"];
const EVENTOS = ["visita", "movil", "computador", "corregida", "hojas", "prueba", "pauta", "canje"];
const ZONA = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" });
const hoy = () => ZONA.format(new Date());
function diaHace(n) {
  const [a, m, d] = hoy().split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - n)).toISOString().slice(0, 10);
}
async function anotarUso(db, d) {
  d = d || {};
  if (!(await leerConfig(db)).estadisticas) return { ok: true, guardado: false };
  const pagina = String(d.pagina || "");
  if (!PAGINAS.includes(pagina)) throw new Problema("Página no válida.", 400);
  const dia = hoy();
  const cuenta = {};
  for (const ev of Array.isArray(d.eventos) ? d.eventos.slice(0, 200) : []) {
    if (EVENTOS.includes(ev)) cuenta[ev] = Math.min((cuenta[ev] || 0) + 1, 100);
  }
  const lista = Object.entries(cuenta).map(([ev, n]) =>
    db.prepare("INSERT INTO uso (dia, pagina, evento, n) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(dia, pagina, evento) DO UPDATE SET n = n + ?4").bind(dia, pagina, ev, n)
  );
  const visitante = String(d.visitante || "");
  if (lista.length && EQUIPO.test(visitante)) {
    const h = hexDe(await crypto.subtle.digest("SHA-256", texto("uso|" + visitante))).slice(0, 20);
    lista.push(db.prepare("INSERT OR IGNORE INTO uso_visitantes (dia, h, pagina) VALUES (?, ?, ?)").bind(dia, h, pagina));
  }
  if (lista.length) await db.batch(lista);
  // De vez en cuando se borran los visitantes de hace más de 13 meses (los totales por día quedan).
  if (Math.random() < 0.01) await db.prepare("DELETE FROM uso_visitantes WHERE dia < ?").bind(diaHace(400)).run();
  return { ok: true, guardado: lista.length > 0 };
}
async function estadisticas(db, dias) {
  dias = entero(dias, 1, 400, 30);
  const desde = diaHace(dias - 1);
  const todos = (sql) => db.prepare(sql).bind(desde).all().then((r) => r.results);
  const [filas, unicosDia, unicosDiaTotal, unicos, total] = await Promise.all([
    todos("SELECT dia, pagina, evento, n FROM uso WHERE dia >= ? ORDER BY dia"),
    todos("SELECT dia, pagina, COUNT(*) AS n FROM uso_visitantes WHERE dia >= ? GROUP BY dia, pagina ORDER BY dia"),
    todos("SELECT dia, COUNT(DISTINCT h) AS n FROM uso_visitantes WHERE dia >= ? GROUP BY dia ORDER BY dia"),
    todos("SELECT pagina, COUNT(DISTINCT h) AS n FROM uso_visitantes WHERE dia >= ? GROUP BY pagina"),
    db.prepare("SELECT COUNT(DISTINCT h) AS n FROM uso_visitantes WHERE dia >= ?").bind(desde).first(),
  ]);
  return { desde, hasta: hoy(), dias, filas, unicosDia, unicosDiaTotal, unicos, unicosTotal: total.n };
}

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

      // CorrigeYa: lo que usa la página web
      if (ruta === "/config" && req.method === "GET") return respuesta(configPublica(await leerConfig(db)));
      if (req.method === "POST" && ruta === "/uso") return respuesta(await anotarUso(db, await cuerpo(req)));
      if (req.method === "POST" && ruta === "/plus/canjear") return respuesta(await canjear(db, env, ip, await cuerpo(req)));
      if (req.method === "POST" && ruta === "/plus/verificar") return respuesta(await verificarPlus(db, env, await cuerpo(req)));

      // Panel /admin
      if (req.method === "POST" && ruta === "/admin/entrar") return respuesta(await entrarAdmin(db, env, ip, await cuerpo(req)));
      if (ruta.startsWith("/admin/")) {
        await revisarAdmin(env, req);
        if (req.method === "GET" && ruta === "/admin/resumen") return respuesta(await resumenAdmin(db, env));
        if (req.method === "GET" && ruta === "/admin/estadisticas") return respuesta(await estadisticas(db, url.searchParams.get("dias")));
        if (req.method === "GET" && ruta === "/admin/config") return respuesta(configPublica(await leerConfig(db)));
        if (req.method === "POST" && ruta === "/admin/config") return respuesta(await guardarConfig(db, await cuerpo(req)));
        if (req.method === "GET" && ruta === "/admin/codigos") return respuesta(await listarCodigos(db));
        if (req.method === "POST" && ruta === "/admin/codigos") return respuesta(await crearCodigos(db, await cuerpo(req)));
        if (req.method === "POST" && ruta === "/admin/codigos/anular") return respuesta(await anularCodigo(db, await cuerpo(req)));
        if (req.method === "POST" && ruta === "/admin/codigos/borrar") return respuesta(await borrarCodigo(db, await cuerpo(req)));
      }

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
