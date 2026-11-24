import type { EngagementOpportunity } from '../domain';

export abstract class NotifierPort {
  /** Hand a draft to a person for review. Nothing is emailed to the client from here. */
  abstract sendForReview(opportunity: EngagementOpportunity, draft: string): Promise<void>;
}
