import { Controller, Get, Inject } from '@nestjs/common';
import type { OutreachListResponse } from '@signal-monitoring/shared';
import { ListOutreachThreadsUseCase } from '../../../core/application';
import { toDraftResponse } from './response.mappers';

/** The outreach overview: every email thread sent from the app, with replies. */
@Controller('outreach')
export class OutreachController {
  constructor(
    @Inject(ListOutreachThreadsUseCase) private readonly listThreads: ListOutreachThreadsUseCase,
  ) {}

  /** Threads, most recent activity first. */
  @Get()
  async list(): Promise<OutreachListResponse> {
    const threads = await this.listThreads.execute();
    return {
      items: threads.map((t) => ({
        signalId: t.draft.signalId,
        clientName: t.clientName,
        platform: t.signal?.platform ?? null,
        signalUrl: t.signal?.url ?? null,
        lastActivityAt: t.lastActivityAt.toISOString(),
        replies: t.replies,
        needsResponse: t.needsResponse,
        draft: toDraftResponse(t.draft),
      })),
    };
  }
}
