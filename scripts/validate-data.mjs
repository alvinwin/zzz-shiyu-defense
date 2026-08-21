import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ELEMENT_ORDER, NODE_HP_MULTIPLIERS, SOURCE_PATHS, SOURCE_REPOSITORY } from './normalize-data.mjs';
import { strictIsoTimestamp } from './lib/remaining-time.mjs';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(THIS_DIR, '..');

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function number(value) { return typeof value === 'number' && Number.isFinite(value); }
function fail(errors, message) { errors.push(message); }

export function cycleStatusFromData(data) {
  const version = data?.version ?? {};
  const fetchedDate = data?.provenance?.fetchedDate;
  return {
    schemaVersion: 1,
    mode: 'shiyu-defense',
    status: 'current',
    startsAt: `${version.startDate}T00:00:00.000Z`,
    endsAt: version.endsAt,
    checkedAt: `${fetchedDate}T00:00:00.000Z`,
  };
}

export function validateCycleStatus(status, data) {
  const errors = [];
  const expected = cycleStatusFromData(data);
  if (!status || typeof status !== 'object' || Array.isArray(status)) return ['cycle status must be an object'];
  if (status.schemaVersion !== 1 || status.mode !== 'shiyu-defense' || status.status !== 'current') errors.push('cycle status schema/mode/status is incorrect');
  if (status.startsAt !== expected.startsAt || status.endsAt !== expected.endsAt || status.checkedAt !== expected.checkedAt) errors.push('cycle status timestamps must be derived from current data');
  for (const key of ['startsAt', 'endsAt', 'checkedAt']) {
    if (!Number.isFinite(strictIsoTimestamp(status[key]))) errors.push(`cycle status ${key} must be an ISO timestamp`);
  }
  return errors;
}

export function validate(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['root must be an object'];
  if (data.schemaVersion !== 1) fail(errors, 'schemaVersion must be 1');
  if (data.game !== 'zzz') fail(errors, 'game must be zzz');
  if (data.mode !== 'Critical Node') fail(errors, 'mode must be Critical Node');
  const version = data.version;
  if (!version || !Number.isSafeInteger(version.ordinal) || version.ordinal < 1 || typeof version.id !== 'string' || !version.id || version.live !== true) fail(errors, 'version must have a positive live ordinal and non-empty id');
  if (!version || typeof version.name !== 'string' || !version.name || !isDate(version.startDate) || !isDate(version.endDate) || version.startDate >= version.endDate) fail(errors, 'version must have a non-empty name and ordered ISO start/end dates');
  if (!version || version.endsAt !== `${version.endDate}T00:00:00.000Z`) fail(errors, 'version.endsAt must exactly derive from version.endDate at UTC midnight');

  if (!Array.isArray(data.buffs) || data.buffs.length !== 3) fail(errors, 'buffs must contain exactly three records');
  const buffIds = new Set();
  for (const [index, buff] of (data.buffs ?? []).entries()) {
    if (!buff || typeof buff.id !== 'string' || !buff.name || typeof buff.description !== 'string') fail(errors, `buff ${index + 1} has invalid id/name/description`);
    if (!Array.isArray(buff.emphasis)) fail(errors, `buff ${index + 1} emphasis must be an array`);
    if (typeof buff?.id === 'string') {
      if (buffIds.has(buff.id)) fail(errors, `buff ${index + 1} duplicates id ${buff.id}`);
      buffIds.add(buff.id);
    }
  }

  const nodes = data.nodes;
  if (!Array.isArray(nodes) || nodes.length !== 5) fail(errors, 'nodes must contain exactly five records');
  const expectedSides = [2, 2, 2, 2, 3];
  const mappedRoomBuffIds = [];
  for (const [nodeIndex, node] of (nodes ?? []).entries()) {
    if (!node || node.ordinal !== nodeIndex + 1 || !Array.isArray(node.sides) || node.sides.length !== expectedSides[nodeIndex]) {
      fail(errors, `node ${nodeIndex + 1} must have ${expectedSides[nodeIndex]} sides`); continue;
    }
    for (const [sideIndex, side] of node.sides.entries()) {
      if (!side || side.ordinal !== sideIndex + 1 || !number(side.sideHPMult) || side.sideHPMult <= 0) fail(errors, `node ${nodeIndex + 1} side ${sideIndex + 1} has impossible sideHPMult`);
      if (nodeIndex === 4) {
        if (typeof side?.roomBuffId !== 'string' || !side.roomBuffId) fail(errors, `node 5 side ${sideIndex + 1} must have a roomBuffId`);
        else {
          mappedRoomBuffIds.push(side.roomBuffId);
          if (!buffIds.has(side.roomBuffId)) fail(errors, `node 5 side ${sideIndex + 1} references unknown room buff ${side.roomBuffId}`);
        }
      } else if (Object.hasOwn(side ?? {}, 'roomBuffId')) fail(errors, `node ${nodeIndex + 1} side ${sideIndex + 1} must not have a roomBuffId`);
      if (!side.elementMultipliers || !side.elements) fail(errors, `node ${nodeIndex + 1} side ${sideIndex + 1} is missing element mappings`);
      for (const element of ELEMENT_ORDER) {
        if (!number(side.elementMultipliers?.[element]) || !['weak', 'neutral', 'resist'].includes(side.elements?.[element])) fail(errors, `node ${nodeIndex + 1} side ${sideIndex + 1} has invalid ${element} mapping`);
        if (side.elementMultipliers?.[element] < 1 && side.elements?.[element] !== 'weak') fail(errors, `node ${nodeIndex + 1} side ${sideIndex + 1} weak mapping disagrees with multiplier`);
        if (side.elementMultipliers?.[element] === 1 && side.elements?.[element] !== 'neutral') fail(errors, `node ${nodeIndex + 1} side ${sideIndex + 1} neutral mapping disagrees with multiplier`);
        if (side.elementMultipliers?.[element] > 1 && side.elements?.[element] !== 'resist') fail(errors, `node ${nodeIndex + 1} side ${sideIndex + 1} resist mapping disagrees with multiplier`);
      }
      if (!Array.isArray(side.waves) || !side.waves.length) fail(errors, `node ${nodeIndex + 1} side ${sideIndex + 1} must have waves`);
      for (const [waveIndex, wave] of (side.waves ?? []).entries()) {
        if (!wave || wave.ordinal !== waveIndex + 1 || !Array.isArray(wave.enemies) || !wave.enemies.length) fail(errors, `node ${nodeIndex + 1} side ${sideIndex + 1} wave ${waveIndex + 1} must have enemies`);
        for (const enemy of (wave.enemies ?? [])) {
          if (!enemy || typeof enemy.id !== 'string' || typeof enemy.name !== 'string' || !enemy.name || !Number.isInteger(enemy.type) || ![0, 1].includes(enemy.type) || !['normal', 'elite'].includes(enemy.typeName) || enemy.typeName !== (enemy.type === 0 ? 'normal' : 'elite') || !Number.isInteger(enemy.count) || enemy.count < 1) {
            fail(errors, `node ${nodeIndex + 1} has an invalid enemy record`); continue;
          }
          if (!number(enemy.baseHP) || enemy.baseHP <= 0 || !number(enemy.hpMult) || enemy.hpMult <= 0 || !Number.isInteger(enemy.hpEach) || enemy.hpEach <= 0 || enemy.hpGroup !== enemy.hpEach * enemy.count) fail(errors, `enemy ${enemy.id} has impossible HP values`);
          const expected = Math.round(enemy.baseHP * NODE_HP_MULTIPLIERS[nodeIndex] * enemy.hpMult / 10000);
          if (enemy.hpEach !== expected) fail(errors, `enemy ${enemy.id} hpEach ${enemy.hpEach} disagrees with formula (${expected})`);
        }
      }
    }
  }
  if (new Set(mappedRoomBuffIds).size !== mappedRoomBuffIds.length) fail(errors, 'Fifth Frontier roomBuffId values must be unique');
  if (mappedRoomBuffIds.length !== buffIds.size || [...buffIds].some((id) => !mappedRoomBuffIds.includes(id))) fail(errors, 'Fifth Frontier roomBuffId values must cover every current buff exactly once');

  if (!data.calculatedHP || data.calculatedHP.label !== 'Calculated HP (rounded per enemy)' || data.calculatedHP.formula !== 'round(baseHP[type] * nodeHPMult[node-1] * (enemy.hpMult || side.sideHPMult) / 10000)' || JSON.stringify(data.calculatedHP.nodeHPMult) !== JSON.stringify(NODE_HP_MULTIPLIERS)) fail(errors, 'calculatedHP formula/label/multipliers are incorrect');

  const provenance = data.provenance;
  if (!provenance || provenance.repository !== SOURCE_REPOSITORY || !/^[0-9a-f]{40}$/i.test(provenance.sha ?? '') || provenance.license !== 'GPL-3.0' || !isDate(provenance.fetchedDate) || !provenance.calculatedHPLabel || !Array.isArray(provenance.paths) || !SOURCE_PATHS.every((sourcePath) => provenance.paths.includes(sourcePath)) || provenance.liveOrdinal !== version?.ordinal || provenance.liveId !== version?.id) fail(errors, 'provenance must include a 40-hex SHA, source paths, fetched date, GPL-3.0, and matching live ordinal/id');

  const unsafe = [];
  const inspect = (value, location) => {
    if (typeof value === 'string') {
      if (/<[^>]*>|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) unsafe.push(location);
    } else if (Array.isArray(value)) value.forEach((item, index) => inspect(item, `${location}[${index}]`));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => inspect(item, `${location}.${key}`));
  };
  inspect(data, 'current');
  if (unsafe.length) fail(errors, `unsafe HTML/control text at ${unsafe.slice(0, 3).join(', ')}`);
  return errors;
}

export function validateFile(filename = path.join(REPO_ROOT, 'data/current.json')) {
  let data;
  try { data = JSON.parse(fs.readFileSync(filename, 'utf8')); }
  catch (error) { return [`cannot read JSON ${filename}: ${error.message}`]; }
  return validate(data);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fileFlag = process.argv.indexOf('--file');
  const filename = fileFlag >= 0 ? process.argv[fileFlag + 1] : (process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : path.join(REPO_ROOT, 'data/current.json'));
  const errors = validateFile(filename);
  if (errors.length) {
    console.error(`validate-data: ${errors.length} error(s)`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else console.log(`valid: ${filename}`);
}
