/**
 * The two testing settings: MONID_MAX_POSTS_PER_ACCOUNT (fewer posts from Monid) and
 * SIGNALS_MIN_SCORE (show only relevant signals). Both default to "no limit". Invented data.
 */
import { Logger } from '@nestjs/common';
import { FakeClock, InMemorySignalRepository } from '../../src/adapters/outbound/fakes';
import { MonidSignalSource } from '../../src/adapters/outbound/monid';
import type { MonidEndpointProfile } from '../../src/adapters/outbound/monid';
import { anyapiLinkedInCompanyPosts } from '../../src/adapters/outbound/monid/profiles/anyapi-linkedin-company-posts.profile';
import { loadAppConfig } from '../../src/config';
import { Platform, SignalType } from '../../src/core/domain';
import type { Client, JsonObject, Signal } from '../../src/core/domain';
import { json, scriptedFetch, testClient } from './monid/monid-test-helpers';

const NOW = new Date('2026-11-18T00:00:00.000Z');

const CLIENT: Client = {
  id: 'placeholder-brand',
  name: 'Placeholder Brand',
  socialHandles: { [Platform.INSTAGRAM]: 'placeholder.brand' },
  lastActiveDate: null,
  lastCheckedAt: {},
};

/** A minimal profile: items under `posts`, each with id and day of November. */
const PROFILE: MonidEndpointProfile = {
  platform: Platform.INSTAGRAM,
  provider: 'test',
  endpoint: '/posts',
  typeMap: {},
  defaultType: SignalType.NEW_POST,
  buildInput: (handle) => ({ handle }),
  extractItems: (output) =>
    ((output as JsonObject | null)?.posts as JsonObject[] | undefined) ?? [],
  mapItem: (item) => ({
    externalId: String(item.id),
    providerType: null,
    content: 'A post',
    url: `https://example.test/${String(item.id)}`,
    publishedAt: new Date(Date.UTC(2026, 10, Number(item.day))),
  }),
  minimiseRaw: () => ({}),
};

function sourceWith(maxItems: number | null) {
  const posts = [3, 9, 5, 1, 7].map((day) => ({ id: `p${day}`, day }));
  const scripted = scriptedFetch([
    json({
      runId: '01TESTRUN000000000000000000',
      provider: 'test',
      endpoint: '/posts',
      status: 'COMPLETED',
      output: { posts },
    }),
  ]);
  const { client } = testClient(scripted.fetchFn);
  return new MonidSignalSource(client, PROFILE, new FakeClock(NOW), maxItems);
}

function signal(id: string, content: string): Signal {
  return {
    id,
    clientId: 'c1',
    platform: Platform.LINKEDIN,
    signalType: SignalType.NEW_POST,
    content,
    url: `https://example.test/${id}`,
    externalId: id,
    publishedAt: NOW,
    collectedAt: NOW,
    raw: {},
  };
}

describe('Testing limits', () => {
  beforeAll(() => Logger.overrideLogger(false));

  it('keeps every post when no limit is set (production)', async () => {
    expect(await sourceWith(null).fetchSignals(CLIENT, null)).toHaveLength(5);
  });

  it('keeps only the newest posts when MONID_MAX_POSTS_PER_ACCOUNT is set', async () => {
    const signals = await sourceWith(2).fetchSignals(CLIENT, null);
    expect(signals.map((s) => s.externalId)).toEqual(['p9', 'p7']);
  });

  it('asks LinkedIn for fewer posts when limited, and the usual 20 otherwise', () => {
    const url = 'https://www.linkedin.com/company/placeholder/';
    expect(anyapiLinkedInCompanyPosts.buildInput(url, null, 5)).toMatchObject({
      body: { limit: 5 },
    });
    expect(anyapiLinkedInCompanyPosts.buildInput(url, null, null)).toMatchObject({
      body: { limit: 20 },
    });
  });

  it('hides signals below SIGNALS_MIN_SCORE from lists and totals, but keeps them stored', async () => {
    const repo = new InMemorySignalRepository({ minScore: 50 });
    await repo.saveMany([
      signal('plain', 'Happy Friday everyone'),
      signal('relevant', 'Introducing our new range, launching in Sydney with an ambassador'),
    ]);

    const page = await repo.list({ page: 1, pageSize: 10 });
    expect(page.items.map((s) => s.id)).toEqual(['relevant']);
    expect(page.total).toBe(1);
    expect(await repo.summarise()).toMatchObject({ total: 1, minScore: 50 });
    expect(repo.all()).toHaveLength(2);
  });

  it('shows everything by default', async () => {
    const repo = new InMemorySignalRepository();
    await repo.saveMany([signal('plain', 'Happy Friday everyone')]);
    expect((await repo.list({ page: 1, pageSize: 10 })).total).toBe(1);
  });

  it('reads both settings from the environment, with no limits when unset', () => {
    const unset = loadAppConfig({}, '1.0.0');
    expect(unset.signalsMinScore).toBe(0);

    const set = loadAppConfig(
      {
        SIGNALS_MIN_SCORE: '50',
        MONID_API_KEY: 'test-key-not-real',
        MONID_MAX_POSTS_PER_ACCOUNT: '5',
      },
      '1.0.0',
    );
    expect(set.signalsMinScore).toBe(50);
    expect(set.monid?.maxPostsPerAccount).toBe(5);
  });
});
