import type { Client, Platform, SocialHandles } from '../domain';

export abstract class ClientRepositoryPort {
  /** Clients that should be monitored. What counts as "active" is the repository's rule. */
  abstract listActiveClients(): Promise<Client[]>;

  /** @returns the client, or `null` if there is none with that id. */
  abstract getById(id: string): Promise<Client | null>;

  /** Store a new client. The id must not already be used. */
  abstract add(client: Client): Promise<void>;

  /** @returns `false` if there is no client with that id. */
  abstract remove(id: string): Promise<boolean>;

  /** Replace the client's handles. @returns `false` if there is no client with that id. */
  abstract updateHandles(id: string, handles: SocialHandles): Promise<boolean>;

  /** Record that `platform` was successfully checked for the client at `timestamp`. */
  abstract updateLastChecked(clientId: string, platform: Platform, timestamp: Date): Promise<void>;
}
