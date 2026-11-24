import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type {
  DraftResponse,
  EmailStatusResponse,
  SignalPageResponse,
  SignalSummaryResponse,
  SkipSignalResponse,
} from '@signal-monitoring/shared';
import { z } from 'zod';
import {
  DraftEngagementMessageUseCase,
  GetDraftUseCase,
  GetSignalSummaryUseCase,
  ListSignalsUseCase,
  MarkDraftSentUseCase,
  SaveDraftEditUseCase,
  SendDraftEmailUseCase,
  SendFollowUpUseCase,
  SkipSignalUseCase,
} from '../../../core/application';
import { EmailSenderPort } from '../../../core/ports';
import {
  ClientNotFoundError,
  DraftFailedError,
  Platform,
  SignalNotFoundError,
  SignalType,
} from '../../../core/domain';
import { parseQuery } from './query-validation';
import { toDraftResponse, toSignalPageResponse, toSignalSummaryResponse } from './response.mappers';

const draftBody = z.object({ regenerate: z.boolean().optional() }).optional();
const editBody = z
  .object({
    text: z.string().optional(),
    subject: z.string().optional(),
    recipient: z.string().nullable().optional(),
  })
  .strict();
const followUpBody = z.object({ text: z.string() }).strict();

const listQuery = z.object({
  clientId: z.string().trim().min(1).optional(),
  platform: z.enum(Platform).optional(),
  signalType: z.enum(SignalType).optional(),
  view: z.enum(['to_review', 'skipped']).default('to_review'),
  /** ISO time: only signals collected since then (what a run found). */
  collectedSince: z.iso.datetime().pipe(z.coerce.date()).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('signals')
export class SignalsController {
  constructor(
    @Inject(ListSignalsUseCase) private readonly listSignals: ListSignalsUseCase,
    @Inject(GetSignalSummaryUseCase) private readonly summary: GetSignalSummaryUseCase,
    @Inject(SkipSignalUseCase) private readonly skipSignal: SkipSignalUseCase,
    @Inject(DraftEngagementMessageUseCase)
    private readonly draftMessage: DraftEngagementMessageUseCase,
    @Inject(SaveDraftEditUseCase) private readonly saveDraft: SaveDraftEditUseCase,
    @Inject(MarkDraftSentUseCase) private readonly markSent: MarkDraftSentUseCase,
    @Inject(SendDraftEmailUseCase) private readonly sendEmail: SendDraftEmailUseCase,
    @Inject(EmailSenderPort) private readonly sender: EmailSenderPort,
    @Inject(GetDraftUseCase) private readonly getDraftUseCase: GetDraftUseCase,
    @Inject(SendFollowUpUseCase) private readonly sendFollowUp: SendFollowUpUseCase,
  ) {}

  /** Stored signals, most relevant first, filterable by client, platform, type and when found. */
  @Get()
  async list(@Query() query: unknown): Promise<SignalPageResponse> {
    return toSignalPageResponse(await this.listSignals.execute(parseQuery(listQuery, query)));
  }

  /** Totals by platform and signal type. */
  @Get('summary')
  async getSummary(): Promise<SignalSummaryResponse> {
    return toSignalSummaryResponse(await this.summary.execute());
  }

  /** Whether drafts can be emailed from the app, and from which address. */
  @Get('email-status')
  emailStatus(): EmailStatusResponse {
    return {
      enabled: this.sender.enabled,
      from: this.sender.from,
      repliesInApp: this.sender.repliesInApp,
    };
  }

  /** The saved draft and its email thread (used to check for new replies). */
  @Get(':id/draft')
  async getDraft(@Param('id') id: string): Promise<DraftResponse> {
    return toDraftResponse(await asHttpError(() => this.getDraftUseCase.execute(id)));
  }

  /** A person pressed "Send follow-up": email it in the same thread as the outreach email. */
  @Post(':id/draft/follow-up')
  @HttpCode(HttpStatus.OK)
  async followUp(@Param('id') id: string, @Body() body: unknown): Promise<DraftResponse> {
    const parsed = followUpBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Send { "text": "..." }.');
    return toDraftResponse(
      await asHttpError(() => this.sendFollowUp.execute(id, parsed.data.text)),
    );
  }

  /**
   * Draft an engagement message for this signal, or return the existing one.
   * Body `{ "regenerate": true }` replaces the existing draft. Nothing is sent.
   */
  @Post(':id/draft')
  @HttpCode(HttpStatus.OK)
  async draft(@Param('id') id: string, @Body() body: unknown): Promise<DraftResponse> {
    const parsed = draftBody.safeParse(body ?? undefined);
    if (!parsed.success) throw new BadRequestException('Send { "regenerate": true } or nothing.');
    return toDraftResponse(
      await asHttpError(() =>
        this.draftMessage.execute(id, { regenerate: parsed.data?.regenerate === true }),
      ),
    );
  }

  /** Save a person's edits to the draft. */
  @Put(':id/draft')
  async editDraft(@Param('id') id: string, @Body() body: unknown): Promise<DraftResponse> {
    const parsed = editBody.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Send any of { "text", "subject", "recipient" } as text.');
    }
    return toDraftResponse(await asHttpError(() => this.saveDraft.execute(id, parsed.data)));
  }

  /** The rep sent the message from their own mailbox. Nothing is sent from here. */
  @Post(':id/draft/sent')
  @HttpCode(HttpStatus.OK)
  async markDraftSent(@Param('id') id: string): Promise<DraftResponse> {
    return toDraftResponse(await asHttpError(() => this.markSent.execute(id, true)));
  }

  /** A person pressed Send: email the saved draft through SendGrid and record it as sent. */
  @Post(':id/draft/send')
  @HttpCode(HttpStatus.OK)
  async sendDraft(@Param('id') id: string): Promise<DraftResponse> {
    return toDraftResponse(await asHttpError(() => this.sendEmail.execute(id)));
  }

  /** Undo a mistaken "Mark as sent". */
  @Delete(':id/draft/sent')
  async unmarkDraftSent(@Param('id') id: string): Promise<DraftResponse> {
    return toDraftResponse(await asHttpError(() => this.markSent.execute(id, false)));
  }

  /** Story 8b: skip a signal so it leaves the to-review list. */
  @Post(':id/skip')
  @HttpCode(HttpStatus.OK)
  async skip(@Param('id') id: string): Promise<SkipSignalResponse> {
    const skippedAt = await notFoundAs404(() => this.skipSignal.skip(id));
    return { id, skippedAt: skippedAt.toISOString() };
  }

  /** Story 8b: undo a skip, returning the signal to the to-review list. */
  @Delete(':id/skip')
  async undoSkip(@Param('id') id: string): Promise<SkipSignalResponse> {
    await notFoundAs404(() => this.skipSignal.undo(id));
    return { id, skippedAt: null };
  }
}

async function notFoundAs404<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof SignalNotFoundError) throw new NotFoundException(error.message);
    throw error;
  }
}

/** Domain errors from drafting, as HTTP errors with messages safe to show a person. */
async function asHttpError<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof SignalNotFoundError || error instanceof ClientNotFoundError) {
      throw new NotFoundException(error.message);
    }
    if (error instanceof DraftFailedError) throw new BadRequestException(error.message);
    throw error;
  }
}
