import type { Redis } from 'ioredis';
import { MonitoringLockPort } from '../../../core/ports';
import { redisKey } from './redis-connection';

// Only touch the lock when it still belongs to this run.
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;
const REFRESH = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) end return 0`;

/** The run lock in Redis, shared by every API instance. Expires on its own after a crash. */
export class RedisMonitoringLock extends MonitoringLockPort {
  private readonly key: string;

  constructor(
    private readonly redis: Redis,
    prefix: string,
  ) {
    super();
    this.key = redisKey(prefix, 'monitoring', 'lock');
  }

  async acquire(runId: string, ttlMs: number): Promise<boolean> {
    return (await this.redis.set(this.key, runId, 'PX', ttlMs, 'NX')) === 'OK';
  }

  holder(): Promise<string | null> {
    return this.redis.get(this.key);
  }

  async refresh(runId: string, ttlMs: number): Promise<void> {
    await this.redis.eval(REFRESH, 1, this.key, runId, String(ttlMs));
  }

  async release(runId: string): Promise<void> {
    await this.redis.eval(RELEASE, 1, this.key, runId);
  }
}
