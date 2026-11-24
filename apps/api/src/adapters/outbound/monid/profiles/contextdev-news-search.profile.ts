/**
 * Company news via Monid -> context.dev /news/search. Feeds our GOOGLE_RSS (news) platform.
 *
 * Based on the endpoint's inspected input schema and a real run's output (05/11/2026):
 *   output  = { data: Article[], has_more, next_cursor, meta }
 *   Article = { id, story_id, url, title, description, language, authors[], image_url,
 *               published_at (ISO), type (editorial | press_release | regulatory_filing |
 *               advisory), source{name, domain}, match{level: primary|secondary, confidence} }
 *
 * Handle: a company website domain (e.g. "example.com") or, failing that, the company name.
 * Optionally add keywords after "|": "example.com | Thailand, Thai". Then only articles whose
 * title or description contains at least one keyword are kept (case-insensitive). Useful for
 * a regional business of a global brand, whose domain also matches global news.
 * Pricing at the time of writing: 1 credit per 10 articles returned; none if no articles.
 */
import { Platform, SignalType } from '../../../../core/domain';
import type { JsonObject, JsonValue } from '../../../../core/domain';
import { isObject } from '../monid-http-client';
import type { MappedItem, MonidEndpointProfile } from '../monid-endpoint-profile';

/** Articles per check (endpoint allows 1 to 100; billed per 10 returned). */
const ARTICLES_PER_CHECK = 20;
/** Articles per check when the handle has keywords (most get filtered out). */
const ARTICLES_PER_CHECK_FILTERED = 50;

const DOMAIN = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

function str(value: JsonValue | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Split "query | keyword, keyword" into its parts. */
export function parseNewsHandle(handle: string): { query: string; keywords: string[] } {
  const [query = '', keywordPart] = handle.split('|');
  const keywords = (keywordPart ?? '')
    .split(',')
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k !== '');
  return { query: query.trim(), keywords };
}

function entityFor(handle: string): JsonObject {
  const { query } = parseNewsHandle(handle);
  return DOMAIN.test(query) ? { type: 'domain', domain: query } : { type: 'name', name: query };
}

export const contextDevNewsSearch: MonidEndpointProfile = {
  platform: Platform.GOOGLE_RSS,
  provider: 'context.dev',
  endpoint: '/news/search',
  typeMap: {
    press_release: SignalType.COMPANY_ANNOUNCEMENT,
    regulatory_filing: SignalType.COMPANY_ANNOUNCEMENT,
  },
  // Independent reporting ("editorial") and advisories. See README open question about a
  // dedicated news signal type.
  defaultType: SignalType.OTHER,

  buildInput: (handle, since, maxItems) => ({
    body: {
      searchBy: { type: 'entity', entity: entityFor(handle) },
      sortBy: { type: 'newest' },
      // Keyword filtering discards most results, so look further back in one page.
      limit: newsLimit(handle, maxItems ?? null),
      ...(since === null ? {} : { filterBy: { date: { from: since.getTime() + 1 } } }),
    },
  }),

  extractItems: (value) => {
    const data = value !== null && isObject(value) ? value.data : undefined;
    return Array.isArray(data) ? data.filter(isObject) : [];
  },

  keepItem: (item, handle) => {
    const { keywords } = parseNewsHandle(handle);
    if (keywords.length === 0) return true;
    const text = `${str(item.title) ?? ''} ${str(item.description) ?? ''}`.toLowerCase();
    return keywords.some((keyword) => text.includes(keyword));
  },

  mapItem: (item): MappedItem | null => {
    // Only articles that are actually about the company. "secondary" matches mostly mention
    // it in passing (seen in real output), which would flood the feed with noise.
    const match = item.match;
    if (match === undefined || match === null || !isObject(match) || match.level !== 'primary') {
      return null;
    }
    const externalId = str(item.story_id) ?? str(item.id);
    const url = str(item.url);
    const title = str(item.title);
    const publishedAt = str(item.published_at);
    if (externalId === null || url === null || title === null || publishedAt === null) return null;
    const date = new Date(publishedAt);
    if (Number.isNaN(date.getTime())) return null;
    return {
      // story_id groups syndicated copies of one story, so it is reported once.
      externalId,
      providerType: str(item.type),
      content: title,
      url,
      publishedAt: date,
    };
  },

  // Keep article metadata. Drop authors (personal data) and the lead image.
  minimiseRaw: (item) => {
    const kept: JsonObject = { source: 'monid:context.dev/news/search' };
    for (const key of [
      'id',
      'story_id',
      'url',
      'title',
      'description',
      'language',
      'published_at',
      'type',
    ]) {
      const value = item[key];
      if (value !== undefined) kept[key] = value;
    }
    const source = item.source;
    if (source !== undefined && source !== null && isObject(source)) {
      kept.publisher = { name: source.name ?? null, domain: source.domain ?? null };
    }
    const match = item.match;
    if (match !== undefined && match !== null && isObject(match)) {
      kept.match = { level: match.level ?? null, confidence: match.confidence ?? null };
    }
    return kept;
  },
};

/**
 * Articles to ask for. With keywords, more are needed because filtering drops most of them.
 * `maxItems` (testing) lowers it: five times that with keywords, otherwise that many.
 */
function newsLimit(handle: string, maxItems: number | null): number {
  const filtered = parseNewsHandle(handle).keywords.length > 0;
  const usual = filtered ? ARTICLES_PER_CHECK_FILTERED : ARTICLES_PER_CHECK;
  if (maxItems === null) return usual;
  return Math.min(usual, filtered ? maxItems * 5 : maxItems);
}
