import type { Platform } from './platform';

/** A failure in one client/platform check. The rest of the run carried on. */
export interface MonitoringRunError {
  readonly clientId: string;
  readonly platform: Platform;
  readonly message: string;
  /** Whether trying again later could help (a timeout, not a wrong handle). */
  readonly retryable?: boolean;
}

/** One brand account checked during a run. */
export interface MonitoringCheck {
  readonly clientId: string;
  readonly clientName: string;
  readonly platform: Platform;
  /** The account or site that was checked. */
  readonly handle: string;
  /** When the attempt that produced this result started. */
  readonly startedAt: Date;
  readonly finishedAt: Date;
  readonly signalsFound: number;
  readonly newSignalsSaved: number;
  /** Items dropped because they had no usable source URL (story 4: needs review). */
  readonly signalsMissingSource: number;
  /** False when no source is connected for this platform, so nothing was fetched. */
  readonly sourceConnected: boolean;
  /** The first failure, or null when the check succeeded. */
  readonly error: string | null;
  /** How many tries it took (more than 1 means it was retried). */
  readonly attempts: number;
}

/** A check a worker is doing right now. */
export interface ActiveCheck {
  readonly clientId: string;
  readonly clientName: string;
  readonly platform: Platform;
  readonly startedAt: Date;
  readonly attempt: number;
}

/** Totals for a finished pass over brands, used by the synchronous MonitorClientsUseCase. */
export interface MonitoringRunSummary {
  readonly startedAt: Date;
  readonly finishedAt: Date;
  /** Active clients with at least one social handle. */
  readonly clientsChecked: number;
  /** Active clients skipped because they have no social handles. */
  readonly clientsSkipped: number;
  /** Signals returned by all sources, before de-duplication. */
  readonly signalsFound: number;
  /** Signals that were not already stored. */
  readonly newSignalsSaved: number;
  /** Signals dropped because they had no usable source URL (story 4: needs review). */
  readonly signalsMissingSource: number;
  readonly errors: readonly MonitoringRunError[];
  /** Every account checked, in order. */
  readonly checks: readonly MonitoringCheck[];
  /** The brands asked for, or null for every brand. */
  readonly clientIds: readonly string[] | null;
}

/** What started a run. */
export enum MonitoringTrigger {
  MANUAL = 'MANUAL',
  SCHEDULED = 'SCHEDULED',
}

export enum MonitoringRunStatus {
  /** Jobs are queued or being worked on. */
  RUNNING = 'RUNNING',
  /** Every planned check has a result (some may have failed). */
  COMPLETED = 'COMPLETED',
  /** Stopped before every check finished (e.g. its lock expired after a crash). */
  INTERRUPTED = 'INTERRUPTED',
}

/**
 * A stored run. It is created when the run is queued, and each account check is added as its
 * job finishes. Totals are worked out from the checks (see `summariseRun`).
 */
export interface MonitoringRun {
  readonly id: string;
  readonly trigger: MonitoringTrigger;
  readonly status: MonitoringRunStatus;
  readonly startedAt: Date;
  /** Null while running. */
  readonly finishedAt: Date | null;
  /** The brands asked for, or null for every brand. */
  readonly clientIds: readonly string[] | null;
  readonly clientsChecked: number;
  readonly clientsSkipped: number;
  /** Accounts not checked because they were checked recently (still up to date). */
  readonly accountsUpToDate: number;
  /** How many account checks were queued. */
  readonly totalChecks: number;
  /** Finished checks, in the order they started. */
  readonly checks: readonly MonitoringCheck[];
  /** Checks being worked on right now. */
  readonly active: readonly ActiveCheck[];
}

/** What is stored when a run is queued. */
export type NewMonitoringRun = Pick<
  MonitoringRun,
  | 'id'
  | 'trigger'
  | 'startedAt'
  | 'clientIds'
  | 'clientsChecked'
  | 'clientsSkipped'
  | 'accountsUpToDate'
  | 'totalChecks'
>;

export interface MonitoringRunTotals {
  readonly signalsFound: number;
  readonly newSignalsSaved: number;
  readonly signalsMissingSource: number;
  readonly errors: readonly MonitoringRunError[];
}

export function summariseRun(run: Pick<MonitoringRun, 'checks'>): MonitoringRunTotals {
  let signalsFound = 0;
  let newSignalsSaved = 0;
  let signalsMissingSource = 0;
  const errors: MonitoringRunError[] = [];
  for (const check of run.checks) {
    signalsFound += check.signalsFound;
    newSignalsSaved += check.newSignalsSaved;
    signalsMissingSource += check.signalsMissingSource;
    if (check.error !== null) {
      errors.push({ clientId: check.clientId, platform: check.platform, message: check.error });
    }
  }
  return { signalsFound, newSignalsSaved, signalsMissingSource, errors };
}

/** A new run id. Sortable by time, unique enough for one deployment. */
export function newRunId(now: Date): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `run-${now.getTime().toString(36)}-${random}`;
}
