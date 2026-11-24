/**
 * Thin client for the Monid HTTP API (https://monid.ai/docs/api/overview).
 *
 * Everything here follows the published docs:
 * - Bearer auth on all /v1/* endpoints, JSON bodies.
 * - POST /v1/run returns either a completed run (sync providers, HTTP status mirrors the
 *   provider's status) or 202 with a runId (async providers) to poll via GET /v1/runs/:id.
 * - Run lifecycle `status` and `providerResponse.httpStatus` are separate signals.
 * - Errors are `{ code, message }`.
 *
 * Retry policy, timeouts and poll interval are configuration, not Monid-published limits.
 * Monid does not document its own rate limits; 429s are retried with exponential backoff,
 * honouring Retry-After when present.
 */
import type { JsonObject, JsonValue } from '../../../core/domain';

export interface MonidClientConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  /** Per HTTP request. */
  readonly requestTimeoutMs: number;
  /** Retries after the first attempt, for retryable failures. */
  readonly maxRetries: number;
  /** First backoff delay; doubles on each retry. */
  readonly retryBaseDelayMs: number;
  /** Longest delay between polls of an async run. */
  readonly pollIntervalMs: number;
  /**
   * First delay before polling an async run; each later delay is 1.5 times longer, up to
   * `pollIntervalMs`. Short runs are then picked up soon after they finish. Defaults to
   * `pollIntervalMs` (a fixed interval).
   */
  readonly firstPollMs?: number;
  /** Total time allowed for an async run before giving up. */
  readonly runTimeoutMs: number;
}

export type MonidFailure =
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'BAD_RESPONSE'
  | 'UNAVAILABLE'
  | 'NOT_AUTHORISED'
  | 'INSUFFICIENT_CREDIT';

/** Adapter-internal error. Messages never include request inputs or response payloads. */
export class MonidError extends Error {
  constructor(
    readonly failure: MonidFailure,
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'MonidError';
  }
}

export type MonidRunStatus =
  'READY' | 'RUNNING' | 'STOPPING' | 'COMPLETED' | 'FAILED' | 'BLOCKED' | 'STOPPED' | 'TIMED_OUT';

const TERMINAL: ReadonlySet<MonidRunStatus> = new Set([
  'COMPLETED',
  'FAILED',
  'BLOCKED',
  'STOPPED',
  'TIMED_OUT',
]);

export interface MonidRun {
  readonly runId: string;
  readonly status: MonidRunStatus;
  readonly output: JsonValue | null;
  readonly providerHttpStatus: number | null;
  readonly reason: string | null;
  /** Provider error message for non-2xx provider responses (e.g. why there was no match). */
  readonly providerError: string | null;
  readonly billedUnits: number | null;
}

export interface MonidDiscoverResult {
  readonly provider: string;
  readonly providerName?: string;
  readonly endpoint: string;
  readonly description: string;
  readonly score: number;
  readonly tags: readonly string[];
  readonly price: JsonValue;
}

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;
export type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class MonidHttpClient {
  constructor(
    private readonly config: MonidClientConfig,
    private readonly fetchFn: FetchFn = (input, init) => fetch(input, init),
    private readonly sleep: SleepFn = defaultSleep,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** POST /v1/discover. Natural-language search for endpoints. */
  async discover(query: string, limit = 10): Promise<MonidDiscoverResult[]> {
    const body = await this.requestWithRetry('POST', '/v1/discover', { query, limit });
    const results = asObject(body)?.results;
    if (!Array.isArray(results)) throw badResponse('discover response had no results array');
    return results.filter(isObject).map((r) => ({
      provider: String(r.provider),
      providerName: typeof r.providerName === 'string' ? r.providerName : undefined,
      endpoint: String(r.endpoint),
      description: String(r.description ?? ''),
      score: typeof r.score === 'number' ? r.score : 0,
      tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
      price: r.price ?? null,
    }));
  }

  /** POST /v1/inspect. Input schema, price and notes for one endpoint. */
  async inspect(provider: string, endpoint: string): Promise<JsonObject> {
    const body = await this.requestWithRetry('POST', '/v1/inspect', { provider, endpoint });
    const object = asObject(body);
    if (object === null) throw badResponse('inspect response was not an object');
    return object;
  }

  /**
   * POST /v1/run, then poll until terminal. Returns the completed run, with `output`
   * set to null when the provider reported "no match" (HTTP 404).
   * Throws MonidError for everything else that is not a successful completion.
   */
  async runAndWait(provider: string, endpoint: string, input: JsonObject): Promise<MonidRun> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.runOnce(provider, endpoint, input);
      } catch (error) {
        if (
          !(error instanceof MonidError) ||
          !error.retryable ||
          attempt >= this.config.maxRetries
        ) {
          throw error;
        }
        await this.sleep(error.retryAfterMs ?? this.backoff(attempt));
        attempt += 1;
      }
    }
  }

  private async runOnce(provider: string, endpoint: string, input: JsonObject): Promise<MonidRun> {
    // Not retried at the HTTP level: a retried POST could start (and bill) a second run.
    const started = parseRun(
      await this.request('POST', '/v1/run', { provider, endpoint, input }, { acceptRunBody: true }),
    );
    const finished = TERMINAL.has(started.status) ? started : await this.poll(started.runId);
    return assertSuccessful(finished);
  }

  private async poll(runId: string): Promise<MonidRun> {
    const deadline = this.now() + this.config.runTimeoutMs;
    const longest = this.config.pollIntervalMs;
    let delay = Math.min(this.config.firstPollMs ?? longest, longest);
    for (;;) {
      await this.sleep(delay);
      delay = Math.min(Math.round(delay * 1.5), longest);
      const run = parseRun(
        await this.requestWithRetry('GET', `/v1/runs/${encodeURIComponent(runId)}`),
      );
      if (TERMINAL.has(run.status)) return run;
      if (this.now() >= deadline) {
        await this.tryStop(runId);
        throw new MonidError(
          'TIMEOUT',
          `run did not finish within ${this.config.runTimeoutMs}ms`,
          true,
        );
      }
    }
  }

  /** Best effort, so an abandoned run stops consuming credit. */
  private async tryStop(runId: string): Promise<void> {
    try {
      await this.request('POST', `/v1/runs/${encodeURIComponent(runId)}/stop`, {});
    } catch {
      // Ignore: the timeout is the error worth reporting.
    }
  }

  private async requestWithRetry(
    method: string,
    path: string,
    body?: JsonObject,
  ): Promise<JsonValue> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.request(method, path, body);
      } catch (error) {
        if (
          !(error instanceof MonidError) ||
          !error.retryable ||
          attempt >= this.config.maxRetries
        ) {
          throw error;
        }
        await this.sleep(error.retryAfterMs ?? this.backoff(attempt));
        attempt += 1;
      }
    }
  }

  private backoff(attempt: number): number {
    return this.config.retryBaseDelayMs * 2 ** attempt;
  }

  private async request(
    method: string,
    path: string,
    body?: JsonObject,
    options: { acceptRunBody?: boolean } = {},
  ): Promise<JsonValue> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.config.baseUrl.replace(/\/+$/, '')}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        throw new MonidError('TIMEOUT', `${method} ${path} timed out`, true);
      }
      throw new MonidError('UNAVAILABLE', `${method} ${path} network error`, true);
    }

    const parsed = await readJson(response);
    // Sync runs mirror the provider's HTTP status but still carry a run body; let the
    // run logic interpret those instead of treating the status as a Monid error.
    if (options.acceptRunBody === true && isRunBody(parsed)) return parsed;
    if (response.ok) {
      if (parsed === undefined) throw badResponse(`${method} ${path} returned invalid JSON`);
      return parsed;
    }
    throw errorForStatus(response, method, path);
  }
}

function errorForStatus(response: Response, method: string, path: string): MonidError {
  const where = `${method} ${path} -> HTTP ${response.status}`;
  const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
  switch (response.status) {
    case 401:
    case 403:
      return new MonidError('NOT_AUTHORISED', where, false);
    case 402:
      return new MonidError('INSUFFICIENT_CREDIT', where, false);
    case 408:
      return new MonidError('TIMEOUT', where, true, retryAfterMs);
    case 429:
      return new MonidError('RATE_LIMITED', where, true, retryAfterMs);
    case 500:
    case 503:
      return new MonidError('UNAVAILABLE', where, true, retryAfterMs);
    default:
      // 400, 404, 409, 502 (provider rejected) and anything unexpected: retrying won't help.
      return new MonidError('BAD_RESPONSE', where, false);
  }
}

function assertSuccessful(run: MonidRun): MonidRun {
  switch (run.status) {
    case 'COMPLETED':
      return assertProviderSuccess(run);
    case 'TIMED_OUT':
      return fail(new MonidError('TIMEOUT', `run ${run.runId} timed out`, true));
    case 'FAILED':
      return fail(new MonidError('UNAVAILABLE', `run ${run.runId} failed in Monid`, true));
    case 'BLOCKED':
      return fail(
        new MonidError(
          'UNAVAILABLE',
          `run ${run.runId} blocked: ${run.reason ?? 'no reason'}`,
          false,
        ),
      );
    default:
      return fail(new MonidError('UNAVAILABLE', `run ${run.runId} ended as ${run.status}`, false));
  }
}

function assertProviderSuccess(run: MonidRun): MonidRun {
  const status = run.providerHttpStatus ?? 200;
  if (status >= 200 && status < 300) return run;
  // Documented: 404 from the provider means "no match", which is a normal empty result.
  if (status === 404) return { ...run, output: null };
  if (status === 429) {
    return fail(new MonidError('RATE_LIMITED', `provider rate limited run ${run.runId}`, true));
  }
  if (status >= 500) {
    return fail(
      new MonidError('UNAVAILABLE', `provider error ${status} on run ${run.runId}`, true),
    );
  }
  return fail(
    new MonidError('BAD_RESPONSE', `provider rejected run ${run.runId} (${status})`, false),
  );
}

function fail(error: MonidError): never {
  throw error;
}

function parseRun(body: JsonValue): MonidRun {
  const object = asObject(body);
  if (object === null || typeof object.runId !== 'string' || typeof object.status !== 'string') {
    throw badResponse('run response missing runId or status');
  }
  const providerResponse = asObject(object.providerResponse ?? null);
  return {
    runId: object.runId,
    status: object.status as MonidRunStatus,
    output: object.output ?? null,
    providerHttpStatus:
      typeof providerResponse?.httpStatus === 'number' ? providerResponse.httpStatus : null,
    reason: typeof object.reason === 'string' ? object.reason : null,
    providerError: providerErrorMessage(providerResponse?.error),
    billedUnits: typeof object.billedUnits === 'number' ? object.billedUnits : null,
  };
}

/** The provider's error message, if any. Kept short; never includes our inputs. */
function providerErrorMessage(error: JsonValue | undefined): string | null {
  if (error === undefined || error === null) return null;
  const object = asObject(error);
  const message = object?.message;
  const text = typeof message === 'string' ? message : JSON.stringify(error);
  return text.slice(0, 300);
}

function isRunBody(value: JsonValue | undefined): value is JsonObject {
  const object = value === undefined ? null : asObject(value);
  return object !== null && typeof object.runId === 'string' && typeof object.status === 'string';
}

async function readJson(response: Response): Promise<JsonValue | undefined> {
  try {
    return (await response.json()) as JsonValue;
  } catch {
    return undefined;
  }
}

function parseRetryAfter(header: string | null): number | undefined {
  if (header === null) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function badResponse(message: string): MonidError {
  return new MonidError('BAD_RESPONSE', message, false);
}

export function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObject(value: JsonValue): JsonObject | null {
  return isObject(value) ? value : null;
}
