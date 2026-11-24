/** Editing an existing brand's accounts. All brands and handles are invented placeholders. */
import { InMemoryClientRepository } from '../../src/adapters/outbound/fakes';
import { UpdateBrandAccountsUseCase } from '../../src/core/application';
import {
  ClientNotFoundError,
  InvalidBrandError,
  Platform,
  normaliseLinkedInCompanyUrl,
  normaliseYouTubeChannel,
} from '../../src/core/domain';
import type { Client } from '../../src/core/domain';

const BRAND: Client = {
  id: 'placeholder-brand',
  name: 'Placeholder Brand',
  socialHandles: {
    [Platform.LINKEDIN]: 'https://www.linkedin.com/company/placeholder-brand/',
    [Platform.INSTAGRAM]: 'https://www.instagram.com/placeholder/',
    [Platform.GOOGLE_RSS]: 'placeholder.example | Australia',
  },
  lastActiveDate: null,
  lastCheckedAt: {},
};

function setup() {
  const clients = new InMemoryClientRepository([BRAND]);
  return { clients, update: new UpdateBrandAccountsUseCase(clients) };
}

describe('UpdateBrandAccountsUseCase', () => {
  it('adds new accounts and keeps the ones it was not given', async () => {
    const { clients, update } = setup();
    await update.execute(BRAND.id, { tiktok: '@placeholder', youtube: 'youtube.com/placeholder' });
    expect((await clients.getById(BRAND.id))?.socialHandles).toEqual({
      ...BRAND.socialHandles,
      [Platform.TIKTOK]: 'https://www.tiktok.com/@placeholder',
      [Platform.YOUTUBE]: 'https://www.youtube.com/@placeholder',
    });
  });

  it('removes an account sent as blank and never touches LinkedIn', async () => {
    const { clients, update } = setup();
    await update.execute(BRAND.id, { instagram: '' });
    const handles = (await clients.getById(BRAND.id))?.socialHandles;
    expect(handles?.[Platform.INSTAGRAM]).toBeUndefined();
    expect(handles?.[Platform.LINKEDIN]).toBe(BRAND.socialHandles[Platform.LINKEDIN]);
  });

  it('keeps an unchanged news search with keywords as it is', async () => {
    const { clients, update } = setup();
    await update.execute(BRAND.id, { website: 'placeholder.example | Australia' });
    expect((await clients.getById(BRAND.id))?.socialHandles[Platform.GOOGLE_RSS]).toBe(
      'placeholder.example | Australia',
    );
  });

  it('saves nothing when one account is invalid', async () => {
    const { clients, update } = setup();
    await expect(
      update.execute(BRAND.id, {
        tiktok: '@placeholder',
        youtube: 'https://www.youtube.com/watch?v=1',
      }),
    ).rejects.toBeInstanceOf(InvalidBrandError);
    expect((await clients.getById(BRAND.id))?.socialHandles).toEqual(BRAND.socialHandles);
  });

  it('rejects an unknown brand', async () => {
    const { update } = setup();
    await expect(update.execute('nobody', { tiktok: '@x' })).rejects.toBeInstanceOf(
      ClientNotFoundError,
    );
  });
});

describe('link formats seen in the app', () => {
  it('accepts a LinkedIn company link with trailing slash and spaces', () => {
    expect(normaliseLinkedInCompanyUrl(' https://www.linkedin.com/company/placeholder/ ')).toBe(
      'https://www.linkedin.com/company/placeholder/',
    );
  });

  it('accepts older YouTube custom links', () => {
    expect(normaliseYouTubeChannel('https://www.youtube.com/placeholder')).toBe(
      'https://www.youtube.com/@placeholder',
    );
    expect(normaliseYouTubeChannel('https://www.youtube.com/@Placeholder')).toBe(
      'https://www.youtube.com/@placeholder',
    );
  });
});
