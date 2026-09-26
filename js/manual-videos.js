/*
 * VIDEOS DEL MANUAL
 *
 * Pega el enlace de cada video entre las comillas y guarda el archivo.
 * El video aparece en la parte correspondiente de la pestaña "Manual".
 * Si una parte no tiene video, se deja vacía: ''.
 *
 * Sirven enlaces de:
 *   - YouTube:       'https://www.youtube.com/watch?v=XXXXXXXXXXX'  o  'https://youtu.be/XXXXXXXXXXX'
 *                    (también videos "no listados")
 *   - Vimeo:         'https://vimeo.com/123456789'
 *   - Google Drive:  'https://drive.google.com/file/d/XXXXXXXX/view'
 *                    (compartido como "Cualquier persona con el enlace")
 *   - Un archivo de video guardado junto a la página, por ejemplo en una
 *     carpeta "videos":  'videos/escanear.mp4'
 */
window.MANUAL_VIDEOS = {
  inicio: '', //      0. Cómo funciona la plataforma
  prueba: '', //      1. Pestaña Prueba
  evaluacion: '', //  2. Pestaña Evaluación
  filas: '', //       2b. Filas A, B, C y D
  hoja: '', //        3. Pestaña Hoja
  escanear: '', //    4. Pestaña Escanear
  resultados: '', //  5. Pestaña Resultados
  respaldo: '', //    6. Guardar y respaldar
  problemas: '', //   ?. Problemas frecuentes
};

// true: donde todavía no hay video se muestra el aviso "Video próximamente".
// false: las partes sin video no muestran nada.
window.MANUAL_SHOW_PLACEHOLDERS = true;
