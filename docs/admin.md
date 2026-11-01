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
| **Configuración** | Precio mensual de Plus que muestra la web y la presentación; **la nube pide Plus** (encender al lanzar); permitir canjear códigos; contar visitas; aviso arriba de la página (texto y enlace). |
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

## Estadísticas de la app (más adelante)

Para ver en este panel cuántas hojas se corrigen desde los teléfonos hay que publicar una
versión nueva de la app que mande el mismo conteo anónimo y declararlo en *Play Console →
Contenido de la app → Seguridad de los datos* («Interacciones con la app», anónimo). Por ahora
la app no se tocó.
