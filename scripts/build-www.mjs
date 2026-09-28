// Copia los archivos de la página a www/ (lo que se empaqueta en la app Android).
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const item of ['index.html', 'privacidad.html', 'css', 'js', 'vendor']) {
  cpSync(join(root, item), join(out, item), { recursive: true });
}
console.log('www/ listo');
