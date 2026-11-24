import {
  TemplateMessageAdapter,
  excerpt,
} from '../../src/adapters/outbound/messages/template-message.adapter';
import {
  FakeClock,
  FakeMessageAdapter,
  InMemoryCampaignHistory,
  InMemoryClientRepository,
  InMemoryDraftRepository,
  InMemorySignalRepository,
} from '../../src/adapters/outbound/fakes';
import {
  DraftEngagementMessageUseCase,
  MarkDraftSentUseCase,
  SaveDraftEditUseCase,
} from '../../src/core/application';
import {
  DraftFailedError,
  DraftSource,
  Platform,
  SignalNotFoundError,
  SignalType,
} from '../../src/core/domain';
import type { Campaign, Client, Signal } from '../../src/core/domain';

// Invented data only.
const NOW = new Date('2026-11-17T01:00:00.000Z');

const client: Client = {
  id: 'c1',
  name: 'Example Brand',
  socialHandles: { [Platform.LINKEDIN]: 'https://www.linkedin.com/company/example-brand/' },
  lastActiveDate: null,
  lastCheckedAt: {},
};

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: 'sig-1',
    clientId: 'c1',
    platform: Platform.LINKEDIN,
    signalType: SignalType.PRODUCT_LAUNCH,
    content: 'Introducing our new placeholder range. Available in stores from today!',
    url: 'https://example.test/post/1',
    externalId: 'p1',
    publishedAt: new Date('2026-11-12T00:00:00.000Z'),
    collectedAt: NOW,
    raw: {},
    ...overrides,
  };
}

const campaign: Campaign = {
  id: 'c1-campaign-1',
  clientId: 'c1',
  name: 'Test Summer Campaign',
  startDate: new Date('2026-01-01T00:00:00Z'),
  endDate: new Date('2026-02-01T00:00:00Z'),
  tags: [],
};

describe('TemplateMessageAdapter', () => {
  const template = new TemplateMessageAdapter();

  it('writes a message that refers to the post, using only its facts', async () => {
    const text = await template.draft({ client, signal: signal(), campaigns: [] });

    expect(text).toContain('Hi Example Brand team,');
    expect(text).toContain('Congratulations on the launch.');
    expect(text).toContain('LinkedIn post from 12/11/2026');
    expect(text).toContain('"Introducing our new placeholder range."');
    expect(text).toContain('creator campaign');
    expect(text).not.toMatch(/working with you/);
    expect(text).not.toContain('—');
  });

  it('mentions the most recent past campaign when there is one', async () => {
    const text = await template.draft({ client, signal: signal(), campaigns: [campaign] });
    expect(text).toContain('It was great working with you on Test Summer Campaign.');
  });

  it('shortens long posts to one readable excerpt', () => {
    expect(excerpt('  First line.\n\nSecond line.')).toBe('First line.');
    const long = excerpt(`${'word '.repeat(80)}end`);
    expect(long.length).toBeLessThanOrEqual(163);
    expect(long.endsWith('...')).toBe(true);
  });
});

describe('DraftEngagementMessageUseCase', () => {
  async function setup() {
    const signals = new InMemorySignalRepository();
    await signals.saveMany([signal()]);
    const drafts = new InMemoryDraftRepository();
    const messages = new FakeMessageAdapter();
    const clock = new FakeClock(NOW);
    const useCase = new DraftEngagementMessageUseCase(
      signals,
      new InMemoryClientRepository([client]),
      new InMemoryCampaignHistory([campaign]),
      messages,
      drafts,
      clock,
    );
    return {
      useCase,
      drafts,
      messages,
      clock,
      save: new SaveDraftEditUseCase(drafts, clock),
      markSent: new MarkDraftSentUseCase(drafts, clock),
    };
  }

  it('drafts from the signal, its brand and campaigns, and stores the draft', async () => {
    const { useCase, drafts, messages } = await setup();

    const draft = await useCase.execute('sig-1');

    expect(draft).toMatchObject({
      signalId: 'sig-1',
      source: DraftSource.TEMPLATE,
      createdAt: NOW,
      editedAt: null,
    });
    expect(messages.calls[0]?.campaigns).toEqual([campaign]);
    expect(await drafts.get('sig-1')).toEqual(draft);
  });

  it('returns the existing draft instead of overwriting edits, unless asked to regenerate', async () => {
    const { useCase, messages, save } = await setup();
    await useCase.execute('sig-1');
    await save.execute('sig-1', { text: '  My edited message  ' });

    const again = await useCase.execute('sig-1');
    expect(again.text).toBe('My edited message');
    expect(messages.calls).toHaveLength(1);

    const fresh = await useCase.execute('sig-1', { regenerate: true });
    expect(fresh.text).toContain('[FAKE DRAFT]');
    expect(fresh.editedAt).toBeNull();
  });

  it('rejects unknown signals, empty edits and edits with no draft', async () => {
    const { useCase, save } = await setup();
    await expect(useCase.execute('nope')).rejects.toBeInstanceOf(SignalNotFoundError);
    await expect(save.execute('sig-1', { text: 'text' })).rejects.toBeInstanceOf(
      SignalNotFoundError,
    );
    await useCase.execute('sig-1');
    await expect(save.execute('sig-1', { text: '   ' })).rejects.toBeInstanceOf(DraftFailedError);
  });

  it('gives a subject, saves the recipient, and keeps it when starting again', async () => {
    const { useCase, save } = await setup();
    const first = await useCase.execute('sig-1');
    expect(first.subject).toBe("Creators for Example Brand's new launch");
    expect(first.recipient).toBeNull();

    const saved = await save.execute('sig-1', {
      recipient: ' marketing@example.test ',
      subject: 'Hello',
    });
    expect(saved).toMatchObject({ recipient: 'marketing@example.test', subject: 'Hello' });

    const fresh = await useCase.execute('sig-1', { regenerate: true });
    expect(fresh.recipient).toBe('marketing@example.test');
    expect(fresh.subject).toBe("Creators for Example Brand's new launch");
  });

  it('rejects a bad recipient and an empty subject, and clears an empty recipient', async () => {
    const { useCase, save } = await setup();
    await useCase.execute('sig-1');
    await expect(save.execute('sig-1', { recipient: 'not an email' })).rejects.toBeInstanceOf(
      DraftFailedError,
    );
    await expect(save.execute('sig-1', { recipient: 'a@b.test, c@d.test' })).rejects.toBeInstanceOf(
      DraftFailedError,
    );
    await expect(save.execute('sig-1', { subject: ' ' })).rejects.toBeInstanceOf(DraftFailedError);
    await save.execute('sig-1', { recipient: 'a@b.test' });
    expect((await save.execute('sig-1', { recipient: '' })).recipient).toBeNull();
  });

  it('marks a draft as sent and can undo it', async () => {
    const { useCase, save, markSent } = await setup();
    await expect(markSent.execute('sig-1', true)).rejects.toBeInstanceOf(SignalNotFoundError);
    await useCase.execute('sig-1');

    // No recipient yet: cannot be marked as sent.
    await expect(markSent.execute('sig-1', true)).rejects.toBeInstanceOf(DraftFailedError);
    await save.execute('sig-1', { recipient: 'marketing@example.test' });

    expect((await markSent.execute('sig-1', true)).sentAt).toEqual(NOW);
    expect((await markSent.execute('sig-1', false)).sentAt).toBeNull();
  });
});

describe('TemplateMessageAdapter with news', () => {
  it("does not call a news article the brand's own post", async () => {
    const text = await new TemplateMessageAdapter().draft({
      client,
      signal: signal({ platform: Platform.GOOGLE_RSS, signalType: SignalType.OTHER }),
      campaigns: [],
    });
    expect(text).toContain('I came across a recent article from 12/11/2026');
    expect(text).not.toContain('your news');
    expect(text).not.toContain('I enjoyed your recent post');
  });
});
