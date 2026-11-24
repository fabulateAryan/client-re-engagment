import type {
  ActiveCheck,
  MonitoringCheck,
  MonitoringRun,
  MonitoringRunStatus,
  NewMonitoringRun,
} from '../domain';

/**
 * Stores runs while their jobs are worked on, and afterwards as history. Several workers
 * record checks for the same run at once, so every write must be safe to run concurrently,
 * and recording the same check twice (a retried job) must count once.
 */
export abstract class MonitoringRunRepositoryPort {
  /** Store a run that has just been queued. Its status is RUNNING. */
  abstract create(run: NewMonitoringRun): Promise<MonitoringRun>;

  abstract get(id: string): Promise<MonitoringRun | null>;

  /** Most recent runs first. */
  abstract listRecent(limit: number): Promise<MonitoringRun[]>;

  /** A worker has started (or retried) this account. */
  abstract markCheckStarted(runId: string, check: ActiveCheck): Promise<void>;

  /**
   * Store a finished check (replacing any earlier result for the same account) and clear it
   * from the active list. Returns how many different accounts now have a result.
   */
  abstract recordCheck(runId: string, check: MonitoringCheck): Promise<number>;

  /** Close a run. Doing it again changes nothing. */
  abstract finish(runId: string, finishedAt: Date, status: MonitoringRunStatus): Promise<void>;
}
