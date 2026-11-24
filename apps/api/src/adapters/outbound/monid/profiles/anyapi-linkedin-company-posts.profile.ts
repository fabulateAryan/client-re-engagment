/**
 * LinkedIn company posts via Monid -> anyapi /linkedin.company_posts.
 *
 * Based on the endpoint's inspected input schema and a real run's output (05/11/2026):
 *   output = { found: boolean, reason?: string, data: { items: Post[] } | null }
 *   Post   = { id, text, url, shareUrl, createdUtc (Unix seconds), engagement{...},
 *              author{...}, repostAuthorName?, ... }
 *
 * Handle: the full LinkedIn company page URL, e.g. https://www.linkedin.com/company/<slug>.
 * Pricing at the time of writing: flat per call (route "alpaca"), so one page per check.
 */
import { Platform, SignalType } from '../../../../core/domain';
import type { JsonObject, JsonValue } from '../../../../core/domain';
import { isObject } from '../monid-http-client';
import type { MappedItem, MonidEndpointProfile } from '../monid-endpoint-profile';

/** Posts per check. The endpoint allows 1 to 50 and charges per call, not per post. */
const POSTS_PER_CHECK = 20;

function output(value: JsonValue | null): JsonObject | null {
  return value !== null && isObject(value) ? value : null;
}

function str(value: JsonValue | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

export const anyapiLinkedInCompanyPosts: MonidEndpointProfile = {
  platform: Platform.LINKEDIN,
  provider: 'anyapi',
  endpoint: '/linkedin.company_posts',
  // The endpoint has no post-type field, so every item is simply a new post.
  typeMap: {},
  defaultType: SignalType.NEW_POST,

  buildInput: (handle, _since, maxItems) => ({
    body: {
      url: handle,
      limit: Math.min(POSTS_PER_CHECK, maxItems ?? POSTS_PER_CHECK),
      // Company-authored posts only. Plain reposts carry other people's posts (personal
      // data we do not need); quote posts include the company's own words and are kept.
      includeReposts: false,
    },
  }),

  outputProblem: (value) => {
    const out = output(value);
    if (out?.found === false) {
      return `LinkedIn page not found (${str(out.reason) ?? 'no reason'}). Check the LINKEDIN handle.`;
    }
    return null;
  },

  extractItems: (value) => {
    const data = output(value)?.data;
    const items = data !== undefined && data !== null && isObject(data) ? data.items : undefined;
    return Array.isArray(items) ? items.filter(isObject) : [];
  },

  mapItem: (item): MappedItem | null => {
    const id = str(item.id);
    const url = str(item.url) ?? str(item.shareUrl);
    const createdUtc = item.createdUtc;
    if (id === null || url === null || typeof createdUtc !== 'number') return null;
    return {
      externalId: id,
      providerType: null,
      content: str(item.text) ?? '',
      url,
      publishedAt: new Date(createdUtc * 1000),
    };
  },

  // Keep identifiers, timing and aggregate engagement. Drop author, images and video.
  minimiseRaw: (item) => {
    const kept: JsonObject = { source: 'monid:anyapi/linkedin.company_posts' };
    for (const key of ['id', 'createdUtc', 'url']) {
      const value = item[key];
      if (value !== undefined) kept[key] = value;
    }
    const engagement = item.engagement;
    if (engagement !== undefined && engagement !== null && isObject(engagement)) {
      const counts: JsonObject = {};
      for (const key of ['likes', 'comments', 'shares']) {
        const value = engagement[key];
        if (typeof value === 'number') counts[key] = value;
      }
      kept.engagement = counts;
    }
    return kept;
  },
};
