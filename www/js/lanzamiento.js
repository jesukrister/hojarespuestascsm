/*
 * LANZAMIENTO DE CORRIGEYA: un solo interruptor para todo.
 *
 *   corrigeya: false  (ahora) Todo sigue como siempre. La versión Pro tiene
 *                     todas sus funciones gratis y Plus (agenda y horario)
 *                     sólo se ve con la vista previa (?plus=1).
 *   corrigeya: true   La versión Pro pasa a llamarse CorrigeYa: Excel,
 *                     informes, nube, modo simple y agenda piden CorrigeYa
 *                     Plus, que se paga dentro de la app de Android (Google
 *                     Play). La versión normal invita a pasarse a CorrigeYa.
 *                     La app de Android también se llama CorrigeYa (lo hace
 *                     la compilación al ver este valor).
 *
 * Antes de encenderlo, sigue docs/lanzamiento-corrigeya.md. Para ver cómo
 * queda sin encenderlo para todos, abre la app con ?lanzamiento=1 (sólo en ese
 * equipo; ?lanzamiento=0 lo quita).
 */
window.LANZAMIENTO = {
  corrigeya: false,
  // Suscripción creada en Play Console (Monetizar → Suscripciones) para la app Pro.
  plusProducto: 'corrigeya_plus',
  // Precio que se muestra si Google Play todavía no entrega el suyo.
  plusPrecio: '$1.990 al mes',
  // Ficha de la app en Google Play (la Pro actual, que pasa a ser CorrigeYa).
  appPlay: 'https://play.google.com/store/apps/details?id=cl.lectorhojas.app.pro',
  // Servidor de la nube (nube/lector-nube.mjs): también guarda lo que se cambia en /admin.
  servidor: 'https://lector-nube.colegiosmiqq.workers.dev',
  // Página que entrega los datos guardados en la dirección antigua (mudanza/, docs/mudanza.md).
  mudanza: 'https://jesukrister.github.io/mudanza/',
};

// Prueba del lanzamiento sólo en este equipo (?lanzamiento=1 / ?lanzamiento=0).
(function () {
  try {
    const KEY = 'lectorHojas.lanzamiento';
    const url = new URL(location.href);
    const q = url.searchParams.get('lanzamiento');
    if (q === '1') localStorage.setItem(KEY, '1');
    else if (q === '0') localStorage.removeItem(KEY);
    if (q !== null) {
      url.searchParams.delete('lanzamiento');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    if (localStorage.getItem(KEY) === '1') window.LANZAMIENTO.corrigeya = true;
  } catch (e) {
    /* sin almacenamiento: queda como dice el archivo */
  }
})();
