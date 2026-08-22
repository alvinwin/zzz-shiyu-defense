import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { evaluateCandidate, isCandidateAccepted, isUpdateDue, runUpdate } from '../scripts/update-if-new.mjs';

const current = JSON.parse(fs.readFileSync(new URL('../data/current.json', import.meta.url), 'utf8'));

function shiftDate(iso, days) {
  return new Date(Date.parse(`${iso}T00:00:00.000Z`) + (days * 86_400_000)).toISOString().slice(0, 10);
}

function nextCandidate(overrides = {}) {
  const candidate = structuredClone(current);
  const startDate = current.version.endDate;
  const endDate = shiftDate(startDate, 14);
  const ordinal = current.version.ordinal + 1;
  candidate.version = { ...candidate.version, ordinal, id: 'test-next-live', name: 'Test next live', startDate, endDate, endsAt: `${endDate}T00:00:00.000Z` };
  candidate.provenance = { ...candidate.provenance, liveOrdinal: ordinal, liveId: 'test-next-live', fetchedDate: startDate };
  return { ...candidate, ...overrides };
}

function tempCurrent(value = current) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zzz-update-test-'));
  const filename = path.join(directory, 'current.json');
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`);
  return { directory, filename };
}

test('before the cycle end is not eligible and does not need a source checkout', () => {
  const beforeEnd = shiftDate(current.version.endDate, -1);
  assert.equal(isUpdateDue(current, beforeEnd), false);
  const temp = tempCurrent();
  const before = fs.readFileSync(temp.filename, 'utf8');
  const result = runUpdate({ currentPath: temp.filename, today: beforeEnd, sourceRoot: '/does/not/exist' });
  assert.equal(result.status, 'not-due');
  assert.equal(fs.readFileSync(temp.filename, 'utf8'), before);
  fs.rmSync(temp.directory, { recursive: true, force: true });
});

test('same live version is accepted as no-op and leaves current untouched', () => {
  const temp = tempCurrent();
  const before = fs.readFileSync(temp.filename, 'utf8');
  const result = evaluateCandidate(current, current, current.version.startDate);
  assert.deepEqual(result, { accepted: false, reason: 'same live version' });
  assert.equal(fs.readFileSync(temp.filename, 'utf8'), before);
  fs.rmSync(temp.directory, { recursive: true, force: true });
});

test('valid next version advances live metadata and dates', () => {
  const candidate = nextCandidate();
  assert.equal(isCandidateAccepted(current, candidate, candidate.version.startDate), true);
  assert.deepEqual(evaluateCandidate(current, candidate, candidate.version.startDate), { accepted: true, reason: 'new live version with advancing dates' });
  assert.deepEqual(evaluateCandidate(current, candidate, shiftDate(candidate.version.startDate, -1)), { accepted: false, reason: 'candidate is not active today' });
  assert.deepEqual(evaluateCandidate(current, candidate, candidate.version.endDate), { accepted: false, reason: 'candidate is not active today' });
});

test('invalid and non-advancing candidates are rejected', () => {
  const invalid = nextCandidate({ nodes: [] });
  assert.equal(isCandidateAccepted(current, invalid, invalid.version.startDate), false);
  assert.match(evaluateCandidate(current, invalid, invalid.version.startDate).reason, /validation failed/);
  const nonAdvancing = nextCandidate({ version: { ...nextCandidate().version, startDate: current.version.startDate, endDate: current.version.endDate, endsAt: current.version.endsAt } });
  assert.deepEqual(evaluateCandidate(current, nonAdvancing, current.version.startDate), { accepted: false, reason: 'candidate dates do not advance' });
});
