/** How the account-check job queue behaves (from MONITORING_* environment variables). */
export interface JobQueueSettings {
  /** Accounts checked at the same time. */
  readonly concurrency: number;
  /** Tries per job, including the first. */
  readonly attempts: number;
  /** Wait before the first retry; doubled for each retry after that. */
  readonly retryDelayMs: number;
  /** Most checks started per minute across all workers (BullMQ only); null for no limit. */
  readonly maxChecksPerMinute: number | null;
}

/** Exponential backoff: delay, 2 x delay, 4 x delay... after try 1, 2, 3... */
export function retryDelayMs(settings: JobQueueSettings, failedAttempt: number): number {
  return settings.retryDelayMs * 2 ** (failedAttempt - 1);
}
