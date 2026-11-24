import {
  FakeClock,
  FakeSignalSource,
  InMemoryClientRepository,
  InMemorySignalRepository,
} from '../../src/adapters/outbound/fakes';
import { MonitorClientsUseCase } from '../../src/core/application';
import { Platform, SignalType } from '../../src/core/domain';
import type { Client, Signal } from '../../src/core/domain';
import type { SignalSourcePort } from '../../src/core/ports';

// All data below is invented for tests.
const RUN_TIME = new Date('2026-02-01T09:00:00.000Z');

function makeClient(overrides: Partial<Client> & Pick<Client, 'id'>): Client {
  return {
    name: `Test Client ${overrides.id}`,
    socialHandles: { [Platform.LINKEDIN]: `handle-${overrides.id}` },
    lastActiveDate: new Date('2025-01-01T00:00:00.000Z'),
    lastCheckedAt: {},
    ...overrides,
  };
}

function makeSignal(
  overrides: Partial<Signal> & Pick<Signal, 'clientId' | 'platform' | 'externalId'>,
): Signal {
  return {
    id: `sig-${overrides.platform}-${overrides.externalId}`,
    signalType: SignalType.NEW_POST,
    content: 'Test content',
    url: `https://example.test/${overrides.externalId}`,
    publishedAt: new Date('2026-01-20T00:00:00.000Z'),
    collectedAt: RUN_TIME,
    raw: { test: true },
    ...overrides,
  };
}

interface Setup {
  useCase: MonitorClientsUseCase;
  clients: InMemoryClientRepository;
  signals: InMemorySignalRepository;
  clock: FakeClock;
}

function setup(clientList: Client[], sources: SignalSourcePort[]): Setup {
  const clients = new InMemoryClientRepository(clientList);
  const signals = new InMemorySignalRepository();
  const clock = new FakeClock(RUN_TIME);
  const useCase = new MonitorClientsUseCase(clients, signals, sources, clock);
  return { useCase, clients, signals, clock };
}

describe('MonitorClientsUseCase', () => {
  it('collects and saves signals from every source matching the client handles', async () => {
    const client = makeClient({
      id: 'c1',
      socialHandles: { [Platform.LINKEDIN]: 'test-li', [Platform.INSTAGRAM]: 'test-ig' },
    });
    const linkedIn = new FakeSignalSource({
      platform: Platform.LINKEDIN,
      signals: [
        makeSignal({ clientId: 'c1', platform: Platform.LINKEDIN, externalId: 'a' }),
        makeSignal({ clientId: 'c1', platform: Platform.LINKEDIN, externalId: 'b' }),
      ],
    });
    const instagram = new FakeSignalSource({
      platform: Platform.INSTAGRAM,
      signals: [makeSignal({ clientId: 'c1', platform: Platform.INSTAGRAM, externalId: 'c' })],
    });
    const { useCase, signals } = setup([client], [linkedIn, instagram]);

    const summary = await useCase.execute();

    expect(summary).toMatchObject({
      clientsChecked: 1,
      clientsSkipped: 0,
      signalsFound: 3,
      newSignalsSaved: 3,
      errors: [],
    });
    expect(signals.all().map((s) => s.externalId)).toEqual(['a', 'b', 'c']);
  });

  it('does not call sources for platforms the client has no handle on', async () => {
    const client = makeClient({ id: 'c1', socialHandles: { [Platform.LINKEDIN]: 'test-li' } });
    const linkedIn = new FakeSignalSource({ platform: Platform.LINKEDIN });
    const tiktok = new FakeSignalSource({ platform: Platform.TIKTOK });
    const { useCase } = setup([client], [linkedIn, tiktok]);

    await useCase.execute();

    expect(linkedIn.calls).toHaveLength(1);
    expect(tiktok.calls).toHaveLength(0);
  });

  it('ignores duplicate signals (same platform + externalId) across runs and within a run', async () => {
    const client = makeClient({ id: 'c1' });
    const duplicate = makeSignal({ clientId: 'c1', platform: Platform.LINKEDIN, externalId: 'x' });
    // Two sources for the same platform returning the same item.
    const sourceA = new FakeSignalSource({ platform: Platform.LINKEDIN, signals: [duplicate] });
    const sourceB = new FakeSignalSource({
      platform: Platform.LINKEDIN,
      signals: [{ ...duplicate, id: 'other-internal-id' }],
    });
    const { useCase, signals, clients } = setup([client], [sourceA, sourceB]);

    const first = await useCase.execute();
    expect(first.signalsFound).toBe(2);
    expect(first.newSignalsSaved).toBe(1);

    // Force the same window to be fetched again by resetting last-checked.
    await clients.updateLastChecked('c1', Platform.LINKEDIN, new Date('2026-01-01T00:00:00.000Z'));
    const second = await useCase.execute();
    expect(second.signalsFound).toBe(2);
    expect(second.newSignalsSaved).toBe(0);
    expect(signals.all()).toHaveLength(1);
  });

  it('skips clients with no social handles', async () => {
    const noHandles = makeClient({ id: 'c-none', socialHandles: {} });
    const blankHandle = makeClient({ id: 'c-blank', socialHandles: { [Platform.LINKEDIN]: '  ' } });
    const withHandle = makeClient({ id: 'c-ok' });
    const linkedIn = new FakeSignalSource({ platform: Platform.LINKEDIN });
    const { useCase } = setup([noHandles, blankHandle, withHandle], [linkedIn]);

    const summary = await useCase.execute();

    expect(summary.clientsChecked).toBe(1);
    expect(summary.clientsSkipped).toBe(2);
    expect(linkedIn.calls.map((call) => call.clientId)).toEqual(['c-ok']);
  });

  it('keeps going when one source throws, and reports the error', async () => {
    const c1 = makeClient({
      id: 'c1',
      socialHandles: { [Platform.LINKEDIN]: 'test-li', [Platform.INSTAGRAM]: 'test-ig' },
    });
    const c2 = makeClient({ id: 'c2' });
    const failingLinkedIn = new FakeSignalSource({
      platform: Platform.LINKEDIN,
      failWith: new Error('provider unavailable'),
    });
    const workingLinkedIn = new FakeSignalSource({
      platform: Platform.LINKEDIN,
      signals: [makeSignal({ clientId: 'c2', platform: Platform.LINKEDIN, externalId: 'l2' })],
    });
    const instagram = new FakeSignalSource({
      platform: Platform.INSTAGRAM,
      signals: [makeSignal({ clientId: 'c1', platform: Platform.INSTAGRAM, externalId: 'i1' })],
    });
    const { useCase, clients } = setup([c1, c2], [failingLinkedIn, workingLinkedIn, instagram]);

    const summary = await useCase.execute();

    expect(summary.clientsChecked).toBe(2);
    expect(summary.newSignalsSaved).toBe(2);
    expect(summary.errors).toEqual([
      {
        clientId: 'c1',
        platform: Platform.LINKEDIN,
        message: 'provider unavailable',
        retryable: true,
      },
      {
        clientId: 'c2',
        platform: Platform.LINKEDIN,
        message: 'provider unavailable',
        retryable: true,
      },
    ]);
    // Instagram succeeded, so it advances. LinkedIn had a failing source, so it does not,
    // even though another LinkedIn source worked: the next run retries the same window.
    const c1After = await clients.getById('c1');
    expect(c1After?.lastCheckedAt[Platform.INSTAGRAM]).toEqual(RUN_TIME);
    expect(c1After?.lastCheckedAt[Platform.LINKEDIN]).toBeUndefined();
  });

  it('records a save failure for that platform without stopping other clients', async () => {
    const c1 = makeClient({ id: 'c1' });
    const c2 = makeClient({ id: 'c2' });
    const linkedIn = new FakeSignalSource({
      platform: Platform.LINKEDIN,
      signals: [
        makeSignal({ clientId: 'c1', platform: Platform.LINKEDIN, externalId: 'l1' }),
        makeSignal({ clientId: 'c2', platform: Platform.LINKEDIN, externalId: 'l2' }),
      ],
    });
    const { useCase, signals, clients } = setup([c1, c2], [linkedIn]);
    const realSaveMany = signals.saveMany.bind(signals);
    jest
      .spyOn(signals, 'saveMany')
      .mockImplementationOnce(() => Promise.reject(new Error('storage down')))
      .mockImplementation(realSaveMany);

    const summary = await useCase.execute();

    expect(summary.errors).toEqual([
      { clientId: 'c1', platform: Platform.LINKEDIN, message: 'storage down', retryable: true },
    ]);
    expect(summary.newSignalsSaved).toBe(1);
    expect((await clients.getById('c1'))?.lastCheckedAt[Platform.LINKEDIN]).toBeUndefined();
    expect((await clients.getById('c2'))?.lastCheckedAt[Platform.LINKEDIN]).toEqual(RUN_TIME);
  });

  it('uses the per-platform last-checked time as "since" and then updates it', async () => {
    const previousCheck = new Date('2026-01-15T00:00:00.000Z');
    const client = makeClient({
      id: 'c1',
      socialHandles: { [Platform.LINKEDIN]: 'test-li', [Platform.INSTAGRAM]: 'test-ig' },
      lastCheckedAt: { [Platform.LINKEDIN]: previousCheck },
    });
    const linkedIn = new FakeSignalSource({
      platform: Platform.LINKEDIN,
      signals: [
        makeSignal({
          clientId: 'c1',
          platform: Platform.LINKEDIN,
          externalId: 'old',
          publishedAt: new Date('2026-01-10T00:00:00.000Z'),
        }),
        makeSignal({
          clientId: 'c1',
          platform: Platform.LINKEDIN,
          externalId: 'new',
          publishedAt: new Date('2026-01-20T00:00:00.000Z'),
        }),
      ],
    });
    const instagram = new FakeSignalSource({ platform: Platform.INSTAGRAM });
    const { useCase, clients, clock } = setup([client], [linkedIn, instagram]);

    const first = await useCase.execute();

    expect(linkedIn.calls[0]).toEqual({ clientId: 'c1', since: previousCheck });
    expect(instagram.calls[0]).toEqual({ clientId: 'c1', since: null });
    expect(first.newSignalsSaved).toBe(1);
    const afterFirst = await clients.getById('c1');
    expect(afterFirst?.lastCheckedAt[Platform.LINKEDIN]).toEqual(RUN_TIME);
    expect(afterFirst?.lastCheckedAt[Platform.INSTAGRAM]).toEqual(RUN_TIME);

    clock.advanceBy(60 * 60 * 1000);
    await useCase.execute();

    expect(linkedIn.calls[1]).toEqual({ clientId: 'c1', since: RUN_TIME });
    const afterSecond = await clients.getById('c1');
    expect(afterSecond?.lastCheckedAt[Platform.LINKEDIN]).toEqual(clock.now());
  });

  it('skips platforms that have a handle but no registered source, without error', async () => {
    const client = makeClient({ id: 'c1', socialHandles: { [Platform.GOOGLE_RSS]: 'feed' } });
    const linkedIn = new FakeSignalSource({ platform: Platform.LINKEDIN });
    const { useCase, clients } = setup([client], [linkedIn]);

    const summary = await useCase.execute();

    expect(summary.clientsChecked).toBe(1);
    expect(summary.errors).toEqual([]);
    expect((await clients.getById('c1'))?.lastCheckedAt[Platform.GOOGLE_RSS]).toBeUndefined();
  });

  // Story 4: an item without a source URL is counted as needing review, never shown.
  it('does not save signals without a usable source URL and counts them', async () => {
    const client = makeClient({ id: 'c1' });
    const linkedIn = new FakeSignalSource({
      platform: Platform.LINKEDIN,
      signals: [
        makeSignal({ clientId: 'c1', platform: Platform.LINKEDIN, externalId: 'ok' }),
        makeSignal({ clientId: 'c1', platform: Platform.LINKEDIN, externalId: 'blank', url: ' ' }),
        makeSignal({
          clientId: 'c1',
          platform: Platform.LINKEDIN,
          externalId: 'bad',
          url: 'not a link',
        }),
      ],
    });
    const { useCase, signals } = setup([client], [linkedIn]);

    const summary = await useCase.execute();

    expect(summary).toMatchObject({ signalsFound: 3, newSignalsSaved: 1, signalsMissingSource: 2 });
    expect(signals.all().map((s) => s.externalId)).toEqual(['ok']);
  });

  // Phase 1 "Check now": checking one brand leaves the others alone.
  it('checks only the requested clients when clientIds is given', async () => {
    const linkedIn = new FakeSignalSource({ platform: Platform.LINKEDIN });
    const { useCase } = setup([makeClient({ id: 'c1' }), makeClient({ id: 'c2' })], [linkedIn]);

    const summary = await useCase.execute({ clientIds: ['c2'] });

    expect(summary.clientsChecked).toBe(1);
    expect(linkedIn.calls.map((call) => call.clientId)).toEqual(['c2']);
  });

  it('records each account checked, including ones with no source connected', async () => {
    const client = makeClient({
      id: 'c1',
      socialHandles: { [Platform.LINKEDIN]: 'test-li', [Platform.TIKTOK]: 'test-tt' },
    });
    const linkedIn = new FakeSignalSource({
      platform: Platform.LINKEDIN,
      signals: [makeSignal({ clientId: 'c1', platform: Platform.LINKEDIN, externalId: 'a' })],
    });
    const { useCase } = setup([client], [linkedIn]);

    const summary = await useCase.execute();

    expect(summary.checks).toEqual([
      expect.objectContaining({
        clientId: 'c1',
        clientName: 'Test Client c1',
        platform: Platform.LINKEDIN,
        handle: 'test-li',
        signalsFound: 1,
        newSignalsSaved: 1,
        sourceConnected: true,
        error: null,
        attempts: 1,
      }),
      expect.objectContaining({ platform: Platform.TIKTOK, sourceConnected: false, error: null }),
    ]);
    expect(summary.clientIds).toBeNull();
  });

  it('checkAccount reports a source failure in its result instead of throwing', async () => {
    const client = makeClient({ id: 'c1' });
    const linkedIn = new FakeSignalSource({ platform: Platform.LINKEDIN });
    jest.spyOn(linkedIn, 'fetchSignals').mockRejectedValueOnce(new Error('rate limited'));
    const { useCase, clients } = setup([client], [linkedIn]);

    const result = await useCase.checkAccount(client, Platform.LINKEDIN, 2);

    expect(result.check).toMatchObject({ error: 'rate limited', attempts: 2 });
    expect(result.errors).toHaveLength(1);
    // A failed check does not move the checkpoint, so the next try fetches the same window.
    expect((await clients.getById('c1'))?.lastCheckedAt[Platform.LINKEDIN]).toBeUndefined();
  });
});
