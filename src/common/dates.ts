import { DateTime } from 'luxon';

export interface Range {
  gte?: Date;
  lt?: Date;
}

export type RangePreset =
  | 'today'
  | 'yesterday'
  | '7d'
  | '30d'
  | '90d'
  | 'thisWeek'
  | 'thisMonth'
  | 'thisYear'
  | 'all'
  | 'custom';

export function safeZone(tz: string): string {
  return DateTime.now().setZone(tz).isValid ? tz : 'UTC';
}

export function now(tz: string) {
  return DateTime.now().setZone(safeZone(tz));
}

export function startOfToday(tz: string) {
  return now(tz).startOf('day');
}

function parseDay(value: string | undefined, tz: string): DateTime | undefined {
  if (!value) return undefined;
  const d = DateTime.fromISO(value, { zone: safeZone(tz) });
  return d.isValid ? d.startOf('day') : undefined;
}

/** Resolves a historical date preset (Today, 7 Days, …, Custom) into a half-open [gte, lt) range in the user's timezone. */
export function resolveRange(preset: string | undefined, from: string | undefined, to: string | undefined, tz: string): Range {
  const today = startOfToday(tz);
  const tomorrow = today.plus({ days: 1 });
  switch (preset as RangePreset) {
    case 'today':
      return { gte: today.toJSDate(), lt: tomorrow.toJSDate() };
    case 'yesterday':
      return { gte: today.minus({ days: 1 }).toJSDate(), lt: today.toJSDate() };
    case '7d':
      return { gte: today.minus({ days: 6 }).toJSDate(), lt: tomorrow.toJSDate() };
    case '30d':
      return { gte: today.minus({ days: 29 }).toJSDate(), lt: tomorrow.toJSDate() };
    case '90d':
      return { gte: today.minus({ days: 89 }).toJSDate(), lt: tomorrow.toJSDate() };
    case 'thisWeek':
      return { gte: today.startOf('week').toJSDate(), lt: tomorrow.toJSDate() };
    case 'thisMonth':
      return { gte: today.startOf('month').toJSDate(), lt: tomorrow.toJSDate() };
    case 'thisYear':
      return { gte: today.startOf('year').toJSDate(), lt: tomorrow.toJSDate() };
    case 'custom': {
      const f = parseDay(from, tz);
      const t = parseDay(to, tz);
      return { gte: f?.toJSDate(), lt: t?.plus({ days: 1 }).toJSDate() };
    }
    default:
      return {};
  }
}

/** Forward-looking deadline buckets. Each returns a [gte, lt) range. */
export function deadlineBucket(bucket: string, tz: string, from?: string, to?: string): Range | null {
  const today = startOfToday(tz);
  switch (bucket) {
    case 'today':
      return { gte: today.toJSDate(), lt: today.plus({ days: 1 }).toJSDate() };
    case 'tomorrow':
      return { gte: today.plus({ days: 1 }).toJSDate(), lt: today.plus({ days: 2 }).toJSDate() };
    case '3d':
      return { gte: today.toJSDate(), lt: today.plus({ days: 3 }).toJSDate() };
    case '7d':
      return { gte: today.toJSDate(), lt: today.plus({ days: 7 }).toJSDate() };
    case '30d':
      return { gte: today.toJSDate(), lt: today.plus({ days: 30 }).toJSDate() };
    case 'later':
      return { gte: today.plus({ days: 7 }).toJSDate() };
    case 'expired':
    case 'overdue':
      return { lt: today.toJSDate() };
    case 'custom': {
      const f = parseDay(from, tz);
      const t = parseDay(to, tz);
      if (!f && !t) return null;
      return { gte: f?.toJSDate(), lt: t?.plus({ days: 1 }).toJSDate() };
    }
    default:
      return null;
  }
}

export function rangeToPrisma(r: Range) {
  const out: { gte?: Date; lt?: Date } = {};
  if (r.gte) out.gte = r.gte;
  if (r.lt) out.lt = r.lt;
  return Object.keys(out).length ? out : undefined;
}

export function daysAgo(days: number) {
  return DateTime.now().minus({ days }).toJSDate();
}
