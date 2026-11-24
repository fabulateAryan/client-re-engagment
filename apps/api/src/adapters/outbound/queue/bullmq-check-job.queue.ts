import { Logger } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { CheckJob, CheckJobHandler, JobQueueStats } from '../../../core/ports';
import { CheckJobQueuePort } from '../../../core/ports';
import type { JobQueueSettings } from './job-queue-settings';

export const CHECK_QUEUE_NAME = 'monitoring-checks';
const JOB_NAME = 'check-account';

/**
 * The account-check queue on BullMQ (Redis). Jobs survive restarts: a run that was going when
 * the API stopped carries on when it starts again. Every API instance runs a worker, and
 * BullMQ makes sure each job is worked on by one of them.
 */
export class BullMqCheckJobQueue extends CheckJobQueuePort {
  private readonly queue: Queue<CheckJob>;
  private worker: Worker<CheckJob> | null = null;
  private workerConnection: Redis | null = null;
  private readonly logger = new Logger('CheckJobQueue');

  constructor(
    private readonly connection: Redis,
    private readonly prefix: string,
    private readonly settings: JobQueueSettings,
  ) {
    super();
    this.queue = new Queue<CheckJob>(CHECK_QUEUE_NAME, { connection, prefix });
  }

  async enqueue(jobs: readonly CheckJob[]): Promise<void> {
    await this.queue.addBulk(
      jobs.map((job) => ({
        name: JOB_NAME,
        data: job,
        opts: {
          // The same account in the same run is never queued twice.
          jobId: `${job.runId}__${job.clientId}__${job.platform}`,
          attempts: this.settings.attempts,
          backoff: { type: 'exponential', delay: this.settings.retryDelayMs },
          removeOnComplete: { count: 2000, age: 7 * 24 * 60 * 60 },
          removeOnFail: { count: 2000, age: 14 * 24 * 60 * 60 },
        },
      })),
    );
  }

  process(handler: CheckJobHandler): void {
    if (this.worker !== null) return;
    const { concurrency, maxChecksPerMinute } = this.settings;
    this.workerConnection = this.connection.duplicate();
    this.worker = new Worker<CheckJob>(
      CHECK_QUEUE_NAME,
      async (job) => {
        const number = job.attemptsMade + 1;
        await handler(job.data, { number, isLast: number >= (job.opts.attempts ?? 1) });
      },
      {
        // Workers block while waiting for jobs, so they get their own connection.
        connection: this.workerConnection,
        prefix: this.prefix,
        concurrency,
        ...(maxChecksPerMinute !== null && {
          limiter: { max: maxChecksPerMinute, duration: 60_000 },
        }),
      },
    );
    this.worker.on('failed', (job, error) => {
      if (job === undefined) return;
      const willRetry = job.attemptsMade < (job.opts.attempts ?? 1);
      this.logger.warn(
        `${job.data.clientId} ${job.data.platform}: try ${job.attemptsMade} failed (${error.message})${willRetry ? ', will retry' : ''}`,
      );
    });
    this.worker.on('error', (error) => this.logger.error(`Worker error: ${error.message}`));
    this.logger.log(`Worker started: ${concurrency} at a time, ${this.settings.attempts} tries`);
  }

  async stats(): Promise<JobQueueStats> {
    const counts = await this.queue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'completed',
      'failed',
      'prioritized',
    );
    return {
      driver: 'bullmq',
      concurrency: this.settings.concurrency,
      attempts: this.settings.attempts,
      waiting: (counts.waiting ?? 0) + (counts.prioritized ?? 0),
      active: counts.active ?? 0,
      delayed: counts.delayed ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
    };
  }

  /** Let running jobs finish, then disconnect (on shutdown). */
  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue.close();
    this.workerConnection?.disconnect();
  }
}
