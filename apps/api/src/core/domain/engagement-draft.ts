import { SignalType } from './signal-type';

/** Who wrote a draft's first version. */
export enum DraftSource {
  /** Built-in template. Uses only facts from the signal; no data leaves the app. */
  TEMPLATE = 'TEMPLATE',
  /** Claude, through the Anthropic API. Opt-in, because the post text is sent to Anthropic. */
  CLAUDE = 'CLAUDE',
}

/** How a sent draft went out. */
export enum DraftSentVia {
  /** The rep sent it from their own mailbox and marked it as sent. */
  MANUAL = 'MANUAL',
  /** The rep pressed Send and the app emailed it through SendGrid. */
  SENDGRID = 'SENDGRID',
}

/**
 * A suggested engagement message for one signal. A person reviews and edits it, then either
 * sends it from their own mailbox and marks it as sent, or presses Send to email it through
 * SendGrid. Nothing is sent without a person pressing Send.
 */
export interface EngagementDraft {
  readonly signalId: string;
  readonly subject: string;
  readonly text: string;
  /** Email address the rep is writing to, or `null` if not entered yet. */
  readonly recipient: string | null;
  readonly source: DraftSource;
  readonly createdAt: Date;
  /** When a person last saved changes, or `null` if never edited. */
  readonly editedAt: Date | null;
  /** When it was sent (or marked as sent), or `null` if not sent yet. */
  readonly sentAt: Date | null;
  /** How it went out, or `null` if not sent yet. */
  readonly sentVia: DraftSentVia | null;
  /**
   * The email conversation, oldest first: the outreach email, follow-ups and replies.
   * Only kept for emails sent from the app. Missing on drafts saved before threads existed.
   */
  readonly thread?: readonly ThreadMessage[];
  /** Random token in this thread's Reply-To address, used to match replies. */
  readonly replyToken?: string | null;
}

/** Which way a message in a thread went. */
export enum ThreadDirection {
  /** Emailed from the app (outreach or follow-up). */
  OUTBOUND = 'OUTBOUND',
  /** A reply received through SendGrid Inbound Parse. */
  INBOUND = 'INBOUND',
}

/** One email in an outreach thread. */
export interface ThreadMessage {
  /** RFC 5322 Message-ID without angle brackets, e.g. "abc123@example.com". */
  readonly messageId: string;
  readonly direction: ThreadDirection;
  readonly from: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly at: Date;
}

/** The thread of a draft (empty for drafts that were never emailed from the app). */
export function threadOf(draft: EngagementDraft): readonly ThreadMessage[] {
  return draft.thread ?? [];
}

/** Subject for a follow-up in the same thread: "Re: <subject>", without doubling "Re:". */
export function replySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
}

/**
 * The new part of a reply, without the quoted earlier messages most email apps add below it
 * ("On ... wrote:", "-----Original Message-----", Outlook's "From: ..." block, "> " lines).
 * Returns the whole text when nothing would be left.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const next = lines[i + 1] ?? '';
    const trimmed = line.trim();
    // Gmail and Apple Mail, sometimes wrapped over two lines.
    if (/^On .+wrote:$/i.test(trimmed) || (/^On .+/i.test(trimmed) && /wrote:$/i.test(next.trim())))
      break;
    if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(trimmed)) break;
    if (/^_{10,}$/.test(trimmed)) break;
    // Outlook: a "From:" line followed by "Sent:" or "Date:".
    if (/^From:\s/i.test(trimmed) && /^(Sent|Date):\s/i.test(next.trim())) break;
    if (trimmed.startsWith('>')) continue;
    kept.push(line);
  }
  const result = kept.join('\n').trim();
  return result === '' ? text.trim() : result;
}

export const MAX_SUBJECT_LENGTH = 200;

/** Default email subject, by what the signal is about. A person can change it. */
export function subjectFor(brandName: string, type: SignalType): string {
  switch (type) {
    case SignalType.CAMPAIGN_LAUNCH:
      return `Creators for ${brandName}'s new campaign`;
    case SignalType.PRODUCT_LAUNCH:
      return `Creators for ${brandName}'s new launch`;
    default:
      return `Creator content ideas for ${brandName}`;
  }
}

/** A plain single email address, as typed into a "To" field. */
export function isEmailAddress(value: string): boolean {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value) && value.length <= 254;
}

/** Longest draft a person may save. Messages this long are already too long to send. */
export const MAX_DRAFT_LENGTH = 4000;
