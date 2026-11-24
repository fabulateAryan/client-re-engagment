import { DraftSource, Platform, SignalType } from '../../../core/domain';
import type { Campaign } from '../../../core/domain';
import { MessagePort } from '../../../core/ports';
import type { DraftInput } from '../../../core/ports';

const EXCERPT_MAX = 160;

const dateFormat = new Intl.DateTimeFormat('en-AU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Australia/Sydney',
});

/** Opening line, by what the signal is about. */
const OPENERS: Record<SignalType, string> = {
  [SignalType.CAMPAIGN_LAUNCH]: 'Congratulations on the new campaign.',
  [SignalType.PRODUCT_LAUNCH]: 'Congratulations on the launch.',
  [SignalType.CREATOR_CONTENT]: 'Great to see the creator content you are sharing.',
  [SignalType.MARKET_EXPANSION]: 'Congratulations on the expansion.',
  [SignalType.SEASONAL]: 'Great to see your plans for the season.',
  [SignalType.EVENT_PARTNERSHIP]: 'Congratulations on the partnership.',
  [SignalType.COMPANY_ANNOUNCEMENT]: 'Congratulations on the news.',
  [SignalType.HIRING]: 'Great to see the team growing.',
  [SignalType.JOB_CHANGE]: 'Congratulations on the team news.',
  [SignalType.NEW_POST]: 'I enjoyed your recent post.',
  [SignalType.OTHER]: 'I enjoyed your recent post.',
};

/** The ask, by what the signal is about. */
function ask(type: SignalType): string {
  switch (type) {
    case SignalType.CAMPAIGN_LAUNCH:
    case SignalType.PRODUCT_LAUNCH:
      return 'Creators are a great way to get a launch in front of the right audience quickly. Would you be open to a short chat about a creator campaign to support it?';
    case SignalType.HIRING:
    case SignalType.JOB_CHANGE:
      return 'If creator content is on the plan for the months ahead, we would love to help. Would a quick catch-up be useful?';
    default:
      return 'If creators are part of your plans for the months ahead, we would love to help. Would you be open to a quick chat?';
  }
}

/** First sentence of the post, whitespace collapsed, at most EXCERPT_MAX characters. */
export function excerpt(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  const sentence = /^(.+?[.!?])(\s|$)/.exec(flat)?.[1] ?? flat;
  if (sentence.length <= EXCERPT_MAX) return sentence;
  const cut = sentence.slice(0, EXCERPT_MAX);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), EXCERPT_MAX - 20)).trim()}...`;
}

function latestCampaign(campaigns: readonly Campaign[]): Campaign | undefined {
  const time = (c: Campaign): number => (c.endDate ?? c.startDate)?.getTime() ?? -Infinity;
  return [...campaigns].sort((a, b) => time(b) - time(a))[0];
}

/**
 * Builds a draft from a fixed template. Uses only facts in the signal and the brand's own
 * campaign history, never calls an outside service, and always gives the same result for
 * the same input. Australian English, no em dashes.
 */
export class TemplateMessageAdapter extends MessagePort {
  readonly source = DraftSource.TEMPLATE;

  draft({ client, signal, campaigns }: DraftInput): Promise<string> {
    const quote = excerpt(signal.content);
    const date = dateFormat.format(signal.publishedAt);
    const quoted = quote === '' ? '.' : `: "${quote}"`;
    // A LinkedIn post is the brand's own; a news item is written by someone else.
    const reference =
      signal.platform === Platform.LINKEDIN
        ? `${OPENERS[signal.signalType]} I saw your LinkedIn post from ${date}${quoted}`
        : signal.signalType === SignalType.NEW_POST || signal.signalType === SignalType.OTHER
          ? `I came across a recent article from ${date}${quoted}`
          : `${OPENERS[signal.signalType]} I came across a recent article from ${date}${quoted}`;
    const lines = [`Hi ${client.name} team,`, '', reference];
    const past = latestCampaign(campaigns);
    if (past !== undefined) {
      lines.push('', `It was great working with you on ${past.name}.`);
    }
    lines.push('', ask(signal.signalType), '', 'Kind regards,', '[Your name]', 'Fabulate');
    return Promise.resolve(lines.join('\n'));
  }
}
