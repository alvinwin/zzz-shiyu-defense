import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { readLiveOrdinal, sanitizeHtml, selectLiveVersion, NODE_HP_MULTIPLIERS } from '../scripts/normalize-data.mjs';
import { cycleStatusFromData, validate, validateCycleStatus, validateFile } from '../scripts/validate-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const current = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/current.json'), 'utf8'));

test('current record validates with exact shape and provenance', () => {
  assert.deepEqual(validate(current), []);
  assert.deepEqual(current.nodes.map((node) => node.sides.length), [2, 2, 2, 2, 3]);
  assert.equal(current.buffs.length, 3);
  assert.deepEqual(current.nodes[4].sides.map((side) => side.roomBuffId), [
    '62000070',
    '62000067',
    '62000071',
  ]);
  assert.equal(validateFile(path.join(ROOT, 'data/current.json')).length, 0);
});

test('room buff identities are complete, unique, and independent of buff display order', () => {
  const reordered = structuredClone(current);
  reordered.buffs.reverse();
  assert.deepEqual(validate(reordered), []);

  const missing = structuredClone(current);
  delete missing.nodes[4].sides[1].roomBuffId;
  assert.ok(validate(missing).some((error) => /side 2 must have a roomBuffId|cover every current buff/.test(error)));

  const duplicate = structuredClone(current);
  duplicate.nodes[4].sides[1].roomBuffId = duplicate.nodes[4].sides[0].roomBuffId;
  assert.ok(validate(duplicate).some((error) => /roomBuffId values must be unique/.test(error)));

  const unknown = structuredClone(current);
  unknown.nodes[4].sides[1].roomBuffId = 'unknown-buff';
  assert.ok(validate(unknown).some((error) => /references unknown room buff/.test(error)));

  const misplaced = structuredClone(current);
  misplaced.nodes[0].sides[0].roomBuffId = current.buffs[0].id;
  assert.ok(validate(misplaced).some((error) => /must not have a roomBuffId/.test(error)));
});

test('cycle status is derived from current data and validates its UTC cutovers', () => {
  const status = cycleStatusFromData(current);
  assert.deepEqual(status, {
    schemaVersion: 1,
    mode: 'shiyu-defense',
    status: 'current',
    startsAt: '2026-08-07T00:00:00.000Z',
    endsAt: '2026-08-21T00:00:00.000Z',
    checkedAt: '2026-08-14T00:00:00.000Z',
  });
  assert.deepEqual(validateCycleStatus(status, current), []);
  assert.notDeepEqual(validateCycleStatus({ ...status, endsAt: '2026-08-22T00:00:00.000Z' }, current), []);
  const invalidCalendar = structuredClone(current);
  invalidCalendar.version.endsAt = '2026-02-31T00:00:00.000Z';
  invalidCalendar.version.endDate = '2026-02-31';
  assert.ok(validateCycleStatus(cycleStatusFromData(invalidCalendar), invalidCalendar).some((error) => /ISO timestamp/.test(error)));
});

test('five known HP samples use the pinned formula', () => {
  const samples = [
    [current.nodes[0].sides[0].waves[0].enemies[0], 278913],
    [current.nodes[0].sides[0].waves[1].enemies[0], 1195788],
    [current.nodes[0].sides[0].waves[3].enemies[0], 1550601],
    [current.nodes[3].sides[1].waves[0].enemies[0], 6070187],
    [current.nodes[4].sides[2].waves[0].enemies[0], 4556701],
  ];
  for (const [enemy, expected] of samples) assert.equal(enemy.hpEach, expected, `${enemy.id} hpEach`);
  assert.equal(current.nodes[3].sides[1].waves[0].enemies[0].hpGroup, 12140374);
  assert.deepEqual(current.calculatedHP.nodeHPMult, NODE_HP_MULTIPLIERS);
});

test('selection reads vLive and rejects other modes/schemas/future entries', () => {
  const cycleDate = (offset) => {
    const date = new Date(Date.UTC(2024, 0, 1 + (offset * 14)));
    return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
  };
  const versions = Object.fromEntries(Array.from({ length: 56 }, (_, index) => [
    `cycle-${index + 1}`,
    { versionName: `Phase ${index + 1}`, versionTime: `${cycleDate(index)} - ${cycleDate(index + 1)}`, versionEnemies: { nodes: [] } },
  ]));
  const source = [{ name: 'Stable Node' }, { name: 'Disputed Node' }, { name: 'Ambush Node' }, { name: 'Critical Node', versions }];
  const liveOrdinal = readLiveOrdinal(path.join(ROOT, 'tests/fixtures/source'));
  const selected = selectLiveVersion(source, liveOrdinal);
  assert.equal(selected.id, 'cycle-54');
  assert.equal(selected.ordinal, liveOrdinal);
  const noCritical = source.map((mode, index) => index === 3 ? { ...mode, name: 'Stable Node' } : mode);
  assert.throws(() => selectLiveVersion(noCritical, liveOrdinal), /Critical Node/);
  const oldSchema = source.map((mode) => ({ ...mode, versions: { ...mode.versions } }));
  oldSchema[3].versions['cycle-54'] = { ...oldSchema[3].versions['cycle-54'], versionEnemies: undefined };
  assert.throws(() => selectLiveVersion(oldSchema, liveOrdinal), /old schema|live Critical/);
  const future = source.map((mode, index) => index === 3 ? { ...mode, versions: { ...mode.versions, 'cycle-54': { ...mode.versions['cycle-54'], versionName: 'beta placeholder' } } } : mode);
  assert.throws(() => selectLiveVersion(future, liveOrdinal), /live Critical/);
  const nextCycle = Object.fromEntries(Object.entries(source[3].versions).slice(0, liveOrdinal).concat([['next-live', source[3].versions['cycle-55']], ['next-future', { versionName: 'future placeholder', versionEnemies: {} }]]));
  const nextSource = source.map((mode, index) => index === 3 ? { ...mode, versions: nextCycle } : mode);
  assert.equal(selectLiveVersion(nextSource, liveOrdinal + 1).id, 'next-live');
  assert.throws(() => selectLiveVersion(nextSource, liveOrdinal + 2), /future|placeholder|invalid/);
  const reorderedEntries = Object.entries(versions);
  [reorderedEntries[52], reorderedEntries[53]] = [reorderedEntries[53], reorderedEntries[52]];
  const reordered = source.map((mode, index) => index === 3 ? { ...mode, versions: Object.fromEntries(reorderedEntries) } : mode);
  assert.throws(() => selectLiveVersion(reordered, liveOrdinal), /not chronological/);
});

test('validator accepts a synthetic next live ordinal with ordered ISO dates', () => {
  const next = structuredClone(current);
  next.version = { ...next.version, ordinal: 55, id: '3.1.2', name: '3.1 Phase 2', startDate: '2026-08-22', endDate: '2026-09-05', endsAt: '2026-09-05T00:00:00.000Z' };
  next.provenance = { ...next.provenance, liveOrdinal: 55, liveId: '3.1.2' };
  assert.deepEqual(validate(next), []);
});

test('sanitization emits plain text and structured emphasis without upstream HTML', () => {
  const result = sanitizeHtml("<li>Ice <span style='font-weight:bold;'>DMG</span> &amp; <script>alert(1)</script><br>next</li>");
  assert.equal(result.text, 'Ice DMG & alert(1)\nnext');
  assert.ok(result.segments.some((segment) => segment.text === 'DMG' && segment.emphasis === 'bold'));
  assert.ok(!result.text.includes('<') && !result.text.includes('>'));
});

test('invalid fixture fails validator with actionable errors', () => {
  const invalid = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/invalid-current.json'), 'utf8'));
  const errors = validate(invalid);
  assert.ok(errors.length >= 3);
  assert.ok(errors.some((error) => /schemaVersion|version|provenance|unsafe/.test(error)));
});
