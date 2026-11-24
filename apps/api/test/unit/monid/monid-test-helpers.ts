import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MonidEndpointProfile } from '../../../src/adapters/outbound/monid';
import { isObject, MonidHttpClient } from '../../../src/adapters/outbound/monid';
import type { FetchFn, MonidClientConfig } from '../../../src/adapters/outbound/monid';
import { Platform, SignalType } from '../../../src/core/domain';
import type { JsonObject, JsonValue } from '../../../src/core/domain';

export function fixture(name: string): JsonObject {
  const path = join(__dirname, '..', '..', 'fixtures', 'monid', name);
  return JSON.parse(readFileSync(path, 'utf8')) as JsonObject;
}

export const TEST_CONFIG: MonidClientConfig = {
  baseUrl: 'https://monid.test',
  apiKey: 'test-key-not-real',
  requestTimeoutMs: 1_000,
  maxRetries: 2,
  retryBaseDelayMs: 100,
  pollIntervalMs: 50,
  runTimeoutMs: 1_000,
};

export interface ScriptedCall {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: JsonValue | null;
}

type Step = Response | Error | (() => Response);

/** A fetch stand-in that replays scripted responses in order and records every call. */
export function scriptedFetch(steps: Step[]): { fetchFn: FetchFn; calls: ScriptedCall[] } {
  const calls: ScriptedCall[] = [];
  const queue = [...steps];
  const fetchFn: FetchFn = (url, init) => {
    calls.push({
      method: init.method ?? 'GET',
      url,
      headers: init.headers as Record<string, string>,
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as JsonValue) : null,
    });
    const step = queue.shift();
    if (step === undefined) return Promise.reject(new Error('unexpected extra request'));
    if (step instanceof Error) return Promise.reject(step);
    return Promise.resolve(typeof step === 'function' ? step() : step);
  };
  return { fetchFn, calls };
}

export function json(body: JsonValue, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** Client with instant sleeps (recorded) and a controllable clock. */
export function testClient(fetchFn: FetchFn, config: MonidClientConfig = TEST_CONFIG) {
  const sleeps: number[] = [];
  let now = 0;
  const client = new MonidHttpClient(
    config,
    fetchFn,
    (ms) => {
      sleeps.push(ms);
      now += ms;
      return Promise.resolve();
    },
    () => now,
  );
  return { client, sleeps };
}

/**
 * Test-only profile for the invented fixture item shape. It is NOT the real LinkedIn
 * mapping: that is written once the chosen Monid endpoint's output is known.
 */
export const TEST_PROFILE: MonidEndpointProfile = {
  platform: Platform.LINKEDIN,
  provider: 'example-provider',
  endpoint: '/example/linkedin-posts',
  typeMap: { hiring: SignalType.HIRING },
  defaultType: SignalType.OTHER,
  buildInput: (handle, since) => ({
    profile: handle,
    ...(since === null ? {} : { since: since.toISOString() }),
  }),
  extractItems: (output) => (Array.isArray(output) ? output.filter(isObject) : []),
  mapItem: (item) => {
    if (typeof item.postId !== 'string' || typeof item.postedAt !== 'string') return null;
    return {
      externalId: item.postId,
      providerType: typeof item.kind === 'string' ? item.kind : null,
      content: typeof item.text === 'string' ? item.text : '',
      url: typeof item.postUrl === 'string' ? item.postUrl : '',
      publishedAt: new Date(item.postedAt),
    };
  },
  minimiseRaw: (item) => {
    const kept: JsonObject = {};
    for (const key of ['postId', 'kind', 'postedAt', 'postUrl']) {
      const value = item[key];
      if (value !== undefined) kept[key] = value;
    }
    return kept;
  },
};
