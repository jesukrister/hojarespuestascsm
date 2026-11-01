# corrigeya.cl: portada y traer los datos de la dirección antigua

## Direcciones

| Dirección | Qué es | Archivo |
|---|---|---|
| `corrigeya.cl/` | Portada: la presentación de CorrigeYa | `index.html` |
| `corrigeya.cl/app/` | CorrigeYa (la versión Pro) | `app/index.html`, generado por `node scripts/build-pro.js` (es `pro.html` con `<base href="../">`) |
| `corrigeya.cl/pro.html` | Lo mismo que `/app/` (para los enlaces antiguos) | `pro.html` (generado) |
| `corrigeya.cl/lector.html` | Lector de Hojas normal (también es la app normal de Android) | `lector.html` (antes `index.html`) |
| `corrigeya.cl/corrigeya/` | Redirige a la portada | `corrigeya/index.html` |
| `corrigeya.cl/admin/` | Panel de administración | `admin/` |
| `corrigeya.cl/traer.html` | Traer los datos de la dirección antigua | `traer.html`, `js/traer.js` |

Al tener el dominio puesto, GitHub manda `jesukrister.github.io/hojarespuestascsm/…` a
`corrigeya.cl/…` (misma ruta). Por eso `index.html` antiguo lleva a la portada, y `pro.html`
sigue abriendo CorrigeYa.

## Por qué hay que traer los datos

El navegador guarda los datos **por sitio**. Lo que alguien guardó usando la página en
`jesukrister.github.io` (prueba, hojas, fotos, cursos, libro de notas) sigue en su navegador,
pero `corrigeya.cl` no lo ve. Quien tiene cuenta en la nube sólo tiene que entrar; el resto
tiene que traerlos una vez. La app de Android no se ve afectada.

## Cómo funciona

1. En `corrigeya.cl/app/` (o `lector.html`), quien llega **sin datos** ve arriba el aviso «📦
   ¿Usabas el Lector de Hojas en la dirección antigua? **Traer mis datos**». También está en el
   menú ⋯ de la prueba: «📦 Traer mis datos de la dirección antigua». Mientras se muestra el
   aviso, no se abren el tutorial ni la pregunta del modo.
2. `traer.html` → **Buscar mis datos** abre en otra pestaña la dirección antigua (`jesukrister.github.io/hojarespuestascsm/`).
3. Esa página (`mudanza/index.html`) está en el **sitio antiguo**, así que puede leer lo que
   el Lector guardó ahí. Muestra un resumen y se lo manda **sólo** a `corrigeya.cl`
   (`postMessage` con el origen fijo; el navegador no lo entrega a otro sitio).
4. `traer.html` muestra qué encontró (por ejemplo: «la prueba «Historia 7°A» con 32 hojas
   corregidas, 3 cursos, 32 fotos») y, al aceptar, lo guarda tal cual. Si en `corrigeya.cl` ya
   había datos en ese navegador, avisa que se reemplazan.
5. La pestaña antigua se cierra sola y queda el botón **Abrir CorrigeYa**.

Nada pasa por un servidor: los datos van de una pestaña a la otra en el mismo navegador.

## Dónde se publica la página de mudanza

`mudanza/index.html` se publica en la **dirección antigua**, `https://jesukrister.github.io/hojarespuestascsm/`:
al pasar el proyecto a `corrigeya/app` (ver `docs/mover-a-corrigeya.md`), el repositorio
`jesukrister/hojarespuestascsm` queda sólo con esa página, como `index.html` y como `404.html`.
Así también atiende a quien llega con un enlace o favorito antiguo:

- **sin datos guardados** (o si ya los llevó): pasa directo a la página equivalente de
  `corrigeya.cl` (`pro.html` → `/app/`, la raíz → la portada);
- **con datos**: ve «CorrigeYa se mudó a corrigeya.cl», lo que encontramos y el botón **Llevar mis
  datos a corrigeya.cl** (que abre `corrigeya.cl/traer.html`).

No hace falta un repositorio `mudanza` aparte. El repositorio antiguo no se borra ni se renombra.

## Probar

- En un navegador donde usabas la dirección antigua: abre `https://corrigeya.cl/traer.html` →
  **Buscar mis datos** → **Traer a corrigeya.cl** → **Abrir CorrigeYa**.
- Si el navegador bloquea la otra pestaña, permite las ventanas emergentes para corrigeya.cl.
- En incógnito no hay datos guardados, así que no encontrará nada.
