# Dejar el repositorio privado

El código queda privado sin moverlo: se cambia la visibilidad de **este mismo
repositorio**. Así siguen funcionando la publicación automática en Google Play,
las claves (secretos) y el número de versión de la app.

## Antes de empezar

- **GitHub Pro** (o Team): con un plan gratuito, GitHub Pages no publica
  desde repositorios privados. Se contrata en *tu foto (arriba a la derecha) →
  Settings → Billing and plans → Plans and usage → Upgrade*.
- **La página sigue siendo pública.** Lo que queda privado es el repositorio:
  el historial, la documentación y los scripts. Ojo: el código de la página
  igual lo puede ver quien la abre en el navegador (así funcionan todas las
  páginas web).

## Pasos

1. Contrata GitHub Pro (ver arriba).
2. En el repositorio: *Settings → General →* (al final) *Danger Zone →
   Change repository visibility → Change to private*. GitHub pide escribir el
   nombre del repositorio para confirmar.
3. Revisa *Settings → Pages*: debe seguir publicando desde la misma rama y la
   carpeta `/ (root)`. Si quedó desactivado, vuelve a elegirlas y guarda. La
   dirección de la página no cambia.
4. Sube cualquier cambio (o en *Actions → App Android (APK) → Run workflow*)
   y revisa que la compilación termine bien y llegue a Google Play.

## Qué cambia

| Qué | Con el repositorio privado |
|---|---|
| Página web (app normal, Pro y `corrigeya/`) | Sigue pública, en la misma dirección. |
| Publicación en Google Play | Igual: la conexión con Google está atada al nombre del repositorio, no a si es público. |
| Secretos y variables (llave de firma, Google Play) | Se mantienen. |
| Nube (Cloudflare) y correos (Apps Script) | No cambian. |
| *Releases → app-android* (APK y AAB) | Sólo los ves tú. Los profes instalan la app desde Google Play (el manual ya lo dice así). |
| *Issues* | Sólo los ves tú. La política de privacidad ya da el contacto por Instagram. |
| Minutos de GitHub Actions | Los repositorios privados tienen un cupo mensual (con Pro, 3.000 minutos). Cada compilación de la app usa unos 10 a 15. |

## No renombres el repositorio

Si le cambias el nombre (por ejemplo a «corrigeya»):

- cambia la dirección de la página (`…github.io/<nuevo-nombre>/`);
- se corta la publicación automática en Google Play hasta rehacer la conexión
  con Google (paso 9.1 b de `docs/google-play.md` con el nombre nuevo en
  `REPO=`).

Si algún día lo haces, avísale a Claude para revisar todo lo que depende del
nombre. Para el dominio propio (corrigeya.cl) no hace falta renombrar nada.
