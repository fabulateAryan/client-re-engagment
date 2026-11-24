import { Logger } from '@nestjs/common';
import {
  SignalSourceError,
  SignalSourceFailure,
  SignalType,
  classifySignalContent,
  isActivitySignalType,
} from '../../../core/domain';
import type { Client, Platform, Signal } from '../../../core/domain';
import type { ClockPort } from '../../../core/ports';
import { SignalSourcePort } from '../../../core/ports';
import { MonidError } from './monid-http-client';
import type { MonidHttpClient } from './monid-http-client';
import { mapProviderSignalType } from './monid-endpoint-profile';
import type { MonidEndpointProfile } from './monid-endpoint-profile';

/**
 * Signals for one platform via one Monid endpoint (LinkedIn posts, news articles, etc.).
 * Logs counts and failure kinds only, never handles or content.
 */
export class MonidSignalSource extends SignalSourcePort {
  readonly platform: Platform;
  private readonly logger: Logger;

  constructor(
    private readonly client: MonidHttpClient,
    private readonly profile: MonidEndpointProfile,
    private readonly clock: ClockPort,
    /** Testing: keep only this many newest items per check. Null keeps everything. */
    private readonly maxItems: number | null = null,
  ) {
    super();
    this.platform = profile.platform;
    this.logger = new Logger(`MonidSignalSource:${profile.platform}`);
  }

  async fetchSignals(client: Client, since: Date | null): Promise<Signal[]> {
    const handle = client.socialHandles[this.platform];
    if (handle === undefined || handle.trim() === '') return [];

    let output;
    try {
      const run = await this.client.runAndWait(
        this.profile.provider,
        this.profile.endpoint,
        this.profile.buildInput(handle.trim(), since, this.maxItems),
      );
      output = run.output;
    } catch (error) {
      const sourceError = this.toSourceError(error);
      this.logger.warn(`client=${client.id} failed: ${sourceError.failure}`);
      throw sourceError;
    }

    const problem = this.profile.outputProblem?.(output) ?? null;
    if (problem !== null) {
      this.logger.warn(`client=${client.id} unusable output: ${problem}`);
      throw new SignalSourceError(this.platform, SignalSourceFailure.BAD_RESPONSE, problem);
    }

    const items = this.profile.extractItems(output);
    const collectedAt = this.clock.now();
    const signals: Signal[] = [];
    let skipped = 0;
    for (const item of items) {
      if (this.profile.keepItem !== undefined && !this.profile.keepItem(item, handle.trim())) {
        skipped += 1;
        continue;
      }
      const mapped = this.profile.mapItem(item);
      if (mapped === null) {
        skipped += 1;
        continue;
      }
      if (since !== null && mapped.publishedAt <= since) continue;
      signals.push({
        id: `${this.platform}:${mapped.externalId}`,
        clientId: client.id,
        platform: this.platform,
        signalType: this.signalTypeFor(mapped.providerType, mapped.content),
        content: mapped.content,
        url: mapped.url,
        externalId: mapped.externalId,
        publishedAt: mapped.publishedAt,
        collectedAt,
        raw: this.profile.minimiseRaw(item),
      });
    }

    const kept =
      this.maxItems === null
        ? signals
        : [...signals]
            .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
            .slice(0, this.maxItems);
    this.logger.log(
      `client=${client.id} items=${items.length} signals=${kept.length} skipped=${skipped}` +
        (kept.length < signals.length ? ` capped=${signals.length - kept.length}` : ''),
    );
    return kept;
  }

  /**
   * The provider's own type wins, except that a news item (company announcement) whose text
   * shows brand activity takes that activity type (ENG-231 section 4). When the provider
   * gives no type we can map, the text decides before the profile's default.
   */
  private signalTypeFor(providerType: string | null, content: string): SignalType {
    const mapped = mapProviderSignalType(providerType, this.profile);
    const found = classifySignalContent(content);
    if (mapped !== this.profile.defaultType) {
      const activity = found !== null && isActivitySignalType(found);
      return mapped === SignalType.COMPANY_ANNOUNCEMENT && activity ? found : mapped;
    }
    return found ?? mapped;
  }

  private toSourceError(error: unknown): SignalSourceError {
    if (error instanceof MonidError) {
      return new SignalSourceError(this.platform, FAILURE_MAP[error.failure], error.message);
    }
    return new SignalSourceError(
      this.platform,
      SignalSourceFailure.UNAVAILABLE,
      'unexpected error',
    );
  }
}

const FAILURE_MAP: Record<MonidError['failure'], SignalSourceFailure> = {
  TIMEOUT: SignalSourceFailure.TIMEOUT,
  RATE_LIMITED: SignalSourceFailure.RATE_LIMITED,
  BAD_RESPONSE: SignalSourceFailure.BAD_RESPONSE,
  UNAVAILABLE: SignalSourceFailure.UNAVAILABLE,
  NOT_AUTHORISED: SignalSourceFailure.NOT_AUTHORISED,
  INSUFFICIENT_CREDIT: SignalSourceFailure.INSUFFICIENT_CREDIT,
};
