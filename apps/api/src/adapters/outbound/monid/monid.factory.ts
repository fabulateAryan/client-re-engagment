import type { MonidSettings } from '../../../config';
import type { Platform } from '../../../core/domain';
import type { ClockPort } from '../../../core/ports';
import { MonidHttpClient } from './monid-http-client';
import { findMonidProfile } from './monid-profiles';
import { MonidSignalSource } from './monid-signal.source';

export function createMonidClient(settings: MonidSettings): MonidHttpClient {
  return new MonidHttpClient({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    requestTimeoutMs: settings.requestTimeoutMs,
    maxRetries: settings.maxRetries,
    retryBaseDelayMs: settings.retryBaseDelayMs,
    pollIntervalMs: settings.pollIntervalMs,
    firstPollMs: settings.firstPollMs,
    runTimeoutMs: settings.runTimeoutMs,
  });
}

export interface MonidEndpointChoice {
  readonly provider: string;
  readonly endpoint: string;
}

/** A Monid-backed source for `platform`, using the endpoint chosen in config. */
export function createMonidSource(
  platform: Platform,
  choice: MonidEndpointChoice,
  settings: MonidSettings,
  clock: ClockPort,
): MonidSignalSource {
  const profile = findMonidProfile(platform, choice.provider, choice.endpoint);
  if (profile === null) {
    throw new Error(
      `No ${platform} mapping profile for Monid endpoint "${choice.provider}${choice.endpoint}". ` +
        'Add one in adapters/outbound/monid/monid-profiles.ts, or switch that source back to demo.',
    );
  }
  return new MonidSignalSource(
    createMonidClient(settings),
    profile,
    clock,
    settings.maxPostsPerAccount ?? null,
  );
}
