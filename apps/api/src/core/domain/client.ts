import type { Platform } from './platform';
import type { SocialHandles } from './social-handles';

/** When each platform was last successfully checked for this client. Missing means never. */
export type LastCheckedByPlatform = Readonly<Partial<Record<Platform, Date>>>;

export interface Client {
  readonly id: string;
  readonly name: string;
  readonly socialHandles: SocialHandles;
  /**
   * Last date the client was active with us. Input for re-engagement, not used by monitoring.
   * `null` when not recorded, so an unknown date is never shown as a made-up one.
   */
  readonly lastActiveDate: Date | null;
  /**
   * Monitoring bookkeeping, written through ClientRepositoryPort.updateLastChecked.
   * Not in the original field list: added so the use case can read the per-platform
   * "since" time that the repository stores.
   */
  readonly lastCheckedAt: LastCheckedByPlatform;
  /**
   * The client's public profile (e.g. a person's LinkedIn page), for display only.
   * Not monitored: monitoring uses `socialHandles`.
   */
  readonly publicProfile?: PublicProfile | null;
  /** When the brand was added in the app. Missing for brands added before this was recorded. */
  readonly addedAt?: Date | null;
}

export interface PublicProfile {
  readonly url: string;
  readonly headline: string | null;
  readonly location: string | null;
}
