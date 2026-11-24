import {
  FakeClock,
  FakeSignalSource,
  InMemoryClientRepository,
  InMemoryMonitoringLock,
  InMemoryMonitoringRunRepository,
  InMemorySignalRepository,
} from '../../src/adapters/outbound/fakes';
import { InProcessCheckJobQueue } from '../../src/adapters/outbound/queue/in-process-check-job.queue';
import {
  GetMonitoringProgressUseCase,
  MonitorClientsUseCase,
  RunCheckJobUseCase,
  StartMonitoringRunUseCase,
} from '../../src/core/application';
import {
  MonitoringRunInProgressError,
  MonitoringRunStatus,
  MonitoringTrigger,
  Platform,
  SignalSourceError,
  SignalSourceFailure,
  SignalType,
} from '../../src/core/domain';
import type { Client, Signal } from '../../src/core/domain';

// Invented test data only.
const RUN_TIME = new Date('2026-02-01T09:00:00.000Z');

function client(id: string, handles: Client['socialHandles']): Client {
  return {
    id,
    name: `Test Brand ${id}`,
    socialHandles: handles,
    lastActiveDate: null,
    lastCheckedAt: {},
  };
}

function signal(clientId: string, platform: Platform, externalId: string): Signal {
  return {
    id: `s-${externalId}`,
    clientId,
    platform,
    signalType: SignalType.NEW_POST,
    content: 'Test content',
    url: `https://example.test/${externalId}`,
    externalId,
    publishedAt: new Date('2026-01-20T00:00:00.000Z'),
    collectedAt: RUN_TIME,
    raw: {},
  };
}

function setup(options: { attempts?: number; concurrency?: number } = {}) {
  const clients = new InMemoryClientRepository([
    client('b1', { [Platform.LINKEDIN]: 'li-1', [Platform.INSTAGRAM]: 'ig-1' }),
    client('b2', { [Platform.LINKEDIN]: 'li-2' }),
    client('b3', {}),
  ]);
  const signals = new InMemorySignalRepository();
  const linkedIn = new FakeSignalSource({
    platform: Platform.LINKEDIN,
    signals: [signal('b1', Platform.LINKEDIN, 'a'), signal('b2', Platform.LINKEDIN, 'b')],
  });
  const instagram = new FakeSignalSource({
    platform: Platform.INSTAGRAM,
    signals: [signal('b1', Platform.INSTAGRAM, 'c')],
  });
  const clock = new FakeClock(RUN_TIME);
  const monitor = new MonitorClientsUseCase(clients, signals, [linkedIn, instagram], clock);
  const runs = new InMemoryMonitoringRunRepository();
  const lock = new InMemoryMonitoringLock();
  const queue = new InProcessCheckJobQueue({
    concurrency: options.concurrency ?? 2,
    attempts: options.attempts ?? 3,
    retryDelayMs: 1,
    maxChecksPerMinute: null,
  });
  const runCheck = new RunCheckJobUseCase(monitor, clients, runs, lock, clock);
  queue.process((job, attempt) => runCheck.execute(job, attempt));
  return {
    start: new StartMonitoringRunUseCase(monitor, runs, lock, queue, clock),
    progress: new GetMonitoringProgressUseCase(runs, lock, clock),
    clients,
    signals,
    linkedIn,
    instagram,
    runs,
    lock,
    queue,
  };
}

describe('Monitoring runs as queued jobs', () => {
  it('queues one job per account, returns at once, and completes when every job is done', async () => {
    const { start, runs, signals, queue, lock } = setup();

    const run = await start.execute(MonitoringTrigger.MANUAL);
    expect(run).toMatchObject({
      status: MonitoringRunStatus.RUNNING,
      totalChecks: 3,
      clientsChecked: 2,
      clientsSkipped: 1,
      finishedAt: null,
    });

    await queue.whenIdle();
    const done = await runs.get(run.id);
    expect(done?.status).toBe(MonitoringRunStatus.COMPLETED);
    expect(done?.finishedAt).toEqual(RUN_TIME);
    expect(done?.checks.map((c) => `${c.clientId}:${c.platform}`).sort()).toEqual([
      'b1:INSTAGRAM',
      'b1:LINKEDIN',
      'b2:LINKEDIN',
    ]);
    expect(done?.active).toEqual([]);
    expect(signals.all()).toHaveLength(3);
    expect(await lock.holder()).toBeNull();
  });

  it('allows one run at a time', async () => {
    const { start, queue } = setup();
    await start.execute(MonitoringTrigger.MANUAL);
    await expect(start.execute(MonitoringTrigger.MANUAL)).rejects.toBeInstanceOf(
      MonitoringRunInProgressError,
    );
    await queue.whenIdle();
    await expect(start.execute(MonitoringTrigger.MANUAL)).resolves.toBeDefined();
    await queue.whenIdle();
  });

  it('checks only the brand asked for ("Check now")', async () => {
    const { start, runs, queue } = setup();
    const run = await start.execute(MonitoringTrigger.MANUAL, { clientIds: ['b2'] });
    await queue.whenIdle();
    const done = await runs.get(run.id);
    expect(done).toMatchObject({ totalChecks: 1, clientIds: ['b2'] });
    expect(done?.checks.map((c) => c.clientId)).toEqual(['b2']);
  });

  it('retries a failing account and records the success with how many tries it took', async () => {
    const { start, runs, queue, instagram } = setup({ attempts: 3 });
    const fetch = jest.spyOn(instagram, 'fetchSignals');
    fetch.mockRejectedValueOnce(new Error('timeout')).mockRejectedValueOnce(new Error('timeout'));

    const run = await start.execute(MonitoringTrigger.MANUAL);
    await queue.whenIdle();

    const ig = (await runs.get(run.id))?.checks.find((c) => c.platform === Platform.INSTAGRAM);
    expect(ig).toMatchObject({ error: null, attempts: 3, newSignalsSaved: 1 });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('records the failure after the last try, and the run still completes', async () => {
    const { start, runs, queue, instagram, lock } = setup({ attempts: 2 });
    jest.spyOn(instagram, 'fetchSignals').mockRejectedValue(new Error('provider down'));

    const run = await start.execute(MonitoringTrigger.MANUAL);
    await queue.whenIdle();

    const done = await runs.get(run.id);
    expect(done?.status).toBe(MonitoringRunStatus.COMPLETED);
    expect(done?.checks.find((c) => c.platform === Platform.INSTAGRAM)).toMatchObject({
      error: 'provider down',
      attempts: 2,
    });
    expect((await queue.stats()).failed).toBe(0); // Stored as a result, not a lost job.
    expect(await lock.holder()).toBeNull();
  });

  it('does not retry a failure that cannot get better, like a wrong handle', async () => {
    const { start, runs, queue, instagram } = setup({ attempts: 3 });
    const fetch = jest
      .spyOn(instagram, 'fetchSignals')
      .mockRejectedValue(
        new SignalSourceError(
          'INSTAGRAM',
          SignalSourceFailure.BAD_RESPONSE,
          'Instagram account not found.',
        ),
      );

    const run = await start.execute(MonitoringTrigger.MANUAL);
    await queue.whenIdle();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      (await runs.get(run.id))?.checks.find((c) => c.platform === Platform.INSTAGRAM),
    ).toMatchObject({ attempts: 1, error: expect.stringContaining('not found') as string });
  });

  it('records a brand removed after the run was queued as failed, without retrying', async () => {
    const { start, runs, queue, clients } = setup();
    // The brand is gone by the time its job runs.
    jest.spyOn(clients, 'getById').mockResolvedValue(null);
    const run = await start.execute(MonitoringTrigger.MANUAL, { clientIds: ['b2'] });
    await queue.whenIdle();
    expect((await runs.get(run.id))?.checks[0]).toMatchObject({
      error: 'This brand was removed.',
      attempts: 1,
    });
  });

  it('completes straight away when there is nothing to check', async () => {
    const { start, lock } = setup();
    const run = await start.execute(MonitoringTrigger.MANUAL, { clientIds: ['b3'] });
    expect(run).toMatchObject({ status: MonitoringRunStatus.COMPLETED, totalChecks: 0 });
    expect(await lock.holder()).toBeNull();
  });

  it('reports the running run as current and the finished one as last', async () => {
    const { start, progress, queue } = setup();
    const run = await start.execute(MonitoringTrigger.MANUAL);
    expect((await progress.execute()).current?.id).toBe(run.id);
    await queue.whenIdle();
    const after = await progress.execute();
    expect(after.current).toBeNull();
    expect(after.last?.id).toBe(run.id);
  });

  it('marks a run interrupted when its lock ran out before it finished', async () => {
    const { progress, runs } = setup();
    await runs.create({
      id: 'run-stale',
      trigger: MonitoringTrigger.MANUAL,
      startedAt: RUN_TIME,
      clientIds: null,
      clientsChecked: 1,
      clientsSkipped: 0,
      accountsUpToDate: 0,
      totalChecks: 4,
    });
    const result = await progress.execute();
    expect(result.current).toBeNull();
    expect((await runs.get('run-stale'))?.status).toBe(MonitoringRunStatus.INTERRUPTED);
  });
});

describe('InProcessCheckJobQueue', () => {
  it('never runs more jobs at once than its concurrency', async () => {
    const queue = new InProcessCheckJobQueue({
      concurrency: 2,
      attempts: 1,
      retryDelayMs: 1,
      maxChecksPerMinute: null,
    });
    let running = 0;
    let most = 0;
    queue.process(async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
    });
    await queue.enqueue(
      Array.from({ length: 6 }, (_, i) => ({
        runId: 'r',
        clientId: `c${i}`,
        platform: Platform.LINKEDIN,
      })),
    );
    await queue.whenIdle();
    expect(most).toBe(2);
    expect(await queue.stats()).toMatchObject({ completed: 6, failed: 0, driver: 'in-process' });
  });

  it('gives up after the last attempt and counts the job as failed', async () => {
    const queue = new InProcessCheckJobQueue({
      concurrency: 1,
      attempts: 3,
      retryDelayMs: 1,
      maxChecksPerMinute: null,
    });
    const seen: { number: number; isLast: boolean }[] = [];
    queue.process((_job, attempt) => {
      seen.push(attempt);
      return Promise.reject(new Error('nope'));
    });
    await queue.enqueue([{ runId: 'r', clientId: 'c', platform: Platform.LINKEDIN }]);
    await queue.whenIdle();
    expect(seen).toEqual([
      { number: 1, isLast: false },
      { number: 2, isLast: false },
      { number: 3, isLast: true },
    ]);
    expect((await queue.stats()).failed).toBe(1);
  });
});
