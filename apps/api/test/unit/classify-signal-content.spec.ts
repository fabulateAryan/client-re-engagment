/** ENG-231 sections 6, 7 and 9. All post text is invented; brand names are placeholders. */
import {
  Platform,
  SignalType,
  classifySignalContent,
  detectKeywords,
  reclassifySignal,
} from '../../src/core/domain';

describe('classifySignalContent', () => {
  describe('section 9: signal vs not a signal', () => {
    it('a new product post is a product launch', () => {
      expect(classifySignalContent('Our new product is here. Shop the range today.')).toBe(
        SignalType.PRODUCT_LAUNCH,
      );
    });

    it('mentioning a creator is creator activity', () => {
      expect(classifySignalContent('Loved working with creator @placeholder on this one')).toBe(
        SignalType.CREATOR_CONTENT,
      );
    });

    it('a Diwali post with a product tie-in is a seasonal push', () => {
      expect(classifySignalContent('Celebrate Diwali with our limited edition gift range')).toBe(
        SignalType.SEASONAL,
      );
    });

    it('a Diwali greeting with no product is not a signal', () => {
      expect(classifySignalContent('Happy Diwali to everyone celebrating!')).toBeNull();
    });

    it('a collaboration with a local charity is not a signal', () => {
      expect(
        classifySignalContent('Proud to collaborate with a local charity this month'),
      ).toBeNull();
      expect(
        classifySignalContent('Proud to work in partnership with a local charity'),
      ).toBeNull();
    });

    it('a new CMO is a leadership change, which is context only', () => {
      expect(classifySignalContent('Please welcome Sam Lee, our new CMO')).toBe(
        SignalType.JOB_CHANGE,
      );
    });
  });

  describe('section 6: activity types', () => {
    it('spots campaigns and activations', () => {
      expect(classifySignalContent('Our new summer campaign is live!')).toBe(
        SignalType.CAMPAIGN_LAUNCH,
      );
      expect(classifySignalContent('Behind the scenes of our brand activation')).toBe(
        SignalType.CAMPAIGN_LAUNCH,
      );
    });

    it('spots product launches', () => {
      expect(classifySignalContent('Introducing our latest placeholder product')).toBe(
        SignalType.PRODUCT_LAUNCH,
      );
      expect(classifySignalContent('Something big is coming soon')).toBe(
        SignalType.PRODUCT_LAUNCH,
      );
    });

    it('spots a new market, even when it says "launching"', () => {
      expect(classifySignalContent('We are launching in Singapore next month')).toBe(
        SignalType.MARKET_EXPANSION,
      );
      expect(classifySignalContent('Excited to be entering a new market')).toBe(
        SignalType.MARKET_EXPANSION,
      );
    });

    it('spots sponsorships and events with a commercial side', () => {
      expect(classifySignalContent('Proud official sponsor of the tournament')).toBe(
        SignalType.EVENT_PARTNERSHIP,
      );
    });

    it('prefers campaign over launch when both match', () => {
      expect(classifySignalContent('We launched a new campaign today')).toBe(
        SignalType.CAMPAIGN_LAUNCH,
      );
    });
  });

  describe('section 7: keywords only flag, they never decide', () => {
    it('a bare keyword does not make a type', () => {
      expect(classifySignalContent('Happy new week, everyone')).toBeNull();
      expect(classifySignalContent('Thanks to our amazing community')).toBeNull();
    });

    it('still reports the keyword families it saw', () => {
      expect(detectKeywords('Thanks to our amazing community, new week ahead')).toEqual([
        { theme: 'Product/launch', term: 'new' },
        { theme: 'Creator/people', term: 'community' },
      ]);
      expect(detectKeywords('Happy Friday!')).toEqual([]);
    });
  });

  it('returns null for everyday posts', () => {
    expect(classifySignalContent('Happy Friday from the team!')).toBeNull();
    expect(classifySignalContent('')).toBeNull();
  });

  it('treats job ads as hiring, even when their duties mention launches or campaigns', () => {
    expect(
      classifySignalContent(
        'Placeholder Foods is looking for a Regulatory Affairs Specialist to join our Head ' +
          'Office team. Provide regulatory guidance for new product launches.',
      ),
    ).toBe(SignalType.HIRING);
    expect(
      classifySignalContent("WE'RE HIRING | Chartered Accountant. Location: Head Office"),
    ).toBe(SignalType.HIRING);
    expect(
      classifySignalContent('Key responsibilities: lead audits. Requirements: CA qualification.'),
    ).toBe(SignalType.HIRING);
  });

  it('re-types stored posts under the current rules', () => {
    const jobAd = 'We are hiring a placeholder role. Help with new product launches.';
    expect(
      reclassifySignal({
        signalType: SignalType.PRODUCT_LAUNCH,
        platform: Platform.LINKEDIN,
        content: jobAd,
      }),
    ).toBe(SignalType.HIRING);
    expect(
      reclassifySignal({
        signalType: SignalType.OTHER,
        platform: Platform.GOOGLE_RSS,
        content: 'x',
      }),
    ).toBe(SignalType.OTHER);
  });

  it('keeps a news item as an announcement unless its text shows brand activity', () => {
    const news = (content: string) =>
      reclassifySignal({
        signalType: SignalType.COMPANY_ANNOUNCEMENT,
        platform: Platform.GOOGLE_RSS,
        content,
      });
    expect(news('We are hiring a placeholder role.')).toBe(SignalType.COMPANY_ANNOUNCEMENT);
    expect(news('Placeholder Co unveils its new range')).toBe(SignalType.PRODUCT_LAUNCH);
  });
});
