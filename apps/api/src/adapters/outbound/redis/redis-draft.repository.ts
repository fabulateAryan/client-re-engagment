import type { OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { EngagementDraft, ThreadMessage } from '../../../core/domain';
import { InMemoryDraftRepository } from '../fakes/in-memory-draft.repository';
import { redisKey } from './redis-connection';

type StoredMessage = Omit<ThreadMessage, 'at'> & { at: string };
type StoredDraft = Omit<EngagementDraft, 'createdAt' | 'editedAt' | 'sentAt' | 'thread'> & {
  createdAt: string;
  editedAt: string | null;
  sentAt: string | null;
  thread?: StoredMessage[];
};

/**
 * Drafts and their email threads kept in Redis, so sent emails and replies survive restarts.
 * Like the Redis signal repository: everything is loaded at start-up, lookups run in memory,
 * and every save is also written to Redis.
 */
export class RedisDraftRepository extends InMemoryDraftRepository implements OnModuleInit {
  private readonly key: string;

  constructor(
    private readonly redis: Redis,
    prefix: string,
  ) {
    super();
    this.key = redisKey(prefix, 'drafts');
  }

  async onModuleInit(): Promise<void> {
    const stored = await this.redis.hgetall(this.key);
    this.restore(Object.values(stored).map((raw) => fromStored(JSON.parse(raw) as StoredDraft)));
  }

  override async save(draft: EngagementDraft): Promise<void> {
    await super.save(draft);
    await this.redis.hset(this.key, draft.signalId, JSON.stringify(toStored(draft)));
  }
}

function toStored(draft: EngagementDraft): StoredDraft {
  return {
    ...draft,
    createdAt: draft.createdAt.toISOString(),
    editedAt: draft.editedAt?.toISOString() ?? null,
    sentAt: draft.sentAt?.toISOString() ?? null,
    thread: (draft.thread ?? []).map((m) => ({ ...m, at: m.at.toISOString() })),
  };
}

function fromStored(s: StoredDraft): EngagementDraft {
  return {
    ...s,
    createdAt: new Date(s.createdAt),
    editedAt: s.editedAt === null ? null : new Date(s.editedAt),
    sentAt: s.sentAt === null ? null : new Date(s.sentAt),
    thread: (s.thread ?? []).map((m) => ({ ...m, at: new Date(m.at) })),
  };
}
