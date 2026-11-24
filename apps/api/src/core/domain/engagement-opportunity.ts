import type { OpportunityStatus } from './opportunity-status';

/** A signal judged worth reacting to, waiting for (or past) human review. */
export interface EngagementOpportunity {
  readonly id: string;
  readonly clientId: string;
  readonly signalId: string;
  readonly score: number;
  /** Human-readable explanation of why this signal was chosen. */
  readonly reason: string;
  readonly status: OpportunityStatus;
  readonly createdAt: Date;
}
