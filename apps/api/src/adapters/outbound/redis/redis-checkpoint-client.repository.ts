import type { OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Client, Platform, SocialHandles } from '../../../core/domain';
import { ClientRepositoryPort } from '../../../core/ports';
import { redisKey } from './redis-connection';

/**
 * Keeps each account's "last checked" time in Redis, around another client repository.
 *
 * The checkpoint is what makes monitoring incremental: the first check of an account has none,
 * so it collects whatever history the source returns; every later check only keeps posts
 * published after it. Without this, the times lived in memory and every API restart made the
 * next run fetch and show the same old posts again.
 */
export class RedisCheckpointClientRepository extends ClientRepositoryPort implements OnModuleInit {
  private readonly key: string;

  constructor(
    private readonly inner: ClientRepositoryPort,
    private readonly redis: Redis,
    prefix: string,
  ) {
    super();
    this.key = redisKey(prefix, 'monitoring', 'checkpoints');
  }

  /** Load saved checkpoints into the inner repository at start-up. */
  async onModuleInit(): Promise<void> {
    const saved = await this.redis.hgetall(this.key);
    const known = new Set((await this.inner.listActiveClients()).map((c) => c.id));
    for (const [field, iso] of Object.entries(saved)) {
      const [clientId, platform] = field.split('|') as [string, Platform];
      if (known.has(clientId)) {
        await this.inner.updateLastChecked(clientId, platform, new Date(iso));
      }
    }
  }

  listActiveClients(): Promise<Client[]> {
    return this.inner.listActiveClients();
  }

  getById(id: string): Promise<Client | null> {
    return this.inner.getById(id);
  }

  add(client: Client): Promise<void> {
    return this.inner.add(client);
  }

  async remove(id: string): Promise<boolean> {
    const removed = await this.inner.remove(id);
    if (removed) {
      // A brand added again later starts fresh, with its history.
      const fields = Object.keys(await this.redis.hgetall(this.key)).filter((f) =>
        f.startsWith(`${id}|`),
      );
      if (fields.length > 0) await this.redis.hdel(this.key, ...fields);
    }
    return removed;
  }

  async updateHandles(id: string, handles: SocialHandles): Promise<boolean> {
    const before = await this.inner.getById(id);
    const updated = await this.inner.updateHandles(id, handles);
    if (updated && before !== null) {
      // A changed or removed account is a different account: its next check starts fresh.
      const changed = (Object.keys(before.socialHandles) as Platform[]).filter(
        (p) => before.socialHandles[p] !== handles[p],
      );
      if (changed.length > 0) await this.redis.hdel(this.key, ...changed.map((p) => `${id}|${p}`));
    }
    return updated;
  }

  async updateLastChecked(clientId: string, platform: Platform, timestamp: Date): Promise<void> {
    await this.inner.updateLastChecked(clientId, platform, timestamp);
    await this.redis.hset(this.key, `${clientId}|${platform}`, timestamp.toISOString());
  }
}
