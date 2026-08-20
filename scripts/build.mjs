import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { cycleStatusFromData, validate, validateCycleStatus } from './validate-data.mjs';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);

await rm(dist, { recursive: true, force: true });
await mkdir(new URL('data/', dist), { recursive: true });
await mkdir(new URL('scripts/lib/', dist), { recursive: true });

const html = await readFile(new URL('index.html', root), 'utf8');
const css = await readFile(new URL('styles.css', root));
const js = await readFile(new URL('app.js', root));
const remainingModule = await readFile(new URL('scripts/lib/remaining-time.mjs', root));
const current = JSON.parse(await readFile(new URL('data/current.json', root), 'utf8'));
const dataErrors = validate(current);
if (dataErrors.length) throw new Error(`build: invalid current data: ${dataErrors[0]}`);
const cycleStatus = cycleStatusFromData(current);
const statusErrors = validateCycleStatus(cycleStatus, current);
if (statusErrors.length) throw new Error(`build: invalid cycle status: ${statusErrors[0]}`);
const hash = (value) => createHash('sha256').update(value).digest('hex').slice(0, 10);
const cssName = `styles.${hash(css)}.css`;
const remainingName = `remaining-time.${hash(remainingModule)}.mjs`;
const emittedJs = js.toString().replace('./scripts/lib/remaining-time.mjs', `./scripts/lib/${remainingName}`);
const jsName = `app.${hash(emittedJs)}.js`;

await writeFile(new URL(cssName, dist), css);
await writeFile(new URL(jsName, dist), emittedJs);
await writeFile(
  new URL('index.html', dist),
  html.replace('styles.css', cssName).replace('app.js', jsName),
);
await cp(new URL('data/current.json', root), new URL('data/current.json', dist));
await writeFile(new URL('data/cycle-status.json', dist), `${JSON.stringify(cycleStatus, null, 2)}\n`);
await writeFile(new URL(`scripts/lib/${remainingName}`, dist), remainingModule);
