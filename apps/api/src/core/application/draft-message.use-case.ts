import { NotImplementedYetError } from '../domain';
import type { EngagementOpportunity } from '../domain';
import type {
  CampaignHistoryPort,
  ClientRepositoryPort,
  MessagePort,
  NotifierPort,
} from '../ports';

export interface DraftForReview {
  readonly opportunityId: string;
  readonly draft: string;
}

/**
 * Phase 3/4. Drafts a re-engagement message for an opportunity and sends it to a person
 * for review. The message is never emailed to the client from here: a reviewer approves it
 * first (status APPROVED, then SENT).
 */
export class DraftMessageUseCase {
  constructor(
    private readonly clients: ClientRepositoryPort,
    private readonly campaigns: CampaignHistoryPort,
    private readonly messages: MessagePort,
    private readonly notifier: NotifierPort,
  ) {}

  /**
   * Loads the client and their campaigns, drafts via MessagePort, then calls
   * NotifierPort.sendForReview.
   *
   * @throws ClientNotFoundError when the opportunity's client does not exist (once implemented).
   */
  execute(opportunity: EngagementOpportunity): Promise<DraftForReview> {
    void opportunity;
    return Promise.reject(new NotImplementedYetError('DraftMessageUseCase', 'Phase 3/4'));
  }
}
