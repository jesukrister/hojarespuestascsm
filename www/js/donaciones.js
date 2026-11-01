/*
 * DONACIONES (sólo en la página web; en la app Android no aparecen, como exige
 * Google Play para donaciones al desarrollador). Las dos formas son opcionales:
 * si ambas quedan vacías, no se muestra ningún botón de donación.
 *
 * 1) Transferencia directa a tu cuenta (sin comisión): completa tus datos.
 *    Al tocar «Apoyar», se muestran con un botón para copiarlos y pegarlos en
 *    la app del banco. Ojo: estos datos quedan públicos en la página.
 *
 * 2) Enlace de pago con tarjeta (Mercado Pago, Flow, Khipu, Ko-fi…): pega la
 *    dirección entre las comillas de «url».
 */
window.DONACIONES = {
  transferencia: {
    nombre: '', //   Ej.: 'Francesco Vivero'
    rut: '', //      Ej.: '12.345.678-9'
    banco: '', //    Ej.: 'Banco de Chile'
    tipo: '', //     Ej.: 'Cuenta corriente'
    numero: '', //   Ej.: '00-123-45678-09'
    correo: '', //   Ej.: 'donaciones@ejemplo.cl' (opcional)
  },
  url: '',
  texto: 'Apoya este proyecto',
};
