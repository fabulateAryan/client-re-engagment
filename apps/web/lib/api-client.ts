import type {
  AddBrandRequest,
  ClientResponse,
  DraftChangesRequest,
  DraftResponse,
  EmailStatusResponse,
  HealthResponse,
  JobQueueStatsResponse,
  MonitoringProgressResponse,
  MonitoringRunListResponse,
  MonitoringRunResponse,
  OutreachListResponse,
  PlatformValue,
  SignalListViewValue,
  SignalPageResponse,
  SignalSummaryResponse,
  SignalTypeValue,
  SkipSignalResponse,
  SourceStatusResponse,
  UpdateBrandRequest,
} from '@signal-monitoring/shared';
import { getToken as getBrowserToken } from '@clerk/nextjs';

const REQUEST_TIMEOUT_MS = 8000;
/** Claude drafting can take a little while. */
const DRAFT_TIMEOUT_MS = 60 * 1000;

function jsonBody(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The signed-in user's Clerk session token, or null when signed out. */
export type TokenGetter = () => Promise<string | null>;

/** Adds the session token, so the API knows who is asking (it rejects requests without one). */
async function withAuth(getToken: TokenGetter, init?: RequestInit): Promise<Headers> {
  const headers = new Headers(init?.headers);
  const token = await getToken().catch(() => null);
  if (token !== null) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

/**
 * Fetch JSON from our own API. Responses are typed by the shared contract in
 * packages/shared rather than validated field by field.
 */
async function requestJson<T>(
  getToken: TokenGetter,
  path: string,
  init?: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      ...init,
      headers: await withAuth(getToken, init),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError(
        `The API did not answer within ${Math.round(timeoutMs / 1000)}s. It may still be working; refresh shortly.`,
        null,
      );
    }
    throw new ApiError(`Could not reach the API at ${apiBaseUrl()}`, null);
  }
  if (!response.ok) {
    const detail = await readErrorMessage(response);
    throw new ApiError(detail ?? `API responded with HTTP ${response.status}`, response.status);
  }
  return (await response.json()) as T;
}

async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = (body as { message: unknown }).message;
      return typeof message === 'string' ? message : null;
    }
  } catch {
    // Not JSON.
  }
  return null;
}

/** For endpoints that answer 204 No Content. */
async function requestNoContent(
  getToken: TokenGetter,
  path: string,
  method: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      method,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: await withAuth(getToken),
    });
  } catch {
    throw new ApiError(`Could not reach the API at ${apiBaseUrl()}`, null);
  }
  if (!response.ok) {
    const detail = await readErrorMessage(response);
    throw new ApiError(detail ?? `API responded with HTTP ${response.status}`, response.status);
  }
}

export interface SignalFilters {
  clientId?: string;
  platform?: PlatformValue;
  signalType?: SignalTypeValue;
  view?: SignalListViewValue;
  /** ISO time: only signals collected since then (what one run found). */
  collectedSince?: string;
  page?: number;
  pageSize?: number;
}

/**
 * The API, calling with the session token from `getToken`. Browser code uses `api` below;
 * server pages use `api` from ./api-server, which reads the token on the server.
 */
export function createApi(getToken: TokenGetter) {
  const getJson = <T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> =>
    requestJson<T>(getToken, path, init, timeoutMs);
  const sendNoContent = (path: string, method: string): Promise<void> =>
    requestNoContent(getToken, path, method);
  return {
    health: () => getJson<HealthResponse>('/health'),
    clients: () => getJson<ClientResponse[]>('/clients'),
    sources: () => getJson<SourceStatusResponse[]>('/monitoring/sources'),
    /** Where the current run is up to, plus the last finished run. */
    progress: () => getJson<MonitoringProgressResponse>('/monitoring/progress'),
    runs: (limit = 20) => getJson<MonitoringRunListResponse>(`/monitoring/runs?limit=${limit}`),
    /** Every email thread sent from the app, most recent activity first. */
    outreach: () => getJson<OutreachListResponse>('/outreach'),
    /** Reads the reply inbox now (not on the next timed check), then lists every thread. */
    checkReplies: () =>
      getJson<OutreachListResponse>(
        '/outreach/check-replies',
        { method: 'POST' },
        DRAFT_TIMEOUT_MS,
      ),
    signalSummary: () => getJson<SignalSummaryResponse>('/signals/summary'),
    signals: (filters: SignalFilters = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== '') params.set(key, String(value));
      }
      const query = params.toString();
      return getJson<SignalPageResponse>(`/signals${query === '' ? '' : `?${query}`}`);
    },
    skipSignal: (id: string) =>
      getJson<SkipSignalResponse>(`/signals/${encodeURIComponent(id)}/skip`, { method: 'POST' }),
    undoSkipSignal: (id: string) =>
      getJson<SkipSignalResponse>(`/signals/${encodeURIComponent(id)}/skip`, { method: 'DELETE' }),
    /**
     * Queue a run for every brand, or just `clientId` ("Check now"). Answers at once; the
     * checks run as background jobs (follow them with `progress`).
     */
    triggerRun: (clientId?: string) =>
      getJson<MonitoringRunResponse>(
        clientId === undefined
          ? '/monitoring/run'
          : `/monitoring/run?clientId=${encodeURIComponent(clientId)}`,
        { method: 'POST' },
      ),
    run: (id: string) =>
      getJson<MonitoringRunResponse>(`/monitoring/runs/${encodeURIComponent(id)}`),
    /** The job queue: driver, workers, and jobs waiting, running, retrying or failed. */
    queue: () => getJson<JobQueueStatsResponse>('/monitoring/queue'),
    addBrand: (brand: AddBrandRequest) =>
      getJson<ClientResponse>('/clients', jsonBody('POST', brand)),
    /** Add, change or remove a brand's website, Instagram, TikTok or YouTube. */
    updateBrand: (clientId: string, changes: UpdateBrandRequest) =>
      getJson<ClientResponse>(
        `/clients/${encodeURIComponent(clientId)}`,
        jsonBody('PATCH', changes),
      ),
    removeBrand: (clientId: string) =>
      sendNoContent(`/clients/${encodeURIComponent(clientId)}`, 'DELETE'),
    /** Returns the existing draft, or makes one. `regenerate` replaces it. */
    draftMessage: (signalId: string, regenerate = false) =>
      getJson<DraftResponse>(
        `/signals/${encodeURIComponent(signalId)}/draft`,
        jsonBody('POST', regenerate ? { regenerate: true } : {}),
        DRAFT_TIMEOUT_MS,
      ),
    saveDraft: (signalId: string, changes: DraftChangesRequest) =>
      getJson<DraftResponse>(
        `/signals/${encodeURIComponent(signalId)}/draft`,
        jsonBody('PUT', changes),
      ),
    /** Record that the rep sent it from their own mailbox (`sent: false` undoes it). */
    markDraftSent: (signalId: string, sent: boolean) =>
      getJson<DraftResponse>(`/signals/${encodeURIComponent(signalId)}/draft/sent`, {
        method: sent ? 'POST' : 'DELETE',
      }),
    /** Whether the app can email drafts (SendGrid set up). */
    emailStatus: () => getJson<EmailStatusResponse>('/signals/email-status'),
    /** Email the saved draft to its recipient through SendGrid. */
    sendDraft: (signalId: string) =>
      getJson<DraftResponse>(
        `/signals/${encodeURIComponent(signalId)}/draft/send`,
        { method: 'POST' },
        DRAFT_TIMEOUT_MS,
      ),
    /** The saved draft and its thread (to pick up new replies). */
    getDraft: (signalId: string) =>
      getJson<DraftResponse>(`/signals/${encodeURIComponent(signalId)}/draft`),
    /** Email a follow-up in the same thread as the outreach email. */
    sendFollowUp: (signalId: string, text: string) =>
      getJson<DraftResponse>(
        `/signals/${encodeURIComponent(signalId)}/draft/follow-up`,
        jsonBody('POST', { text }),
        DRAFT_TIMEOUT_MS,
      ),
  };
}

export type Api = ReturnType<typeof createApi>;

/** For client components: the token comes from Clerk in the browser. */
export const api: Api = createApi(() => getBrowserToken());

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string };

/** Load data without throwing, so pages render success and failure outside try/catch. */
export async function attempt<T>(load: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
