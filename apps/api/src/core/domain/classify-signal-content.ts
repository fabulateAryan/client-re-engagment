import { Platform } from './platform';
import { SignalType, isActivitySignalType } from './signal-type';

/**
 * Reads post or article text, following ENG-231 (Signal Monitoring, Functional Definition).
 *
 * Two separate steps, as the spec asks:
 *  - Detect (section 7): the spec's keyword families. They only flag a post as a candidate
 *    and explain what was seen; they never decide the type ("presence must not auto-create
 *    a signal").
 *  - Interpret (section 6): stricter patterns that need the activity itself (a launch, a
 *    campaign, creators, a new market, a seasonal push with a product, a sponsorship).
 *    A post with no keyword at all can still be interpreted ("absence of keywords must not
 *    discard content").
 *
 * Text rules only: an image with no caption, or a post in another language, is not read.
 */

// ---------------------------------------------------------------------------------------
// Detect: section 7 keyword families, word for word.
// ---------------------------------------------------------------------------------------

export type DetectTheme =
  | 'Product/launch'
  | 'Campaign/activation'
  | 'Creator/people'
  | 'Market expansion'
  | 'Events/sponsorship'
  | 'Seasonal/cultural';

function terms(...words: string[]): RegExp {
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i');
}

/**
 * Seasonal, cultural and sporting moments. The spec has no fixed list for this theme; these
 * are starting examples for AU, NZ, South-East Asia and India, to be extended.
 */
const MOMENTS =
  /\b(?:diwali|deepavali|holi|christmas|xmas|black friday|cyber monday|boxing day|(?:lunar|chinese) new year|ramadan|hari raya|eid|mother(?:'|’)?s day|father(?:'|’)?s day|valentine(?:'|’)?s(?: day)?|easter|halloween|eofy|end of financial year|singles(?:'|’)? day|11\.11|12\.12|songkran|mid-?autumn|back to school|olympics|world cup|grand final|melbourne cup|australian open)\b/i;

const DETECT_TERMS: readonly { theme: DetectTheme; pattern: RegExp }[] = [
  {
    theme: 'Product/launch',
    pattern: terms(
      'new',
      'launch',
      'launching',
      'launched',
      'introducing',
      'unveiling',
      'coming soon',
      'now available',
      'new collection',
      'new range',
      'drop',
      'release',
    ),
  },
  {
    theme: 'Campaign/activation',
    pattern: terms(
      'campaign',
      'brand campaign',
      'marketing campaign',
      'activation',
      'brand activation',
      'social activation',
      'seasonal campaign',
      'integrated campaign',
    ),
  },
  {
    theme: 'Creator/people',
    pattern: terms(
      'creator',
      'influencer',
      'influencer marketing',
      'creator partnership',
      'ambassador',
      'ambassador program',
      'featured',
      'community',
      'UGC',
    ),
  },
  {
    theme: 'Market expansion',
    pattern: terms(
      'new market',
      'entering',
      'expanding',
      'launched in',
      'launching in',
      'available in',
      'new region',
      'new audience',
    ),
  },
  {
    theme: 'Events/sponsorship',
    pattern: terms(
      'sponsorship',
      'sponsor',
      'partnership',
      'event',
      'festival',
      'tournament',
      'collaboration',
    ),
  },
  { theme: 'Seasonal/cultural', pattern: MOMENTS },
];

export interface DetectedKeyword {
  readonly theme: DetectTheme;
  /** The word as it appears in the post. */
  readonly term: string;
}

/** Section 7: which keyword families appear in the text (first match per family). */
export function detectKeywords(content: string): DetectedKeyword[] {
  const found: DetectedKeyword[] = [];
  for (const { theme, pattern } of DETECT_TERMS) {
    const match = pattern.exec(content);
    if (match !== null) found.push({ theme, term: match[0] });
  }
  return found;
}

// ---------------------------------------------------------------------------------------
// Interpret: what actually happened (section 6).
// ---------------------------------------------------------------------------------------

/** Any one of these means the post is a job ad. */
const HIRING_PATTERNS: readonly RegExp[] = [
  /\bwe(?:'|’)?re hiring\b/i,
  /\bwe are hiring\b/i,
  /\bnow hiring\b/i,
  /#hiring\b/i,
  /\b(?:is|are|we(?:'|’)?re|we are) (?:currently )?(?:looking for|seeking|recruiting)\b/i,
  /\bjoin our [\p{L} ]{0,30}team\b/iu,
  /\b(?:job|career) (?:opening|opportunity|vacancy)\b/i,
  /\bvacanc(?:y|ies)\b/i,
  /\b(?:apply now|apply today|send your (?:cv|resume))\b/i,
];

/** Job-description headings: two or more together also mean a job ad. */
const JOB_DESCRIPTION_HINTS: readonly RegExp[] = [
  /\bkey responsibilities\b/i,
  /\bresponsibilities\s*:/i,
  /\brequirements\s*:/i,
  /\bcandidate profile\b/i,
  /\bqualifications?\b/i,
  /\b\d+\s*(?:–|-|to)\s*\d+\s*years? of experience\b/i,
];

/** Someone taking up a senior role. */
const LEADERSHIP_PATTERN =
  /\b(?:welcome|welcomes|welcoming|appointed|appoints|appointment of|joins us|has joined)\b.{0,60}\b(?:chief|head of|director|vice president|vp|cmo|ceo|coo|cfo|general manager|managing director)\b/i;

const PRODUCT_PATTERNS: readonly RegExp[] = [
  /\blaunch(?:es|ed|ing)?\b/i,
  /\bintroducing\b/i,
  /\bunveil(?:s|ed|ing)?\b/i,
  /\bcoming soon\b/i,
  /\bnow available\b/i,
  /\bavailable now\b/i,
  /\bout now\b/i,
  /\bjust dropped\b/i,
  /\b(?:new|latest|our) drop\b/i,
  /\bdropping (?:today|tomorrow|soon|now|this)\b/i,
  /\bnew (?:product|range|collection|flavou?r|menu|release|arrival|edition|line)s?\b/i,
  /\blatest (?:release|collection|range)\b/i,
  /\breleas(?:ed|ing) (?:today|tomorrow|soon|now|this|on)\b/i,
  /\blimited edition\b/i,
];

const CAMPAIGN_PATTERNS: readonly RegExp[] = [/\bcampaigns?\b/i, /\bactivations?\b/i];

const CREATOR_PATTERNS: readonly RegExp[] = [
  /\b(?:content )?creators?\b/i,
  /\binfluencers?\b/i,
  /\bambassadors?\b/i,
  /\bambassador program(?:me)?\b/i,
  /\bugc\b/i,
  /\buser[- ]generated content\b/i,
];

const PLACES =
  '(?:australia|new zealand|singapore|malaysia|indonesia|thailand|the philippines|philippines|vietnam|india|japan|south korea|korea|china|hong kong|taiwan|the uk|uk|united kingdom|the us|usa|united states|europe|the middle east|middle east|uae|dubai|canada|apac|asia|south-?east asia|sydney|melbourne|brisbane|perth|adelaide|auckland|wellington|kuala lumpur|jakarta|bali|bangkok|manila|ho chi minh city|hanoi|mumbai|delhi|bengaluru|bangalore)';

const MARKET_PATTERNS: readonly RegExp[] = [
  /\bnew (?:market|region|audience)s?\b/i,
  new RegExp(
    `\\b(?:entering|enters|entered|expanding (?:in)?to|expands (?:in)?to|expansion (?:in)?to|launch(?:es|ed|ing)? in|now available in|available in|arriv(?:es|ed|ing) in|now open in|opening in|coming to)\\s+${PLACES}\\b`,
    'i',
  ),
  /\b(?:entering|enters|expanding into|expands into) the [\p{L}-]+ (?:market|category)\b/iu,
];

const EVENT_PATTERNS: readonly RegExp[] = [
  /\bsponsor(?:s|ed|ing|ships?)?\b/i,
  /\bpartnerships?\b/i,
  /\bpartner(?:s|ed|ing)? with\b/i,
  /\bteamed up with\b/i,
  /\bcollab(?:s|orat(?:e|es|ed|ing|ion|ions))?\b/i,
  /\bfestivals?\b/i,
  /\btournaments?\b/i,
  /(?<!\bin the )\bevents?\b/i,
  /\bexpo\b/i,
  /\bpop-?up\b/i,
];

/** A partnership or event with no commercial side (section 9: the charity example). */
const NON_COMMERCIAL =
  /\b(?:charit(?:y|ies|able)|non-?profit|not-for-profit|fundrais(?:e|er|ers|ing)|donat(?:e|es|ed|ing|ion|ions)|volunteer(?:s|ed|ing)?|ngo)\b/i;

/** A product or marketing tie, needed for a seasonal post (section 9: Diwali "with product tie-in"). */
const COMMERCIAL_TIE =
  /\b(?:sale|offer|deals?|discount|promo(?:tion)?|gift(?:s|ing)?|gift guide|hamper|limited edition|collection|range|shop|in stores?|online)\b/i;

function firstMatch(patterns: readonly RegExp[], content: string): string | null {
  for (const p of patterns) {
    const m = p.exec(content);
    if (m !== null) return m[0];
  }
  return null;
}

function isJobAd(content: string): boolean {
  if (HIRING_PATTERNS.some((p) => p.test(content))) return true;
  return JOB_DESCRIPTION_HINTS.filter((p) => p.test(content)).length >= 2;
}

function hasProductOrMarketingTie(content: string): boolean {
  return [PRODUCT_PATTERNS, CAMPAIGN_PATTERNS, CREATOR_PATTERNS].some(
    (ps) => firstMatch(ps, content) !== null,
  );
}

/**
 * The words that show the activity, for each activity type (used for the score's reason).
 * `null` when the text does not show it, e.g. a type that came from the provider.
 */
export function activityEvidence(type: SignalType, content: string): string | null {
  switch (type) {
    case SignalType.PRODUCT_LAUNCH:
      return firstMatch(PRODUCT_PATTERNS, content);
    case SignalType.CAMPAIGN_LAUNCH:
      return firstMatch(CAMPAIGN_PATTERNS, content);
    case SignalType.CREATOR_CONTENT:
      return firstMatch(CREATOR_PATTERNS, content);
    case SignalType.MARKET_EXPANSION:
      return firstMatch(MARKET_PATTERNS, content);
    case SignalType.SEASONAL:
      return MOMENTS.exec(content)?.[0] ?? null;
    case SignalType.EVENT_PARTNERSHIP:
      return firstMatch(EVENT_PATTERNS, content);
    default:
      return null;
  }
}

/** Why a post that looks like a partnership or event is not one (section 9), or null. */
export function nonCommercialReason(content: string): string | null {
  if (firstMatch(EVENT_PATTERNS, content) === null) return null;
  const cue = NON_COMMERCIAL.exec(content);
  if (cue === null || hasProductOrMarketingTie(content)) return null;
  return cue[0];
}

/**
 * What the post is about, first match wins:
 *  1. Job ad: HIRING (checked first: duty lists mention launches and campaigns).
 *  2. Leadership change: JOB_CHANGE (context only; a new CMO is not a signal on its own).
 *  3. Seasonal moment with a product or marketing tie: SEASONAL.
 *  4. New market or region: MARKET_EXPANSION (before launch: "launching in Singapore").
 *  5. Campaign or activation: CAMPAIGN_LAUNCH.
 *  6. Product launch: PRODUCT_LAUNCH.
 *  7. Creators, influencers, ambassadors, UGC: CREATOR_CONTENT.
 *  8. Sponsorship, partnership, event: EVENT_PARTNERSHIP, unless it is charitable with no
 *     product or marketing tie.
 *
 * @returns the type, or null when nothing matches (the source's own type is kept).
 */
export function classifySignalContent(content: string): SignalType | null {
  if (content.trim() === '') return null;
  if (isJobAd(content)) return SignalType.HIRING;
  if (LEADERSHIP_PATTERN.test(content)) return SignalType.JOB_CHANGE;
  if (MOMENTS.test(content) && (hasProductOrMarketingTie(content) || COMMERCIAL_TIE.test(content)))
    return SignalType.SEASONAL;
  if (firstMatch(MARKET_PATTERNS, content) !== null) return SignalType.MARKET_EXPANSION;
  if (firstMatch(CAMPAIGN_PATTERNS, content) !== null) return SignalType.CAMPAIGN_LAUNCH;
  if (firstMatch(PRODUCT_PATTERNS, content) !== null) return SignalType.PRODUCT_LAUNCH;
  if (firstMatch(CREATOR_PATTERNS, content) !== null) return SignalType.CREATOR_CONTENT;
  if (firstMatch(EVENT_PATTERNS, content) !== null && nonCommercialReason(content) === null)
    return SignalType.EVENT_PARTNERSHIP;
  return null;
}

/**
 * The type a stored signal should have under the current rules. Text types are worked out
 * again, so a rule fix also corrects posts collected before it. A news item keeps
 * "Company announcement" unless its text shows one of the activity types: the source says
 * where to look, not what kind of signal it is (section 4).
 */
export function reclassifySignal(signal: {
  readonly signalType: SignalType;
  readonly platform: Platform;
  readonly content: string;
}): SignalType {
  const found = classifySignalContent(signal.content);
  if (signal.signalType === SignalType.COMPANY_ANNOUNCEMENT) {
    return found !== null && isActivitySignalType(found) ? found : signal.signalType;
  }
  const fallback = signal.platform === Platform.GOOGLE_RSS ? SignalType.OTHER : SignalType.NEW_POST;
  return found ?? fallback;
}
