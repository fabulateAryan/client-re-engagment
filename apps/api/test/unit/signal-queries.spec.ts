import {
  InMemoryClientRepository,
  InMemoryDraftRepository,
  InMemorySignalRepository,
} from '../../src/adapters/outbound/fakes';
import { GetSignalSummaryUseCase, ListSignalsUseCase } from '../../src/core/application';
import { Platform, SignalType } from '../../src/core/domain';
import type { Signal } from '../../src/core/domain';

// Invented test data only.
function signal(externalId: string, overrides: Partial<Signal> = {}): Signal {
  return {
    id: `sig-${externalId}`,
    clientId: 'c1',
    platform: Platform.LINKEDIN,
    signalType: SignalType.NEW_POST,
    content: 'Test content',
    url: `https://example.test/${externalId}`,
    externalId,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    collectedAt: new Date('2026-01-02T00:00:00.000Z'),
    raw: {},
    ...overrides,
  };
}

async function setup() {
  const signals = new InMemorySignalRepository();
  await signals.saveMany([
    signal('old', { publishedAt: new Date('2026-01-01T00:00:00.000Z') }),
    signal('new', {
      publishedAt: new Date('2026-01-03T00:00:00.000Z'),
      signalType: SignalType.HIRING,
    }),
    signal('mid', {
      publishedAt: new Date('2026-01-02T00:00:00.000Z'),
      platform: Platform.INSTAGRAM,
      clientId: 'c2',
    }),
  ]);
  const clients = new InMemoryClientRepository([
    {
      id: 'c1',
      name: 'Test Client One',
      socialHandles: {},
      lastActiveDate: new Date('2025-01-01T00:00:00.000Z'),
      lastCheckedAt: {},
    },
  ]);
  return { signals, list: new ListSignalsUseCase(signals, clients, new InMemoryDraftRepository()) };
}

describe('ListSignalsUseCase', () => {
  it('returns newest first with client names (null when the client is unknown)', async () => {
    const { list } = await setup();

    const page = await list.execute({ page: 1, pageSize: 10 });

    expect(page.total).toBe(3);
    expect(page.items.map((v) => v.signal.externalId)).toEqual(['new', 'mid', 'old']);
    expect(page.items.map((v) => v.clientName)).toEqual([
      'Test Client One',
      null,
      'Test Client One',
    ]);
  });

  it('filters by client, platform and signal type', async () => {
    const { list } = await setup();

    const byClient = await list.execute({ clientId: 'c2', page: 1, pageSize: 10 });
    const byPlatform = await list.execute({ platform: Platform.LINKEDIN, page: 1, pageSize: 10 });
    const byType = await list.execute({ signalType: SignalType.HIRING, page: 1, pageSize: 10 });

    expect(byClient.items.map((v) => v.signal.externalId)).toEqual(['mid']);
    expect(byPlatform.total).toBe(2);
    expect(byType.items.map((v) => v.signal.externalId)).toEqual(['new']);
  });

  it('paginates', async () => {
    const { list } = await setup();

    const second = await list.execute({ page: 2, pageSize: 2 });

    expect(second).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(second.items.map((v) => v.signal.externalId)).toEqual(['old']);
  });
});

describe('GetSignalSummaryUseCase', () => {
  it('counts by platform and type and reports the latest publish time', async () => {
    const { signals } = await setup();

    const summary = await new GetSignalSummaryUseCase(signals).execute();

    expect(summary).toEqual({
      total: 3,
      byPlatform: { LINKEDIN: 2, INSTAGRAM: 1 },
      bySignalType: { NEW_POST: 2, HIRING: 1 },
      latestPublishedAt: new Date('2026-01-03T00:00:00.000Z'),
      minScore: 0,
      maxAgeDays: 0,
    });
  });
});
