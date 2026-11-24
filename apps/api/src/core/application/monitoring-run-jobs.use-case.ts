import { MonitoringRunInProgressError, MonitoringRunStatus, newRunId } from '../domain';
import type { MonitoringCheck, MonitoringRun, MonitoringTrigger } from '../domain';
import type {
  CheckJob,
  CheckJobQueuePort,
  ClientRepositoryPort,
  ClockPort,
  JobAttempt,
  MonitoringLockPort,
  MonitoringRunRepositoryPort,
} from '../ports';
import type { MonitorClientsUseCase, MonitorOptions } from './monitor-clients.use-case';

/**
 * How long the run lock lasts without progress. Every finished check renews it, so it only
 * runs out when nothing has happened for this long (e.g. every worker crashed).
 */
export const RUN_LOCK_TTL_MS = 15 * 60 * 1000;

/**
 * Starts a monitoring run: works out which accounts to check, stores the run, and queues one
 * job per account. It returns at once; workers do the checking (RunCheckJobUseCase).
 *
 * Only one run may be going at a time, across every API instance (MonitoringLockPort).
 */
export class StartMonitoringRunUseCase {
  constructor(
    private readonly monitor: MonitorClientsUseCase,
    private readonly runs: MonitoringRunRepositoryPort,
    private readonly lock: MonitoringLockPort,
    private readonly queue: CheckJobQueuePort,
    private readonly clock: ClockPort,
  ) {}

  /** @throws MonitoringRunInProgressError when a run is already going. */
  async execute(trigger: MonitoringTrigger, options: MonitorOptions = {}): Promise<MonitoringRun> {
    const startedAt = this.clock.now();
    const id = newRunId(startedAt);
    if (!(await this.lock.acquire(id, RUN_LOCK_TTL_MS))) {
      throw new MonitoringRunInProgressError();
    }

    try {
      const plan = await this.monitor.plan(options);
      const withAccounts = plan.filter((entry) => entry.platforms.length > 0);
      const jobs: CheckJob[] = withAccounts.flatMap(({ client, platforms }) =>
        platforms.map((platform) => ({ runId: id, clientId: client.id, platform })),
      );

      const run = await this.runs.create({
        id,
        trigger,
        startedAt,
        clientIds: options.clientIds === undefined ? null : [...options.clientIds],
        clientsChecked: withAccounts.length,
        // Brands with no handles at all (not brands whose accounts are all up to date).
        clientsSkipped: plan.filter((e) => e.platforms.length + e.upToDate.length === 0).length,
        accountsUpToDate: plan.reduce((sum, e) => sum + e.upToDate.length, 0),
        totalChecks: jobs.length,
      });

      if (jobs.length === 0) {
        await this.runs.finish(id, this.clock.now(), MonitoringRunStatus.COMPLETED);
        await this.lock.release(id);
        return (await this.runs.get(id)) ?? run;
      }

      await this.queue.enqueue(jobs);
      return run;
    } catch (error) {
      // Nothing (or not everything) was queued: close the run so monitoring is not blocked.
      await this.runs.finish(id, this.clock.now(), MonitoringRunStatus.INTERRUPTED).catch(() => {});
      await this.lock.release(id).catch(() => {});
      throw error;
    }
  }
}

/**
 * Handles one queued job: checks one account, stores the result on its run, and closes the
 * run when it was the last account. A failed check is thrown back to the queue so it is
 * retried; on the last attempt the failure is stored instead, so the run still finishes.
 */
export class RunCheckJobUseCase {
  constructor(
    private readonly monitor: MonitorClientsUseCase,
    private readonly clients: ClientRepositoryPort,
    private readonly runs: MonitoringRunRepositoryPort,
    private readonly lock: MonitoringLockPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(job: CheckJob, attempt: JobAttempt): Promise<void> {
    const client = await this.clients.getById(job.clientId);
    if (client === null) {
      // Removed after the run was queued: nothing to retry.
      await this.record(
        job,
        this.failedCheck(job, job.clientId, 'This brand was removed.', attempt),
      );
      return;
    }

    let check: MonitoringCheck;
    let retryable = true;
    try {
      await this.runs.markCheckStarted(job.runId, {
        clientId: client.id,
        clientName: client.name,
        platform: job.platform,
        startedAt: this.clock.now(),
        attempt: attempt.number,
      });
      const result = await this.monitor.checkAccount(client, job.platform, attempt.number);
      check = result.check;
      retryable = result.errors.some((e) => e.retryable !== false);
    } catch (error) {
      if (!attempt.isLast) throw error;
      check = this.failedCheck(job, client.name, messageOf(error), attempt);
    }

    if (check.error !== null && retryable && !attempt.isLast) {
      // Let the queue retry it later. Saved signals are de-duplicated, so a retry is safe.
      // Failures that cannot get better (e.g. a wrong handle) are stored straight away.
      throw new Error(check.error);
    }
    await this.record(job, check);
  }

  private async record(job: CheckJob, check: MonitoringCheck): Promise<void> {
    const done = await this.runs.recordCheck(job.runId, check);
    await this.lock.refresh(job.runId, RUN_LOCK_TTL_MS);
    const run = await this.runs.get(job.runId);
    if (run !== null && run.status === MonitoringRunStatus.RUNNING && done >= run.totalChecks) {
      await this.runs.finish(job.runId, this.clock.now(), MonitoringRunStatus.COMPLETED);
      await this.lock.release(job.runId);
    }
  }

  private failedCheck(
    job: CheckJob,
    clientName: string,
    message: string,
    attempt: JobAttempt,
  ): MonitoringCheck {
    const now = this.clock.now();
    return {
      clientId: job.clientId,
      clientName,
      platform: job.platform,
      handle: '',
      startedAt: now,
      finishedAt: now,
      signalsFound: 0,
      newSignalsSaved: 0,
      signalsMissingSource: 0,
      sourceConnected: true,
      error: message,
      attempts: attempt.number,
    };
  }
}

/** The run going on now (if any) and the most recent finished one. */
export class GetMonitoringProgressUseCase {
  constructor(
    private readonly runs: MonitoringRunRepositoryPort,
    private readonly lock: MonitoringLockPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(): Promise<{ current: MonitoringRun | null; last: MonitoringRun | null }> {
    const holder = await this.lock.holder();
    const recent = await this.runs.listRecent(10);
    let current: MonitoringRun | null = null;
    let last: MonitoringRun | null = null;
    for (const run of recent) {
      if (run.status === MonitoringRunStatus.RUNNING) {
        if (run.id === holder) {
          current ??= run;
          continue;
        }
        // Its lock ran out with checks unfinished (e.g. every worker crashed): close it.
        await this.runs.finish(run.id, this.clock.now(), MonitoringRunStatus.INTERRUPTED);
        last ??= { ...run, status: MonitoringRunStatus.INTERRUPTED };
        continue;
      }
      last ??= run;
    }
    return { current, last };
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
