import type { OnApplicationBootstrap } from '@nestjs/common';
import type { RunCheckJobUseCase } from '../../../core/application';
import type { CheckJobQueuePort } from '../../../core/ports';

/** Connects the job queue to the use case that checks one account, once the app is up. */
export class CheckJobWorker implements OnApplicationBootstrap {
  constructor(
    private readonly queue: CheckJobQueuePort,
    private readonly runCheck: RunCheckJobUseCase,
  ) {}

  onApplicationBootstrap(): void {
    this.queue.process((job, attempt) => this.runCheck.execute(job, attempt));
  }
}
