import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from './normalize-data.mjs';
import { validate } from './validate-data.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_CURRENT = path.join(ROOT, 'data/current.json');

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function todayUtc() { return new Date().toISOString().slice(0, 10); }

export function isUpdateDue(current, today) {
  return Boolean(current?.version?.endDate && isIsoDate(today) && isIsoDate(current.version.endDate) && today >= current.version.endDate);
}

export function evaluateCandidate(current, candidate, today) {
  if (!candidate?.version || !current?.version) return { accepted: false, reason: 'missing version metadata' };
  const errors = validate(candidate);
  if (errors.length) return { accepted: false, reason: `candidate validation failed: ${errors[0]}` };
  const currentVersion = current.version;
  const nextVersion = candidate.version;
  if (nextVersion.id === currentVersion.id && nextVersion.ordinal === currentVersion.ordinal) return { accepted: false, reason: 'same live version' };
  if (!isIsoDate(today) || nextVersion.startDate > today || today >= nextVersion.endDate) return { accepted: false, reason: 'candidate is not active today' };
  if (nextVersion.startDate <= currentVersion.startDate || nextVersion.endDate <= currentVersion.endDate) return { accepted: false, reason: 'candidate dates do not advance' };
  return { accepted: true, reason: 'new live version with advancing dates' };
}

export function isCandidateAccepted(current, candidate, today) {
  return evaluateCandidate(current, candidate, today).accepted;
}

function readJson(filename) { return JSON.parse(fs.readFileSync(filename, 'utf8')); }

export function runUpdate({ currentPath = DEFAULT_CURRENT, sourceRoot, today = todayUtc(), eligibilityOnly = false } = {}) {
  const current = readJson(currentPath);
  if (!isUpdateDue(current, today)) return { status: 'not-due', changed: false, today };
  if (eligibilityOnly) return { status: 'due', changed: false, today };
  if (!sourceRoot) throw new Error('source checkout is required on or after the cycle end date (--source-root)');

  const tempDirectory = fs.mkdtempSync(path.join(path.dirname(currentPath), '.zzz-shiyu-update-'));
  const candidatePath = path.join(tempDirectory, 'current.json');
  try {
    normalize({ sourceRoot, output: candidatePath, fetchedDate: today });
    const candidate = readJson(candidatePath);
    const decision = evaluateCandidate(current, candidate, today);
    if (!decision.accepted) return { status: decision.reason === 'same live version' ? 'same-live' : 'rejected', changed: false, today, reason: decision.reason };
    fs.renameSync(candidatePath, currentPath);
    return { status: 'updated', changed: true, today, reason: decision.reason };
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const valueFor = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
  const currentPath = valueFor('--current') ?? DEFAULT_CURRENT;
  const sourceRoot = valueFor('--source-root');
  const today = valueFor('--today') ?? todayUtc();
  const eligibilityOnly = args.includes('--eligibility-only');
  try {
    const result = runUpdate({ currentPath, sourceRoot, today, eligibilityOnly });
    if (eligibilityOnly) console.log(result.status);
    else console.log(`${result.status}: ${result.reason ?? 'cycle is not due'}`);
  } catch (error) {
    console.error(`update-if-new: ${error.message}`);
    process.exitCode = 1;
  }
}
