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
  normaliseYouTubeChannel,
} from '../domain';
import type { BrandInput, Client, SocialHandles } from '../domain';
import type { ClientRepositoryPort, ClockPort } from '../ports';

const MAX_NAME_LENGTH = 120;

/**
 * Phase 1 manual brand setup: a person enters a brand name and its LinkedIn company page,
 * and optionally a website (for news) and Instagram, TikTok and YouTube accounts. The brand
 * is monitored from the next check.
 */
export class AddBrandUseCase {
  constructor(
    private readonly clients: ClientRepositoryPort,
    /** Stamps when the brand was added (newest brands are listed first). */
    private readonly clock: ClockPort | null = null,
  ) {}

  /**
   * @throws InvalidBrandError when the name, LinkedIn link or website is not valid.
   * @throws DuplicateBrandError when a brand with the same LinkedIn page exists.
   */
  async execute(input: BrandInput): Promise<Client> {
    const name = input.name.trim().replace(/\s+/g, ' ');
    if (name === '') throw new InvalidBrandError('Enter the brand name.');
    if (name.length > MAX_NAME_LENGTH) {
      throw new InvalidBrandError(`Keep the brand name under ${MAX_NAME_LENGTH} characters.`);
    }

    const linkedIn = normaliseLinkedInCompanyUrl(input.linkedInUrl);
    if (linkedIn === null) {
      throw new InvalidBrandError(
        'Enter the LinkedIn company page link, like https://www.linkedin.com/company/brand-name/',
      );
    }

    const websiteEntered = (input.website ?? '').trim() !== '';
    const website = normaliseWebsite(input.website);
    if (websiteEntered && website === null) {
      throw new InvalidBrandError('Enter the website as a domain, like example.com.');
    }

    const instagram = optionalAccount(
      input.instagram,
      normaliseInstagramAccount,
      'Enter the Instagram account as @name or its profile link.',
    );
    const tiktok = optionalAccount(
      input.tiktok,
      normaliseTikTokAccount,
      'Enter the TikTok account as @name or its profile link.',
    );
    const youtube = optionalAccount(
      input.youtube,
      normaliseYouTubeChannel,
      'Enter the YouTube channel as @handle or its channel link.',
    );

    const existing = await this.clients.listActiveClients();
    const duplicate = existing.find(
      (c) => normaliseLinkedInCompanyUrl(c.socialHandles[Platform.LINKEDIN] ?? '') === linkedIn,
    );
    if (duplicate !== undefined) throw new DuplicateBrandError(duplicate.id);

    const socialHandles: SocialHandles = {
      [Platform.LINKEDIN]: linkedIn,
      ...(website !== null && { [Platform.GOOGLE_RSS]: website }),
      ...(instagram !== null && { [Platform.INSTAGRAM]: instagram }),
      ...(tiktok !== null && { [Platform.TIKTOK]: tiktok }),
      ...(youtube !== null && { [Platform.YOUTUBE]: youtube }),
    };

    const client: Client = {
      id: brandIdFrom(name, new Set(existing.map((c) => c.id))),
      name,
      socialHandles,
      lastActiveDate: null,
      lastCheckedAt: {},
      addedAt: this.clock?.now() ?? null,
    };
    await this.clients.add(client);
    return client;
  }
}

/** An optional account: `null` when left blank, otherwise normalised or rejected. */
function optionalAccount(
  value: string | null | undefined,
  normalise: (input: string) => string | null,
  message: string,
): string | null {
  if ((value ?? '').trim() === '') return null;
  const account = normalise(value ?? '');
  if (account === null) throw new InvalidBrandError(message);
  return account;
}

/**
 * Accounts that can be changed on an existing brand. The LinkedIn page cannot: it is what
 * identifies the brand. For each field, `undefined` keeps it, blank removes it, and any other
 * text is checked like in brand setup.
 */
export interface BrandAccountChanges {
  readonly website?: string | null;
  readonly instagram?: string | null;
  readonly tiktok?: string | null;
  readonly youtube?: string | null;
}

const EDITABLE: readonly {
  key: keyof BrandAccountChanges;
  platform: Platform;
  normalise: (input: string) => string | null;
  message: string;
}[] = [
  {
    key: 'website',
    platform: Platform.GOOGLE_RSS,
    normalise: normaliseWebsite,
    message: 'Enter the website as a domain, like example.com.',
  },
  {
    key: 'instagram',
    platform: Platform.INSTAGRAM,
    normalise: normaliseInstagramAccount,
    message: 'Enter the Instagram account as @name or its profile link.',
  },
  {
    key: 'tiktok',
    platform: Platform.TIKTOK,
    normalise: normaliseTikTokAccount,
    message: 'Enter the TikTok account as @name or its profile link.',
  },
  {
    key: 'youtube',
    platform: Platform.YOUTUBE,
    normalise: normaliseYouTubeChannel,
    message: 'Enter the YouTube channel as @handle or its channel link.',
  },
];

/** Add, change or remove a brand's other accounts after it was set up. */
export class UpdateBrandAccountsUseCase {
  constructor(private readonly clients: ClientRepositoryPort) {}

  /**
   * @throws ClientNotFoundError when there is no brand with this id.
   * @throws InvalidBrandError when an entered account is not valid. Nothing is saved then.
   */
  async execute(clientId: string, changes: BrandAccountChanges): Promise<Client> {
    const client = await this.clients.getById(clientId);
    if (client === null) throw new ClientNotFoundError(clientId);

    const next = new Map(Object.entries(client.socialHandles) as [Platform, string][]);
    for (const field of EDITABLE) {
      const value = changes[field.key];
      if (value === undefined) continue;
      const trimmed = (value ?? '').trim();
      if (trimmed === '') {
        next.delete(field.platform);
      } else if (trimmed !== client.socialHandles[field.platform]) {
        // Unchanged values are kept as stored (e.g. a news search with keywords).
        next.set(field.platform, optionalAccount(trimmed, field.normalise, field.message) ?? '');
      }
    }
    const handles = Object.fromEntries(next) as SocialHandles;

    if (!(await this.clients.updateHandles(clientId, handles))) {
      throw new ClientNotFoundError(clientId);
    }
    return { ...client, socialHandles: handles };
  }
}

/** Stop monitoring a brand. Signals already collected are kept. */
export class RemoveBrandUseCase {
  constructor(private readonly clients: ClientRepositoryPort) {}

  /** @throws ClientNotFoundError when there is no brand with this id. */
  async execute(clientId: string): Promise<void> {
    if (!(await this.clients.remove(clientId))) throw new ClientNotFoundError(clientId);
  }
}
