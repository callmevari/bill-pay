// Helpers that convert form-shaped values into the wire conventions the
// backend expects (see `CLAUDE.md → Wire conventions`).
//
// - Money on the wire is a 2-decimal string (`"1234.56"`). Forms collect a
//   `number`, so every submit path converges on `toWireAmount` and never
//   trusts the user to type a 2-decimal value.
// - Dates from `<input type="date">` are `YYYY-MM-DD`. The backend expects
//   ISO-8601; we anchor the day at `T00:00:00.000Z` so the date the user
//   picked is the date the backend stores (no local-timezone shift).

import type { ApiError } from './api';

export function toWireAmount(value: number | string): string {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return '0.00';
  return num.toFixed(2);
}

export function toWireDate(yyyyMmDd: string): string {
  // A `YYYY-MM-DD` string round-trips losslessly through this transform
  // because we anchor at midnight UTC. An ISO-8601 already coming in
  // (e.g. defaults loaded from the server) returns unchanged.
  if (!yyyyMmDd) return yyyyMmDd;
  if (yyyyMmDd.includes('T')) return yyyyMmDd;
  return `${yyyyMmDd}T00:00:00.000Z`;
}

export function isoToInputDate(iso: string | null | undefined): string {
  if (!iso) return '';
  // The ISO string starts with `YYYY-MM-DD`. We slice rather than
  // re-parsing through `Date` so timezone-shift bugs cannot leak in.
  return iso.slice(0, 10);
}

// `details.messages` shape used by the backend's class-validator path. The
// outer envelope is `{ code: 'VALIDATION_ERROR', details: { messages: [..] } }`
// — we tolerate any shape that holds a string list and ignore the rest so
// a future detail field doesn't crash the form.
export function extractValidationMessages(error: ApiError | null | undefined): string[] {
  if (!error) return [];
  const details = error.details;
  if (!details || typeof details !== 'object') return [];
  const messages = (details as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return [];
  return messages.filter((m): m is string => typeof m === 'string');
}
