/**
 * Composition root. Wiring only: binds each core port to an adapter and builds use cases.
 * To swap a fake for a real adapter, change the binding here; the core does not change.
 */
import { verifyToken } from '@clerk/backend';
import { Logger, Module } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import type { OnApplicationShutdown, Provider } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { SourceStatusResponse } from '@signal-monitoring/shared';
import {
  ClerkAuthGuard,
  ClientsController,
  HealthController,
  InboundEmailController,
  MonitoringController,
  OutreachController,
  SignalsController,
  SOURCE_STATUS,
} from './adapters/inbound/http';
import { BullMqMonitoringScheduler } from './adapters/inbound/jobs/bullmq-monitoring.scheduler';
import { CheckJobWorker } from './adapters/inbound/jobs/check-job.worker';
import { BullMqCheckJobQueue } from './adapters/outbound/queue/bullmq-check-job.queue';
import { InProcessCheckJobQueue } from './adapters/outbound/queue/in-process-check-job.queue';
import { createRedisConnection } from './adapters/outbound/redis/redis-connection';
import { RedisCheckpointClientRepository } from './adapters/outbound/redis/redis-checkpoint-client.repository';
import { RedisMonitoringLock } from './adapters/outbound/redis/redis-monitoring-lock';
import { RedisSignalRepository } from './adapters/outbound/redis/redis-signal.repository';
import { RedisDraftRepository } from './adapters/outbound/redis/redis-draft.repository';
import { RedisMonitoringRunRepository } from './adapters/outbound/redis/redis-monitoring-run.repository';
import { SystemClockAdapter } from './adapters/outbound/clock/system-clock.adapter';
import {
  FAKE_CAMPAIGNS,
  FAKE_CLIENTS,
  FAKE_SIGNALS,
  FakeNotifierAdapter,
  FakeSignalSource,
  InMemoryCampaignHistory,
  InMemoryDraftRepository,
  InMemoryMonitoringLock,
  InMemoryMonitoringRunRepository,
  InMemorySignalRepository,
} from './adapters/outbound/fakes';
import { FileBackedClientRepository } from './adapters/outbound/clients-file/file-backed-client.repository';
import { loadClientsFile } from './adapters/outbound/clients-file/clients-file.loader';
import type { ClientsFile } from './adapters/outbound/clients-file/clients-file.loader';
import { ClaudeMessageAdapter } from './adapters/outbound/messages/claude-message.adapter';
import { TemplateMessageAdapter } from './adapters/outbound/messages/template-message.adapter';
import {
  DisabledEmailSender,
  SendGridEmailAdapter,
} from './adapters/outbound/email/sendgrid-email.adapter';
import { GmailApiClient } from './adapters/outbound/email/gmail/gmail-api.client';
import { GmailEmailAdapter } from './adapters/outbound/email/gmail/gmail-email.adapter';
import { GmailReplyPoller } from './adapters/inbound/jobs/gmail-reply.poller';
import { createMonidSource } from './adapters/outbound/monid';
import { AppConfig, loadAppConfig } from './config';
import type { MonidEndpointSetting, SourceMode } from './config';
import {
  AddBrandUseCase,
  DraftEngagementMessageUseCase,
  GetSignalSummaryUseCase,
  ListClientsUseCase,
  MarkDraftSentUseCase,
  RemoveBrandUseCase,
  SaveDraftEditUseCase,
  SendDraftEmailUseCase,
  SendFollowUpUseCase,
  RecordInboundReplyUseCase,
  GetDraftUseCase,
  ListOutreachThreadsUseCase,
  UpdateBrandAccountsUseCase,
  SkipSignalUseCase,
  ListMonitoringRunsUseCase,
  ListSignalsUseCase,
  MonitorClientsUseCase,
  GetMonitoringProgressUseCase,
  RunCheckJobUseCase,
  StartMonitoringRunUseCase,
} from './core/application';
import { Platform } from './core/domain';
import {
  CheckJobQueuePort,
  MonitoringLockPort,
  CampaignHistoryPort,
  ClientRepositoryPort,
  ClockPort,
  DraftRepositoryPort,
  EmailSenderPort,
  MessagePort,
  NoReplyInbox,
  ReplyInboxPort,
  MonitoringRunRepositoryPort,
  NotifierPort,
  SignalQueryPort,
  SignalRepositoryPort,
  SignalSourcePort,
} from './core/ports';

/** Injection token holding every registered SignalSourcePort. */
export const SIGNAL_SOURCES = Symbol('SIGNAL_SOURCES');

/** A source plus how it should be described in the UI. */
interface SourceRegistration {
  readonly source: SignalSourcePort;
  readonly mode: 'live' | 'demo';
  readonly label: string;
}
const SOURCE_REGISTRATIONS = Symbol('SOURCE_REGISTRATIONS');
/** The Gmail API client, or null when Gmail is not set up. */
const GMAIL_CLIENT = Symbol('GMAIL_CLIENT');

/**
 * The one place sources are registered. Adding a platform is one more entry here
 * (plus its profile in adapters/outbound/monid/profiles/).
 *
 * LinkedIn and news fall back to demo data. Instagram, TikTok and YouTube are only
 * registered when switched to Monid, so the UI shows them as "Not connected" otherwise.
 */
function registerSources(config: AppConfig, clock: ClockPort): SourceRegistration[] {
  const optional: [Platform, SourceMode, MonidEndpointSetting | null | undefined][] = [
    [Platform.INSTAGRAM, config.instagramSource, config.monid?.instagram],
    [Platform.TIKTOK, config.tiktokSource, config.monid?.tiktok],
    [Platform.YOUTUBE, config.youtubeSource, config.monid?.youtube],
  ];
  return [
    monidOrDemo(Platform.LINKEDIN, config.linkedInSource, config.monid?.linkedIn, config, clock),
    monidOrDemo(Platform.GOOGLE_RSS, config.newsSource, config.monid?.news, config, clock),
    ...optional
      .filter(([, mode]) => mode === 'monid')
      .map(([platform, mode, choice]) => monidOrDemo(platform, mode, choice, config, clock)),
  ];
}

/** Monid when configured for this platform, otherwise the demo source. */
function monidOrDemo(
  platform: Platform,
  mode: SourceMode,
  choice: MonidEndpointSetting | null | undefined,
  config: AppConfig,
  clock: ClockPort,
): SourceRegistration {
  if (mode === 'monid' && config.monid !== null && choice != null) {
    return {
      source: createMonidSource(platform, choice, config.monid, clock),
      mode: 'live',
      label: 'Monid',
    };
  }
  return demoSource(platform);
}

/**
 * Clients and campaigns from the local clients file, or the single demo client when it
 * does not exist.
 */
function loadClientsAndCampaigns(config: AppConfig): ClientsFile {
  return (
    loadClientsFile(config.clientsFile) ?? {
      clients: [...FAKE_CLIENTS],
      campaigns: [...FAKE_CAMPAIGNS],
    }
  );
}
const CLIENTS_FILE_DATA = Symbol('CLIENTS_FILE_DATA');

function demoSource(platform: Platform): SourceRegistration {
  return {
    source: new FakeSignalSource({ platform, signals: FAKE_SIGNALS }),
    mode: 'demo',
    label: 'Demo data',
  };
}

function describeSources(registrations: readonly SourceRegistration[]): SourceStatusResponse[] {
  return Object.values(Platform).map((platform) => {
    const registered = registrations.find((r) => r.source.platform === platform);
    return registered === undefined
      ? { platform, mode: 'not_connected', label: 'Not connected' }
      : { platform, mode: registered.mode, label: registered.label };
  });
}

/** The shared Redis connection, or null when REDIS_URL is not set (in-process queue). */
class RedisHandle implements OnApplicationShutdown {
  constructor(readonly client: Redis | null) {}

  // After every module has closed its queues and workers.
  async onApplicationShutdown(): Promise<void> {
    await this.client?.quit().catch(() => this.client?.disconnect());
  }
}

const jobProviders: Provider[] = [
  {
    provide: RedisHandle,
    useFactory: (config: AppConfig): RedisHandle =>
      new RedisHandle(
        config.jobQueue.redisUrl === null
          ? null
          : createRedisConnection(config.jobQueue.redisUrl, 'api'),
      ),
    inject: [AppConfig],
  },
  {
    provide: MonitoringRunRepositoryPort,
    useFactory: (redis: RedisHandle, config: AppConfig): MonitoringRunRepositoryPort =>
      redis.client === null
        ? new InMemoryMonitoringRunRepository()
        : new RedisMonitoringRunRepository(redis.client, config.jobQueue.redisPrefix),
    inject: [RedisHandle, AppConfig],
  },
  {
    provide: MonitoringLockPort,
    useFactory: (redis: RedisHandle, config: AppConfig): MonitoringLockPort =>
      redis.client === null
        ? new InMemoryMonitoringLock()
        : new RedisMonitoringLock(redis.client, config.jobQueue.redisPrefix),
    inject: [RedisHandle, AppConfig],
  },
  {
    provide: CheckJobQueuePort,
    useFactory: (redis: RedisHandle, config: AppConfig): CheckJobQueuePort => {
      const { concurrency, attempts, retryDelayMs, maxChecksPerMinute, redisPrefix } =
        config.jobQueue;
      const settings = { concurrency, attempts, retryDelayMs, maxChecksPerMinute };
      return redis.client === null
        ? new InProcessCheckJobQueue(settings)
        : new BullMqCheckJobQueue(redis.client, redisPrefix, settings);
    },
    inject: [RedisHandle, AppConfig],
  },
  {
    provide: StartMonitoringRunUseCase,
    useFactory: (
      monitor: MonitorClientsUseCase,
      runs: MonitoringRunRepositoryPort,
      lock: MonitoringLockPort,
      queue: CheckJobQueuePort,
      clock: ClockPort,
    ): StartMonitoringRunUseCase =>
      new StartMonitoringRunUseCase(monitor, runs, lock, queue, clock),
    inject: [
      MonitorClientsUseCase,
      MonitoringRunRepositoryPort,
      MonitoringLockPort,
      CheckJobQueuePort,
      ClockPort,
    ],
  },
  {
    provide: RunCheckJobUseCase,
    useFactory: (
      monitor: MonitorClientsUseCase,
      clients: ClientRepositoryPort,
      runs: MonitoringRunRepositoryPort,
      lock: MonitoringLockPort,
      clock: ClockPort,
    ): RunCheckJobUseCase => new RunCheckJobUseCase(monitor, clients, runs, lock, clock),
    inject: [
      MonitorClientsUseCase,
      ClientRepositoryPort,
      MonitoringRunRepositoryPort,
      MonitoringLockPort,
      ClockPort,
    ],
  },
  {
    provide: GetMonitoringProgressUseCase,
    useFactory: (
      runs: MonitoringRunRepositoryPort,
      lock: MonitoringLockPort,
      clock: ClockPort,
    ): GetMonitoringProgressUseCase => new GetMonitoringProgressUseCase(runs, lock, clock),
    inject: [MonitoringRunRepositoryPort, MonitoringLockPort, ClockPort],
  },
  {
    provide: CheckJobWorker,
    useFactory: (queue: CheckJobQueuePort, runCheck: RunCheckJobUseCase): CheckJobWorker =>
      new CheckJobWorker(queue, runCheck),
    inject: [CheckJobQueuePort, RunCheckJobUseCase],
  },
  {
    provide: BullMqMonitoringScheduler,
    // Only with Redis; without it there is nothing to schedule on.
    useFactory: (
      redis: RedisHandle,
      config: AppConfig,
      startRun: StartMonitoringRunUseCase,
    ): BullMqMonitoringScheduler | null =>
      redis.client === null
        ? null
        : new BullMqMonitoringScheduler(
            redis.client,
            config.jobQueue.redisPrefix,
            config.jobQueue.scheduleCron,
            startRun,
          ),
    inject: [RedisHandle, AppConfig, StartMonitoringRunUseCase],
  },
];

const configProviders: Provider[] = [
  { provide: AppConfig, useFactory: (): AppConfig => loadAppConfig(process.env) },
  {
    // Every route needs a signed-in Clerk user when CLERK_SECRET_KEY is set (see the guard).
    provide: APP_GUARD,
    useFactory: (reflector: Reflector, config: AppConfig): ClerkAuthGuard =>
      new ClerkAuthGuard(reflector, config.clerk, verifyToken),
    inject: [Reflector, AppConfig],
  },
];

const portProviders: Provider[] = [
  { provide: ClockPort, useClass: SystemClockAdapter },
  { provide: CLIENTS_FILE_DATA, useFactory: loadClientsAndCampaigns, inject: [AppConfig] },
  {
    provide: ClientRepositoryPort,
    // Brands added or removed in the app are written back to the clients file. With Redis,
    // each account's last-checked time is kept there too, so runs stay incremental across
    // restarts (only posts newer than the last check are collected).
    useFactory: (
      data: ClientsFile,
      config: AppConfig,
      redis: RedisHandle,
    ): ClientRepositoryPort => {
      const clients = new FileBackedClientRepository(config.clientsFile, data.clients);
      return redis.client === null
        ? clients
        : new RedisCheckpointClientRepository(clients, redis.client, config.jobQueue.redisPrefix);
    },
    inject: [CLIENTS_FILE_DATA, AppConfig, RedisHandle],
  },
  {
    provide: CampaignHistoryPort,
    useFactory: (data: ClientsFile): CampaignHistoryPort =>
      new InMemoryCampaignHistory(data.campaigns),
    inject: [CLIENTS_FILE_DATA],
  },
  // One instance serves both the write port and the read port.
  {
    provide: InMemorySignalRepository,
    // With Redis, collected signals survive restarts; otherwise they live in memory.
    useFactory: (config: AppConfig, redis: RedisHandle): InMemorySignalRepository =>
      redis.client === null
        ? new InMemorySignalRepository({
            minScore: config.signalsMinScore,
            maxAgeDays: config.lookbackDays,
          })
        : new RedisSignalRepository(redis.client, config.jobQueue.redisPrefix, {
            minScore: config.signalsMinScore,
            maxAgeDays: config.lookbackDays,
          }),
    inject: [AppConfig, RedisHandle],
  },
  { provide: SignalRepositoryPort, useExisting: InMemorySignalRepository },
  { provide: SignalQueryPort, useExisting: InMemorySignalRepository },
  {
    provide: MessagePort,
    useFactory: (config: AppConfig): MessagePort =>
      config.messageDrafter === 'claude'
        ? new ClaudeMessageAdapter()
        : new TemplateMessageAdapter(),
    inject: [AppConfig],
  },
  {
    provide: DraftRepositoryPort,
    // With Redis, drafts and their email threads (sent emails and replies) survive restarts.
    useFactory: (config: AppConfig, redis: RedisHandle): DraftRepositoryPort =>
      redis.client === null
        ? new InMemoryDraftRepository()
        : new RedisDraftRepository(redis.client, config.jobQueue.redisPrefix),
    inject: [AppConfig, RedisHandle],
  },
  {
    provide: GMAIL_CLIENT,
    useFactory: (config: AppConfig): GmailApiClient | null =>
      config.gmail === null ? null : new GmailApiClient(config.gmail),
    inject: [AppConfig],
  },
  {
    provide: EmailSenderPort,
    // Gmail wins when set up; then SendGrid; otherwise reps send from their own mailbox.
    useFactory: (config: AppConfig, gmail: GmailApiClient | null): EmailSenderPort => {
      const logger = new Logger('Email');
      if (config.gmail !== null && gmail !== null) {
        logger.log(`Sending and receiving through Gmail as ${config.gmail.fromEmail}.`);
        return new GmailEmailAdapter(gmail, config.gmail);
      }
      if (config.sendGrid !== null) {
        logger.log(`Sending through SendGrid as ${config.sendGrid.fromEmail}.`);
        return new SendGridEmailAdapter(config.sendGrid);
      }
      return new DisabledEmailSender();
    },
    inject: [AppConfig, GMAIL_CLIENT],
  },
  {
    provide: GmailReplyPoller,
    // Only with Gmail: reads replies from the inbox into their outreach thread.
    useFactory: (
      config: AppConfig,
      gmail: GmailApiClient | null,
      record: RecordInboundReplyUseCase,
    ): GmailReplyPoller | null =>
      config.gmail === null || gmail === null
        ? null
        : new GmailReplyPoller(gmail, record, {
            intervalMs: config.gmail.pollIntervalMs,
            lookbackDays: 14,
            batchSize: 50,
          }),
    inject: [AppConfig, GMAIL_CLIENT, RecordInboundReplyUseCase],
  },
  {
    provide: ReplyInboxPort,
    // "Check for replies" reads the Gmail inbox straight away; without Gmail it does nothing.
    useFactory: (poller: GmailReplyPoller | null): ReplyInboxPort => poller ?? new NoReplyInbox(),
    inject: [GmailReplyPoller],
  },
  {
    provide: SendDraftEmailUseCase,
    useFactory: (
      drafts: DraftRepositoryPort,
      sender: EmailSenderPort,
      clock: ClockPort,
    ): SendDraftEmailUseCase => new SendDraftEmailUseCase(drafts, sender, clock),
    inject: [DraftRepositoryPort, EmailSenderPort, ClockPort],
  },
  {
    provide: SendFollowUpUseCase,
    useFactory: (
      drafts: DraftRepositoryPort,
      sender: EmailSenderPort,
      clock: ClockPort,
    ): SendFollowUpUseCase => new SendFollowUpUseCase(drafts, sender, clock),
    inject: [DraftRepositoryPort, EmailSenderPort, ClockPort],
  },
  {
    provide: RecordInboundReplyUseCase,
    useFactory: (drafts: DraftRepositoryPort, clock: ClockPort): RecordInboundReplyUseCase =>
      new RecordInboundReplyUseCase(drafts, clock),
    inject: [DraftRepositoryPort, ClockPort],
  },
  {
    provide: ListOutreachThreadsUseCase,
    useFactory: (
      drafts: DraftRepositoryPort,
      signals: SignalQueryPort,
      clients: ClientRepositoryPort,
    ): ListOutreachThreadsUseCase => new ListOutreachThreadsUseCase(drafts, signals, clients),
    inject: [DraftRepositoryPort, SignalQueryPort, ClientRepositoryPort],
  },
  {
    provide: GetDraftUseCase,
    useFactory: (drafts: DraftRepositoryPort): GetDraftUseCase => new GetDraftUseCase(drafts),
    inject: [DraftRepositoryPort],
  },
  { provide: NotifierPort, useClass: FakeNotifierAdapter },
  {
    provide: SOURCE_REGISTRATIONS,
    useFactory: registerSources,
    inject: [AppConfig, ClockPort],
  },
  {
    provide: SIGNAL_SOURCES,
    useFactory: (registrations: SourceRegistration[]): SignalSourcePort[] =>
      registrations.map((r) => r.source),
    inject: [SOURCE_REGISTRATIONS],
  },
  { provide: SOURCE_STATUS, useFactory: describeSources, inject: [SOURCE_REGISTRATIONS] },
];

const useCaseProviders: Provider[] = [
  {
    provide: MonitorClientsUseCase,
    useFactory: (
      clients: ClientRepositoryPort,
      signals: SignalRepositoryPort,
      sources: SignalSourcePort[],
      clock: ClockPort,
      config: AppConfig,
    ): MonitorClientsUseCase =>
      new MonitorClientsUseCase(
        clients,
        signals,
        sources,
        clock,
        config.lookbackDays,
        config.recheckAfterMinutes,
      ),
    inject: [ClientRepositoryPort, SignalRepositoryPort, SIGNAL_SOURCES, ClockPort, AppConfig],
  },
  {
    provide: ListMonitoringRunsUseCase,
    useFactory: (runs: MonitoringRunRepositoryPort): ListMonitoringRunsUseCase =>
      new ListMonitoringRunsUseCase(runs),
    inject: [MonitoringRunRepositoryPort],
  },
  {
    provide: ListSignalsUseCase,
    useFactory: (
      signals: SignalQueryPort,
      clients: ClientRepositoryPort,
      drafts: DraftRepositoryPort,
    ): ListSignalsUseCase => new ListSignalsUseCase(signals, clients, drafts),
    inject: [SignalQueryPort, ClientRepositoryPort, DraftRepositoryPort],
  },
  {
    provide: GetSignalSummaryUseCase,
    useFactory: (signals: SignalQueryPort): GetSignalSummaryUseCase =>
      new GetSignalSummaryUseCase(signals),
    inject: [SignalQueryPort],
  },
  {
    provide: SkipSignalUseCase,
    useFactory: (signals: SignalRepositoryPort, clock: ClockPort): SkipSignalUseCase =>
      new SkipSignalUseCase(signals, clock),
    inject: [SignalRepositoryPort, ClockPort],
  },
  {
    provide: AddBrandUseCase,
    useFactory: (clients: ClientRepositoryPort, clock: ClockPort): AddBrandUseCase =>
      new AddBrandUseCase(clients, clock),
    inject: [ClientRepositoryPort, ClockPort],
  },
  {
    provide: RemoveBrandUseCase,
    useFactory: (clients: ClientRepositoryPort): RemoveBrandUseCase =>
      new RemoveBrandUseCase(clients),
    inject: [ClientRepositoryPort],
  },
  {
    provide: UpdateBrandAccountsUseCase,
    useFactory: (clients: ClientRepositoryPort): UpdateBrandAccountsUseCase =>
      new UpdateBrandAccountsUseCase(clients),
    inject: [ClientRepositoryPort],
  },
  {
    provide: DraftEngagementMessageUseCase,
    useFactory: (
      signals: SignalQueryPort,
      clients: ClientRepositoryPort,
      campaigns: CampaignHistoryPort,
      messages: MessagePort,
      drafts: DraftRepositoryPort,
      clock: ClockPort,
    ): DraftEngagementMessageUseCase =>
      new DraftEngagementMessageUseCase(signals, clients, campaigns, messages, drafts, clock),
    inject: [
      SignalQueryPort,
      ClientRepositoryPort,
      CampaignHistoryPort,
      MessagePort,
      DraftRepositoryPort,
      ClockPort,
    ],
  },
  {
    provide: MarkDraftSentUseCase,
    useFactory: (drafts: DraftRepositoryPort, clock: ClockPort): MarkDraftSentUseCase =>
      new MarkDraftSentUseCase(drafts, clock),
    inject: [DraftRepositoryPort, ClockPort],
  },
  {
    provide: SaveDraftEditUseCase,
    useFactory: (drafts: DraftRepositoryPort, clock: ClockPort): SaveDraftEditUseCase =>
      new SaveDraftEditUseCase(drafts, clock),
    inject: [DraftRepositoryPort, ClockPort],
  },
  {
    provide: ListClientsUseCase,
    useFactory: (
      clients: ClientRepositoryPort,
      campaigns: CampaignHistoryPort,
      clock: ClockPort,
    ): ListClientsUseCase => new ListClientsUseCase(clients, campaigns, clock),
    inject: [ClientRepositoryPort, CampaignHistoryPort, ClockPort],
  },
];

@Module({
  controllers: [
    HealthController,
    MonitoringController,
    SignalsController,
    ClientsController,
    InboundEmailController,
    OutreachController,
  ],
  providers: [...configProviders, ...portProviders, ...useCaseProviders, ...jobProviders],
})
export class AppModule {}
