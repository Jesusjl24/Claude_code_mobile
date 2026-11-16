// After `vite build`: copy index.html to each route so a plain static host
// (no rewrite rules) can serve /scan, /review and /compare directly.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
for (const route of ['scan', 'review', 'compare']) {
  mkdirSync(join(dist, route), { recursive: true });
  copyFileSync(join(dist, 'index.html'), join(dist, route, 'index.html'));
}
copyFileSync(join(dist, 'index.html'), join(dist, '404.html'));
console.log('Copied index.html to scan/, review/, compare/ and 404.html');
