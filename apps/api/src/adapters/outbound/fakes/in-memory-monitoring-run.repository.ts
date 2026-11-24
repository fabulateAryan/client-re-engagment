import { MonitoringRunStatus } from '../../../core/domain';
import type {
  ActiveCheck,
  MonitoringCheck,
  MonitoringRun,
  NewMonitoringRun,
} from '../../../core/domain';
import { MonitoringRunRepositoryPort } from '../../../core/ports';

interface StoredRun {
  meta: NewMonitoringRun & { status: MonitoringRunStatus; finishedAt: Date | null };
  /** Keyed by account, so a retried job replaces its earlier result. */
  checks: Map<string, MonitoringCheck>;
  active: Map<string, ActiveCheck>;
}

const accountKey = (c: { clientId: string; platform: string }): string =>
  `${c.clientId}|${c.platform}`;

/** Runs kept in this process. Lost on restart; used without Redis and in tests. */
export class InMemoryMonitoringRunRepository extends MonitoringRunRepositoryPort {
  private readonly runs = new Map<string, StoredRun>();

  create(run: NewMonitoringRun): Promise<MonitoringRun> {
    const stored: StoredRun = {
      meta: { ...run, status: MonitoringRunStatus.RUNNING, finishedAt: null },
      checks: new Map(),
      active: new Map(),
    };
    this.runs.set(run.id, stored);
    return Promise.resolve(toRun(stored));
  }

  get(id: string): Promise<MonitoringRun | null> {
    const stored = this.runs.get(id);
    return Promise.resolve(stored === undefined ? null : toRun(stored));
  }

  listRecent(limit: number): Promise<MonitoringRun[]> {
    // Newest first; runs started in the same millisecond keep the later one first.
    const newestFirst = [...this.runs.values()]
      .reverse()
      .sort((a, b) => b.meta.startedAt.getTime() - a.meta.startedAt.getTime());
    return Promise.resolve(newestFirst.slice(0, limit).map(toRun));
  }

  markCheckStarted(runId: string, check: ActiveCheck): Promise<void> {
    this.runs.get(runId)?.active.set(accountKey(check), check);
    return Promise.resolve();
  }

  recordCheck(runId: string, check: MonitoringCheck): Promise<number> {
    const stored = this.runs.get(runId);
    if (stored === undefined) return Promise.resolve(0);
    stored.checks.set(accountKey(check), check);
    stored.active.delete(accountKey(check));
    return Promise.resolve(stored.checks.size);
  }

  finish(runId: string, finishedAt: Date, status: MonitoringRunStatus): Promise<void> {
    const stored = this.runs.get(runId);
    if (stored !== undefined && stored.meta.status === MonitoringRunStatus.RUNNING) {
      stored.meta = { ...stored.meta, status, finishedAt };
      stored.active.clear();
    }
    return Promise.resolve();
  }
}

function toRun(stored: StoredRun): MonitoringRun {
  return {
    ...stored.meta,
    checks: [...stored.checks.values()].sort(
      (a, b) => a.startedAt.getTime() - b.startedAt.getTime(),
    ),
    active: [...stored.active.values()],
  };
}
