import type { InboundEmail } from '../../../../core/application';
import { addressesIn, htmlToText, idsIn } from '../../../shared/email-text';
import type { GmailMessage, GmailMessagePart } from './gmail-api.client';

export interface MimeEmail {
  readonly fromEmail: string;
  readonly fromName: string;
  readonly to: string;
  readonly replyTo: string | null;
  readonly subject: string;
  readonly text: string;
  readonly messageId?: string;
  readonly inReplyTo?: string;
  readonly references?: readonly string[];
}

/** Builds a plain-text RFC 2822 message (UTF-8, base64 body) for the Gmail API. */
export function buildMimeMessage(email: MimeEmail): string {
  const headers: string[] = [
    `From: ${encodeDisplayName(email.fromName)} <${clean(email.fromEmail)}>`,
    `To: ${clean(email.to)}`,
  ];
  if (email.replyTo !== null) headers.push(`Reply-To: ${clean(email.replyTo)}`);
  headers.push(`Subject: ${encodeHeaderText(email.subject)}`);
  if (email.messageId !== undefined) headers.push(`Message-ID: <${clean(email.messageId)}>`);
  if (email.inReplyTo !== undefined) headers.push(`In-Reply-To: <${clean(email.inReplyTo)}>`);
  if (email.references !== undefined && email.references.length > 0) {
    headers.push(`References: ${email.references.map((id) => `<${clean(id)}>`).join(' ')}`);
  }
  headers.push(
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
  );
  const body = Buffer.from(email.text.replace(/\r?\n/g, '\r\n'), 'utf8')
    .toString('base64')
    .replace(/.{76}/g, '$&\r\n');
  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

/** Header values never carry line breaks (prevents header injection). */
function clean(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function isAscii(value: string): boolean {
  return /^[\x20-\x7e]*$/.test(value);
}

/** RFC 2047 encoded-words, split so each stays under the 75-character limit. */
function encodeHeaderText(value: string): string {
  const text = clean(value);
  if (isAscii(text)) return text;
  const words: string[] = [];
  let chunk = '';
  for (const char of text) {
    // 45 UTF-8 bytes -> 60 base64 characters, plus the "=?UTF-8?B??=" wrapper.
    if (Buffer.byteLength(chunk + char, 'utf8') > 45) {
      words.push(chunk);
      chunk = '';
    }
    chunk += char;
  }
  if (chunk !== '') words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}

function encodeDisplayName(name: string): string {
  const text = clean(name);
  if (!isAscii(text)) return encodeHeaderText(text);
  return `"${text.replace(/["\\]/g, '\\$&')}"`;
}

/** Turns a Gmail API message (format=full) into an InboundEmail. */
export function parseGmailMessage(message: GmailMessage): InboundEmail {
  const headers = message.payload?.headers ?? [];
  const all = (name: string): string[] =>
    headers.filter((h) => h.name.toLowerCase() === name).map((h) => h.value);
  const first = (name: string): string => all(name)[0] ?? '';

  const recipients = new Set<string>();
  // Gmail records the exact address it delivered to (e.g. you+token@gmail.com) in Delivered-To.
  for (const value of [
    ...all('delivered-to'),
    ...all('to'),
    ...all('cc'),
    ...all('x-original-to'),
  ]) {
    for (const address of addressesIn(value)) recipients.add(address);
  }

  const plain = findPart(message.payload, 'text/plain');
  const html = plain === null ? findPart(message.payload, 'text/html') : null;
  const text =
    plain !== null ? decodeBody(plain) : html !== null ? htmlToText(decodeBody(html)) : '';

  return {
    recipients: [...recipients],
    from: first('from').trim(),
    subject: first('subject').trim(),
    text,
    messageId: idsIn(first('message-id'))[0] ?? null,
    inReplyTo: idsIn(first('in-reply-to'))[0] ?? null,
    references: idsIn(first('references')),
  };
}

/** First body part of this type that is not an attachment, searching depth-first. */
function findPart(part: GmailMessagePart | undefined, mimeType: string): GmailMessagePart | null {
  if (part === undefined) return null;
  if (
    part.mimeType?.toLowerCase() === mimeType &&
    (part.filename ?? '') === '' &&
    part.body?.data !== undefined
  ) {
    return part;
  }
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found !== null) return found;
  }
  return null;
}

function decodeBody(part: GmailMessagePart): string {
  return Buffer.from(part.body?.data ?? '', 'base64url').toString('utf8');
}
