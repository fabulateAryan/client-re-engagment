import { Logger } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { StartMonitoringRunUseCase } from '../../../core/application';
import { MonitoringRunInProgressError, MonitoringTrigger } from '../../../core/domain';

const SCHEDULE_QUEUE = 'monitoring-schedule';
const SCHEDULER_ID = 'scheduled-monitoring';
const TIME_ZONE = 'Australia/Sydney';

/**
 * Starts monitoring runs on a cron schedule (MONITORING_SCHEDULE_CRON, Sydney time) with a
 * BullMQ job scheduler. The schedule lives in Redis, so with several API instances it still
 * fires once. Without a schedule set, any earlier one is removed.
 */
export class BullMqMonitoringScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('MonitoringScheduler');
  private queue: Queue | null = null;
  private worker: Worker | null = null;
  private workerConnection: Redis | null = null;

  constructor(
    private readonly connection: Redis,
    private readonly prefix: string,
    private readonly cron: string | null,
    private readonly startRun: StartMonitoringRunUseCase,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.queue = new Queue(SCHEDULE_QUEUE, { connection: this.connection, prefix: this.prefix });
    if (this.cron === null) {
      await this.queue.removeJobScheduler(SCHEDULER_ID);
      return;
    }

    await this.queue.upsertJobScheduler(
      SCHEDULER_ID,
      { pattern: this.cron, tz: TIME_ZONE },
      { name: 'start-run', opts: { removeOnComplete: 50, removeOnFail: 50 } },
    );
    this.workerConnection = this.connection.duplicate();
    this.worker = new Worker(SCHEDULE_QUEUE, () => this.runScheduled(), {
      connection: this.workerConnection,
      prefix: this.prefix,
      concurrency: 1,
    });
    this.logger.log(`Scheduled monitoring: "${this.cron}" (${TIME_ZONE})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
    this.workerConnection?.disconnect();
  }

  private async runScheduled(): Promise<void> {
    try {
      const run = await this.startRun.execute(MonitoringTrigger.SCHEDULED);
      this.logger.log(`Scheduled run ${run.id} queued (${run.totalChecks} accounts)`);
    } catch (error) {
      if (error instanceof MonitoringRunInProgressError) {
        this.logger.log('Scheduled run skipped: a run is already going.');
        return;
      }
      throw error;
    }
  }
}
