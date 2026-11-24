/** Sending a draft through the email sender (SendGrid). Invented addresses only. */
import { FakeClock, InMemoryDraftRepository } from '../../src/adapters/outbound/fakes';
import { MarkDraftSentUseCase, SendDraftEmailUseCase } from '../../src/core/application';
import {
  DraftFailedError,
  DraftSentVia,
  DraftSource,
  SignalNotFoundError,
  ThreadDirection,
  stripQuotedReply,
} from '../../src/core/domain';
import { RecordInboundReplyUseCase, SendFollowUpUseCase } from '../../src/core/application';
import { parseInbound } from '../../src/adapters/inbound/http/inbound-email.controller';
import type { EngagementDraft } from '../../src/core/domain';
import { EmailSenderPort } from '../../src/core/ports';
import type { OutgoingEmail } from '../../src/core/ports';

const NOW = new Date('2026-11-23T01:00:00.000Z');

class RecordingSender extends EmailSenderPort {
  readonly from = 'Example <sales@example.test>';
  readonly sent: OutgoingEmail[] = [];
  failWith: Error | null = null;
  private nextId = 0;

  constructor(
    readonly enabled = true,
    private readonly inboundDomain: string | null = null,
  ) {
    super();
  }

  get repliesInApp(): boolean {
    return this.inboundDomain !== null;
  }

  newMessageId(): string {
    this.nextId += 1;
    return `msg${this.nextId}@example.test`;
  }

  replyAddress(token: string): string | null {
    return this.inboundDomain === null ? null : `reply+${token}@${this.inboundDomain}`;
  }

  send(email: OutgoingEmail): Promise<void> {
    if (this.failWith !== null) return Promise.reject(this.failWith);
    this.sent.push(email);
    return Promise.resolve();
  }
}

function draft(overrides: Partial<EngagementDraft> = {}): EngagementDraft {
  return {
    signalId: 'sig-1',
    subject: 'Creators for Example Brand',
    text: 'Hi Example Brand team,',
    recipient: 'person@example.test',
    source: DraftSource.TEMPLATE,
    createdAt: NOW,
    editedAt: null,
    sentAt: null,
    sentVia: null,
    ...overrides,
  };
}

async function setup(initial: EngagementDraft | null = draft(), enabled = true) {
  const drafts = new InMemoryDraftRepository();
  if (initial !== null) await drafts.save(initial);
  const sender = new RecordingSender(enabled);
  const clock = new FakeClock(NOW);
  return {
    drafts,
    sender,
    send: new SendDraftEmailUseCase(drafts, sender, clock),
    mark: new MarkDraftSentUseCase(drafts, clock),
  };
}

describe('SendDraftEmailUseCase', () => {
  it('emails the saved draft and records it as sent through SendGrid', async () => {
    const { send, sender, drafts } = await setup();
    const result = await send.execute('sig-1');
    expect(sender.sent).toEqual([
      {
        to: 'person@example.test',
        subject: 'Creators for Example Brand',
        text: 'Hi Example Brand team,',
        messageId: 'msg1@example.test',
      },
    ]);
    expect(result.thread).toHaveLength(1);
    expect(result.thread?.[0]).toMatchObject({
      messageId: 'msg1@example.test',
      direction: ThreadDirection.OUTBOUND,
    });
    expect(result).toMatchObject({ sentAt: NOW, sentVia: DraftSentVia.SENDGRID });
    expect(await drafts.get('sig-1')).toMatchObject({ sentVia: DraftSentVia.SENDGRID });
  });

  it('never sends the same draft twice', async () => {
    const { send, sender } = await setup();
    await send.execute('sig-1');
    await expect(send.execute('sig-1')).rejects.toThrow('already sent');
    expect(sender.sent).toHaveLength(1);
  });

  it('ignores a second click while the first send is still going', async () => {
    const { send, sender } = await setup();
    const [first, second] = await Promise.allSettled([
      send.execute('sig-1'),
      send.execute('sig-1'),
    ]);
    expect(first.status).toBe('fulfilled');
    expect(second.status).toBe('rejected');
    expect(sender.sent).toHaveLength(1);
  });

  it('refuses when there is no recipient, no draft, or sending is not set up', async () => {
    await expect((await setup(draft({ recipient: null }))).send.execute('sig-1')).rejects.toThrow(
      DraftFailedError,
    );
    await expect((await setup(null)).send.execute('sig-1')).rejects.toThrow(SignalNotFoundError);
    const off = await setup(draft(), false);
    await expect(off.send.execute('sig-1')).rejects.toThrow('not set up');
    expect(off.sender.sent).toHaveLength(0);
  });

  it('leaves the draft unsent when the email service refuses it', async () => {
    const { send, sender, drafts } = await setup();
    sender.failWith = new DraftFailedError('The From address is not verified in SendGrid yet.');
    await expect(send.execute('sig-1')).rejects.toThrow('not verified');
    expect(await drafts.get('sig-1')).toMatchObject({ sentAt: null, sentVia: null });
  });

  it('cannot "undo" an email the app actually sent, but can undo a manual mark', async () => {
    const { send, mark } = await setup();
    await send.execute('sig-1');
    await expect(mark.execute('sig-1', false)).rejects.toThrow('cannot be undone');

    const manual = await setup();
    expect(await manual.mark.execute('sig-1', true)).toMatchObject({
      sentVia: DraftSentVia.MANUAL,
    });
    expect(await manual.mark.execute('sig-1', false)).toMatchObject({
      sentAt: null,
      sentVia: null,
    });
  });
});

describe('Outreach threads: follow-ups and replies', () => {
  async function sentThread(inboundDomain: string | null = 'replies.example.test') {
    const drafts = new InMemoryDraftRepository();
    await drafts.save(draft());
    const sender = new RecordingSender(true, inboundDomain);
    const clock = new FakeClock(NOW);
    const send = new SendDraftEmailUseCase(drafts, sender, clock);
    await send.execute('sig-1');
    return {
      drafts,
      sender,
      followUp: new SendFollowUpUseCase(drafts, sender, clock),
      inbound: new RecordInboundReplyUseCase(drafts, clock),
    };
  }

  it('uses a per-thread Reply-To address when replies come back into the app', async () => {
    const { sender, drafts } = await sentThread();
    expect(sender.sent[0]?.replyTo).toBe('reply+msg1@replies.example.test');
    expect(await drafts.get('sig-1')).toMatchObject({ replyToken: 'msg1' });
  });

  it('sends a follow-up in the same thread', async () => {
    const { followUp, sender } = await sentThread();
    const result = await followUp.execute('sig-1', '  Just following up.  ');
    expect(sender.sent[1]).toEqual({
      to: 'person@example.test',
      subject: 'Re: Creators for Example Brand',
      text: 'Just following up.',
      messageId: 'msg2@example.test',
      inReplyTo: 'msg1@example.test',
      references: ['msg1@example.test'],
      replyTo: 'reply+msg1@replies.example.test',
    });
    expect(result.thread?.map((m) => m.direction)).toEqual([
      ThreadDirection.OUTBOUND,
      ThreadDirection.OUTBOUND,
    ]);
  });

  it('refuses a follow-up before the outreach email was sent from the app, or when empty', async () => {
    const { followUp } = await setupFollowUpWithoutSend();
    await expect(followUp.execute('sig-1', 'Hi')).rejects.toThrow('after the outreach email');
    const sent = await sentThread();
    await expect(sent.followUp.execute('sig-1', '   ')).rejects.toThrow('Write the follow-up');
  });

  it('adds a reply matched by its Reply-To token, once, without the quoted history', async () => {
    const { inbound, drafts, followUp, sender } = await sentThread();
    const reply = {
      recipients: ['reply+msg1@replies.example.test'],
      from: 'Person <person@example.test>',
      subject: 'Re: Creators for Example Brand',
      text: 'Sounds good, let us talk.\n\nOn Mon, 23 Nov 2026 at 9:00, Example wrote:\n> Hi Example Brand team,',
      messageId: 'reply1@mail.example.test',
      inReplyTo: 'msg1@example.test',
      references: ['msg1@example.test'],
    };
    expect(await inbound.execute(reply)).toEqual({
      matched: true,
      signalId: 'sig-1',
      duplicate: false,
    });
    expect(await inbound.execute(reply)).toMatchObject({ duplicate: true });
    const saved = await drafts.get('sig-1');
    expect(saved?.thread).toHaveLength(2);
    expect(saved?.thread?.[1]).toMatchObject({
      direction: ThreadDirection.INBOUND,
      text: 'Sounds good, let us talk.',
    });

    // The next follow-up replies to the latest message, the reply.
    await followUp.execute('sig-1', 'Great, how is Thursday?');
    expect(sender.sent[1]).toMatchObject({
      inReplyTo: 'reply1@mail.example.test',
      references: ['msg1@example.test', 'reply1@mail.example.test'],
    });
  });

  it('matches a reply by In-Reply-To when the token is missing, and ignores strangers', async () => {
    const { inbound } = await sentThread(null);
    const base = {
      recipients: ['sales@example.test'],
      from: 'person@example.test',
      subject: 'Re: hi',
      text: 'Yes',
      messageId: 'r@mail.example.test',
      references: [],
    };
    expect(await inbound.execute({ ...base, inReplyTo: 'msg1@example.test' })).toMatchObject({
      matched: true,
    });
    expect(
      await inbound.execute({ ...base, messageId: 'r2@x.test', inReplyTo: 'nope@x.test' }),
    ).toEqual({ matched: false });
  });

  it('parses SendGrid Inbound Parse fields', () => {
    const email = parseInbound({
      headers:
        'Message-ID: <reply1@mail.example.test>\r\nIn-Reply-To: <msg1@example.test>\r\nReferences: <msg0@example.test>\r\n <msg1@example.test>\r\nSubject: Re: Hello',
      from: 'Person <person@example.test>',
      to: '"Fabulate" <reply+msg1@replies.example.test>',
      subject: 'Re: Hello',
      text: '',
      html: '<p>Hello&nbsp;there</p><br>Thanks',
      envelope: '{"to":["reply+msg1@replies.example.test"],"from":"person@example.test"}',
    });
    expect(email).toEqual({
      recipients: ['reply+msg1@replies.example.test'],
      from: 'Person <person@example.test>',
      subject: 'Re: Hello',
      text: 'Hello there\n\nThanks',
      messageId: 'reply1@mail.example.test',
      inReplyTo: 'msg1@example.test',
      references: ['msg0@example.test', 'msg1@example.test'],
    });
  });

  it('strips Outlook-style quoted history', () => {
    expect(
      stripQuotedReply('Thanks!\r\n\r\nFrom: Fabulate <sales@example.test>\r\nSent: Monday\r\nHi'),
    ).toBe('Thanks!');
  });
});

async function setupFollowUpWithoutSend() {
  const drafts = new InMemoryDraftRepository();
  await drafts.save(draft());
  const clock = new FakeClock(NOW);
  return { followUp: new SendFollowUpUseCase(drafts, new RecordingSender(), clock) };
}
