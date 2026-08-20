export function strictIsoTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return NaN;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return NaN;
  const withoutZulu = value.slice(0, -1);
  const [whole, fraction = ''] = withoutZulu.split('.');
  const canonical = `${whole}.${fraction.padEnd(3, '0')}Z`;
  return new Date(parsed).toISOString() === canonical ? parsed : NaN;
}

function timestamp(value) {
  if (value instanceof Date) return value.valueOf();
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && value.trim()) return strictIsoTimestamp(value);
  return NaN;
}

/** Return a compact remaining-time label and fail closed when the timer is unusable or expired. */
export function formatRemaining(endsAt, now = Date.now()) {
  const endMs = timestamp(endsAt);
  const nowMs = timestamp(now);
  if (!Number.isFinite(endMs) || !Number.isFinite(nowMs)) return 'Status unavailable';
  if (endMs <= nowMs) return 'Refresh pending';

  const minutes = Math.ceil((endMs - nowMs) / 60_000);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const remainingMinutes = minutes % 60;
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${remainingMinutes}m remaining`;
  return `${remainingMinutes}m remaining`;
}
