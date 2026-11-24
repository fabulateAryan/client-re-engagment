import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  NotFoundException,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { timingSafeEqual } from 'node:crypto';
import { RecordInboundReplyUseCase } from '../../../core/application';
import type { InboundEmail } from '../../../core/application';
import { AppConfig } from '../../../config';
import { Public } from './clerk-auth.guard';

/** The form fields SendGrid Inbound Parse posts (default mode, not "raw"). */
interface InboundParseFields {
  headers?: string;
  from?: string;
  to?: string;
  cc?: string;
  subject?: string;
  text?: string;
  html?: string;
  envelope?: string;
}

/**
 * SendGrid Inbound Parse webhook: SendGrid posts every email sent to the inbound reply domain
 * here, and replies to app emails are added to their thread. Open without signing in (SendGrid
 * cannot sign in) but only accepted with the secret key in the URL.
 *
 * Always answers 200 for a valid key, even when the email matches no thread: any other
 * answer makes SendGrid retry the same email for up to three days.
 */
@Public()
@Controller('inbound')
export class InboundEmailController {
  private readonly logger = new Logger(InboundEmailController.name);

  constructor(
    @Inject(AppConfig) private readonly config: AppConfig,
    @Inject(RecordInboundReplyUseCase) private readonly record: RecordInboundReplyUseCase,
  ) {}

  @Post('sendgrid')
  @HttpCode(HttpStatus.OK)
  // Attachments are parsed (in memory, capped) and ignored; only the text is kept.
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: 10 * 1024 * 1024, files: 20 } }))
  async sendGrid(
    @Query('key') key: unknown,
    @Body() body: InboundParseFields | undefined,
  ): Promise<{ ok: true }> {
    const expected = this.config.sendGrid?.inboundKey ?? null;
    if (expected === null) throw new NotFoundException();
    if (typeof key !== 'string' || !sameSecret(key, expected)) throw new ForbiddenException();

    const email = parseInbound(body ?? {});
    const result = await this.record.execute(email);
    if (!result.matched) {
      this.logger.warn('Received an email that matches no outreach thread; ignored.');
    } else if (!result.duplicate) {
      this.logger.log(`Reply added to the thread for signal ${result.signalId}.`);
    }
    return { ok: true };
  }
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Turns SendGrid's form fields into an InboundEmail. Exported for tests. */
export function parseInbound(fields: InboundParseFields): InboundEmail {
  const headers = parseHeaders(fields.headers ?? '');
  const recipients = new Set<string>();
  for (const value of [fields.to, fields.cc, headers.get('delivered-to')]) {
    for (const address of addressesIn(value ?? '')) recipients.add(address);
  }
  try {
    const envelope = JSON.parse(fields.envelope ?? '{}') as { to?: unknown };
    if (Array.isArray(envelope.to)) {
      for (const to of envelope.to) if (typeof to === 'string') recipients.add(to.toLowerCase());
    }
  } catch {
    // A malformed envelope only loses one way of matching the thread.
  }
  const text =
    (fields.text ?? '').trim() !== '' ? (fields.text ?? '') : htmlToText(fields.html ?? '');
  return {
    recipients: [...recipients],
    from: (fields.from ?? headers.get('from') ?? '').trim(),
    subject: (fields.subject ?? headers.get('subject') ?? '').trim(),
    text,
    messageId: idsIn(headers.get('message-id') ?? '')[0] ?? null,
    inReplyTo: idsIn(headers.get('in-reply-to') ?? '')[0] ?? null,
    references: idsIn(headers.get('references') ?? ''),
  };
}

/** Raw headers ("Name: value" lines, long values folded onto indented lines) to a map. */
function parseHeaders(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  const unfolded = raw.replace(/\r\n?/g, '\n').replace(/\n[ \t]+/g, ' ');
  for (const line of unfolded.split('\n')) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    if (!map.has(name)) map.set(name, line.slice(colon + 1).trim());
  }
  return map;
}

/** "<a@b> <c@d>" -> ["a@b", "c@d"]. */
function idsIn(value: string): string[] {
  return [...value.matchAll(/<([^<>\s]+)>/g)].map((m) => m[1] ?? '').filter((id) => id !== '');
}

/** Plain addresses in a header like `"Name" <a@b.com>, c@d.com`, lower-cased. */
function addressesIn(value: string): string[] {
  return [...value.matchAll(/[^\s<>,;"']+@[^\s<>,;"']+/g)].map((m) => m[0].toLowerCase());
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
