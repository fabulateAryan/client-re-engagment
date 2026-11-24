import { NotImplementedYetError } from '../domain';
import type { Signal } from '../domain';
import type { CampaignHistoryPort, ClientRepositoryPort, SignalRepositoryPort } from '../ports';

/** A stored signal with the score and reason assigned by prioritisation. */
export interface PrioritisedSignal {
  readonly signal: Signal;
  readonly score: number;
  readonly reason: string;
}

/**
 * Phase 3. Ranks a client's unprocessed signals by how worth reacting to they are.
 *
 * Intended inputs: the client (including lastActiveDate), their unprocessed signals and
 * their past campaigns. The scoring rules are not defined yet (see README open questions),
 * so no logic is implemented here.
 */
export class PrioritiseSignalsUseCase {
  constructor(
    private readonly clients: ClientRepositoryPort,
    private readonly signals: SignalRepositoryPort,
    private readonly campaigns: CampaignHistoryPort,
  ) {}

  /**
   * @param clientId The client whose unprocessed signals should be ranked.
   * @returns Signals with a score and reason, highest score first.
   * @throws ClientNotFoundError when the client does not exist (once implemented).
   */
  execute(clientId: string): Promise<PrioritisedSignal[]> {
    void clientId;
    return Promise.reject(new NotImplementedYetError('PrioritiseSignalsUseCase', 'Phase 3'));
  }
}
