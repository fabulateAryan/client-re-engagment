import { MonitoringLockPort } from '../../../core/ports';

/** A lock for one API process. Used without Redis and in tests. */
export class InMemoryMonitoringLock extends MonitoringLockPort {
  private owner: string | null = null;
  private expiresAt = 0;

  constructor(private readonly now: () => number = Date.now) {
    super();
  }

  acquire(runId: string, ttlMs: number): Promise<boolean> {
    if (this.current() !== null) return Promise.resolve(false);
    this.owner = runId;
    this.expiresAt = this.now() + ttlMs;
    return Promise.resolve(true);
  }

  holder(): Promise<string | null> {
    return Promise.resolve(this.current());
  }

  refresh(runId: string, ttlMs: number): Promise<void> {
    if (this.current() === runId) this.expiresAt = this.now() + ttlMs;
    return Promise.resolve();
  }

  release(runId: string): Promise<void> {
    if (this.owner === runId) this.owner = null;
    return Promise.resolve();
  }

  private current(): string | null {
    if (this.owner !== null && this.now() >= this.expiresAt) this.owner = null;
    return this.owner;
  }
}
