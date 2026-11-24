import type { Redis } from 'ioredis';
import { MonitoringRunStatus } from '../../../core/domain';
import type {
  ActiveCheck,
  MonitoringCheck,
  MonitoringRun,
  MonitoringTrigger,
  NewMonitoringRun,
  Platform,
} from '../../../core/domain';
import { MonitoringRunRepositoryPort } from '../../../core/ports';
import { redisKey } from './redis-connection';

/** Runs are kept this long, and only this many are listed. */
const KEEP_SECONDS = 30 * 24 * 60 * 60;
const KEEP_RUNS = 500;

/**
 * Close a run only while it is still running, so two workers finishing at once (or a late
 * "interrupted") cannot overwrite each other.
 */
const FINISH = `
if redis.call('HGET', KEYS[1], 'status') ~= 'RUNNING' then return 0 end
redis.call('HSET', KEYS[1], 'status', ARGV[1], 'finishedAt', ARGV[2])
redis.call('DEL', KEYS[2])
return 1`;

interface StoredMeta {
  id: string;
  trigger: MonitoringTrigger;
  startedAt: string;
  clientIds: string[] | null;
  clientsChecked: number;
  clientsSkipped: number;
  /** Missing on runs stored before this was recorded. */
  accountsUpToDate?: number;
  totalChecks: number;
}

type StoredCheck = Omit<MonitoringCheck, 'startedAt' | 'finishedAt'> & {
  startedAt: string;
  finishedAt: string;
};
type StoredActive = Omit<ActiveCheck, 'startedAt'> & { startedAt: string };

const accountField = (c: { clientId: string; platform: Platform }): string =>
  `${c.clientId}|${c.platform}`;

/**
 * Runs in Redis, so they survive restarts and every API instance and worker sees the same
 * state. Per run: a hash with its details and status, a hash of finished checks (one field per
 * account, so a retried job replaces its result) and a hash of checks in progress. A sorted
 * set lists runs by start time.
 */
export class RedisMonitoringRunRepository extends MonitoringRunRepositoryPort {
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
  ) {
    super();
  }

  async create(run: NewMonitoringRun): Promise<MonitoringRun> {
    const meta: StoredMeta = {
      id: run.id,
      trigger: run.trigger,
      startedAt: run.startedAt.toISOString(),
      clientIds: run.clientIds === null ? null : [...run.clientIds],
      clientsChecked: run.clientsChecked,
      clientsSkipped: run.clientsSkipped,
      accountsUpToDate: run.accountsUpToDate,
      totalChecks: run.totalChecks,
    };
    const key = this.runKey(run.id);
    await this.redis
      .multi()
      .hset(key, 'meta', JSON.stringify(meta), 'status', MonitoringRunStatus.RUNNING)
      .expire(key, KEEP_SECONDS)
      .zadd(this.indexKey(), run.startedAt.getTime(), run.id)
      .zremrangebyrank(this.indexKey(), 0, -(KEEP_RUNS + 1))
      .exec();
    return {
      ...run,
      status: MonitoringRunStatus.RUNNING,
      finishedAt: null,
      checks: [],
      active: [],
    };
  }

  async get(id: string): Promise<MonitoringRun | null> {
    const results = await this.redis
      .multi()
      .hgetall(this.runKey(id))
      .hgetall(this.checksKey(id))
      .hgetall(this.activeKey(id))
      .exec();
    if (results === null) return null;
    const [run, checks, active] = results.map(([error, value]) => {
      if (error !== null) throw error;
      return value as Record<string, string>;
    });
    return run === undefined || run.meta === undefined
      ? null
      : toRun(run, checks ?? {}, active ?? {});
  }

  async listRecent(limit: number): Promise<MonitoringRun[]> {
    const ids = await this.redis.zrevrange(this.indexKey(), 0, limit - 1);
    const runs = await Promise.all(ids.map((id) => this.get(id)));
    return runs.filter((run): run is MonitoringRun => run !== null);
  }

  async markCheckStarted(runId: string, check: ActiveCheck): Promise<void> {
    const stored: StoredActive = { ...check, startedAt: check.startedAt.toISOString() };
    const key = this.activeKey(runId);
    await this.redis
      .multi()
      .hset(key, accountField(check), JSON.stringify(stored))
      .expire(key, KEEP_SECONDS)
      .exec();
  }

  async recordCheck(runId: string, check: MonitoringCheck): Promise<number> {
    const stored: StoredCheck = {
      ...check,
      startedAt: check.startedAt.toISOString(),
      finishedAt: check.finishedAt.toISOString(),
    };
    const key = this.checksKey(runId);
    const results = await this.redis
      .multi()
      .hset(key, accountField(check), JSON.stringify(stored))
      .hdel(this.activeKey(runId), accountField(check))
      .expire(key, KEEP_SECONDS)
      .hlen(key)
      .exec();
    const count = results?.[3]?.[1];
    return typeof count === 'number' ? count : 0;
  }

  async finish(runId: string, finishedAt: Date, status: MonitoringRunStatus): Promise<void> {
    await this.redis.eval(
      FINISH,
      2,
      this.runKey(runId),
      this.activeKey(runId),
      status,
      finishedAt.toISOString(),
    );
  }

  private indexKey(): string {
    return redisKey(this.prefix, 'monitoring', 'runs');
  }

  private runKey(id: string): string {
    return redisKey(this.prefix, 'monitoring', 'run', id);
  }

  private checksKey(id: string): string {
    return redisKey(this.prefix, 'monitoring', 'run', id, 'checks');
  }

  private activeKey(id: string): string {
    return redisKey(this.prefix, 'monitoring', 'run', id, 'active');
  }
}

function toRun(
  run: Record<string, string>,
  checks: Record<string, string>,
  active: Record<string, string>,
): MonitoringRun {
  const meta = JSON.parse(run.meta ?? '{}') as StoredMeta;
  return {
    id: meta.id,
    trigger: meta.trigger,
    status: (run.status as MonitoringRunStatus | undefined) ?? MonitoringRunStatus.RUNNING,
    startedAt: new Date(meta.startedAt),
    finishedAt: run.finishedAt === undefined ? null : new Date(run.finishedAt),
    clientIds: meta.clientIds,
    clientsChecked: meta.clientsChecked,
    clientsSkipped: meta.clientsSkipped,
    accountsUpToDate: meta.accountsUpToDate ?? 0,
    totalChecks: meta.totalChecks,
    checks: Object.values(checks)
      .map((raw) => {
        const c = JSON.parse(raw) as StoredCheck;
        return { ...c, startedAt: new Date(c.startedAt), finishedAt: new Date(c.finishedAt) };
      })
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime()),
    active: Object.values(active).map((raw) => {
      const a = JSON.parse(raw) as StoredActive;
      return { ...a, startedAt: new Date(a.startedAt) };
    }),
  };
}
