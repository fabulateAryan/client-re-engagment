'use client';

import { useSyncExternalStore } from 'react';

/**
 * How many replies this person has already seen in each outreach thread, so threads can show
 * "new" until they are opened. Kept in this browser only (each rep has their own read state).
 */
type SeenMap = Readonly<Record<string, number>>;

const STORAGE_KEY = 'outreach-seen-replies';
const EMPTY: SeenMap = {};
const listeners = new Set<() => void>();
let cache: SeenMap | null = null;

function read(): SeenMap {
  if (cache !== null) return cache;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    cache = parsed !== null && typeof parsed === 'object' ? (parsed as SeenMap) : EMPTY;
  } catch {
    cache = EMPTY; // storage blocked or corrupt: everything counts as unseen
  }
  return cache;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent): void => {
    if (e.key !== STORAGE_KEY) return;
    cache = null; // another tab changed it
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Records that `replies` replies in this thread have been seen. Never lowers the count. */
export function markRepliesSeen(signalId: string, replies: number): void {
  const current = read();
  if ((current[signalId] ?? 0) >= replies) return;
  cache = { ...current, [signalId]: replies };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Not saved across reloads, but still correct for this page.
  }
  for (const listener of listeners) listener();
}

/** Seen-reply counts by signal id (empty during server rendering). */
export function useSeenReplies(): SeenMap {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
