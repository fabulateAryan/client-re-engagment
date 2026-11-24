/**
 * Everything that depends on WHICH Monid endpoint supplies a platform's data lives here.
 *
 * Monid is a gateway to many providers. The input schema and output shape are those of the
 * chosen endpoint (find one with `pnpm monid discover`). A profile translates between that
 * endpoint and our domain, so swapping endpoints never touches the source, client or core.
 */
import type { JsonObject, JsonValue, Platform, SignalType } from '../../../core/domain';

/** The parts of one provider item the source needs. */
export interface MappedItem {
  readonly externalId: string;
  readonly providerType: string | null;
  readonly content: string;
  readonly url: string;
  readonly publishedAt: Date;
}

export interface MonidEndpointProfile {
  /** Which of our platforms this endpoint feeds (e.g. LINKEDIN, or GOOGLE_RSS for news). */
  readonly platform: Platform;
  readonly provider: string;
  readonly endpoint: string;
  /**
   * Provider type label (lower case) -> our SignalType. Unknown or missing labels fall back
   * to `defaultType`. Filled in from the endpoint's real values, never guessed.
   */
  readonly typeMap: Readonly<Record<string, SignalType>>;
  readonly defaultType: SignalType;
  /**
   * Build the endpoint's `input` for one handle (profile URL, search term, etc.).
   * `maxItems` (testing) asks for fewer items where the endpoint supports a limit.
   */
  buildInput(handle: string, since: Date | null, maxItems?: number | null): JsonObject;
  /**
   * Explain why a completed run's output is unusable (e.g. "page not found"), or return
   * `null` when it is fine. Reported as a source error rather than silently returning nothing.
   */
  outputProblem?(output: JsonValue | null): string | null;
  /** Pull the list of items out of the run `output`. `null` output means "no match". */
  extractItems(output: JsonValue | null): JsonObject[];
  /** Map one item, or return `null` to skip items missing required fields. */
  mapItem(item: JsonObject): MappedItem | null;
  /**
   * Optional per-client relevance filter, given the client's handle (e.g. keywords that
   * must appear). Items returning false are skipped.
   */
  keepItem?(item: JsonObject, handle: string): boolean;
  /**
   * Reduce the stored payload to what we need (Privacy Act: collect only what is necessary).
   * Use an explicit allow-list of fields.
   */
  minimiseRaw(item: JsonObject): JsonObject;
}

export function mapProviderSignalType(
  providerType: string | null,
  profile: Pick<MonidEndpointProfile, 'typeMap' | 'defaultType'>,
): SignalType {
  if (providerType === null) return profile.defaultType;
  return profile.typeMap[providerType.trim().toLowerCase()] ?? profile.defaultType;
}
