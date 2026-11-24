import type { Campaign } from '../../../core/domain';
import { CampaignHistoryPort } from '../../../core/ports';

export class InMemoryCampaignHistory extends CampaignHistoryPort {
  constructor(private readonly campaigns: readonly Campaign[] = []) {
    super();
  }

  listForClient(clientId: string): Promise<Campaign[]> {
    return Promise.resolve(this.campaigns.filter((campaign) => campaign.clientId === clientId));
  }
}
