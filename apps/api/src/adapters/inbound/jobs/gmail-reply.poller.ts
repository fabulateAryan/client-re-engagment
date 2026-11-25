import { Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import type { RecordInboundReplyUseCase } from '../../../core/application';
import { ReplyInboxPort } from '../../../core/ports';
import type { GmailApiClient } from '../../outbound/email/gmail/gmail-api.client';
import { parseGmailMessage } from '../../outbound/email/gmail/gmail-mime';

export interface GmailPollSettings {
  readonly intervalMs: number;
  /** Only messages this recent are read; older replies are assumed handled already. */
  readonly lookbackDays: number;
  /** Most messages read per poll. */
  readonly batchSize: number;
}

/** Remembered Gmail ids, so each message is fetched once per process. Bounded. */
const MAX_SEEN = 5_000;

/**
 * Reads replies to app emails from the Gmail inbox and adds them to their outreach thread.
 *
 * Each poll lists recent inbox messages not sent by the mailbox itself and passes new ones to
 * RecordInboundReplyUseCase, which matches them by the Reply-To token or threading headers and
 * ignores everything else. That use case also drops duplicates, so re-reading the same messages
 * after a restart is harmless.
 */
export class GmailReplyPoller
  extends ReplyInboxPort
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  readonly enabled = true;
  private readonly logger = new Logger(GmailReplyPoller.name);
  private readonly seen = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  /** The poll in progress, shared by anyone who asks while it runs. */
  private inFlight: Promise<number> | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly gmail: GmailApiClient,
    private readonly record: RecordInboundReplyUseCase,
    private readonly settings: GmailPollSettings,
  ) {
    super();
  }

  /** "Check for replies" in the app: read the inbox now instead of waiting for the timer. */
  checkNow(): Promise<number> {
    return this.pollOnce();
  }

  onApplicationBootstrap(): void {
    this.logger.log(
      `Checking Gmail for replies every ${Math.round(this.settings.intervalMs / 1000)}s.`,
    );
    void this.pollOnce();
    this.timer = setInterval(() => void this.pollOnce(), this.settings.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass over the inbox. Never throws. Returns how many replies were added. */
  pollOnce(): Promise<number> {
    // A poll already running (timer or a button press) is shared, not started twice.
    this.inFlight ??= this.poll().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async poll(): Promise<number> {
    let added = 0;
    try {
      const query = `in:inbox -from:me newer_than:${this.settings.lookbackDays}d`;
      const ids = await this.gmail.listMessageIds(query, this.settings.batchSize);
      // Oldest first, so a thread's replies are stored in the order they arrived.
      for (const id of ids.reverse()) {
        if (this.seen.has(id)) continue;
        const email = parseGmailMessage(await this.gmail.getMessage(id));
        const result = await this.record.execute(email);
        this.remember(id);
        if (result.matched && !result.duplicate) {
          added += 1;
          this.logger.log(`Reply added to the thread for signal ${result.signalId}.`);
        }
      }
      if (this.lastError !== null) this.logger.log('Gmail reply checks are working again.');
      this.lastError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      // Log each distinct problem once, not on every poll.
      if (message !== this.lastError)
        this.logger.warn(`Could not check Gmail for replies: ${message}`);
      this.lastError = message;
    }
    return added;
  }

  private remember(id: string): void {
    this.seen.add(id);
    if (this.seen.size > MAX_SEEN) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
  }
}
