import { FakeClock, InMemorySignalRepository } from '../../src/adapters/outbound/fakes';
import { SkipSignalUseCase } from '../../src/core/application';
import { Platform, SignalNotFoundError, SignalType } from '../../src/core/domain';
import type { Signal } from '../../src/core/domain';

// All data below is invented for tests. Each test maps to a story 8b criterion.
const NOW = new Date('2026-11-17T01:00:00.000Z');

function signal(externalId: string, publishedAt: string): Signal {
  return {
    id: `sig-${externalId}`,
    clientId: 'c1',
    platform: Platform.LINKEDIN,
    signalType: SignalType.NEW_POST,
    content: 'Test content',
    url: `https://example.test/${externalId}`,
    externalId,
    publishedAt: new Date(publishedAt),
    collectedAt: NOW,
    raw: {},
  };
}

async function setup() {
  const repo = new InMemorySignalRepository();
  await repo.saveMany([signal('a', '2026-11-10T00:00:00Z'), signal('b', '2026-11-11T00:00:00Z')]);
  const useCase = new SkipSignalUseCase(repo, new FakeClock(NOW));
  const ids = async (view: 'to_review' | 'skipped') =>
    (await repo.list({ view, page: 1, pageSize: 10 })).items.map((s) => s.id);
  return { repo, useCase, ids };
}

describe('SkipSignalUseCase (story 8b)', () => {
  it('removes a skipped signal from the to-review list and records when', async () => {
    const { repo, useCase, ids } = await setup();

    await useCase.skip('sig-a');

    expect(await ids('to_review')).toEqual(['sig-b']);
    const skipped = await repo.list({ view: 'skipped', page: 1, pageSize: 10 });
    expect(skipped.items.map((s) => [s.id, s.skippedAt])).toEqual([['sig-a', NOW]]);
  });

  it('keeps a signal skipped when a later run fetches it again', async () => {
    const { repo, useCase, ids } = await setup();
    await useCase.skip('sig-a');

    await repo.saveMany([signal('a', '2026-11-10T00:00:00Z')]);

    expect(await ids('to_review')).toEqual(['sig-b']);
  });

  it('still shows a new, different signal for the same client', async () => {
    const { repo, useCase, ids } = await setup();
    await useCase.skip('sig-a');

    await repo.saveMany([signal('c', '2026-11-12T00:00:00Z')]);

    expect(await ids('to_review')).toEqual(['sig-c', 'sig-b']);
  });

  it('returns a signal to the to-review list on undo', async () => {
    const { useCase, ids } = await setup();
    await useCase.skip('sig-a');

    await useCase.undo('sig-a');

    expect(await ids('to_review')).toEqual(['sig-b', 'sig-a']);
    expect(await ids('skipped')).toEqual([]);
  });

  it('rejects an unknown signal id', async () => {
    const { useCase } = await setup();
    await expect(useCase.skip('nope')).rejects.toBeInstanceOf(SignalNotFoundError);
    await expect(useCase.undo('nope')).rejects.toBeInstanceOf(SignalNotFoundError);
  });
});
