import assert from 'node:assert/strict';
import test from 'node:test';
import { formatRemaining } from '../scripts/lib/remaining-time.mjs';

const now = '2026-08-20T00:00:00.000Z';

test('formats remaining time across day, hour, and minute ranges', () => {
  assert.equal(formatRemaining('2026-08-22T04:00:00.000Z', now), '2d 4h remaining');
  assert.equal(formatRemaining('2026-08-20T04:12:00.000Z', now), '4h 12m remaining');
  assert.equal(formatRemaining('2026-08-20T00:42:00.000Z', now), '42m remaining');
});

test('fails closed at expiry and for invalid timer inputs', () => {
  assert.equal(formatRemaining(now, now), 'Refresh pending');
  assert.equal(formatRemaining('2026-08-19T23:59:59.000Z', now), 'Refresh pending');
  assert.equal(formatRemaining(undefined, now), 'Status unavailable');
  assert.equal(formatRemaining('not a timestamp', now), 'Status unavailable');
  assert.equal(formatRemaining('2026-02-31T00:00:00.000Z', now), 'Status unavailable');
  assert.equal(formatRemaining('2026-08-20T01:00:00.000Z', 'not a timestamp'), 'Status unavailable');
});
