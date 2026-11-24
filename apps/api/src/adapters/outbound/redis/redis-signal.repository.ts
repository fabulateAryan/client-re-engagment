import type { OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { reclassifySignal, signalIdentityKey } from '../../../core/domain';
import type { Signal } from '../../../core/domain';
import { InMemorySignalRepository } from '../fakes/in-memory-signal.repository';
import { redisKey } from './redis-connection';

type StoredSignal = Omit<Signal, 'publishedAt' | 'collectedAt'> & {
  publishedAt: string;
  collectedAt: string;
};

/**
 * Signals kept in Redis, so collected posts (and which ones were skipped) survive restarts.
 *
 * It works like the in-memory repository, which it extends: everything is loaded at start-up
 * and queries run in memory, and every new signal or skip is also written to Redis. That suits
 * the current volume (hundreds to a few thousand signals); a database would replace it at scale.
 */
export class RedisSignalRepository extends InMemorySignalRepository implements OnModuleInit {
  private readonly signalsKey: string;
  private readonly skippedKey: string;

  constructor(
    private readonly redis: Redis,
    prefix: string,
    options: { readonly minScore?: number; readonly maxAgeDays?: number } = {},
  ) {
    super(options);
    this.signalsKey = redisKey(prefix, 'signals');
    this.skippedKey = redisKey(prefix, 'signals', 'skipped');
  }

  async onModuleInit(): Promise<void> {
    const [signals, skipped] = await Promise.all([
      this.redis.hgetall(this.signalsKey),
      this.redis.hgetall(this.skippedKey),
    ]);
    const loaded: Signal[] = [];
    const corrected: string[] = [];
    for (const [field, raw] of Object.entries(signals)) {
      const s = JSON.parse(raw) as StoredSignal;
      const signal: Signal = {
        ...s,
        publishedAt: new Date(s.publishedAt),
        collectedAt: new Date(s.collectedAt),
      };
      // Posts saved under older type rules (e.g. a job ad typed as a product launch) are
      // corrected once, here, and written back.
      const signalType = reclassifySignal(signal);
      if (signalType !== signal.signalType) {
        loaded.push({ ...signal, signalType });
        corrected.push(field, JSON.stringify({ ...s, signalType }));
      } else {
        loaded.push(signal);
      }
    }
    this.restore(loaded, new Map(Object.entries(skipped).map(([id, iso]) => [id, new Date(iso)])));
    if (corrected.length > 0) await this.redis.hset(this.signalsKey, ...corrected);
  }

  override async saveMany(signals: readonly Signal[]): Promise<Signal[]> {
    const saved = await super.saveMany(signals);
    if (saved.length > 0) {
      const fields: string[] = [];
      for (const signal of saved) {
        const stored: StoredSignal = {
          ...signal,
          publishedAt: signal.publishedAt.toISOString(),
          collectedAt: signal.collectedAt.toISOString(),
        };
        fields.push(signalIdentityKey(signal), JSON.stringify(stored));
      }
      await this.redis.hset(this.signalsKey, ...fields);
    }
    return saved;
  }

  override async setSkipped(signalId: string, skippedAt: Date | null): Promise<boolean> {
    const found = await super.setSkipped(signalId, skippedAt);
    if (found) {
      if (skippedAt === null) await this.redis.hdel(this.skippedKey, signalId);
      else await this.redis.hset(this.skippedKey, signalId, skippedAt.toISOString());
    }
    return found;
  }
}
