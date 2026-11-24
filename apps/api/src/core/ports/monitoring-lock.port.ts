/**
 * Makes sure only one monitoring run happens at a time, across every API instance. The lock
 * expires on its own, so a crashed run cannot block monitoring forever; each finished check
 * refreshes it.
 */
export abstract class MonitoringLockPort {
  /** Take the lock for `runId`. False when another run holds it. */
  abstract acquire(runId: string, ttlMs: number): Promise<boolean>;

  /** The run holding the lock, or null. */
  abstract holder(): Promise<string | null>;

  /** Extend the lock, only if `runId` still holds it. */
  abstract refresh(runId: string, ttlMs: number): Promise<void>;

  /** Let go of the lock, only if `runId` holds it. */
  abstract release(runId: string): Promise<void>;
}
