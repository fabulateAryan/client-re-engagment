import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { Client, SocialHandles } from '../../../core/domain';
import { InMemoryClientRepository } from '../fakes/in-memory-client.repository';

interface RawFile {
  clients: Record<string, unknown>[];
  [key: string]: unknown;
}

/**
 * Brands set up in the app are written to the clients file, so they survive a restart.
 * Only the `clients` entries this repository adds or removes change; everything else in the
 * file (other brands' campaigns, profiles, extra keys) is kept as it is.
 * Last-checked times stay in memory only.
 */
export class FileBackedClientRepository extends InMemoryClientRepository {
  constructor(
    private readonly path: string,
    seed: readonly Client[] = [],
  ) {
    super(seed);
  }

  override async add(client: Client): Promise<void> {
    this.update((file) => {
      file.clients.push({
        id: client.id,
        name: client.name,
        handles: { ...client.socialHandles },
        lastActiveDate: null,
        ...(client.addedAt != null && { addedAt: client.addedAt.toISOString() }),
      });
    });
    await super.add(client);
  }

  override async remove(id: string): Promise<boolean> {
    const removed = await super.remove(id);
    if (removed) {
      this.update((file) => {
        file.clients = file.clients.filter((entry) => entry.id !== id);
      });
    }
    return removed;
  }

  override async updateHandles(id: string, handles: SocialHandles): Promise<boolean> {
    const updated = await super.updateHandles(id, handles);
    if (updated) {
      this.update((file) => {
        const entry = file.clients.find((e) => e.id === id);
        if (entry !== undefined) entry.handles = { ...handles };
      });
    }
    return updated;
  }

  private update(change: (file: RawFile) => void): void {
    const file = this.read();
    change(file);
    // Write then rename, so a crash never leaves a half-written file.
    const temp = `${this.path}.tmp`;
    writeFileSync(temp, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
    renameSync(temp, this.path);
  }

  private read(): RawFile {
    if (!existsSync(this.path)) return { clients: [] };
    const parsed: unknown = JSON.parse(readFileSync(this.path, 'utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray((parsed as RawFile).clients)
    ) {
      throw new Error(`Clients file ${this.path} has no "clients" list; not changing it.`);
    }
    return parsed as RawFile;
  }
}
