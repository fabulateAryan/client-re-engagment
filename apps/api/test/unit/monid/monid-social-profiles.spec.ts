/**
 * Mapping tests for the anyapi Instagram, TikTok and YouTube profiles. Response SHAPES copy
 * real runs (18/11/2026); every name, URL and text is an invented placeholder.
 */
import { Logger } from '@nestjs/common';
import { FakeClock } from '../../../src/adapters/outbound/fakes';
import { MonidSignalSource } from '../../../src/adapters/outbound/monid';
import type { MonidEndpointProfile } from '../../../src/adapters/outbound/monid';
import { findMonidProfile } from '../../../src/adapters/outbound/monid/monid-profiles';
import { anyapiInstagramUserPosts } from '../../../src/adapters/outbound/monid/profiles/anyapi-instagram-user-posts.profile';
import { anyapiTikTokProfileVideos } from '../../../src/adapters/outbound/monid/profiles/anyapi-tiktok-profile-videos.profile';
import {
  anyapiYouTubeChannelVideos,
  youTubeChannelInput,
} from '../../../src/adapters/outbound/monid/profiles/anyapi-youtube-channel-videos.profile';
import {
  Platform,
  SignalSourceError,
  SignalType,
  normaliseYouTubeChannel,
} from '../../../src/core/domain';
import type { Client, JsonObject, JsonValue } from '../../../src/core/domain';
import { json, scriptedFetch, testClient } from './monid-test-helpers';

const NOW = new Date('2026-11-18T00:00:00.000Z');
const T1 = 1794000000; // 06/11/2026
const T2 = 1794400000; // 11/11/2026

const CLIENT: Client = {
  id: 'placeholder-brand',
  name: 'Placeholder Brand',
  socialHandles: {
    [Platform.INSTAGRAM]: 'https://www.instagram.com/placeholder.brand/',
    [Platform.TIKTOK]: 'https://www.tiktok.com/@placeholderbrand',
    [Platform.YOUTUBE]: 'https://www.youtube.com/@PlaceholderBrand',
  },
  lastActiveDate: null,
  lastCheckedAt: {},
};

function run(output: JsonValue): JsonObject {
  return {
    runId: '01TESTRUN000000000000000000',
    provider: 'anyapi',
    endpoint: '/x',
    status: 'COMPLETED',
    output,
  };
}

function sourceFor(profile: MonidEndpointProfile, output: JsonValue) {
  const scripted = scriptedFetch([json(run(output))]);
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

describe('registry', () => {
  it('registers the three social endpoints', () => {
    expect(findMonidProfile(Platform.INSTAGRAM, 'anyapi', '/instagram.user_posts')).toBe(
      anyapiInstagramUserPosts,
    );
    expect(findMonidProfile(Platform.TIKTOK, 'anyapi', '/tiktok.profile_videos')).toBe(
      anyapiTikTokProfileVideos,
    );
    expect(findMonidProfile(Platform.YOUTUBE, 'anyapi', '/youtube.channel_videos')).toBe(
      anyapiYouTubeChannelVideos,
    );
  });
});

describe('Instagram user posts', () => {
  const output: JsonObject = {
    found: true,
    data: {
      nextCursor: 'c1',
      posts: [
        {
          id: '1001',
          url: 'https://example.com/p/a/',
          caption: 'Placeholder: new range launches today',
          createdUtc: T2,
          likes: 10,
          comments: 2,
          productType: 'feed',
          hashtags: ['x'],
          paidPartnership: false,
          username: 'someone',
          avatarUrl: 'https://example.com/a.jpg',
          taggedUsers: [],
        },
        {
          id: '1002',
          url: 'https://example.com/p/b/',
          caption: 'Older post',
          createdUtc: T1,
          likes: 3,
          comments: 0,
        },
        { id: '1003', caption: 'No url, skipped', createdUtc: T2 },
      ],
    },
  };

  it('sends the bare username', async () => {
    const { source, calls } = sourceFor(anyapiInstagramUserPosts, output);
    await source.fetchSignals(CLIENT, null);
    expect(calls[0]?.body).toEqual({
      provider: 'anyapi',
      endpoint: '/instagram.user_posts',
      input: { body: { handle: 'placeholder.brand' } },
    });
  });

  it('maps posts, skips incomplete ones and drops author details', async () => {
    const { source } = sourceFor(anyapiInstagramUserPosts, output);
    const signals = await source.fetchSignals(CLIENT, null);
    expect(signals).toHaveLength(2);
    expect(signals[0]).toMatchObject({
      id: 'INSTAGRAM:1001',
      platform: Platform.INSTAGRAM,
      signalType: SignalType.PRODUCT_LAUNCH,
      publishedAt: new Date(T2 * 1000),
    });
    expect(signals[0]?.raw).not.toHaveProperty('username');
    expect(signals[0]?.raw).not.toHaveProperty('avatarUrl');
    expect(signals[0]?.raw).toMatchObject({ engagement: { likes: 10, comments: 2 } });
  });

  it('only returns posts after `since`, even when out of order', async () => {
    const { source } = sourceFor(anyapiInstagramUserPosts, output);
    const signals = await source.fetchSignals(CLIENT, new Date((T1 + 1) * 1000));
    expect(signals.map((s) => s.externalId)).toEqual(['1001']);
  });

  it('reports an unknown account as a source error', async () => {
    const { source } = sourceFor(anyapiInstagramUserPosts, { found: false, data: null });
    await expect(source.fetchSignals(CLIENT, null)).rejects.toBeInstanceOf(SignalSourceError);
  });
});

describe('TikTok profile videos', () => {
  const output: JsonObject = {
    found: true,
    data: {
      nextCursor: 'c1',
      videos: [
        {
          id: '2001',
          url: 'https://example.com/@x/video/2001',
          caption: 'Placeholder clip',
          createdUtc: T2,
          views: 500,
          likes: 40,
          comments: 3,
          shares: 1,
          saves: 2,
          isPinned: false,
          authorHandle: 'someone',
          authorName: 'Someone',
        },
      ],
    },
  };

  it('sends the bare username and maps videos', async () => {
    const { source, calls } = sourceFor(anyapiTikTokProfileVideos, output);
    const signals = await source.fetchSignals(CLIENT, null);
    expect(calls[0]?.body).toMatchObject({ input: { body: { handle: 'placeholderbrand' } } });
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ id: 'TIKTOK:2001', signalType: SignalType.NEW_POST });
    expect(signals[0]?.raw).not.toHaveProperty('authorHandle');
    expect(signals[0]?.raw).toMatchObject({ engagement: { views: 500, likes: 40, shares: 1 } });
  });
});

describe('YouTube channel videos', () => {
  const output: JsonObject = {
    found: true,
    data: {
      nextCursor: 'c1',
      videos: [
        {
          id: 'vid0000001',
          url: 'https://example.com/watch?v=1',
          title: 'Placeholder video',
          createdUtc: T2,
          views: 900,
        },
        {
          id: 'vid0000002',
          url: 'https://example.com/watch?v=2',
          title: 'ISO date only',
          publishedTime: '2026-11-06T10:00:00.000Z',
        },
      ],
    },
  };

  it('sends @handle on the fox route and maps the title as content', async () => {
    const { source, calls } = sourceFor(anyapiYouTubeChannelVideos, output);
    const signals = await source.fetchSignals(CLIENT, null);
    expect(calls[0]?.body).toMatchObject({
      input: { body: { handle: '@PlaceholderBrand', route: 'fox' } },
    });
    expect(signals).toHaveLength(2);
    expect(signals[0]).toMatchObject({ id: 'YOUTUBE:vid0000001', content: 'Placeholder video' });
    expect(signals[1]?.publishedAt).toEqual(new Date('2026-11-06T10:00:00.000Z'));
  });

  it('uses channelId for channel-ID links', () => {
    const id = 'UC' + 'a'.repeat(22);
    expect(youTubeChannelInput(`https://www.youtube.com/channel/${id}`)).toEqual({ channelId: id });
    expect(youTubeChannelInput('@someone')).toEqual({ handle: '@someone' });
  });
});

describe('normaliseYouTubeChannel', () => {
  it.each([
    ['@PlaceholderBrand', 'https://www.youtube.com/@placeholderbrand'],
    ['placeholderbrand', 'https://www.youtube.com/@placeholderbrand'],
    [
      'https://www.youtube.com/@placeholderbrand/videos',
      'https://www.youtube.com/@placeholderbrand',
    ],
    ['youtube.com/c/placeholderbrand', 'https://www.youtube.com/@placeholderbrand'],
    [
      `https://www.youtube.com/channel/UC${'b'.repeat(22)}`,
      `https://www.youtube.com/channel/UC${'b'.repeat(22)}`,
    ],
  ])('accepts %s', (input, expected) => {
    expect(normaliseYouTubeChannel(input)).toBe(expected);
  });

  it.each(['https://www.youtube.com/watch?v=abc', 'https://example.com/@someone', 'ab'])(
    'rejects %s',
    (input) => {
      expect(normaliseYouTubeChannel(input)).toBeNull();
    },
  );
});
