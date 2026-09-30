// Copia los archivos de la página a www/ (lo que se empaqueta en la app Android).
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
// pdf.js sólo lo usa la versión Pro: va únicamente en su app.
const pdfDir = join(root, 'vendor', 'pdf');
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const item of ['index.html', 'privacidad.html', 'css', 'js', 'vendor']) {
  cpSync(join(root, item), join(out, item), { recursive: true, filter: (src) => src !== pdfDir && !src.startsWith(pdfDir + sep) });
}
// App Pro (android/app/src/pro): usa los mismos archivos, pero su página
// principal es pro.html y además lleva pdf.js.
const proAssets = join(root, 'android', 'app', 'src', 'pro', 'assets', 'public');
if (existsSync(join(root, 'android', 'app'))) {
  rmSync(proAssets, { recursive: true, force: true });
  mkdirSync(proAssets, { recursive: true });
  cpSync(join(root, 'pro.html'), join(proAssets, 'index.html'));
  cpSync(pdfDir, join(proAssets, 'vendor', 'pdf'), { recursive: true });
}
console.log('www/ listo');
