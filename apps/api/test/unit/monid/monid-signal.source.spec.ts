import { Logger } from '@nestjs/common';
import { FakeClock } from '../../../src/adapters/outbound/fakes';
import {
  createMonidSource,
  mapProviderSignalType,
  MonidSignalSource,
} from '../../../src/adapters/outbound/monid';
import {
  Platform,
  SignalSourceError,
  SignalSourceFailure,
  SignalType,
} from '../../../src/core/domain';
import type { Client } from '../../../src/core/domain';
import {
  TEST_CONFIG,
  TEST_PROFILE,
  fixture,
  json,
  scriptedFetch,
  testClient,
} from './monid-test-helpers';

const NOW = new Date('2026-11-01T00:00:00.000Z');
const CLIENT: Client = {
  id: 'client-test',
  name: 'Test Client',
  socialHandles: {
    [Platform.LINKEDIN]: 'placeholder-handle',
    [Platform.GOOGLE_RSS]: 'placeholder search term',
  },
  lastActiveDate: null,
  lastCheckedAt: {},
};

function sourceWith(steps: Parameters<typeof scriptedFetch>[0], profile = TEST_PROFILE) {
  const scripted = scriptedFetch(steps);
  const { client } = testClient(scripted.fetchFn);
  const source = new MonidSignalSource(client, profile, new FakeClock(NOW));
  return { source, calls: scripted.calls };
}

describe('MonidSignalSource', () => {
  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  it('maps provider items to signals for the profile platform', async () => {
    const { source, calls } = sourceWith([json(fixture('run-sync-completed.json'))]);

    const signals = await source.fetchSignals(CLIENT, null);

    expect(source.platform).toBe(Platform.LINKEDIN);
    expect(calls[0]?.body).toMatchObject({
      provider: 'example-provider',
      endpoint: '/example/linkedin-posts',
      input: { profile: 'placeholder-handle' },
    });
    expect(signals).toHaveLength(2);
    expect(signals[0]).toEqual({
      id: 'LINKEDIN:post-1001',
      clientId: 'client-test',
      platform: Platform.LINKEDIN,
      signalType: SignalType.HIRING,
      content: 'Placeholder text: we are hiring for a placeholder role.',
      url: 'https://example.com/posts/post-1001',
      externalId: 'post-1001',
      publishedAt: new Date('2026-10-30T01:00:00.000Z'),
      collectedAt: NOW,
      raw: {
        postId: 'post-1001',
        kind: 'hiring',
        postedAt: '2026-10-30T01:00:00.000Z',
        postUrl: 'https://example.com/posts/post-1001',
      },
    });
    // Unknown provider type falls back to the profile default.
    expect(signals[1]?.signalType).toBe(SignalType.OTHER);
  });

  it('works for any platform: a news profile reads the GOOGLE_RSS handle', async () => {
    const newsProfile = { ...TEST_PROFILE, platform: Platform.GOOGLE_RSS };
    const { source, calls } = sourceWith([json(fixture('run-sync-completed.json'))], newsProfile);

    const signals = await source.fetchSignals(CLIENT, null);

    expect(calls[0]?.body).toMatchObject({ input: { profile: 'placeholder search term' } });
    expect(signals.every((s) => s.platform === Platform.GOOGLE_RSS)).toBe(true);
    expect(signals[0]?.id).toBe('GOOGLE_RSS:post-1001');
  });

  it('keeps only allow-listed fields in raw (no author details)', async () => {
    const { source } = sourceWith([json(fixture('run-sync-completed.json'))]);
    const [first] = await source.fetchSignals(CLIENT, null);
    expect(JSON.stringify(first?.raw)).not.toContain('Placeholder Person');
  });

  it('drops items published at or before "since"', async () => {
    const { source, calls } = sourceWith([json(fixture('run-sync-completed.json'))]);

    const signals = await source.fetchSignals(CLIENT, new Date('2026-10-30T12:00:00.000Z'));

    expect(calls[0]?.body).toMatchObject({ input: { since: '2026-10-30T12:00:00.000Z' } });
    expect(signals.map((s) => s.externalId)).toEqual(['post-1002']);
  });

  it('returns no signals for an empty or "no match" response', async () => {
    const empty = { ...fixture('run-sync-completed.json'), output: [] };
    expect(await sourceWith([json(empty)]).source.fetchSignals(CLIENT, null)).toEqual([]);

    const notFound = sourceWith([json(fixture('run-provider-not-found.json'), 404)]);
    expect(await notFound.source.fetchSignals(CLIENT, null)).toEqual([]);
  });

  it('does not call Monid for a client without a handle on that platform', async () => {
    const { source, calls } = sourceWith([]);
    const noHandle: Client = { ...CLIENT, socialHandles: {} };
    expect(await source.fetchSignals(noHandle, null)).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('converts Monid failures into a domain SignalSourceError', async () => {
    const { source } = sourceWith([json({ code: 401, message: 'Invalid key' }, 401)]);

    const error = await source.fetchSignals(CLIENT, null).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SignalSourceError);
    expect((error as SignalSourceError).failure).toBe(SignalSourceFailure.NOT_AUTHORISED);
    expect((error as SignalSourceError).message).not.toContain('placeholder-handle');
  });
});

describe('mapProviderSignalType', () => {
  const profile = {
    typeMap: { hiring: SignalType.HIRING, 'job change': SignalType.JOB_CHANGE },
    defaultType: SignalType.OTHER,
  };

  it('maps known labels case-insensitively and everything else to the default', () => {
    expect(mapProviderSignalType('Hiring', profile)).toBe(SignalType.HIRING);
    expect(mapProviderSignalType(' job change ', profile)).toBe(SignalType.JOB_CHANGE);
    expect(mapProviderSignalType('something-new', profile)).toBe(SignalType.OTHER);
    expect(mapProviderSignalType(null, profile)).toBe(SignalType.OTHER);
  });
});

describe('createMonidSource', () => {
  it('fails fast when no profile is registered for the chosen endpoint', () => {
    const settings = {
      ...TEST_CONFIG,
      linkedIn: null,
      news: null,
      instagram: null,
      tiktok: null,
      youtube: null,
    };
    expect(() =>
      createMonidSource(
        Platform.LINKEDIN,
        { provider: 'unregistered', endpoint: '/nothing' },
        settings,
        new FakeClock(NOW),
      ),
    ).toThrow(/No LINKEDIN mapping profile/);
  });
});
