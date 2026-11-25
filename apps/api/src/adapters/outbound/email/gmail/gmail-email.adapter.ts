import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DraftFailedError } from '../../../../core/domain';
import { EmailSenderPort } from '../../../../core/ports';
import type { OutgoingEmail } from '../../../../core/ports';
import { GmailApiError } from './gmail-api.client';
import type { GmailApiClient } from './gmail-api.client';
import { buildMimeMessage } from './gmail-mime';

export interface GmailSenderSettings {
  /** The signed-in Gmail address (or one of its verified "Send mail as" aliases). */
  readonly fromEmail: string;
  readonly fromName: string;
}

/**
 * Sends plain-text email from a Gmail mailbox through the Gmail API.
 *
 * Replies come back into the app through plus addressing: each thread's Reply-To is
 * `<mailbox>+<token>@<domain>`, which Gmail delivers to the same inbox. GmailReplyPoller
 * reads the inbox and matches replies by that token (or by In-Reply-To / References).
 */
export class GmailEmailAdapter extends EmailSenderPort {
  readonly enabled = true;
  readonly from: string;
  readonly repliesInApp = true;
  private readonly logger = new Logger(GmailEmailAdapter.name);

  constructor(
    private readonly gmail: GmailApiClient,
    private readonly settings: GmailSenderSettings,
  ) {
    super();
    this.from = `${settings.fromName} <${settings.fromEmail}>`;
  }

  newMessageId(): string {
    const domain = this.settings.fromEmail.split('@')[1] ?? 'localhost';
    return `${randomBytes(12).toString('hex')}@${domain}`;
  }

  replyAddress(token: string): string | null {
    const [local, domain] = this.settings.fromEmail.split('@');
    if (local === undefined || domain === undefined) return null;
    // Drop any existing +tag so the token is the only one.
    return `${local.split('+')[0] ?? local}+${token}@${domain}`;
  }

  async send(email: OutgoingEmail): Promise<void> {
    const raw = buildMimeMessage({
      fromEmail: this.settings.fromEmail,
      fromName: this.settings.fromName,
      to: email.to,
      replyTo: email.replyTo ?? null,
      subject: email.subject,
      text: email.text,
      ...(email.messageId === undefined ? {} : { messageId: email.messageId }),
      ...(email.inReplyTo === undefined ? {} : { inReplyTo: email.inReplyTo }),
      ...(email.references === undefined ? {} : { references: email.references }),
    });
    try {
      await this.gmail.send(raw);
    } catch (error) {
      const status = error instanceof GmailApiError ? error.status : 0;
      this.logger.warn(
        `Gmail did not send the email: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new DraftFailedError(userMessageFor(error, status));
    }
  }
}

function userMessageFor(error: unknown, status: number): string {
  if (error instanceof GmailApiError && error.oauthError === 'invalid_grant') {
    return 'The app’s Gmail sign-in has expired. Ask an admin to run "pnpm gmail:auth" again.';
  }
  if (status === 0) return 'Could not reach Gmail. Try again in a minute.';
  if (status === 401 || status === 403) {
    return 'Gmail did not allow the app to send. Ask an admin to check the Gmail connection.';
  }
  if (status === 429) return 'Too many emails sent just now. Try again in a minute.';
  if (status === 400)
    return 'Gmail could not accept this email. Check the To address and try again.';
  return 'Gmail had a problem sending the email. Try again in a minute.';
}
