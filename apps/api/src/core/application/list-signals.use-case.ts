import { SignalNotFoundError } from '../domain';
import type { EngagementDraft, Signal, StoredSignal } from '../domain';
import type {
  ClientRepositoryPort,
  ClockPort,
  DraftRepositoryPort,
  Page,
  SignalListQuery,
  SignalQueryPort,
  SignalRepositoryPort,
  SignalSummary,
} from '../ports';

/** A signal plus the name of the client it belongs to, for display. */
export interface SignalView {
  readonly signal: StoredSignal;
  /** `null` if the client no longer exists. */
  readonly clientName: string | null;
  /** The current engagement draft, or `null` if none has been made. */
  readonly draft: EngagementDraft | null;
}

export class ListSignalsUseCase {
  constructor(
    private readonly signals: SignalQueryPort,
    private readonly clients: ClientRepositoryPort,
    private readonly drafts: DraftRepositoryPort,
  ) {}

  /** Signals matching the filters, most relevant first, each with its client's name. */
  async execute(query: SignalListQuery): Promise<Page<SignalView>> {
    const page = await this.signals.list(query);
    const names = await this.clientNames(page.items);
    const drafts = await this.drafts.getMany(page.items.map((signal) => signal.id));
    return {
      ...page,
      items: page.items.map((signal) => ({
        signal,
        clientName: names.get(signal.clientId) ?? null,
        draft: drafts.get(signal.id) ?? null,
      })),
    };
  }

  private async clientNames(signals: readonly Signal[]): Promise<Map<string, string>> {
    const ids = [...new Set(signals.map((signal) => signal.clientId))];
    const clients = await Promise.all(ids.map((id) => this.clients.getById(id)));
    const names = new Map<string, string>();
    clients.forEach((client) => {
      if (client !== null) names.set(client.id, client.name);
    });
    return names;
  }
}

export class GetSignalSummaryUseCase {
  constructor(private readonly signals: SignalQueryPort) {}

  execute(): Promise<SignalSummary> {
    return this.signals.summarise();
  }
}

/** Story 8b: a rep skips a signal so it leaves their list, or undoes that. */
export class SkipSignalUseCase {
  constructor(
    private readonly signals: SignalRepositoryPort,
    private readonly clock: ClockPort,
  ) {}

  /** @throws SignalNotFoundError when no signal has this id. */
  async skip(signalId: string): Promise<Date> {
    const skippedAt = this.clock.now();
    await this.update(signalId, skippedAt);
    return skippedAt;
  }

  /** @throws SignalNotFoundError when no signal has this id. */
  async undo(signalId: string): Promise<void> {
    await this.update(signalId, null);
  }

  private async update(signalId: string, skippedAt: Date | null): Promise<void> {
    if (!(await this.signals.setSkipped(signalId, skippedAt))) {
      throw new SignalNotFoundError(signalId);
    }
  }
}
