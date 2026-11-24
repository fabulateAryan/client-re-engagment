/**
 * Incremental monitoring: a first check collects history, later checks only new posts, a
 * changed account starts over, and a run's new signals can be listed on their own. Invented data.
 */
import {
  FakeClock,
  FakeSignalSource,
  InMemoryClientRepository,
  InMemorySignalRepository,
} from '../../src/adapters/outbound/fakes';
import { MonitorClientsUseCase } from '../../src/core/application';
import { Platform, SignalType } from '../../src/core/domain';
import type { Client, Signal } from '../../src/core/domain';

const FIRST_RUN = new Date('2026-11-18T00:00:00.000Z');
const SECOND_RUN = new Date('2026-11-19T00:00:00.000Z');

const BRAND: Client = {
  id: 'b1',
  name: 'Test Brand',
  socialHandles: { [Platform.INSTAGRAM]: 'old.handle' },
  lastActiveDate: null,
  lastCheckedAt: {},
};

function post(id: string, published: string, collected: Date): Signal {
  return {
    id: `INSTAGRAM:${id}`,
    clientId: 'b1',
    platform: Platform.INSTAGRAM,
    signalType: SignalType.NEW_POST,
    content: 'A post',
    url: `https://example.test/${id}`,
    externalId: id,
    publishedAt: new Date(published),
    collectedAt: collected,
    raw: {},
  };
}

describe('Incremental monitoring', () => {
  it('first check has no checkpoint (history); the next asks only for posts since it', async () => {
    const clients = new InMemoryClientRepository([BRAND]);
    const source = new FakeSignalSource({ platform: Platform.INSTAGRAM });
    const clock = new FakeClock(FIRST_RUN);
    const monitor = new MonitorClientsUseCase(
      clients,
      new InMemorySignalRepository(),
      [source],
      clock,
    );

    await monitor.execute();
    clock.set(SECOND_RUN);
    await monitor.execute({ clientIds: ['b1'] }); // "Check now" follows the same rule.

    expect(source.calls.map((c) => c.since)).toEqual([null, FIRST_RUN]);
  });

  it('a changed account loses its checkpoint, so its first check collects history', async () => {
    const clients = new InMemoryClientRepository([BRAND]);
    await clients.updateLastChecked('b1', Platform.INSTAGRAM, FIRST_RUN);

    await clients.updateHandles('b1', { [Platform.INSTAGRAM]: 'new.handle' });

    expect((await clients.getById('b1'))?.lastCheckedAt[Platform.INSTAGRAM]).toBeUndefined();
  });

  it('an unchanged account keeps its checkpoint when another account is added', async () => {
    const clients = new InMemoryClientRepository([BRAND]);
    await clients.updateLastChecked('b1', Platform.INSTAGRAM, FIRST_RUN);

    await clients.updateHandles('b1', {
      [Platform.INSTAGRAM]: 'old.handle',
      [Platform.TIKTOK]: 'new.tiktok',
    });

    expect((await clients.getById('b1'))?.lastCheckedAt[Platform.INSTAGRAM]).toEqual(FIRST_RUN);
  });

  it('lists only the signals a run collected when asked for them', async () => {
    const repo = new InMemorySignalRepository();
    await repo.saveMany([
      post('old', '2026-11-10T00:00:00.000Z', FIRST_RUN),
      post('new', '2026-11-18T12:00:00.000Z', SECOND_RUN),
    ]);

    const page = await repo.list({ page: 1, pageSize: 10, collectedSince: SECOND_RUN });

    expect(page.items.map((s) => s.externalId)).toEqual(['new']);
    expect((await repo.list({ page: 1, pageSize: 10 })).total).toBe(2);
  });

  it('never looks back further than the window: a first check starts 90 days ago', async () => {
    const clients = new InMemoryClientRepository([BRAND]);
    const source = new FakeSignalSource({ platform: Platform.INSTAGRAM });
    const clock = new FakeClock(SECOND_RUN);
    const monitor = new MonitorClientsUseCase(
      clients,
      new InMemorySignalRepository(),
      [source],
      clock,
      90,
    );

    await monitor.execute();

    expect(source.calls[0]?.since).toEqual(new Date('2026-08-21T00:00:00.000Z'));
  });

  it('a full run skips accounts checked within the recheck window; Check now does not', async () => {
    const clients = new InMemoryClientRepository([
      BRAND,
      { ...BRAND, id: 'b2', name: 'Other Brand' },
    ]);
    // b1 was checked 30 minutes ago, b2 two hours ago.
    await clients.updateLastChecked(
      'b1',
      Platform.INSTAGRAM,
      new Date(SECOND_RUN.getTime() - 30 * 60_000),
    );
    await clients.updateLastChecked(
      'b2',
      Platform.INSTAGRAM,
      new Date(SECOND_RUN.getTime() - 120 * 60_000),
    );
    const monitor = new MonitorClientsUseCase(
      clients,
      new InMemorySignalRepository(),
      [new FakeSignalSource({ platform: Platform.INSTAGRAM })],
      new FakeClock(SECOND_RUN),
      90,
      60,
    );

    const full = await monitor.plan();
    expect(full.map((e) => [e.client.id, e.platforms, e.upToDate])).toEqual([
      ['b1', [], [Platform.INSTAGRAM]],
      ['b2', [Platform.INSTAGRAM], []],
    ]);

    const checkNow = await monitor.plan({ clientIds: ['b1'] });
    expect(checkNow[0]?.platforms).toEqual([Platform.INSTAGRAM]);
  });

  it('hides posts older than the window from lists, without deleting them', async () => {
    const repo = new InMemorySignalRepository({
      maxAgeDays: 90,
      now: () => SECOND_RUN.getTime(),
    });
    await repo.saveMany([
      post('three-months-ago', '2026-08-03T00:00:00.000Z', FIRST_RUN),
      post('last-month', '2026-10-19T00:00:00.000Z', FIRST_RUN),
    ]);

    const page = await repo.list({ page: 1, pageSize: 10 });
    expect(page.items.map((s) => s.externalId)).toEqual(['last-month']);
    expect(repo.all()).toHaveLength(2);
  });
});
