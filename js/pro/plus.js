/*
 * CorrigeYa Plus: las funciones de pago (agenda, horario…). Mientras no exista
 * el cobro hay sólo una vista previa oculta: se activa en este equipo abriendo
 * la app con «?plus=1» al final de la dirección y se quita con «?plus=0».
 * Cuando exista la suscripción, aquí se revisará la de la cuenta.
 */
(function () {
  'use strict';
  const Pro = window.LectorPro;
  if (!Pro) return;
  const KEY = 'lectorHojasPro.plus';

  try {
    const url = new URL(location.href);
    const q = url.searchParams.get('plus');
    if (q === '1') localStorage.setItem(KEY, 'vista-previa');
    else if (q === '0') localStorage.removeItem(KEY);
    if (q !== null) {
      url.searchParams.delete('plus');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  } catch (e) {
    /* sin almacenamiento: sin vista previa */
  }

  function preview() {
    try {
      return localStorage.getItem(KEY) === 'vista-previa';
    } catch (e) {
      return false;
    }
  }

  const active = () => preview();
  if (active()) document.documentElement.dataset.plus = '1';
  Pro.plus = { active, preview };
})();
