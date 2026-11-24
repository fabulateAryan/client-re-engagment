import { NotImplementedYetError } from '../domain';
import type { EngagementOpportunity } from '../domain';
import type { ClockPort } from '../ports';
import type { PrioritisedSignal } from './prioritise-signals.use-case';

/**
 * Phase 3. Turns the best prioritised signals into EngagementOpportunity records with
 * status NEW, ready for drafting.
 *
 * Open: which signals qualify (threshold, top N, per-client limits), how opportunity ids
 * are generated, and where opportunities are persisted (no port exists for that yet).
 */
export class SignalToEngageUseCase {
  constructor(private readonly clock: ClockPort) {}

  /**
   * @param prioritised Output of PrioritiseSignalsUseCase for one client.
   * @returns The opportunities created, each with status NEW and createdAt from the clock.
   */
  execute(prioritised: readonly PrioritisedSignal[]): Promise<EngagementOpportunity[]> {
    void prioritised;
    return Promise.reject(new NotImplementedYetError('SignalToEngageUseCase', 'Phase 3'));
  }
}
