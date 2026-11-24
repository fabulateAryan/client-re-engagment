import {
  ClientNotFoundError,
  DraftFailedError,
  DraftSentVia,
  MAX_DRAFT_LENGTH,
  MAX_SUBJECT_LENGTH,
  SignalNotFoundError,
  ThreadDirection,
  isEmailAddress,
  replySubject,
  stripQuotedReply,
  subjectFor,
  threadOf,
} from '../domain';
import type { EngagementDraft, Platform } from '../domain';
import type {
  CampaignHistoryPort,
  ClientRepositoryPort,
  ClockPort,
  DraftRepositoryPort,
  EmailSenderPort,
  MessagePort,
  SignalQueryPort,
} from '../ports';

/**
 * Drafts an engagement message for one signal, for a person to review, edit and send
 * themselves. Nothing is sent from here.
 *
 * An existing draft is returned as is (so a person's edits are never overwritten) unless
 * `regenerate` is set.
 */
export class DraftEngagementMessageUseCase {
  constructor(
    private readonly signals: SignalQueryPort,
    private readonly clients: ClientRepositoryPort,
    private readonly campaigns: CampaignHistoryPort,
    private readonly messages: MessagePort,
    private readonly drafts: DraftRepositoryPort,
    private readonly clock: ClockPort,
  ) {}

  /**
   * @throws SignalNotFoundError, ClientNotFoundError, or DraftFailedError.
   */
  async execute(
    signalId: string,
    options: { regenerate?: boolean } = {},
  ): Promise<EngagementDraft> {
    const existing = await this.drafts.get(signalId);
    if (existing !== null && options.regenerate !== true) return existing;
    if (existing?.sentVia === DraftSentVia.SENDGRID) {
      throw new DraftFailedError('This message was already emailed from the app.');
    }

    const signal = await this.signals.getById(signalId);
    if (signal === null) throw new SignalNotFoundError(signalId);
    const client = await this.clients.getById(signal.clientId);
    if (client === null) throw new ClientNotFoundError(signal.clientId);
    const campaigns = await this.campaigns.listForClient(client.id);

    const text = (await this.messages.draft({ client, signal, campaigns })).trim();
    if (text === '') throw new DraftFailedError('The drafter returned an empty message.');

    const draft: EngagementDraft = {
      signalId,
      subject: subjectFor(client.name, signal.signalType),
      text,
      // Starting again keeps the address the rep already typed.
      recipient: existing?.recipient ?? null,
      source: this.messages.source,
      createdAt: this.clock.now(),
      editedAt: null,
      sentAt: null,
      sentVia: null,
    };
    await this.drafts.save(draft);
    return draft;
  }
}

/** Saves a person's edits to an existing draft, so they are kept when they come back. */
export class SaveDraftEditUseCase {
  constructor(
    private readonly drafts: DraftRepositoryPort,
    private readonly clock: ClockPort,
  ) {}

  /**
   * Fields left out are unchanged. An empty `recipient` clears it.
   * @throws SignalNotFoundError when the signal has no draft yet.
   * @throws DraftFailedError when a value is empty, too long or not an email address.
   */
  async execute(signalId: string, changes: DraftChanges): Promise<EngagementDraft> {
    const existing = await this.drafts.get(signalId);
    if (existing === null) throw new SignalNotFoundError(signalId);

    const text = changes.text === undefined ? existing.text : changes.text.trim();
    if (text === '') throw new DraftFailedError('The message cannot be empty.');
    if (text.length > MAX_DRAFT_LENGTH) {
      throw new DraftFailedError(`Keep the message under ${MAX_DRAFT_LENGTH} characters.`);
    }
    const subject = changes.subject === undefined ? existing.subject : changes.subject.trim();
    if (subject === '') throw new DraftFailedError('The subject cannot be empty.');
    if (subject.length > MAX_SUBJECT_LENGTH) {
      throw new DraftFailedError(`Keep the subject under ${MAX_SUBJECT_LENGTH} characters.`);
    }
    let recipient = existing.recipient;
    if (changes.recipient !== undefined) {
      const typed = (changes.recipient ?? '').trim();
      if (typed !== '' && !isEmailAddress(typed)) {
        throw new DraftFailedError('Enter one email address, like name@example.com.');
      }
      recipient = typed === '' ? null : typed;
    }

    const draft: EngagementDraft = {
      ...existing,
      text,
      subject,
      recipient,
      editedAt: this.clock.now(),
    };
    await this.drafts.save(draft);
    return draft;
  }
}

export interface DraftChanges {
  readonly text?: string;
  readonly subject?: string;
  readonly recipient?: string | null;
}

/**
 * The rep sent the message from their own mailbox and records that here, so the team can
 * see which signals have been acted on. `sent: false` undoes a mistaken mark.
 */
export class MarkDraftSentUseCase {
  constructor(
    private readonly drafts: DraftRepositoryPort,
    private readonly clock: ClockPort,
  ) {}

  /**
   * @throws SignalNotFoundError when the signal has no draft yet.
   * @throws DraftFailedError when marking as sent before an email address is saved.
   */
  async execute(signalId: string, sent: boolean): Promise<EngagementDraft> {
    const existing = await this.drafts.get(signalId);
    if (existing === null) throw new SignalNotFoundError(signalId);
    if (sent && existing.recipient === null) {
      throw new DraftFailedError('Enter the email address you sent it to, then mark it as sent.');
    }
    if (!sent && existing.sentVia === DraftSentVia.SENDGRID) {
      throw new DraftFailedError('This email was sent from the app, so it cannot be undone.');
    }
    const draft: EngagementDraft = {
      ...existing,
      sentAt: sent ? this.clock.now() : null,
      sentVia: sent ? DraftSentVia.MANUAL : null,
    };
    await this.drafts.save(draft);
    return draft;
  }
}

/**
 * The rep pressed Send: email the saved draft to its recipient through the email sender
 * (SendGrid), then record it as sent. Only ever called by a person's click.
 */
export class SendDraftEmailUseCase {
  /** Signals being sent right now, so a double click cannot send twice. */
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly drafts: DraftRepositoryPort,
    private readonly sender: EmailSenderPort,
    private readonly clock: ClockPort,
  ) {}

  /**
   * @throws SignalNotFoundError when the signal has no draft yet.
   * @throws DraftFailedError when sending is not set up, the draft was already sent, there is
   *   no valid recipient, or the email service refuses the message.
   */
  async execute(signalId: string): Promise<EngagementDraft> {
    if (!this.sender.enabled) {
      throw new DraftFailedError(
        'Sending from the app is not set up. Open the draft in your email instead.',
      );
    }
    if (this.inFlight.has(signalId)) {
      throw new DraftFailedError('This email is already being sent.');
    }
    this.inFlight.add(signalId);
    try {
      const existing = await this.drafts.get(signalId);
      if (existing === null) throw new SignalNotFoundError(signalId);
      if (existing.sentAt !== null) throw new DraftFailedError('This message was already sent.');
      if (existing.recipient === null || !isEmailAddress(existing.recipient)) {
        throw new DraftFailedError('Enter one email address in To, then send.');
      }
      const messageId = this.sender.newMessageId();
      // The Message-ID's random part doubles as the thread's reply token.
      const replyToken = messageId.split('@')[0] ?? messageId;
      const replyTo = this.sender.replyAddress(replyToken);
      await this.sender.send({
        to: existing.recipient,
        subject: existing.subject,
        text: existing.text,
        messageId,
        ...(replyTo === null ? {} : { replyTo }),
      });
      const now = this.clock.now();
      const draft: EngagementDraft = {
        ...existing,
        sentAt: now,
        sentVia: DraftSentVia.SENDGRID,
        replyToken,
        thread: [
          {
            messageId,
            direction: ThreadDirection.OUTBOUND,
            from: this.sender.from ?? '',
            to: existing.recipient,
            subject: existing.subject,
            text: existing.text,
            at: now,
          },
        ],
      };
      await this.drafts.save(draft);
      return draft;
    } finally {
      this.inFlight.delete(signalId);
    }
  }
}

/** The saved draft for a signal, with its thread, for refreshing the panel. */
export class GetDraftUseCase {
  constructor(private readonly drafts: DraftRepositoryPort) {}

  /** @throws SignalNotFoundError when the signal has no draft yet. */
  async execute(signalId: string): Promise<EngagementDraft> {
    const draft = await this.drafts.get(signalId);
    if (draft === null) throw new SignalNotFoundError(signalId);
    return draft;
  }
}

/** Most Message-IDs kept in a follow-up's References header. */
const MAX_REFERENCES = 20;

/**
 * The rep pressed "Send follow-up": email a new message in the same thread as the outreach
 * email (same recipient, "Re:" subject, In-Reply-To and References headers), so it shows up
 * as part of the conversation in the recipient's inbox. Only ever called by a person's click.
 */
export class SendFollowUpUseCase {
  private readonly inFlight = new Set<string>();

  constructor(
    private readonly drafts: DraftRepositoryPort,
    private readonly sender: EmailSenderPort,
    private readonly clock: ClockPort,
  ) {}

  /**
   * @throws SignalNotFoundError when the signal has no draft yet.
   * @throws DraftFailedError when sending is not set up, the outreach email was not sent from
   *   the app, the message is empty or too long, or the email service refuses it.
   */
  async execute(signalId: string, rawText: string): Promise<EngagementDraft> {
    if (!this.sender.enabled) {
      throw new DraftFailedError('Sending from the app is not set up.');
    }
    const text = rawText.trim();
    if (text === '') throw new DraftFailedError('Write the follow-up first.');
    if (text.length > MAX_DRAFT_LENGTH) {
      throw new DraftFailedError(`Keep the follow-up under ${MAX_DRAFT_LENGTH} characters.`);
    }
    if (this.inFlight.has(signalId)) {
      throw new DraftFailedError('A follow-up is already being sent.');
    }
    this.inFlight.add(signalId);
    try {
      const existing = await this.drafts.get(signalId);
      if (existing === null) throw new SignalNotFoundError(signalId);
      const thread = threadOf(existing);
      const last = thread[thread.length - 1];
      if (existing.sentVia !== DraftSentVia.SENDGRID || last === undefined) {
        throw new DraftFailedError(
          'Follow-ups can only be sent after the outreach email was sent from the app.',
        );
      }
      if (existing.recipient === null) {
        throw new DraftFailedError('This thread has no recipient.');
      }

      const messageId = this.sender.newMessageId();
      const subject = replySubject(existing.subject);
      const replyTo =
        existing.replyToken == null ? null : this.sender.replyAddress(existing.replyToken);
      await this.sender.send({
        to: existing.recipient,
        subject,
        text,
        messageId,
        inReplyTo: last.messageId,
        references: thread.map((m) => m.messageId).slice(-MAX_REFERENCES),
        ...(replyTo === null ? {} : { replyTo }),
      });
      const draft: EngagementDraft = {
        ...existing,
        thread: [
          ...thread,
          {
            messageId,
            direction: ThreadDirection.OUTBOUND,
            from: this.sender.from ?? '',
            to: existing.recipient,
            subject,
            text,
            at: this.clock.now(),
          },
        ],
      };
      await this.drafts.save(draft);
      return draft;
    } finally {
      this.inFlight.delete(signalId);
    }
  }
}

/** A reply received by email (from SendGrid Inbound Parse), already parsed. */
export interface InboundEmail {
  /** Every recipient address (To, Cc and the SMTP envelope), as plain addresses. */
  readonly recipients: readonly string[];
  readonly from: string;
  readonly subject: string;
  readonly text: string;
  /** Without angle brackets, or null if the email had none. */
  readonly messageId: string | null;
  readonly inReplyTo: string | null;
  readonly references: readonly string[];
}

export type InboundResult =
  | { readonly matched: true; readonly signalId: string; readonly duplicate: boolean }
  | { readonly matched: false };

/**
 * Adds a received reply to the thread it belongs to. The thread is found by the token in
 * the per-thread Reply-To address (reply+<token>@...), or else by the In-Reply-To and
 * References headers pointing at an email the app sent.
 */
export class RecordInboundReplyUseCase {
  constructor(
    private readonly drafts: DraftRepositoryPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(email: InboundEmail): Promise<InboundResult> {
    const draft = await this.findThread(email);
    if (draft === null) return { matched: false };

    const thread = threadOf(draft);
    const at = this.clock.now();
    const messageId = email.messageId ?? `inbound-${at.getTime()}-${thread.length}`;
    if (thread.some((m) => m.messageId.toLowerCase() === messageId.toLowerCase())) {
      // SendGrid retries when it does not get a 2xx in time; keep one copy.
      return { matched: true, signalId: draft.signalId, duplicate: true };
    }
    const saved: EngagementDraft = {
      ...draft,
      thread: [
        ...thread,
        {
          messageId,
          direction: ThreadDirection.INBOUND,
          from: email.from,
          to: email.recipients[0] ?? '',
          subject: email.subject,
          text: stripQuotedReply(email.text).slice(0, MAX_INBOUND_LENGTH),
          at,
        },
      ],
    };
    await this.drafts.save(saved);
    return { matched: true, signalId: draft.signalId, duplicate: false };
  }

  private async findThread(email: InboundEmail): Promise<EngagementDraft | null> {
    for (const address of email.recipients) {
      const token = replyTokenIn(address);
      if (token === null) continue;
      const draft = await this.drafts.findByReplyToken(token);
      if (draft !== null) return draft;
    }
    const ids = [email.inReplyTo, ...[...email.references].reverse()].filter(
      (id): id is string => id !== null && id !== '',
    );
    for (const id of ids) {
      const draft = await this.drafts.findByMessageId(id);
      if (draft !== null) return draft;
    }
    return null;
  }
}

/** Longest reply kept (the rest is usually signatures and quoted text). */
const MAX_INBOUND_LENGTH = 10_000;

/** "reply+abc123@replies.example.com" -> "abc123". */
function replyTokenIn(address: string): string | null {
  const match = /^[^@+\s]+\+([A-Za-z0-9_-]+)@/.exec(address.trim());
  return match?.[1] ?? null;
}

/** One outreach thread for the overview, with the brand and post it is about. */
export interface OutreachThreadSummary {
  readonly draft: EngagementDraft;
  /** Null when the brand was removed. */
  readonly clientName: string | null;
  /** Null when the signal is no longer stored. */
  readonly signal: { readonly platform: Platform; readonly url: string } | null;
  readonly lastActivityAt: Date;
  readonly replies: number;
  /** True when the last message in the thread is a reply the team has not answered. */
  readonly needsResponse: boolean;
}

/** Every email thread sent from the app, most recent activity first. */
export class ListOutreachThreadsUseCase {
  constructor(
    private readonly drafts: DraftRepositoryPort,
    private readonly signals: SignalQueryPort,
    private readonly clients: ClientRepositoryPort,
  ) {}

  async execute(): Promise<OutreachThreadSummary[]> {
    const drafts = await this.drafts.listEmailed();
    const summaries = await Promise.all(
      drafts.map(async (draft): Promise<OutreachThreadSummary> => {
        const signal = await this.signals.getById(draft.signalId);
        const client = signal === null ? null : await this.clients.getById(signal.clientId);
        const thread = threadOf(draft);
        const last = thread[thread.length - 1];
        return {
          draft,
          clientName: client?.name ?? null,
          signal: signal === null ? null : { platform: signal.platform, url: signal.url },
          lastActivityAt: last?.at ?? draft.sentAt ?? draft.createdAt,
          replies: thread.filter((m) => m.direction === ThreadDirection.INBOUND).length,
          needsResponse: last?.direction === ThreadDirection.INBOUND,
        };
      }),
    );
    return summaries.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  }
}
