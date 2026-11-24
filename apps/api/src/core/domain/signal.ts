import type { JsonObject } from './json';
import type { Platform } from './platform';
import type { SignalType } from './signal-type';

/** Something a client did on a platform that might be worth reacting to. */
export interface Signal {
  readonly id: string;
  readonly clientId: string;
  readonly platform: Platform;
  readonly signalType: SignalType;
  readonly content: string;
  readonly url: string;
  /** The platform's or provider's own id for the item. Unique per platform. */
  readonly externalId: string;
  readonly publishedAt: Date;
  readonly collectedAt: Date;
  /** Original provider payload, kept for auditing and re-processing. */
  readonly raw: JsonObject;
}

/** A signal as stored, with what a person has done with it. */
export interface StoredSignal extends Signal {
  /** When a rep skipped it (story 8b), or `null` if it is still to review. */
  readonly skippedAt: Date | null;
}

/**
 * True when the signal has an http(s) link a person can open to check it (story 4).
 * Signals without one are never shown, because their facts cannot be verified.
 */
export function hasSource(signal: Pick<Signal, 'url'>): boolean {
  try {
    const { protocol } = new URL(signal.url.trim());
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** Identity used for de-duplication: the same item seen twice on one platform is one signal. */
export function signalIdentityKey(signal: Pick<Signal, 'platform' | 'externalId'>): string {
  return `${signal.platform}:${signal.externalId}`;
}
