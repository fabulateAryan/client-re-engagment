/**
 * TikTok videos via Monid -> anyapi /tiktok.profile_videos.
 *
 * Based on the endpoint's inspected input schema and a real run's output (18/11/2026):
 *   input  = { handle (username, no @), cursor?, route? }
 *   output = { found, data: { nextCursor, videos: Video[] } }
 *   Video  = { id, url, caption, createdUtc (Unix seconds), views, likes, comments, shares,
 *              saves, durationSeconds, hashtags[], isPinned, paidPartnership,
 *              authorHandle, authorName, authorImage, soundTitle, ... }
 * Newest first, except pinned videos, which can be old; the `since` check drops those.
 *
 * Handle: the account as stored by brand setup (https://www.tiktok.com/@<name>),
 * or `@name` / `name` in the clients file.
 * Pricing at the time of writing: flat per call on the default route, one page per check.
 */
import { Platform, SignalType } from '../../../../core/domain';
import type { MappedItem, MonidEndpointProfile } from '../monid-endpoint-profile';
import {
  itemsUnder,
  lastSegment,
  minimise,
  notFoundProblem,
  publishedAt,
  str,
} from './anyapi-social';

export const anyapiTikTokProfileVideos: MonidEndpointProfile = {
  platform: Platform.TIKTOK,
  provider: 'anyapi',
  endpoint: '/tiktok.profile_videos',
  // The endpoint has no content-type field, so every item is a new post.
  typeMap: {},
  defaultType: SignalType.NEW_POST,

  buildInput: (handle) => ({ body: { handle: lastSegment(handle).toLowerCase() } }),

  outputProblem: (value) => notFoundProblem(value, 'TikTok account'),

  extractItems: (value) => itemsUnder(value, 'videos'),

  mapItem: (item): MappedItem | null => {
    const id = str(item.id);
    const url = str(item.url);
    const date = publishedAt(item);
    if (id === null || url === null || date === null) return null;
    return {
      externalId: id,
      providerType: null,
      content: str(item.caption) ?? '',
      url,
      publishedAt: date,
    };
  },

  minimiseRaw: (item) =>
    minimise(
      item,
      'monid:anyapi/tiktok.profile_videos',
      ['id', 'createdUtc', 'url', 'durationSeconds', 'isPinned', 'paidPartnership', 'hashtags'],
      ['views', 'likes', 'comments', 'shares', 'saves'],
    ),
};
