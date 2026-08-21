import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ELEMENT_ORDER = ['ice', 'fire', 'electric', 'ether', 'physical', 'wind'];
export const NODE_HP_MULTIPLIERS = [10527, 15667, 19389, 21437, 24795];
export const SOURCE_REPOSITORY = 'https://github.com/spiritfxxxx/buhflipexplode';
export const SOURCE_PATHS = [
  'zzz/sd/sd-versions.json',
  'assets/zzz/enemies.json',
  'assets/zzz/buffs.json',
  'zzz/sd/sd.js',
  'LICENSE',
];

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, '..');
const DEFAULT_SOURCE_ROOT = REPO_ROOT;
export const DEFAULT_FETCHED_DATE = '2026-08-14';

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function decodeEntities(value) {
  const entities = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
  };
  return value.replace(/&(?:amp|lt|gt|quot|#39|nbsp);|&#x?[0-9a-f]+;/gi, (entity) => {
    if (entities[entity.toLowerCase()]) return entities[entity.toLowerCase()];
    const hex = entity.match(/^&#x([0-9a-f]+);$/i);
    const decimal = entity.match(/^&#([0-9]+);$/);
    const code = hex ? parseInt(hex[1], 16) : decimal ? parseInt(decimal[1], 10) : NaN;
    return Number.isSafeInteger(code) ? String.fromCodePoint(code) : '';
  });
}

function cleanChunk(value) {
  return decodeEntities(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+/g, ' ');
}

/** Convert the small, known upstream HTML dialect to text and safe emphasis data. */
export function sanitizeHtml(input) {
  const source = String(input ?? '');
  const segments = [];
  let emphasis = 'plain';
  let buffer = '';
  const flush = () => {
    const text = cleanChunk(buffer);
    buffer = '';
    if (!text) return;
    const previous = segments[segments.length - 1];
    if (previous && previous.emphasis === emphasis) previous.text += text;
    else segments.push({ text, emphasis });
  };
  const tokenPattern = /(<[^>]*>)/g;
  for (const token of source.split(tokenPattern)) {
    if (!token) continue;
    if (!token.startsWith('<')) {
      buffer += token;
      continue;
    }
    const lower = token.toLowerCase();
    if (/^<\s*(br|\/li)\b/.test(lower)) {
      flush();
      if (segments.length && !segments[segments.length - 1].text.endsWith('\n')) segments.push({ text: '\n', emphasis: 'plain' });
      continue;
    }
    if (/^<\s*li\b/.test(lower)) continue;
    if (/^<\s*(b|strong)\b/.test(lower)) { flush(); emphasis = 'bold'; continue; }
    if (/^<\s*\/\s*(b|strong)\b/.test(lower)) { flush(); emphasis = 'plain'; continue; }
    if (/^<\s*span\b/.test(lower)) {
      flush();
      emphasis = /font-weight\s*:\s*(?:bold|[6-9]00)/i.test(lower) ? 'bold' : 'colored';
      continue;
    }
    if (/^<\s*\/\s*span\b/.test(lower)) { flush(); emphasis = 'plain'; continue; }
    // Unknown tags are discarded, including attributes and any executable markup.
  }
  flush();
  while (segments[0]?.text === '\n') segments.shift();
  while (segments.at(-1)?.text === '\n') segments.pop();
  const text = segments.map((segment) => segment.text).join('').replace(/[ \t]*\n[ \t]*/g, '\n').trim();
  return { text, segments: segments.filter((segment) => segment.text !== '\n' || segment.text) };
}

function dateFromUpstream(value) {
  const match = String(value).match(/^(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) throw new Error(`unsupported version date: ${value}`);
  return {
    start: `${match[3]}-${match[2]}-${match[1]}`,
    end: `${match[6]}-${match[5]}-${match[4]}`,
  };
}

function gitHead(sourceRoot) {
  const result = spawnSync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function readLiveOrdinal(sourceRoot) {
  const source = fs.readFileSync(path.join(sourceRoot, 'zzz/sd/sd.js'), 'utf8');
  const match = source.match(/\blet\s+vLive\s*=\s*(\d+)\b/);
  if (!match) throw new Error('zzz/sd/sd.js does not declare vLive');
  const ordinal = Number(match[1]);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) throw new Error(`invalid vLive ordinal ${match[1]}`);
  return ordinal;
}

function assertSourceRoot(sourceRoot) {
  const head = gitHead(sourceRoot);
  if (!/^[0-9a-f]{40}$/i.test(head ?? '')) throw new Error(`source checkout must have a 40-hex git HEAD; found ${head ?? 'no git HEAD'}`);
  return head;
}

function looksExcluded(id, version) {
  const text = `${id} ${version.versionName ?? ''} ${version.versionTime ?? ''}`.toLowerCase();
  return /beta|future|placeholder|tbd|leak/.test(text);
}

/** Select only the live Critical version; rejects old or non-Critical schemas. */
export function selectLiveVersion(versionData, liveOrdinal) {
  if (!Number.isSafeInteger(liveOrdinal) || liveOrdinal < 1) throw new Error('vLive ordinal must be a positive integer');
  if (!Array.isArray(versionData) || versionData.length < 4) throw new Error('version data must contain four mode records');
  const critical = versionData.find((mode) => mode?.name === 'Critical Node');
  if (!critical || !critical.versions || typeof critical.versions !== 'object') throw new Error('Critical Node mode is missing');
  const entries = Object.entries(critical.versions);
  const ids = entries.map(([id]) => id);
  if (ids.length < liveOrdinal) throw new Error(`live Critical ordinal ${liveOrdinal} is not present`);
  let previousStart = '';
  for (const [index, [id, record]] of entries.entries()) {
    let dates;
    try { dates = dateFromUpstream(record?.versionTime); }
    catch (error) {
      if (index < liveOrdinal) throw new Error(`Critical Node insertion order has invalid dates at ${id}: ${error.message}`);
      continue;
    }
    if (previousStart && dates.start <= previousStart) throw new Error(`Critical Node insertion order is not chronological at ${id}`);
    previousStart = dates.start;
  }
  const id = ids[liveOrdinal - 1];
  const version = critical.versions[id];
  if (!version || looksExcluded(id, version)) throw new Error(`live Critical ordinal ${liveOrdinal} is future, beta, placeholder, or invalid`);
  const selected = { id, ordinal: liveOrdinal, version };
  if (!selected.version.versionEnemies?.nodes) throw new Error('selected version uses an old schema without versionEnemies.nodes');
  return selected;
}

function labelForMultiplier(value) {
  if (value < 1) return 'weak';
  if (value > 1) return 'resist';
  return 'neutral';
}

function normalizeBuff(id, raw) {
  if (!Array.isArray(raw) || raw.length < 2) throw new Error(`invalid buff ${id}`);
  const description = sanitizeHtml(raw[1]);
  return { id, name: String(raw[0]), description: description.text, emphasis: description.segments };
}

function normalizeNode(node, nodeOrdinal, enemyData) {
  if (!node || !Array.isArray(node.sides) || ![2, 3].includes(node.sides.length)) throw new Error(`node ${nodeOrdinal} has invalid side count`);
  return {
    ordinal: nodeOrdinal,
    sides: node.sides.map((side, sideIndex) => {
      if (!side || !Array.isArray(side.sideElementMult) || side.sideElementMult.length !== ELEMENT_ORDER.length) throw new Error(`node ${nodeOrdinal} side ${sideIndex + 1} has invalid element multipliers`);
      if (!Number.isFinite(side.sideHPMult) || side.sideHPMult <= 0 || !Array.isArray(side.waves) || !side.waves.length) throw new Error(`node ${nodeOrdinal} side ${sideIndex + 1} has invalid HP multiplier or waves`);
      const multipliers = Object.fromEntries(ELEMENT_ORDER.map((element, index) => [element, side.sideElementMult[index]]));
      const elements = Object.fromEntries(ELEMENT_ORDER.map((element, index) => [element, labelForMultiplier(side.sideElementMult[index])]));
      return {
        ordinal: sideIndex + 1,
        sideHPMult: side.sideHPMult,
        elementMultipliers: multipliers,
        elements,
        weaknesses: ELEMENT_ORDER.filter((element) => elements[element] === 'weak'),
        resistances: ELEMENT_ORDER.filter((element) => elements[element] === 'resist'),
        waves: side.waves.map((wave, waveIndex) => ({
          ordinal: waveIndex + 1,
          enemies: (wave.enemies ?? []).map((enemy) => {
            const record = enemyData[enemy.id];
            if (!record || !Array.isArray(record.baseHP) || !Number.isInteger(enemy.type) || !Number.isFinite(record.baseHP[enemy.type])) throw new Error(`unknown enemy ${enemy.id} or type ${enemy.type}`);
            const hpMultiplier = enemy.hpMult || side.sideHPMult;
            const hpEach = Math.round(record.baseHP[enemy.type] * NODE_HP_MULTIPLIERS[nodeOrdinal - 1] * hpMultiplier / 10000);
            return {
              id: enemy.id,
              name: String(record.name),
              type: enemy.type,
              typeName: enemy.type === 0 ? 'normal' : 'elite',
              count: enemy.count,
              hpMult: hpMultiplier,
              baseHP: record.baseHP[enemy.type],
              hpEach,
              hpGroup: hpEach * enemy.count,
            };
          }),
        })),
      };
    }),
  };
}

export function normalize({ sourceRoot = DEFAULT_SOURCE_ROOT, output = path.join(REPO_ROOT, 'data/current.json'), fetchedDate = DEFAULT_FETCHED_DATE } = {}) {
  const sourceSha = assertSourceRoot(sourceRoot);
  const liveOrdinal = readLiveOrdinal(sourceRoot);
  const versionData = readJson(path.join(sourceRoot, 'zzz/sd/sd-versions.json'));
  const enemyData = readJson(path.join(sourceRoot, 'assets/zzz/enemies.json'));
  const buffData = readJson(path.join(sourceRoot, 'assets/zzz/buffs.json'));
  const selected = selectLiveVersion(versionData, liveOrdinal);
  const dates = dateFromUpstream(selected.version.versionTime);
  const nodes = selected.version.versionEnemies.nodes.map((node, index) => normalizeNode(node, index + 1, enemyData));
  if (nodes.length !== 5) throw new Error(`live Critical Node must have five nodes, found ${nodes.length}`);
  const sideCounts = nodes.map((node) => node.sides.length);
  if (JSON.stringify(sideCounts) !== JSON.stringify([2, 2, 2, 2, 3])) throw new Error(`unexpected side cardinality ${sideCounts.join(',')}`);
  const buffs = selected.version.versionBuffIDs.map((id) => normalizeBuff(id, buffData[id]));
  const roomBuffIds = buffs.map((buff) => buff.id);
  if (new Set(roomBuffIds).size !== roomBuffIds.length) throw new Error('live Critical Node room buffs must have unique IDs');
  const fifthFrontier = nodes.find((node) => node.ordinal === 5);
  if (!fifthFrontier || fifthFrontier.sides.length !== roomBuffIds.length) throw new Error('Fifth Frontier rooms and room buffs must have equal cardinality');
  fifthFrontier.sides = fifthFrontier.sides.map(({ ordinal, ...side }, index) => ({
    ordinal,
    roomBuffId: roomBuffIds[index],
    ...side,
  }));
  const result = {
    schemaVersion: 1,
    game: 'zzz',
    mode: 'Critical Node',
    version: {
      ordinal: selected.ordinal,
      id: selected.id,
      name: selected.version.versionName,
      startDate: dates.start,
      endDate: dates.end,
      endsAt: `${dates.end}T00:00:00.000Z`,
      live: true,
    },
    buffs,
    nodes,
    calculatedHP: {
      label: 'Calculated HP (rounded per enemy)',
      formula: 'round(baseHP[type] * nodeHPMult[node-1] * (enemy.hpMult || side.sideHPMult) / 10000)',
      nodeHPMult: NODE_HP_MULTIPLIERS,
    },
    provenance: {
      repository: SOURCE_REPOSITORY,
      sha: sourceSha,
      paths: SOURCE_PATHS,
      fetchedDate,
      license: 'GPL-3.0',
      liveOrdinal: selected.ordinal,
      liveId: selected.id,
      calculatedHPLabel: 'hpEach and hpGroup are calculated values; hpGroup = hpEach * count.',
    },
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const valueFor = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
  try {
    normalize({ sourceRoot: valueFor('--source-root') ?? DEFAULT_SOURCE_ROOT, output: valueFor('--output') ?? path.join(REPO_ROOT, 'data/current.json'), fetchedDate: valueFor('--fetched-date') ?? DEFAULT_FETCHED_DATE });
  } catch (error) {
    console.error(`normalize-data: ${error.message}`);
    process.exitCode = 1;
  }
}
