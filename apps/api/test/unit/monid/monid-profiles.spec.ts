/**
 * Mapping tests for the real Monid endpoint profiles. Fixtures copy the response SHAPES seen
 * in real runs; all names, URLs and text are invented placeholders.
 */
import { Logger } from '@nestjs/common';
import { FakeClock } from '../../../src/adapters/outbound/fakes';
import { MonidSignalSource } from '../../../src/adapters/outbound/monid';
import { findMonidProfile } from '../../../src/adapters/outbound/monid/monid-profiles';
import { anyapiLinkedInCompanyPosts } from '../../../src/adapters/outbound/monid/profiles/anyapi-linkedin-company-posts.profile';
import { contextDevNewsSearch } from '../../../src/adapters/outbound/monid/profiles/contextdev-news-search.profile';
import type { MonidEndpointProfile } from '../../../src/adapters/outbound/monid';
import { Platform, SignalSourceError, SignalType } from '../../../src/core/domain';
import type { Client } from '../../../src/core/domain';
import { fixture, json, scriptedFetch, testClient } from './monid-test-helpers';

const NOW = new Date('2026-11-06T00:00:00.000Z');
const CLIENT: Client = {
  id: 'placeholder-brand',
  name: 'Placeholder Brand',
  socialHandles: {
    [Platform.LINKEDIN]: 'https://example.com/company/placeholder-brand',
    [Platform.GOOGLE_RSS]: 'placeholder-brand.example',
  },
  lastActiveDate: null,
  lastCheckedAt: {},
};

function sourceFor(profile: MonidEndpointProfile, fixtureName: string) {
  const scripted = scriptedFetch([json(fixture(fixtureName))]);
  const source = new MonidSignalSource(
    testClient(scripted.fetchFn).client,
    profile,
    new FakeClock(NOW),
  );
  return { source, calls: scripted.calls };
}

beforeAll(() => {
  Logger.overrideLogger(false);
});

describe('profile registry', () => {
  it('registers both real endpoints', () => {
    expect(findMonidProfile(Platform.LINKEDIN, 'anyapi', '/linkedin.company_posts')).toBe(
      anyapiLinkedInCompanyPosts,
    );
    expect(findMonidProfile(Platform.GOOGLE_RSS, 'context.dev', '/news/search')).toBe(
      contextDevNewsSearch,
    );
    expect(findMonidProfile(Platform.LINKEDIN, 'context.dev', '/news/search')).toBeNull();
  });
});

describe('anyapi LinkedIn company posts profile', () => {
  it('sends the page URL in the body, company posts only', async () => {
    const { source, calls } = sourceFor(anyapiLinkedInCompanyPosts, 'anyapi-company-posts.json');
    await source.fetchSignals(CLIENT, null);
    expect(calls[0]?.body).toEqual({
      provider: 'anyapi',
      endpoint: '/linkedin.company_posts',
      input: {
        body: {
          url: 'https://example.com/company/placeholder-brand',
          limit: 20,
          includeReposts: false,
        },
      },
    });
  });

  it('maps posts (Unix-second dates, shareUrl fallback) and skips incomplete items', async () => {
    const { source } = sourceFor(anyapiLinkedInCompanyPosts, 'anyapi-company-posts.json');

    const signals = await source.fetchSignals(CLIENT, null);

    expect(signals).toHaveLength(2);
    expect(signals[0]).toMatchObject({
      externalId: '7500000000000000001',
      platform: Platform.LINKEDIN,
      signalType: SignalType.PRODUCT_LAUNCH,
      content: 'Placeholder: our new range launches today across Australia.',
      publishedAt: new Date(1793800000 * 1000),
    });
    expect(signals[1]?.url).toBe(
      'https://example.com/posts/placeholder-brand_activity-7500000000000000002',
    );
  });

  it('keeps engagement counts but no author details in raw', async () => {
    const { source } = sourceFor(anyapiLinkedInCompanyPosts, 'anyapi-company-posts.json');
    const [first] = await source.fetchSignals(CLIENT, null);
    expect(first?.raw).toEqual({
      source: 'monid:anyapi/linkedin.company_posts',
      id: '7500000000000000001',
      createdUtc: 1793800000,
      url: 'https://example.com/posts/placeholder-brand_activity-7500000000000000001',
      engagement: { likes: 120, comments: 8, shares: 5 },
    });
  });

  it('reports "page not found" as a source error instead of returning nothing', async () => {
    const { source } = sourceFor(anyapiLinkedInCompanyPosts, 'anyapi-not-found.json');
    const error = await source.fetchSignals(CLIENT, null).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SignalSourceError);
    expect((error as Error).message).toMatch(/LinkedIn page not found/);
  });
});

describe('context.dev news search profile', () => {
  it('searches by domain when the handle is a domain, by name otherwise', () => {
    expect(contextDevNewsSearch.buildInput('placeholder-brand.example', null)).toEqual({
      body: {
        searchBy: {
          type: 'entity',
          entity: { type: 'domain', domain: 'placeholder-brand.example' },
        },
        sortBy: { type: 'newest' },
        limit: 20,
      },
    });
    expect(contextDevNewsSearch.buildInput('Placeholder Brand', null)).toMatchObject({
      body: { searchBy: { entity: { type: 'name', name: 'Placeholder Brand' } } },
    });
  });

  it('asks only for articles after the last check', () => {
    const since = new Date('2026-11-01T00:00:00.000Z');
    expect(contextDevNewsSearch.buildInput('x.example', since)).toMatchObject({
      body: { filterBy: { date: { from: since.getTime() + 1 } } },
    });
  });

  it('keeps primary matches only, maps article types and dedupes by story', async () => {
    const { source } = sourceFor(contextDevNewsSearch, 'contextdev-news.json');

    const signals = await source.fetchSignals(CLIENT, null);

    expect(signals.map((s) => [s.externalId, s.signalType])).toEqual([
      ['story-1', SignalType.OTHER],
      ['story-2', SignalType.COMPANY_ANNOUNCEMENT],
      ['a4', SignalType.OTHER],
    ]);
    expect(signals.every((s) => s.platform === Platform.GOOGLE_RSS)).toBe(true);
    expect(signals[0]?.content).toBe('Placeholder Brand partners with a placeholder retailer');
  });

  it('supports "query | keywords": searches the query, keeps only articles with a keyword', async () => {
    expect(
      contextDevNewsSearch.buildInput('placeholder.example | Retailer, Results', null),
    ).toMatchObject({
      body: {
        searchBy: { entity: { type: 'domain', domain: 'placeholder.example' } },
        limit: 50,
      },
    });

    const scripted = scriptedFetch([json(fixture('contextdev-news.json'))]);
    const source = new MonidSignalSource(
      testClient(scripted.fetchFn).client,
      contextDevNewsSearch,
      new FakeClock(NOW),
    );
    const keywordClient: Client = {
      ...CLIENT,
      socialHandles: { [Platform.GOOGLE_RSS]: 'placeholder.example | retailer' },
    };

    const signals = await source.fetchSignals(keywordClient, null);

    expect(signals.map((s) => s.externalId)).toEqual(['story-1']);
  });

  it('drops authors and images from raw', async () => {
    const { source } = sourceFor(contextDevNewsSearch, 'contextdev-news.json');
    const [first] = await source.fetchSignals(CLIENT, null);
    const raw = JSON.stringify(first?.raw);
    expect(raw).not.toContain('Placeholder Journalist');
    expect(raw).not.toContain('a1.jpg');
    expect(first?.raw).toMatchObject({
      publisher: { name: 'Placeholder News', domain: 'news.example.com' },
      match: { level: 'primary', confidence: 0.99 },
    });
  });
});
