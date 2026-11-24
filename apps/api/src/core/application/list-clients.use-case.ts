import { DEFAULT_WAITING_PERIOD_DAYS, assessEligibility } from '../domain';
import type { Campaign, Client, EligibilityAssessment } from '../domain';
import type { CampaignHistoryPort, ClientRepositoryPort, ClockPort } from '../ports';

/** A client with its past campaigns, for display. */
export interface ClientView {
  readonly client: Client;
  /** Oldest first; campaigns without a start date come last. */
  readonly campaigns: readonly Campaign[];
  /** Whether the client is ready to contact again (story 3). */
  readonly eligibility: EligibilityAssessment;
  /** Position in the order brands were added: 1 is the oldest, higher is newer. */
  readonly addedOrder: number;
}

export class ListClientsUseCase {
  constructor(
    private readonly clients: ClientRepositoryPort,
    private readonly campaigns: CampaignHistoryPort,
    private readonly clock: ClockPort,
    private readonly waitingPeriodDays: number = DEFAULT_WAITING_PERIOD_DAYS,
  ) {}

  /** Monitored clients, sorted by name, each with their campaign history. */
  async execute(): Promise<ClientView[]> {
    const clients = await this.clients.listActiveClients();
    // The repository lists brands in the order they were added.
    const order = new Map(clients.map((c, index) => [c.id, index + 1]));
    const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));
    const now = this.clock.now();
    return Promise.all(
      sorted.map(async (client) => {
        const campaigns = sortCampaigns(await this.campaigns.listForClient(client.id));
        return {
          client,
          campaigns,
          eligibility: assessEligibility(campaigns, now, this.waitingPeriodDays),
          addedOrder: order.get(client.id) ?? 0,
        };
      }),
    );
  }
}

function sortCampaigns(campaigns: readonly Campaign[]): Campaign[] {
  const time = (c: Campaign): number => c.startDate?.getTime() ?? Number.POSITIVE_INFINITY;
  return [...campaigns].sort((a, b) => time(a) - time(b));
}
