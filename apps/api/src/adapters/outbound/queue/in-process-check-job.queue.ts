import type { CheckJob, CheckJobHandler, JobQueueStats } from '../../../core/ports';
import { CheckJobQueuePort } from '../../../core/ports';
import type { JobQueueSettings } from './job-queue-settings';
import { retryDelayMs } from './job-queue-settings';

interface Pending {
  readonly job: CheckJob;
  readonly attempt: number;
}

/**
 * A job queue inside this process, with the same rules as the BullMQ one: limited
 * concurrency, retries with exponential backoff, then give up. Jobs are lost if the process
 * stops, so it is for development and tests; set REDIS_URL to use BullMQ instead.
 */
export class InProcessCheckJobQueue extends CheckJobQueuePort {
  private handler: CheckJobHandler | null = null;
  private readonly waiting: Pending[] = [];
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private running = 0;
  private completed = 0;
  private failed = 0;
  private idleWaiters: (() => void)[] = [];

  constructor(private readonly settings: JobQueueSettings) {
    super();
  }

  enqueue(jobs: readonly CheckJob[]): Promise<void> {
    for (const job of jobs) this.waiting.push({ job, attempt: 1 });
    this.pump();
    return Promise.resolve();
  }

  process(handler: CheckJobHandler): void {
    this.handler = handler;
    this.pump();
  }

  stats(): Promise<JobQueueStats> {
    return Promise.resolve({
      driver: 'in-process',
      concurrency: this.settings.concurrency,
      attempts: this.settings.attempts,
      waiting: this.waiting.length,
      active: this.running,
      delayed: this.timers.size,
      completed: this.completed,
      failed: this.failed,
    });
  }

  /** Resolves once nothing is waiting, running or due for a retry (for tests). */
  whenIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  /** Stop retry timers (on shutdown). */
  onModuleDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private pump(): void {
    while (this.handler !== null && this.running < this.settings.concurrency) {
      const next = this.waiting.shift();
      if (next === undefined) break;
      this.running += 1;
      void this.run(this.handler, next);
    }
    if (this.isIdle()) {
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      for (const resolve of waiters) resolve();
    }
  }

  private async run(handler: CheckJobHandler, { job, attempt }: Pending): Promise<void> {
    const isLast = attempt >= this.settings.attempts;
    try {
      await handler(job, { number: attempt, isLast });
      this.completed += 1;
    } catch {
      if (isLast) {
        this.failed += 1;
      } else {
        const timer = setTimeout(
          () => {
            this.timers.delete(timer);
            this.waiting.push({ job, attempt: attempt + 1 });
            this.pump();
          },
          retryDelayMs(this.settings, attempt),
        );
        this.timers.add(timer);
      }
    } finally {
      this.running -= 1;
      this.pump();
    }
  }

  private isIdle(): boolean {
    return this.waiting.length === 0 && this.running === 0 && this.timers.size === 0;
  }
}
