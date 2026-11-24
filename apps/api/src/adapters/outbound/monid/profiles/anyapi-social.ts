/**
 * Shared parsing for anyapi's social "recent posts" endpoints (Instagram, TikTok, YouTube).
 *
 * Every one of them answered a real run (18/11/2026) with the same envelope:
 *   output = { found: boolean, data: { nextCursor: string, <listKey>: Item[] } }
 * Items carry `id`, `url` and `createdUtc` (Unix seconds).
 */
import type { JsonObject, JsonValue } from '../../../../core/domain';
import { isObject } from '../monid-http-client';

export function str(value: JsonValue | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function envelope(value: JsonValue | null): JsonObject | null {
  return value !== null && isObject(value) ? value : null;
}

/** "Account not found" message when the endpoint says so, otherwise `null`. */
export function notFoundProblem(value: JsonValue | null, what: string): string | null {
  return envelope(value)?.found === false ? `${what} not found. Check the handle.` : null;
}

/** The item list under `data[listKey]`, or none. */
export function itemsUnder(value: JsonValue | null, listKey: string): JsonObject[] {
  const data = envelope(value)?.data;
  const items = data !== undefined && data !== null && isObject(data) ? data[listKey] : undefined;
  return Array.isArray(items) ? items.filter(isObject) : [];
}

/** Publish time from `createdUtc` (Unix seconds), or an ISO `publishedTime` as a fallback. */
export function publishedAt(item: JsonObject): Date | null {
  if (typeof item.createdUtc === 'number') return new Date(item.createdUtc * 1000);
  const iso = str(item.publishedTime);
  if (iso === null) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Keep only identifiers, timing and aggregate counts (Privacy Act: collect only what is
 * necessary). Author details, avatars, mentions and tagged users are dropped.
 */
export function minimise(
  item: JsonObject,
  source: string,
  keys: readonly string[],
  countKeys: readonly string[],
): JsonObject {
  const kept: JsonObject = { source };
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null) kept[key] = value;
  }
  const counts: JsonObject = {};
  for (const key of countKeys) {
    const value = item[key];
    if (typeof value === 'number') counts[key] = value;
  }
  if (Object.keys(counts).length > 0) kept.engagement = counts;
  return kept;
}

/** Last non-empty path segment of a profile link, or the text itself without a leading @. */
export function lastSegment(handle: string): string {
  const trimmed = handle.trim();
  if (!trimmed.includes('/')) return trimmed.replace(/^@/, '');
  const parts = trimmed
    .replace(/[?#].*$/, '')
    .split('/')
    .filter((part) => part !== '');
  return (parts[parts.length - 1] ?? '').replace(/^@/, '');
}
