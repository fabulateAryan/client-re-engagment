import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

/**
 * A Redis connection set up the way BullMQ needs it: commands wait for a reconnect instead
 * of failing after a few retries.
 */
export function createRedisConnection(url: string, name: string): Redis {
  const redis = new Redis(url, { maxRetriesPerRequest: null, connectionName: name });
  const logger = new Logger(`Redis:${name}`);
  let lastError = '';
  redis.on('error', (error: Error) => {
    // ioredis retries on its own; log each distinct problem once instead of every second.
    if (error.message !== lastError) logger.error(`Redis error: ${error.message}`);
    lastError = error.message;
  });
  redis.on('ready', () => {
    lastError = '';
  });
  return redis;
}

/** Keeps Redis keys of different apps or environments apart. */
export function redisKey(prefix: string, ...parts: string[]): string {
  return [prefix, ...parts].join(':');
}
