/**
 * Stories 9a and 9b: how worth acting on a signal is, as a score out of 100, a priority and
 * a one-line reason.
 *
 * Rules-based and transparent: every point comes from a factor the rep can see, and every
 * piece of evidence is a word found in the post itself or a flag the platform gave, so the
 * reason never states a fact that is not in the source.
 *
 * The points and cut-offs are first suggestions (user stories question 11 is still open).
 * Recency is deliberately not scored, so a signal's score never changes over time; it is
 * the tie-breaker when sorting instead.
 *
 * ENG-231 section 9: only brand activity (a launch, campaign, creators, new market, seasonal
 * push or sponsorship) can be a signal. Hiring, a leadership change, a news item or a plain
 * post is context only, so its score is held below Medium however many bonuses it has.
 */
import { activityEvidence, detectKeywords, nonCommercialReason } from './classify-signal-content';
import type { JsonObject } from './json';
import { SignalType, isActivitySignalType } from './signal-type';

export type SignalPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ScoreFactor {
  readonly label: string;
  readonly points: number;
  /** The word that matched in the post, or `null` for platform flags and provider types. */
  readonly evidence: string | null;
}

export interface SignalScore {
  /** 0 to 100. */
  readonly score: number;
  readonly priority: SignalPriority;
  readonly factors: readonly ScoreFactor[];
  /** One sentence, at most 200 characters. */
  readonly reason: string;
}

/** Cut-offs from the suggested answer to question 11. */
export const HIGH_FROM = 70;
export const MEDIUM_FROM = 50;
const MAX_REASON_LENGTH = 200;
/** Highest score for a post that is context only (no brand activity). */
const CONTEXT_ONLY_MAX = MEDIUM_FROM - 1;

/** What kind of moment the signal type itself represents. */
const TYPE_POINTS: Partial<Record<SignalType, { label: string; points: number }>> = {
  [SignalType.PRODUCT_LAUNCH]: { label: 'Product launch', points: 50 },
  [SignalType.CAMPAIGN_LAUNCH]: { label: 'Campaign', points: 50 },
  [SignalType.CREATOR_CONTENT]: { label: 'Creator activity', points: 50 },
  [SignalType.MARKET_EXPANSION]: { label: 'Market expansion', points: 50 },
  [SignalType.SEASONAL]: { label: 'Seasonal push', points: 50 },
  [SignalType.EVENT_PARTNERSHIP]: { label: 'Event or sponsorship', points: 50 },
  // Context only from here: section 9, "a new CMO is not a signal on its own".
  [SignalType.JOB_CHANGE]: { label: 'Leadership change', points: 40 },
  // Any job ad. Weak on its own (a finance or warehouse role says little about marketing);
  // "Hiring for marketing" below adds the points when the role is a marketing one.
  [SignalType.HIRING]: { label: 'Hiring', points: 15 },
  [SignalType.COMPANY_ANNOUNCEMENT]: { label: 'Company announcement', points: 20 },
};

/** Words that show a job ad (activity types take their words from the classifier). */
const HIRING_EVIDENCE =
  /\b(we(?:'|’)?re hiring|we are hiring|now hiring|looking for|seeking|recruiting|join our [\p{L} ]{0,30}team|vacanc(?:y|ies))\b/iu;

interface TextRule {
  readonly label: string;
  readonly points: number;
  readonly pattern: RegExp;
  /** Skip this rule when the type already scores the same moment. */
  readonly unlessType?: SignalType;
}

const TEXT_RULES: readonly TextRule[] = [
  {
    label: 'New marketing leader',
    points: 40,
    pattern:
      /\b(new|appoint(s|ed)?|welcom(e|es|ing)|joins?)\b.{0,40}\b(cmo|chief marketing officer|head of marketing|marketing director|head of brand)\b/i,
    unlessType: SignalType.JOB_CHANGE,
  },
  {
    label: 'Hiring for marketing',
    points: 35,
    // The marketing word must sit right after the hiring words, i.e. be the role itself.
    // "Marketing" elsewhere in a job ad ("coordinate with Marketing teams") does not count.
    pattern:
      /\b(?:hiring|looking for|seeking|recruiting|vacancy for)\b[^.\n]{0,40}?\b(?<evidence>marketing|brand|social media|content|influencer|creator|communications|partnerships?)\b/i,
  },
  {
    label: 'Creators or ambassadors',
    points: 30,
    pattern:
      /\b(content creators?|creators?|influencers?|ambassadors?|ugc|user[- ]generated content)\b/i,
    unlessType: SignalType.CREATOR_CONTENT,
  },
  {
    label: 'Mentions AU, NZ or South-East Asia',
    points: 20,
    pattern:
      /\b(australia|australian|aussie|sydney|melbourne|brisbane|perth|adelaide|new zealand|auckland|singapore|malaysia|kuala lumpur|indonesia|jakarta|thailand|bangkok|philippines|manila|vietnam|apac|asia[- ]pacific|south[- ]?east asia)\b/i,
  },
  {
    label: 'Brand-safety risk',
    points: -30,
    pattern:
      /\b(lawsuit|sued|recall(s|ed)?|scandal|investigation|class action|share price|lay-?offs?)\b/i,
  },
];

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function priorityFor(score: number): SignalPriority {
  if (score >= HIGH_FROM) return 'HIGH';
  if (score >= MEDIUM_FROM) return 'MEDIUM';
  return 'LOW';
}

function describe(factor: ScoreFactor): string {
  return factor.evidence === null ? factor.label : `${factor.label} ("${factor.evidence}")`;
}

function fit(reason: string): string {
  return reason.length <= MAX_REASON_LENGTH
    ? reason
    : `${reason.slice(0, MAX_REASON_LENGTH - 1).trimEnd()}…`;
}

/** Why a post with no scored factor is not a signal: a charity tie-up, a bare keyword, or nothing. */
function nothingFoundReason(content: string): string {
  const charity = nonCommercialReason(content);
  if (charity !== null) {
    return `Partnership or event with a non-commercial side ("${charity}") and no product or marketing tie`;
  }
  const keyword = detectKeywords(content)[0];
  if (keyword !== undefined) {
    return `Keyword "${keyword.term}" (${keyword.theme}) found, but no clear launch, campaign or other activity`;
  }
  return 'No launch, campaign or other re-engagement moment found in the post';
}

function reasonFrom(
  factors: readonly ScoreFactor[],
  content: string,
  heldBelowMedium: boolean,
): string {
  const positive = [...factors].filter((f) => f.points > 0).sort((a, b) => b.points - a.points);
  const risk = factors.find((f) => f.points < 0);
  if (positive.length === 0) {
    const base = nothingFoundReason(content);
    return fit(risk === undefined ? `${base}.` : `${base}, and a possible ${describe(risk)}.`);
  }
  let reason = positive.map(describe).join(' + ');
  if (risk !== undefined) reason += `, but ${describe(risk)}`;
  if (heldBelowMedium) reason += '. No brand activity, so not a signal on its own';
  return fit(`${reason}.`);
}

/** Score one signal from its type, text and minimised raw payload. */
export function scoreSignal(signal: {
  readonly signalType: SignalType;
  readonly content: string;
  readonly raw: JsonObject;
}): SignalScore {
  const factors: ScoreFactor[] = [];
  const text = signal.content;

  const typePoints = TYPE_POINTS[signal.signalType];
  if (typePoints !== undefined) {
    const evidence =
      signal.signalType === SignalType.HIRING
        ? (HIRING_EVIDENCE.exec(text)?.[0] ?? null)
        : activityEvidence(signal.signalType, text);
    factors.push({ ...typePoints, evidence });
  }

  for (const rule of TEXT_RULES) {
    if (rule.unlessType === signal.signalType) continue;
    const match = rule.pattern.exec(text);
    if (match === null) continue;
    // A rule can name the part worth quoting (?<evidence>...); otherwise the whole match.
    factors.push({
      label: rule.label,
      points: rule.points,
      evidence: match.groups?.evidence ?? match[0],
    });
  }

  if (signal.raw.paidPartnership === true) {
    factors.push({ label: 'Paid creator partnership', points: 30, evidence: null });
  }

  // A paid partnership flag is creator activity, even when the caption says nothing.
  const activity = isActivitySignalType(signal.signalType) || signal.raw.paidPartnership === true;
  const total = clamp(factors.reduce((sum, f) => sum + f.points, 0));
  const heldBelowMedium = !activity && total > CONTEXT_ONLY_MAX;
  const score = heldBelowMedium ? CONTEXT_ONLY_MAX : total;
  return {
    score,
    priority: priorityFor(score),
    factors,
    reason: reasonFrom(factors, text, heldBelowMedium),
  };
}
