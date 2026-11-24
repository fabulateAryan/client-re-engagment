import type { Client, Platform, Signal } from '../domain';

/**
 * Collects signals for one platform (LinkedIn via Monit, Instagram, TikTok, Google RSS...).
 * Several implementations are registered at once; the core never depends on a specific one.
 */
export abstract class SignalSourcePort {
  /** The platform this source collects from. Used to match sources to a client's handles. */
  abstract readonly platform: Platform;

  /**
   * Fetch signals for the client's handle on this platform.
   *
   * @param since Only signals published after this time are wanted. `null` means the
   *   platform has never been checked for this client; how far back to look is then
   *   up to the source (see open questions in README).
   * @throws Any error. The caller records it and carries on with other sources.
   */
  abstract fetchSignals(client: Client, since: Date | null): Promise<Signal[]>;
}
