/**
 * Manual brand setup (Phase 1): a person names a brand and gives its LinkedIn company page.
 * Pure helpers only; storing the brand is the client repository's job.
 */

/** What a person enters to set up a brand. */
export interface BrandInput {
  readonly name: string;
  readonly linkedInUrl: string;
  /** Optional website, used to watch news about the brand. */
  readonly website?: string | null;
  /** Optional Instagram account, watched when the Instagram source is connected. */
  readonly instagram?: string | null;
  /** Optional TikTok account, watched when the TikTok source is connected. */
  readonly tiktok?: string | null;
  /** Optional YouTube channel, watched when the YouTube source is connected. */
  readonly youtube?: string | null;
}

const LINKEDIN_HOSTS = new Set(['linkedin.com', 'www.linkedin.com', 'au.linkedin.com']);

/**
 * Turns any LinkedIn company page link into one canonical form,
 * `https://www.linkedin.com/company/<slug>/`, or `null` if it is not a company page.
 * Accepts links with or without `https://`, `www.`, trailing paths or query strings.
 */
export function normaliseLinkedInCompanyUrl(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (!LINKEDIN_HOSTS.has(url.hostname.toLowerCase())) return null;
  const [kind, slug] = url.pathname.split('/').filter((part) => part !== '');
  if (kind?.toLowerCase() !== 'company' || slug === undefined) return null;
  if (!/^[a-z0-9][a-z0-9._%-]*$/i.test(slug)) return null;
  return `https://www.linkedin.com/company/${slug.toLowerCase()}/`;
}

/** A bare domain such as `example.com` from a website link, or `null` if it is not one. */
export function normaliseWebsite(input: string | null | undefined): string | null {
  const trimmed = (input ?? '').trim();
  if (trimmed === '') return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return host.includes('.') ? host : null;
  } catch {
    return null;
  }
}

/** Instagram paths that are pages, not accounts. */
const INSTAGRAM_RESERVED = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'tv', 'accounts']);

/**
 * Reads a social account from what a person typed: `@name`, `name`, or a profile link on one
 * of `hosts`. Returns the lower-case username, or `null` if it is not a valid account.
 */
function socialUsername(
  input: string,
  hosts: ReadonlySet<string>,
  pattern: RegExp,
  pickSegment: (segments: string[]) => string | undefined,
): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  let candidate: string | undefined;
  const isLink = /^(https?:\/\/|www\.)/i.test(trimmed) || trimmed.includes('/');
  if (!isLink) {
    candidate = trimmed.replace(/^@/, '');
  } else {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    } catch {
      return null;
    }
    if (!hosts.has(url.hostname.toLowerCase())) return null;
    candidate = pickSegment(url.pathname.split('/').filter((part) => part !== ''));
  }
  if (candidate === undefined || !pattern.test(candidate)) return null;
  return candidate.toLowerCase();
}

/**
 * Canonical Instagram profile link, `https://www.instagram.com/<username>/`, from `@name`,
 * `name` or any profile link. `null` if it is not an account (for example a post link).
 */
export function normaliseInstagramAccount(input: string | null | undefined): string | null {
  const username = socialUsername(
    input ?? '',
    new Set(['instagram.com', 'www.instagram.com']),
    /^(?!.*\.\.)(?!\.)[a-z0-9._]{1,30}(?<!\.)$/i,
    ([first]) =>
      first === undefined || INSTAGRAM_RESERVED.has(first.toLowerCase()) ? undefined : first,
  );
  return username === null ? null : `https://www.instagram.com/${username}/`;
}

/**
 * Canonical TikTok profile link, `https://www.tiktok.com/@<username>`, from `@name`, `name`
 * or any profile or video link. `null` if it is not an account.
 */
export function normaliseTikTokAccount(input: string | null | undefined): string | null {
  const username = socialUsername(
    input ?? '',
    new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com']),
    /^[a-z0-9._]{2,24}$/i,
    ([first]) => (first?.startsWith('@') === true ? first.slice(1) : undefined),
  );
  return username === null ? null : `https://www.tiktok.com/@${username}`;
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const YOUTUBE_CHANNEL_ID = /^UC[a-zA-Z0-9_-]{22}$/;
/** YouTube paths that are pages, not channels. */
const YOUTUBE_RESERVED = new Set([
  'watch',
  'shorts',
  'results',
  'playlist',
  'feed',
  'embed',
  'live',
  'channel',
  'hashtag',
  'redirect',
  'premium',
  'music',
  'kids',
  'gaming',
]);

/**
 * Canonical YouTube channel link from `@handle`, `handle` or a channel link:
 * `https://www.youtube.com/@<handle>`, or `https://www.youtube.com/channel/<id>` for
 * channel-ID links. `null` if it is not a channel (for example a video link).
 */
export function normaliseYouTubeChannel(input: string | null | undefined): string | null {
  const trimmed = (input ?? '').trim();
  const isLink = /^(https?:\/\/|www\.)/i.test(trimmed) || trimmed.includes('/');
  if (isLink) {
    try {
      const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
      const [kind, id] = url.pathname.split('/').filter((part) => part !== '');
      if (
        YOUTUBE_HOSTS.has(url.hostname.toLowerCase()) &&
        kind === 'channel' &&
        id !== undefined &&
        YOUTUBE_CHANNEL_ID.test(id)
      ) {
        return `https://www.youtube.com/channel/${id}`;
      }
    } catch {
      return null;
    }
  }
  const username = socialUsername(
    trimmed,
    YOUTUBE_HOSTS,
    /^[a-z0-9._-]{3,30}$/i,
    ([first, second]) => {
      if (first === undefined) return undefined;
      if (first.startsWith('@')) return first.slice(1);
      if ((first === 'c' || first === 'user') && second !== undefined) return second;
      // Older custom links such as youtube.com/brand.
      return YOUTUBE_RESERVED.has(first.toLowerCase()) ? undefined : first;
    },
  );
  return username === null ? null : `https://www.youtube.com/@${username}`;
}

/** A lower-case, dash-separated id from the brand name, unique among `taken`. */
export function brandIdFrom(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'brand';
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}
