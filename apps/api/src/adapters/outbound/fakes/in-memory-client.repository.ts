import type { Client, Platform, SocialHandles } from '../../../core/domain';
import { ClientRepositoryPort } from '../../../core/ports';

/** Every stored client counts as active. The real rule is an open question. */
export class InMemoryClientRepository extends ClientRepositoryPort {
  private readonly clients = new Map<string, Client>();

  constructor(seed: readonly Client[] = []) {
    super();
    seed.forEach((client) => this.clients.set(client.id, client));
  }

  listActiveClients(): Promise<Client[]> {
    return Promise.resolve([...this.clients.values()]);
  }

  getById(id: string): Promise<Client | null> {
    return Promise.resolve(this.clients.get(id) ?? null);
  }

  add(client: Client): Promise<void> {
    if (this.clients.has(client.id)) {
      return Promise.reject(new Error(`Client id already used: ${client.id}`));
    }
    this.clients.set(client.id, client);
    return Promise.resolve();
  }

  remove(id: string): Promise<boolean> {
    return Promise.resolve(this.clients.delete(id));
  }

  updateHandles(id: string, handles: SocialHandles): Promise<boolean> {
    const client = this.clients.get(id);
    if (client === undefined) return Promise.resolve(false);
    // A changed or removed account is a different account, so it loses its checkpoint and
    // its first check collects history.
    const lastCheckedAt = Object.fromEntries(
      Object.entries(client.lastCheckedAt).filter(
        ([platform]) =>
          client.socialHandles[platform as Platform] === handles[platform as Platform],
      ),
    );
    this.clients.set(id, { ...client, socialHandles: { ...handles }, lastCheckedAt });
    return Promise.resolve(true);
  }

  updateLastChecked(clientId: string, platform: Platform, timestamp: Date): Promise<void> {
    const client = this.clients.get(clientId);
    if (client === undefined) {
      return Promise.reject(new Error(`Unknown client: ${clientId}`));
    }
    this.clients.set(clientId, {
      ...client,
      lastCheckedAt: { ...client.lastCheckedAt, [platform]: new Date(timestamp.getTime()) },
    });
    return Promise.resolve();
  }
}
