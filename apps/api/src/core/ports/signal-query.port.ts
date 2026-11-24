import type { Platform, SignalType, StoredSignal } from '../domain';

/** Which signals a list shows: those still to review (default) or those a rep skipped. */
export type SignalListView = 'to_review' | 'skipped';

export interface SignalListQuery {
  readonly clientId?: string;
  readonly platform?: Platform;
  readonly signalType?: SignalType;
  /** Defaults to `to_review`. */
  readonly view?: SignalListView;
  /** Only signals collected at or after this time (e.g. what one run found). */
  readonly collectedSince?: Date;
  /** 1-based. */
  readonly page: number;
  readonly pageSize: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface SignalSummary {
  readonly total: number;
  readonly byPlatform: Readonly<Partial<Record<Platform, number>>>;
  readonly bySignalType: Readonly<Partial<Record<SignalType, number>>>;
  readonly latestPublishedAt: Date | null;
  /** Signals scoring below this are hidden from lists and totals (0 = none hidden). */
  readonly minScore: number;
  /** Posts older than this many days are hidden (0 = no limit). */
  readonly maxAgeDays: number;
}

/** Read side for stored signals. Kept apart from SignalRepositoryPort so the write port stays small. */
export abstract class SignalQueryPort {
  /** Signals matching the filters, highest `scoreSignal` score first, then newest first. */
  abstract list(query: SignalListQuery): Promise<Page<StoredSignal>>;

  /** @returns the signal, or `null` if none has this id. */
  abstract getById(id: string): Promise<StoredSignal | null>;

  /** Totals across all stored signals. */
  abstract summarise(): Promise<SignalSummary>;
}
