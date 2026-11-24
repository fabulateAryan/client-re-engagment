import { hasSource, isRetryableFailure, platformsWithHandles } from '../domain';
import type {
  Client,
  MonitoringCheck,
  MonitoringRunError,
  MonitoringRunSummary,
  Platform,
  Signal,
} from '../domain';
import type {
  ClientRepositoryPort,
  ClockPort,
  SignalRepositoryPort,
  SignalSourcePort,
} from '../ports';

export type { MonitoringRunError, MonitoringRunSummary } from '../domain';

export interface MonitorOptions {
  readonly clientIds?: readonly string[];
}

/** The result of checking one account, plus every error (a platform may have several sources). */
export interface AccountCheckResult {
  readonly check: MonitoringCheck;
  readonly errors: readonly MonitoringRunError[];
}

/**
 * Collects new signals for clients from every registered source.
 *
 * `checkAccount` checks one client on one platform; the job queue calls it once per job.
 * `execute` checks every client in turn in this process (used by tests and scripts).
 *
 * Per account:
 * 1. Each source for that platform is asked for signals since the platform's last-checked time.
 * 2. Whatever was fetched with a usable source URL is saved (duplicates are dropped by the
 *    repository). Items without one are counted as missing a source and not saved.
 * 3. The last-checked time is moved to when this check started, but only if every source
 *    for the platform succeeded and saving succeeded. Otherwise the next run re-fetches the
 *    same window, and de-duplication absorbs any overlap.
 *
 * A failure is reported in the result and never thrown, so one account cannot stop others.
 */
export class MonitorClientsUseCase {
  private readonly sourcesByPlatform: ReadonlyMap<Platform, readonly SignalSourcePort[]>;

  constructor(
    private readonly clients: ClientRepositoryPort,
    private readonly signals: SignalRepositoryPort,
    sources: readonly SignalSourcePort[],
    private readonly clock: ClockPort,
    /** Only collect posts from the last this-many days. Null or 0: no limit. */
    private readonly lookbackDays: number | null = null,
    /**
     * A full run skips accounts checked less than this many minutes ago: asking the platform
     * again so soon costs a paid call and time, and rarely finds anything. "Check now" on a
     * brand always checks. 0: never skip.
     */
    private readonly recheckAfterMinutes: number = 0,
  ) {
    this.sourcesByPlatform = groupByPlatform(sources);
  }

  /**
   * Fetch posts published after this. A first check has no checkpoint, so it starts at the
   * window (that much history); later checks start at their checkpoint.
   */
  private fetchSince(lastChecked: Date | null, now: Date): Date | null {
    if (this.lookbackDays === null || this.lookbackDays <= 0) return lastChecked;
    const windowStart = new Date(now.getTime() - this.lookbackDays * 24 * 60 * 60 * 1000);
    return lastChecked === null || lastChecked < windowStart ? windowStart : lastChecked;
  }

  /**
   * Clients to check: `platforms` are the accounts to check now, `upToDate` the accounts
   * left out because they were checked recently (full runs only).
   */
  async plan(
    options: MonitorOptions = {},
  ): Promise<{ client: Client; platforms: Platform[]; upToDate: Platform[] }[]> {
    const wanted = options.clientIds === undefined ? null : new Set(options.clientIds);
    const freshFrom =
      wanted === null && this.recheckAfterMinutes > 0
        ? this.clock.now().getTime() - this.recheckAfterMinutes * 60_000
        : null;
    const active = await this.clients.listActiveClients();
    return active
      .filter((client) => wanted === null || wanted.has(client.id))
      .map((client) => {
        const platforms: Platform[] = [];
        const upToDate: Platform[] = [];
        for (const platform of platformsWithHandles(client.socialHandles)) {
          const last = client.lastCheckedAt[platform];
          if (freshFrom !== null && last !== undefined && last.getTime() > freshFrom) {
            upToDate.push(platform);
          } else {
            platforms.push(platform);
          }
        }
        return { client, platforms, upToDate };
      });
  }

  /**
   * @param options.clientIds Check only these clients (e.g. "Check now" on one brand).
   *   Omitted means every active client.
   */
  async execute(options: MonitorOptions = {}): Promise<MonitoringRunSummary> {
    const startedAt = this.clock.now();
    const plan = await this.plan(options);

    let clientsChecked = 0;
    let clientsSkipped = 0;
    let signalsFound = 0;
    let newSignalsSaved = 0;
    let signalsMissingSource = 0;
    const errors: MonitoringRunError[] = [];
    const checks: MonitoringCheck[] = [];

    for (const { client, platforms, upToDate } of plan) {
      if (platforms.length === 0) {
        if (upToDate.length === 0) clientsSkipped += 1;
        continue;
      }
      clientsChecked += 1;
      for (const platform of platforms) {
        const result = await this.checkAccount(client, platform);
        signalsFound += result.check.signalsFound;
        newSignalsSaved += result.check.newSignalsSaved;
        signalsMissingSource += result.check.signalsMissingSource;
        errors.push(...result.errors);
        checks.push(result.check);
      }
    }

    return {
      startedAt,
      finishedAt: this.clock.now(),
      clientsChecked,
      clientsSkipped,
      signalsFound,
      newSignalsSaved,
      signalsMissingSource,
      errors,
      checks,
      clientIds: options.clientIds === undefined ? null : [...options.clientIds],
    };
  }

  /** Check one account. Never throws: failures are in the result. */
  async checkAccount(client: Client, platform: Platform, attempt = 1): Promise<AccountCheckResult> {
    const checkStartedAt = this.clock.now();
    const base = {
      clientId: client.id,
      clientName: client.name,
      platform,
      handle: client.socialHandles[platform] ?? '',
      startedAt: checkStartedAt,
      attempts: attempt,
    };

    const sources = this.sourcesByPlatform.get(platform) ?? [];
    if (sources.length === 0) {
      // No adapter registered for this platform: the account is saved but not checked.
      return {
        check: {
          ...base,
          finishedAt: this.clock.now(),
          signalsFound: 0,
          newSignalsSaved: 0,
          signalsMissingSource: 0,
          sourceConnected: false,
          error: null,
        },
        errors: [],
      };
    }

    const since = this.fetchSince(client.lastCheckedAt[platform] ?? null, checkStartedAt);
    const { fetched, errors } = await this.fetchFromSources(client, platform, sources, since);

    // Story 4: an item without a source cannot be checked, so it is counted, not saved.
    const withSource = fetched.filter(hasSource);
    const signalsMissingSource = fetched.length - withSource.length;

    let newSignalsSaved = 0;
    try {
      const saved = withSource.length > 0 ? await this.signals.saveMany(withSource) : [];
      newSignalsSaved = saved.length;
      if (errors.length === 0) {
        // Captured before fetching, so anything published while we fetched is caught next time.
        await this.clients.updateLastChecked(client.id, platform, checkStartedAt);
      }
    } catch (error) {
      errors.push(toRunError(client, platform, error));
    }

    return {
      check: {
        ...base,
        finishedAt: this.clock.now(),
        signalsFound: fetched.length,
        newSignalsSaved,
        signalsMissingSource,
        sourceConnected: true,
        error: errors[0]?.message ?? null,
      },
      errors,
    };
  }

  private async fetchFromSources(
    client: Client,
    platform: Platform,
    sources: readonly SignalSourcePort[],
    since: Date | null,
  ): Promise<{ fetched: Signal[]; errors: MonitoringRunError[] }> {
    const fetched: Signal[] = [];
    const errors: MonitoringRunError[] = [];

    for (const source of sources) {
      try {
        fetched.push(...(await source.fetchSignals(client, since)));
      } catch (error) {
        errors.push(toRunError(client, platform, error));
      }
    }

    return { fetched, errors };
  }
}

function groupByPlatform(
  sources: readonly SignalSourcePort[],
): ReadonlyMap<Platform, readonly SignalSourcePort[]> {
  const byPlatform = new Map<Platform, SignalSourcePort[]>();
  for (const source of sources) {
    const existing = byPlatform.get(source.platform) ?? [];
    byPlatform.set(source.platform, [...existing, source]);
  }
  return byPlatform;
}

function toRunError(client: Client, platform: Platform, error: unknown): MonitoringRunError {
  const message = error instanceof Error ? error.message : String(error);
  return { clientId: client.id, platform, message, retryable: isRetryableFailure(error) };
}
