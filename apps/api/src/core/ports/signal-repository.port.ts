import type { Signal } from '../domain';

export abstract class SignalRepositoryPort {
  /**
   * Store signals, ignoring any whose platform + externalId is already stored
   * (or repeated within the same batch).
   *
   * @returns only the signals that were newly saved.
   */
  abstract saveMany(signals: readonly Signal[]): Promise<Signal[]>;

  /**
   * Mark a signal as skipped at the given time, or back to "to review" with `null` (story 8b).
   * A skipped signal stays skipped when a later run fetches it again.
   *
   * @returns `false` if no signal has this id.
   */
  abstract setSkipped(signalId: string, skippedAt: Date | null): Promise<boolean>;

  /** Signals for the client that have not yet been through prioritisation. */
  abstract listUnprocessed(clientId: string): Promise<Signal[]>;
}
