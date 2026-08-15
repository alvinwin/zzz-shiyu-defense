import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);

await rm(dist, { recursive: true, force: true });
await mkdir(new URL('data/', dist), { recursive: true });

const html = await readFile(new URL('index.html', root), 'utf8');
const css = await readFile(new URL('styles.css', root));
const js = await readFile(new URL('app.js', root));
const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 10);
const cssName = `styles.${hash(css)}.css`;
const jsName = `app.${hash(js)}.js`;

await writeFile(new URL(cssName, dist), css);
await writeFile(new URL(jsName, dist), js);
await writeFile(
  new URL('index.html', dist),
  html.replace('styles.css', cssName).replace('app.js', jsName),
);
await cp(new URL('data/current.json', root), new URL('data/current.json', dist));
