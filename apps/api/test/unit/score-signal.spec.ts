/** Stories 9a and 9b: score, priority and reason. All post text is invented. */
import { SignalType, priorityFor, scoreSignal } from '../../src/core/domain';

function score(content: string, signalType = SignalType.NEW_POST, raw = {}) {
  return scoreSignal({ content, signalType, raw });
}

describe('scoreSignal', () => {
  it('scores a generic post as Low with a plain reason', () => {
    const result = score('The comeback is always louder.');
    expect(result).toMatchObject({ score: 0, priority: 'LOW', factors: [] });
    expect(result.reason).toMatch(/No launch, campaign/);
  });

  it('scores a launch in Australia as High and quotes the matched words', () => {
    const result = score(
      'Introducing our new range, available in Sydney stores today.',
      SignalType.PRODUCT_LAUNCH,
    );
    expect(result.score).toBe(70);
    expect(result.priority).toBe('HIGH');
    expect(result.reason).toBe(
      'Product launch ("Introducing") + Mentions AU, NZ or South-East Asia ("Sydney").',
    );
  });

  it('adds points for a paid partnership flag from the platform', () => {
    const result = score('Sunny days ahead', SignalType.NEW_POST, { paidPartnership: true });
    expect(result.factors).toEqual([
      { label: 'Paid creator partnership', points: 30, evidence: null },
    ]);
  });

  it('does not count creators twice when the type is already creator activity', () => {
    const result = score('Meet our new brand ambassador', SignalType.CREATOR_CONTENT);
    expect(result.score).toBe(50);
    expect(result.priority).toBe('MEDIUM');
  });

  it('adds creators on top of a campaign', () => {
    const result = score('Our new campaign with creators', SignalType.CAMPAIGN_LAUNCH);
    expect(result.score).toBe(80);
    expect(result.priority).toBe('HIGH');
  });

  it('section 9: a new CMO is not a signal on its own, even in Australia', () => {
    const result = score('Please welcome our new CMO in Sydney', SignalType.JOB_CHANGE);
    expect(result.score).toBe(49);
    expect(result.priority).toBe('LOW');
    expect(result.reason).toMatch(/not a signal on its own/);
  });

  it('section 9: a charity collaboration is not a signal, and says why', () => {
    const result = score('Proud to collaborate with a local charity');
    expect(result.score).toBe(0);
    expect(result.reason).toContain('non-commercial side ("charity")');
  });

  it('section 7: a bare keyword is reported but not scored', () => {
    const result = score('Happy new week, everyone');
    expect(result.score).toBe(0);
    expect(result.reason).toBe(
      'Keyword "new" (Product/launch) found, but no clear launch, campaign or other activity.',
    );
  });

  it('only counts hiring for marketing when the role itself is a marketing one', () => {
    expect(score("We're hiring engineers").score).toBe(0);
    const marketing = score("We're hiring a social media lead", SignalType.HIRING);
    // Hiring 15 + marketing role 35, held below Medium: hiring is context only.
    expect(marketing.score).toBe(49);
    expect(marketing.reason).toContain('("social media")');
  });

  it('does not treat a job ad that mentions other teams as hiring for marketing', () => {
    const ad =
      'Placeholder Foods is looking for a Regulatory Affairs Specialist to join our team. ' +
      'Key responsibilities: coordinate with R&D, Packaging and Marketing teams; provide ' +
      'guidance for new product launches.';
    const result = score(ad, SignalType.HIRING);
    expect(result.score).toBe(15);
    expect(result.priority).toBe('LOW');
    expect(result.factors.map((f) => f.label)).toEqual(['Hiring']);
  });

  it('takes points off for brand-safety risks and never goes below 0', () => {
    expect(score('Product recall announced').score).toBe(0);
    const launch = score('New collection out now, despite the lawsuit', SignalType.PRODUCT_LAUNCH);
    expect(launch.score).toBe(20);
    expect(launch.reason).toMatch(/but Brand-safety risk \("lawsuit"\)/);
  });

  it('keeps the reason within 200 characters', () => {
    const long = score(
      `Introducing ${'a'.repeat(300)} in Sydney with our new CMO, now recruiting for marketing, partnered with friends`,
      SignalType.PRODUCT_LAUNCH,
    );
    expect(long.reason.length).toBeLessThanOrEqual(200);
    expect(long.score).toBe(100);
  });

  it.each([
    [70, 'HIGH'],
    [69, 'MEDIUM'],
    [50, 'MEDIUM'],
    [49, 'LOW'],
  ] as const)('maps %i to %s', (value, priority) => {
    expect(priorityFor(value)).toBe(priority);
  });
});
