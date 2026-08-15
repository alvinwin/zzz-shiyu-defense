import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { evaluateCandidate, isCandidateAccepted, isUpdateDue, runUpdate } from '../scripts/update-if-new.mjs';

const current = JSON.parse(fs.readFileSync(new URL('../data/current.json', import.meta.url), 'utf8'));

function nextCandidate(overrides = {}) {
  const candidate = structuredClone(current);
  candidate.version = { ...candidate.version, ordinal: 55, id: '3.1.2', name: '3.1 Phase 2', startDate: '2026-08-22', endDate: '2026-09-05' };
  candidate.provenance = { ...candidate.provenance, liveOrdinal: 55, liveId: '3.1.2', fetchedDate: '2026-08-22' };
  return { ...candidate, ...overrides };
}

function tempCurrent(value = current) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zzz-update-test-'));
  const filename = path.join(directory, 'current.json');
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
  return { directory, filename };
}

test('before the cycle end is not eligible and does not need a source checkout', () => {
  assert.equal(isUpdateDue(current, '2026-08-20'), false);
  const temp = tempCurrent();
  const before = fs.readFileSync(temp.filename, 'utf8');
  const result = runUpdate({ currentPath: temp.filename, today: '2026-08-20', sourceRoot: '/does/not/exist' });
  assert.equal(result.status, 'not-due');
  assert.equal(fs.readFileSync(temp.filename, 'utf8'), before);
  fs.rmSync(temp.directory, { recursive: true, force: true });
});

test('same live version is accepted as no-op and leaves current untouched', () => {
  const temp = tempCurrent();
  const before = fs.readFileSync(temp.filename, 'utf8');
  const result = evaluateCandidate(current, current, '2026-08-21');
  assert.deepEqual(result, { accepted: false, reason: 'same live version' });
  assert.equal(fs.readFileSync(temp.filename, 'utf8'), before);
  fs.rmSync(temp.directory, { recursive: true, force: true });
});

test('valid next version advances live metadata and dates', () => {
  const candidate = nextCandidate();
  assert.equal(isCandidateAccepted(current, candidate, '2026-08-22'), true);
  assert.deepEqual(evaluateCandidate(current, candidate, '2026-08-22'), { accepted: true, reason: 'new live version with advancing dates' });
  assert.deepEqual(evaluateCandidate(current, candidate, '2026-08-21'), { accepted: false, reason: 'candidate is not active today' });
  assert.deepEqual(evaluateCandidate(current, candidate, '2026-09-05'), { accepted: false, reason: 'candidate is not active today' });
});

test('invalid and non-advancing candidates are rejected', () => {
  const invalid = nextCandidate({ nodes: [] });
  assert.equal(isCandidateAccepted(current, invalid, '2026-08-22'), false);
  assert.match(evaluateCandidate(current, invalid, '2026-08-22').reason, /validation failed/);
  const nonAdvancing = nextCandidate({ version: { ...nextCandidate().version, startDate: current.version.startDate, endDate: current.version.endDate } });
  assert.deepEqual(evaluateCandidate(current, nonAdvancing, '2026-08-20'), { accepted: false, reason: 'candidate dates do not advance' });
});
