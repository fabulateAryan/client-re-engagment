import type { EngagementDraft } from '../domain';

/** Stores the current draft for each signal (one per signal). */
export abstract class DraftRepositoryPort {
  abstract get(signalId: string): Promise<EngagementDraft | null>;

  /** Drafts for the given signals, keyed by signal id. Signals without one are absent. */
  abstract getMany(signalIds: readonly string[]): Promise<ReadonlyMap<string, EngagementDraft>>;

  /** The draft whose thread uses this Reply-To token, or null. */
  abstract findByReplyToken(token: string): Promise<EngagementDraft | null>;

  /** The draft whose thread contains an email with this Message-ID, or null. */
  abstract findByMessageId(messageId: string): Promise<EngagementDraft | null>;

  /** Every draft emailed from the app (with a thread), in no particular order. */
  abstract listEmailed(): Promise<EngagementDraft[]>;

  /** Insert or replace the draft for `draft.signalId`. */
  abstract save(draft: EngagementDraft): Promise<void>;
}
