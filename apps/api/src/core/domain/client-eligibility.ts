import type { Campaign } from './campaign';

/**
 * Whether a client is ready to be contacted again (user story 3).
 *
 * Open questions (see docs/user-stories-v2.md): Q1 whether the waiting period is changeable,
 * Q2 whether a campaign with a start date but no end date is active or needs review.
 * Until Q2 is answered, such a campaign counts as running.
 */
export enum ClientEligibility {
  MONITORED = 'MONITORED',
  CAMPAIGN_RUNNING = 'CAMPAIGN_RUNNING',
  TOO_RECENT = 'TOO_RECENT',
  NEEDS_REVIEW_MISSING_END_DATE = 'NEEDS_REVIEW_MISSING_END_DATE',
  NOT_A_PAST_CLIENT = 'NOT_A_PAST_CLIENT',
}

/** Days to wait after the last campaign ends. Fixed until Q1 is answered (story 11). */
export const DEFAULT_WAITING_PERIOD_DAYS = 15;

export interface EligibilityAssessment {
  readonly status: ClientEligibility;
  /** End date of the most recent finished campaign, or `null` if there is none. */
  readonly lastCampaignEndDate: Date | null;
  /** Whole days since `lastCampaignEndDate`, or `null` if there is none. */
  readonly daysSinceLastCampaign: number | null;
  readonly waitingPeriodDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isActive(campaign: Campaign, now: Date): boolean {
  const { startDate, endDate } = campaign;
  const started = startDate !== null && startDate.getTime() <= now.getTime();
  if (endDate === null) return started;
  return endDate.getTime() >= now.getTime() && (startDate === null || started);
}

/**
 * Applies the story 3 rules, in this order:
 * no campaigns, then any active campaign, then any campaign missing an end date,
 * then the waiting period since the most recent end date.
 */
export function assessEligibility(
  campaigns: readonly Campaign[],
  now: Date,
  waitingPeriodDays: number = DEFAULT_WAITING_PERIOD_DAYS,
): EligibilityAssessment {
  const result = (
    status: ClientEligibility,
    lastCampaignEndDate: Date | null = null,
    daysSinceLastCampaign: number | null = null,
  ): EligibilityAssessment => ({
    status,
    lastCampaignEndDate,
    daysSinceLastCampaign,
    waitingPeriodDays,
  });

  if (campaigns.length === 0) return result(ClientEligibility.NOT_A_PAST_CLIENT);
  if (campaigns.some((c) => isActive(c, now))) return result(ClientEligibility.CAMPAIGN_RUNNING);

  const endDates = campaigns.map((c) => c.endDate);
  if (endDates.some((d) => d === null)) {
    return result(ClientEligibility.NEEDS_REVIEW_MISSING_END_DATE);
  }

  const lastEnd = new Date(Math.max(...(endDates as Date[]).map((d) => d.getTime())));
  const days = Math.floor((now.getTime() - lastEnd.getTime()) / DAY_MS);
  const status =
    days >= waitingPeriodDays ? ClientEligibility.MONITORED : ClientEligibility.TOO_RECENT;
  return result(status, lastEnd, days);
}
