/* ==========================================================
   Correos de la nube del Lector de Hojas de Respuesta (versión Pro).
   Envía el código de 6 dígitos para crear la cuenta, cambiar la contraseña olvidada
   o borrar la cuenta. El servidor (nube/lector-nube.mjs) lo llama con la CLAVE de abajo.
   Se pega en script.google.com (ver nube/GUIA.md, paso 5). Los correos salen desde
   la cuenta de Google que lo publica.
   ========================================================== */

// Clave: invéntala (larga, sin espacios) y pega LA MISMA en Cloudflare como CORREO_CLAVE
const CLAVE = "cambia-esta-clave";

// Nombre con que llegan los correos
const REMITENTE = "Lector de Hojas de Respuesta";

const TEXTOS = {
  crear: {
    asunto: "Tu código para crear tu cuenta del Lector de Hojas: ",
    para: "Tu código para crear tu cuenta en la nube del Lector de Hojas de Respuesta es:",
    luego: "Escríbelo en la app y después elige tu contraseña.",
  },
  recuperar: {
    asunto: "Tu código para cambiar la contraseña del Lector de Hojas: ",
    para: "Tu código para elegir una contraseña nueva en el Lector de Hojas de Respuesta es:",
    luego: "Escríbelo en la app y después elige tu contraseña nueva. Al cambiarla se cierra la sesión en tus otros equipos: vuelve a entrar en ellos con la contraseña nueva.",
  },
  borrar: {
    asunto: "Tu código para borrar tu cuenta del Lector de Hojas: ",
    para: "Pediste borrar tu cuenta de la nube del Lector de Hojas de Respuesta. Tu código es:",
    luego: "Al borrar la cuenta se eliminan del servidor tu correo y todos los datos guardados en la nube. No se puede deshacer.",
  },
};

function doPost(e) {
  let d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { return ContentService.createTextOutput("error"); }
  if (!CLAVE || CLAVE === "cambia-esta-clave" || d.clave !== CLAVE) return ContentService.createTextOutput("no");
  if (d.tipo !== "codigo") return ContentService.createTextOutput("no");
  const para = String(d.para || "").trim().toLowerCase().slice(0, 200);
  const t = TEXTOS[d.motivo];
  if (!t || !/^\d{6}$/.test(String(d.codigo)) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(para)) return ContentService.createTextOutput("no");
  MailApp.sendEmail({
    to: para,
    name: REMITENTE,
    subject: t.asunto + d.codigo,
    body:
      "Hola:\n\n" +
      t.para + "\n\n" +
      "    " + d.codigo + "\n\n" +
      "Vence en 15 minutos. " + t.luego + "\n\n" +
      "Si no lo pediste, ignora este correo: nadie puede usar tu correo sin este código.\n\n" +
      REMITENTE,
  });
  return ContentService.createTextOutput("ok");
}

// Para probar: en el editor elige «probar» y presiona Ejecutar (te llega un correo de prueba a ti)
function probar() {
  const yo = Session.getActiveUser().getEmail();
  MailApp.sendEmail({ to: yo, name: REMITENTE, subject: "Prueba del Lector de Hojas", body: "El script puede enviar correos. Quedan " + MailApp.getRemainingDailyQuota() + " envíos por hoy." });
}
