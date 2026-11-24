import type { EngagementOpportunity } from '../../../core/domain';
import { NotifierPort } from '../../../core/ports';

/** Keeps drafts in memory instead of sending them anywhere. */
export class FakeNotifierAdapter extends NotifierPort {
  readonly sent: { opportunity: EngagementOpportunity; draft: string }[] = [];

  sendForReview(opportunity: EngagementOpportunity, draft: string): Promise<void> {
    this.sent.push({ opportunity, draft });
    return Promise.resolve();
  }
}
