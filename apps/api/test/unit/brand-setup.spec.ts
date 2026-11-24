import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileBackedClientRepository } from '../../src/adapters/outbound/clients-file/file-backed-client.repository';
import { loadClientsFile } from '../../src/adapters/outbound/clients-file/clients-file.loader';
import { FakeClock, InMemoryClientRepository } from '../../src/adapters/outbound/fakes';
import { AddBrandUseCase, RemoveBrandUseCase } from '../../src/core/application';
import {
  ClientNotFoundError,
  DuplicateBrandError,
  InvalidBrandError,
  Platform,
  brandIdFrom,
  normaliseInstagramAccount,
  normaliseLinkedInCompanyUrl,
  normaliseTikTokAccount,
  normaliseWebsite,
} from '../../src/core/domain';

// Invented brands only.
describe('normaliseLinkedInCompanyUrl', () => {
  it.each([
    ['https://www.linkedin.com/company/example-brand/', 'example-brand'],
    ['linkedin.com/company/Example-Brand', 'example-brand'],
    ['https://au.linkedin.com/company/example-brand/posts/?feedView=all', 'example-brand'],
    ['www.linkedin.com/company/example.brand', 'example.brand'],
  ])('accepts %s', (input, slug) => {
    expect(normaliseLinkedInCompanyUrl(input)).toBe(`https://www.linkedin.com/company/${slug}/`);
  });

  it.each([
    '',
    'example-brand',
    'https://www.linkedin.com/in/some-person/',
    'https://www.linkedin.com/company/',
    'https://evil.example/company/example-brand/',
  ])('rejects %s', (input) => {
    expect(normaliseLinkedInCompanyUrl(input)).toBeNull();
  });
});

describe('normaliseInstagramAccount', () => {
  it.each([
    '@example.brand',
    'Example.Brand',
    'instagram.com/example.brand',
    'https://www.instagram.com/example.brand/?hl=en',
  ])('accepts %s', (input) => {
    expect(normaliseInstagramAccount(input)).toBe('https://www.instagram.com/example.brand/');
  });

  it.each([
    '',
    'https://www.instagram.com/p/AbC123/',
    'https://www.instagram.com/',
    'https://evil.example/example.brand',
    'example..brand',
    'has space',
  ])('rejects %s', (input) => {
    expect(normaliseInstagramAccount(input)).toBeNull();
  });
});

describe('normaliseTikTokAccount', () => {
  it.each([
    '@example_brand',
    'example_brand',
    'tiktok.com/@Example_Brand',
    'https://www.tiktok.com/@example_brand/video/123456789',
  ])('accepts %s', (input) => {
    expect(normaliseTikTokAccount(input)).toBe('https://www.tiktok.com/@example_brand');
  });

  it.each(['', 'https://www.tiktok.com/explore', 'https://evil.example/@example_brand', 'a'])(
    'rejects %s',
    (input) => {
      expect(normaliseTikTokAccount(input)).toBeNull();
    },
  );
});

describe('normaliseWebsite and brandIdFrom', () => {
  it('reduces a website link to its domain', () => {
    expect(normaliseWebsite('https://www.Example.com.au/shop?x=1')).toBe('example.com.au');
    expect(normaliseWebsite('example.com')).toBe('example.com');
    expect(normaliseWebsite('not a site')).toBeNull();
    expect(normaliseWebsite('')).toBeNull();
  });

  it('makes a unique, readable id', () => {
    expect(brandIdFrom('Example Brand & Co.', new Set())).toBe('example-brand-co');
    expect(brandIdFrom('Example Brand', new Set(['example-brand']))).toBe('example-brand-2');
    expect(brandIdFrom('!!!', new Set())).toBe('brand');
  });
});

describe('AddBrandUseCase', () => {
  const setup = () => {
    const repo = new InMemoryClientRepository();
    return { repo, add: new AddBrandUseCase(repo), remove: new RemoveBrandUseCase(repo) };
  };

  it('sets up a brand from a name and LinkedIn page, ready to monitor', async () => {
    const { repo, add } = setup();

    const client = await add.execute({
      name: '  Example   Brand ',
      linkedInUrl: 'linkedin.com/company/example-brand',
    });

    expect(client).toMatchObject({
      id: 'example-brand',
      name: 'Example Brand',
      socialHandles: { [Platform.LINKEDIN]: 'https://www.linkedin.com/company/example-brand/' },
      lastCheckedAt: {},
    });
    expect(await repo.getById('example-brand')).toEqual(client);
  });

  it('also watches news when a website is given', async () => {
    const { add } = setup();
    const client = await add.execute({
      name: 'Example Brand',
      linkedInUrl: 'https://www.linkedin.com/company/example-brand/',
      website: 'https://www.example.com/',
    });
    expect(client.socialHandles[Platform.GOOGLE_RSS]).toBe('example.com');
  });

  it('saves Instagram and TikTok accounts when given', async () => {
    const { add } = setup();
    const client = await add.execute({
      name: 'Example Brand',
      linkedInUrl: 'https://www.linkedin.com/company/example-brand/',
      instagram: '@example.brand',
      tiktok: 'tiktok.com/@example_brand',
    });
    expect(client.socialHandles[Platform.INSTAGRAM]).toBe(
      'https://www.instagram.com/example.brand/',
    );
    expect(client.socialHandles[Platform.TIKTOK]).toBe('https://www.tiktok.com/@example_brand');
  });

  it('leaves out blank optional accounts and rejects invalid ones', async () => {
    const { add } = setup();
    const linkedInUrl = 'https://www.linkedin.com/company/example-brand/';
    const client = await add.execute({ name: 'Example', linkedInUrl, instagram: ' ', tiktok: '' });
    expect(Object.keys(client.socialHandles)).toEqual([Platform.LINKEDIN]);
    await expect(
      add.execute({
        name: 'Other',
        linkedInUrl: 'linkedin.com/company/other',
        instagram: 'instagram.com/p/AbC/',
      }),
    ).rejects.toBeInstanceOf(InvalidBrandError);
    await expect(
      add.execute({ name: 'Other', linkedInUrl: 'linkedin.com/company/other', tiktok: 'a' }),
    ).rejects.toBeInstanceOf(InvalidBrandError);
  });

  it('rejects a missing name, a non-company LinkedIn link and a bad website', async () => {
    const { add } = setup();
    const linkedInUrl = 'https://www.linkedin.com/company/example-brand/';
    await expect(add.execute({ name: ' ', linkedInUrl })).rejects.toBeInstanceOf(InvalidBrandError);
    await expect(
      add.execute({ name: 'Example', linkedInUrl: 'https://www.linkedin.com/in/a-person/' }),
    ).rejects.toBeInstanceOf(InvalidBrandError);
    await expect(
      add.execute({ name: 'Example', linkedInUrl, website: 'nope' }),
    ).rejects.toBeInstanceOf(InvalidBrandError);
  });

  it('refuses the same LinkedIn page twice, however it is written', async () => {
    const { add } = setup();
    await add.execute({ name: 'Example', linkedInUrl: 'linkedin.com/company/example-brand' });
    await expect(
      add.execute({
        name: 'Example again',
        linkedInUrl: 'https://www.linkedin.com/company/Example-Brand/about/',
      }),
    ).rejects.toBeInstanceOf(DuplicateBrandError);
  });

  it('removes a brand, and reports an unknown one', async () => {
    const { repo, add, remove } = setup();
    await add.execute({ name: 'Example', linkedInUrl: 'linkedin.com/company/example-brand' });

    await remove.execute('example');

    expect(await repo.listActiveClients()).toEqual([]);
    await expect(remove.execute('example')).rejects.toBeInstanceOf(ClientNotFoundError);
  });
});

describe('FileBackedClientRepository', () => {
  let dir: string;
  let path: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'brands-'));
    path = join(dir, 'clients.json');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('creates the file, and the loader reads the brand back after a restart', async () => {
    const add = new AddBrandUseCase(new FileBackedClientRepository(path));
    await add.execute({ name: 'Example Brand', linkedInUrl: 'linkedin.com/company/example-brand' });

    const reloaded = loadClientsFile(path);
    expect(reloaded?.clients.map((c) => [c.id, c.socialHandles])).toEqual([
      ['example-brand', { LINKEDIN: 'https://www.linkedin.com/company/example-brand/' }],
    ]);
  });

  it('records when a brand was added, and reads it back after a restart', async () => {
    const added = new Date('2026-11-19T03:00:00.000Z');
    const add = new AddBrandUseCase(new FileBackedClientRepository(path), new FakeClock(added));
    await add.execute({ name: 'Example Brand', linkedInUrl: 'linkedin.com/company/example-brand' });

    expect(loadClientsFile(path)?.clients[0]?.addedAt).toEqual(added);
  });

  it('keeps other brands and their campaigns when adding and removing', async () => {
    const existing = {
      clients: [
        {
          id: 'kept-brand',
          name: 'Kept Brand',
          handles: { LINKEDIN: 'https://www.linkedin.com/company/kept-brand/' },
          campaigns: [{ name: 'Test Campaign', endDate: '2026-01-31' }],
        },
      ],
    };
    writeFileSync(path, JSON.stringify(existing));
    const repo = new FileBackedClientRepository(path, loadClientsFile(path)?.clients ?? []);

    await new AddBrandUseCase(repo).execute({
      name: 'New Brand',
      linkedInUrl: 'linkedin.com/company/new-brand',
    });
    await new RemoveBrandUseCase(repo).execute('new-brand');

    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(existing);
  });
});
