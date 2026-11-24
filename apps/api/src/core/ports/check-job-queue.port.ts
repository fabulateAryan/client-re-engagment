import type { Platform } from '../domain';

/** One account to check, as one queued job. */
export interface CheckJob {
  readonly runId: string;
  readonly clientId: string;
  readonly platform: Platform;
}

export interface JobAttempt {
  /** 1 for the first try. */
  readonly number: number;
  /** True when a failure now will not be retried. */
  readonly isLast: boolean;
}

/** Throw to have the job retried (with backoff) if it has attempts left. */
export type CheckJobHandler = (job: CheckJob, attempt: JobAttempt) => Promise<void>;

export interface JobQueueStats {
  /** "bullmq" (Redis) or "in-process". */
  readonly driver: string;
  readonly concurrency: number;
  readonly attempts: number;
  readonly waiting: number;
  readonly active: number;
  /** Waiting to be retried. */
  readonly delayed: number;
  readonly completed: number;
  readonly failed: number;
}

/**
 * The job queue for account checks. Jobs are run by up to `concurrency` workers at once, and a
 * job whose handler throws is retried with growing delays until its attempts run out.
 */
export abstract class CheckJobQueuePort {
  abstract enqueue(jobs: readonly CheckJob[]): Promise<void>;

  /** Start working on jobs. Called once at start-up. */
  abstract process(handler: CheckJobHandler): void;

  abstract stats(): Promise<JobQueueStats>;
}
