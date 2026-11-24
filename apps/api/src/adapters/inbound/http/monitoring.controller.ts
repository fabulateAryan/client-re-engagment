import {
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import type {
  JobQueueStatsResponse,
  MonitoringProgressResponse,
  MonitoringRunListResponse,
  MonitoringRunResponse,
  SourceStatusResponse,
} from '@signal-monitoring/shared';
import { z } from 'zod';
import {
  GetMonitoringProgressUseCase,
  ListMonitoringRunsUseCase,
  StartMonitoringRunUseCase,
} from '../../../core/application';
import { MonitoringRunInProgressError, MonitoringTrigger } from '../../../core/domain';
import { CheckJobQueuePort, MonitoringRunRepositoryPort } from '../../../core/ports';
import { parseQuery } from './query-validation';
import {
  toJobQueueStatsResponse,
  toMonitoringProgressResponse,
  toMonitoringRunResponse,
} from './response.mappers';
import { SOURCE_STATUS } from './source-status';
import type { SourceStatusList } from './source-status';

const runQuery = z.object({
  /** Check only this brand ("Check now"). Omitted means every brand. */
  clientId: z.string().trim().min(1).optional(),
});

const runsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('monitoring')
export class MonitoringController {
  constructor(
    @Inject(StartMonitoringRunUseCase) private readonly startRun: StartMonitoringRunUseCase,
    @Inject(ListMonitoringRunsUseCase) private readonly listRuns: ListMonitoringRunsUseCase,
    @Inject(GetMonitoringProgressUseCase)
    private readonly getProgress: GetMonitoringProgressUseCase,
    @Inject(MonitoringRunRepositoryPort) private readonly runs: MonitoringRunRepositoryPort,
    @Inject(CheckJobQueuePort) private readonly queue: CheckJobQueuePort,
    @Inject(SOURCE_STATUS) private readonly sources: SourceStatusList,
  ) {}

  /**
   * Queues a monitoring run (one job per brand account) and answers at once with 202.
   * Follow it with GET /monitoring/progress or GET /monitoring/runs/:id.
   */
  @Post('run')
  @HttpCode(HttpStatus.ACCEPTED)
  async run(@Query() query: unknown): Promise<MonitoringRunResponse> {
    const { clientId } = parseQuery(runQuery, query);
    try {
      return toMonitoringRunResponse(
        await this.startRun.execute(
          MonitoringTrigger.MANUAL,
          clientId === undefined ? {} : { clientIds: [clientId] },
        ),
      );
    } catch (error) {
      if (error instanceof MonitoringRunInProgressError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  /** Recent runs, newest first, including one that is still going. */
  @Get('runs')
  async list(@Query() query: unknown): Promise<MonitoringRunListResponse> {
    const { limit } = parseQuery(runsQuery, query);
    const [runs, progress] = await Promise.all([
      this.listRuns.execute(limit),
      this.getProgress.execute(),
    ]);
    return { items: runs.map(toMonitoringRunResponse), running: progress.current !== null };
  }

  @Get('runs/:id')
  async get(@Param('id') id: string): Promise<MonitoringRunResponse> {
    const run = await this.runs.get(id);
    if (run === null) throw new NotFoundException(`No run with id ${id}.`);
    return toMonitoringRunResponse(run);
  }

  /** Where the current run is up to (polled by the progress bar), plus the last finished run. */
  @Get('progress')
  async progress(): Promise<MonitoringProgressResponse> {
    const { current, last } = await this.getProgress.execute();
    return toMonitoringProgressResponse(current, last);
  }

  /** The job queue: driver, workers and how many jobs are waiting, running or failed. */
  @Get('queue')
  async queueStats(): Promise<JobQueueStatsResponse> {
    return toJobQueueStatsResponse(await this.queue.stats());
  }

  /** Which platforms are live, demo or not yet connected. */
  @Get('sources')
  sourceStatus(): SourceStatusResponse[] {
    return [...this.sources];
  }
}
