# Pasar el proyecto a la organización corrigeya (repositorio corrigeya/app)

El repositorio principal pasa de `jesukrister/hojarespuestascsm` a **`corrigeya/app`**: desde ahí
se publica `corrigeya.cl` y se compilan las apps de Android. El repositorio antiguo queda sólo
con la página que trae los datos desde la dirección antigua (ver `docs/mudanza.md`).

Nada cambia para los usuarios: las apps de Google Play son las mismas, la nube (Cloudflare) y sus
cuentas siguen igual, y `corrigeya.cl` sigue en la misma dirección.

> **Claves:** la llave de firma y su contraseña se pegan **sólo** en GitHub (Secrets). No las
> pegues en el chat.

## 0. Antes

- La **app de Claude instalada en la organización corrigeya** (para que Claude suba el código):
  <https://github.com/apps/claude/installations/select_target> → **corrigeya** → All
  repositories (o sólo `app`).
- Tu **llave de firma**: el archivo `lector-hojas-privada.jks` (o el texto `keystore.base64`) y su
  contraseña (`docs/google-play.md`, paso 0). GitHub no deja leer los secretos guardados, así que
  hay que volver a pegarlos en el repositorio nuevo.
  - Si perdiste la llave: en Play Console, en cada app, *Configuración → Integridad de la app →
    Firma de apps → Solicitar restablecimiento de la clave de carga*. Avísale a Claude antes.
- **Repositorio público o privado:** en una organización gratuita, GitHub Pages sólo publica desde
  repositorios **públicos**. Para que `corrigeya/app` sea privado y siga publicando
  `corrigeya.cl`, la organización necesita **GitHub Team** (unos US$4 al mes por persona);
  GitHub Pro (de tu cuenta personal) no sirve para la organización. Puedes empezar público y
  pasarlo a privado al contratar Team.

## 1. Subir el código (lo hace Claude)

Claude sube todo el historial a `corrigeya/app` (rama `main`).

## 2. Secretos y variables en corrigeya/app

En **corrigeya/app → Settings → Secrets and variables → Actions**:

- Pestaña **Secrets → New repository secret**:
  - `KEYSTORE_BASE64`: el contenido de `keystore.base64`. Si sólo tienes el `.jks`, en Windows
    abre PowerShell en la carpeta del archivo y copia lo que muestra:
    `[Convert]::ToBase64String([IO.File]::ReadAllBytes("lector-hojas-privada.jks"))`
  - `KEYSTORE_PASSWORD`: la contraseña de la llave.
- Pestaña **Variables → New repository variable** (no son secretas):
  - `PLAY_WIF_PROVIDER`: `projects/361247162339/locations/global/workloadIdentityPools/github/providers/github`
  - `PLAY_SERVICE_ACCOUNT`: `francescodvdo@hoja-d-respuesta-cl.iam.gserviceaccount.com`

## 3. Permitir que corrigeya/app publique en Google Play

La conexión con Google está atada al nombre del repositorio. En
<https://console.cloud.google.com> (proyecto **hoja-d-respuesta-cl**) abre **Cloud Shell** (`>_`,
arriba a la derecha) y pega:

```bash
PROYECTO=hoja-d-respuesta-cl
CUENTA=francescodvdo@hoja-d-respuesta-cl.iam.gserviceaccount.com
REPO=corrigeya/app
gcloud config set project "$PROYECTO"
gcloud iam workload-identity-pools providers update-oidc github --location=global \
  --workload-identity-pool=github --attribute-condition="assertion.repository=='$REPO'"
NUMERO=$(gcloud projects describe "$PROYECTO" --format='value(projectNumber)')
gcloud iam service-accounts add-iam-policy-binding "$CUENTA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUMERO/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
```

Desde ahí sólo `corrigeya/app` puede publicar (el repositorio antiguo ya no).

## 4. Primera compilación

**corrigeya/app → Actions → App Android (APK) → Run workflow.** Debe terminar en verde y llegar a
Google Play como versión **1.0.101** o más (en el repositorio nuevo se suma 100 al número de
compilación, porque Google Play no acepta números más bajos que los ya publicados).

## 5. Pasar el dominio corrigeya.cl

Un dominio sólo puede estar en un repositorio a la vez:

1. **jesukrister/hojarespuestascsm → Settings → Pages → Custom domain → Remove.**
2. **corrigeya/app → Settings → Pages**: *Source* **Deploy from a branch** → `main` / `(root)` →
   **Save**. En *Custom domain* escribe `corrigeya.cl` → **Save**.
3. Verifica el dominio para la organización (evita que otro lo use): **organización corrigeya →
   Settings → Pages → Add a domain** → `corrigeya.cl`, y agrega en Cloudflare el registro TXT que
   te muestra (igual que hiciste con tu cuenta).
4. Cuando diga «DNS check successful», marca **Enforce HTTPS**.

Los registros de Cloudflare no cambian: siguen apuntando a GitHub Pages.

## 6. La dirección antigua (lo hace Claude)

Con `corrigeya.cl` ya publicando desde `corrigeya/app`, Claude deja `jesukrister/hojarespuestascsm`
sólo con la página de mudanza (`mudanza/index.html`), en `index.html` y `404.html`:

- quien abre un enlace antiguo sin datos guardados pasa directo a la página equivalente de
  `corrigeya.cl` (`pro.html` → `/app/`);
- quien tiene datos ve «CorrigeYa se mudó a corrigeya.cl» y el botón **Llevar mis datos**.

El historial completo queda en `corrigeya/app`; el repositorio antiguo se puede archivar después
(*Settings → Archive*), pero **no lo borres ni le cambies el nombre**: es la dirección antigua.

## Qué no cambia

- Apps de Google Play (mismos paquetes y fichas), la nube de Cloudflare y sus cuentas, el panel
  `/admin` (ahora en `corrigeya.cl/admin/`), los correos de la nube.
