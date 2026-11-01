# Correo con el dominio: contacto@corrigeya.cl en tu Gmail

- **Recibir:** Cloudflare Email Routing reenvía lo que llega a `contacto@corrigeya.cl` a tu Gmail.
- **Responder:** Gmail envía como `contacto@corrigeya.cl` usando el servidor de Brevo.

Todo es gratis (Brevo: hasta 300 correos al día). Tiempo: unos 30 minutos, más la espera de los DNS.

> **Contraseñas y llaves** (la clave SMTP de Brevo, la de Gmail) se escriben **sólo** en esas
> páginas. No las pegues en el chat ni en GitHub.

Puedes cambiar `contacto` por la dirección que prefieras (`hola`, `soporte`…). Si cambias el
nombre, cámbialo en todos los pasos.

## 0. Antes: Cloudflare maneja el dominio

Tiene que estar hecho el **paso 1** de conectar el dominio: `corrigeya.cl` agregado en Cloudflare
y, en nic.cl, los servidores DNS cambiados por los dos de Cloudflare. En Cloudflare, el dominio
debe aparecer como **Activo**.

## 1. Recibir: Cloudflare Email Routing

1. Cloudflare → `corrigeya.cl` → **Correo electrónico → Email Routing → Comenzar**
   (en inglés: *Email → Email Routing → Get started*).
2. **Dirección personalizada:** `contacto`. **Acción:** enviar a un correo → tu Gmail.
3. Cloudflare manda un correo a tu Gmail: ábrelo y presiona **Verify email address**.
4. Cloudflare ofrece **agregar los registros automáticamente** (3 registros MX y 1 TXT con
   `v=spf1 …`). Acepta.
5. Prueba: desde otro correo (no desde tu Gmail), escribe a `contacto@corrigeya.cl`. Debe
   llegarte al Gmail.

## 2. Brevo: autorizar el dominio para enviar

1. Crea una cuenta gratis en <https://www.brevo.com> (puede ser con tu Gmail). Te pide datos de
   la «empresa»: pon CorrigeYa.
2. Arriba a la derecha, tu nombre → **Remitentes, dominios e IP dedicadas → Dominios → Agregar un
   dominio** → `corrigeya.cl`.
3. Brevo muestra los registros para **autenticar** el dominio. Si ofrece **«Autenticar con
   Cloudflare»** (automático), úsalo. Si no, cópialos uno por uno en Cloudflare → `corrigeya.cl`
   → **DNS → Registros → Agregar registro**:
   - **TXT** `brevo-code:…` (en el nombre, `@`).
   - **DKIM**: uno o dos registros (CNAME o TXT, con nombres como `brevo1._domainkey`). Si son
     CNAME, ponlos con la nube **gris** («Solo DNS»).
   - **DMARC**: TXT con nombre `_dmarc` y valor `v=DMARC1; p=none; rua=mailto:contacto@corrigeya.cl`.
     Si Brevo propone otro valor, usa el de Brevo.
4. **SPF: tiene que haber uno solo.** Cloudflare ya creó un TXT que empieza con `v=spf1` (paso 1).
   **No crees otro**: edita ese y deja el valor así:

   ```
   v=spf1 include:_spf.mx.cloudflare.net include:spf.brevo.com ~all
   ```

5. Vuelve a Brevo y presiona **Autenticar este dominio** o **Verificar**. Puede tardar unos
   minutos; los registros deben quedar con ✔.
6. **Remitentes → Agregar un remitente:** nombre `CorrigeYa`, correo `contacto@corrigeya.cl`.
   Si pide confirmarlo, el correo llega a tu Gmail (gracias al paso 1).

## 3. Clave SMTP de Brevo

1. Brevo → tu nombre → **SMTP y API → pestaña SMTP → Generar una nueva clave SMTP**. Nómbrala
   `Gmail`.
2. Copia y deja a mano, sin compartirlos:
   - **Servidor SMTP:** `smtp-relay.brevo.com`
   - **Puerto:** `587`
   - **Usuario (login):** el que aparece ahí (algo como `xxxxxx@smtp-brevo.com`)
   - **Contraseña:** la clave SMTP recién creada (se ve una sola vez)

## 4. Gmail: enviar como contacto@corrigeya.cl

1. Gmail en el computador → ⚙️ → **Ver todos los ajustes → Cuentas e importación → Enviar como →
   Añadir otra dirección de correo**.
2. **Nombre:** `CorrigeYa` (o `Francesco · CorrigeYa`). **Dirección:** `contacto@corrigeya.cl`.
   Deja marcado **Tratar como alias**. Siguiente.
3. **Servidor SMTP:** `smtp-relay.brevo.com` · **Puerto:** `587` · **Usuario:** el login de Brevo
   · **Contraseña:** la clave SMTP · **Conexión segura con TLS**. **Añadir cuenta.**
4. Gmail manda un código a `contacto@corrigeya.cl`. Llega a tu mismo Gmail (por el paso 1):
   ábrelo y confirma.
5. Recomendado, en **Cuentas e importación**:
   - **«Responder desde la misma dirección a la que se envió el mensaje»**: así, a quien te
     escriba a contacto@ le respondes desde contacto@.
   - Si quieres, **«Establecer como predeterminada»**.

En el celular (app de Gmail) aparece sola: al escribir, toca **De** y elige `contacto@corrigeya.cl`.

## 5. Probar que no llegue a spam

1. Envía un correo **desde** `contacto@corrigeya.cl` a otra persona, por ejemplo a una cuenta de
   Outlook o de tu pareja. No sirve enviártelo a ti mismo.
2. En el correo recibido, si es Gmail: **⋮ → Mostrar original**. Debe decir **SPF: PASS**,
   **DKIM: PASS** y **DMARC: PASS**.
3. Si algo dice FAIL, revisa que haya **un solo** registro SPF y que los DKIM de Brevo estén en
   gris («Solo DNS»).

## Después

- Avísale a Claude la dirección final para ponerla en la política de privacidad, la página de
  presentación y el manual, en lugar de Instagram.
- En Play Console → *Ficha de Play Store → Detalles de contacto*, cambia el correo por
  `contacto@corrigeya.cl`.
- Los códigos de la nube siguen saliendo del Gmail del script (`nube/correo.gs`). Para que
  lleguen desde `@corrigeya.cl`, el servidor puede enviarlos con Brevo: pídeselo a Claude.
