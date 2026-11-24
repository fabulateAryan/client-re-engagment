import type { MonitoringRun } from '../domain';
import type { MonitoringRunRepositoryPort } from '../ports';

export class ListMonitoringRunsUseCase {
  constructor(private readonly runs: MonitoringRunRepositoryPort) {}

  /** Most recent runs first. */
  execute(limit: number): Promise<MonitoringRun[]> {
    return this.runs.listRecent(limit);
  }
}
