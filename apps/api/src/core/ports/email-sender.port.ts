/** One plain-text email to one person. */
export interface OutgoingEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  /** Message-ID for this email, without angle brackets (from `newMessageId`). */
  readonly messageId?: string;
  /** Message-ID this email replies to, so email apps show it in the same thread. */
  readonly inReplyTo?: string;
  /** Earlier Message-IDs in the thread, oldest first. */
  readonly references?: readonly string[];
  /** Overrides the configured Reply-To (used for the per-thread reply address). */
  readonly replyTo?: string;
}

/** Sends email on a person's behalf. Only called after a person presses Send. */
export abstract class EmailSenderPort {
  /** False when no email service is set up; `send` then always fails. */
  abstract readonly enabled: boolean;
  /** Who the email is from, for display (e.g. "Fabulate <sales@example.com>"), or null. */
  abstract readonly from: string | null;
  /** True when replies come back into the app (an inbound reply address is set up). */
  abstract readonly repliesInApp: boolean;

  /** A new, unique Message-ID (without angle brackets), e.g. "3f9c...@example.com". */
  abstract newMessageId(): string;

  /** The Reply-To address for a thread, or null when replies are not received in the app. */
  abstract replyAddress(token: string): string | null;

  /**
   * @throws DraftFailedError with a message safe to show a person when it is not sent.
   */
  abstract send(email: OutgoingEmail): Promise<void>;
}
