import { DateTime } from 'luxon';
import { safeZone } from './dates';

export interface CsvColumn<T> {
  key: string;
  header: string;
  value: (row: T) => unknown;
}

function cell(v: unknown, tz: string): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return DateTime.fromJSDate(v).setZone(safeZone(tz)).toFormat('yyyy-MM-dd HH:mm');
  const s = typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[], tz: string): string {
  const head = columns.map((c) => cell(c.header, tz)).join(',');
  const body = rows.map((r) => columns.map((c) => cell(c.value(r), tz)).join(','));
  // BOM so Excel opens UTF-8 correctly
  return '﻿' + [head, ...body].join('\r\n');
}

/** Keeps requested columns in the requested order; falls back to all columns. */
export function pickColumns<T>(all: CsvColumn<T>[], requested: string[]): CsvColumn<T>[] {
  if (!requested.length) return all;
  const byKey = new Map(all.map((c) => [c.key, c]));
  const picked = requested.map((k) => byKey.get(k)).filter((c): c is CsvColumn<T> => !!c);
  return picked.length ? picked : all;
}
