import type { Campaign } from '../domain';

export abstract class CampaignHistoryPort {
  /** Past campaigns run with the client. */
  abstract listForClient(clientId: string): Promise<Campaign[]>;
}
