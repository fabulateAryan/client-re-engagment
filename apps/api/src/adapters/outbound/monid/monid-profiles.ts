import type { Platform } from '../../../core/domain';
import type { MonidEndpointProfile } from './monid-endpoint-profile';
import { anyapiInstagramUserPosts } from './profiles/anyapi-instagram-user-posts.profile';
import { anyapiLinkedInCompanyPosts } from './profiles/anyapi-linkedin-company-posts.profile';
import { anyapiTikTokProfileVideos } from './profiles/anyapi-tiktok-profile-videos.profile';
import { anyapiYouTubeChannelVideos } from './profiles/anyapi-youtube-channel-videos.profile';
import { contextDevNewsSearch } from './profiles/contextdev-news-search.profile';

/**
 * Registered endpoint profiles, one per Monid endpoint we use. Each was written from the
 * endpoint's inspected schema and a real run's output, never guessed.
 *
 * To use another endpoint, add its profile here. Starting with a source set to "monid" and
 * an unregistered endpoint fails fast with a clear message.
 */
const PROFILES: readonly MonidEndpointProfile[] = [
  anyapiLinkedInCompanyPosts,
  contextDevNewsSearch,
  anyapiInstagramUserPosts,
  anyapiTikTokProfileVideos,
  anyapiYouTubeChannelVideos,
];

export function findMonidProfile(
  platform: Platform,
  provider: string,
  endpoint: string,
): MonidEndpointProfile | null {
  return (
    PROFILES.find(
      (p) => p.platform === platform && p.provider === provider && p.endpoint === endpoint,
    ) ?? null
  );
}
