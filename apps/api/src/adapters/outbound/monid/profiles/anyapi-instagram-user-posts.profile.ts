/**
 * Instagram posts via Monid -> anyapi /instagram.user_posts.
 *
 * Based on the endpoint's inspected input schema and a real run's output (18/11/2026):
 *   input  = { handle (username, no @), cursor?, route? }
 *   output = { found, data: { nextCursor, posts: Post[] } }
 *   Post   = { id, url, caption, createdUtc (Unix seconds), likes, comments, views?,
 *              productType (feed | clips | carousel_container), hashtags[], paidPartnership,
 *              username, displayName, avatarUrl, media[], mentions[], taggedUsers[], ... }
 * Posts are not strictly newest first, so the source's `since` check does the filtering.
 *
 * Handle: the account as stored by brand setup (https://www.instagram.com/<name>/),
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

export const anyapiInstagramUserPosts: MonidEndpointProfile = {
  platform: Platform.INSTAGRAM,
  provider: 'anyapi',
  endpoint: '/instagram.user_posts',
  // productType is the format (feed, reel, carousel), not what the post is about.
  typeMap: {},
  defaultType: SignalType.NEW_POST,

  buildInput: (handle) => ({ body: { handle: lastSegment(handle).toLowerCase() } }),

  outputProblem: (value) => notFoundProblem(value, 'Instagram account'),

  extractItems: (value) => itemsUnder(value, 'posts'),

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
      'monid:anyapi/instagram.user_posts',
      ['id', 'createdUtc', 'url', 'productType', 'paidPartnership', 'hashtags'],
      ['likes', 'comments', 'views'],
    ),
};
