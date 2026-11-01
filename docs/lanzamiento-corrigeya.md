# Lanzar CorrigeYa (gratis + Plus en una sola app)

CorrigeYa es **una sola app** (la Pro actual, `cl.lectorhojas.app.pro`) con la
suscripción **CorrigeYa Plus** adentro, cobrada por Google Play. Todo está
listo en el código, apagado con un interruptor: `js/lanzamiento.js`.

| | Gratis | Plus ($1.990 al mes) |
|---|---|---|
| Hoja de respuestas, corregir con foto, escaneo continuo, PDF | ✔ | ✔ |
| Cursos, libro de notas, varios cursos, PIE, análisis | ✔ | ✔ |
| Excel y evidencias (ZIP), Excel del curso | | ✔ |
| Informes por estudiante, para UTP y del curso | | ✔ |
| Guardado en la nube | | ✔ |
| Modo simple | | ✔ |
| Agenda, recordatorios y horario | | ✔ |

## 1. Probarlo antes, sólo en tu equipo

Abre la app con `?lanzamiento=1` al final de la dirección (por ejemplo,
`…/pro.html?lanzamiento=1`): se ve como quedará CorrigeYa, sólo en ese
navegador. `?lanzamiento=0` lo quita. Para verla como suscriptor, en el panel
`/admin` → **Códigos Plus → 🧪 Probar Plus en este navegador** (crea un código de
un día). `?plus=1` sólo sirve antes del lanzamiento: con CorrigeYa lanzado ya no
activa nada.

## 2. Crear la suscripción en Play Console

1. Si no lo tienes, crea el **perfil de pagos** (Play Console → *Configuración
   → Perfil de pagos*). Google pide los datos de la cuenta bancaria donde
   deposita.
2. Entra a la app **Lector Hojas Pro** → *Monetizar → Productos →
   Suscripciones → Crear suscripción*:
   - **ID del producto:** `corrigeya_plus` (tiene que ser exactamente este; está en `js/lanzamiento.js`).
   - **Nombre:** CorrigeYa Plus.
3. Dentro de la suscripción, *Agregar plan básico*:
   - ID: `mensual` · Tipo: *Renovación automática* · Período: *1 mes*.
   - Precio: **CLP 1.990** para Chile (Google propone los demás países).
   - *Activar*.
4. Para probar el pago sin que te cobren: *Configuración → Pruebas de
   licencia* → agrega tu correo de Google. Con ese correo, las compras en la
   app son de prueba.

Google se queda con el 15 % de cada suscripción.

## 3. Encender el lanzamiento

Antes, deja lista la verificación de Google Play en el servidor (`nube/GUIA.md`, paso 10).

1. En `js/lanzamiento.js` cambia `corrigeya: false` por `corrigeya: true` y
   sube el cambio (o pídeselo a Claude).
2. La compilación automática hace el resto: la app Pro pasa a llamarse
   **CorrigeYa** en el teléfono y llega a Google Play.
3. En Play Console, cambia la **ficha** de la app Pro: nombre «CorrigeYa:
   corrige pruebas», descripción y capturas (la página `corrigeya/` tiene los
   textos).
4. En el panel `/admin` → **Configuración**, marca **«Guardar en la nube pide CorrigeYa Plus»**
   y guarda. Desde ahí el servidor sólo guarda en la nube a cuentas con Plus (código o Google
   Play). Nadie pierde datos: quedan en la nube y en su equipo.
5. En Play Console → *Contenido de la app → Seguridad de los datos*, agrega **Información
   financiera → Historial de compras** (recopilado, ligado a la cuenta de la nube, para el
   funcionamiento de la app): la app manda el comprobante de la compra de Plus al servidor cuando
   la persona entra a la nube.
6. Cuando la nueva versión esté aprobada, pasa la app de la prueba cerrada a
   **producción** si quieres que cualquiera la encuentre.

## 4. La app normal y la página

- **Página web:** `pro.html` es CorrigeYa. La versión normal (`index.html`)
  muestra un aviso «Lector de Hojas ahora es CorrigeYa» con un botón para
  abrirla (cada 3 días si eligen «Seguir aquí»). Al abrir CorrigeYa en el mismo
  navegador, ofrece traer su prueba y sus hojas.
- **App normal de Android:** muestra el mismo aviso con el botón para instalar
  CorrigeYa desde Google Play (y cómo llevar su prueba con *Exportar / Importar
  configuración*). Después de unas semanas, despublícala en Play Console
  (*Configuración → Avanzada → Disponibilidad de la app → Despublicar*).
- **Dominio corrigeya.cl:** cuando lo compres, avísale a Claude para dejar la
  página de `corrigeya/` como portada y conectar el dominio a GitHub Pages.

## 5. Lo que falta (siguientes pasos)

- **Pagar en la web con tarjeta** (Mercado Pago). Hoy, en la web, el cuadro de
  Plus explica que se contrata desde la app de Android.
- **Plus en todos los equipos (listo):** con la sesión de la nube abierta, el
  código o la compra de Google Play quedan en la cuenta y Plus se activa en cada
  equipo donde la persona entre. La compra se confirma con Google en el servidor
  (`nube/GUIA.md`, paso 10).
- **Qué no se puede saltar:** guardar en la nube lo revisa el servidor. Excel,
  informes, modo simple y agenda funcionan dentro del equipo (sin subir datos de
  estudiantes), así que alguien que sepa programar podría habilitarlos en su
  propio equipo; es lo normal en cualquier página o app que trabaja sin servidor.
