import type { Client, Platform, Signal } from '../../../core/domain';
import { SignalSourcePort } from '../../../core/ports';

export interface FakeSignalSourceOptions {
  readonly platform: Platform;
  /** Canned signals. Returned for the matching client, filtered by `since`. */
  readonly signals?: readonly Signal[];
  /** When set, every fetch rejects with this error. */
  readonly failWith?: Error;
}

/** Stand-in for a real platform adapter. Records each call for assertions. */
export class FakeSignalSource extends SignalSourcePort {
  readonly platform: Platform;
  readonly calls: { clientId: string; since: Date | null }[] = [];
  private readonly signals: readonly Signal[];
  private readonly failWith: Error | undefined;

  constructor(options: FakeSignalSourceOptions) {
    super();
    this.platform = options.platform;
    this.signals = options.signals ?? [];
    this.failWith = options.failWith;
  }

  fetchSignals(client: Client, since: Date | null): Promise<Signal[]> {
    this.calls.push({ clientId: client.id, since });
    if (this.failWith !== undefined) {
      return Promise.reject(this.failWith);
    }
    const matching = this.signals.filter(
      (signal) =>
        signal.clientId === client.id &&
        signal.platform === this.platform &&
        (since === null || signal.publishedAt > since),
    );
    return Promise.resolve(matching);
  }
}
