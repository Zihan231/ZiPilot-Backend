import { BadRequestException } from '@nestjs/common';

export type RawQuery = Record<string, string | string[] | undefined>;

/** Reads a query param as a single string (last value wins). */
export function str(q: RawQuery, key: string): string | undefined {
  const v = q[key];
  const s = Array.isArray(v) ? v[v.length - 1] : v;
  return s === undefined || s === '' ? undefined : String(s);
}

/** Reads a comma-separated (or repeated) query param as a list. */
export function list(q: RawQuery, key: string): string[] {
  const v = q[key];
  if (v === undefined) return [];
  const parts = (Array.isArray(v) ? v : [v]).flatMap((s) => String(s).split(','));
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** Reads a list param and keeps only values that belong to an enum. */
export function enumList<T extends string>(q: RawQuery, key: string, values: readonly T[] | Record<string, T>): T[] {
  const allowed = new Set<string>(Array.isArray(values) ? values : Object.values(values));
  return list(q, key).filter((v) => allowed.has(v)) as T[];
}

export function num(q: RawQuery, key: string): number | undefined {
  const s = str(q, key);
  if (s === undefined) return undefined;
  const n = Number(s);
  if (Number.isNaN(n)) throw new BadRequestException(`${key} must be a number`);
  return n;
}

export function pagination(q: RawQuery, defaultSize = 25) {
  const page = Math.max(1, Math.floor(num(q, 'page') ?? 1));
  const pageSize = Math.min(200, Math.max(1, Math.floor(num(q, 'pageSize') ?? defaultSize)));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
