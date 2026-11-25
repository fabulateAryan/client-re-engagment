/**
 * Minimal Gmail REST client (no googleapis SDK): refreshes an OAuth access token from a stored
 * refresh token and calls the few Gmail endpoints the app needs.
 *
 * Scopes used (granted once with `pnpm gmail:auth`): gmail.send and gmail.readonly.
 * Docs: https://developers.google.com/workspace/gmail/api/reference/rest
 */

export interface GmailCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
}

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
] as const;

export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const TIMEOUT_MS = 15_000;
/** Refresh this long before Google's expiry, so a token never expires mid-request. */
const EXPIRY_MARGIN_MS = 60_000;

/** A Gmail call failed. `status` is the HTTP status, or 0 when Google could not be reached. */
export class GmailApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** OAuth error code, e.g. "invalid_grant" when the refresh token was revoked or expired. */
    readonly oauthError: string | null = null,
  ) {
    super(message);
    this.name = 'GmailApiError';
  }
}

export interface GmailHeader {
  readonly name: string;
  readonly value: string;
}

export interface GmailMessagePart {
  readonly mimeType?: string;
  readonly filename?: string;
  readonly headers?: readonly GmailHeader[];
  readonly body?: { readonly data?: string; readonly size?: number };
  readonly parts?: readonly GmailMessagePart[];
}

export interface GmailMessage {
  readonly id: string;
  readonly threadId?: string;
  readonly labelIds?: readonly string[];
  readonly payload?: GmailMessagePart;
}

export class GmailApiClient {
  private accessToken: string | null = null;
  private expiresAt = 0;
  private refreshing: Promise<string> | null = null;

  constructor(
    private readonly credentials: GmailCredentials,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  /** Sends a complete RFC 2822 message. Returns Gmail's message id. */
  async send(rawMessage: string): Promise<{ id: string; threadId?: string }> {
    return this.call('POST', '/messages/send', { raw: base64Url(rawMessage) });
  }

  /** Message ids matching a Gmail search query (newest first). */
  async listMessageIds(query: string, maxResults: number): Promise<string[]> {
    const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
    const result = await this.call<{ messages?: { id: string }[] }>(
      'GET',
      `/messages?${params.toString()}`,
    );
    return (result.messages ?? []).map((m) => m.id);
  }

  async getMessage(id: string): Promise<GmailMessage> {
    return this.call('GET', `/messages/${encodeURIComponent(id)}?format=full`);
  }

  /** The mailbox's own address. */
  async profileEmail(): Promise<string> {
    const profile = await this.call<{ emailAddress: string }>('GET', '/profile');
    return profile.emailAddress;
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const token = await this.token();
    let response: Response;
    try {
      response = await this.fetchFn(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new GmailApiError(0, `Gmail request failed: ${errorMessage(error)}`);
    }
    if (response.status === 401) {
      // Token revoked or expired early: forget it so the next call refreshes.
      this.accessToken = null;
    }
    if (!response.ok) {
      throw new GmailApiError(
        response.status,
        `Gmail ${response.status}: ${await googleError(response)}`,
      );
    }
    return (await response.json()) as T;
  }

  private async token(): Promise<string> {
    if (this.accessToken !== null && this.now() < this.expiresAt - EXPIRY_MARGIN_MS) {
      return this.accessToken;
    }
    // One refresh at a time, shared by concurrent callers.
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async refresh(): Promise<string> {
    const form = new URLSearchParams({
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      refresh_token: this.credentials.refreshToken,
      grant_type: 'refresh_token',
    });
    let response: Response;
    try {
      response = await this.fetchFn(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new GmailApiError(0, `Google sign-in request failed: ${errorMessage(error)}`);
    }
    const parsed = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!response.ok || typeof parsed.access_token !== 'string') {
      throw new GmailApiError(
        response.status,
        `Google refused the refresh token: ${parsed.error ?? response.status} ${parsed.error_description ?? ''}`.trim(),
        parsed.error ?? null,
      );
    }
    this.accessToken = parsed.access_token;
    this.expiresAt = this.now() + (parsed.expires_in ?? 3600) * 1000;
    return parsed.access_token;
  }
}

/** Google's error message (never contains tokens). */
async function googleError(response: Response): Promise<string> {
  try {
    const parsed = (await response.json()) as { error?: { message?: string; status?: string } };
    return `${parsed.error?.status ?? ''} ${parsed.error?.message ?? ''}`.trim().slice(0, 300);
  } catch {
    return '';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown';
}

export function base64Url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url');
}
