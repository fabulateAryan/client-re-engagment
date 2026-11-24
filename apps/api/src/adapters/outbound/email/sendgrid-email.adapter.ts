import { Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DraftFailedError } from '../../../core/domain';
import { EmailSenderPort } from '../../../core/ports';
import type { OutgoingEmail } from '../../../core/ports';

export interface SendGridSettings {
  readonly apiKey: string;
  /** Must be a verified sender, or on a domain authenticated in SendGrid. */
  readonly fromEmail: string;
  readonly fromName: string;
  /** Where replies go. Null: replies go to `fromEmail`. */
  readonly replyTo: string | null;
  /** True: SendGrid checks the request but delivers nothing (for testing). */
  readonly sandbox: boolean;
  /**
   * Domain whose MX records point at SendGrid Inbound Parse (e.g. "replies.example.com").
   * Set: each thread gets its own Reply-To address there, so replies come back into the app.
   */
  readonly inboundDomain?: string | null;
}

/** SendGrid v3 Mail Send: https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send */
const SEND_URL = 'https://api.sendgrid.com/v3/mail/send';
const TIMEOUT_MS = 15_000;

/** Sends plain-text email through SendGrid's v3 API, without the SendGrid SDK. */
export class SendGridEmailAdapter extends EmailSenderPort {
  readonly enabled = true;
  readonly from: string;
  readonly repliesInApp: boolean;
  private readonly logger = new Logger(SendGridEmailAdapter.name);

  constructor(
    private readonly settings: SendGridSettings,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    super();
    this.from = `${settings.fromName} <${settings.fromEmail}>`;
    this.repliesInApp = (settings.inboundDomain ?? null) !== null;
  }

  newMessageId(): string {
    // Same domain as the From address, so receiving servers see a consistent sender.
    const domain = this.settings.fromEmail.split('@')[1] ?? 'localhost';
    return `${randomBytes(12).toString('hex')}@${domain}`;
  }

  replyAddress(token: string): string | null {
    const domain = this.settings.inboundDomain ?? null;
    return domain === null ? null : `reply+${token}@${domain}`;
  }

  async send(email: OutgoingEmail): Promise<void> {
    const { settings } = this;
    const replyTo = email.replyTo ?? settings.replyTo;
    // Threading headers: email apps group messages by these (and by subject).
    const headers: Record<string, string> = {};
    if (email.messageId !== undefined) headers['Message-ID'] = `<${email.messageId}>`;
    if (email.inReplyTo !== undefined) headers['In-Reply-To'] = `<${email.inReplyTo}>`;
    if (email.references !== undefined && email.references.length > 0) {
      headers.References = email.references.map((id) => `<${id}>`).join(' ');
    }
    const body = {
      personalizations: [{ to: [{ email: email.to }] }],
      from: { email: settings.fromEmail, name: settings.fromName },
      ...(replyTo === null ? {} : { reply_to: { email: replyTo } }),
      subject: email.subject,
      content: [{ type: 'text/plain', value: email.text }],
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      // A one-to-one sales email: no rewritten links or tracking pixel.
      tracking_settings: {
        click_tracking: { enable: false, enable_text: false },
        open_tracking: { enable: false },
      },
      ...(settings.sandbox ? { mail_settings: { sandbox_mode: { enable: true } } } : {}),
    };

    let response: Response;
    try {
      response = await this.fetchFn(SEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.warn(
        `SendGrid request failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new DraftFailedError('Could not reach the email service. Try again in a minute.');
    }

    // 202 Accepted when sent; 200 in sandbox mode.
    if (response.status === 202 || response.status === 200) return;

    const detail = await sendGridErrors(response);
    this.logger.warn(`SendGrid refused the email: ${response.status} ${detail}`);
    throw new DraftFailedError(userMessageFor(response.status, detail));
  }
}

/** Sending is not set up (no SENDGRID_API_KEY). */
export class DisabledEmailSender extends EmailSenderPort {
  readonly enabled = false;
  readonly from = null;
  readonly repliesInApp = false;

  newMessageId(): string {
    return `${randomBytes(12).toString('hex')}@localhost`;
  }

  replyAddress(): string | null {
    return null;
  }

  send(): Promise<void> {
    return Promise.reject(
      new DraftFailedError(
        'Sending from the app is not set up. Open the draft in your email instead.',
      ),
    );
  }
}

/** SendGrid's error messages (they never contain the API key). */
async function sendGridErrors(response: Response): Promise<string> {
  try {
    const parsed = (await response.json()) as { errors?: { message?: string }[] };
    return (parsed.errors ?? [])
      .map((e) => e.message)
      .filter((m): m is string => typeof m === 'string')
      .join('; ')
      .slice(0, 300);
  } catch {
    return '';
  }
}

function userMessageFor(status: number, detail: string): string {
  if (status === 401)
    return 'The email service rejected the app’s key. Ask an admin to check SENDGRID_API_KEY.';
  if (status === 403) {
    return /sender identity|from address/i.test(detail)
      ? 'The From address is not verified in SendGrid yet. Ask an admin to verify it.'
      : 'The email service did not allow this email. Ask an admin to check the SendGrid account.';
  }
  if (status === 413) return 'The email is too large to send.';
  if (status === 429) return 'Too many emails sent just now. Try again in a minute.';
  if (status === 400)
    return 'The email service could not accept this email. Check the To address and try again.';
  return 'The email service had a problem. Try again in a minute.';
}
