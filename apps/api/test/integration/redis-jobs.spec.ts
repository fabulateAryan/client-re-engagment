/**
 * Runs the job flow against a real Redis with BullMQ. Skipped unless TEST_REDIS_URL is set,
 * e.g. TEST_REDIS_URL=redis://localhost:6379 pnpm test -- redis-jobs
 * Uses its own key prefix and deletes its keys afterwards.
 */
import { Redis } from 'ioredis';
import {
  FakeClock,
  FakeSignalSource,
  InMemoryClientRepository,
  InMemorySignalRepository,
} from '../../src/adapters/outbound/fakes';
import { BullMqCheckJobQueue } from '../../src/adapters/outbound/queue/bullmq-check-job.queue';
import { RedisCheckpointClientRepository } from '../../src/adapters/outbound/redis/redis-checkpoint-client.repository';
import { RedisMonitoringLock } from '../../src/adapters/outbound/redis/redis-monitoring-lock';
import { RedisSignalRepository } from '../../src/adapters/outbound/redis/redis-signal.repository';
import { RedisMonitoringRunRepository } from '../../src/adapters/outbound/redis/redis-monitoring-run.repository';
import {
  MonitorClientsUseCase,
  RunCheckJobUseCase,
  StartMonitoringRunUseCase,
} from '../../src/core/application';
import {
  MonitoringRunStatus,
  MonitoringTrigger,
  Platform,
  SignalType,
} from '../../src/core/domain';

const url = process.env.TEST_REDIS_URL;
const maybe = url === undefined ? describe.skip : describe;
const RUN_TIME = new Date('2026-02-01T09:00:00.000Z');

maybe('BullMQ job queue on Redis', () => {
  const prefix = `signal-monitor-test-${Date.now().toString(36)}`;
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis(url ?? '', { maxRetriesPerRequest: null });
  });

  afterAll(async () => {
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.quit();
  });

  it('lock: one holder at a time, only the holder can release it', async () => {
    const lock = new RedisMonitoringLock(redis, prefix);
    expect(await lock.acquire('a', 5000)).toBe(true);
    expect(await lock.acquire('b', 5000)).toBe(false);
    await lock.release('b');
    expect(await lock.holder()).toBe('a');
    await lock.release('a');
    expect(await lock.holder()).toBeNull();
  });

  it('keeps checkpoints and signals across a restart, so the next run is incremental', async () => {
    const brand = {
      id: 'b-restart',
      name: 'Test Brand',
      socialHandles: { [Platform.LINKEDIN]: 'li' },
      lastActiveDate: null,
      lastCheckedAt: {},
    };
    const post = {
      id: 'LINKEDIN:p1',
      clientId: 'b-restart',
      platform: Platform.LINKEDIN,
      signalType: SignalType.NEW_POST,
      content: 'Introducing our new range',
      url: 'https://example.test/p1',
      externalId: 'p1',
      publishedAt: new Date('2026-01-20T00:00:00.000Z'),
      collectedAt: RUN_TIME,
      raw: {},
    };

    // Before the restart: a first check collects the post and records a checkpoint.
    const clientsBefore = new RedisCheckpointClientRepository(
      new InMemoryClientRepository([brand]),
      redis,
      prefix,
    );
    await clientsBefore.onModuleInit();
    const signalsBefore = new RedisSignalRepository(redis, prefix);
    await signalsBefore.onModuleInit();
    const source = new FakeSignalSource({ platform: Platform.LINKEDIN, signals: [post] });
    const clock = new FakeClock(RUN_TIME);
    await new MonitorClientsUseCase(clientsBefore, signalsBefore, [source], clock).execute();

    // After the restart: fresh objects, same Redis.
    const clientsAfter = new RedisCheckpointClientRepository(
      new InMemoryClientRepository([brand]),
      redis,
      prefix,
    );
    await clientsAfter.onModuleInit();
    const signalsAfter = new RedisSignalRepository(redis, prefix);
    await signalsAfter.onModuleInit();

    expect((await clientsAfter.getById('b-restart'))?.lastCheckedAt[Platform.LINKEDIN]).toEqual(
      RUN_TIME,
    );
    expect((await signalsAfter.list({ page: 1, pageSize: 10 })).items.map((s) => s.id)).toEqual([
      'LINKEDIN:p1',
    ]);

    // The next check asks only for posts since the checkpoint, and stores nothing again.
    clock.advanceBy(60_000);
    const summary = await new MonitorClientsUseCase(
      clientsAfter,
      signalsAfter,
      [source],
      clock,
    ).execute();
    expect(source.calls.at(-1)?.since).toEqual(RUN_TIME);
    expect(summary.newSignalsSaved).toBe(0);
  });

  it('runs every account as a BullMQ job, retries a failure, and completes the run', async () => {
    const clients = new InMemoryClientRepository([
      {
        id: 'b1',
        name: 'Test Brand',
        socialHandles: { [Platform.LINKEDIN]: 'li', [Platform.INSTAGRAM]: 'ig' },
        lastActiveDate: null,
        lastCheckedAt: {},
      },
    ]);
    const linkedIn = new FakeSignalSource({ platform: Platform.LINKEDIN });
    const instagram = new FakeSignalSource({ platform: Platform.INSTAGRAM });
    jest.spyOn(instagram, 'fetchSignals').mockRejectedValueOnce(new Error('timeout'));
    const clock = new FakeClock(RUN_TIME);
    const monitor = new MonitorClientsUseCase(
      clients,
      new InMemorySignalRepository(),
      [linkedIn, instagram],
      clock,
    );
    const runs = new RedisMonitoringRunRepository(redis, prefix);
    const lock = new RedisMonitoringLock(redis, prefix);
    const queue = new BullMqCheckJobQueue(redis, prefix, {
      concurrency: 2,
      attempts: 3,
      retryDelayMs: 50,
      maxChecksPerMinute: null,
    });
    const runCheck = new RunCheckJobUseCase(monitor, clients, runs, lock, clock);
    queue.process((job, attempt) => runCheck.execute(job, attempt));

    try {
      const start = new StartMonitoringRunUseCase(monitor, runs, lock, queue, clock);
      const run = await start.execute(MonitoringTrigger.MANUAL);
      expect(run.totalChecks).toBe(2);

      let stored = await runs.get(run.id);
      for (let i = 0; i < 100 && stored?.status === MonitoringRunStatus.RUNNING; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        stored = await runs.get(run.id);
      }

      expect(stored?.status).toBe(MonitoringRunStatus.COMPLETED);
      expect(stored?.checks).toHaveLength(2);
      expect(stored?.checks.find((c) => c.platform === Platform.INSTAGRAM)).toMatchObject({
        error: null,
        attempts: 2,
      });
      expect(await lock.holder()).toBeNull();
      expect((await runs.listRecent(5)).map((r) => r.id)).toContain(run.id);
    } finally {
      await queue.onModuleDestroy();
    }
  }, 20_000);
});
