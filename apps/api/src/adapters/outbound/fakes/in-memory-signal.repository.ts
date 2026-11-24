import { scoreSignal, signalIdentityKey } from '../../../core/domain';
import type { Platform, Signal, SignalType, StoredSignal } from '../../../core/domain';
import { SignalRepositoryPort } from '../../../core/ports';
import type { Page, SignalListQuery, SignalQueryPort, SignalSummary } from '../../../core/ports';

/**
 * Stores signals keyed by platform + externalId, so duplicates are ignored.
 * Implements both the write port and the read port, like a real database adapter would.
 */
export class InMemorySignalRepository extends SignalRepositoryPort implements SignalQueryPort {
  private readonly byIdentity = new Map<string, Signal>();
  private readonly processedIds = new Set<string>();
  private readonly skippedAtById = new Map<string, Date>();

  /**
   * @param options.minScore Hide signals scoring below this from lists and totals (testing).
   *   They are still stored, so lowering it shows them again.
   */
  constructor(
    private readonly options: {
      readonly minScore?: number;
      /** Hide posts published more than this many days ago (0 or missing: show all). */
      readonly maxAgeDays?: number;
      readonly now?: () => number;
    } = {},
  ) {
    super();
  }

  saveMany(signals: readonly Signal[]): Promise<Signal[]> {
    const saved: Signal[] = [];
    for (const signal of signals) {
      const key = signalIdentityKey(signal);
      if (!this.byIdentity.has(key)) {
        this.byIdentity.set(key, signal);
        saved.push(signal);
      }
    }
    return Promise.resolve(saved);
  }

  setSkipped(signalId: string, skippedAt: Date | null): Promise<boolean> {
    const exists = this.all().some((signal) => signal.id === signalId);
    if (exists) {
      if (skippedAt === null) this.skippedAtById.delete(signalId);
      else this.skippedAtById.set(signalId, skippedAt);
    }
    return Promise.resolve(exists);
  }

  listUnprocessed(clientId: string): Promise<Signal[]> {
    const unprocessed = [...this.byIdentity.values()].filter(
      (signal) => signal.clientId === clientId && !this.processedIds.has(signal.id),
    );
    return Promise.resolve(unprocessed);
  }

  list(query: SignalListQuery): Promise<Page<StoredSignal>> {
    const wantSkipped = query.view === 'skipped';
    const matching = this.visible(this.mostRelevantFirst()).filter(
      (signal) =>
        (query.clientId === undefined || signal.clientId === query.clientId) &&
        (query.platform === undefined || signal.platform === query.platform) &&
        (query.signalType === undefined || signal.signalType === query.signalType) &&
        (query.collectedSince === undefined ||
          signal.collectedAt.getTime() >= query.collectedSince.getTime()) &&
        this.skippedAtById.has(signal.id) === wantSkipped,
    );
    const start = (query.page - 1) * query.pageSize;
    return Promise.resolve({
      items: matching
        .slice(start, start + query.pageSize)
        .map((signal) => ({ ...signal, skippedAt: this.skippedAtById.get(signal.id) ?? null })),
      total: matching.length,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  getById(id: string): Promise<StoredSignal | null> {
    const signal = this.all().find((s) => s.id === id);
    return Promise.resolve(
      signal === undefined ? null : { ...signal, skippedAt: this.skippedAtById.get(id) ?? null },
    );
  }

  summarise(): Promise<SignalSummary> {
    const signals = this.visible(this.newestFirst());
    const byPlatform: Partial<Record<Platform, number>> = {};
    const bySignalType: Partial<Record<SignalType, number>> = {};
    for (const signal of signals) {
      byPlatform[signal.platform] = (byPlatform[signal.platform] ?? 0) + 1;
      bySignalType[signal.signalType] = (bySignalType[signal.signalType] ?? 0) + 1;
    }
    return Promise.resolve({
      total: signals.length,
      byPlatform,
      bySignalType,
      latestPublishedAt: signals[0]?.publishedAt ?? null,
      minScore: this.options.minScore ?? 0,
      maxAgeDays: this.options.maxAgeDays ?? 0,
    });
  }

  /** Put back signals and skips loaded from storage (used by the Redis repository). */
  protected restore(signals: readonly Signal[], skipped: ReadonlyMap<string, Date>): void {
    for (const signal of signals) this.byIdentity.set(signalIdentityKey(signal), signal);
    for (const [id, at] of skipped) this.skippedAtById.set(id, at);
  }

  /** Test and fake helper. The real "processed" mechanism arrives with prioritisation. */
  markProcessed(signalIds: readonly string[]): void {
    signalIds.forEach((id) => this.processedIds.add(id));
  }

  /** Test helper: everything stored, in insertion order. */
  all(): Signal[] {
    return [...this.byIdentity.values()];
  }

  private visible(signals: Signal[]): Signal[] {
    const minScore = this.options.minScore ?? 0;
    const maxAgeDays = this.options.maxAgeDays ?? 0;
    const oldest =
      maxAgeDays > 0
        ? (this.options.now ?? Date.now)() - maxAgeDays * 24 * 60 * 60 * 1000
        : Number.NEGATIVE_INFINITY;
    return signals.filter(
      (s) =>
        s.publishedAt.getTime() >= oldest && (minScore <= 0 || scoreSignal(s).score >= minScore),
    );
  }

  private newestFirst(): Signal[] {
    return this.all().sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
  }

  /** Story 9a: highest score first, then newest first. */
  private mostRelevantFirst(): Signal[] {
    const scores = new Map(this.all().map((s) => [s.id, scoreSignal(s).score]));
    return this.newestFirst().sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));
  }
}
