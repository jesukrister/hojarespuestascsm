# Panel de administración (`/admin`)

Dirección: `https://jesukrister.github.io/hojarespuestascsm/admin/` (con el dominio propio,
`https://corrigeya.cl/admin/`). No aparece en Google (`noindex`) y sólo entra quien sabe la
contraseña del panel (`ADMIN_CLAVE`).

**Activarlo una vez:** `nube/GUIA.md`, paso 9 (pegar el servidor nuevo en Cloudflare y crear el
secreto `ADMIN_CLAVE`).

## Secciones

| Sección | Qué hace |
|---|---|
| **Resumen** | Visitas de hoy y del mes, personas distintas, hojas corregidas en la web, cuentas de la nube (web y app) y códigos de Plus en uso. |
| **Uso de la página** | Visitas, personas, hojas corregidas, hojas de respuesta, pruebas y pautas impresas por día; por página (normal, Pro/CorrigeYa, presentación) y por dispositivo. Descarga en CSV. |
| **Códigos Plus** | Crear códigos `CY-XXXX-XXXX-XXXX` (cuántos, por cuánto tiempo, en cuántos navegadores, fecha límite para canjear y una nota). Copia un mensaje listo para WhatsApp con el enlace que abre la página con el código escrito. Anular, reactivar o borrar. |
| **Configuración** | Precio mensual de Plus que muestra la web y la presentación; **la nube pide Plus** (encender al lanzar); **prueba gratis** y **referidos** (encendidos, días y tope por año); permitir canjear códigos; contar visitas; aviso arriba de la página (texto y enlace). |
| **App Android** | Dónde ver las estadísticas de la app en Play Console (instalaciones, usuarios activos, errores, suscripciones). |
| **Servidor** | Estado del servidor y de los correos con código. |

## Cómo funciona

- Todo se guarda en el servidor de la nube (`nube/lector-nube.mjs`, Cloudflare Worker + D1).
  El panel es una página estática que habla con él.
- La página web lee la configuración al abrirse (y la guarda 10 minutos): un cambio se ve en
  la web en unos minutos.
- **La app de Android no cambia:** `js/web.js` no hace nada dentro de la app. La app sigue
  mostrando el precio de Google Play y no usa códigos ni manda estadísticas.
- **Plus en la cuenta:** si la persona tiene sesión en la nube, el código (o la compra de Google
  Play en la app) queda en su cuenta y Plus le funciona en todos sus equipos. Un código canjeado
  antes en un navegador pasa a la cuenta al entrar a la nube.
- **Qué no se puede saltar:** con **«Guardar en la nube pide CorrigeYa Plus»** encendido, el
  servidor sólo guarda en la nube a cuentas con Plus. Excel, informes, modo simple y agenda
  funcionan en el equipo de cada profe (así no se suben datos de estudiantes), por lo que alguien
  que sepa programar podría habilitarlos en su propio equipo.
- **Probar como suscriptor:** botón **🧪 Probar Plus en este navegador** (código de un día). Con
  CorrigeYa lanzado, `?plus=1` ya no activa nada.
- **Estadísticas:** sólo totales por día, sin datos personales ni IP (ver `privacidad.html`).
  Si alguien quisiera inflarlas a propósito, podría: tómalas como una guía, no como contabilidad.

## Prueba gratis y referidos

- **Prueba gratis** (7 días, se cambia en Configuración): botón «🎁 Probar Plus gratis» en el cuadro
  de Plus. Pide crear la cuenta de la nube (así el correo queda confirmado) y empieza sola al
  entrar. Una vez por correo, aunque se borre la cuenta.
- **Referidos** (15 días por colega): en el cuadro de Plus cada persona ve su enlace
  `corrigeya.cl/?ref=XXXXXXXX`, con botones para copiarlo o enviarlo por WhatsApp. Cuando un
  colega entra con ese enlace y crea su cuenta de la nube (con el código que le llega al correo),
  quien invitó gana los días. Sólo cuentan cuentas nuevas (de los últimos 3 días); nadie se
  invita a sí mismo; un correo cuenta una sola vez; máximo 12 premios por persona al año.
- Los días regalados se suman al final de los que ya tenga (prueba, invitaciones anteriores).
  Funcionan en la web y en la app, porque quedan en la cuenta.
- Se muestran al lanzar CorrigeYa (antes todo es gratis). El **Resumen** muestra cuántas personas
  están en prueba y cuántos colegas se invitaron en 30 días.

## Estadísticas de la app (más adelante)

Para ver en este panel cuántas hojas se corrigen desde los teléfonos hay que publicar una
versión nueva de la app que mande el mismo conteo anónimo y declararlo en *Play Console →
Contenido de la app → Seguridad de los datos* («Interacciones con la app», anónimo). Por ahora
la app no se tocó.
