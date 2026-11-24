import { Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { DraftFailedError, DraftSource, Platform } from '../../../core/domain';
import { MessagePort } from '../../../core/ports';
import type { DraftInput } from '../../../core/ports';

const MODEL = 'claude-opus-5-5';

/**
 * Kept identical across requests so it can be cached. Per-request facts go in the user
 * message.
 */
const SYSTEM_PROMPT = `You write short outreach messages for a sales rep at Fabulate, a creator marketing platform in Australia and Southeast Asia. Fabulate helps brands run campaigns with content creators.

The rep has spotted a recent public post or news item from a brand and wants to start a conversation about working together on creator marketing. You will get the brand name, what the post says, where and when it was published, and how the post was classified.

Write one message the rep can send to the brand's marketing team:
- Open by referring to the specific post in a natural way, so the brand can tell it is not a mass email.
- Connect it to how creators could help with what the post is about, then ask for a short chat.
- Keep it under 120 words, warm and professional, in Australian English. Use plain paragraphs, no headings, no bullet points, no emoji, and no em dashes.
- Only state facts that appear in the post details you are given. Do not invent figures, results, client names, past work together or quotes. If the post is vague, keep the reference general.
- Start with "Hi <brand> team," and end with "Kind regards," then "[Your name]" and "Fabulate" on separate lines.

Reply with the message text only.`;

const dateFormat = new Intl.DateTimeFormat('en-AU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Australia/Sydney',
});

/**
 * Drafts with Claude. Opt-in (MESSAGE_DRAFTER=claude) because the brand name and the post
 * text are sent to Anthropic. Past campaign details are deliberately not sent.
 * Credentials come from the environment (ANTHROPIC_API_KEY or an `ant auth login` profile).
 */
export class ClaudeMessageAdapter extends MessagePort {
  readonly source = DraftSource.CLAUDE;
  private readonly logger = new Logger(ClaudeMessageAdapter.name);

  constructor(private readonly client: Anthropic = new Anthropic()) {
    super();
  }

  async draft({ client, signal }: DraftInput): Promise<string> {
    const details = [
      `Brand: ${client.name}`,
      `Where: ${signal.platform === Platform.LINKEDIN ? 'LinkedIn company post' : 'News article'}`,
      `Published: ${dateFormat.format(signal.publishedAt)}`,
      `Classified as: ${signal.signalType.toLowerCase().replace(/_/g, ' ')}`,
      `Link: ${signal.url}`,
      '',
      'Post text:',
      signal.content,
    ].join('\n');

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        // Short creative writing: low effort keeps it quick and cheap.
        output_config: { effort: 'low' },
        // If the request is declined by a safety classifier, retry on a suitable model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: details }],
      });
    } catch (error) {
      throw new DraftFailedError(describeError(error));
    }

    if (response.stop_reason === 'refusal') {
      throw new DraftFailedError('Claude declined to draft a message for this post.');
    }
    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
    if (response.stop_reason === 'max_tokens' || text === '') {
      throw new DraftFailedError('Claude did not return a complete message. Try again.');
    }
    // Counts only, never content.
    this.logger.log(
      `Drafted with ${response.model}: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out`,
    );
    return text;
  }
}

/** Safe, actionable message for a person. Never includes request content. */
function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return 'Claude is not set up: set ANTHROPIC_API_KEY for the API, or switch MESSAGE_DRAFTER to template.';
  }
  if (error instanceof Anthropic.RateLimitError) {
    return 'Claude is busy right now. Try again in a minute.';
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return 'Could not reach Claude. Check the internet connection and try again.';
  }
  if (error instanceof Anthropic.APIError) {
    return `Claude could not draft this message (HTTP ${String(error.status)}).`;
  }
  return 'Claude could not draft this message.';
}
