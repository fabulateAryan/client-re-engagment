import { ClientEligibility, assessEligibility } from '../../src/core/domain';
import type { Campaign } from '../../src/core/domain';

const NOW = new Date('2026-11-17T00:00:00.000Z');
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

let seq = 0;
function campaign(startDate: Date | null, endDate: Date | null): Campaign {
  seq += 1;
  return {
    id: `c${seq}`,
    clientId: 'client',
    name: `Campaign ${seq}`,
    startDate,
    endDate,
    tags: [],
  };
}

// Each test maps to one Given / When / Then line of story 3 in docs/user-stories-v2.md.
describe('assessEligibility (story 3)', () => {
  it('is Monitored when the last campaign ended 15 or more days ago and none is active', () => {
    const result = assessEligibility([campaign(daysAgo(60), daysAgo(15))], NOW);
    expect(result.status).toBe(ClientEligibility.MONITORED);
    expect(result.daysSinceLastCampaign).toBe(15);
    expect(result.lastCampaignEndDate).toEqual(daysAgo(15));
  });

  it('uses the most recent end date across several finished campaigns', () => {
    const result = assessEligibility(
      [campaign(daysAgo(200), daysAgo(100)), campaign(daysAgo(40), daysAgo(20))],
      NOW,
    );
    expect(result.status).toBe(ClientEligibility.MONITORED);
    expect(result.daysSinceLastCampaign).toBe(20);
  });

  it('is Campaign running when a campaign is active', () => {
    const result = assessEligibility(
      [campaign(daysAgo(100), daysAgo(50)), campaign(daysAgo(5), daysAgo(-10))],
      NOW,
    );
    expect(result.status).toBe(ClientEligibility.CAMPAIGN_RUNNING);
  });

  it('treats a started campaign with no end date as running (open question Q2)', () => {
    expect(assessEligibility([campaign(daysAgo(5), null)], NOW).status).toBe(
      ClientEligibility.CAMPAIGN_RUNNING,
    );
  });

  it('is Too recent when the last campaign ended less than 15 days ago', () => {
    const result = assessEligibility([campaign(daysAgo(30), daysAgo(14))], NOW);
    expect(result.status).toBe(ClientEligibility.TOO_RECENT);
    expect(result.daysSinceLastCampaign).toBe(14);
  });

  it('is Needs review when a campaign has no end date and has not started', () => {
    expect(assessEligibility([campaign(null, null)], NOW).status).toBe(
      ClientEligibility.NEEDS_REVIEW_MISSING_END_DATE,
    );
  });

  it('is Needs review when any finished history is missing an end date', () => {
    expect(
      assessEligibility([campaign(daysAgo(100), daysAgo(50)), campaign(null, null)], NOW).status,
    ).toBe(ClientEligibility.NEEDS_REVIEW_MISSING_END_DATE);
  });

  it('is Not a past client when there are no campaigns', () => {
    const result = assessEligibility([], NOW);
    expect(result.status).toBe(ClientEligibility.NOT_A_PAST_CLIENT);
    expect(result.lastCampaignEndDate).toBeNull();
  });

  it('respects a different waiting period', () => {
    expect(assessEligibility([campaign(daysAgo(30), daysAgo(20))], NOW, 30).status).toBe(
      ClientEligibility.TOO_RECENT,
    );
  });
});
