import { DraftSentVia, threadOf } from '../../../core/domain';
import type { EngagementDraft } from '../../../core/domain';
import { DraftRepositoryPort } from '../../../core/ports';

export class InMemoryDraftRepository extends DraftRepositoryPort {
  protected readonly bySignal = new Map<string, EngagementDraft>();

  get(signalId: string): Promise<EngagementDraft | null> {
    return Promise.resolve(this.bySignal.get(signalId) ?? null);
  }

  getMany(signalIds: readonly string[]): Promise<ReadonlyMap<string, EngagementDraft>> {
    const found = new Map<string, EngagementDraft>();
    for (const id of signalIds) {
      const draft = this.bySignal.get(id);
      if (draft !== undefined) found.set(id, draft);
    }
    return Promise.resolve(found);
  }

  findByReplyToken(token: string): Promise<EngagementDraft | null> {
    for (const draft of this.bySignal.values()) {
      if (draft.replyToken === token) return Promise.resolve(draft);
    }
    return Promise.resolve(null);
  }

  findByMessageId(messageId: string): Promise<EngagementDraft | null> {
    const wanted = messageId.toLowerCase();
    for (const draft of this.bySignal.values()) {
      if (threadOf(draft).some((m) => m.messageId.toLowerCase() === wanted)) {
        return Promise.resolve(draft);
      }
    }
    return Promise.resolve(null);
  }

  listEmailed(): Promise<EngagementDraft[]> {
    return Promise.resolve(
      [...this.bySignal.values()].filter((d) => d.sentVia === DraftSentVia.SENDGRID),
    );
  }

  save(draft: EngagementDraft): Promise<void> {
    this.bySignal.set(draft.signalId, draft);
    return Promise.resolve();
  }

  /** Replace everything (used when loading from storage at start-up). */
  protected restore(drafts: readonly EngagementDraft[]): void {
    this.bySignal.clear();
    for (const draft of drafts) this.bySignal.set(draft.signalId, draft);
  }
}
